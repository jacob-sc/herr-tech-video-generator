import { useState, useRef } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

/* ── Design-Tokens ─────────────────────────────────────────── */
const T = {
  bg:        '#000000',
  surface:   '#0d0d0d',
  card:      '#111111',
  border:    '#1e1e1e',
  accent:    '#B598E2',
  accentBg:  'rgba(181,152,226,0.08)',
  accentBrd: 'rgba(181,152,226,0.25)',
  btn:       '#B598E2',
  text:      '#ffffff',
  muted:     '#666666',
  subtle:    '#222222',
  green:     '#22c55e',
  red:       '#ef4444',
};

const STEPS = [
  { id: 'uploading',    label: 'Video wird hochgeladen' },
  { id: 'download',     label: 'Video wird heruntergeladen' },
  { id: 'transcribe',   label: 'Whisper transkribiert' },
  { id: 'scenes',       label: 'Szenen werden erkannt' },
  { id: 'screenshots',  label: 'Screenshots werden erstellt' },
  { id: 'analyze',      label: 'Claude analysiert Szenen visuell' },
];

const PLATFORM_BLOCK_PATTERNS = [
  { pattern: /youtube|youtu\.be/i,   name: 'YouTube' },
  { pattern: /instagram/i,           name: 'Instagram' },
  { pattern: /tiktok/i,              name: 'TikTok' },
  { pattern: /twitter|x\.com/i,      name: 'Twitter/X' },
  { pattern: /facebook|fb\.watch/i,  name: 'Facebook' },
];

function parsePlatformError(rawError, url) {
  const isBlockedMsg = /sign in|bot|rate.limit|login required|not available|format is not available|error\.api\.\w+\.login|cobalt.*login|youtube\.login/i.test(rawError);
  if (!isBlockedMsg) return null;

  let platform = 'Diese Plattform';
  for (const { pattern, name } of PLATFORM_BLOCK_PATTERNS) {
    if (url && pattern.test(url)) { platform = name; break; }
    if (pattern.test(rawError))    { platform = name; break; }
  }
  return platform;
}

const MANUAL_STEPS = [
  { id: 'analyze',   label: 'Prompt wird analysiert',              hint: 'Claude liest deinen Prompt und versteht Ziel, Tonalität & Stil.', delay: 0 },
  { id: 'write',     label: 'Claude schreibt dein Skript',          hint: 'Jede Szene bekommt einen kurzen, wirkungsvollen deutschen Text.', delay: 2000 },
  { id: 'images',    label: 'Bildprompts werden erstellt',          hint: 'Für jede Szene entsteht ein detaillierter englischer Imagen-Prompt.', delay: 5000 },
  { id: 'finalize',  label: 'Szenengerüst wird zusammengebaut',     hint: 'Timing, Reihenfolge und Struktur werden finalisiert.', delay: 9000 },
];

export default function HomePage() {
  const router = useRouter();
  const fileRef = useRef();
  const [tab, setTab] = useState('url');
  const [creatingManual, setCreatingManual] = useState(false);
  const [manualStep, setManualStep]         = useState(null);
  const [manualDone, setManualDone]         = useState([]);
  const manualTimers = useRef([]);
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState('');
  const [manualPrompt, setManualPrompt] = useState('');
  const [targetLanguage, setTargetLanguage] = useState('original');
  const [activeStep, setActiveStep] = useState(null);
  const [stepLabel, setStepLabel] = useState('');
  const [error, setError] = useState('');
  const [platformBlock, setPlatformBlock] = useState(null); // platform name when blocked
  const [dragging, setDragging] = useState(false);
  const [doneSteps, setDoneSteps] = useState([]);

  const isProcessing = activeStep !== null;

  function markStep(stepId, label) {
    setActiveStep(stepId);
    setStepLabel(label ?? '');
  }

  function completeStep(stepId) {
    setDoneSteps((prev) => [...new Set([...prev, stepId])]);
  }

  async function startProcessing() {
    setError('');
    setPlatformBlock(null);
    setDoneSteps([]);
    if (!file && !url.trim()) {
      setError('Bitte ein Video hochladen oder einen Link einfügen.');
      return;
    }

    let projectId = null;
    let videoPath = null;

    try {
      if (file) {
        // ── Datei-Upload ──
        markStep('uploading', 'Video wird hochgeladen…');
        const form = new FormData();
        form.append('video', file);
        const upRes = await fetch('/api/upload', { method: 'POST', body: form });
        const upData = await upRes.json();
        if (!upRes.ok) throw new Error(upData.error ?? 'Upload fehlgeschlagen');
        projectId = upData.projectId;
        videoPath = upData.videoPath;
        completeStep('uploading');
      } else {
        // ── URL: Projekt anlegen, Video wird in process heruntergeladen ──
        const createRes = await fetch('/api/projects/create', { method: 'POST' });
        const createData = await createRes.json();
        if (!createRes.ok) throw new Error(createData.error ?? 'Projekt konnte nicht angelegt werden');
        projectId = createData.projectId;
      }

      // ── SSE: Transkription + Szenen + Screenshots ──
      const processRes = await fetch(`/api/projects/${projectId}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoPath, url: url.trim() || undefined, targetLanguage }),
      });

      if (!processRes.ok) {
        const e = await processRes.json().catch(() => ({}));
        throw new Error(e.error ?? 'Verarbeitung fehlgeschlagen');
      }

      const reader = processRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let event;
          try { event = JSON.parse(line.slice(6)); } catch { continue; }

          if (event.step === 'error') throw new Error(event.error ?? 'Fehler');
          if (event.step === 'done') {
            completeStep('analyze');
            router.push(`/scenes/${projectId}`);
            return;
          }

          const stepId = event.step;
          const label = event.label ?? STEPS.find(s => s.id === stepId)?.label ?? '';

          // Vorherigen Schritt als erledigt markieren
          const prevIdx = STEPS.findIndex(s => s.id === activeStep);
          const currIdx = STEPS.findIndex(s => s.id === stepId);
          if (prevIdx >= 0 && currIdx > prevIdx) completeStep(activeStep);

          markStep(stepId, label);
        }
      }
    } catch (err) {
      const blocked = parsePlatformError(err.message, url);
      if (blocked) {
        setPlatformBlock(blocked);
        setError('');
      } else {
        setError(err.message);
      }
      setActiveStep(null);
    }
  }

  async function startFromPrompt() {
    if (!manualPrompt.trim()) { setError('Bitte beschreibe dein Video.'); return; }
    setError('');
    setCreatingManual(true);
    setManualStep(MANUAL_STEPS[0].id);
    setManualDone([]);

    // Animate through steps while API runs
    manualTimers.current.forEach(clearTimeout);
    manualTimers.current = [];
    MANUAL_STEPS.forEach((s, i) => {
      if (i === 0) return;
      const t = setTimeout(() => {
        setManualDone(prev => [...prev, MANUAL_STEPS[i - 1].id]);
        setManualStep(s.id);
      }, s.delay);
      manualTimers.current.push(t);
    });

    try {
      const res = await fetch('/api/projects/create-from-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: manualPrompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Fehler');
      manualTimers.current.forEach(clearTimeout);
      router.push(`/scenes/${data.projectId}`);
    } catch (e) {
      manualTimers.current.forEach(clearTimeout);
      setError(e.message);
      setCreatingManual(false);
      setManualStep(null);
      setManualDone([]);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f?.type.includes('video')) { setFile(f); setTab('file'); setUrl(''); }
  }

  const activeIdx = STEPS.findIndex((s) => s.id === activeStep);

  return (
    <>
      <Head>
        <title>KI Video Creator — Herr Tech</title>
      </Head>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.4; } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
        @keyframes progress-bar { 0% { transform: translateX(-100%); } 50% { transform: translateX(80%); } 100% { transform: translateX(-100%); } }
        * { box-sizing: border-box; }
      `}</style>

      <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', flexDirection: 'column' }}>

        {/* Nav */}
        <nav style={{ padding: '0 40px', height: 64, borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src="/herr-tech-logo.png" alt="HERR TECH" style={{ height: 18, objectFit: 'contain' }} />
            <span style={{ color: T.muted, fontSize: 13 }}>/ social video creator</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => router.push('/projects')}
              style={{ background:'none', border:`1px solid ${T.border}`, borderRadius:9999, color:T.muted, fontSize:13, padding:'6px 16px', cursor:'pointer', transition:'all .15s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = T.accentBrd; e.currentTarget.style.color = T.accent; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.muted; }}>
              Meine Projekte →
            </button>
          </div>
        </nav>

        {/* Main */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 24px 80px' }}>
          <div style={{ width: '100%', maxWidth: 560 }}>

            {/* Badge */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: T.accentBg, border: `1px solid ${T.accentBrd}`, borderRadius: 9999, padding: '5px 14px', marginBottom: 28, fontSize: 12, fontWeight: 700, color: T.accent, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.accent, animation: 'pulse 2s infinite' }} />
              Whisper · Claude · Imagen · Kling · Veo3
            </div>

            <h1 style={{ fontSize: 52, fontWeight: 900, margin: '0 0 14px', lineHeight: 1.05, letterSpacing: '-2px', color: T.text }}>
              So einfach war<br />
              <span style={{ color: T.accent }}>Content noch nie.</span>
            </h1>
            <p style={{ color: T.muted, margin: '0 0 40px', fontSize: 16, lineHeight: 1.6 }}>
              Video hochladen — KI übernimmt den Rest. Szenen erkennen, Bilder &amp; Videos generieren, Untertitel rein, fertig exportieren. Kein Editor. Kein Studio. Kein Aufwand.
            </p>

            {/* Upload-Card */}
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 20 }}>

              {/* Tabs */}
              <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, padding: '0 4px' }}>
                {[
                  { id: 'url',    label: '🔗 Video-Link' },
                  { id: 'file',   label: '📁 Datei hochladen' },
                  { id: 'manual', label: '✨ KI-Entwurf' },
                ].map((t) => (
                  <button key={t.id} onClick={() => !isProcessing && !creatingManual && setTab(t.id)} style={{
                    flex: 1, padding: '14px 0', background: 'none', border: 'none',
                    borderBottom: `2px solid ${tab === t.id ? T.accent : 'transparent'}`,
                    color: tab === t.id ? T.text : T.muted,
                    fontWeight: tab === t.id ? 700 : 400,
                    fontSize: 13, cursor: isProcessing || creatingManual ? 'default' : 'pointer', transition: 'all .15s',
                  }}>
                    {t.label}
                  </button>
                ))}
              </div>

              <div style={{ padding: 24 }}>
                {tab === 'manual' ? (
                  <div>
                    <p style={{ margin: '0 0 12px', fontSize: 13, color: T.muted, lineHeight: 1.5 }}>
                      Beschreibe dein Video so genau wie möglich — Thema, Zielgruppe, Stil, Tonalität, Dialoge, Stimmung. Claude generiert daraus direkt ein komplettes Szenengerüst mit Skript & Bildprompts.
                    </p>
                    <textarea
                      value={manualPrompt}
                      onChange={e => { setManualPrompt(e.target.value); setError(''); }}
                      disabled={creatingManual}
                      rows={7}
                      placeholder={`Beispiel: Erstelle ein emotionales TikTok-Video über das Thema "Du bist nicht allein". Zielgruppe: junge Erwachsene 18–30. Stil: dunkel, cinematisch, Nahaufnahmen von Gesichtern, dramatische Lichtstimmung. Ton: ehrlich, roh, keine Schönfärberei. Die Person spricht direkt in die Kamera. Starker Hook in Sekunde 1. Am Ende ein Call to Action.`}
                      style={{
                        width: '100%', background: T.surface, border: `1px solid ${T.border}`,
                        borderRadius: 12, color: T.text, fontSize: 14, padding: '14px 16px',
                        outline: 'none', resize: 'vertical', lineHeight: 1.6,
                        fontFamily: 'inherit', transition: 'border-color .15s',
                      }}
                      onFocus={e => e.target.style.borderColor = T.accent}
                      onBlur={e => e.target.style.borderColor = T.border}
                    />
                  </div>
                ) : tab === 'file' ? (
                  <div
                    onClick={() => !isProcessing && fileRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={onDrop}
                    style={{
                      border: `2px dashed ${dragging ? T.accent : file ? T.green : T.border}`,
                      borderRadius: 14, padding: '36px 20px', textAlign: 'center',
                      cursor: isProcessing ? 'default' : 'pointer',
                      background: dragging ? T.accentBg : 'transparent',
                      transition: 'all .2s',
                    }}
                  >
                    <input ref={fileRef} type="file" accept="video/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setError(''); } }} />
                    {file ? (
                      <>
                        <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                        <p style={{ margin: 0, fontWeight: 700, color: T.green, fontSize: 15 }}>{file.name}</p>
                        <p style={{ margin: '4px 0 0', color: T.muted, fontSize: 13 }}>
                          {(file.size / 1024 / 1024).toFixed(1)} MB ·{' '}
                          <button onClick={(e) => { e.stopPropagation(); setFile(null); }} style={{ background: 'none', border: 'none', color: T.text, cursor: 'pointer', fontSize: 13, padding: 0, textDecoration: 'underline' }}>Entfernen</button>
                        </p>
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize: 40, marginBottom: 10 }}>🎬</div>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>Video hier ablegen</p>
                        <p style={{ margin: '6px 0 0', color: T.muted, fontSize: 13 }}>oder klicken · MP4, MOV, WebM bis 500 MB</p>
                      </>
                    )}
                  </div>
                ) : (
                  <div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                      {['YouTube', 'Instagram', 'TikTok', 'Twitter/X', 'Vimeo'].map((p) => (
                        <span key={p} style={{ fontSize: 11, color: T.muted, padding: '3px 10px', border: `1px solid ${T.border}`, borderRadius: 9999 }}>{p}</span>
                      ))}
                    </div>
                    <input
                      type="url" value={url} onChange={(e) => { setUrl(e.target.value); setError(''); }}
                      placeholder="https://youtube.com/watch?v=…"
                      disabled={isProcessing}
                      style={{ width: '100%', padding: '14px 16px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, color: T.text, fontSize: 14, outline: 'none', transition: 'border-color .15s' }}
                      onFocus={(e) => (e.target.style.borderColor = T.accent)}
                      onBlur={(e) => (e.target.style.borderColor = T.border)}
                    />
                  </div>
                )}

                {/* Transkript-Sprache — nur bei Video-Tab */}
                {tab !== 'manual' && (
                  <div style={{ marginTop: 18 }}>
                    <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: T.muted, letterSpacing: '0.5px', textTransform: 'uppercase' }}>Transkript-Sprache</p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {[{ v: 'original', l: 'Original' }, { v: 'english', l: 'Englisch' }, { v: 'german', l: 'Deutsch' }].map((opt) => (
                        <button key={opt.v} onClick={() => !isProcessing && setTargetLanguage(opt.v)} style={{
                          flex: 1, padding: '8px', borderRadius: 9999,
                          border: `1px solid ${targetLanguage === opt.v ? T.accent : T.border}`,
                          background: targetLanguage === opt.v ? T.accentBg : 'transparent',
                          color: targetLanguage === opt.v ? T.accent : T.muted,
                          fontSize: 13, fontWeight: 600, cursor: isProcessing ? 'default' : 'pointer', transition: 'all .15s',
                        }}>
                          {opt.l}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Plattform-Block-Fehler */}
            {platformBlock && (
              <div style={{ marginTop: 14, background: 'rgba(239,68,68,0.06)', border: `1px solid rgba(239,68,68,0.25)`, borderRadius: 14, padding: '16px 18px', animation: 'fadeIn .2s' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 18 }}>🚫</span>
                  <span style={{ color: T.red, fontWeight: 700, fontSize: 15 }}>{platformBlock} blockiert automatische Downloads</span>
                </div>
                <p style={{ color: '#f87171', fontSize: 13, margin: '0 0 10px', lineHeight: 1.5 }}>
                  {platformBlock} erkennt unseren Server als Bot und verweigert den Download — das passiert immer zuverlässiger bei allen großen Plattformen, egal welche Tools man nutzt.
                </p>
                <div style={{ background: 'rgba(181,152,226,0.08)', border: `1px solid rgba(181,152,226,0.2)`, borderRadius: 10, padding: '10px 14px' }}>
                  <p style={{ color: T.accent, fontSize: 13, fontWeight: 600, margin: '0 0 6px' }}>✅ So geht's trotzdem:</p>
                  <ol style={{ color: '#ccc', fontSize: 13, margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                    <li>Video im Browser auf {platformBlock} öffnen</li>
                    <li>Mit <strong style={{ color: '#fff' }}>
                      {platformBlock === 'YouTube' ? (
                        <a href="https://app.ytdown.to/de23/" target="_blank" rel="noopener noreferrer" style={{ color: T.accent, textDecoration: 'underline' }}>ytdown.to</a>
                      ) : (
                        <a href="https://cobalt.tools" target="_blank" rel="noopener noreferrer" style={{ color: T.accent, textDecoration: 'underline' }}>cobalt.tools</a>
                      )}
                    </strong> herunterladen</li>
                    <li>Hier oben auf <strong style={{ color: '#fff' }}>"Datei hochladen"</strong> wechseln und hochladen</li>
                  </ol>
                </div>
              </div>
            )}

            {/* Allgemeiner Fehler */}
            {error && (
              <div style={{ marginTop: 14, background: 'rgba(239,68,68,0.08)', border: `1px solid rgba(239,68,68,0.3)`, borderRadius: 12, padding: '12px 16px', color: T.red, fontSize: 14, animation: 'fadeIn .2s' }}>
                ⚠ {error}
              </div>
            )}

            {/* Fortschritt */}
            {isProcessing && (
              <div style={{ marginTop: 16, background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: '16px 20px', animation: 'fadeIn .2s' }}>
                {STEPS.filter(s => s.id !== (tab === 'file' ? 'download' : 'uploading')).map((s, i) => {
                  const isDone = doneSteps.includes(s.id);
                  const isActive = activeStep === s.id;
                  return (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 0' }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%', flexShrink: 0, fontSize: 13,
                        background: isDone ? T.accent : isActive ? 'transparent' : T.subtle,
                        border: isActive ? `2px solid ${T.accent}` : 'none',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: isDone ? '#fff' : isActive ? T.accent : T.muted,
                      }}>
                        {isDone ? '✓' : isActive ? <Spinner /> : <span style={{ fontSize: 10 }}>{i + 1}</span>}
                      </div>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 14, fontWeight: isActive ? 700 : 400, color: isDone || isActive ? T.text : T.muted }}>
                          {isActive && stepLabel ? stepLabel : s.label}
                        </span>
                        {/* Extra-Info während Claude die Szenen visuell analysiert */}
                        {isActive && s.id === 'analyze' && (
                          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div style={{ fontSize: 12, color: T.accent, animation: 'pulse 2s infinite' }}>
                              Claude schaut sich jeden Screenshot an…
                            </div>
                            <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.5 }}>
                              Charaktere · Setting · Stimmung · Key-Elemente werden erkannt.<br />
                              Das dauert ca. 10–30 Sekunden je nach Anzahl der Szenen.
                            </div>
                            {/* Animierter Balken */}
                            <div style={{ marginTop: 4, height: 3, borderRadius: 9999, background: T.subtle, overflow: 'hidden' }}>
                              <div style={{
                                height: '100%', borderRadius: 9999, background: T.accent,
                                animation: 'progress-bar 3s ease-in-out infinite',
                                width: '60%',
                              }} />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* KI-Entwurf Fortschritt */}
            {creatingManual && (
              <div style={{ marginTop: 16, background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: '16px 20px', animation: 'fadeIn .2s' }}>
                {MANUAL_STEPS.map((s, i) => {
                  const isDone   = manualDone.includes(s.id);
                  const isActive = manualStep === s.id;
                  return (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '7px 0' }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%', flexShrink: 0, fontSize: 13, marginTop: 1,
                        background: isDone ? T.accent : isActive ? 'transparent' : T.subtle,
                        border: isActive ? `2px solid ${T.accent}` : 'none',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: isDone ? '#fff' : isActive ? T.accent : T.muted,
                      }}>
                        {isDone ? '✓' : isActive ? <Spinner /> : <span style={{ fontSize: 10 }}>{i + 1}</span>}
                      </div>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 14, fontWeight: isActive ? 700 : 400, color: isDone || isActive ? T.text : T.muted }}>
                          {s.label}
                        </span>
                        {isActive && (
                          <div style={{ marginTop: 4 }}>
                            <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.5 }}>{s.hint}</div>
                            <div style={{ marginTop: 6, height: 3, borderRadius: 9999, background: T.subtle, overflow: 'hidden' }}>
                              <div style={{ height: '100%', borderRadius: 9999, background: T.accent, animation: 'progress-bar 3s ease-in-out infinite', width: '60%' }} />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* CTA */}
            {tab === 'manual' ? (
              <button
                onClick={startFromPrompt}
                disabled={creatingManual || !manualPrompt.trim()}
                style={{
                  marginTop: 16, width: '100%', padding: '17px', borderRadius: 9999,
                  background: creatingManual || !manualPrompt.trim() ? T.subtle : T.btn,
                  color: creatingManual || !manualPrompt.trim() ? T.muted : '#fff',
                  border: 'none', fontSize: 16, fontWeight: 800, letterSpacing: '-0.3px',
                  cursor: creatingManual || !manualPrompt.trim() ? 'not-allowed' : 'pointer',
                  transition: 'all .2s',
                }}
              >
                {creatingManual ? '✨ Claude generiert dein Gerüst…' : '✨ Szenengerüst von KI generieren'}
              </button>
            ) : (
              <button
                onClick={startProcessing}
                disabled={isProcessing || (!file && !url.trim())}
                style={{
                  marginTop: 16, width: '100%', padding: '17px', borderRadius: 9999,
                  background: isProcessing || (!file && !url.trim()) ? T.subtle : T.btn,
                  color: isProcessing || (!file && !url.trim()) ? T.muted : '#fff',
                  border: 'none', fontSize: 16, fontWeight: 800, letterSpacing: '-0.3px',
                  cursor: isProcessing || (!file && !url.trim()) ? 'not-allowed' : 'pointer',
                  transition: 'all .2s',
                }}
              >
                {isProcessing ? (stepLabel || 'Verarbeite…') : '⚡  Szenen erkennen & loslegen'}
              </button>
            )}

          </div>
        </main>

        <footer style={{ borderTop: `1px solid ${T.border}`, padding: '20px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: T.muted, fontSize: 13 }}>© 2025 herr.tech · KI Video Creator</span>
          <span style={{ color: T.subtle, fontSize: 12 }}>Whisper · Claude · Imagen · Kling · Veo3</span>
        </footer>

      </div>
    </>
  );
}

function Spinner() {
  return (
    <div style={{ width: 10, height: 10, border: '2px solid #333', borderTopColor: '#B598E2', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
  );
}
