import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

const T = {
  bg:        '#000000',
  surface:   '#0d0d0d',
  card:      '#111111',
  border:    '#1e1e1e',
  accent:    '#B598E2',
  accentBg:  'rgba(181,152,226,0.08)',
  accentBrd: 'rgba(181,152,226,0.25)',
  text:      '#ffffff',
  muted:     '#666666',
  subtle:    '#222222',
  green:     '#22c55e',
  greenBg:   'rgba(34,197,94,0.08)',
  greenBrd:  'rgba(34,197,94,0.25)',
  red:       '#ef4444',
  redBg:     'rgba(239,68,68,0.08)',
};

function fmt(sec) {
  if (sec == null) return '--:--';
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function Pill({ children }) {
  return (
    <span style={{ fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:9999, background:T.subtle, color:T.muted, border:`1px solid ${T.border}` }}>
      {children}
    </span>
  );
}

function Breadcrumb({ projectId, router }) {
  const steps = ['1 Upload & Analyse', '2 Bilder generieren', '3 Videos generieren', '4 Export'];
  const links = ['/', `/scenes/${projectId}`, `/videos/${projectId}`, `/export/${projectId}`];
  const active = 2;

  const [visited, setVisited] = useState([]);

  // Load from localStorage after projectId resolves (avoids SSR + undefined-key bugs)
  useEffect(() => {
    if (!projectId) return;
    try {
      const stored = JSON.parse(localStorage.getItem(`visited_v3_${projectId}`) || '[]');
      setVisited(stored.filter(i => i >= 0 && i <= 3));
    } catch {}
  }, [projectId]);

  // Save current active step
  useEffect(() => {
    if (!projectId) return;
    setVisited(prev => {
      const next = prev.includes(active) ? prev : [...prev, active];
      try { localStorage.setItem(`visited_v3_${projectId}`, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [active, projectId]);

  return (
    <div style={{ padding:'16px 40px 0', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
      {steps.map((step, i) => {
        const isActive = i === active;
        const wasPastOrVisited = i < active || visited.includes(i);
        const isClickable = !!links[i] && !isActive && wasPastOrVisited;
        return (
          <div key={step} style={{ display:'flex', alignItems:'center', gap:8 }}>
            {i > 0 && <span style={{ color: wasPastOrVisited || isActive ? T.border : '#1c1c1c' }}>→</span>}
            <span
              onClick={isClickable ? () => router.push(links[i]) : undefined}
              style={{
                fontSize:12, fontWeight:700, padding:'3px 10px', borderRadius:9999,
                background: isActive ? T.accentBg : 'transparent',
                border: `1px solid ${isActive ? T.accentBrd : wasPastOrVisited ? '#444444' : '#1e1e1e'}`,
                color: isActive ? T.accent : wasPastOrVisited ? '#b0b0b0' : '#2e2e2e',
                cursor: isClickable ? 'pointer' : 'default',
                transition: 'all .15s',
              }}
              onMouseEnter={e => { if (isClickable) { e.currentTarget.style.borderColor = T.accentBrd; e.currentTarget.style.color = T.accent; }}}
              onMouseLeave={e => { if (isClickable) { e.currentTarget.style.borderColor = '#444444'; e.currentTarget.style.color = '#b0b0b0'; }}}>
              {step}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function StatusBadge({ status }) {
  if (status === 'done')
    return <span style={{ fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:9999, background:T.greenBg, color:T.green, border:`1px solid ${T.greenBrd}` }}>✓ Fertig</span>;
  if (status === 'generating')
    return <span style={{ fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:9999, background:T.accentBg, color:T.accent, border:`1px solid ${T.accentBrd}`, display:'inline-flex', alignItems:'center', gap:5 }}>
      <span style={{ width:8, height:8, borderRadius:'50%', border:`1.5px solid ${T.accent}`, borderTopColor:'transparent', display:'inline-block', animation:'spin .7s linear infinite' }} />
      Wird generiert…
    </span>;
  if (status === 'error')
    return <span style={{ fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:9999, background:T.redBg, color:T.red, border:`1px solid rgba(239,68,68,.3)` }}>✗ Fehler</span>;
  return <span style={{ fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:9999, background:T.subtle, color:T.muted, border:`1px solid ${T.border}` }}>Ausstehend</span>;
}

function Spinner({ size = 12, color = '#fff' }) {
  return <span style={{ width:size, height:size, borderRadius:'50%', border:`2px solid rgba(255,255,255,.25)`, borderTopColor:color, display:'inline-block', animation:'spin .7s linear infinite', flexShrink:0 }} />;
}

// ── Single scene video card ─────────────────────────────────────────────────
function ModelToggle({ value, onChange, size = 'sm' }) {
  const pad   = size === 'sm' ? '3px 9px'  : '4px 12px';
  const fsize = size === 'sm' ? 11          : 12;
  return (
    <div style={{ display:'inline-flex', alignItems:'center', background:T.subtle, borderRadius:9999, padding:'3px 4px', border:`1px solid ${T.border}`, gap:2 }}>
      {['kling','veo3'].map(m => (
        <button key={m} onClick={() => onChange(m)} style={{
          background: value === m ? (m==='veo3' ? 'rgba(34,197,94,0.15)' : T.accentBg) : 'transparent',
          border: `1px solid ${value === m ? (m==='veo3' ? T.greenBrd : T.accentBrd) : 'transparent'}`,
          borderRadius:9999, padding:pad,
          color: value === m ? (m==='veo3' ? T.green : T.accent) : T.muted,
          fontWeight:700, fontSize:fsize, cursor:'pointer', transition:'all .15s', whiteSpace:'nowrap',
        }}>
          {m === 'veo3' ? 'Veo 3' : 'Kling'}
        </button>
      ))}
    </div>
  );
}

function AudioToggle({ value, onChange, size = 'sm' }) {
  const pad   = size === 'sm' ? '3px 9px'  : '4px 12px';
  const fsize = size === 'sm' ? 11          : 12;
  return (
    <div style={{ display:'inline-flex', alignItems:'center', background:T.subtle, borderRadius:9999, padding:'3px 4px', border:`1px solid ${T.border}`, gap:2 }}>
      {[true, false].map(on => (
        <button key={String(on)} onClick={() => onChange(on)} style={{
          background: value === on ? (on ? 'rgba(34,197,94,0.15)' : T.accentBg) : 'transparent',
          border: `1px solid ${value === on ? (on ? T.greenBrd : T.accentBrd) : 'transparent'}`,
          borderRadius:9999, padding:pad,
          color: value === on ? (on ? T.green : T.muted) : T.muted,
          fontWeight:700, fontSize:fsize, cursor:'pointer', transition:'all .15s', whiteSpace:'nowrap',
        }}>
          {on ? 'Ton' : 'Stumm'}
        </button>
      ))}
    </div>
  );
}

function DurationToggle({ value, options, autoValue, onChange }) {
  const isManual = value !== autoValue;
  return (
    <div style={{ position:'relative', display:'inline-flex', alignItems:'center' }}>
        <select
          value={value}
          onChange={e => {
            const val = e.target.value;
            onChange(val === autoValue ? null : val);
          }}
          style={{
            appearance: 'none', WebkitAppearance: 'none',
            background: T.subtle,
            border: `1px solid ${isManual ? T.accentBrd : T.border}`,
            borderRadius: 9999,
            color: isManual ? T.accent : T.muted,
            fontWeight: 700, fontSize: 11,
            padding: '5px 28px 5px 12px',
            cursor: 'pointer', outline: 'none',
            fontFamily: 'inherit',
            transition: 'all .15s',
          }}>
          {options.map(d => (
            <option key={d} value={d}>{d}{d === autoValue ? ' ★' : ''}</option>
          ))}
        </select>
        {/* Custom chevron */}
        <svg style={{ position:'absolute', right:9, pointerEvents:'none', color: isManual ? T.accent : T.muted }} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
    </div>
  );
}

function SceneVideoCard({ scene, sceneIdx, projectId, onGenerate, onGeneratePrompt, onReset, onUpdate, generating, generatingPrompt, selectedModel, selectedAudio }) {
  const [videoPrompt, setVideoPrompt]   = useState(scene.videoPrompt || '');
  const [scriptText,  setScriptText]    = useState(scene.manualText?.trim() || scene.transcriptText?.trim() || scene.text?.trim() || '');
  const [hints,       setHints]         = useState(scene.videoHints || '');
  // Model: use saved scene model first, fall back to global
  const [sceneModel,  setSceneModel]    = useState(scene.videoModel ?? selectedModel);
  // Audio: use saved scene audio first, fall back to global (default true)
  const [sceneAudio,  setSceneAudio]    = useState(scene.videoAudio != null ? !!scene.videoAudio : selectedAudio);
  // Script type: spoken (character talks) or voiceover (off-screen narration)
  const [scriptType,  setScriptType]    = useState(scene.scriptType ?? 'spoken');
  // Duration override — null = auto (calculated from scene length)
  const [durationOverride, setDurationOverride] = useState(null);
  // Track whether script/hints/type changed since last prompt generation → auto-regen before video
  const [promptDirty, setPromptDirty]   = useState(false);
  // Video history navigation
  const [historyIdx,  setHistoryIdx]    = useState(null); // null = latest
  const scriptSaveTimer   = useRef(null);
  const hintsSaveTimer    = useRef(null);
  const isFirstRender     = useRef(true);

  // Global toggle always overrides all scenes — but skip the very first render
  // (first render uses the initialized values from scene data)
  useEffect(() => {
    if (isFirstRender.current) return;
    setSceneModel(selectedModel);
    setDurationOverride(null); // reset duration when model changes globally
  }, [selectedModel]);
  useEffect(() => {
    if (isFirstRender.current) return;
    setSceneAudio(selectedAudio);
  }, [selectedAudio]);
  useEffect(() => { isFirstRender.current = false; }, []);

  // Sync prompt when updated externally
  useEffect(() => {
    if (scene.videoPrompt && scene.videoPrompt !== videoPrompt) {
      setVideoPrompt(scene.videoPrompt);
    }
  }, [scene.videoPrompt]);

  const duration = scene.end != null && scene.start != null
    ? (scene.end - scene.start).toFixed(1) : '?';
  const sceneDurationSec = scene.end != null && scene.start != null ? scene.end - scene.start : 5;

  // Auto-duration helpers (mirrors fal-video.js logic)
  const autoKlingDuration = String(Math.max(3, Math.min(15, Math.round(sceneDurationSec))));
  const autoVeo3Duration = sceneDurationSec < 5 ? '4s' : sceneDurationSec < 7 ? '6s' : '8s';
  const klingOptions = ['3','4','5','6','7','8','9','10','11','12','15'];
  const veo3Options  = ['4s','6s','8s'];

  const effectiveDuration = durationOverride ?? (sceneModel === 'veo3' ? autoVeo3Duration : autoKlingDuration);

  const status     = scene.videoStatus ?? 'pending';
  const canGenerate = !!scene.imageFile && status !== 'generating';
  const imgSrc     = scene.imageFile
    ? `/api/projects/${projectId}/media/generated-images/${scene.imageFile}` : null;

  // Video history navigation
  const videoHistory = scene.videoHistory ?? (scene.videoFile ? [scene.videoFile] : []);
  const displayHistIdx = historyIdx !== null ? historyIdx : videoHistory.length - 1;
  const displayVideoFile = videoHistory[displayHistIdx] ?? null;
  const videoSrc = displayVideoFile
    ? `/api/projects/${projectId}/media/generated-videos/${displayVideoFile}` : null;
  const isViewingOldVideo = videoHistory.length > 0 && displayHistIdx < videoHistory.length - 1;

  // Reset history idx to latest when a new video arrives
  useEffect(() => { setHistoryIdx(null); }, [scene.videoFile]);

  const saveScript = (val) => {
    if (scriptSaveTimer.current) clearTimeout(scriptSaveTimer.current);
    scriptSaveTimer.current = setTimeout(() => {
      fetch(`/api/projects/${projectId}/scenes/${scene.id ?? sceneIdx}/update-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: val }),
      }).catch(() => {});
    }, 800);
  };

  const saveHints = (val) => {
    if (hintsSaveTimer.current) clearTimeout(hintsSaveTimer.current);
    hintsSaveTimer.current = setTimeout(() => {
      fetch(`/api/projects/${projectId}/scenes/${scene.id ?? sceneIdx}/update-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoHints: val }),
      }).catch(() => {});
    }, 800);
  };

  const saveSceneSettings = (updates) => {
    fetch(`/api/projects/${projectId}/scenes/${scene.id ?? sceneIdx}/update-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    }).catch(() => {});
  };

  return (
    <div style={{
      background: T.card,
      border: `1px solid ${status === 'done' ? T.greenBrd : status === 'generating' ? T.accentBrd : status === 'error' ? 'rgba(239,68,68,.25)' : T.border}`,
      borderRadius: 14, overflow:'hidden',
      display:'grid', gridTemplateColumns:'240px 1fr 240px',
      minHeight:280, transition:'border-color .2s',
    }}>

      {/* LEFT — Image */}
      <div style={{ borderRight:`1px solid ${T.border}`, overflow:'hidden', position:'relative', background:'#080808' }}>
        {imgSrc
          ? <img src={imgSrc} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
          : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', color:T.muted, fontSize:12 }}>Kein Bild</div>
        }
        <div style={{ position:'absolute', top:8, left:8, background:'rgba(0,0,0,.75)', borderRadius:6, padding:'2px 7px', fontSize:10, fontWeight:700, color:T.muted }}>
          #{sceneIdx + 1}
        </div>
      </div>

      {/* MIDDLE — Controls */}
      <div style={{ padding:'14px 16px', display:'flex', flexDirection:'column', gap:10 }}>

        {/* Time + status */}
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          <span style={{ fontFamily:'monospace', fontSize:13, color:T.accent, fontWeight:700 }}>
            {fmt(scene.start)} → {fmt(scene.end)}
          </span>
          <span style={{ fontSize:12, color:T.muted }}>{duration}s</span>
          <StatusBadge status={status} />
          {scene.videoError && <span style={{ fontSize:11, color:T.red }}>{scene.videoError.slice(0,80)}</span>}
        </div>

        {/* Editable script */}
        <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
          <label style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.5px' }}>Skript</label>
          <textarea
            value={scriptText}
            onChange={e => { setScriptText(e.target.value); saveScript(e.target.value); setPromptDirty(true); }}
            rows={2}
            style={{ background:'rgba(255,255,255,0.04)', border:`1px solid ${T.border}`, borderRadius:8, color:T.text, fontSize:12, padding:'7px 10px', resize:'vertical', lineHeight:1.5, outline:'none', transition:'border .15s' }}
            onFocus={e => e.target.style.borderColor = T.accentBrd}
            onBlur={e => e.target.style.borderColor = T.border}
          />
        </div>

        {/* Additional hints */}
        <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
          <label style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.5px' }}>
            Zusätzliche Hinweise für Prompt <span style={{ fontWeight:400, color:T.subtle, fontSize:10, textTransform:'none' }}>— optional</span>
          </label>
          <input
            value={hints}
            onChange={e => { setHints(e.target.value); saveHints(e.target.value); setPromptDirty(true); }}
            placeholder="z.B. 'die Erdbeere spricht', 'Kamera zoomt rein', 'Crowd bewegt sich energetisch'…"
            style={{ background:'rgba(255,255,255,0.04)', border:`1px solid ${T.border}`, borderRadius:8, color:T.text, fontSize:12, padding:'7px 10px', outline:'none', transition:'border .15s' }}
            onFocus={e => e.target.style.borderColor = T.accentBrd}
            onBlur={e => e.target.style.borderColor = T.border}
          />
          <div style={{ fontSize:10, color:T.muted, lineHeight:1.5, paddingLeft:2 }}>
            🗣 Beschreibe wer spricht, z.B. "die Erdbeere spricht" oder "der linke Charakter sagt das" — sonst nimmt Claude die Hauptfigur.
          </div>
        </div>

        {/* Video prompt textarea */}
        <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
          <label style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'0.5px' }}>Video-Prompt</label>
          <textarea
            value={videoPrompt}
            onChange={e => setVideoPrompt(e.target.value)}
            placeholder="Klicke '✨ Prompt erstellen' oder schreibe direkt — beschreibt Kamera- und Charakterbewegungen für das Video."
            rows={3}
            style={{ background:'rgba(255,255,255,0.04)', border:`1px solid ${T.border}`, borderRadius:8, color:T.text, fontSize:12, padding:'7px 10px', resize:'vertical', lineHeight:1.5, outline:'none', transition:'border .15s' }}
            onFocus={e => e.target.style.borderColor = T.accentBrd}
            onBlur={e => e.target.style.borderColor = T.border}
          />
        </div>

        {/* Dirty indicator: script/hints changed since last prompt */}
        {promptDirty && !generatingPrompt && (
          <div style={{ fontSize:10, color:'#f59e0b', background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.25)', borderRadius:6, padding:'4px 10px' }}>
            ⚠ Skript oder Hinweise geändert — Prompt wird beim Generieren automatisch neu erstellt
          </div>
        )}

        {/* Action row: Prompt erstellen (left) | controls + Video generieren (right) */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
          <button
            onClick={() => onGeneratePrompt(sceneIdx, scriptText, hints, (p) => { setVideoPrompt(p); setPromptDirty(false); }, scriptType)}
            disabled={generatingPrompt || generating}
            style={{
              background: generatingPrompt ? T.accentBg : 'rgba(181,152,226,0.12)',
              border: `1px solid ${T.accentBrd}`, borderRadius:9999,
              color: T.accent, fontWeight:700, fontSize:12, padding:'7px 16px',
              cursor: (generatingPrompt || generating) ? 'not-allowed' : 'pointer',
              display:'inline-flex', alignItems:'center', gap:5, transition:'all .15s', flexShrink:0,
            }}>
            {generatingPrompt ? <><Spinner size={10} color={T.accent} /> Erstelle…</> : '✨ Prompt erstellen'}
          </button>
          <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
            <ModelToggle value={sceneModel} onChange={(m) => { setSceneModel(m); setDurationOverride(null); saveSceneSettings({ videoModel: m }); }} size="sm" />
            <AudioToggle value={sceneAudio} onChange={(a) => { setSceneAudio(a); saveSceneSettings({ videoAudio: a }); }} size="sm" />

            {/* Duration toggle */}
            <DurationToggle
              value={effectiveDuration}
              options={sceneModel === 'veo3' ? veo3Options : klingOptions}
              autoValue={sceneModel === 'veo3' ? autoVeo3Duration : autoKlingDuration}
              onChange={setDurationOverride}
            />
            <button
              onClick={() => {
                if (promptDirty) {
                  onGeneratePrompt(sceneIdx, scriptText, hints, (newPrompt) => {
                    setVideoPrompt(newPrompt);
                    setPromptDirty(false);
                    onGenerate(sceneIdx, newPrompt, sceneModel, sceneAudio, scriptType, scriptText, effectiveDuration);
                  }, scriptType);
                } else {
                  onGenerate(sceneIdx, videoPrompt, sceneModel, sceneAudio, scriptType, scriptText, effectiveDuration);
                }
              }}
              disabled={!canGenerate || generating || generatingPrompt}
              style={{
                background: (!canGenerate || generating || generatingPrompt) ? T.accentBg : `linear-gradient(135deg, ${T.accent}, #8b68d4)`,
                border: `1px solid ${canGenerate ? T.accent : T.border}`,
                borderRadius:9999, color: canGenerate ? '#fff' : T.muted,
                fontWeight:700, fontSize:12, padding:'7px 18px',
                cursor: canGenerate && !generating && !generatingPrompt ? 'pointer' : 'not-allowed',
                display:'inline-flex', alignItems:'center', gap:6, transition:'all .15s', flexShrink:0,
              }}>
              {(generating || status === 'generating') && !generatingPrompt
                ? <><Spinner /> Wird generiert…</>
                : generatingPrompt
                ? <><Spinner size={10} /> Prompt…</>
                : status === 'done' ? '🔄 Neu generieren'
                : !scene.imageFile ? 'Kein Bild vorhanden'
                : '🎬 Video generieren'}
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT — Video preview */}
      <div style={{ borderLeft:`1px solid ${T.border}`, background:'#080808', display:'flex', flexDirection:'column', overflow:'hidden' }}>
        {/* Video area */}
        <div style={{ flex:1, position:'relative', display:'flex', alignItems:'center', justifyContent:'center', minHeight:0 }}>
          {videoSrc ? (
            <>
              <video key={videoSrc} controls loop playsInline style={{ width:'100%', height:'100%', objectFit:'cover', display:'block', position:'absolute', top:0, left:0 }}>
                <source src={videoSrc} type="video/mp4" />
              </video>
              {/* "Verwenden" button when viewing old video */}
              {isViewingOldVideo && (
                <div style={{ position:'absolute', top:6, left:0, right:0, display:'flex', justifyContent:'center', zIndex:10 }}>
                  <button
                    onClick={async () => {
                      await fetch(`/api/projects/${projectId}/scenes/${scene.id ?? sceneIdx}/set-active-video`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ videoFile: displayVideoFile }),
                      });
                      setHistoryIdx(null);
                      onUpdate?.();
                    }}
                    style={{ fontSize:10, fontWeight:700, color:'#000', background:T.accent, border:'none', borderRadius:9999, padding:'3px 10px', cursor:'pointer', whiteSpace:'nowrap', boxShadow:'0 2px 8px rgba(0,0,0,0.5)' }}>
                    ✓ Verwenden
                  </button>
                </div>
              )}
              {/* History counter overlay */}
              {videoHistory.length > 1 && (
                <div style={{ position:'absolute', bottom:6, right:8, background:'rgba(0,0,0,0.65)', borderRadius:9999, padding:'2px 8px', fontSize:9, color:'#ccc', zIndex:10 }}>
                  {displayHistIdx + 1} / {videoHistory.length}
                </div>
              )}
            </>
          ) : status === 'generating' ? (
            <div style={{ textAlign:'center', padding:20 }}>
              <div style={{ width:32, height:32, borderRadius:'50%', border:`3px solid ${T.accentBrd}`, borderTopColor:T.accent, animation:'spin .7s linear infinite', margin:'0 auto 12px' }} />
              <div style={{ fontSize:12, color:T.muted, lineHeight:1.6 }}>
                {scene.videoModel === 'veo3' ? 'Veo 3' : 'Kling'} generiert…<br />
                <span style={{ fontSize:11, color:T.subtle }}>
                  {scene.videoModel === 'veo3' ? 'ca. 3–5 Minuten' : 'ca. 5–6 Minuten'}
                </span>
              </div>
            </div>
          ) : status === 'error' ? (
            <div style={{ padding:'14px 16px' }}>
              {scene.videoError?.startsWith('CONTENT_FILTER') ? (
                <>
                  <div style={{ color:T.red, fontSize:13, fontWeight:700, marginBottom:8 }}>🚫 Inhalt von Veo 3 gefiltert</div>
                  <div style={{ color:'rgba(239,68,68,.85)', fontSize:11, marginBottom:8, lineHeight:1.6 }}>
                    Googles Veo 3 hat strenge Inhaltsrichtlinien und blockt automatisch Inhalte wie:
                  </div>
                  <ul style={{ color:'rgba(239,68,68,.7)', fontSize:11, marginBottom:10, lineHeight:1.8, paddingLeft:16, margin:'0 0 10px' }}>
                    <li>Körperliche Verletzungen oder Schmerzen</li>
                    <li>Betrug, Scams oder kriminelle Themen</li>
                    <li>Politische oder religiöse Inhalte</li>
                    <li>Gewalt, Bedrohungen oder Angst-Szenarien</li>
                  </ul>
                  <div style={{ color:'rgba(239,68,68,.6)', fontSize:11, marginBottom:12, lineHeight:1.5 }}>
                    👉 Nochmal versuchen (klappt manchmal beim 2. Versuch) oder auf <strong style={{color:'#fff'}}>Kling</strong> wechseln — Kling ist deutlich weniger restriktiv.
                  </div>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    <button
                      onClick={() => onGenerate(sceneIdx, scene.videoPrompt, 'veo3', selectedAudio, scene.scriptType)}
                      style={{ background:'rgba(239,68,68,.1)', border:`1px solid rgba(239,68,68,.3)`, borderRadius:9999, color:T.red, fontSize:11, fontWeight:700, padding:'5px 14px', cursor:'pointer' }}>
                      ↺ Nochmal mit Veo 3
                    </button>
                    <button
                      onClick={() => onGenerate(sceneIdx, scene.videoPrompt, 'kling', selectedAudio, scene.scriptType)}
                      style={{ background:'rgba(181,152,226,.12)', border:`1px solid rgba(181,152,226,.3)`, borderRadius:9999, color:'#B598E2', fontSize:11, fontWeight:700, padding:'5px 14px', cursor:'pointer' }}>
                      ✦ Mit Kling generieren
                    </button>
                  </div>
                </>
              ) : scene.videoError?.startsWith('GENERATION_FAILED') ? (
                <>
                  <div style={{ color:T.red, fontSize:12, fontWeight:700, marginBottom:6 }}>⚠ Generierung fehlgeschlagen</div>
                  <div style={{ color:'rgba(239,68,68,.8)', fontSize:11, marginBottom:10, lineHeight:1.5 }}>
                    fal.ai konnte kein Video erstellen. Nochmal versuchen oder auf Kling wechseln.
                  </div>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    <button
                      onClick={() => onGenerate(sceneIdx, scene.videoPrompt, scene.videoModel ?? selectedModel, selectedAudio, scene.scriptType)}
                      style={{ background:'rgba(239,68,68,.1)', border:`1px solid rgba(239,68,68,.3)`, borderRadius:9999, color:T.red, fontSize:11, fontWeight:700, padding:'5px 14px', cursor:'pointer' }}>
                      ↺ Nochmal versuchen
                    </button>
                    <button
                      onClick={() => onGenerate(sceneIdx, scene.videoPrompt, 'kling', selectedAudio, scene.scriptType)}
                      style={{ background:'rgba(181,152,226,.12)', border:`1px solid rgba(181,152,226,.3)`, borderRadius:9999, color:'#B598E2', fontSize:11, fontWeight:700, padding:'5px 14px', cursor:'pointer' }}>
                      ✦ Mit Kling generieren
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ color:T.red, fontSize:12, fontWeight:700, marginBottom:6 }}>✗ Fehler</div>
                  {scene.videoError && <div style={{ color:'rgba(239,68,68,.6)', fontSize:10, marginBottom:10, lineHeight:1.4 }}>{scene.videoError.slice(0,120)}</div>}
                  <button
                    onClick={() => onReset(sceneIdx)}
                    style={{ background:'rgba(239,68,68,.1)', border:`1px solid rgba(239,68,68,.3)`, borderRadius:9999, color:T.red, fontSize:11, fontWeight:700, padding:'5px 14px', cursor:'pointer' }}>
                    ↺ Zurücksetzen
                  </button>
                </>
              )}
            </div>
          ) : (
            <div style={{ textAlign:'center', padding:20 }}>
              <div style={{ fontSize:36, marginBottom:8, opacity:.2 }}>🎬</div>
              <div style={{ fontSize:12, color:T.subtle }}>
                {scene.imageFile ? 'Video noch nicht generiert' : 'Zuerst Bild erstellen'}
              </div>
            </div>
          )}
        </div>

        {/* History navigation arrows */}
        {videoHistory.length > 1 && status !== 'generating' && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:'#0a0a0a', borderTop:`1px solid ${T.border}`, padding:'3px 6px', gap:4, flexShrink:0 }}>
            <button
              onClick={() => setHistoryIdx(Math.max(0, displayHistIdx - 1))}
              disabled={displayHistIdx === 0}
              style={{ background:'none', border:'none', color: displayHistIdx === 0 ? '#222' : T.muted, cursor: displayHistIdx === 0 ? 'default' : 'pointer', fontSize:16, padding:'1px 4px', lineHeight:1 }}>
              ‹
            </button>
            <span style={{ fontSize:9, color:T.muted, whiteSpace:'nowrap' }}>
              {displayHistIdx + 1} / {videoHistory.length}
            </span>
            <button
              onClick={() => setHistoryIdx(Math.min(videoHistory.length - 1, displayHistIdx + 1))}
              disabled={displayHistIdx === videoHistory.length - 1}
              style={{ background:'none', border:'none', color: displayHistIdx === videoHistory.length - 1 ? '#222' : T.muted, cursor: displayHistIdx === videoHistory.length - 1 ? 'default' : 'pointer', fontSize:16, padding:'1px 4px', lineHeight:1 }}>
              ›
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────
export default function VideosPage() {
  const router = useRouter();
  const { id }  = router.query;

  const [project,       setProject]       = useState(null);
  const [scenes,        setScenes]        = useState([]);
  const [generating,    setGenerating]    = useState({});     // sceneIdx → bool
  const [genPrompt,     setGenPrompt]     = useState({});     // sceneIdx → bool
  const [generatingAll, setGeneratingAll] = useState(false);
  const [genAllPrompts, setGenAllPrompts] = useState(false);
  const [selectedModel, setSelectedModel] = useState(() => { try { return localStorage.getItem('globalVideoModel') || 'veo3'; } catch { return 'veo3'; } });
  const [selectedAudio, setSelectedAudio] = useState(() => { try { return localStorage.getItem('globalVideoAudio') !== 'false'; } catch { return true; } });
  const pollRef = useRef(null);

  const setGlobalModel = (m) => { setSelectedModel(m); try { localStorage.setItem('globalVideoModel', m); } catch {} };
  const setGlobalAudio = (a) => { setSelectedAudio(a); try { localStorage.setItem('globalVideoAudio', String(a)); } catch {} };

  // Load project
  useEffect(() => {
    if (!id) return;
    fetch(`/api/projects/${id}`)
      .then(r => r.json())
      .then(data => { setProject(data); setScenes(data.scenes || []); })
      .catch(console.error);
  }, [id]);

  // Poll generating scenes every 12s
  useEffect(() => {
    const generatingIdxs = scenes.map((s,i)=>i).filter(i => scenes[i].videoStatus === 'generating');
    if (generatingIdxs.length === 0) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    if (pollRef.current) clearInterval(pollRef.current);

    const doPoll = async () => {
      for (const i of generatingIdxs) {
        try {
          const res  = await fetch(`/api/projects/${id}/scenes/${i}/video-status`);
          const data = await res.json();
          if (!res.ok) {
            // API error — mark as error so user sees it
            setScenes(prev => {
              const u = [...prev];
              u[i] = { ...u[i], videoStatus: 'error', videoError: data.error || `Status-Fehler ${res.status}` };
              return u;
            });
            continue;
          }
          if (data.status !== 'generating') {
            setScenes(prev => {
              const u = [...prev];
              const newFile = data.videoFile ?? u[i].videoFile ?? null;
              // Merge videoHistory: use server's history if returned, otherwise append new file
              const existingHistory = u[i].videoHistory ?? (u[i].videoFile ? [u[i].videoFile] : []);
              const mergedHistory = data.videoHistory
                ? data.videoHistory
                : (newFile && !existingHistory.includes(newFile))
                  ? [...existingHistory, newFile]
                  : existingHistory;
              u[i] = { ...u[i], videoStatus: data.status, videoFile: newFile, videoHistory: mergedHistory, videoError: data.error ?? null };
              return u;
            });
          }
        } catch (err) {
          console.error(`[poll] Fehler bei Szene ${i}:`, err);
        }
      }
    };

    pollRef.current = setInterval(doPoll, 8000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [scenes, id]);

  // Generate prompt for one scene — returns the prompt string or null
  const generatePromptForScene = useCallback(async (sceneIdx, scriptText, hints, onDone, scriptType = 'spoken') => {
    setGenPrompt(prev => ({ ...prev, [sceneIdx]: true }));
    try {
      const res  = await fetch(`/api/projects/${id}/scenes/${sceneIdx}/generate-video-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ additionalHints: hints || '', scriptOverride: scriptText || '', scriptType }),
      });
      const data = await res.json();
      if (data.ok && data.prompt) {
        onDone?.(data.prompt);
        setScenes(prev => {
          const u = [...prev];
          u[sceneIdx] = { ...u[sceneIdx], videoPrompt: data.prompt };
          return u;
        });
        return data.prompt;
      } else {
        alert(`Fehler: ${data.error}`);
        return null;
      }
    } catch (err) {
      alert(`Fehler: ${err.message}`);
      return null;
    } finally {
      setGenPrompt(prev => ({ ...prev, [sceneIdx]: false }));
    }
  }, [id]);

  // Generate prompts for all scenes
  const generateAllPrompts = useCallback(async () => {
    setGenAllPrompts(true);
    // Re-fetch project to get latest saved text before iterating
    let freshScenes = scenes;
    try {
      const latestRes = await fetch(`/api/projects/${id}`);
      const latestData = await latestRes.json();
      freshScenes = latestData.scenes || scenes;
    } catch {}
    const idxs = freshScenes.map((s,i)=>i).filter(i => freshScenes[i].imageFile);
    for (const idx of idxs) {
      try {
        const s = freshScenes[idx];
        const script = s.manualText?.trim() || s.transcriptText?.trim() || s.text?.trim() || '';
        const res = await fetch(`/api/projects/${id}/scenes/${idx}/generate-video-prompt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ additionalHints: '', scriptOverride: script }),
        });
        const data = await res.json();
        if (data.ok && data.prompt) {
          setScenes(prev => {
            const u = [...prev];
            u[idx] = { ...u[idx], videoPrompt: data.prompt };
            return u;
          });
        }
      } catch {}
      await new Promise(r => setTimeout(r, 500));
    }
    setGenAllPrompts(false);
  }, [scenes, id]);

  // Generate video for one scene — auto-generates prompt first if none provided
  const generateVideo = useCallback(async (sceneIdx, promptOverride, model = 'veo3', audio = true, scriptType = 'spoken', scriptOverride = '', durationOverride = null) => {
    let finalPrompt = promptOverride?.trim() || '';

    // Auto-generate prompt if not provided
    if (!finalPrompt) {
      const s = scenes[sceneIdx];
      const script = scriptOverride?.trim() || s?.manualText?.trim() || s?.transcriptText?.trim() || s?.text?.trim() || '';
      const generated = await generatePromptForScene(sceneIdx, script, '', undefined);
      if (!generated) return; // prompt generation failed, stop
      finalPrompt = generated;
    }

    setGenerating(prev => ({ ...prev, [sceneIdx]: true }));
    try {
      const res = await fetch(`/api/projects/${id}/scenes/${sceneIdx}/generate-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoPrompt: finalPrompt, model, audio, scriptType, ...(durationOverride ? { duration: durationOverride } : {}) }),
      });
      const data = await res.json();
      if (data.ok) {
        setScenes(prev => {
          const u = [...prev];
          // Keep videoHistory intact — videoFile:null just means "new one generating"
          u[sceneIdx] = { ...u[sceneIdx], videoStatus:'generating', videoRequestId:data.requestId, videoPrompt:data.videoPrompt, videoModel:model, videoAudio:audio, scriptType, videoFile:null, videoError:null, videoHistory: u[sceneIdx].videoHistory ?? [] };
          return u;
        });
      } else {
        alert(`Fehler bei Szene ${sceneIdx + 1}: ${data.error}`);
        setScenes(prev => { const u=[...prev]; u[sceneIdx]={...u[sceneIdx],videoStatus:'error',videoError:data.error}; return u; });
      }
    } catch (err) {
      alert(`Fehler: ${err.message}`);
    } finally {
      setGenerating(prev => ({ ...prev, [sceneIdx]: false }));
    }
  }, [id, scenes, generatePromptForScene]);

  // Reset a stuck/errored scene back to pending
  const resetScene = useCallback(async (sceneIdx) => {
    try {
      await fetch(`/api/projects/${id}/scenes/${sceneIdx}/update-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoStatus: null, videoRequestId: null, videoError: null, videoFile: null }),
      });
    } catch {}
    setScenes(prev => {
      const u = [...prev];
      u[sceneIdx] = { ...u[sceneIdx], videoStatus: null, videoRequestId: null, videoError: null, videoFile: null };
      return u;
    });
  }, [id]);

  // Generate all videos
  const generateAll = useCallback(async () => {
    setGeneratingAll(true);
    const pending = scenes.map((s,i)=>i).filter(i => scenes[i].imageFile && scenes[i].videoStatus !== 'generating' && scenes[i].videoStatus !== 'done');
    for (const idx of pending) {
      const sceneAudio = scenes[idx].videoAudio !== false ? selectedAudio : false;
      const sceneType  = scenes[idx].scriptType ?? 'spoken';
      await generateVideo(idx, scenes[idx].videoPrompt || '', scenes[idx].videoModel ?? selectedModel, sceneAudio, sceneType);
      await new Promise(r => setTimeout(r, 1500));
    }
    setGeneratingAll(false);
  }, [scenes, generateVideo, selectedModel]);

  if (!project) {
    return (
      <div style={{ minHeight:'100vh', background:T.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ width:32, height:32, borderRadius:'50%', border:`3px solid ${T.border}`, borderTopColor:T.accent, animation:'spin .7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform:rotate(360deg); } }`}</style>
      </div>
    );
  }

  const setup           = project.setup ?? {};
  const doneCount       = scenes.filter(s => s.videoStatus === 'done').length;
  const generatingCount = scenes.filter(s => s.videoStatus === 'generating').length;
  const pendingCount    = scenes.filter(s => s.imageFile && s.videoStatus !== 'done' && s.videoStatus !== 'generating').length;
  const withImageCount  = scenes.filter(s => s.imageFile).length;

  return (
    <>
      <Head><title>Videos — Herr Tech</title></Head>
      <style>{`
        @keyframes spin   { to { transform:rotate(360deg); } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
        * { box-sizing:border-box; }
        textarea, input { font-family:inherit; }
      `}</style>

      <div style={{ minHeight:'100vh', background:T.bg }}>
        {/* Nav */}
        <nav style={{ padding:'0 40px', height:64, borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, background:T.bg, zIndex:100 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <img src="/herr-tech-logo.png" alt="HERR TECH" style={{ height:18, objectFit:'contain' }} />
            <span style={{ color:T.muted, fontSize:13 }}>/ videos</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            {setup.format && <Pill>{setup.format}</Pill>}
            {generatingCount > 0 && (
              <span style={{ fontSize:12, color:T.accent, display:'inline-flex', alignItems:'center', gap:5 }}>
                <span style={{ width:8, height:8, borderRadius:'50%', border:`1.5px solid ${T.accent}`, borderTopColor:'transparent', display:'inline-block', animation:'spin .7s linear infinite' }} />
                {generatingCount} läuft…
              </span>
            )}
            {doneCount > 0 && <span style={{ fontSize:12, color:T.muted }}>{doneCount}/{scenes.length} fertig</span>}
            <button onClick={() => router.push('/projects')} style={{ background:'none', border:`1px solid ${T.border}`, borderRadius:9999, color:T.muted, fontSize:12, padding:'5px 14px', cursor:'pointer' }}>Projekte</button>
          </div>
        </nav>

        {/* Breadcrumb */}
        <Breadcrumb projectId={id} router={router} />

        <main style={{ maxWidth:1240, margin:'0 auto', padding:'32px 24px 80px' }}>
          {/* Header */}
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20, gap:20, flexWrap:'wrap' }}>
            <div>
              <h1 style={{ fontSize:32, fontWeight:900, margin:'0 0 6px', letterSpacing:'-1px', color:T.text }}>Videos generieren</h1>
              <p style={{ color:T.muted, fontSize:14, margin:0 }}>
                KI erstellt automatisch einen Video-Prompt aus deinem Bild & Skript · wähle Kling oder Veo3 · starte einzeln oder alle auf einmal · überprüfe & regeneriere bei Bedarf.
              </p>
            </div>
            {/* Status box */}
            <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:12, padding:'12px 20px', textAlign:'center' }}>
              <div style={{ display:'flex', alignItems:'baseline', justifyContent:'center', gap:4, lineHeight:1 }}>
                <span style={{ fontSize:28, fontWeight:900, color:T.accent }}>{doneCount}</span>
                <span style={{ fontSize:16, fontWeight:400, color:T.muted }}>/{scenes.length}</span>
              </div>
              <div style={{ fontSize:11, color:T.muted, marginTop:4 }}>generiert</div>
            </div>
          </div>

          {/* Batch actions row — left: actions, right: Weiter button */}
          {withImageCount > 0 && (
            <div style={{ display:'flex', gap:10, marginBottom:20, flexWrap:'wrap', alignItems:'center' }}>
              {/* Alle Prompts erstellen */}
              <button
                onClick={generateAllPrompts}
                disabled={genAllPrompts}
                style={{
                  background: genAllPrompts ? T.accentBg : 'rgba(181,152,226,0.12)',
                  border: `1px solid ${T.accentBrd}`, borderRadius:9999,
                  color: T.accent, fontWeight:700, fontSize:13, padding:'8px 20px',
                  cursor: genAllPrompts ? 'not-allowed' : 'pointer',
                  display:'inline-flex', alignItems:'center', gap:8, transition:'all .15s',
                }}>
                {genAllPrompts
                  ? <><span style={{ width:12, height:12, borderRadius:'50%', border:`2px solid ${T.accentBrd}`, borderTopColor:T.accent, display:'inline-block', animation:'spin .7s linear infinite' }} /> Erstelle Prompts…</>
                  : `✨ Alle Prompts erstellen (${withImageCount})`}
              </button>

              {/* Global model + audio selector */}
              <ModelToggle value={selectedModel} onChange={setGlobalModel} size="md" />
              <AudioToggle value={selectedAudio} onChange={setGlobalAudio} size="md" />

              {/* Alle Videos erstellen */}
              {pendingCount > 0 && (
                <button
                  onClick={generateAll}
                  disabled={generatingAll || generatingCount > 0}
                  style={{
                    background: (generatingAll || generatingCount > 0) ? T.accentBg : `linear-gradient(135deg, ${T.accent}, #8b68d4)`,
                    border: `1px solid ${T.accent}`, borderRadius:9999,
                    color:'#fff', fontWeight:700, fontSize:13, padding:'8px 20px',
                    cursor:(generatingAll || generatingCount > 0) ? 'not-allowed' : 'pointer',
                    display:'inline-flex', alignItems:'center', gap:8, transition:'all .15s',
                  }}>
                  {(generatingAll || generatingCount > 0)
                    ? <><span style={{ width:12, height:12, borderRadius:'50%', border:`2px solid rgba(255,255,255,.3)`, borderTopColor:'#fff', display:'inline-block', animation:'spin .7s linear infinite' }} /> Wird gestartet…</>
                    : <>⚡ Alle Videos erstellen <span style={{ fontWeight:400, fontSize:11, opacity:.75 }}>({pendingCount} ausstehend)</span></>}
                </button>
              )}

              {/* Spacer + Weiter → Export rechts */}
              <div style={{ marginLeft:'auto' }}>
                {doneCount > 0 && (
                  <button
                    onClick={() => router.push(`/export/${id}`)}
                    style={{ background:`linear-gradient(135deg, ${T.accent}, #8b68d4)`, border:`1px solid ${T.accent}`, borderRadius:9999, color:'#fff', fontWeight:700, fontSize:13, padding:'8px 20px', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:7 }}>
                    Weiter → Export
                  </button>
                )}
              </div>
            </div>
          )}

          {doneCount === scenes.length && scenes.length > 0 && (
            <p style={{ fontSize:13, color:T.green, marginBottom:16 }}>✓ Alle Videos generiert</p>
          )}

          {/* No images */}
          {withImageCount === 0 && (
            <div style={{ textAlign:'center', padding:'60px 20px', color:T.muted }}>
              <div style={{ fontSize:48, marginBottom:12, opacity:.2 }}>🖼</div>
              <div style={{ fontSize:16, marginBottom:8, color:T.subtle }}>Noch keine Bilder vorhanden</div>
              <button onClick={() => router.push(`/scenes/${id}`)} style={{ background:`linear-gradient(135deg, ${T.accent}, #8b68d4)`, border:'none', borderRadius:9999, color:'#fff', fontWeight:700, fontSize:13, padding:'9px 22px', cursor:'pointer', marginTop:8 }}>
                ← Zu den Bildern
              </button>
            </div>
          )}

          {/* Scene cards */}
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {scenes.map((scene, i) => (
              <div key={`${scene.start}-${scene.end}-${i}`} style={{ animation:'fadeIn .2s' }}>
                <SceneVideoCard
                  scene={scene}
                  sceneIdx={i}
                  projectId={id}
                  onGenerate={generateVideo}
                  onGeneratePrompt={generatePromptForScene}
                  onReset={resetScene}
                  onUpdate={() => fetch(`/api/projects/${id}`).then(r=>r.json()).then(d=>setScenes(d.scenes||[]))}
                  generating={!!generating[i]}
                  generatingPrompt={!!genPrompt[i]}
                  selectedModel={selectedModel}
                  selectedAudio={selectedAudio}
                />
              </div>
            ))}
          </div>

          {/* Bottom navigation */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:32, paddingTop:16, borderTop:`1px solid ${T.border}` }}>
            <button
              onClick={() => router.push(`/scenes/${id}`)}
              style={{ background:'none', border:`1px solid ${T.border}`, borderRadius:9999, color:T.muted, fontSize:13, fontWeight:700, padding:'8px 20px', cursor:'pointer' }}>
              ← Zurück zu Bilder
            </button>
            {doneCount > 0 && (
              <button
                onClick={() => router.push(`/export/${id}`)}
                style={{ background:`linear-gradient(135deg, ${T.accent}, #8b68d4)`, border:`1px solid ${T.accent}`, borderRadius:9999, color:'#fff', fontWeight:700, fontSize:13, padding:'10px 28px', cursor:'pointer', boxShadow:`0 0 20px rgba(181,152,226,0.3)` }}>
                Weiter → Export 🎬
              </button>
            )}
          </div>
        </main>
      </div>
    </>
  );
}
