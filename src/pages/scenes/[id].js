import { useState, useEffect, useCallback, useRef } from 'react';
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
};

function fmt(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function ScenesPage() {
  const router = useRouter();
  const { id } = router.query;
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [generatingAll, setGeneratingAll] = useState(false);
  const [generateAllProgress, setGenerateAllProgress] = useState(null); // {done, total}
  const [approvingAll, setApprovingAll] = useState(false);
  // Global style for batch generation
  const [globalStyleText, setGlobalStyleText] = useState('');
  const [showGlobalStyle, setShowGlobalStyle] = useState(false);
  // Setup inline editing (persisted to server)
  const [setupFormat, setSetupFormat] = useState('9:16');
  const [setupStyleDesc, setSetupStyleDesc] = useState('');
  const [setupStyleDev, setSetupStyleDev] = useState(3);
  const [setupStyleImagePreview, setSetupStyleImagePreview] = useState(null);
  const [setupStyleImageUploading, setSetupStyleImageUploading] = useState(false);
  const setupStyleInputRef = useRef(null);
  const [savingSetup, setSavingSetup] = useState(false);
  const setupInitializedRef = useRef(false);
  // Drag & drop reorder
  const [dragFromIdx, setDragFromIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);

  const reload = useCallback(() => {
    if (!id) return;
    fetch(`/api/projects/${id}`)
      .then(r => r.json())
      .then(p => { setProject(p); setLoading(false); })
      .catch(() => { setError('Projekt konnte nicht geladen werden.'); setLoading(false); });
  }, [id]);

  useEffect(() => { reload(); }, [reload]);

  // Initialize setup fields once from project data
  useEffect(() => {
    if (!project || setupInitializedRef.current) return;
    setupInitializedRef.current = true;
    if (project.setup) {
      setSetupFormat(project.setup.format ?? '9:16');
      setSetupStyleDesc(project.setup.styleDescription ?? '');
      setSetupStyleDev(project.setup.styleDeviation ?? 3);
      if (project.setup.styleImageFile) {
        setSetupStyleImagePreview(`/api/projects/${project.id}/media/${project.setup.styleImageFile}`);
      }
    }
  }, [project]);

  async function saveSetup() {
    setSavingSetup(true);
    try {
      await fetch(`/api/projects/${id}/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: setupFormat, styleDescription: setupStyleDesc, styleDeviation: setupStyleDev }),
      });
    } catch (e) { console.error('[saveSetup]', e); }
    setSavingSetup(false);
  }

  async function uploadSetupStyleImage(file) {
    setSetupStyleImageUploading(true);
    try {
      // Preview immediately
      const reader = new FileReader();
      reader.onload = ev => setSetupStyleImagePreview(ev.target.result);
      reader.readAsDataURL(file);
      // Upload to server
      const form = new FormData();
      form.append('image', file);
      const res = await fetch(`/api/projects/${id}/upload-style`, { method: 'POST', body: form });
      const data = await res.json();
      if (res.ok) setSetupStyleImagePreview(`/api/projects/${id}/media/${data.styleImageFile}`);
    } catch (e) { console.error('[uploadSetupStyleImage]', e); }
    setSetupStyleImageUploading(false);
  }

  if (loading) return <Screen><p style={{ color: T.muted }}>Lade Szenen…</p></Screen>;
  if (error)   return <Screen><p style={{ color: T.red }}>⚠ {error}</p></Screen>;
  if (!project) return <Screen><p style={{ color: T.muted }}>Nicht gefunden.</p></Screen>;

  const { scenes = [], setup } = project;
  const approvedCount  = scenes.filter(s => s.imageApproved).length;
  const withImageCount = scenes.filter(s => s.imageFile).length;
  const pendingGenCount = scenes.filter(s => !s.imageFile).length;
  const pendingApproveCount = scenes.filter(s => s.imageFile && !s.imageApproved).length;

  async function generateAll() {
    const pending = scenes.filter(s => !s.imageFile);
    if (!pending.length) return;
    setGeneratingAll(true);
    setGenerateAllProgress({ done: 0, total: pending.length });

    for (let i = 0; i < pending.length; i++) {
      const scene = pending[i];
      try {
        await fetch(`/api/projects/${id}/scenes/${scene.id}/generate-image`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            manualSceneInput: scene.manual ? (scene.manualInput ?? scene.text ?? null) : null,
            globalStyleText: globalStyleText.trim() || null,
          }),
        });
      } catch (e) { console.error('[generateAll] Szene', scene.id, e); }
      setGenerateAllProgress({ done: i + 1, total: pending.length });
    }
    setGeneratingAll(false);
    setGenerateAllProgress(null);
    reload();
  }

  async function reorderScene(fromIdx, toIdx) {
    if (fromIdx === toIdx) return;
    try {
      await fetch(`/api/projects/${id}/scenes/reorder`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromIdx, toIdx }),
      });
      reload();
    } catch (e) { console.error('[reorder]', e); }
  }

  async function approveAll() {
    const pending = scenes.filter(s => s.imageFile && !s.imageApproved);
    if (!pending.length) return;
    setApprovingAll(true);
    for (const scene of pending) {
      try {
        await fetch(`/api/projects/${id}/scenes/${scene.id}/approve-image`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ approved: true }),
        });
      } catch (e) { console.error('[approveAll] Szene', scene.id, e); }
    }
    setApprovingAll(false);
    reload();
  }

  return (
    <>
      <Head><title>Szenen — Herr Tech</title></Head>
      <style>{`
        @keyframes spin   { to { transform:rotate(360deg); } }
        @keyframes fadeIn { from { opacity:0;transform:translateY(6px); } to { opacity:1;transform:none; } }
        * { box-sizing:border-box; }
        textarea,input { font-family:inherit; }
      `}</style>

      <div style={{ minHeight:'100vh', background:T.bg }}>
        {/* Nav */}
        <nav style={{ padding:'0 40px', height:64, borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, background:T.bg, zIndex:100 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <img src="/herr-tech-logo.png" alt="HERR TECH" style={{ height:18, objectFit:'contain' }} />
            <span style={{ color:T.muted, fontSize:13 }}>/ szenen</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            {setup && <><Pill>{setup.format ?? setupFormat}</Pill><Pill>{setup.subtitleLanguage?.toUpperCase()}</Pill></>}
            {!setup && <Pill>{setupFormat}</Pill>}
            {withImageCount > 0 && <span style={{ fontSize:12, color:T.muted }}>{approvedCount}/{scenes.length} freigegeben</span>}
            <button onClick={() => router.push('/projects')} style={{ background:'none', border:`1px solid ${T.border}`, borderRadius:9999, color:T.muted, fontSize:12, padding:'5px 14px', cursor:'pointer' }}>Projekte</button>
          </div>
        </nav>

        {/* Breadcrumb */}
        <Breadcrumb active={1} projectId={id} router={router} />

        <main style={{ maxWidth:1200, margin:'0 auto', padding:'32px 24px 80px' }}>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24, gap:20, flexWrap:'wrap' }}>
            <div>
              <h1 style={{ fontSize:32, fontWeight:900, margin:'0 0 8px', letterSpacing:'-1px', color:T.text }}>{scenes.length} Szene{scenes.length!==1?'n':''}</h1>
              <p style={{ color:T.muted, fontSize:14, margin:0 }}>Wähle einen Screenshot als Vorlage · passe Stil & Skript an · generiere das KI-Bild pro Szene · gib es frei für die Videogenerierung.</p>
            </div>
            <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
              {withImageCount > 0 && <StatBox value={withImageCount} label="generiert" color={T.accent} bg={T.accentBg} border={T.accentBrd} />}
              {approvedCount  > 0 && <StatBox value={approvedCount}  label="freigegeben" color={T.green} bg={T.greenBg} border={T.greenBrd} />}
            </div>
          </div>

          {/* Batch-Aktionen */}
          <div style={{ marginBottom:16 }}>
            {/* Buttons row */}
            <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center', marginBottom: (pendingGenCount > 0 || showGlobalStyle) ? 10 : 0 }}>
              {/* Global style toggle — always leftmost */}
              <button
                onClick={() => setShowGlobalStyle(v => !v)}
                style={{ background: showGlobalStyle ? T.accentBg : `linear-gradient(135deg, #3a2f52, #2a2040)`, border:`1px solid ${showGlobalStyle ? T.accentBrd : T.accentBrd}`, borderRadius:9999, color: showGlobalStyle ? T.accent : T.accent, fontWeight:700, fontSize:13, padding:'8px 18px', cursor:'pointer', display:'flex', alignItems:'center', gap:7, transition:'all .15s' }}
                title="Gestaltungsvorgaben für alle Generierungen">
                🎨 Stil-Vorgaben{(globalStyleText.trim() || setupStyleDesc.trim() || setupStyleImagePreview) ? ' ✓' : ''}
              </button>

              {pendingGenCount > 0 && (
                <button
                  onClick={generateAll}
                  disabled={generatingAll || approvingAll}
                  style={{
                    background: generatingAll ? T.accentBg : `linear-gradient(135deg, ${T.accent}, #8b68d4)`,
                    border: `1px solid ${T.accentBrd}`,
                    borderRadius:9999, color: generatingAll ? T.accent : '#000',
                    fontWeight:700, fontSize:13, padding:'8px 18px', cursor: generatingAll ? 'default' : 'pointer',
                    display:'flex', alignItems:'center', gap:7, transition:'all .15s', opacity: generatingAll ? 0.8 : 1,
                  }}>
                  {generatingAll ? (
                    <>
                      <span style={{ width:13, height:13, border:`2px solid ${T.accent}`, borderTopColor:'transparent', borderRadius:'50%', display:'inline-block', animation:'spin 0.8s linear infinite' }} />
                      {generateAllProgress ? `${generateAllProgress.done}/${generateAllProgress.total} generiert…` : 'Generiere…'}
                    </>
                  ) : (
                    <>⚡ Alle generieren <span style={{ fontWeight:400, fontSize:11, opacity:0.75 }}>({pendingGenCount} offen)</span></>
                  )}
                </button>
              )}
              {pendingApproveCount > 0 && (
                <button
                  onClick={approveAll}
                  disabled={approvingAll || generatingAll}
                  style={{
                    background: approvingAll ? T.greenBg : `linear-gradient(135deg, ${T.green}, #16a34a)`,
                    border: `1px solid ${T.greenBrd}`,
                    borderRadius:9999, color: approvingAll ? T.green : '#000',
                    fontWeight:700, fontSize:13, padding:'8px 18px', cursor: approvingAll ? 'default' : 'pointer',
                    display:'flex', alignItems:'center', gap:7, transition:'all .15s',
                  }}>
                  {approvingAll ? (
                    <>
                      <span style={{ width:13, height:13, border:`2px solid ${T.green}`, borderTopColor:'transparent', borderRadius:'50%', display:'inline-block', animation:'spin 0.8s linear infinite' }} />
                      Freigeben…
                    </>
                  ) : (
                    <>✓ Alle freigeben <span style={{ fontWeight:400, fontSize:11, opacity:0.75 }}>({pendingApproveCount} offen)</span></>
                  )}
                </button>
              )}
              {pendingGenCount === 0 && pendingApproveCount === 0 && withImageCount > 0 && (
                <span style={{ fontSize:12, color:T.green }}>✓ Alle Bilder generiert &amp; freigegeben</span>
              )}
              {withImageCount > 0 && (
                <button
                  onClick={() => router.push(`/videos/${id}`)}
                  style={{ marginLeft:'auto', background:`linear-gradient(135deg, ${T.accent}, #8b68d4)`, border:`1px solid ${T.accent}`, borderRadius:9999, color:'#fff', fontWeight:700, fontSize:13, padding:'8px 20px', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:7 }}>
                  Weiter → Videos
                </button>
              )}
            </div>

            {/* Stil-Vorgaben panel */}
            {showGlobalStyle && (
              <div style={{ background:'rgba(181,152,226,0.05)', border:`1px solid ${T.accentBrd}`, borderRadius:14, padding:'16px 18px', animation:'fadeIn .2s' }}>

                {/* ── Section 1: Projekt-Einstellungen (persistent) ── */}
                <div style={{ fontSize:10, fontWeight:700, color:T.accent, letterSpacing:'0.5px', textTransform:'uppercase', marginBottom:10 }}>
                  ⚙️ Projekt-Einstellungen <span style={{ color:T.muted, fontWeight:400, textTransform:'none', fontSize:10, letterSpacing:0 }}>— gespeichert, gelten für jede Generierung</span>
                </div>

                {/* Format */}
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
                  <span style={{ fontSize:11, fontWeight:700, color:T.muted, minWidth:56 }}>Format</span>
                  {['9:16', '16:9'].map(f => (
                    <button key={f} onClick={() => setSetupFormat(f)}
                      style={{ padding:'4px 16px', borderRadius:9999, border:`1px solid ${setupFormat===f ? T.accent : T.border}`, background: setupFormat===f ? T.accentBg : 'transparent', color: setupFormat===f ? T.accent : T.muted, fontSize:12, fontWeight:700, cursor:'pointer', transition:'all .15s' }}>
                      {f === '9:16' ? '9:16 (Reels/TikTok)' : '16:9 (YouTube)'}
                    </button>
                  ))}
                </div>

                {/* Style image + description + intensity */}
                <div style={{ display:'flex', gap:12, alignItems:'flex-start', marginBottom:12 }}>
                  <div>
                    <div
                      onClick={() => setupStyleInputRef.current?.click()}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith('image/')) uploadSetupStyleImage(f); }}
                      style={{ width:72, height:72, borderRadius:10, border:`2px dashed ${setupStyleImagePreview ? T.accentBrd : T.border}`, background: setupStyleImagePreview ? 'transparent' : T.subtle, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', overflow:'hidden', flexShrink:0, position:'relative', transition:'border-color .15s' }}>
                      {setupStyleImageUploading
                        ? <div style={{ width:18, height:18, border:`2px solid ${T.accent}`, borderTopColor:'transparent', borderRadius:'50%', animation:'spin .7s linear infinite' }} />
                        : setupStyleImagePreview
                          ? <img src={setupStyleImagePreview} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                          : <div style={{ textAlign:'center' }}><div style={{ fontSize:18, marginBottom:2 }}>🖼</div><div style={{ fontSize:8, color:T.muted }}>Stil-Bild</div></div>
                      }
                      <input ref={setupStyleInputRef} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) uploadSetupStyleImage(f); }} />
                    </div>
                    {setupStyleImagePreview && (
                      <button onClick={() => setSetupStyleImagePreview(null)}
                        style={{ width:'100%', marginTop:4, background:'none', border:'none', color:'#444', cursor:'pointer', fontSize:10 }}
                        onMouseEnter={e => e.currentTarget.style.color = T.red}
                        onMouseLeave={e => e.currentTarget.style.color = '#444'}>✕ entfernen</button>
                    )}
                  </div>
                  <div style={{ flex:1 }}>
                    <textarea
                      value={setupStyleDesc}
                      onChange={e => setSetupStyleDesc(e.target.value)}
                      rows={2}
                      placeholder="Basis-Stil — z.B. 'Pixar 3D Animation, warme Farben, cinematic lighting, konsistenter Look'"
                      style={{ width:'100%', background:T.surface, border:`1px solid ${T.border}`, borderRadius:9, color:T.text, padding:'8px 12px', fontSize:12, resize:'none', outline:'none', lineHeight:1.5 }}
                      onFocus={e => e.target.style.borderColor = T.accent}
                      onBlur={e => e.target.style.borderColor = T.border}
                    />
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:6 }}>
                      {setupStyleDesc.trim() && (<>
                        <span style={{ fontSize:11, color:T.muted, flexShrink:0 }}>Intensität:</span>
                        {[1,2,3,4,5].map(v => (
                          <button key={v} onClick={() => setSetupStyleDev(v)}
                            style={{ width:26, height:26, borderRadius:'50%', border:`1px solid ${setupStyleDev === v ? T.accent : T.border}`, background: setupStyleDev === v ? T.accentBg : 'transparent', color: setupStyleDev === v ? T.accent : T.muted, fontSize:11, fontWeight:700, cursor:'pointer', transition:'all .1s', padding:0 }}>
                            {v}
                          </button>
                        ))}
                        <span style={{ fontSize:11, color:T.accent, marginLeft:2 }}>
                          — {['', 'Sehr dezent', 'Dezent', 'Ausgewogen', 'Stark', 'Dominant'][setupStyleDev]}
                        </span>
                      </>)}
                      <div style={{ flex:1 }} />
                      <button onClick={saveSetup} disabled={savingSetup}
                        style={{ background: T.accent, border:'none', borderRadius:9999, color:'#000', fontSize:11, fontWeight:700, padding:'4px 14px', cursor: savingSetup ? 'default' : 'pointer', opacity: savingSetup ? 0.7 : 1 }}>
                        {savingSetup ? '…' : '💾 Speichern'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Divider */}
                <div style={{ borderTop:`1px solid ${T.border}`, margin:'12px 0' }} />

                {/* ── Section 2: Batch-Anpassung (non-persistent) ── */}
                <div style={{ fontSize:10, fontWeight:700, color:T.accent, letterSpacing:'0.5px', textTransform:'uppercase', marginBottom:8 }}>
                  🎨 Anpassung für diese Generierung <span style={{ color:T.muted, fontWeight:400, textTransform:'none', fontSize:10, letterSpacing:0 }}>— nur für „Alle generieren", nicht gespeichert</span>
                </div>
                <textarea
                  value={globalStyleText}
                  onChange={e => setGlobalStyleText(e.target.value)}
                  rows={2}
                  placeholder="Zusätzliche Anpassung — z.B. 'Hintergrund dunkler, mehr Kontrast, dramatische Beleuchtung'"
                  style={{ width:'100%', background:T.surface, border:`1px solid ${T.border}`, borderRadius:9, color:T.text, padding:'9px 12px', fontSize:13, resize:'none', outline:'none', lineHeight:1.5 }}
                  onFocus={e => e.target.style.borderColor = T.accent}
                  onBlur={e => e.target.style.borderColor = T.border}
                />
              </div>
            )}
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:0, animation:'fadeIn .3s' }}>
            {/* Empty state for manual projects */}
            {scenes.length === 0 && (
              <div style={{ textAlign:'center', padding:'60px 24px', color:T.muted }}>
                <div style={{ fontSize:40, marginBottom:12 }}>✍️</div>
                <div style={{ fontSize:16, fontWeight:700, color:T.text, marginBottom:8 }}>Noch keine Szenen</div>
                <div style={{ fontSize:13, lineHeight:1.6 }}>Klicke auf „+ Szene einfügen" um deine erste Szene manuell hinzuzufügen.</div>
              </div>
            )}
            {/* "+ Szene" vor der ersten Szene */}
            <InsertBar insertAfterIndex={-1} projectId={id} onInserted={reload} scenes={scenes} />
            {scenes.map((scene, idx) => (
              <div key={`${scene.start}-${scene.end}`}
                draggable
                onDragStart={() => setDragFromIdx(idx)}
                onDragEnd={() => { if (dragFromIdx !== null && dragOverIdx !== null && dragFromIdx !== dragOverIdx) { reorderScene(dragFromIdx, dragOverIdx); } setDragFromIdx(null); setDragOverIdx(null); }}
                onDragOver={e => { e.preventDefault(); setDragOverIdx(idx); }}
                onDragLeave={() => setDragOverIdx(null)}
                style={{ opacity: dragFromIdx === idx ? 0.4 : 1, transition:'opacity .15s', outline: dragOverIdx === idx && dragFromIdx !== idx ? `2px solid ${T.accentBrd}` : 'none', borderRadius:18 }}>
                <SceneCard
                  scene={scene}
                  projectId={id}
                  format={setup?.format ?? setupFormat ?? '9:16'}
                  onUpdate={reload}
                  prevScene={scenes[idx - 1] ?? null}
                  nextScene={scenes[idx + 1] ?? null}
                  projectCharacters={project.characters ?? []}
                />
                {/* "+ Szene" nach jeder Szene */}
                <InsertBar insertAfterIndex={idx} projectId={id} onInserted={reload} scenes={scenes} />
              </div>
            ))}
          </div>

          {/* Bottom navigation */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:32, paddingTop:16, borderTop:`1px solid ${T.border}` }}>
            <button
              onClick={() => router.push('/')}
              style={{ background:'none', border:`1px solid ${T.border}`, borderRadius:9999, color:T.muted, fontSize:13, fontWeight:700, padding:'8px 20px', cursor:'pointer' }}>
              ← Zurück zum Upload
            </button>
            {withImageCount > 0 && (
              <button
                onClick={() => router.push(`/videos/${id}`)}
                style={{ background:`linear-gradient(135deg, ${T.accent}, #8b68d4)`, border:`1px solid ${T.accent}`, borderRadius:9999, color:'#fff', fontWeight:700, fontSize:13, padding:'8px 20px', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:7 }}>
                Weiter → Videos
              </button>
            )}
          </div>
        </main>
      </div>
    </>
  );
}

/* ── SceneCard ─────────────────────────────────────────────── */
function SceneCard({ scene, projectId, format, onUpdate, prevScene = null, nextScene = null, projectCharacters = [] }) {
  const [generating, setGenerating]       = useState(scene.imageStatus === 'generating');
  const bgPollRef = useRef(null);
  const [approving, setApproving]         = useState(false);
  const [selecting, setSelecting]         = useState(false);
  const [savingChar, setSavingChar]       = useState(false);
  const [charPanelChars, setCharPanelChars] = useState(null);
  const [savingText, setSavingText]       = useState(false);
  const [showPrompt, setShowPrompt]       = useState(false);
  const [showCharPanel, setShowCharPanel] = useState(false);
  const [editingText, setEditingText]     = useState(false);
  const [customPrompt, setCustomPrompt]   = useState('');
  const [editedText, setEditedText]       = useState(scene.text ?? '');
  const [sceneAdjustment, setSceneAdjustment] = useState(scene.sceneAdjustment ?? '');
  const adjustSaveTimer = useRef(null);
  const [useScreenshotRef, setUseScreenshotRef] = useState(true);
  const [err, setErr]                     = useState('');
  const [promptLoading, setPromptLoading] = useState(false);
  // Split-Szene State
  const [splitFor, setSplitFor]           = useState(null);
  const [splitStart, setSplitStart]       = useState('');
  const [splitEnd, setSplitEnd]           = useState('');
  const [splitting, setSplitting]         = useState(false);
  // Adjustment image
  const [adjustImageFile, setAdjustImageFile] = useState(null);
  const [adjustImagePreview, setAdjustImagePreview] = useState(null);
  // Manual scene input (what to generate)
  const [manualInput, setManualInput]     = useState(scene.manualInput ?? '');
  const [savingManualInput, setSavingManualInput] = useState(false);
  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting]           = useState(false);
  // Timestamp editing
  const [editingTimes, setEditingTimes]   = useState(false);
  const [editStart, setEditStart]         = useState(String(scene.start));
  const [editEnd, setEditEnd]             = useState(String(scene.end));
  const [savingTimes, setSavingTimes]     = useState(false);
  // Image history navigation
  const [historyIdx, setHistoryIdx]       = useState(null); // null = latest
  // Custom image upload (right panel)
  const [uploadingCustom, setUploadingCustom] = useState(false);
  const customUploadRef = useRef(null);
  // Lightbox
  const [lightboxOpen, setLightboxOpen]   = useState(false);
  const [lightboxIdx, setLightboxIdx]     = useState(0);
  // External ref (prev/next scene image selected as reference)
  const [selectedExternalRef, setSelectedExternalRef] = useState(null); // { projectId, imageFile, url, label }

  const rawScreenshots = scene.screenshotFiles ?? (scene.screenshotFile
    ? [`${scene.screenshotFile.replace('.jpg','')}_a.jpg`, `${scene.screenshotFile.replace('.jpg','')}_b.jpg`, `${scene.screenshotFile.replace('.jpg','')}_c.jpg`]
    : [`scene_${scene.id}_a.jpg`, `scene_${scene.id}_b.jpg`, `scene_${scene.id}_c.jpg`]);
  // Deduplicate screenshots (split scenes inherit the same file 1x)
  const screenshots = [...new Set(rawScreenshots)];
  const selected = scene.selectedScreenshot ?? screenshots[1] ?? screenshots[0];
  // Image history — newest last
  const imageHistory = scene.imageHistory ?? (scene.imageFile ? [scene.imageFile] : []);
  const displayHistIdx = historyIdx !== null ? historyIdx : imageHistory.length - 1;
  const displayImageFile = imageHistory[displayHistIdx] ?? null;
  const imageUrl = displayImageFile
    ? `/api/projects/${projectId}/media/generated-images/${displayImageFile}`
    : null;
  const isViewingOldImage = displayHistIdx < imageHistory.length - 1;
  const duration = (scene.end - scene.start).toFixed(1);

  // Keyboard navigation for lightbox
  useEffect(() => {
    if (!lightboxOpen) return;
    const handler = (e) => {
      if (e.key === 'Escape') setLightboxOpen(false);
      if (e.key === 'ArrowLeft')  setLightboxIdx(i => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setLightboxIdx(i => Math.min(imageHistory.length - 1, i + 1));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightboxOpen, imageHistory.length]);

  // If scene was generating when we mounted (navigated back), poll until done
  useEffect(() => {
    if (!generating) {
      if (bgPollRef.current) { clearInterval(bgPollRef.current); bgPollRef.current = null; }
      return;
    }
    if (bgPollRef.current) return; // already polling
    bgPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}`);
        const data = await res.json();
        const sceneIdx = parseInt(scene.id, 10);
        const fresh = data.scenes?.[sceneIdx];
        // imageStatus cleared = generation finished (success or error)
        if (fresh && fresh.imageStatus !== 'generating') {
          clearInterval(bgPollRef.current);
          bgPollRef.current = null;
          setGenerating(false);
          onUpdate();
        }
      } catch {}
    }, 3000);
    return () => { if (bgPollRef.current) { clearInterval(bgPollRef.current); bgPollRef.current = null; } };
  }, [generating]);

  // Referenzbilder immer im Hochformat (9:16) — unabhängig vom Ausgabeformat
  const thumbAspect = '9 / 16';
  const screenshotColWidth = 260;

  async function selectScreenshot(file) {
    if (file === selected || selecting) return;
    setSelecting(true);
    try {
      await fetch(`/api/projects/${projectId}/scenes/${scene.id}/select-screenshot`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ screenshotFile: file }),
      });
      onUpdate();
    } finally { setSelecting(false); }
  }

  async function saveText() {
    setSavingText(true);
    try {
      await fetch(`/api/projects/${projectId}/scenes/${scene.id}/update-text`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: editedText }),
      });
      setEditingText(false);
      onUpdate();
    } catch (e) { setErr(e.message); }
    finally { setSavingText(false); }
  }

  async function saveManualInput() {
    setSavingManualInput(true);
    try {
      await fetch(`/api/projects/${projectId}/scenes/${scene.id}/update-text`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manualInput }),
      });
      onUpdate();
    } catch (e) { setErr(e.message); }
    finally { setSavingManualInput(false); }
  }

  async function deleteScene() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/scenes/${scene.id}/delete-scene`, { method: 'POST' });
      if (!res.ok) throw new Error('Löschen fehlgeschlagen');
      onUpdate();
    } catch (e) { setErr(e.message); setDeleting(false); }
  }

  // character saving handled by CharPanel component

  async function generatePrompt() {
    // Wenn schon ein Prompt vorhanden – einfach Editor öffnen, nicht neu generieren
    const existing = customPrompt || scene.imagePrompt;
    if (existing) {
      setCustomPrompt(existing);
      setShowPrompt(prev => !prev);
      return;
    }
    setPromptLoading(true); setErr('');
    setShowPrompt(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/scenes/${scene.id}/generate-prompt`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCustomPrompt(data.prompt);
    } catch (e) { setErr(e.message); setShowPrompt(false); }
    finally { setPromptLoading(false); }
  }

  async function regeneratePrompt() {
    setPromptLoading(true); setErr('');
    setShowPrompt(true);
    setCustomPrompt('');
    try {
      const res = await fetch(`/api/projects/${projectId}/scenes/${scene.id}/generate-prompt`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCustomPrompt(data.prompt);
    } catch (e) { setErr(e.message); }
    finally { setPromptLoading(false); }
  }

  async function generateImage() {
    setGenerating(true); setErr('');
    try {
      // Convert adjustment image to base64 if present
      let adjustmentImageBase64 = null;
      let adjustmentImageMime = null;
      if (adjustImageFile) {
        adjustmentImageBase64 = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = e => resolve(e.target.result.split(',')[1]);
          r.onerror = reject;
          r.readAsDataURL(adjustImageFile);
        });
        adjustmentImageMime = adjustImageFile.type || 'image/jpeg';
      }

      const res = await fetch(`/api/projects/${projectId}/scenes/${scene.id}/generate-image`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customPrompt: showPrompt ? (customPrompt || scene.imagePrompt || null) : null,
          sceneAdjustment: sceneAdjustment.trim() || null,
          useScreenshotRef,
          adjustmentImageBase64,
          adjustmentImageMime,
          manualSceneInput: scene.manual ? (manualInput.trim() || scene.manualInput || null) : null,
          externalRefProjectId: selectedExternalRef?.projectId ?? null,
          externalRefImageFile: selectedExternalRef?.imageFile ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Generierung fehlgeschlagen');
      if (data.imagePrompt) setCustomPrompt(data.imagePrompt);
      setShowPrompt(false);
      setHistoryIdx(null); // jump to latest after generation
      onUpdate();
    } catch (e) { setErr(e.message); }
    finally { setGenerating(false); }
  }

  async function splitScene() {
    if (!splitFor) return;
    const start = parseFloat(splitStart);
    const end = parseFloat(splitEnd);
    if (isNaN(start) || isNaN(end) || end <= start) {
      setErr('Ungültige Zeitangabe für neue Szene'); return;
    }
    setSplitting(true); setErr('');
    try {
      const res = await fetch(`/api/projects/${projectId}/scenes/${scene.id}/split-scene`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newStart: start, newEnd: end, screenshot: splitFor, trimCurrent: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Split fehlgeschlagen');
      setSplitFor(null);
      onUpdate();
    } catch (e) { setErr(e.message); }
    finally { setSplitting(false); }
  }

  async function uploadCustomImage(file) {
    if (!file || !file.type.startsWith('image/')) return;
    setUploadingCustom(true);
    try {
      const form = new FormData();
      form.append('image', file);
      const res = await fetch(`/api/projects/${projectId}/scenes/${scene.id}/upload-custom-image`, { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Upload fehlgeschlagen');
      setHistoryIdx(null); // jump to latest
      onUpdate();
    } catch (e) { setErr(e.message); }
    finally { setUploadingCustom(false); }
  }

  async function toggleApproval() {
    setApproving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/scenes/${scene.id}/approve-image`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved: !scene.imageApproved }),
      });
      if (!res.ok) throw new Error('Freigabe fehlgeschlagen');
      onUpdate();
    } catch (e) { setErr(e.message); }
    finally { setApproving(false); }
  }

  return (
    <div style={{ background:T.card, border:`1px solid ${scene.imageApproved ? 'rgba(34,197,94,0.3)' : T.border}`, borderRadius:18, overflow:'hidden', transition:'border-color .2s' }}>

      {/* ── Hauptzeile: Screenshots | Inhalt | GeneratedImg ── */}
      <div style={{ display:'flex', minHeight:180 }}>

        {/* ── Links: 3 Portrait-Screenshots nebeneinander ── */}
        <div style={{ width:screenshotColWidth, flexShrink:0, background:'#080808', borderRight:`1px solid ${T.border}`, padding:10, display:'flex', flexDirection:'column', gap:6 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:2 }}>
            <div style={{ fontSize:9, fontWeight:700, color: scene.manual ? T.accent : T.muted, letterSpacing:'0.5px', textTransform:'uppercase' }}>
              {scene.manual ? '✦ Manuelle Szene' : 'Referenz wählen'}
            </div>
            {/* Referenz-Modus Toggle */}
            <div style={{ position:'relative' }} onMouseEnter={e => e.currentTarget.querySelector('[data-tip]').style.display='block'} onMouseLeave={e => e.currentTarget.querySelector('[data-tip]').style.display='none'}>
              <button
                onClick={() => setUseScreenshotRef(v => !v)}
                style={{
                  fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:9999, cursor:'pointer', border:'none',
                  background: useScreenshotRef ? 'rgba(34,197,94,0.15)' : T.subtle,
                  color: useScreenshotRef ? T.green : T.muted,
                  transition:'all .15s', whiteSpace:'nowrap',
                }}>
                {useScreenshotRef ? '📸 Mit Referenz' : '✨ Nur Prompt'}
              </button>
              {/* Tooltip */}
              <div data-tip style={{ display:'none', position:'absolute', top:'calc(100% + 6px)', right:0, zIndex:50, width:240, background:'#1a1a1a', border:`1px solid ${T.border}`, borderRadius:10, padding:'10px 12px', fontSize:11, color:'#ccc', lineHeight:1.5, pointerEvents:'none' }}>
                {useScreenshotRef
                  ? <><span style={{ color:T.green, fontWeight:700 }}>📸 Mit Bild-Referenz</span><br />Prompt wird aus dem Screenshot und deinem Input generiert. Das ausgewählte Bild wird zusätzlich als visuelle Referenz an Imagen übergeben — das Ergebnis bleibt näher am Original.</>
                  : <><span style={{ color:T.accent, fontWeight:700 }}>✨ Nur Prompt</span><br />Prompt wird aus dem Screenshot und deinem Input erstellt. Imagen generiert das Bild aber ohne visuelle Referenz — mehr kreative Freiheit, weniger Bindung ans Original.</>
                }
              </div>
            </div>
          </div>
          {/* Manuelle Szene: Prev/Next-Bilder als Referenz + eigenes Upload */}
          {scene.manual ? (
            <div style={{ flex:1, display:'flex', gap:5, maxHeight:160, overflow:'hidden' }}>
              {/* Vorheriges Szenen-Bild */}
              {prevScene?.imageFile && (() => {
                const url = `/api/projects/${projectId}/media/generated-images/${prevScene.imageFile}`;
                const isSelected = selectedExternalRef?.imageFile === prevScene.imageFile;
                return (
                  <div
                    onClick={() => setSelectedExternalRef(isSelected ? null : { projectId, imageFile: prevScene.imageFile, url, label: '← Vorherige' })}
                    style={{ flex:1, position:'relative', borderRadius:8, overflow:'hidden', cursor:'pointer', border:`2px solid ${isSelected ? T.accent : '#1a1a1a'}`, transition:'border-color .15s' }}>
                    <div style={{ width:'100%', aspectRatio:'9/16', position:'relative', overflow:'hidden' }}>
                      <img src={url} alt="Vorherige Szene" style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }} />
                    </div>
                    <div style={{ position:'absolute', bottom:3, left:0, right:0, textAlign:'center', fontSize:8, color:'rgba(255,255,255,0.6)', fontWeight:700, background:'rgba(0,0,0,0.5)' }}>← Vorh.</div>
                    {isSelected && <div style={{ position:'absolute', top:3, right:3, background:T.accent, borderRadius:'50%', width:14, height:14, display:'flex', alignItems:'center', justifyContent:'center', fontSize:8, color:'#fff', fontWeight:900 }}>✓</div>}
                  </div>
                );
              })()}
              {/* Nächstes Szenen-Bild */}
              {nextScene?.imageFile && (() => {
                const url = `/api/projects/${projectId}/media/generated-images/${nextScene.imageFile}`;
                const isSelected = selectedExternalRef?.imageFile === nextScene.imageFile;
                return (
                  <div
                    onClick={() => setSelectedExternalRef(isSelected ? null : { projectId, imageFile: nextScene.imageFile, url, label: 'Nächste →' })}
                    style={{ flex:1, position:'relative', borderRadius:8, overflow:'hidden', cursor:'pointer', border:`2px solid ${isSelected ? T.accent : '#1a1a1a'}`, transition:'border-color .15s' }}>
                    <div style={{ width:'100%', aspectRatio:'9/16', position:'relative', overflow:'hidden' }}>
                      <img src={url} alt="Nächste Szene" style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }} />
                    </div>
                    <div style={{ position:'absolute', bottom:3, left:0, right:0, textAlign:'center', fontSize:8, color:'rgba(255,255,255,0.6)', fontWeight:700, background:'rgba(0,0,0,0.5)' }}>Nächste →</div>
                    {isSelected && <div style={{ position:'absolute', top:3, right:3, background:T.accent, borderRadius:'50%', width:14, height:14, display:'flex', alignItems:'center', justifyContent:'center', fontSize:8, color:'#fff', fontWeight:900 }}>✓</div>}
                  </div>
                );
              })()}
              {/* Eigenes Bild hochladen */}
              <div style={{ flex:1, overflow:'hidden' }}>
                <ManualRefImageUpload
                  scene={scene} projectId={projectId} onUpdate={onUpdate}
                  isSelectedAsRef={!selectedExternalRef && !!scene.refImageFile}
                  onUploadDone={() => setSelectedExternalRef(null)}
                />
              </div>
            </div>
          ) : null}

          {/* Normal scene: own ref image upload (small slot below screenshots) */}
          {!scene.manual && scene.refImageFile && (() => {
            const refUrl = `/api/projects/${projectId}/media/${scene.refImageFile}`;
            return (
              <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:3 }}>
                <div style={{ fontSize:8, color:T.accent, fontWeight:700, letterSpacing:'0.3px', textTransform:'uppercase', whiteSpace:'nowrap' }}>Eigene Ref:</div>
                <div style={{ position:'relative', width:28, height:44, borderRadius:5, overflow:'hidden', border:`1px solid ${T.accentBrd}`, flexShrink:0 }}>
                  <img src={refUrl} alt="Ref" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                </div>
                <button
                  onClick={async () => {
                    const updRes = await fetch(`/api/projects/${projectId}/scenes/${scene.id}/update-text`, {
                      method:'POST', headers:{'Content-Type':'application/json'},
                      body: JSON.stringify({ refImageFile: null }),
                    });
                    onUpdate();
                  }}
                  style={{ background:'none', border:'none', color:'#333', cursor:'pointer', fontSize:11, padding:'2px 4px' }}
                  onMouseEnter={e => e.currentTarget.style.color = T.red}
                  onMouseLeave={e => e.currentTarget.style.color = '#333'}
                  title="Eigenes Referenzbild entfernen">✕</button>
              </div>
            );
          })()}

          <div style={{ display:'flex', gap:6, flex:1, ...(scene.manual ? { display:'none' } : {}) }}>
            {screenshots.map((file, k) => {
              const isSelected = file === selected;
              const isSplitTarget = splitFor === file;
              const url = `/api/projects/${projectId}/media/screenshots/${file}`;
              const labels = ['A','B','C'];
              const splitFractions = [0.25, 0.5, 0.75];
              return (
                <div key={file} style={{ flex:1, position:'relative', borderRadius:8, overflow:'hidden', border:`2px solid ${isSplitTarget ? '#f59e0b' : isSelected ? T.accent : '#1a1a1a'}`, opacity:selecting?0.6:1, transition:'all .15s' }}>
                  {/* Aspect-ratio Box — maxHeight keeps cards uniform even with 1 screenshot */}
                  <div onClick={() => selectScreenshot(file)} style={{ width:'100%', aspectRatio:thumbAspect, maxHeight:160, position:'relative', overflow:'hidden', cursor:'pointer' }}>
                    <img src={url} alt={labels[k] ?? String(k+1)}
                      style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', objectFit:'cover' }}
                      onError={e => { e.target.style.opacity='0.15'; }} />
                  </div>
                  {isSelected && !isSplitTarget && (
                    <div style={{ position:'absolute', top:4, right:4, background:T.accent, borderRadius:'50%', width:16, height:16, display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, color:'#fff', fontWeight:900 }}>✓</div>
                  )}
                  <div style={{ position:'absolute', bottom:3, left:5, fontSize:9, color:'rgba(255,255,255,0.5)', fontWeight:700 }}>{labels[k] ?? String(k+1)}</div>
                  {/* ✂ Split-Button */}
                  <button
                    onClick={() => {
                      if (isSplitTarget) { setSplitFor(null); return; }
                      const frac = splitFractions[k] ?? 0.5;
                      const approxStart = parseFloat((scene.start + (scene.end - scene.start) * frac).toFixed(2));
                      setSplitFor(file);
                      setSplitStart(String(approxStart));
                      setSplitEnd(String(scene.end));
                      setSplitting(false);
                      setErr('');
                    }}
                    title="Neue Szene ab diesem Screenshot erstellen"
                    style={{ position:'absolute', bottom:3, right:4, background: isSplitTarget ? '#f59e0b' : 'rgba(0,0,0,0.6)', border:`1px solid ${isSplitTarget ? '#f59e0b' : '#333'}`, borderRadius:4, color: isSplitTarget ? '#000' : '#aaa', fontSize:9, padding:'1px 4px', cursor:'pointer', fontWeight:700, lineHeight:1.4 }}>
                    ✂
                  </button>
                  {/* → Video: use this screenshot directly as the scene image */}
                  <button
                    onClick={async () => {
                      try {
                        await fetch(`/api/projects/${projectId}/scenes/${scene.id}/use-screenshot-as-image`, {
                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ screenshotFile: file }),
                        });
                        onUpdate();
                      } catch (e) { setErr(e.message); }
                    }}
                    title="Diesen Screenshot direkt als Bild für Video verwenden"
                    style={{ position:'absolute', top:3, left:3, background:'rgba(0,0,0,0.75)', border:`1px solid rgba(181,152,226,0.4)`, borderRadius:4, color:'rgba(181,152,226,0.85)', fontSize:8, padding:'1px 5px', cursor:'pointer', fontWeight:700, lineHeight:1.4, whiteSpace:'nowrap' }}>
                    → Video
                  </button>
                </div>
              );
            })}
          </div>

          {/* Normal scene: small "upload own ref" button at bottom of screenshot col */}
          {!scene.manual && (
            <NormalSceneRefUpload scene={scene} projectId={projectId} onUpdate={onUpdate} />
          )}
        </div>

        {/* ── Mitte: Transcript + Info ── */}
        <div style={{ flex:1, padding:'14px 18px', borderRight:`1px solid ${T.border}`, display:'flex', flexDirection:'column', justifyContent:'space-between' }}>
          <div>
            {/* Timestamp + Szene-Nr */}
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10, flexWrap:'wrap' }}>
              {editingTimes ? (
                <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                  <input type="number" step="0.1" value={editStart} onChange={e => setEditStart(e.target.value)}
                    style={{ width:64, background:T.surface, border:`1px solid ${T.accent}`, borderRadius:6, color:T.text, padding:'2px 6px', fontSize:12, outline:'none', fontFamily:'monospace' }} />
                  <span style={{ fontSize:11, color:T.muted }}>→</span>
                  <input type="number" step="0.1" value={editEnd} onChange={e => setEditEnd(e.target.value)}
                    style={{ width:64, background:T.surface, border:`1px solid ${T.accent}`, borderRadius:6, color:T.text, padding:'2px 6px', fontSize:12, outline:'none', fontFamily:'monospace' }} />
                  <span style={{ fontSize:10, color:T.muted }}>s</span>
                  <button onClick={async () => {
                    const s = parseFloat(editStart), e = parseFloat(editEnd);
                    if (isNaN(s) || isNaN(e) || e <= s) return;
                    setSavingTimes(true);
                    try {
                      await fetch(`/api/projects/${projectId}/scenes/${scene.id}/update-times`, {
                        method:'POST', headers:{'Content-Type':'application/json'},
                        body: JSON.stringify({ start: s, end: e }),
                      });
                      setEditingTimes(false);
                      onUpdate();
                    } finally { setSavingTimes(false); }
                  }} disabled={savingTimes}
                    style={{ background:T.accent, border:'none', borderRadius:9999, color:'#000', fontSize:10, fontWeight:700, padding:'3px 9px', cursor:'pointer' }}>
                    {savingTimes ? '…' : '✓'}
                  </button>
                  <button onClick={() => { setEditingTimes(false); setEditStart(String(scene.start)); setEditEnd(String(scene.end)); }}
                    style={{ background:'none', border:`1px solid ${T.border}`, borderRadius:9999, color:T.muted, fontSize:10, padding:'3px 8px', cursor:'pointer' }}>✕</button>
                </div>
              ) : (
                <span
                  onClick={() => { setEditStart(String(scene.start)); setEditEnd(String(scene.end)); setEditingTimes(true); }}
                  title="Zeitstempel bearbeiten"
                  style={{ fontSize:11, fontWeight:700, color:T.accent, fontFamily:'monospace', background:T.accentBg, padding:'2px 7px', borderRadius:5, cursor:'pointer' }}>
                  {fmt(scene.start)} → {fmt(scene.end)}
                </span>
              )}
              <span style={{ fontSize:11, color:T.muted }}>{duration}s</span>
              <span style={{ fontSize:11, fontWeight:700, color:'#fff', background:T.subtle, padding:'1px 7px', borderRadius:5 }}>#{scene.id+1}</span>
              {scene.imageApproved && <span style={{ fontSize:11, color:T.green, fontWeight:700 }}>✓ freigegeben</span>}
                {/* Script-Edit Button — nur für normale Szenen */}
              {!scene.manual && (
                <button onClick={() => { setEditedText(scene.text ?? ''); setEditingText(!editingText); }}
                  style={{ background:'none', border:`1px solid ${editingText ? T.accent : T.border}`, borderRadius:9999, color:editingText ? T.accent : T.muted, fontSize:11, padding:'2px 10px', cursor:'pointer' }}>
                  {editingText ? '✕ Abbrechen' : '✎ Script bearbeiten'}
                </button>
              )}
              <div style={{ flex:1 }} />
              {/* Delete — SVG Mülleimer, ganz rechts in der Timestamp-Zeile */}
              {confirmDelete ? (
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ fontSize:11, color:T.red }}>Löschen?</span>
                  <button onClick={deleteScene} disabled={deleting}
                    style={{ background:'rgba(239,68,68,.15)', border:`1px solid rgba(239,68,68,.4)`, borderRadius:9999, color:T.red, fontSize:11, fontWeight:700, padding:'2px 10px', cursor:'pointer' }}>
                    {deleting ? '…' : 'Ja'}
                  </button>
                  <button onClick={() => setConfirmDelete(false)}
                    style={{ background:'none', border:`1px solid ${T.border}`, borderRadius:9999, color:T.muted, fontSize:11, padding:'2px 10px', cursor:'pointer' }}>
                    Nein
                  </button>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(true)} title="Szene löschen"
                  style={{ background:'none', border:'none', cursor:'pointer', color:'#3a3a3a', padding:'2px 4px', display:'flex', alignItems:'center', transition:'color .15s' }}
                  onMouseEnter={e => e.currentTarget.style.color = T.red}
                  onMouseLeave={e => e.currentTarget.style.color = '#3a3a3a'}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                    <path d="M10 11v6M14 11v6"/>
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                  </svg>
                </button>
              )}
            </div>

            {/* ── Normale Szene: Script ── */}
            {!scene.manual && (editingText ? (
              <div>
                <textarea value={editedText} onChange={e => setEditedText(e.target.value)} rows={4}
                  style={{ width:'100%', background:T.surface, border:`1px solid ${T.accent}`, borderRadius:10, color:T.text, padding:'10px 12px', fontSize:13, resize:'vertical', outline:'none', lineHeight:1.6 }} />
                <div style={{ display:'flex', gap:8, marginTop:8 }}>
                  <Btn onClick={saveText} loading={savingText} primary>Speichern</Btn>
                  <Btn onClick={() => setEditingText(false)}>Abbrechen</Btn>
                </div>
              </div>
            ) : (
              scene.text
                ? <p style={{ margin:0, fontSize:13, color:'#ccc', lineHeight:1.6, display:'-webkit-box', WebkitLineClamp:5, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{scene.text}</p>
                : <p style={{ margin:0, fontSize:13, color:'#444', fontStyle:'italic' }}>Keine Sprache / Musik / Stille</p>
            ))}

            {/* ── Manuelle Szene: Skript + Was soll generiert werden (mit Referenzbild) ── */}
            {scene.manual && (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {/* Skript-Kontext (optional, aus Transkript) */}
                {scene.text ? (
                  <div>
                    <div style={{ fontSize:9, fontWeight:700, color:T.muted, letterSpacing:'0.5px', textTransform:'uppercase', marginBottom:3 }}>Skript</div>
                    <p style={{ margin:0, fontSize:12, color:'#555', lineHeight:1.5, fontStyle:'italic' }}>{scene.text}</p>
                  </div>
                ) : null}

                {/* ⚡ Was soll generiert werden — PRIMÄR-INPUT + optionales Referenzbild */}
                <div style={{ background:'rgba(181,152,226,0.07)', border:`1px solid ${T.accentBrd}`, borderRadius:10, padding:'9px 12px' }}>
                  <div style={{ fontSize:9, fontWeight:700, color:T.accent, letterSpacing:'0.5px', textTransform:'uppercase', marginBottom:7 }}>
                    ⚡ Was soll generiert werden?
                    <span style={{ color:'#444', fontWeight:400, textTransform:'none', letterSpacing:0, fontSize:9 }}> — Primär-Input + optionales Referenzbild</span>
                  </div>
                  <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
                    <AdjustImageUpload
                      preview={adjustImagePreview}
                      onFile={f => {
                        setAdjustImageFile(f);
                        const r = new FileReader();
                        r.onload = e => setAdjustImagePreview(e.target.result);
                        r.readAsDataURL(f);
                      }}
                      onClear={() => { setAdjustImageFile(null); setAdjustImagePreview(null); }}
                    />
                    <textarea
                      value={manualInput}
                      onChange={e => setManualInput(e.target.value)}
                      onBlur={saveManualInput}
                      rows={3}
                      placeholder="Beschreibe was in dieser Szene zu sehen sein soll — z.B. 'Erdbeere auf einer Bühne, Mikrofon, dramatisches Licht, Pixar-Stil'"
                      style={{ flex:1, background:'transparent', border:'none', color:T.text, padding:0, fontSize:13, resize:'none', outline:'none', lineHeight:1.6 }}
                    />
                  </div>
                  {savingManualInput && <div style={{ fontSize:9, color:T.muted, marginTop:4 }}>speichert…</div>}
                </div>
              </div>
            )}
          </div>

          {/* ── Szene anpassen — nur für normale Szenen (manuelle haben das bereits oben integriert) ── */}
          {!scene.manual && <div style={{ marginTop:10, borderTop:`1px solid ${T.border}`, paddingTop:8 }}>
            <div style={{ fontSize:9, fontWeight:700, color:T.muted, letterSpacing:'0.5px', textTransform:'uppercase', marginBottom:5 }}>
              Szene anpassen
              <span style={{ color:'#2a2a2a', fontWeight:400, textTransform:'none', letterSpacing:0 }}> — Referenzbild + Text werden dem Prompt hinzugefügt</span>
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
              <AdjustImageUpload
                preview={adjustImagePreview}
                onFile={f => {
                  setAdjustImageFile(f);
                  const r = new FileReader();
                  r.onload = e => setAdjustImagePreview(e.target.result);
                  r.readAsDataURL(f);
                }}
                onClear={() => { setAdjustImageFile(null); setAdjustImagePreview(null); }}
              />
              <textarea
                value={sceneAdjustment}
                onChange={e => {
                  const val = e.target.value;
                  setSceneAdjustment(val);
                  // Debounced auto-save to project (800ms)
                  if (adjustSaveTimer.current) clearTimeout(adjustSaveTimer.current);
                  adjustSaveTimer.current = setTimeout(() => {
                    fetch(`/api/projects/${projectId}/scenes/${scene.id}/update-text`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ sceneAdjustment: val }),
                    }).catch(() => {});
                  }, 800);
                }}
                rows={2}
                placeholder="Was soll angepasst werden? z.B. 'Hintergrund dunkler', 'Neonlicht von links', 'Person ersetzen wie im Bild'…"
                style={{ flex:1, background:T.surface, border:`1px solid ${T.border}`, borderRadius:9, color:T.text, padding:'7px 10px', fontSize:12, resize:'none', outline:'none', lineHeight:1.5 }}
                onFocus={e => e.target.style.borderColor = T.accent}
                onBlur={e => e.target.style.borderColor = T.border}
              />
            </div>
          </div>}

          {/* Charakter-Badges */}
          {getSceneCharacters(scene).length > 0 && (
            <div style={{ marginTop:8, display:'flex', flexWrap:'wrap', gap:4 }}>
              {getSceneCharacters(scene).map((c, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, color:T.accent, background:T.accentBg, border:`1px solid ${T.accentBrd}`, borderRadius:6, padding:'3px 7px' }}>
                  {c.imageFile ? '🖼' : '👤'} {c.label || c.description || 'Charakter'}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Rechts: Generiertes Bild + History-Navigation ── */}
        <div style={{ width: format==='9:16' ? 110 : 180, flexShrink:0, background:'#080808', display:'flex', flexDirection:'column', alignItems:'stretch', justifyContent:'stretch', overflow:'hidden', position:'relative' }}>
          {/* Image or placeholder */}
          <div style={{ flex:1, position:'relative', minHeight:0 }}
            onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={e => { e.preventDefault(); e.stopPropagation(); const f = e.dataTransfer.files[0]; if (f) uploadCustomImage(f); }}
          >
            {imageUrl ? (
              <img key={imageUrl} src={imageUrl} alt="Generiert"
                onClick={() => { if (!generating) { setLightboxIdx(displayHistIdx); setLightboxOpen(true); } }}
                style={{ width:'100%', height:'100%', objectFit:'cover', display:'block', cursor: generating ? 'default' : 'zoom-in' }}
                onError={e => { e.target.style.opacity='0.3'; }} />
            ) : (
              <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <div style={{ textAlign:'center', padding:12 }}>
                  <div style={{ fontSize:18, opacity:.25 }}>🖼</div>
                  <div style={{ fontSize:9, color:'#333', marginTop:3 }}>kein Bild</div>
                </div>
              </div>
            )}

            {/* Generating spinner overlay */}
            {generating && (
              <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.65)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:6 }}>
                <div style={{ width:22, height:22, border:`2px solid #333`, borderTopColor:T.accent, borderRadius:'50%', animation:'spin .7s linear infinite' }} />
                <div style={{ fontSize:9, color:T.accent, fontWeight:700 }}>generiert…</div>
              </div>
            )}

            {/* History: "altes Bild" label */}
            {isViewingOldImage && !generating && (
              <div style={{ position:'absolute', top:4, left:0, right:0, display:'flex', justifyContent:'center' }}>
                <span style={{ fontSize:8, fontWeight:700, color:'#fff', background:'rgba(0,0,0,0.7)', borderRadius:9999, padding:'2px 7px' }}>
                  #{displayHistIdx + 1} / {imageHistory.length}
                </span>
              </div>
            )}

            {/* "Dieses verwenden" button when viewing historical image */}
            {isViewingOldImage && !generating && (
              <div style={{ position:'absolute', bottom:28, left:0, right:0, display:'flex', justifyContent:'center' }}>
                <button
                  onClick={async () => {
                    await fetch(`/api/projects/${projectId}/scenes/${scene.id}/set-active-image`, {
                      method:'POST', headers:{'Content-Type':'application/json'},
                      body: JSON.stringify({ imageFile: displayImageFile }),
                    });
                    // Image moved to last position — navigate there
                    const lastIdx = (scene.imageHistory?.length ?? 1) - 1;
                    setHistoryIdx(lastIdx);
                    onUpdate();
                  }}
                  style={{ fontSize:8, fontWeight:700, color:'#000', background:T.accent, border:'none', borderRadius:9999, padding:'3px 8px', cursor:'pointer', whiteSpace:'nowrap' }}>
                  ✓ Verwenden
                </button>
              </div>
            )}
          </div>

          {/* History navigation arrows — only when history exists */}
          {imageHistory.length > 1 && !generating && (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:'#0a0a0a', borderTop:`1px solid ${T.border}`, padding:'3px 6px', gap:4 }}>
              <button
                onClick={() => setHistoryIdx(Math.max(0, displayHistIdx - 1))}
                disabled={displayHistIdx === 0}
                style={{ background:'none', border:'none', color: displayHistIdx === 0 ? '#222' : T.muted, cursor: displayHistIdx === 0 ? 'default' : 'pointer', fontSize:14, padding:'1px 3px', lineHeight:1 }}>
                ‹
              </button>
              <span style={{ fontSize:9, color:T.muted, whiteSpace:'nowrap' }}>
                {displayHistIdx + 1} / {imageHistory.length}
              </span>
              <button
                onClick={() => setHistoryIdx(Math.min(imageHistory.length - 1, displayHistIdx + 1))}
                disabled={displayHistIdx === imageHistory.length - 1}
                style={{ background:'none', border:'none', color: displayHistIdx === imageHistory.length - 1 ? '#222' : T.muted, cursor: displayHistIdx === imageHistory.length - 1 ? 'default' : 'pointer', fontSize:14, padding:'1px 3px', lineHeight:1 }}>
                ›
              </button>
            </div>
          )}
          {/* Upload custom image button */}
          {!generating && (
            <div style={{ borderTop:`1px solid ${T.border}`, background:'#060606', padding:'4px 6px', display:'flex', justifyContent:'center' }}>
              <button
                onClick={() => customUploadRef.current?.click()}
                disabled={uploadingCustom}
                title="Eigenes Bild hochladen (JPG/PNG/WebP) — wird direkt für Video verwendet"
                style={{ background:'none', border:`1px dashed ${T.border}`, borderRadius:5, color: uploadingCustom ? T.accent : '#2a2a2a', fontSize:8, fontWeight:700, padding:'3px 7px', cursor: uploadingCustom ? 'default' : 'pointer', display:'flex', alignItems:'center', gap:3, transition:'all .15s', whiteSpace:'nowrap' }}
                onMouseEnter={e => { if (!uploadingCustom) { e.currentTarget.style.borderColor = T.accentBrd; e.currentTarget.style.color = T.accent; }}}
                onMouseLeave={e => { if (!uploadingCustom) { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = '#2a2a2a'; }}}>
                {uploadingCustom
                  ? <><span style={{ width:7, height:7, border:`1.5px solid ${T.accent}`, borderTopColor:'transparent', borderRadius:'50%', display:'inline-block', animation:'spin .7s linear infinite' }} /> lädt…</>
                  : <>↑ Upload</>
                }
              </button>
              <input ref={customUploadRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => { const f = e.target.files?.[0]; if (f) uploadCustomImage(f); e.target.value = ''; }} />
            </div>
          )}
        </div>
      </div>

      {/* ── Prompt-Editor ── */}
      {showPrompt && (
        <div style={{ padding:'14px 18px', borderTop:`1px solid ${T.border}`, background:T.surface }}>
          <label style={{ display:'block', fontSize:10, color:T.muted, fontWeight:700, marginBottom:6, letterSpacing:'0.5px', textTransform:'uppercase' }}>Imagen-Prompt (Englisch)</label>
          {promptLoading
            ? <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 0', color:T.muted, fontSize:13 }}><div style={{ width:12, height:12, border:`2px solid #333`, borderTopColor:T.accent, borderRadius:'50%', animation:'spin .7s linear infinite' }} /> Generiere Prompt…</div>
            : <textarea value={customPrompt || scene.imagePrompt || ''} onChange={e => setCustomPrompt(e.target.value)} rows={4}
                placeholder="Beschreibe das Bild auf Englisch…"
                style={{ width:'100%', background:T.card, border:`1px solid ${T.border}`, borderRadius:10, color:T.text, padding:'10px 14px', fontSize:13, resize:'vertical', outline:'none', lineHeight:1.5 }}
                onFocus={e => e.target.style.borderColor = T.accent}
                onBlur={e => e.target.style.borderColor = T.border}
              />
          }
        </div>
      )}

      {/* ── Prompt-Vorschau (wenn vorhanden, Editor zu) ── */}
      {scene.imagePrompt && !showPrompt && (
        <div style={{ padding:'6px 18px', borderTop:`1px solid ${T.border}`, background:T.surface }}>
          <p style={{ margin:0, fontSize:11, color:'#444', lineHeight:1.5, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
            <span style={{ color:'#2a2a2a', fontWeight:700 }}>PROMPT: </span>{scene.imagePrompt}
          </p>
        </div>
      )}


      {/* ── Split-Panel ── */}
      {splitFor && (
        <div style={{ padding:'12px 18px', borderTop:`1px solid rgba(245,158,11,0.3)`, background:'rgba(245,158,11,0.05)' }}>
          <div style={{ fontSize:10, fontWeight:700, color:'#f59e0b', letterSpacing:'0.5px', textTransform:'uppercase', marginBottom:8 }}>
            ✂ Neue Szene erstellen — Zeitbereich festlegen
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <label style={{ fontSize:11, color:T.muted, whiteSpace:'nowrap' }}>Von (Sek.):</label>
              <input type="number" step="0.1" value={splitStart} onChange={e => setSplitStart(e.target.value)}
                style={{ width:80, background:T.surface, border:`1px solid #f59e0b`, borderRadius:7, color:T.text, padding:'5px 8px', fontSize:13, outline:'none' }} />
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <label style={{ fontSize:11, color:T.muted, whiteSpace:'nowrap' }}>Bis (Sek.):</label>
              <input type="number" step="0.1" value={splitEnd} onChange={e => setSplitEnd(e.target.value)}
                style={{ width:80, background:T.surface, border:`1px solid #f59e0b`, borderRadius:7, color:T.text, padding:'5px 8px', fontSize:13, outline:'none' }} />
            </div>
            <Btn onClick={splitScene} loading={splitting} primary>✂ Szene erstellen</Btn>
            <Btn onClick={() => setSplitFor(null)}>Abbrechen</Btn>
            <span style={{ fontSize:11, color:T.muted }}>Aktuelle Szene endet dann bei {splitStart}s</span>
          </div>
        </div>
      )}

      {/* ── Charakter-Panel ── */}
      {showCharPanel && (
        <CharPanel
          scene={scene}
          projectId={projectId}
          onClose={() => setShowCharPanel(false)}
          onUpdate={onUpdate}
          projectCharacters={projectCharacters}
        />
      )}

      {/* ── Fehler ── */}
      {err && <div style={{ padding:'8px 18px', borderTop:`1px solid rgba(239,68,68,.2)`, background:'rgba(239,68,68,.05)', fontSize:12, color:T.red }}>⚠ {err}</div>}

      {/* ── Lightbox ── */}
      {lightboxOpen && imageHistory.length > 0 && (
        <div
          onClick={() => setLightboxOpen(false)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.93)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <img
            src={`/api/projects/${projectId}/media/generated-images/${imageHistory[lightboxIdx]}`}
            alt=""
            onClick={e => e.stopPropagation()}
            style={{ maxHeight:'90vh', maxWidth:'82vw', objectFit:'contain', borderRadius:10, boxShadow:'0 0 60px rgba(0,0,0,0.8)', userSelect:'none' }}
          />
          {/* Close */}
          <button onClick={() => setLightboxOpen(false)}
            style={{ position:'absolute', top:20, right:24, background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:9999, color:'#fff', fontSize:18, width:36, height:36, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1 }}>✕</button>
          {/* Left arrow */}
          <button
            onClick={e => { e.stopPropagation(); setLightboxIdx(i => Math.max(0, i - 1)); }}
            disabled={lightboxIdx === 0}
            style={{ position:'absolute', left:20, top:'50%', transform:'translateY(-50%)', background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:9999, color: lightboxIdx === 0 ? '#444' : '#fff', fontSize:26, width:48, height:48, cursor: lightboxIdx === 0 ? 'default' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1 }}>‹</button>
          {/* Right arrow */}
          <button
            onClick={e => { e.stopPropagation(); setLightboxIdx(i => Math.min(imageHistory.length - 1, i + 1)); }}
            disabled={lightboxIdx === imageHistory.length - 1}
            style={{ position:'absolute', right:20, top:'50%', transform:'translateY(-50%)', background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:9999, color: lightboxIdx === imageHistory.length - 1 ? '#444' : '#fff', fontSize:26, width:48, height:48, cursor: lightboxIdx === imageHistory.length - 1 ? 'default' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1 }}>›</button>
          {/* Counter + scene info */}
          <div style={{ position:'absolute', bottom:22, left:'50%', transform:'translateX(-50%)', display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
            {imageHistory.length > 1 && (
              <div style={{ background:'rgba(0,0,0,0.65)', borderRadius:9999, padding:'4px 14px', fontSize:12, color:'#ccc' }}>
                {lightboxIdx + 1} / {imageHistory.length}
              </div>
            )}
            <div style={{ background:'rgba(0,0,0,0.5)', borderRadius:9999, padding:'3px 12px', fontSize:11, color:'#888' }}>
              Szene #{scene.id + 1} · {fmt(scene.start)} → {fmt(scene.end)}
            </div>
          </div>
        </div>
      )}

      {/* ── Aktionen ── */}
      <div style={{ padding:'10px 14px', borderTop:`1px solid ${T.border}`, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
        <Btn onClick={generateImage} loading={generating} disabled={approving} primary>
          {generating ? 'Generiere…' : scene.imageFile ? '🔄 Neu generieren' : '🖼 Bild generieren'}
        </Btn>

        <Btn onClick={generatePrompt} loading={promptLoading} active={showPrompt} disabled={generating}>
          ✏️ Prompt{(customPrompt || scene.imagePrompt) ? ' ✓' : ''}
        </Btn>
        {showPrompt && (customPrompt || scene.imagePrompt) && (
          <Btn onClick={regeneratePrompt} loading={promptLoading} disabled={generating}>
            🔄 Neu generieren
          </Btn>
        )}
        <Btn onClick={() => setShowCharPanel(!showCharPanel)} active={showCharPanel || getSceneCharacters(scene).length > 0} disabled={generating}>
          👤 Charaktere{getSceneCharacters(scene).length > 0 ? ` (${getSceneCharacters(scene).length})` : ''}
        </Btn>
        {scene.imageFile && (
          <Btn onClick={toggleApproval} loading={approving} disabled={generating} green={!scene.imageApproved} danger={scene.imageApproved}>
            {scene.imageApproved ? '↩ Aufheben' : '✅ Freigeben'}
          </Btn>
        )}
        <div style={{ flex:1 }} />
        <Btn disabled title="Phase 5 — nach Bild-Freigabe">▶ Video</Btn>
      </div>
    </div>
  );
}

/* ── Shared ─────────────────────────────────────────────────── */

/** Normalize characters from scene (backward compat) */
function getSceneCharacters(scene) {
  if (scene.characters && scene.characters.length > 0) return scene.characters;
  if (scene.characterDescription || scene.characterImageFile) {
    return [{ label: 'Charakter 1', description: scene.characterDescription || '', imageFile: scene.characterImageFile || null }];
  }
  return [];
}

/** Multi-character panel */
function CharPanel({ scene, projectId, onClose, onUpdate, projectCharacters = [] }) {
  const sceneIdx = scene.id;

  function initChars() {
    return getSceneCharacters(scene).map((c, i) => ({ ...c, _serverIdx: i, _preview: null, _file: null, _saving: false }));
  }

  const [chars, setChars] = useState(initChars);
  const [err, setErr] = useState('');
  const [addingGlobal, setAddingGlobal] = useState(null); // globalCharId being added

  function addChar() {
    setChars(prev => [...prev, { label: `Charakter ${prev.length + 1}`, description: '', imageFile: null, _serverIdx: -1, _preview: null, _file: null, _saving: false }]);
  }

  function updateLocal(i, key, val) {
    setChars(prev => prev.map((c, ci) => ci === i ? { ...c, [key]: val } : c));
  }

  async function saveChar(i) {
    const c = chars[i];
    setChars(prev => prev.map((cc, ci) => ci === i ? { ...cc, _saving: true } : cc));
    setErr('');
    try {
      const form = new FormData();
      form.append('charIdx', String(c._serverIdx));
      form.append('label', c.label || '');
      form.append('description', c.description || '');
      if (c._file) form.append('image', c._file);

      const res = await fetch(`/api/projects/${projectId}/scenes/${sceneIdx}/set-character`, { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setChars(data.characters.map((sc, si) => ({
        ...sc, _serverIdx: si,
        _preview: si === data.targetIdx && c._preview ? c._preview : null,
        _file: null, _saving: false,
      })));
      onUpdate();
    } catch (e) {
      setErr(e.message);
      setChars(prev => prev.map((cc, ci) => ci === i ? { ...cc, _saving: false } : cc));
    }
  }

  async function removeChar(i) {
    const c = chars[i];
    if (c._serverIdx < 0) { setChars(prev => prev.filter((_, ci) => ci !== i)); return; }
    setChars(prev => prev.map((cc, ci) => ci === i ? { ...cc, _saving: true } : cc));
    try {
      const res = await fetch(`/api/projects/${projectId}/scenes/${sceneIdx}/remove-character`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ charIdx: c._serverIdx }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setChars(data.characters.map((sc, si) => ({ ...sc, _serverIdx: si, _preview: null, _file: null, _saving: false })));
      onUpdate();
    } catch (e) {
      setErr(e.message);
      setChars(prev => prev.map((cc, ci) => ci === i ? { ...cc, _saving: false } : cc));
    }
  }

  async function addFromLibrary(globalChar) {
    setAddingGlobal(globalChar.id);
    try {
      const res = await fetch(`/api/projects/${projectId}/scenes/${sceneIdx}/use-global-char`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ globalCharId: globalChar.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setChars(data.characters.map((sc, si) => ({ ...sc, _serverIdx: si, _preview: null, _file: null, _saving: false })));
      onUpdate();
    } catch (e) { setErr(e.message); }
    finally { setAddingGlobal(null); }
  }

  // Global chars not yet in this scene
  const sceneImageFiles = new Set(chars.map(c => c.imageFile).filter(Boolean));
  const availableGlobal = projectCharacters.filter(gc => gc.imageFile && !sceneImageFiles.has(gc.imageFile));

  return (
    <div style={{ padding:'14px 18px', borderTop:`1px solid ${T.border}`, background:'#0a0a0a' }}>

      {/* ── Projektbibliothek ── */}
      {availableGlobal.length > 0 && (
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:10, fontWeight:700, color:T.muted, letterSpacing:'0.5px', textTransform:'uppercase', marginBottom:8 }}>
            Projektbibliothek — in anderer Szene gespeichert
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
            {availableGlobal.map(gc => {
              const imgUrl = `/api/projects/${projectId}/media/character-images/${gc.imageFile}`;
              const isAdding = addingGlobal === gc.id;
              return (
                <div key={gc.id} style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:10, padding:'8px 10px', display:'flex', alignItems:'center', gap:8, maxWidth:220 }}>
                  {gc.imageFile && (
                    <div style={{ width:36, height:36, borderRadius:7, overflow:'hidden', flexShrink:0, border:`1px solid ${T.border}` }}>
                      <img src={imgUrl} alt={gc.label} style={{ width:'100%', height:'100%', objectFit:'cover' }} onError={e => { e.target.style.display='none'; }} />
                    </div>
                  )}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:T.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{gc.label || 'Charakter'}</div>
                    {gc.description && <div style={{ fontSize:10, color:T.muted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{gc.description}</div>}
                  </div>
                  <button
                    onClick={() => addFromLibrary(gc)}
                    disabled={isAdding}
                    style={{ flexShrink:0, background:T.accentBg, border:`1px solid ${T.accentBrd}`, borderRadius:9999, color:T.accent, fontWeight:700, fontSize:11, padding:'4px 10px', cursor:'pointer', whiteSpace:'nowrap', transition:'background .15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(181,152,226,0.18)'}
                    onMouseLeave={e => e.currentTarget.style.background = T.accentBg}>
                    {isAdding ? '…' : '+ Übernehmen'}
                  </button>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop:8, height:1, background:T.border }} />
        </div>
      )}

      {/* ── Szenen-Charaktere ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
        <p style={{ margin:0, fontSize:10, fontWeight:700, color:T.accent, letterSpacing:'0.5px', textTransform:'uppercase' }}>
          Charaktere dieser Szene
        </p>
        <div style={{ display:'flex', gap:8 }}>
          <Btn onClick={addChar}>+ Neuer Charakter</Btn>
          <Btn onClick={onClose}>✕ Schließen</Btn>
        </div>
      </div>

      {chars.length === 0 && (
        <p style={{ color:T.muted, fontSize:13, margin:'8px 0 12px' }}>
          {availableGlobal.length > 0 ? 'Klicke "+ Übernehmen" um einen Charakter aus der Bibliothek zu verwenden.' : 'Keine Charaktere. Mit "+ Neuer Charakter" hinzufügen.'}
        </p>
      )}

      {chars.map((c, i) => (
        <div key={i} style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:12, padding:12, marginBottom:10 }}>
          <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
            <CharImageUpload
              preview={c._preview}
              imageFile={c.imageFile}
              projectId={projectId}
              onFile={f => {
                updateLocal(i, '_file', f);
                const r = new FileReader();
                r.onload = ev => updateLocal(i, '_preview', ev.target.result);
                r.readAsDataURL(f);
              }}
            />
            <div style={{ flex:1, display:'flex', flexDirection:'column', gap:6 }}>
              <input
                value={c.label || ''}
                onChange={e => updateLocal(i, 'label', e.target.value)}
                placeholder={`Charakter ${i + 1} (Name/Label)`}
                style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, color:T.text, padding:'6px 10px', fontSize:12, outline:'none', width:'100%' }}
                onFocus={e => e.target.style.borderColor = T.accent}
                onBlur={e => e.target.style.borderColor = T.border}
              />
              <textarea
                value={c.description || ''}
                onChange={e => updateLocal(i, 'description', e.target.value)}
                rows={2}
                placeholder="Beschreibe den Ersatz-Charakter (z.B. 'ein Mensch statt Banane', 'Astronaut im CGI-Stil')"
                style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, color:T.text, padding:'6px 10px', fontSize:12, resize:'none', outline:'none', lineHeight:1.5, width:'100%' }}
                onFocus={e => e.target.style.borderColor = T.accent}
                onBlur={e => e.target.style.borderColor = T.border}
              />
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:4, flexShrink:0 }}>
              <Btn onClick={() => saveChar(i)} loading={c._saving} primary>💾</Btn>
              <Btn onClick={() => removeChar(i)} loading={c._saving} danger>✕</Btn>
            </div>
          </div>
          {c._serverIdx >= 0 && !c._file && !c._preview && (
            <div style={{ marginTop:4, fontSize:10, color:'#2a5' }}>✓ gespeichert{c.imageFile ? ' + Bild' : ''}</div>
          )}
          {(c._file || c._serverIdx < 0) && (
            <div style={{ marginTop:4, fontSize:10, color:T.muted }}>⚠ noch nicht gespeichert — 💾 drücken</div>
          )}
        </div>
      ))}

      {err && <div style={{ marginTop:8, fontSize:12, color:T.red }}>⚠ {err}</div>}
      <p style={{ margin:'8px 0 0', fontSize:11, color:'#333', lineHeight:1.5 }}>
        Tipp: Lade ein Referenzbild hoch — Claude analysiert es und beschreibt den Charakter präzise im Imagen-Prompt. Gespeicherte Charaktere erscheinen in der Bibliothek aller anderen Szenen.
      </p>
    </div>
  );
}

/* ── AdjustImageUpload: Referenzbild für Szenen-Anpassung ─────── */
function AdjustImageUpload({ preview, onFile, onClear }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  function handleFile(f) {
    if (!f || !f.type.startsWith('image/')) return;
    onFile(f);
  }

  return (
    <div style={{ flexShrink:0 }}>
      {preview ? (
        <div style={{ position:'relative', width:72, height:72, borderRadius:8, overflow:'hidden', border:`2px solid ${T.accent}` }}>
          <img src={preview} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
          <button onClick={onClear} title="Bild entfernen"
            style={{ position:'absolute', top:2, right:2, background:'rgba(0,0,0,.75)', border:'none', borderRadius:'50%', color:'#fff', fontSize:10, width:16, height:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', padding:0 }}>✕</button>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
          title="Referenzbild für Anpassung hochladen"
          style={{
            width:72, height:72, borderRadius:8, border:`2px dashed ${dragging ? T.accent : T.border}`,
            background: dragging ? T.accentBg : T.card, cursor:'pointer',
            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
            gap:3, transition:'all .15s',
          }}>
          <input ref={inputRef} type="file" accept="image/*" hidden onChange={e => handleFile(e.target.files?.[0])} />
          <span style={{ fontSize: dragging ? 18 : 16, opacity: dragging ? 1 : 0.4 }}>{dragging ? '📂' : '🖼'}</span>
          <span style={{ fontSize:8, color:T.muted, textAlign:'center', lineHeight:1.3 }}>Referenz<br />Bild</span>
        </div>
      )}
    </div>
  );
}

/* ── CharImageUpload: Drag & Drop für Charakter-Bilder ────────── */
function CharImageUpload({ preview, imageFile, projectId, onFile }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  function handleFile(f) {
    if (!f || !f.type.startsWith('image/')) return;
    onFile(f);
  }

  const hasPic = !!(preview || imageFile);
  const imgSrc = preview || (imageFile ? `/api/projects/${projectId}/media/character-images/${imageFile}` : null);

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
      style={{
        width:64, height:64, borderRadius:8, flexShrink:0, position:'relative',
        border:`2px dashed ${hasPic ? T.accent : dragging ? T.accent : T.border}`,
        background: dragging ? T.accentBg : hasPic ? 'transparent' : T.surface,
        cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
        overflow:'hidden', transition:'all .15s',
      }}>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={e => handleFile(e.target.files?.[0])} />
      {imgSrc ? (
        <img src={imgSrc} style={{ width:'100%', height:'100%', objectFit:'cover' }} onError={e => { e.target.style.opacity='0.2'; }} />
      ) : (
        <span style={{ fontSize: dragging ? 18 : 20, opacity: dragging ? 0.8 : 0.25 }}>{dragging ? '📂' : '👤'}</span>
      )}
      <div style={{ position:'absolute', bottom:2, right:2, background:'rgba(0,0,0,0.7)', borderRadius:3, fontSize:8, color:'#888', padding:'1px 3px' }}>
        {dragging ? '↓' : '📷'}
      </div>
    </div>
  );
}

function Btn({ children, onClick, disabled, loading, primary, active, green, danger, title }) {
  const bg = primary ? T.accent : active ? T.accentBg : green ? T.greenBg : danger ? 'rgba(239,68,68,.08)' : disabled ? T.subtle : T.surface;
  const bd = primary ? T.accent : active ? T.accentBrd : green ? T.greenBrd : danger ? 'rgba(239,68,68,.3)' : T.border;
  const cl = primary ? '#fff' : active ? T.accent : green ? T.green : danger ? T.red : disabled ? '#333' : T.muted;
  return (
    <button onClick={onClick} disabled={disabled||loading} title={title}
      style={{ padding:'6px 13px', borderRadius:9999, fontSize:12, fontWeight:700, background:bg, border:`1px solid ${bd}`, color:cl, cursor:disabled||loading?'not-allowed':'pointer', display:'flex', alignItems:'center', gap:4, transition:'all .15s', whiteSpace:'nowrap' }}>
      {loading && <div style={{ width:9, height:9, border:`2px solid ${cl}33`, borderTopColor:cl, borderRadius:'50%', animation:'spin .7s linear infinite' }} />}
      {children}
    </button>
  );
}

function Pill({ children }) {
  return <span style={{ fontSize:11, padding:'3px 8px', border:`1px solid ${T.border}`, borderRadius:9999, color:T.muted }}>{children}</span>;
}

function StatBox({ value, label, color, bg, border }) {
  return (
    <div style={{ background:bg, border:`1px solid ${border}`, borderRadius:10, padding:'10px 16px', textAlign:'center' }}>
      <div style={{ fontSize:20, fontWeight:900, color }}>{value}</div>
      <div style={{ fontSize:11, color:T.muted, marginTop:2 }}>{label}</div>
    </div>
  );
}

function Breadcrumb({ active, projectId, router }) {
  const steps = ['1 Upload & Analyse', '2 Bilder generieren', '3 Videos generieren', '4 Export'];
  const links = ['/', `/scenes/${projectId}`, `/videos/${projectId}`, `/export/${projectId}`];

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

function Screen({ children }) {
  return <div style={{ minHeight:'100vh', background:'#000', display:'flex', alignItems:'center', justifyContent:'center' }}>{children}</div>;
}

/* ── InsertBar: "+" Button zwischen Szenen ──────────────────── */
function InsertBar({ insertAfterIndex, projectId, onInserted, scenes }) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  return (
    <div style={{ margin:'2px 0', position:'relative' }}>
      {!open ? (
        <div
          style={{ display:'flex', alignItems:'center', gap:8, transition:'opacity .2s', opacity: hovered ? 1 : 0.2 }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}>
          <div style={{ flex:1, height:1, background: hovered ? T.accentBrd : T.border, transition:'background .2s' }} />
          <button onClick={() => setOpen(true)}
            style={{
              background: hovered ? T.accentBg : T.subtle,
              border:`1px solid ${hovered ? T.accentBrd : T.border}`,
              borderRadius:9999, color: hovered ? T.accent : T.muted,
              fontSize:11, fontWeight:700, padding:'3px 12px', cursor:'pointer',
              display:'flex', alignItems:'center', gap:5, whiteSpace:'nowrap', transition:'all .15s',
            }}>
            + Szene einfügen
          </button>
          <div style={{ flex:1, height:1, background: hovered ? T.accentBrd : T.border, transition:'background .2s' }} />
        </div>
      ) : (
        <InsertSceneForm
          insertAfterIndex={insertAfterIndex}
          projectId={projectId}
          scenes={scenes}
          onDone={() => { setOpen(false); onInserted(); }}
          onCancel={() => setOpen(false)}
        />
      )}
    </div>
  );
}

/* ── InsertSceneForm ────────────────────────────────────────── */
function InsertSceneForm({ insertAfterIndex, projectId, scenes, onDone, onCancel }) {
  // Suggest times: start right after previous scene, 5s duration
  const prevScene = scenes[insertAfterIndex] ?? null;
  const nextScene = scenes[insertAfterIndex + 1] ?? null;
  const suggestStart = prevScene ? prevScene.end : 0;
  const suggestEnd   = nextScene ? Math.min(prevScene ? prevScene.end + 5 : 5, nextScene.start) : suggestStart + 5;

  const [start, setStart]       = useState(String(suggestStart.toFixed(1)));
  const [end, setEnd]           = useState(String(suggestEnd.toFixed(1)));
  const [text, setText]         = useState('');
  const [manualInput, setManualInput] = useState('');
  const [cascade, setCascade]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState('');

  async function insert() {
    const s = parseFloat(start), e = parseFloat(end);
    if (isNaN(s) || isNaN(e) || e <= s) { setErr('Ungültige Zeitangabe'); return; }
    setSaving(true); setErr('');
    try {
      const res = await fetch(`/api/projects/${projectId}/scenes/insert-scene`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ insertAfterIndex, start: s, end: e, text, manualInput, cascadeTimestamps: cascade }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Fehler');
      onDone();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ background:'rgba(181,152,226,0.05)', border:`1px solid ${T.accentBrd}`, borderRadius:14, padding:'14px 18px', margin:'4px 0', animation:'fadeIn .2s' }}>
      <div style={{ fontSize:10, fontWeight:700, color:T.accent, letterSpacing:'0.5px', textTransform:'uppercase', marginBottom:10 }}>
        + Neue Szene einfügen{insertAfterIndex >= 0 ? ` nach Szene #${insertAfterIndex + 1}` : ' am Anfang'}
      </div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:10, alignItems:'flex-start' }}>
        {/* Zeit */}
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <label style={{ fontSize:11, color:T.muted, whiteSpace:'nowrap' }}>Von (s):</label>
          <input type="number" step="0.1" value={start} onChange={e => setStart(e.target.value)}
            style={{ width:72, background:T.surface, border:`1px solid ${T.border}`, borderRadius:7, color:T.text, padding:'5px 8px', fontSize:13, outline:'none' }}
            onFocus={e => e.target.style.borderColor = T.accent}
            onBlur={e => e.target.style.borderColor = T.border} />
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <label style={{ fontSize:11, color:T.muted, whiteSpace:'nowrap' }}>Bis (s):</label>
          <input type="number" step="0.1" value={end} onChange={e => setEnd(e.target.value)}
            style={{ width:72, background:T.surface, border:`1px solid ${T.border}`, borderRadius:7, color:T.text, padding:'5px 8px', fontSize:13, outline:'none' }}
            onFocus={e => e.target.style.borderColor = T.accent}
            onBlur={e => e.target.style.borderColor = T.border} />
        </div>
        {/* Script */}
        <div style={{ flex:1, minWidth:180 }}>
          <textarea value={text} onChange={e => setText(e.target.value)} rows={1}
            placeholder="Skript / Sprache (optional)…"
            style={{ width:'100%', background:T.surface, border:`1px solid ${T.border}`, borderRadius:7, color:T.text, padding:'5px 8px', fontSize:13, resize:'none', outline:'none' }}
            onFocus={e => e.target.style.borderColor = T.accent}
            onBlur={e => e.target.style.borderColor = T.border} />
        </div>
      </div>

      {/* Was soll generiert werden */}
      <div style={{ marginTop:10 }}>
        <div style={{ fontSize:9, fontWeight:700, color:T.accent, letterSpacing:'0.5px', textTransform:'uppercase', marginBottom:5 }}>
          ⚡ Was soll generiert werden? <span style={{ color:T.muted, fontWeight:400, textTransform:'none', letterSpacing:0, fontSize:9 }}>(Primär-Input für Bildgenerierung)</span>
        </div>
        <textarea value={manualInput} onChange={e => setManualInput(e.target.value)} rows={2}
          placeholder="Beschreibe die Szene: Was ist zu sehen? Welche Stimmung, Charaktere, Setting…"
          style={{ width:'100%', background:'rgba(181,152,226,0.05)', border:`1px solid ${T.accentBrd}`, borderRadius:7, color:T.text, padding:'7px 10px', fontSize:13, resize:'none', outline:'none', lineHeight:1.5 }}
          onFocus={e => e.target.style.borderColor = T.accent}
          onBlur={e => e.target.style.borderColor = T.accentBrd} />
      </div>

      {/* Cascade-Option */}
      <label style={{ display:'flex', alignItems:'center', gap:7, marginTop:10, cursor:'pointer', fontSize:12, color:T.muted }}>
        <input type="checkbox" checked={cascade} onChange={e => setCascade(e.target.checked)}
          style={{ accentColor: T.accent, width:13, height:13 }} />
        Nachfolgende Szenen um {end && start ? Math.max(0, parseFloat(end) - parseFloat(start)).toFixed(1) : '?'}s verschieben
      </label>

      {err && <div style={{ marginTop:8, fontSize:12, color:T.red }}>⚠ {err}</div>}

      <div style={{ display:'flex', gap:8, marginTop:10 }}>
        <Btn onClick={insert} loading={saving} primary>+ Szene erstellen</Btn>
        <Btn onClick={onCancel}>Abbrechen</Btn>
      </div>
    </div>
  );
}

/* ── ManualRefImageUpload: Drag & Drop für Referenzbilder ──────── */
/* ── NormalSceneRefUpload: kleiner "Eigenes Ref-Bild" Button für normale Szenen ── */
function NormalSceneRefUpload({ scene, projectId, onUpdate }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);

  async function upload(file) {
    if (!file || !file.type.startsWith('image/')) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('image', file);
      await fetch(`/api/projects/${projectId}/scenes/${scene.id}/upload-ref-image`, { method:'POST', body:form });
      onUpdate();
    } finally { setUploading(false); setDragging(false); }
  }

  const refUrl = scene.refImageFile ? `/api/projects/${projectId}/media/${scene.refImageFile}` : null;

  return (
    <div style={{ marginTop:5 }}>
      {refUrl ? (
        /* Show existing ref + remove button */
        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          <div style={{ fontSize:8, color:T.accent, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.3px', whiteSpace:'nowrap' }}>Eigene Ref</div>
          <div style={{ position:'relative', width:28, height:44, borderRadius:5, overflow:'hidden', border:`1px solid ${T.accentBrd}`, flexShrink:0, cursor:'pointer' }}
            onClick={() => inputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) upload(f); }}>
            <img src={refUrl} alt="Ref" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
          </div>
          <button
            onClick={async () => {
              await fetch(`/api/projects/${projectId}/scenes/${scene.id}/remove-ref-image`, { method:'POST' });
              onUpdate();
            }}
            style={{ background:'none', border:'none', color:'#333', cursor:'pointer', fontSize:11, padding:'2px' }}
            onMouseEnter={e => e.currentTarget.style.color = T.red}
            onMouseLeave={e => e.currentTarget.style.color = '#333'}
            title="Referenzbild entfernen">✕</button>
          <input ref={inputRef} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }} />
        </div>
      ) : (
        /* Upload button */
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) upload(f); }}
          style={{ display:'flex', alignItems:'center', gap:5, cursor:'pointer', padding:'4px 6px', borderRadius:7, border:`1px dashed ${dragging ? T.accent : '#1e1e1e'}`, background: dragging ? T.accentBg : 'transparent', transition:'all .15s' }}>
          {uploading
            ? <div style={{ width:10, height:10, border:`2px solid ${T.accent}`, borderTopColor:'transparent', borderRadius:'50%', animation:'spin .7s linear infinite' }} />
            : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          }
          <span style={{ fontSize:9, color:T.muted, whiteSpace:'nowrap' }}>Eigenes Ref-Bild</span>
          <input ref={inputRef} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }} />
        </div>
      )}
    </div>
  );
}

/**
 * compact=true → kleines Upload-Icon am Ende der Screenshot-Zeile (normale Szenen)
 * compact=false → große Drop-Zone (manuelle Szenen, füllt den Platz)
 */
function ManualRefImageUpload({ scene, projectId, onUpdate, compact = false, thumbAspect = '9/16' }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');
  const inputRef = useRef(null);

  async function upload(file) {
    if (!file || !file.type.startsWith('image/')) { setErr('Nur Bilder erlaubt'); return; }
    setUploading(true); setErr('');
    try {
      const form = new FormData();
      form.append('image', file);
      const res = await fetch(`/api/projects/${projectId}/scenes/${scene.id}/upload-ref-image`, { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Upload fehlgeschlagen');
      onUpdate();
    } catch (e) { setErr(e.message); }
    finally { setUploading(false); }
  }

  const refUrl = scene.refImageFile
    ? `/api/projects/${projectId}/media/${scene.refImageFile}`
    : null;

  // ── Compact mode: kleines Icon am Ende der Screenshot-Zeile ──
  if (compact) {
    return (
      <div style={{ position:'relative', flexShrink:0 }}>
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files[0]); }}
          title={refUrl ? 'Eigenes Referenzbild ersetzen' : 'Eigenes Referenzbild hochladen'}
          style={{
            width:44, aspectRatio:thumbAspect ?? '9/16', borderRadius:8, overflow:'hidden',
            border:`2px dashed ${refUrl ? T.accent : dragging ? T.accent : '#2a2a2a'}`,
            background: dragging ? T.accentBg : refUrl ? 'transparent' : '#0a0a0a',
            cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
            transition:'all .15s', position:'relative',
          }}>
          {refUrl ? (
            <>
              <img src={refUrl} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
              {dragging && <div style={{ position:'absolute', inset:0, background:'rgba(181,152,226,0.4)', display:'flex', alignItems:'center', justifyContent:'center' }}><span style={{ fontSize:14 }}>📂</span></div>}
              <div style={{ position:'absolute', bottom:2, right:2, background:'rgba(0,0,0,0.75)', borderRadius:3, fontSize:7, color:T.accent, padding:'1px 3px', fontWeight:700 }}>✓</div>
            </>
          ) : uploading ? (
            <div style={{ width:10, height:10, border:`2px solid #333`, borderTopColor:T.accent, borderRadius:'50%', animation:'spin .7s linear infinite' }} />
          ) : (
            <>
              <span style={{ fontSize:12, opacity: dragging ? 0.9 : 0.3 }}>{dragging ? '📂' : '📷'}</span>
              <span style={{ fontSize:7, color:'#333', marginTop:2, textAlign:'center', lineHeight:1.2 }}>eigenes<br />Bild</span>
            </>
          )}
        </div>
        <input ref={inputRef} type="file" accept="image/*" hidden onChange={e => upload(e.target.files?.[0])} />
        {err && <div style={{ position:'absolute', bottom:-14, left:0, fontSize:8, color:T.red, whiteSpace:'nowrap' }}>{err}</div>}
      </div>
    );
  }

  // ── Full mode: große Drop-Zone für manuelle Szenen ────────────
  return (
    <div style={{ width:'100%', height:'100%', position:'relative' }}>
      {refUrl ? (
        <div
          style={{ position:'relative', width:'100%', height:'100%', border:`2px solid ${dragging ? T.accent : 'transparent'}`, borderRadius:8, transition:'border-color .15s' }}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files[0]); }}>
          <img src={refUrl} alt="Referenz" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block', borderRadius:6 }} />
          {dragging && (
            <div style={{ position:'absolute', inset:0, background:'rgba(181,152,226,0.35)', display:'flex', alignItems:'center', justifyContent:'center', borderRadius:6 }}>
              <span style={{ fontSize:22 }}>📂</span>
            </div>
          )}
          <button onClick={() => inputRef.current?.click()} title="Anderes Bild hochladen"
            style={{ position:'absolute', bottom:4, right:4, background:'rgba(0,0,0,0.7)', border:`1px solid ${T.border}`, borderRadius:6, color:T.muted, fontSize:10, padding:'2px 6px', cursor:'pointer' }}>
            ↑ Neu
          </button>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files[0]); }}
          style={{
            width:'100%', height:'100%', minHeight:120,
            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
            border:`2px dashed ${dragging ? T.accent : T.border}`, borderRadius:8,
            background: dragging ? T.accentBg : 'transparent',
            cursor:'pointer', transition:'all .15s', padding:8, textAlign:'center',
          }}>
          {uploading
            ? <div style={{ width:16, height:16, border:`2px solid #333`, borderTopColor:T.accent, borderRadius:'50%', animation:'spin .7s linear infinite' }} />
            : <><div style={{ fontSize:22, marginBottom:4, opacity:.4 }}>🖼</div><div style={{ fontSize:10, color:T.muted, lineHeight:1.4 }}>Referenzbild<br />hierher ziehen</div></>
          }
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={e => upload(e.target.files?.[0])} />
      {err && <div style={{ position:'absolute', bottom:0, left:0, right:0, fontSize:9, color:T.red, background:'rgba(0,0,0,.8)', padding:'2px 4px' }}>{err}</div>}
    </div>
  );
}
