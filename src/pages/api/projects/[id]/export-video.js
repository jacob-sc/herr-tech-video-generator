import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { loadProject, saveProject, getProjectDir } from '../../../../lib/project';
import { requireAuth, isAdmin } from '../../../../lib/api-auth';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { FFMPEG_PATH: FFMPEG, FFPROBE_PATH: FFPROBE } = require('../../../../lib/bin-paths');

// ── helpers ──────────────────────────────────────────────────────────────────

function hexToAss(hex, alpha = '00') {
  const h = hex.replace('#', '');
  const r = h.slice(0, 2);
  const g = h.slice(2, 4);
  const b = h.slice(4, 6);
  return `&H${alpha}${b}${g}${r}`;
}

function secondsToAssTime(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${h}:${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}

const POSITION_TO_AN = {
  'top-left': 7, 'top-center': 8, 'top-right': 9,
  'middle-left': 4, 'middle-center': 5, 'middle-right': 6,
  'bottom-left': 1, 'bottom-center': 2, 'bottom-right': 3,
};

function buildAssFile({ clips, subtitleStyle, format }) {
  const isPortrait = format === '9:16';
  const playResX = isPortrait ? 1080 : 1920;
  const playResY = isPortrait ? 1920 : 1080;

  const fontName = subtitleStyle.fontFamily || 'Arial';
  const fontSize = subtitleStyle.fontSize || 60;
  const primaryColor = hexToAss(subtitleStyle.fontColor || '#ffffff');
  const bold = subtitleStyle.fontWeight === 'bold' ? 1 : 0;

  const outlineColor = subtitleStyle.outlineEnabled
    ? hexToAss(subtitleStyle.outlineColor || '#000000') : '&H00000000';
  const outlineWidth = subtitleStyle.outlineEnabled ? (subtitleStyle.outlineWidth || 2) : 0;

  const shadowColor = subtitleStyle.shadowEnabled
    ? hexToAss(subtitleStyle.shadowColor || '#000000') : '&H00000000';
  const shadowDepth = subtitleStyle.shadowEnabled ? 2 : 0;

  const hasBgBox = subtitleStyle.bgBoxEnabled;
  const borderStyle = hasBgBox ? 3 : 1;
  const bgAlphaHex = hasBgBox
    ? Math.round((1 - (subtitleStyle.bgBoxOpacity ?? 0.6)) * 255).toString(16).padStart(2, '0').toUpperCase()
    : 'FF';
  const backColor = hasBgBox
    ? hexToAss(subtitleStyle.bgBoxColor || '#000000', bgAlphaHex) : '&H00000000';

  const anNum = POSITION_TO_AN[subtitleStyle.position || 'bottom-center'] || 2;
  const marginV = 220;

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${playResX}
PlayResY: ${playResY}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},${primaryColor},${primaryColor},${outlineColor},${backColor},${bold},0,0,0,100,100,0,0,${borderStyle},${outlineWidth},${shadowDepth},${anNum},30,30,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Text`;

  const lines = [];
  let cursor = 0;

  for (const clip of clips) {
    if (!clip.include) continue;
    const duration = clip.clipDuration || 5;
    const start = cursor;
    const end = cursor + duration;
    const segments = clip.subtitleSegments?.length
      ? clip.subtitleSegments
      : [{ text: clip.script || '', startSec: 0, endSec: duration }];

    for (const seg of segments) {
      const text = (seg.text || '').replace(/\n/g, '\\N');
      if (!text) continue;
      const segStart = start + (seg.startSec || 0);
      const segEnd = start + (seg.endSec || duration);
      lines.push(`Dialogue: 0,${secondsToAssTime(segStart)},${secondsToAssTime(segEnd)},Default,,0,0,0,{\\an${anNum}}${text}`);
    }

    cursor = end;
  }

  return header + '\n' + lines.join('\n') + '\n';
}

// ── run ffmpeg via spawn (more reliable than fluent-ffmpeg for complex filters) ──

function runFFmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, ['-y', ...args]);
    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-800)}`));
    });
    proc.on('error', reject);
  });
}

function getVideoInfo(filePath) {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFPROBE, [
      '-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', filePath,
    ]);
    let out = '';
    proc.stdout.on('data', d => { out += d.toString(); });
    proc.on('close', code => {
      try {
        const json = JSON.parse(out);
        const duration = parseFloat(json.format?.duration || '0');
        const hasAudio = json.streams?.some(s => s.codec_type === 'audio');
        resolve({ duration, hasAudio });
      } catch (e) { reject(e); }
    });
    proc.on('error', reject);
  });
}

async function trimVideo(inputPath, outputPath, trimStart, trimEnd, duration, hasAudio) {
  const start = trimStart || 0;
  const end = trimEnd ? (duration - trimEnd) : duration;
  const clipLen = Math.max(0.1, end - start);

  const args = [
    '-ss', String(start),
    '-i', inputPath,
    '-t', String(clipLen),
    '-c:v', 'libx264', '-preset', 'fast',
    '-pix_fmt', 'yuv420p',
    // aresample=async=1 synchronisiert Audio exakt auf den Video-Zeitstrahl
    ...(hasAudio ? ['-c:a', 'aac', '-af', 'aresample=async=1', '-ac', '2', '-ar', '44100'] : ['-an']),
    '-movflags', '+faststart',
    outputPath,
  ];
  await runFFmpeg(args);
}

async function concatVideos(inputFiles, outputPath, hasAudio) {
  if (inputFiles.length === 1) {
    fs.copyFileSync(inputFiles[0], outputPath);
    return;
  }

  const listPath = outputPath + '.concat.txt';
  fs.writeFileSync(listPath, inputFiles.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'));

  try {
    await runFFmpeg([
      '-f', 'concat', '-safe', '0',
      '-i', listPath,
      '-c:v', 'libx264', '-preset', 'fast',
      '-pix_fmt', 'yuv420p',
      // aresample=async=1 normalisiert Audio-Timestamps über Clip-Grenzen hinweg
      ...(hasAudio ? ['-c:a', 'aac', '-af', 'aresample=async=1', '-ac', '2', '-ar', '44100'] : ['-an']),
      '-movflags', '+faststart',
      outputPath,
    ]);
  } finally {
    try { fs.unlinkSync(listPath); } catch {}
  }
}

async function burnSubtitles(inputPath, assPath, outputPath, hasAudio) {
  // FFmpeg's filter parser requires explicit key: subtitles=filename=<path>
  // Colons must be escaped as \: since : separates filter options
  const filterPath = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');
  await runFFmpeg([
    '-i', inputPath,
    // setpts=PTS-STARTPTS stellt sicher dass Video-PTS bei 0 beginnt
    '-vf', `setpts=PTS-STARTPTS,subtitles=filename=${filterPath}`,
    '-c:v', 'libx264', '-preset', 'fast',
    '-pix_fmt', 'yuv420p',
    // aresample=async=1 synchronisiert Audio auf den neu gesetzten Video-Zeitstrahl
    ...(hasAudio ? ['-c:a', 'aac', '-af', 'aresample=async=1', '-ac', '2', '-ar', '44100'] : ['-an']),
    '-movflags', '+faststart',
    outputPath,
  ]);
}

// ── main export logic ─────────────────────────────────────────────────────────

async function runExport(id, clips, subtitleStyle, format, subtitlesEnabled = true) {
  const project = loadProject(id);
  if (!project) throw new Error('Projekt nicht gefunden');

  const projectDir = getProjectDir(id);
  const videosDir = path.join(projectDir, 'generated-videos');
  const exportsDir = path.join(projectDir, 'exports');
  const tmpDir = path.join(exportsDir, '_tmp');

  fs.mkdirSync(exportsDir, { recursive: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  const includedClips = clips.filter(c => c.include && c.videoFile);
  if (includedClips.length === 0) throw new Error('Keine Clips ausgewählt');

  // Step 1: Trim each clip
  const trimmedFiles = [];
  const enrichedClips = [];
  let anyAudio = false;

  for (let i = 0; i < includedClips.length; i++) {
    const clip = includedClips[i];
    const srcPath = path.join(videosDir, clip.videoFile);
    if (!fs.existsSync(srcPath)) throw new Error(`Video nicht gefunden: ${clip.videoFile}`);

    const { duration, hasAudio } = await getVideoInfo(srcPath);
    if (hasAudio) anyAudio = true;
    const trimStart = clip.trimStart || 0;
    const trimEnd = clip.trimEnd || 0;
    const clipDuration = Math.max(0.1, duration - trimStart - trimEnd);

    enrichedClips.push({ ...clip, clipDuration, originalDuration: duration });

    const trimFile = path.join(tmpDir, `clip_${i}.mp4`);
    if (trimStart > 0 || trimEnd > 0) {
      await trimVideo(srcPath, trimFile, trimStart, trimEnd, duration, hasAudio);
    } else {
      fs.copyFileSync(srcPath, trimFile);
    }
    trimmedFiles.push(trimFile);
  }

  // Step 2: Concatenate
  const concatOutput = path.join(tmpDir, 'concat.mp4');
  await concatVideos(trimmedFiles, concatOutput, anyAudio);

  // Step 3: Build ASS subtitle file (only if subtitles are enabled)
  const hasSubtitleText = enrichedClips.some(c => c.script?.trim());
  const assPath = path.join(tmpDir, 'subtitles.ass');
  const timestamp = Date.now();
  const exportFilename = `herr-tech_${timestamp}.mp4`;
  const finalOutput = path.join(exportsDir, exportFilename);

  if (subtitlesEnabled && hasSubtitleText) {
    const assContent = buildAssFile({ clips: enrichedClips, subtitleStyle, format });
    fs.writeFileSync(assPath, assContent, 'utf-8');
    await burnSubtitles(concatOutput, assPath, finalOutput, anyAudio);
  } else {
    // Untertitel deaktiviert oder kein Text — concat-Ergebnis direkt verwenden
    fs.copyFileSync(concatOutput, finalOutput);
  }

  // Cleanup
  try {
    for (const f of trimmedFiles) { try { fs.unlinkSync(f); } catch {} }
    try { fs.unlinkSync(concatOutput); } catch {}
    try { fs.unlinkSync(assPath); } catch {}
    try { fs.rmdirSync(tmpDir); } catch {}
  } catch {}

  return exportFilename;
}

// ── API handler ───────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return; }

  const { session, ownerId } = await requireAuth(req, res);
  if (!session) return;

  const { id } = req.query;
  const project = loadProject(id);
  if (!project) { res.status(404).json({ error: 'Projekt nicht gefunden' }); return; }

  if (project.ownerId && project.ownerId !== ownerId && !isAdmin(session)) {
    return res.status(403).json({ error: 'Kein Zugriff' });
  }

  const { clips, subtitleStyle, subtitlesEnabled = true, format } = req.body;
  if (!clips || !Array.isArray(clips)) {
    res.status(400).json({ error: 'Ungültige Clips' });
    return;
  }

  saveProject({ ...project, exportStatus: 'processing', exportFile: null, exportError: null });
  res.status(202).json({ ok: true, status: 'processing' });

  runExport(id, clips, subtitleStyle || {}, format || '9:16', subtitlesEnabled !== false)
    .then(exportFilename => {
      const p = loadProject(id);
      saveProject({ ...p, exportStatus: 'done', exportFile: exportFilename, exportError: null });
    })
    .catch(err => {
      console.error('[export-video] Error:', err);
      const p = loadProject(id);
      saveProject({ ...p, exportStatus: 'error', exportFile: null, exportError: err.message });
    });
}

export const config = {
  api: { bodyParser: { sizeLimit: '1mb' } },
};
