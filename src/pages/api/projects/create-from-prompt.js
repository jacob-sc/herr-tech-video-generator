import Anthropic from '@anthropic-ai/sdk';
import { createProject, updateProject } from '../../../lib/project';
import { requireAuth } from '../../../lib/api-auth';
import { prisma } from '../../../lib/prisma';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Du bist ein Experte für viralen Social-Media-Content. Du erstellst Szenengerüste für kurze KI-Videos im 9:16-Format (TikTok, Instagram Reels, YouTube Shorts).

Deine Stärke: Emotionale, packende, direkte Inhalte die treffen. Kurze Sätze. Starke Aussagen. Echter Mehrwert oder echter Unterhaltungswert. Kein Bullshit.

Wenn der Nutzer keine anderen Vorgaben macht: Gehe auf Emotion, sei direkt und kontrovers, schreib viral.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in diesem Format:
{
  "title": "Kurzer Projekttitel",
  "styleDescription": "Beschreibung des visuellen Stils für alle Szenen (für Imagen/KI-Bildgenerierung)",
  "scenes": [
    {
      "script": "Der gesprochene Text / Narration für diese Szene. Kurz, knackig, wirkungsvoll.",
      "imagePrompt": "Detaillierter englischer Prompt für die KI-Bildgenerierung dieser Szene. Sehr konkret: Lichtstimmung, Perspektive, Stil, Charaktere, Setting.",
      "durationSeconds": 4
    }
  ]
}

Regeln:
- 5 bis 8 Szenen
- Jede Szene 3-6 Sekunden (durationSeconds)
- script: Deutsch, maximal 1-2 Sätze, direkt und wirkungsvoll
- imagePrompt: Englisch, sehr detailliert, cinematic, für Imagen optimiert
- styleDescription: Englisch, beschreibt den konsistenten visuellen Look über alle Szenen
- Kein Markdown, kein Text außerhalb des JSON`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Nur POST' });

  const { session, ownerId } = await requireAuth(req, res);
  if (!session) return;

  const { prompt } = req.body ?? {};
  if (!prompt?.trim()) return res.status(400).json({ error: 'Kein Prompt angegeben' });

  let parsed;
  try {
    const message = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt.trim() }],
    });

    const text = message.content[0]?.text ?? '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Kein JSON in Antwort');
    parsed = JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('[create-from-prompt] Claude error:', err);
    return res.status(500).json({ error: 'KI-Generierung fehlgeschlagen: ' + err.message });
  }

  // Build project
  const project = createProject(ownerId);
  await prisma.user.update({
    where: { id: ownerId },
    data: { projectsCreated: { increment: 1 } },
  }).catch(() => {});

  let cursor = 0;
  const scenes = (parsed.scenes ?? []).map((s, i) => {
    const duration = Math.max(3, Math.min(10, s.durationSeconds ?? 5));
    const start = cursor;
    const end = cursor + duration;
    cursor = end;
    return {
      id: i,
      start,
      end,
      text: s.script || '',
      script: s.script || '',
      imagePrompt: s.imagePrompt || null,
      manual: true,
      manualInput: null,
      screenshotFiles: [],
      selectedScreenshot: null,
      refImageFile: null,
      characters: [],
      characterDescription: null,
      characterImageFile: null,
      imageFile: null,
      imageApproved: false,
      videoPrompt: null,
      videoFile: null,
      videoUrl: null,
      videoApproved: false,
      analysis: null,
    };
  });

  updateProject(project.id, {
    manualProject: true,
    title: parsed.title || null,
    promptInput: prompt.trim(),
    status: 'setup_done',
    scenes,
    setup: {
      format: '9:16',
      styleDescription: parsed.styleDescription || '',
      styleDeviation: 3,
      subtitleLanguage: 'de',
      subtitleColor: '#FFFFFF',
      subtitleFont: 'Arial Bold',
      subtitlePosition: 'bottom',
      subtitleAnimation: 'word-by-word',
    },
  });

  return res.status(200).json({ projectId: project.id });
}
