const fs = require('fs');

/**
 * Findet den ersten existierenden Pfad aus einer Liste von Kandidaten.
 * Fallback: letzter Eintrag (System-PATH-Name, z.B. 'ffmpeg').
 */
function findBin(candidates) {
  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) return p;
    } catch {}
  }
  return candidates[candidates.length - 1];
}

const FFMPEG_PATH = process.env.FFMPEG_PATH || findBin([
  '/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg',
  '/opt/homebrew/bin/ffmpeg',
  '/usr/bin/ffmpeg',
  '/usr/local/bin/ffmpeg',
]);

const FFPROBE_PATH = process.env.FFPROBE_PATH || findBin([
  '/opt/homebrew/opt/ffmpeg-full/bin/ffprobe',
  '/opt/homebrew/bin/ffprobe',
  '/usr/bin/ffprobe',
  '/usr/local/bin/ffprobe',
]);

const YTDLP_PATH = process.env.YTDLP_PATH || findBin([
  '/opt/homebrew/bin/yt-dlp',
  '/usr/local/bin/yt-dlp',
  '/usr/bin/yt-dlp',
]);

module.exports = { FFMPEG_PATH, FFPROBE_PATH, YTDLP_PATH };
