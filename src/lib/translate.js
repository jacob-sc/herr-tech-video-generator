const Anthropic = require('@anthropic-ai/sdk');

const getAnthropic = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Übersetzt Transkript-Segmente und Gesamttext ins Deutsche via Claude.
 * Alle Segmente werden in einem einzigen API-Call übersetzt.
 *
 * @param {string} text - Volltext des Transkripts
 * @param {Array<{ start: number, end: number, text: string }>} segments
 * @param {string} sourceLanguage - Erkannte Ausgangssprache (z.B. "en")
 * @returns {Promise<{ text: string, segments: Array<{ start: number, end: number, text: string }> }>}
 */
async function translateToGerman(text, segments, sourceLanguage) {
  const segmentTexts = segments.map((s) => s.text);

  const prompt = `Übersetze den folgenden Text und die Segmente exakt ins Deutsche.
Ausgangssprache: ${sourceLanguage}

Volltext:
${text}

Segmente (als JSON-Array, NUR die "text"-Felder übersetzen, Reihenfolge beibehalten):
${JSON.stringify(segmentTexts)}

Antworte ausschließlich mit gültigem JSON in diesem Format:
{
  "text": "übersetzter Volltext",
  "segments": ["übersetztes Segment 1", "übersetztes Segment 2", ...]
}`;

  const message = await getAnthropic().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = message.content[0].text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  const parsed = JSON.parse(raw);

  return {
    text: parsed.text,
    segments: segments.map((seg, i) => ({
      ...seg,
      text: parsed.segments[i] ?? seg.text,
    })),
  };
}

module.exports = { translateToGerman };
