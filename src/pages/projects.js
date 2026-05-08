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

const PAGE_SIZE = 10;

function fmt(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function projectName(p) {
  if (p.title) return p.title;
  if (p.videoPath) {
    const base = p.videoPath.split('/').pop() ?? '';
    if (base) return base.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || base;
  }
  if (p.videoUrl) {
    try {
      const u = new URL(p.videoUrl);
      const host = u.hostname.replace(/^www\./, '');
      const parts = u.pathname.split('/').filter(Boolean);
      return parts.length ? `${host} / ${parts.slice(-1)[0]}` : host;
    } catch { return p.videoUrl.slice(0, 60); }
  }
  return 'Neues Projekt';
}

function projectRoute(p) {
  return `/scenes/${p.id}`;
}

function projectStatus(p) {
  const scenes = p.scenes ?? [];
  if (p.exportStatus === 'done' && p.exportFile) return { label: 'Export fertig ✓', color: T.green };
  if (p.exportStatus === 'processing') return { label: 'Export läuft…', color: T.accent };
  if (!scenes.length) return { label: 'Wird verarbeitet…', color: T.muted };
  const withVideo = scenes.filter(s => s.videoStatus === 'done').length;
  const withImg = scenes.filter(s => s.imageFile).length;
  const approved = scenes.filter(s => s.imageApproved).length;
  if (withVideo > 0) return { label: `${withVideo}/${scenes.length} Videos generiert`, color: T.accent };
  if (approved === scenes.length && scenes.length > 0) return { label: `Alle ${scenes.length} freigegeben ✓`, color: T.green };
  if (withImg > 0) return { label: `${withImg}/${scenes.length} Bilder generiert`, color: T.accent };
  return { label: `${scenes.length} Szene${scenes.length !== 1 ? 'n' : ''} · Bilder ausstehend`, color: T.muted };
}

/** URL des ersten verfügbaren Screenshots eines Projekts */
function firstScreenshotUrl(p) {
  const scenes = p.scenes ?? [];
  for (const scene of scenes) {
    const file = scene.selectedScreenshot
      ?? scene.screenshotFiles?.[1]
      ?? scene.screenshotFiles?.[0]
      ?? scene.screenshotFile
      ?? null;
    if (file) return `/api/projects/${p.id}/media/screenshots/${file}`;
  }
  return null;
}

export default function ProjectsPage() {
  const router = useRouter();
  const isAdmin = false;
  const [projects, setProjects] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [page, setPage]         = useState(1);
  const [confirmDel, setConfirmDel] = useState(null);
  const [deleting, setDeleting]     = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameVal, setRenameVal]   = useState('');
  const renameRef = useRef(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/projects/list')
      .then(r => r.json())
      .then(d => { setProjects(d.projects ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  function startRename(p) {
    setRenamingId(p.id);
    setRenameVal(projectName(p));
    setTimeout(() => { renameRef.current?.select(); }, 30);
  }

  async function submitRename(id) {
    if (!renameVal.trim()) { setRenamingId(null); return; }
    await fetch(`/api/projects/${id}/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: renameVal.trim() }),
    });
    setRenamingId(null);
    load();
  }

  async function deleteProject(id) {
    setDeleting(true);
    try {
      await fetch(`/api/projects/${id}/delete`, { method: 'POST' });
      setConfirmDel(null);
      // Go back a page if we deleted the last item on this page
      const remaining = projects.length - 1;
      const maxPage = Math.max(1, Math.ceil(remaining / PAGE_SIZE));
      if (page > maxPage) setPage(maxPage);
      load();
    } finally { setDeleting(false); }
  }

  async function cleanupEmpty() {
    const empty = projects.filter(p => !p.scenes?.length);
    if (!empty.length) return;
    setDeleting(true);
    try {
      await Promise.all(empty.map(p => fetch(`/api/projects/${p.id}/delete`, { method: 'POST' })));
      setPage(1);
      load();
    } finally { setDeleting(false); }
  }

  const emptyCount = projects.filter(p => !p.scenes?.length).length;

  const totalPages = Math.max(1, Math.ceil(projects.length / PAGE_SIZE));
  const paged = projects.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <>
      <Head><title>Meine Projekte — Herr Tech</title></Head>
      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing:border-box; }
      `}</style>

      <div style={{ minHeight:'100vh', background:T.bg }}>
        {/* Nav */}
        <nav style={{ padding:'0 40px', height:64, borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, background:T.bg, zIndex:100 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <img src="/herr-tech-logo.png" alt="HERR TECH" style={{ height:18, objectFit:'contain', cursor:'pointer' }} onClick={() => router.push('/')} />
            <span style={{ color:T.muted, fontSize:13 }}>/ projekte</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <button
              onClick={() => router.push('/')}
              style={{ background:`linear-gradient(135deg, ${T.accent}, #8b68d4)`, border:'none', borderRadius:9999, color:'#000', fontWeight:700, fontSize:13, padding:'8px 18px', cursor:'pointer' }}>
              + Neues Projekt
            </button>
          </div>
        </nav>

        <main style={{ maxWidth:960, margin:'0 auto', padding:'40px 24px 80px' }}>
          {/* Header */}
          <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:32, flexWrap:'wrap', gap:12 }}>
            <div>
              <h1 style={{ fontSize:32, fontWeight:900, margin:'0 0 6px', letterSpacing:'-1px', color:T.text }}>Meine Projekte</h1>
              <p style={{ color:T.muted, fontSize:14, margin:0 }}>
                {projects.length > 0 ? `${projects.length} Projekt${projects.length !== 1 ? 'e' : ''} — klicke rein um dort weiterzumachen wo du aufgehört hast.` : 'Alle deine Videos — klicke rein um dort weiterzumachen wo du aufgehört hast.'}
              </p>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              {emptyCount > 0 && (
                <button onClick={cleanupEmpty} disabled={deleting}
                  style={{ background:'rgba(239,68,68,.08)', border:'1px solid rgba(239,68,68,.3)', borderRadius:9999, color:T.red, fontSize:12, fontWeight:600, padding:'6px 14px', cursor:'pointer', whiteSpace:'nowrap', transition:'background .15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,.15)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,.08)'}>
                  {deleting ? '…' : `🗑 ${emptyCount} leere${emptyCount !== 1 ? '' : 's'} Projekt${emptyCount !== 1 ? 'e' : ''} löschen`}
                </button>
              )}
              {totalPages > 1 && (
                <span style={{ fontSize:13, color:T.muted }}>
                  Seite {page} / {totalPages}
                </span>
              )}
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign:'center', padding:'60px 0', color:T.muted }}>
              <div style={{ width:24, height:24, border:`2px solid ${T.border}`, borderTopColor:T.accent, borderRadius:'50%', animation:'spin .7s linear infinite', margin:'0 auto 12px' }} />
              Projekte laden…
            </div>
          ) : projects.length === 0 ? (
            <div style={{ textAlign:'center', padding:'80px 0', animation:'fadeIn .3s' }}>
              <div style={{ fontSize:48, marginBottom:16 }}>🎬</div>
              <p style={{ color:T.muted, fontSize:16, marginBottom:24 }}>Noch keine Projekte vorhanden.</p>
              <button onClick={() => router.push('/')}
                style={{ background:`linear-gradient(135deg, ${T.accent}, #8b68d4)`, border:'none', borderRadius:9999, color:'#000', fontWeight:700, fontSize:14, padding:'12px 28px', cursor:'pointer' }}>
                + Erstes Projekt erstellen
              </button>
            </div>
          ) : (
            <>
              <div style={{ display:'flex', flexDirection:'column', gap:10, animation:'fadeIn .3s' }}>
                {paged.map(p => {
                  const status = projectStatus(p);
                  const name = projectName(p);
                  const scenes = p.scenes ?? [];
                  const approved = scenes.filter(s => s.imageApproved).length;
                  const withImg = scenes.filter(s => s.imageFile).length;
                  const isConfirm = confirmDel === p.id;
                  const thumbUrl = firstScreenshotUrl(p);

                  return (
                    <div key={p.id}
                      style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:16, display:'flex', alignItems:'center', gap:0, overflow:'hidden', transition:'border-color .15s', cursor:'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = T.accentBrd}
                      onMouseLeave={e => e.currentTarget.style.borderColor = T.border}
                      onClick={() => !isConfirm && router.push(projectRoute(p))}>

                      {/* Thumbnail — erster Screenshot im Hochformat */}
                      <div style={{ width:54, flexShrink:0, alignSelf:'stretch', background:T.subtle, overflow:'hidden', position:'relative' }}>
                        {thumbUrl ? (
                          <img
                            src={thumbUrl}
                            alt=""
                            style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition:'center top', display:'block' }}
                            onError={e => { e.currentTarget.style.display = 'none'; }}
                          />
                        ) : (
                          <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, color:T.muted }}>
                            🎬
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div style={{ flex:1, minWidth:0, padding:'14px 18px' }}>
                        <div style={{ fontWeight:700, fontSize:14, color:T.text, marginBottom:4, display:'flex', alignItems:'center', gap:6, minWidth:0 }}>
                          {renamingId === p.id ? (
                            <input
                              ref={renameRef}
                              value={renameVal}
                              onChange={e => setRenameVal(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') submitRename(p.id); if (e.key === 'Escape') setRenamingId(null); }}
                              onBlur={() => submitRename(p.id)}
                              onClick={e => e.stopPropagation()}
                              style={{ flex:1, minWidth:0, background:'#1a1a1a', border:`1px solid ${T.accentBrd}`, borderRadius:6, color:T.text, fontSize:14, fontWeight:700, padding:'2px 8px', outline:'none' }}
                            />
                          ) : (
                            <>
                              <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</span>
                              <button
                                onClick={e => { e.stopPropagation(); startRename(p); }}
                                title="Umbenennen"
                                style={{ flexShrink:0, background:'none', border:'none', cursor:'pointer', color:'#444', padding:'2px 4px', lineHeight:1, borderRadius:4, transition:'color .15s' }}
                                onMouseEnter={e => e.currentTarget.style.color = T.accent}
                                onMouseLeave={e => e.currentTarget.style.color = '#444'}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                </svg>
                              </button>
                              {isAdmin && p.ownerEmail && (
                                <span style={{ flexShrink:0, fontSize:10, color:'#888', background:'#1a1a1a', border:'1px solid #2a2a2a', borderRadius:4, padding:'1px 6px', fontWeight:500, letterSpacing:'0.02em' }}>
                                  {p.ownerName ? `${p.ownerName}` : p.ownerEmail.split('@')[0]}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                          <span style={{ fontSize:12, color:status.color, fontWeight:600 }}>{status.label}</span>
                          {scenes.length > 0 && p.setup && (
                            <>
                              <span style={{ fontSize:11, color:'#333' }}>·</span>
                              <span style={{ fontSize:11, color:T.muted }}>
                                {p.setup?.format ?? '?'} · {scenes.length} Szenen
                              </span>
                            </>
                          )}
                          <span style={{ fontSize:11, color:'#333' }}>·</span>
                          <span style={{ fontSize:11, color:T.muted }}>{fmt(p.createdAt)}</span>
                        </div>
                      </div>

                      {/* Progress pills */}
                      {scenes.length > 0 && (
                        <div style={{ display:'flex', gap:6, flexShrink:0, padding:'0 12px' }}>
                          {withImg > 0 && (
                            <span style={{ fontSize:11, fontWeight:700, color:T.accent, background:T.accentBg, border:`1px solid ${T.accentBrd}`, borderRadius:9999, padding:'3px 9px', whiteSpace:'nowrap' }}>
                              {withImg}/{scenes.length} Bilder
                            </span>
                          )}
                          {approved > 0 && (
                            <span style={{ fontSize:11, fontWeight:700, color:T.green, background:T.greenBg, border:`1px solid ${T.greenBrd}`, borderRadius:9999, padding:'3px 9px', whiteSpace:'nowrap' }}>
                              {approved} ✓
                            </span>
                          )}
                        </div>
                      )}

                      {/* Action buttons */}
                      {p.exportStatus === 'done' && p.exportFile ? (
                        <div style={{ display:'flex', flexShrink:0, alignSelf:'stretch', borderLeft:`1px solid ${T.border}` }}>
                          {/* Download */}
                          <a
                            href={`/api/projects/${p.id}/exports/${p.exportFile}`}
                            download={p.exportFile}
                            onClick={e => e.stopPropagation()}
                            style={{
                              display:'flex', alignItems:'center', padding:'0 18px',
                              background:'rgba(34,197,94,0.08)',
                              color:T.green, fontWeight:700, fontSize:12,
                              textDecoration:'none', whiteSpace:'nowrap',
                              borderRight:`1px solid ${T.border}`,
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(34,197,94,0.15)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(34,197,94,0.08)'}>
                            ⬇ Herunterladen
                          </a>
                          {/* Edit again */}
                          <button
                            onClick={e => { e.stopPropagation(); router.push(`/scenes/${p.id}`); }}
                            style={{ background:T.accentBg, border:'none', color:T.accent, fontWeight:700, fontSize:12, padding:'0 18px', cursor:'pointer', whiteSpace:'nowrap', alignSelf:'stretch', transition:'background .15s' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(181,152,226,0.15)'}
                            onMouseLeave={e => e.currentTarget.style.background = T.accentBg}>
                            ✏ Erneut bearbeiten
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={e => { e.stopPropagation(); router.push(projectRoute(p)); }}
                          style={{ flexShrink:0, background:T.accentBg, border:'none', borderLeft:`1px solid ${T.border}`, color:T.accent, fontWeight:700, fontSize:12, padding:'0 20px', cursor:'pointer', whiteSpace:'nowrap', alignSelf:'stretch', transition:'background .15s' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(181,152,226,0.15)'}
                          onMouseLeave={e => e.currentTarget.style.background = T.accentBg}>
                          Weitermachen →
                        </button>
                      )}

                      {/* Delete */}
                      <div onClick={e => e.stopPropagation()} style={{ flexShrink:0, borderLeft:`1px solid ${T.border}`, alignSelf:'stretch', display:'flex', alignItems:'center' }}>
                        {scenes.length === 0 ? (
                          // Leeres Projekt: direkt löschen ohne Confirm
                          <button onClick={() => deleteProject(p.id)} disabled={deleting} title="Leeres Projekt entfernen"
                            style={{ background:'rgba(239,68,68,.08)', border:'none', cursor:'pointer', color:T.red, padding:'0 14px', display:'flex', alignItems:'center', alignSelf:'stretch', fontSize:11, fontWeight:600, gap:4, transition:'background .15s' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,.18)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,.08)'}>
                            🗑 Entfernen
                          </button>
                        ) : isConfirm ? (
                          <div style={{ display:'flex', alignItems:'center', gap:6, padding:'0 14px' }}>
                            <span style={{ fontSize:11, color:T.red, whiteSpace:'nowrap' }}>Löschen?</span>
                            <button onClick={() => deleteProject(p.id)} disabled={deleting}
                              style={{ background:'rgba(239,68,68,.15)', border:`1px solid rgba(239,68,68,.4)`, borderRadius:9999, color:T.red, fontSize:11, fontWeight:700, padding:'4px 10px', cursor:'pointer' }}>
                              {deleting ? '…' : 'Ja'}
                            </button>
                            <button onClick={() => setConfirmDel(null)}
                              style={{ background:'none', border:`1px solid ${T.border}`, borderRadius:9999, color:T.muted, fontSize:11, padding:'4px 10px', cursor:'pointer' }}>
                              Nein
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => setConfirmDel(p.id)} title="Projekt löschen"
                            style={{ background:'none', border:'none', cursor:'pointer', color:'#3a3a3a', padding:'0 14px', display:'flex', alignItems:'center', alignSelf:'stretch', transition:'color .15s' }}
                            onMouseEnter={e => e.currentTarget.style.color = T.red}
                            onMouseLeave={e => e.currentTarget.style.color = '#3a3a3a'}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6"/>
                              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                              <path d="M10 11v6M14 11v6"/>
                              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                            </svg>
                          </button>
                        )}
                      </div>

                    </div>
                  );
                })}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{ display:'flex', justifyContent:'center', alignItems:'center', gap:8, marginTop:32 }}>
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    style={{ background:'none', border:`1px solid ${page === 1 ? T.subtle : T.border}`, borderRadius:9999, color: page === 1 ? '#333' : T.muted, fontSize:13, padding:'7px 16px', cursor: page === 1 ? 'default' : 'pointer', transition:'all .15s' }}
                    onMouseEnter={e => { if (page > 1) { e.currentTarget.style.borderColor = T.accentBrd; e.currentTarget.style.color = T.accent; }}}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = page === 1 ? T.subtle : T.border; e.currentTarget.style.color = page === 1 ? '#333' : T.muted; }}>
                    ← Zurück
                  </button>

                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
                    <button key={n}
                      onClick={() => setPage(n)}
                      style={{
                        background: n === page ? T.accentBg : 'none',
                        border: `1px solid ${n === page ? T.accentBrd : T.border}`,
                        borderRadius:9999, color: n === page ? T.accent : T.muted,
                        fontWeight: n === page ? 700 : 400,
                        fontSize:13, padding:'7px 14px', cursor:'pointer', minWidth:38, transition:'all .15s',
                      }}
                      onMouseEnter={e => { if (n !== page) { e.currentTarget.style.borderColor = T.accentBrd; e.currentTarget.style.color = T.accent; }}}
                      onMouseLeave={e => { if (n !== page) { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.muted; }}}>
                      {n}
                    </button>
                  ))}

                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    style={{ background:'none', border:`1px solid ${page === totalPages ? T.subtle : T.border}`, borderRadius:9999, color: page === totalPages ? '#333' : T.muted, fontSize:13, padding:'7px 16px', cursor: page === totalPages ? 'default' : 'pointer', transition:'all .15s' }}
                    onMouseEnter={e => { if (page < totalPages) { e.currentTarget.style.borderColor = T.accentBrd; e.currentTarget.style.color = T.accent; }}}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = page === totalPages ? T.subtle : T.border; e.currentTarget.style.color = page === totalPages ? '#333' : T.muted; }}>
                    Weiter →
                  </button>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </>
  );
}
