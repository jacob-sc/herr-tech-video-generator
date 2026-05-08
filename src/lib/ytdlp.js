const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { YTDLP_PATH, FFMPEG_PATH } = require('./bin-paths');

/**
 * Gibt passende Cookies-Argumente für die URL zurück.
 * Prüft plattformspezifische Dateien, dann allgemeine cookies.txt.
 */
function getCookiesArgs(url) {
  const cwd = process.cwd();
  const candidates = [];

  if (/youtube\.com|youtu\.be/.test(url)) {
    candidates.push(path.join(cwd, 'youtube_cookies.txt'));
  } else if (/instagram\.com/.test(url)) {
    candidates.push(path.join(cwd, 'cookies.txt'));
  } else if (/tiktok\.com/.test(url)) {
    candidates.push(path.join(cwd, 'tiktok_cookies.txt'));
  }
  // Allgemeiner Fallback
  candidates.push(path.join(cwd, 'cookies.txt'));

  for (const f of candidates) {
    if (fs.existsSync(f)) {
      console.log(`[yt-dlp] Cookies: ${f}`);
      return ['--cookies', f];
    }
  }
  return [];
}

/**
 * Lädt das Audio eines Video-Links herunter (YouTube, Instagram, TikTok, u.v.m.)
 * und gibt den Pfad zur MP3-Datei zurück.
 *
 * Strategie: fester Output-Pfad (kein Template) → wir wissen immer genau wo die Datei landet.
 * Metadaten (Titel, Dauer) werden in einem separaten --print-only Aufruf geholt.
 *
 * @param {string} url
 * @returns {Promise<{ audioPath: string, title: string, duration: number, platform: string }>}
 */
async function downloadAudio(url) {
  const tmpId = Date.now();
  const audioPath = path.join(os.tmpdir(), `ytdlp_${tmpId}.mp3`);

  // 1. Versuch: yt-dlp
  let usedCobalt = false;
  try {
    await runYtdlp([
      url,
      '--extract-audio',
      '--audio-format', 'mp3',
      '--audio-quality', '5',
      '--ffmpeg-location', FFMPEG_PATH,
      '--output', audioPath,
      '--no-playlist',
      '--no-warnings',
      ...getCookiesArgs(url),
    ]);
  } catch (err) {
    if (isBlockError(err.message)) {
      // 2. Fallback: cobalt.tools
      console.warn(`[yt-dlp] Geblockt — versuche cobalt.tools Fallback`);
      await downloadViaCobalt(url, audioPath, 'audio');
      usedCobalt = true;
    } else {
      throw err;
    }
  }

  if (!fs.existsSync(audioPath)) {
    throw new Error('Audio-Datei wurde nach dem Download nicht gefunden. Möglicherweise ist das Video privat oder passwortgeschützt.');
  }

  // 2. Metadaten (optional, nur via yt-dlp)
  let title = 'Unbekannter Titel';
  let duration = 0;
  if (!usedCobalt) {
    try {
      const meta = await runYtdlp([
        url,
        '--print', 'title',
        '--print', 'duration',
        '--no-playlist',
        '--no-warnings',
        '--quiet',
        '--skip-download',
      ]);
      const lines = meta.trim().split('\n').filter(Boolean);
      title = lines[0] ?? title;
      duration = parseFloat(lines[1]) || 0;
    } catch {
      // Metadaten sind optional
    }
  }

  return { audioPath, title, duration, platform: detectPlatform(url) };
}

/**
 * Führt yt-dlp mit den gegebenen Argumenten aus und gibt stdout zurück.
 * Wirft bei Exit-Code ≠ 0.
 */
function runYtdlp(args) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    const proc = spawn(YTDLP_PATH, args);
    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));

    proc.on('close', (code) => {
      if (code !== 0) {
        const msg = stderr.trim() || 'Unbekannter yt-dlp Fehler';
        console.error('[yt-dlp] Fehler:', msg);
        return reject(new Error(`yt-dlp: ${msg}`));
      }
      resolve(stdout);
    });
  });
}

function detectPlatform(url) {
  if (/youtube\.com|youtu\.be/.test(url)) return 'YouTube';
  if (/instagram\.com/.test(url)) return 'Instagram';
  if (/tiktok\.com/.test(url)) return 'TikTok';
  if (/twitter\.com|x\.com/.test(url)) return 'Twitter/X';
  if (/facebook\.com|fb\.watch/.test(url)) return 'Facebook';
  if (/vimeo\.com/.test(url)) return 'Vimeo';
  return 'Web';
}

function isSupportedUrl(url) {
  try {
    new URL(url);
    return /^https?:\/\//.test(url);
  } catch {
    return false;
  }
}

/**
 * Lädt das vollständige Video eines Links herunter und gibt den Pfad zurück.
 *
 * @param {string} url
 * @param {string} outputDir - Zielverzeichnis
 * @returns {Promise<{ videoPath: string, title: string, duration: number, platform: string }>}
 */
async function downloadVideo(url, outputDir) {
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const tmpId = Date.now();
  const videoPath = path.join(outputDir, `ytdlp_${tmpId}.mp4`);

  // 1. Versuch: yt-dlp
  let usedCobalt = false;
  try {
    await runYtdlp([
      url,
      '--format', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best[ext=mp4]/best',
      '--merge-output-format', 'mp4',
      '--ffmpeg-location', FFMPEG_PATH,
      '--output', videoPath,
      '--no-playlist',
      '--no-warnings',
      ...getCookiesArgs(url),
    ]);
  } catch (err) {
    if (isBlockError(err.message)) {
      // 2. Fallback: cobalt.tools
      console.warn(`[yt-dlp] Geblockt — versuche cobalt.tools Fallback`);
      await downloadViaCobalt(url, videoPath, 'auto');
      usedCobalt = true;
    } else {
      throw err;
    }
  }

  if (!fs.existsSync(videoPath)) {
    throw new Error('Video-Datei nach Download nicht gefunden. Das Video könnte privat oder passwortgeschützt sein.');
  }

  let title = 'Unbekannter Titel';
  let duration = 0;
  if (!usedCobalt) {
    try {
      const meta = await runYtdlp([
        url,
        '--print', 'title',
        '--print', 'duration',
        '--no-playlist',
        '--no-warnings',
        '--quiet',
        '--skip-download',
      ]);
      const lines = meta.trim().split('\n').filter(Boolean);
      title = lines[0] ?? title;
      duration = parseFloat(lines[1]) || 0;
    } catch {
      // Metadaten sind optional
    }
  }

  return { videoPath, title, duration, platform: detectPlatform(url) };
}

/**
 * Lädt eine Datei von einer URL herunter und speichert sie lokal.
 */
async function downloadUrlToFile(url, destPath) {
  const https = require('https');
  const http  = require('http');
  const fss   = require('fs');
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const file = fss.createWriteStream(destPath);
    lib.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        return downloadUrlToFile(res.headers.location, destPath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        return reject(new Error(`HTTP ${res.statusCode} beim Download`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Fallback: Lädt Video/Audio über cobalt.tools herunter.
 * Gibt den lokalen Dateipfad zurück.
 */
async function downloadViaCobalt(url, destPath, mode = 'auto') {
  const https = require('https');
  console.log(`[cobalt] Versuche Download: ${url} (mode=${mode})`);

  const body = JSON.stringify({
    url,
    downloadMode: mode,
    ...(mode === 'audio' ? { audioFormat: 'mp3', audioBitrate: '128' } : { videoQuality: '1080', youtubeVideoCodec: 'h264' }),
  });

  // Lokale cobalt-Instanz (selbst gehostet auf Port 9000), Fallback auf public API
  const cobaltHost = process.env.COBALT_HOST || 'localhost';
  const cobaltPort = parseInt(process.env.COBALT_PORT || '9000', 10);
  const useHttps   = cobaltHost !== 'localhost' && cobaltHost !== '127.0.0.1';
  const httpLib    = useHttps ? https : require('http');

  const cobaltUrl = await new Promise((resolve, reject) => {
    const req = httpLib.request({
      hostname: cobaltHost,
      port: cobaltPort,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          console.log(`[cobalt] Antwort status=${json.status}`);
          if (json.status === 'error') {
            return reject(new Error(`cobalt: ${json.error?.code ?? 'Unbekannter Fehler'}`));
          }
          if (json.status === 'tunnel' || json.status === 'redirect') {
            return resolve(json.url);
          }
          if (json.status === 'picker') {
            // Erstes Video-Item nehmen
            const item = json.picker?.find(i => i.type === 'video') ?? json.picker?.[0];
            if (item?.url) return resolve(item.url);
          }
          reject(new Error(`cobalt: Unbekannter Status "${json.status}"`));
        } catch (e) {
          reject(new Error(`cobalt: Antwort konnte nicht geparst werden`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });

  await downloadUrlToFile(cobaltUrl, destPath);
  console.log(`[cobalt] Gespeichert: ${destPath}`);
  return destPath;
}

/** Erkennt ob ein yt-dlp Fehler ein Bot/Auth-Block ist */
function isBlockError(msg) {
  return /sign in|bot|rate.limit|login required|not available|format is not available/i.test(msg);
}

module.exports = { downloadAudio, downloadVideo, detectPlatform, isSupportedUrl };
