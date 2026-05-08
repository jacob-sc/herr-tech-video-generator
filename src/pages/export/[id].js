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
  redBrd:    'rgba(239,68,68,0.25)',
};

const FONTS = ['Inter', 'Arial', 'Impact', 'Georgia', 'Oswald', 'Bebas Neue'];

const POSITIONS = [
  ['top-left', 'top-center', 'top-right'],
  ['middle-left', 'middle-center', 'middle-right'],
  ['bottom-left', 'bottom-center', 'bottom-right'],
];

const POSITION_LABELS = {
  'top-left': '↖', 'top-center': '↑', 'top-right': '↗',
  'middle-left': '←', 'middle-center': '·', 'middle-right': '→',
  'bottom-left': '↙', 'bottom-center': '↓', 'bottom-right': '↘',
};

function fmt(sec) {
  if (sec == null || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function fmtSec(sec) {
  if (!sec) return '0.0s';
  return `${Number(sec).toFixed(1)}s`;
}

function Pill({ children }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 9999, background: T.subtle, color: T.muted, border: `1px solid ${T.border}` }}>
      {children}
    </span>
  );
}

// ── Breadcrumb ───────────────────────────────────────────────────────────────
function Breadcrumb({ projectId, router }) {
  const steps = ['1 Upload & Analyse', '2 Bilder generieren', '3 Videos generieren', '4 Export'];
  const links = ['/', `/scenes/${projectId}`, `/videos/${projectId}`, `/export/${projectId}`];
  const active = 3;

  const [visited, setVisited] = useState([]);

  useEffect(() => {
    if (!projectId) return;
    try {
      const stored = JSON.parse(localStorage.getItem(`visited_v3_${projectId}`) || '[]');
      setVisited(stored.filter(i => i >= 0 && i <= 3));
    } catch {}
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    setVisited(prev => {
      const next = prev.includes(active) ? prev : [...prev, active];
      try { localStorage.setItem(`visited_v3_${projectId}`, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [active, projectId]);

  return (
    <div style={{ padding: '16px 40px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      {steps.map((step, i) => {
        const isActive = i === active;
        const wasPastOrVisited = i < active || visited.includes(i);
        const isClickable = !!links[i] && !isActive && wasPastOrVisited;
        return (
          <div key={step} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {i > 0 && <span style={{ color: wasPastOrVisited || isActive ? T.border : '#1c1c1c' }}>→</span>}
            <span
              onClick={isClickable ? () => router.push(links[i]) : undefined}
              style={{
                fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 9999,
                background: isActive ? T.accentBg : 'transparent',
                border: `1px solid ${isActive ? T.accentBrd : wasPastOrVisited ? '#444444' : '#1e1e1e'}`,
                color: isActive ? T.accent : wasPastOrVisited ? '#b0b0b0' : '#2e2e2e',
                cursor: isClickable ? 'pointer' : 'default',
                transition: 'all .15s',
              }}
              onMouseEnter={e => { if (isClickable) { e.currentTarget.style.borderColor = T.accentBrd; e.currentTarget.style.color = T.accent; } }}
              onMouseLeave={e => { if (isClickable) { e.currentTarget.style.borderColor = '#444444'; e.currentTarget.style.color = '#b0b0b0'; } }}>
              {step}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── splitSubtitle helper ─────────────────────────────────────────────────────
// Teilt Untertitel-Text in Segmente von max. 8 Wörtern auf.
// Funktioniert immer — unabhängig davon ob videoDuration bekannt ist.
const MAX_SUBTITLE_WORDS = 8;

function splitSubtitle(text, durationSeconds) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const n = words.length;
  const dur = durationSeconds || 5; // Fallback-Schätzung wenn Dauer unbekannt

  if (n <= MAX_SUBTITLE_WORDS) {
    return [{ text: words.join(' '), startSec: 0, endSec: dur }];
  }

  // Chunks von max. 8 Wörtern erstellen
  const chunks = [];
  for (let i = 0; i < n; i += MAX_SUBTITLE_WORDS) {
    chunks.push(words.slice(i, i + MAX_SUBTITLE_WORDS).join(' '));
  }

  // Zeitverteilung proportional zur Wortanzahl pro Chunk
  const segDur = dur / chunks.length;
  return chunks.map((t, i) => ({
    text: t,
    startSec: i * segDur,
    endSec: (i + 1) * segDur,
  }));
}

function Spinner({ size = 14, color = T.accent }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%',
      border: `2px solid rgba(181,152,226,0.25)`,
      borderTopColor: color,
      display: 'inline-block',
      animation: 'spin .7s linear infinite',
      flexShrink: 0,
    }} />
  );
}

function hexWithOpacity(hex, opacity) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}

function buildTextShadow(subtitleStyle) {
  if (!subtitleStyle.shadowEnabled) return undefined;
  return `2px 2px 4px ${subtitleStyle.shadowColor || '#000000'}`;
}

// ── Toggle ───────────────────────────────────────────────────────────────────
function Toggle({ value, onChange }) {
  return (
    <div
      onClick={() => onChange(!value)}
      style={{
        width: 36, height: 20, borderRadius: 10,
        background: value ? T.accent : T.subtle,
        border: `1px solid ${value ? T.accentBrd : T.border}`,
        position: 'relative', cursor: 'pointer', transition: 'background .2s',
        flexShrink: 0,
      }}>
      <div style={{
        position: 'absolute', top: 3,
        left: value ? 17 : 3,
        width: 12, height: 12, borderRadius: '50%',
        background: value ? '#fff' : T.muted,
        transition: 'left .2s',
      }} />
    </div>
  );
}

// ── Subtitle Preview Mockup ──────────────────────────────────────────────────
function SubtitlePreview({ subtitleStyle, sampleText, format }) {
  const isPortrait = format === '9:16';
  const w = isPortrait ? 108 : 180;
  const h = isPortrait ? 192 : 101;

  const pos = subtitleStyle.position || 'bottom-center';
  const [row, col] = (() => {
    if (pos.startsWith('top')) return [0, pos.endsWith('left') ? 0 : pos.endsWith('right') ? 2 : 1];
    if (pos.startsWith('middle')) return [1, pos.endsWith('left') ? 0 : pos.endsWith('right') ? 2 : 1];
    return [2, pos.endsWith('left') ? 0 : pos.endsWith('right') ? 2 : 1];
  })();

  const alignH = col === 0 ? 'flex-start' : col === 2 ? 'flex-end' : 'center';
  const alignV = row === 0 ? 'flex-start' : row === 2 ? 'flex-end' : 'center';

  const textStyle = {
    fontFamily: subtitleStyle.fontFamily || 'Arial',
    fontSize: Math.round((subtitleStyle.fontSize || 60) * (w / (isPortrait ? 1080 : 1920))),
    fontWeight: subtitleStyle.fontWeight === 'bold' ? 700 : 400,
    color: subtitleStyle.fontColor || '#ffffff',
    textAlign: col === 0 ? 'left' : col === 2 ? 'right' : 'center',
    lineHeight: 1.3,
    maxWidth: '85%',
    padding: subtitleStyle.bgBoxEnabled ? '3px 6px' : '0',
    background: subtitleStyle.bgBoxEnabled
      ? hexWithOpacity(subtitleStyle.bgBoxColor || '#000000', subtitleStyle.bgBoxOpacity ?? 0.6)
      : 'transparent',
    borderRadius: subtitleStyle.bgBoxEnabled ? 3 : 0,
    textShadow: buildTextShadow(subtitleStyle),
    WebkitTextStroke: subtitleStyle.outlineEnabled && subtitleStyle.outlineWidth
      ? `${subtitleStyle.outlineWidth * (w / (isPortrait ? 1080 : 1920))}px ${subtitleStyle.outlineColor || '#000000'}`
      : undefined,
  };

  return (
    <div style={{
      width: w, height: h,
      background: 'linear-gradient(160deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
      borderRadius: 8,
      border: `1px solid ${T.border}`,
      position: 'relative',
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      {isPortrait && (
        <div style={{ position: 'absolute', top: 4, left: '50%', transform: 'translateX(-50%)', width: 24, height: 4, background: '#333', borderRadius: 2 }} />
      )}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex',
        alignItems: alignV,
        justifyContent: alignH,
        padding: isPortrait ? '14px 8px' : '8px 10px',
      }}>
        <div style={textStyle}>{sampleText || 'Beispieltext hier'}</div>
      </div>
    </div>
  );
}

// ── Compact Style Panel ──────────────────────────────────────────────────────
function StylePanel({ style: s, onChange }) {
  const set = (key, val) => onChange({ ...s, [key]: val });

  const rowStyle = { display: 'flex', alignItems: 'center', gap: 6, minHeight: 28 };
  const labelStyle = { fontSize: 10, color: T.muted, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0, minWidth: 52 };
  const inputBase = {
    background: T.surface, border: `1px solid ${T.border}`,
    borderRadius: 6, color: T.text, fontSize: 11, padding: '3px 6px', outline: 'none',
  };
  const colorPickerStyle = {
    width: 26, height: 26, border: `1px solid ${T.border}`,
    borderRadius: 4, cursor: 'pointer', background: 'none', padding: 2, flexShrink: 0,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={rowStyle}>
        <span style={labelStyle}>Schrift</span>
        <select value={s.fontFamily || 'Arial'} onChange={e => set('fontFamily', e.target.value)} style={{ ...inputBase, flex: 1 }}>
          {FONTS.map(f => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
        </select>
        <button
          onClick={() => set('fontWeight', s.fontWeight === 'bold' ? 'normal' : 'bold')}
          style={{
            ...inputBase, fontWeight: 700, padding: '3px 10px',
            background: s.fontWeight === 'bold' ? T.accentBg : T.subtle,
            border: `1px solid ${s.fontWeight === 'bold' ? T.accentBrd : T.border}`,
            color: s.fontWeight === 'bold' ? T.accent : T.muted,
            cursor: 'pointer', flexShrink: 0,
          }}>B</button>
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>Größe</span>
        <input type="range" min={20} max={100} value={s.fontSize || 60} onChange={e => set('fontSize', parseInt(e.target.value))} style={{ flex: 1, accentColor: T.accent }} />
        <span style={{ fontSize: 10, color: T.accent, flexShrink: 0, minWidth: 28, textAlign: 'right' }}>{s.fontSize || 60}px</span>
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>Farbe</span>
        <input type="color" value={s.fontColor || '#ffffff'} onChange={e => set('fontColor', e.target.value)} style={colorPickerStyle} />
        <input type="text" value={s.fontColor || '#ffffff'} onChange={e => set('fontColor', e.target.value)} style={{ ...inputBase, width: 72 }} />
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>Kontur</span>
        <Toggle value={!!s.outlineEnabled} onChange={v => set('outlineEnabled', v)} />
        {s.outlineEnabled && (
          <>
            <input type="color" value={s.outlineColor || '#000000'} onChange={e => set('outlineColor', e.target.value)} style={colorPickerStyle} />
            <input type="range" min={1} max={5} value={s.outlineWidth || 2} onChange={e => set('outlineWidth', parseInt(e.target.value))} style={{ flex: 1, accentColor: T.accent }} />
            <span style={{ fontSize: 10, color: T.muted, flexShrink: 0, minWidth: 20 }}>{s.outlineWidth || 2}px</span>
          </>
        )}
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>Schatten</span>
        <Toggle value={!!s.shadowEnabled} onChange={v => set('shadowEnabled', v)} />
        {s.shadowEnabled && (
          <input type="color" value={s.shadowColor || '#000000'} onChange={e => set('shadowColor', e.target.value)} style={colorPickerStyle} />
        )}
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>HG-Box</span>
        <Toggle value={!!s.bgBoxEnabled} onChange={v => set('bgBoxEnabled', v)} />
        {s.bgBoxEnabled && (
          <>
            <input type="color" value={s.bgBoxColor || '#000000'} onChange={e => set('bgBoxColor', e.target.value)} style={colorPickerStyle} />
            <input type="range" min={0} max={1} step={0.05} value={s.bgBoxOpacity ?? 0.6} onChange={e => set('bgBoxOpacity', parseFloat(e.target.value))} style={{ flex: 1, accentColor: T.accent }} />
            <span style={{ fontSize: 10, color: T.muted, flexShrink: 0, minWidth: 28 }}>{Math.round((s.bgBoxOpacity ?? 0.6) * 100)}%</span>
          </>
        )}
      </div>
    </div>
  );
}

// ── Scene Card (tall, bigger video) ─────────────────────────────────────────
function SceneCard({ clip, index, total, onUpdate, onMove, projectId, format,
                     isDragOver, onDragStart, onDragOver, onDrop, onDragEnd }) {
  const [localScript, setLocalScript] = useState(clip.script || '');
  const [currentTime, setCurrentTime] = useState(0);
  const scriptTimer = useRef(null);
  const videoRef = useRef(null);
  const trimTimerRef = useRef(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);

  useEffect(() => { setLocalScript(clip.script || ''); }, [clip.script]);

  const handleScriptChange = (val) => {
    setLocalScript(val);
    if (scriptTimer.current) clearTimeout(scriptTimer.current);
    scriptTimer.current = setTimeout(() => { onUpdate({ script: val }); }, 400);
  };

  const videoSrc = clip.videoFile
    ? `/api/projects/${projectId}/media/generated-videos/${clip.videoFile}`
    : null;

  const trimStart = clip.trimStart || 0;
  const trimEnd = clip.trimEnd || 0;
  const trimmedDuration = clip.videoDuration
    ? Math.max(0, clip.videoDuration - trimStart - trimEnd)
    : null;
  const endTime = clip.videoDuration != null ? clip.videoDuration - trimEnd : null;

  const isPortrait = format === '9:16';
  const videoW = isPortrait ? 140 : 200;
  const videoAspect = isPortrait ? '9/16' : '16/9';

  const playTrimPreview = () => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = trimStart;
    v.play();
    setIsPreviewPlaying(true);
    if (trimTimerRef.current) clearInterval(trimTimerRef.current);
    trimTimerRef.current = setInterval(() => {
      if (!videoRef.current) { clearInterval(trimTimerRef.current); return; }
      setCurrentTime(videoRef.current.currentTime);
      if (endTime != null && videoRef.current.currentTime >= endTime) {
        videoRef.current.pause();
        videoRef.current.currentTime = trimStart;
        setCurrentTime(trimStart);
        setIsPreviewPlaying(false);
        clearInterval(trimTimerRef.current);
      }
    }, 50);
  };

  const stopPreview = () => {
    const v = videoRef.current;
    if (v) { v.pause(); v.currentTime = trimStart; }
    setCurrentTime(trimStart);
    setIsPreviewPlaying(false);
    if (trimTimerRef.current) clearInterval(trimTimerRef.current);
  };

  useEffect(() => () => { if (trimTimerRef.current) clearInterval(trimTimerRef.current); }, []);

  // Trim bar calculations (0–1 ratios)
  const dur = clip.videoDuration;
  const barStart = dur ? trimStart / dur : 0;
  const barEnd   = dur && endTime != null ? endTime / dur : 1;
  const barHead  = dur ? currentTime / dur : 0;

  return (
    <div
      onDragOver={e => { e.preventDefault(); onDragOver(); }}
      onDrop={e => { e.preventDefault(); onDrop(); }}
      style={{
        background: T.card,
        border: `1px solid ${isDragOver ? T.accent : clip.include ? T.border : T.subtle}`,
        borderRadius: 12,
        overflow: 'hidden',
        opacity: clip.include ? 1 : 0.5,
        transition: 'opacity .2s, border-color .15s',
        display: 'flex',
        alignItems: 'stretch',
        boxShadow: isDragOver ? `0 0 0 2px ${T.accentBrd}` : 'none',
        cursor: 'default',
      }}>

      {/* Drag handle column — drag from here to reorder */}
      <div
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 6, padding: '8px 10px',
          borderRight: `1px solid ${T.border}`,
          background: T.surface, flexShrink: 0, width: 44,
          cursor: 'grab',
          userSelect: 'none',
        }}>
        <span style={{ fontSize: 16, color: T.muted, lineHeight: 1, letterSpacing: '-1px' }}>⠿</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: T.muted }}>{index + 1}</span>
      </div>

      {/* Video thumbnail + trim bar */}
      <div style={{
        width: videoW, flexShrink: 0,
        borderRight: `1px solid ${T.border}`,
        position: 'relative',
        display: 'flex', alignItems: 'stretch', flexDirection: 'column',
        background: '#080808',
      }}>
        {videoSrc ? (
          <video
            ref={videoRef}
            src={videoSrc}
            style={{ width: '100%', display: 'block', aspectRatio: videoAspect, objectFit: 'cover', flex: 1 }}
            playsInline
            onLoadedMetadata={e => {
              const d = e.target.duration;
              if (d && isFinite(d) && clip.videoDuration == null) {
                onUpdate({ videoDuration: parseFloat(d.toFixed(2)) });
              }
            }}
          />
        ) : (
          <div style={{
            flex: 1, aspectRatio: videoAspect,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: T.muted, fontSize: 11, flexDirection: 'column', gap: 4,
          }}>
            <span style={{ fontSize: 20, opacity: 0.3 }}>🎬</span>
            <span>Kein Video</span>
          </div>
        )}
        {/* ▶ Vorschau button — slightly above the bar */}
        {videoSrc && (
          <button
            onClick={isPreviewPlaying ? stopPreview : playTrimPreview}
            style={{
              position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
              background: isPreviewPlaying ? 'rgba(239,68,68,0.9)' : 'rgba(181,152,226,0.9)',
              border: 'none', borderRadius: 9999, color: '#fff',
              fontSize: 10, fontWeight: 700, padding: '4px 10px', cursor: 'pointer',
              whiteSpace: 'nowrap', backdropFilter: 'blur(4px)',
              zIndex: 2,
            }}>
            {isPreviewPlaying ? '■ Stop' : '▶ Vorschau'}
          </button>
        )}
        {/* Trim / progress bar */}
        <div style={{
          height: 8, flexShrink: 0, background: '#1a1a1a',
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Active (trimmed-in) region */}
          <div style={{
            position: 'absolute', top: 0, bottom: 0,
            left: `${barStart * 100}%`,
            width: `${(barEnd - barStart) * 100}%`,
            background: T.accent,
            opacity: 0.5,
          }} />
          {/* Playhead */}
          {dur && (
            <div style={{
              position: 'absolute', top: 0, bottom: 0,
              left: `${barHead * 100}%`,
              width: 2,
              background: isPreviewPlaying ? '#fff' : 'rgba(255,255,255,0.3)',
              borderRadius: 1,
              transition: isPreviewPlaying ? 'none' : 'background .3s',
            }} />
          )}
        </div>
      </div>

      {/* Time / trim column */}
      <div style={{
        flexShrink: 0, padding: '12px 14px',
        borderRight: `1px solid ${T.border}`,
        display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6,
        minWidth: 140,
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Zeit</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: T.muted, minWidth: 22, flexShrink: 0 }}>Von</span>
          <input
            type="number" min={0} step={0.1}
            value={trimStart}
            onChange={e => { stopPreview(); onUpdate({ trimStart: parseFloat(e.target.value) || 0 }); }}
            style={{
              width: 52, background: T.surface, border: `1px solid ${T.border}`,
              borderRadius: 6, color: T.text, fontSize: 12, padding: '3px 6px', outline: 'none',
            }}
          />
          <span style={{ fontSize: 11, color: T.muted }}>s</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: T.muted, minWidth: 22, flexShrink: 0 }}>Bis</span>
          <input
            type="number" min={0} step={0.1}
            value={endTime != null ? parseFloat(endTime.toFixed(1)) : ''}
            placeholder={clip.videoDuration == null ? '…' : '0'}
            onChange={e => {
              stopPreview();
              const val = parseFloat(e.target.value) || 0;
              const newTrimEnd = clip.videoDuration ? Math.max(0, clip.videoDuration - val) : 0;
              onUpdate({ trimEnd: parseFloat(newTrimEnd.toFixed(2)) });
            }}
            style={{
              width: 52, background: T.surface, border: `1px solid ${T.border}`,
              borderRadius: 6, color: T.text, fontSize: 12, padding: '3px 6px', outline: 'none',
            }}
          />
          <span style={{ fontSize: 11, color: T.muted }}>s</span>
        </div>
        {trimmedDuration != null ? (
          <div style={{ fontSize: 11, color: T.accent, fontWeight: 700, marginTop: 2 }}>
            → {trimmedDuration.toFixed(1)}s
          </div>
        ) : (
          <div style={{ fontSize: 11, color: T.subtle }}>→ lädt…</div>
        )}
      </div>

      {/* Script textarea */}
      <div style={{
        flex: 1, padding: '12px 14px',
        borderRight: `1px solid ${T.border}`,
        display: 'flex', flexDirection: 'column', gap: 4,
        justifyContent: 'center',
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Untertitel</div>
        <textarea
          value={localScript}
          onChange={e => handleScriptChange(e.target.value)}
          rows={3}
          style={{
            width: '100%', resize: 'none',
            background: T.surface, border: `1px solid ${T.border}`,
            borderRadius: 8, color: T.text, fontSize: 13, padding: '6px 10px',
            outline: 'none', lineHeight: 1.5,
          }}
        />
      </div>

      {/* Include toggle */}
      <div style={{
        flexShrink: 0, padding: '12px 16px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
      }}>
        <Toggle value={!!clip.include} onChange={v => onUpdate({ include: v })} />
        <span style={{ fontSize: 10, color: clip.include ? T.accent : T.muted, fontWeight: 600 }}>
          {clip.include ? 'Inkl.' : 'Aus'}
        </span>
      </div>
    </div>
  );
}

// ── Main Export Page ─────────────────────────────────────────────────────────
export default function ExportPage() {
  const router = useRouter();
  const { id } = router.query;

  const [project, setProject] = useState(null);
  const [clips, setClips] = useState([]);
  const [subtitleStyle, setSubtitleStyle] = useState({
    position: 'bottom-center',
    fontFamily: 'Arial',
    fontSize: 60,
    fontColor: '#ffffff',
    fontWeight: 'bold',
    outlineEnabled: true,
    outlineColor: '#000000',
    outlineWidth: 2,
    shadowEnabled: false,
    shadowColor: '#000000',
    bgBoxEnabled: false,
    bgBoxColor: '#000000',
    bgBoxOpacity: 0.6,
  });
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(true);
  const [exportStatus, setExportStatus] = useState('idle');
  const [exportFile, setExportFile] = useState(null);
  const [exportError, setExportError] = useState(null);
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const pollRef = useRef(null);
  const saveTimer = useRef(null);

  // ── Persist clips + subtitleStyle to localStorage ────────────────────────
  const persistKey = id ? `export_state_${id}` : null;

  const saveToStorage = useCallback((clipsToSave, styleToSave, subtitlesEnabledToSave) => {
    if (!persistKey) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(persistKey, JSON.stringify({
          clips: clipsToSave.map(c => ({
            sceneIdx: c.sceneIdx, script: c.script,
            trimStart: c.trimStart, trimEnd: c.trimEnd,
            include: c.include,
            videoFile: c.videoFile,
            // videoDuration wird NICHT gespeichert — immer frisch via onLoadedMetadata laden
          })),
          subtitleStyle: styleToSave,
          subtitlesEnabled: subtitlesEnabledToSave,
        }));
      } catch {}
    }, 400);
  }, [persistKey]);

  // Auto-save whenever clips or style change
  useEffect(() => {
    if (clips.length > 0) saveToStorage(clips, subtitleStyle, subtitlesEnabled);
  }, [clips, subtitleStyle, subtitlesEnabled]);

  // Load project
  useEffect(() => {
    if (!id) return;
    fetch(`/api/projects/${id}`)
      .then(r => r.json())
      .then(data => {
        setProject(data);
        const scenes = data.scenes || [];

        // Build initial clips from project
        const initialClips = scenes.map((scene, i) => ({
          sceneIdx: i,
          videoFile: scene.videoFile || null,
          script: scene.manualText?.trim() || scene.transcriptText?.trim() || scene.text?.trim() || '',
          trimStart: 0,
          trimEnd: 0,
          include: !!scene.videoFile,
          videoDuration: null,
        }));

        // Restore saved state from localStorage (merge: keep videoFile from project, restore user edits)
        try {
          const saved = JSON.parse(localStorage.getItem(`export_state_${id}`) || 'null');
          if (saved?.clips && Array.isArray(saved.clips)) {
            const savedByIdx = {};
            saved.clips.forEach(c => { savedByIdx[c.sceneIdx] = c; });
            initialClips.forEach((clip, i) => {
              const s = savedByIdx[clip.sceneIdx];
              if (s) {
                // Wenn ein neues Video generiert wurde (anderer videoFile-Name),
                // werden Trim-Werte und Include zurückgesetzt
                const videoFileChanged = !!(s.videoFile && clip.videoFile && s.videoFile !== clip.videoFile);
                initialClips[i] = {
                  ...clip,
                  // Projekt-Skript hat Priorität (Änderungen aus Videos-/Szenen-Seite)
                  // localStorage nur als Fallback wenn Projekt kein Skript hat
                  script: clip.script || s.script || '',
                  trimStart: videoFileChanged ? 0 : (s.trimStart ?? 0),
                  trimEnd: videoFileChanged ? 0 : (s.trimEnd ?? 0),
                  include: videoFileChanged ? !!clip.videoFile : (s.include ?? clip.include),
                  // videoDuration immer null — wird via onLoadedMetadata des Video-Elements gesetzt
                  videoDuration: null,
                };
              }
            });
          }
          if (saved?.subtitleStyle) {
            setSubtitleStyle(saved.subtitleStyle);
          }
          if (saved?.subtitlesEnabled !== undefined) {
            setSubtitlesEnabled(saved.subtitlesEnabled);
          }
        } catch {}

        setClips(initialClips);

        if (data.exportStatus === 'processing') {
          setExportStatus('processing');
          startPolling();
        } else if (data.exportStatus === 'done' && data.exportFile) {
          setExportStatus('done');
          setExportFile(data.exportFile);
        }
      })
      .catch(console.error);
  }, [id]);

  // Video durations are loaded via onLoadedMetadata on the video elements in SceneCard

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects/${id}/export-status`);
        const data = await res.json();
        if (data.status === 'done') {
          setExportStatus('done');
          setExportFile(data.exportFile);
          clearInterval(pollRef.current);
          pollRef.current = null;
        } else if (data.status === 'error') {
          setExportStatus('error');
          setExportError(data.exportError || 'Unbekannter Fehler');
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch {}
    }, 4000);
  }, [id]);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const scriptSaveTimers = useRef({});
  const updateClip = (index, updates) => {
    setClips(prev => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
    // Script-Änderungen auch ins Projekt zurückschreiben
    if (updates.script !== undefined) {
      const clip = clips[index];
      const sceneIdx = clip?.sceneIdx ?? index;
      if (scriptSaveTimers.current[index]) clearTimeout(scriptSaveTimers.current[index]);
      scriptSaveTimers.current[index] = setTimeout(() => {
        fetch(`/api/projects/${id}/scenes/${sceneIdx}/update-text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: updates.script }),
        }).catch(() => {});
      }, 500);
    }
  };

  const moveClip = (index, dir) => {
    setClips(prev => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleDragStart = (index) => setDragIdx(index);
  const handleDragOver = (index) => { if (index !== dragIdx) setDragOverIdx(index); };
  const handleDrop = (targetIdx) => {
    if (dragIdx === null || dragIdx === targetIdx) { setDragIdx(null); setDragOverIdx(null); return; }
    setClips(prev => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(targetIdx, 0, moved);
      return next;
    });
    setDragIdx(null); setDragOverIdx(null);
  };
  const handleDragEnd = () => { setDragIdx(null); setDragOverIdx(null); };

  const handleExport = async () => {
    const includedClips = clips.filter(c => c.include && c.videoFile);
    if (includedClips.length === 0) {
      alert('Keine Clips mit Videos ausgewählt.');
      return;
    }
    setExportStatus('processing');
    setExportFile(null);
    setExportError(null);

    const clipsWithSegments = clips.map(clip => {
      const duration = clip.videoDuration
        ? Math.max(0, clip.videoDuration - (clip.trimStart || 0) - (clip.trimEnd || 0))
        : 0;
      return { ...clip, subtitleSegments: splitSubtitle(clip.script || '', duration) };
    });

    try {
      const res = await fetch(`/api/projects/${id}/export-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clips: clipsWithSegments, subtitleStyle, subtitlesEnabled, format: project?.setup?.format || '9:16' }),
      });
      const data = await res.json();
      if (data.ok || data.status === 'processing') {
        startPolling();
      } else {
        setExportStatus('error');
        setExportError(data.error || 'Fehler beim Starten');
      }
    } catch (err) {
      setExportStatus('error');
      setExportError(err.message);
    }
  };

  if (!project) {
    return (
      <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: `3px solid ${T.border}`, borderTopColor: T.accent, animation: 'spin .7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform:rotate(360deg); } }`}</style>
      </div>
    );
  }

  const includedClips = clips.filter(c => c.include && c.videoFile);
  const format = project.setup?.format || '9:16';
  const sampleText = includedClips[0]?.script || 'Beispieltext hier';
  const isProcessing = exportStatus === 'processing';
  const canExport = !isProcessing && includedClips.length > 0;

  const totalDuration = clips
    .filter(c => c.include && c.videoDuration)
    .reduce((sum, c) => sum + Math.max(0, c.videoDuration - (c.trimStart || 0) - (c.trimEnd || 0)), 0);

  return (
    <>
      <Head><title>Export — Herr Tech</title></Head>
      <style>{`
        @keyframes spin { to { transform:rotate(360deg); } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
        * { box-sizing:border-box; }
        textarea, input, select { font-family:inherit; }
        ::-webkit-scrollbar { width:6px; } ::-webkit-scrollbar-track { background:${T.bg}; } ::-webkit-scrollbar-thumb { background:${T.border}; border-radius:3px; }
        input[type=range] { -webkit-appearance:none; appearance:none; height:4px; background:${T.subtle}; border-radius:2px; outline:none; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance:none; appearance:none; width:14px; height:14px; border-radius:50%; background:${T.accent}; cursor:pointer; }
      `}</style>

      <div style={{ minHeight: '100vh', background: T.bg }}>

        {/* ── Nav (consistent with other pages) ────────────────────────── */}
        <nav style={{
          padding: '0 40px', height: 64,
          borderBottom: `1px solid ${T.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, background: T.bg, zIndex: 100,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src="/herr-tech-logo.png" alt="HERR TECH" style={{ height: 18, objectFit: 'contain' }} />
            <span style={{ color: T.muted, fontSize: 13 }}>/ export</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {project.setup?.format && <Pill>{project.setup.format}</Pill>}
            <button
              onClick={() => router.push(`/videos/${id}`)}
              style={{ background: 'none', border: `1px solid ${T.border}`, borderRadius: 9999, color: T.muted, fontSize: 12, padding: '5px 14px', cursor: 'pointer' }}>
              ← Videos
            </button>
            <button
              onClick={() => router.push('/projects')}
              style={{ background: 'none', border: `1px solid ${T.border}`, borderRadius: 9999, color: T.muted, fontSize: 12, padding: '5px 14px', cursor: 'pointer' }}>
              Projekte
            </button>
          </div>
        </nav>

        {/* ── Breadcrumb ───────────────────────────────────────────────── */}
        <Breadcrumb projectId={id} router={router} />

        <main style={{ maxWidth: 1240, margin: '0 auto', padding: '32px 24px 80px' }}>

          {/* ── REWARD: Export fertig ─────────────────────────────────── */}
          {exportStatus === 'done' && exportFile && (
            <div style={{
              background: 'linear-gradient(135deg, rgba(34,197,94,0.08), rgba(34,197,94,0.03))',
              border: `1px solid ${T.greenBrd}`,
              borderRadius: 20, padding: '40px 48px',
              marginBottom: 32,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 32, flexWrap: 'wrap',
              animation: 'fadeIn .4s',
            }}>
              <div>
                <div style={{ fontSize: 40, marginBottom: 8 }}>🎉</div>
                <h2 style={{ fontSize: 28, fontWeight: 900, color: T.green, margin: '0 0 8px', letterSpacing: '-0.5px' }}>
                  Export fertig!
                </h2>
                <p style={{ color: T.muted, fontSize: 14, margin: '0 0 4px' }}>
                  Dein Video wurde erfolgreich exportiert.
                </p>
                <p style={{ color: '#555', fontSize: 12, margin: 0 }}>{exportFile}</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
                <a
                  href={`/api/projects/${id}/exports/${exportFile}`}
                  download={exportFile}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 10,
                    background: `linear-gradient(135deg, ${T.green}, #16a34a)`,
                    color: '#000', fontWeight: 800, fontSize: 16,
                    padding: '14px 32px', borderRadius: 9999,
                    textDecoration: 'none', whiteSpace: 'nowrap',
                    boxShadow: '0 0 24px rgba(34,197,94,0.3)',
                  }}>
                  ⬇ Video herunterladen
                </a>
                <button
                  onClick={handleExport}
                  style={{
                    background: 'none', border: `1px solid ${T.border}`,
                    borderRadius: 9999, color: T.muted, fontSize: 13,
                    padding: '8px 20px', cursor: 'pointer', whiteSpace: 'nowrap',
                  }}>
                  ↺ Erneut exportieren
                </button>
              </div>
            </div>
          )}

          {/* ── Header row ───────────────────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 20, flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ fontSize: 32, fontWeight: 900, margin: '0 0 6px', letterSpacing: '-1px', color: T.text }}>Export</h1>
              <p style={{ color: T.muted, fontSize: 14, margin: 0 }}>
                Untertitel gestalten · Szenen per Drag & Drop sortieren · Clips trimmen & ein-/ausblenden · fertiges Video herunterladen.
              </p>
            </div>
            {/* Count box */}
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: '12px 20px', textAlign: 'center', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4, lineHeight: 1 }}>
                <span style={{ fontSize: 28, fontWeight: 900, color: T.accent }}>{includedClips.length}</span>
                <span style={{ fontSize: 16, fontWeight: 400, color: T.muted }}>/{clips.length}</span>
              </div>
              <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>inkludiert</div>
            </div>
          </div>

          {/* ── Actions row (Export button right) ────────────────────── */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 28, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Status feedback inline */}
            {exportStatus === 'processing' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: T.accentBg, border: `1px solid ${T.accentBrd}`, borderRadius: 8, padding: '7px 14px' }}>
                <Spinner size={12} />
                <span style={{ fontSize: 13, fontWeight: 600, color: T.accent }}>Export läuft…</span>
              </div>
            )}
            {exportStatus === 'done' && exportFile && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: T.greenBg, border: `1px solid ${T.greenBrd}`, borderRadius: 8, padding: '7px 14px' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: T.green }}>✓ Export fertig!</span>
                <a
                  href={`/api/projects/${id}/exports/${exportFile}`}
                  download={exportFile}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    background: T.green, color: '#000',
                    fontWeight: 700, fontSize: 12, padding: '4px 14px',
                    borderRadius: 9999, textDecoration: 'none',
                  }}>
                  ↓ Download
                </a>
              </div>
            )}
            {exportStatus === 'error' && (
              <div style={{ background: T.redBg, border: `1px solid ${T.redBrd}`, borderRadius: 8, padding: '7px 14px' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: T.red }}>✗ {exportError}</span>
              </div>
            )}
            {totalDuration > 0 && (
              <span style={{ fontSize: 12, color: T.accent, background: T.accentBg, border: `1px solid ${T.accentBrd}`, borderRadius: 9999, padding: '4px 12px' }}>
                {fmtSec(totalDuration)} gesamt
              </span>
            )}

            {/* Export button — right aligned */}
            <div style={{ marginLeft: 'auto' }}>
              <button
                onClick={handleExport}
                disabled={!canExport}
                style={{
                  background: canExport ? `linear-gradient(135deg, ${T.accent}, #8b68d4)` : T.subtle,
                  border: `1px solid ${canExport ? T.accentBrd : T.border}`,
                  borderRadius: 9999,
                  color: canExport ? '#fff' : T.muted,
                  fontWeight: 700, fontSize: 13, padding: '8px 22px',
                  cursor: canExport ? 'pointer' : 'not-allowed',
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  transition: 'all .15s', whiteSpace: 'nowrap',
                }}>
                {isProcessing
                  ? <><Spinner size={12} color="#fff" /> Exportiert…</>
                  : `⬇ Exportieren (${includedClips.length} Szenen)`}
              </button>
            </div>
          </div>

          {/* ── Untertitel-Einstellungen (für alle Szenen) ───────────── */}
          <div style={{
            background: T.card,
            border: `1px solid ${T.border}`,
            borderRadius: 12,
            padding: '20px 24px',
            marginBottom: 28,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, color: T.text, margin: 0, letterSpacing: '-0.3px' }}>
                Untertitel-Einstellungen
                <span style={{ fontSize: 11, fontWeight: 400, color: T.muted, marginLeft: 10 }}>für alle Szenen</span>
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: subtitlesEnabled ? T.accent : T.muted }}>
                  {subtitlesEnabled ? 'AN' : 'AUS'}
                </span>
                <Toggle value={subtitlesEnabled} onChange={setSubtitlesEnabled} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 24, alignItems: 'stretch', flexWrap: 'wrap', opacity: subtitlesEnabled ? 1 : 0.35, pointerEvents: subtitlesEnabled ? 'auto' : 'none', transition: 'opacity .2s' }}>
              {/* Style controls — etwas schmaler */}
              <div style={{ flex: '1 1 220px', minWidth: 220, display: 'flex', alignItems: 'center' }}>
                <div style={{ width: '100%' }}>
                  <StylePanel style={subtitleStyle} onChange={setSubtitleStyle} />
                </div>
              </div>

              {/* Divider */}
              <div style={{ width: 1, background: T.border, flexShrink: 0 }} />

              {/* Position grid — quadratisch, breiter */}
              <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: T.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Position</div>
                <div style={{
                  width: 210, height: 210,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gridTemplateRows: 'repeat(3, 1fr)',
                  gap: 5,
                }}>
                  {POSITIONS.flat().map(pos => (
                    <button
                      key={pos}
                      onClick={() => setSubtitleStyle(prev => ({ ...prev, position: pos }))}
                      title={pos}
                      style={{
                        background: subtitleStyle.position === pos ? T.accentBg : T.subtle,
                        border: `1px solid ${subtitleStyle.position === pos ? T.accentBrd : T.border}`,
                        borderRadius: 8,
                        color: subtitleStyle.position === pos ? T.accent : T.muted,
                        cursor: 'pointer', fontSize: 20,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all .15s',
                        width: '100%', height: '100%',
                      }}>
                      {POSITION_LABELS[pos]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Divider */}
              <div style={{ width: 1, background: T.border, flexShrink: 0 }} />

              {/* Preview */}
              <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Vorschau</div>
                <SubtitlePreview subtitleStyle={subtitleStyle} sampleText={sampleText} format={format} />
                <div style={{ fontSize: 10, color: T.muted }}>{format} · Live</div>
              </div>
            </div>
          </div>

          {/* ── Scene list ──────────────────────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: T.text }}>Szenen</h2>
            <span style={{ fontSize: 13, color: T.muted }}>{includedClips.length} von {clips.length} inkl.</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {clips.length === 0 && (
              <div style={{ color: T.muted, fontSize: 14, textAlign: 'center', padding: '60px 0' }}>
                Keine Szenen vorhanden
              </div>
            )}
            {clips.map((clip, i) => (
              <SceneCard
                key={i}
                clip={clip}
                index={i}
                total={clips.length}
                onUpdate={updates => updateClip(i, updates)}
                onMove={moveClip}
                projectId={id}
                format={format}
                isDragOver={dragOverIdx === i}
                onDragStart={() => handleDragStart(i)}
                onDragOver={() => handleDragOver(i)}
                onDrop={() => handleDrop(i)}
                onDragEnd={handleDragEnd}
              />
            ))}
          </div>

          {/* ── Bottom navigation ───────────────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 40, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
            <button
              onClick={() => router.push(`/videos/${id}`)}
              style={{ background: 'none', border: `1px solid ${T.border}`, borderRadius: 9999, color: T.muted, fontSize: 13, fontWeight: 700, padding: '8px 20px', cursor: 'pointer' }}>
              ← Zurück zu Videos
            </button>
            <button
              onClick={handleExport}
              disabled={!canExport}
              style={{
                background: canExport ? `linear-gradient(135deg, ${T.accent}, #8b68d4)` : T.subtle,
                border: `1px solid ${canExport ? T.accent : T.border}`,
                borderRadius: 9999,
                color: canExport ? '#fff' : T.muted,
                fontWeight: 700, fontSize: 13, padding: '10px 28px',
                cursor: canExport ? 'pointer' : 'not-allowed',
                display: 'inline-flex', alignItems: 'center', gap: 8,
                boxShadow: canExport ? `0 0 20px rgba(181,152,226,0.3)` : 'none',
                transition: 'all .15s',
              }}>
              {isProcessing
                ? <><Spinner size={12} color="#fff" /> Exportiert…</>
                : `⬇ Exportieren (${includedClips.length} Szenen)`}
            </button>
          </div>

        </main>
      </div>
    </>
  );
}
