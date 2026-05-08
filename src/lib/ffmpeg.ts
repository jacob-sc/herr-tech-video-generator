import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Dynamisch aufgelöste Pfade — funktioniert auf macOS (Homebrew) und Linux
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { FFMPEG_PATH, FFPROBE_PATH } = require('./bin-paths');
ffmpeg.setFfmpegPath(FFMPEG_PATH);
ffmpeg.setFfprobePath(FFPROBE_PATH);

export async function extractAudio(videoPath: string): Promise<string> {
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

export async function getVideoMetadata(videoPath: string): Promise<{
  duration: number;
  width: number;
  height: number;
  fps: number;
}> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) return reject(err);
      const video = metadata.streams.find((s) => s.codec_type === 'video');
      const duration = metadata.format.duration ?? 0;
      const width = video?.width ?? 1920;
      const height = video?.height ?? 1080;
      const fpsRaw = video?.r_frame_rate ?? '30/1';
      const [num, den] = fpsRaw.split('/').map(Number);
      const fps = den ? num / den : 30;
      resolve({ duration, width, height, fps });
    });
  });
}

export function cleanupFile(filePath: string) {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // ignorieren — temp cleanup
  }
}
