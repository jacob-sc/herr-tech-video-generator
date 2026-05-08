const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { FFMPEG_PATH } = require('./bin-paths');

/**
 * Extrahiert einen Screenshot aus einem Video zu einem bestimmten Zeitpunkt.
 */
function extractScreenshot(videoPath, timestamp, outputPath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-ss', String(Math.max(0, timestamp)),
      '-i', videoPath,
      '-vframes', '1',
      '-q:v', '2',
      '-y',
      outputPath,
    ];
    const proc = spawn(FFMPEG_PATH, args);
    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg Screenshot-Fehler: ${stderr.slice(-200)}`));
      resolve(outputPath);
    });
  });
}

/**
 * Extrahiert 3 Screenshot-Kandidaten pro Szene (25%, 50%, 75% der Szenenlänge).
 */
async function extractSceneScreenshots(videoPath, scenes, screenshotDir) {
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

  for (const scene of scenes) {
    const dur = scene.end - scene.start;
    const timestamps = [
      scene.start + dur * 0.25,
      scene.start + dur * 0.50,
      scene.start + dur * 0.75,
    ];
    const suffixes = ['a', 'b', 'c'];

    for (let k = 0; k < 3; k++) {
      const outputPath = path.join(screenshotDir, `scene_${scene.id}_${suffixes[k]}.jpg`);
      try {
        await extractScreenshot(videoPath, timestamps[k], outputPath);
      } catch (err) {
        console.error(`[screenshots] Szene ${scene.id}/${suffixes[k]} fehlgeschlagen:`, err.message);
      }
    }
    console.log(`[screenshots] Szene ${scene.id}: 3 Kandidaten extrahiert`);
  }
}

/**
 * Erkennt visuelle Szenen-Schnitte im Video via FFmpeg scdet-Filter.
 * Gibt sortierte Array von Timestamps (in Sekunden) zurück.
 * Bei Fehler: leeres Array (graceful fallback).
 */
async function detectVisualSceneChanges(videoPath) {
  return new Promise((resolve) => {
    const timestamps = [];
    const args = [
      '-i', videoPath,
      '-filter:v', 'scdet=threshold=10', // 0–100, 10 = moderate Empfindlichkeit
      '-an', '-f', 'null', '-',
    ];
    const proc = spawn(FFMPEG_PATH, args);
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', () => {
      // Parse "pts_time:5.123" aus scdet-Output-Zeilen
      const matches = stderr.matchAll(/pts_time:([\d.]+)/g);
      for (const m of matches) {
        const t = parseFloat(m[1]);
        if (!isNaN(t)) timestamps.push(t);
      }
      resolve(timestamps.sort((a, b) => a - b));
    });
    proc.on('error', () => resolve([]));
  });
}

module.exports = { extractScreenshot, extractSceneScreenshots, detectVisualSceneChanges };
