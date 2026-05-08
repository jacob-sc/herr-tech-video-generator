const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const os = require('os');
const OpenAI = require('openai').default;
const { translateToGerman } = require('./translate.js');
const { FFMPEG_PATH, FFPROBE_PATH } = require('./bin-paths');

// Dynamisch aufgelöste Pfade setzen — Next.js erbt keine Shell-Umgebung
ffmpeg.setFfmpegPath(FFMPEG_PATH);
ffmpeg.setFfprobePath(FFPROBE_PATH);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 'original' | 'english' | 'german'
const WHISPER_TASK = {
  original: 'transcribe',
  english: 'translate',  // Whisper übersetzt nativ → Englisch
  german: 'transcribe',  // erst transkribieren, dann Claude übersetzt → Deutsch
};

/**
 * Extrahiert den Audio-Track aus einer Videodatei als MP3.
 */
function extractAudio(videoPath) {
  const audioPath = path.join(os.tmpdir(), `audio_${Date.now()}.mp3`);
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioBitrate(128)
      .output(audioPath)
      .on('end', () => resolve(audioPath))
      .on('error', (err) => reject(new Error(`ffmpeg Fehler: ${err.message}`)))
      .run();
  });
}

/**
 * Schickt eine Audio-Datei an Whisper und gibt das formatierte Ergebnis zurück.
 * Übersetzt danach bei Bedarf ins Deutsche via Claude.
 *
 * @param {string} audioPath
 * @param {{ targetLanguage?: 'original'|'english'|'german' }} [options]
 */
async function callWhisper(audioPath, options = {}) {
  const targetLanguage = options.targetLanguage ?? 'original';
  const task = WHISPER_TASK[targetLanguage] ?? 'transcribe';

  console.log(`[transcribe] Whisper task="${task}", targetLanguage="${targetLanguage}"`);

  const response = await openai.audio.transcriptions.create({
    file: fs.createReadStream(audioPath),
    model: 'whisper-1',
    response_format: 'verbose_json',
    timestamp_granularities: ['segment'],
    task,
  });

  let text = response.text;
  let segments = (response.segments || []).map((seg) => ({
    start: seg.start,
    end: seg.end,
    text: seg.text.trim(),
  }));
  const detectedLanguage = response.language;

  // Deutsch: Claude übernimmt die Übersetzung
  if (targetLanguage === 'german' && detectedLanguage !== 'de') {
    console.log(`[transcribe] Übersetze ins Deutsche (Quelle: ${detectedLanguage})…`);
    const translated = await translateToGerman(text, segments, detectedLanguage);
    text = translated.text;
    segments = translated.segments;
  }

  return {
    text,
    segments,
    language: targetLanguage === 'original' ? detectedLanguage : targetLanguage,
    originalLanguage: detectedLanguage,
    duration: response.duration,
  };
}

/**
 * Speichert das Transkript als JSON-Datei.
 */
function saveTranscript(result, outputDir) {
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, `transcript_${Date.now()}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));
  console.log(`[transcribe] Gespeichert: ${jsonPath}`);
  return jsonPath;
}

/**
 * Transkribiert eine Videodatei (extrahiert Audio via ffmpeg, dann Whisper).
 *
 * @param {string} videoPath
 * @param {string|null} [outputDir]
 * @param {{ targetLanguage?: 'original'|'english'|'german' }} [options]
 */
async function transcribe(videoPath, outputDir = null, options = {}) {
  let audioPath = null;
  try {
    console.log(`[transcribe] Extrahiere Audio: ${videoPath}`);
    audioPath = await extractAudio(videoPath);

    const result = await callWhisper(audioPath, options);

    if (outputDir) result.savedTo = saveTranscript(result, outputDir);
    console.log(`[transcribe] Fertig — ${result.segments.length} Segmente, Sprache: ${result.language}`);
    return result;
  } finally {
    if (audioPath && fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
  }
}

/**
 * Transkribiert eine vorhandene Audio-Datei direkt (z.B. von yt-dlp).
 *
 * @param {string} audioPath
 * @param {string|null} [outputDir]
 * @param {{ targetLanguage?: 'original'|'english'|'german' }} [options]
 */
async function transcribeAudioFile(audioPath, outputDir = null, options = {}) {
  console.log(`[transcribe] Sende Audio an Whisper: ${audioPath}`);

  const result = await callWhisper(audioPath, options);

  if (outputDir) result.savedTo = saveTranscript(result, outputDir);
  console.log(`[transcribe] Fertig — ${result.segments.length} Segmente, Sprache: ${result.language}`);
  return result;
}

module.exports = { transcribe, transcribeAudioFile };
