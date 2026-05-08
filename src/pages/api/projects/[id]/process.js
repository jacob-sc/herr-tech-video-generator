import path from 'path';
import { loadProject, updateProject, getProjectDir } from '../../../../lib/project';
import { requireAuth, isAdmin } from '../../../../lib/api-auth';
import Anthropic from '@anthropic-ai/sdk';

const { transcribe } = require('../../../../lib/transcribe');
const { downloadVideo, isSupportedUrl } = require('../../../../lib/ytdlp');
const { detectScenesWithClaude } = require('../../../../lib/scenes');
const { extractSceneScreenshots } = require('../../../../lib/screenshots');
const { analyzeVideoScenes } = require('../../../../lib/video-analyzer');

const getAnthropic = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function generateTitle(transcriptText) {
  try {
    const msg = await getAnthropic().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 60,
      messages: [{
        role: 'user',
        content: `Gib diesem Video einen kurzen, prägnanten Deutschen Projekttitel (max. 5 Wörter, kein Anführungszeichen, nur der Titel).\n\nTranskript-Ausschnitt:\n${transcriptText.slice(0, 800)}`,
      }],
    });
    return (msg.content[0]?.text ?? '').trim().replace(/^["']|["']$/g, '');
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Nur POST' });

  const { session, ownerId } = await requireAuth(req, res);
  if (!session) return;

  const { id } = req.query;
  const { videoPath: bodyVideoPath, url, targetLanguage = 'original' } = req.body ?? {};

  const project = loadProject(id);
  if (!project) return res.status(404).json({ error: 'Projekt nicht gefunden' });

  if (project.ownerId && project.ownerId !== ownerId && !isAdmin(session)) {
    return res.status(403).json({ error: 'Kein Zugriff' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    if (res.flush) res.flush();
  };

  try {
    let videoPath = bodyVideoPath ?? project.videoPath;

    // ── Schritt 1: Video herunterladen (nur bei URL) ──
    if (url) {
      if (!isSupportedUrl(url)) throw new Error('Ungültige oder nicht unterstützte URL.');
      send({ step: 'download', label: 'Video wird heruntergeladen…' });
      updateProject(id, { status: 'downloading' });

      const uploadDir = path.join(process.cwd(), 'uploads');
      const result = await downloadVideo(url, uploadDir);
      videoPath = result.videoPath;
      updateProject(id, { videoPath, status: 'downloaded' });
    }

    if (!videoPath) throw new Error('Kein Video-Pfad angegeben.');

    // ── Schritt 2: Transkription ──
    send({ step: 'transcribe', label: 'Whisper transkribiert…' });
    updateProject(id, { status: 'transcribing' });

    const transcript = await transcribe(videoPath, null, { targetLanguage });
    const fullText = transcript.segments?.map(s => s.text).join(' ') ?? '';
    const autoTitle = await generateTitle(fullText);
    updateProject(id, { transcript, ...(autoTitle ? { title: autoTitle } : {}) });

    // ── Schritt 2.5: Visuelle Szenen-Schnitte erkennen (FFmpeg scdet) ──
    send({ step: 'visual_detect', label: 'Visuelle Schnitte werden erkannt…' });
    const { detectVisualSceneChanges } = require('../../../../lib/screenshots');
    let visualBreakpoints = [];
    try {
      visualBreakpoints = await detectVisualSceneChanges(videoPath);
      console.log(`[process] ${visualBreakpoints.length} visuelle Schnitte erkannt:`, visualBreakpoints);
    } catch (e) {
      console.warn('[process] Visuelle Schnitterkennung fehlgeschlagen (kein Abbruch):', e.message);
    }

    // ── Schritt 3: Szenen erkennen (Claude, thematisch + visuell) ──
    send({ step: 'scenes', label: 'Claude erkennt Szenen & Themen…' });
    const scenes = await detectScenesWithClaude(transcript.segments, visualBreakpoints);
    send({ step: 'scenes', label: `${scenes.length} Szenen erkannt` });

    // ── Schritt 4: Screenshots extrahieren ──
    send({ step: 'screenshots', label: 'Screenshots werden erstellt…' });
    updateProject(id, { status: 'extracting_screenshots' });

    const screenshotDir = path.join(getProjectDir(id), 'screenshots');
    await extractSceneScreenshots(videoPath, scenes, screenshotDir);

    // ── Schritt 5: Visuelle Analyse aller Szenen ──
    send({ step: 'analyze', label: 'Claude analysiert Szenen visuell…' });
    const analyzedScenes = await analyzeVideoScenes(scenes, screenshotDir);

    updateProject(id, { scenes: analyzedScenes, videoPath, status: 'ready_for_setup' });
    send({ step: 'done', sceneCount: analyzedScenes.length });
  } catch (err) {
    console.error('[process] Fehler:', err);
    updateProject(id, { status: 'error', error: err.message });
    send({ step: 'error', error: err.message });
  }

  res.end();
}
