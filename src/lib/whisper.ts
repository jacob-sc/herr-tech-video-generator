import OpenAI from 'openai';
import fs from 'fs';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface TranscriptionResult {
  text: string;
  segments: Array<{
    start: number;
    end: number;
    text: string;
  }>;
  language: string;
  duration: number;
}

export async function transcribeAudio(
  audioPath: string
): Promise<TranscriptionResult> {
  const audioStream = fs.createReadStream(audioPath);

  const response = await openai.audio.transcriptions.create({
    file: audioStream,
    model: 'whisper-1',
    response_format: 'verbose_json',
    timestamp_granularities: ['segment'],
  });

  return {
    text: response.text,
    segments: (response.segments ?? []).map((seg) => ({
      start: seg.start,
      end: seg.end,
      text: seg.text.trim(),
    })),
    language: response.language ?? 'unknown',
    duration: response.duration ?? 0,
  };
}
