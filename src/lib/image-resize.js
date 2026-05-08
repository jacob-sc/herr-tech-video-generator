const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { FFMPEG_PATH: FFMPEG } = require('./bin-paths');
const MAX_BYTES = 4 * 1024 * 1024; // 4MB Sicherheitsabstand zum 5MB Claude-Limit
const MAX_DIM = 2000;               // Max Breite/Höhe in Pixel

/**
 * Schrumpft ein Bild (Buffer oder Base64-String) auf Anthropic-taugliche Größe.
 * Gibt { base64, mimeType } zurück. Wenn das Bild klein genug ist, wird nichts verändert.
 */
async function resizeForClaude(input, mimeType = 'image/jpeg') {
  // Input normalisieren → Buffer
  let buf;
  if (typeof input === 'string') {
    buf = Buffer.from(input, 'base64');
  } else if (Buffer.isBuffer(input)) {
    buf = input;
  } else {
    throw new Error('resizeForClaude: Input muss Buffer oder Base64-String sein');
  }

  // Wenn das Bild klein genug ist, direkt zurückgeben
  if (buf.length <= MAX_BYTES) {
    return { base64: buf.toString('base64'), mimeType };
  }

  const ext = mimeType === 'image/png' ? '.png' : '.jpg';
  const tmpIn  = path.join(os.tmpdir(), `claude_img_in_${Date.now()}${ext}`);
  const tmpOut = path.join(os.tmpdir(), `claude_img_out_${Date.now()}.jpg`);

  try {
    fs.writeFileSync(tmpIn, buf);

    await new Promise((resolve, reject) => {
      execFile(FFMPEG, [
        '-y',
        '-i', tmpIn,
        '-vf', `scale='min(${MAX_DIM},iw)':'-2'`,
        '-q:v', '4',   // JPEG-Qualität ~80%
        tmpOut,
      ], (err, _stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message));
        else resolve();
      });
    });

    const resized = fs.readFileSync(tmpOut);
    return { base64: resized.toString('base64'), mimeType: 'image/jpeg' };
  } finally {
    try { fs.unlinkSync(tmpIn); } catch {}
    try { fs.unlinkSync(tmpOut); } catch {}
  }
}

/**
 * Liest eine Bilddatei von Disk und gibt { base64, mimeType } zurück —
 * falls nötig wird das Bild vorher verkleinert.
 */
async function readImageForClaude(filePath) {
  const buf = fs.readFileSync(filePath);
  const mimeType = detectMime(filePath, buf);
  return resizeForClaude(buf, mimeType);
}

function detectMime(filePath, buf) {
  if (buf && buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf && buf[0] === 0xFF && buf[1] === 0xD8) return 'image/jpeg';
  if (buf && buf[0] === 0x47 && buf[1] === 0x49) return 'image/gif';
  if (buf && buf[0] === 0x52 && buf[1] === 0x49 && buf[8] === 0x57) return 'image/webp';
  const ext = path.extname(filePath || '').toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

module.exports = { resizeForClaude, readImageForClaude };
