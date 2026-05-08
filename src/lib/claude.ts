import Anthropic from '@anthropic-ai/sdk';
import { TranscriptionResult } from './whisper';

function getAnthropic() { return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }); }

export interface Scene {
  title: string;
  startTime: number;
  endTime: number;
  summary: string;
  keepRating: number; // 1–10: wie wichtig ist diese Szene?
  suggestedAction: 'keep' | 'cut' | 'shorten';
  reason: string;
}

export interface AnalysisResult {
  overallSummary: string;
  scenes: Scene[];
  editSuggestions: string[];
  estimatedFinalDuration: number;
}

export async function analyzeTranscription(
  transcription: TranscriptionResult,
  videoContext?: string
): Promise<AnalysisResult> {
  const segmentsText = transcription.segments
    .map((s) => `[${formatTime(s.start)} - ${formatTime(s.end)}] ${s.text}`)
    .join('\n');

  const prompt = `Du bist ein professioneller Video-Editor. Analysiere das folgende Video-Transkript und erstelle einen Schnittplan.

${videoContext ? `Kontext: ${videoContext}\n\n` : ''}Transkript:
${segmentsText}

Gesamtdauer: ${formatTime(transcription.duration)}
Sprache: ${transcription.language}

Erstelle eine JSON-Analyse mit folgender Struktur (NUR gültiges JSON, kein Markdown):
{
  "overallSummary": "Kurze Zusammenfassung des Video-Inhalts",
  "scenes": [
    {
      "title": "Szenen-Titel",
      "startTime": 0.0,
      "endTime": 30.0,
      "summary": "Was passiert in dieser Szene",
      "keepRating": 8,
      "suggestedAction": "keep",
      "reason": "Begründung für die Empfehlung"
    }
  ],
  "editSuggestions": [
    "Tipp 1 zur Verbesserung",
    "Tipp 2 zur Verbesserung"
  ],
  "estimatedFinalDuration": 120.0
}

Regeln:
- suggestedAction: "keep" (behalten), "cut" (schneiden), "shorten" (kürzen)
- keepRating: 1 = unwichtig, 10 = unverzichtbar
- Fülle alle Zeitlücken zwischen Segmenten auf
- estimatedFinalDuration = Dauer nach empfohlenen Schnitten`;

  const message = await getAnthropic().messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const content = message.content[0];
  if (content.type !== 'text') throw new Error('Unerwartete Claude-Antwort');

  // Markdown-Codeblöcke entfernen falls Claude sie trotzdem hinzufügt
  const jsonText = content.text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  return JSON.parse(jsonText) as AnalysisResult;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
