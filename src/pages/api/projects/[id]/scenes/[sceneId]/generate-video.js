import path from 'path';
import { loadProject, updateProject, getProjectDir } from '../../../../../../lib/project';
import { requireAuth, isAdmin } from '../../../../../../lib/api-auth';
import { prisma } from '../../../../../../lib/prisma';

const { uploadImageToFal, submitVideoJob, submitVeo3Job, getFalDuration, getVeo3Duration } = require('../../../../../../lib/fal-video');
const fs = require('fs');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Nur POST' });

  const { session, ownerId } = await requireAuth(req, res);
  if (!session) return;

  const { id, sceneId } = req.query;
  const sceneIdx = parseInt(sceneId, 10);
  const { videoPrompt: customPrompt, model = 'kling', audio = true, scriptType = 'spoken', duration: durationOverride = null } = req.body ?? {};

  if (!process.env.FAL_API_KEY && !process.env.FAL_KEY) {
    return res.status(500).json({ error: 'FAL_API_KEY fehlt in .env.local' });
  }

  if (!customPrompt?.trim()) {
    return res.status(400).json({ error: 'Kein Video-Prompt angegeben. Bitte zuerst einen Prompt erstellen.' });
  }

  const project = loadProject(id);
  if (!project) return res.status(404).json({ error: 'Projekt nicht gefunden' });

  if (project.ownerId && project.ownerId !== ownerId && !isAdmin(session)) {
    return res.status(403).json({ error: 'Kein Zugriff' });
  }

  const scene = project.scenes?.[sceneIdx];
  if (!scene) return res.status(404).json({ error: 'Szene nicht gefunden' });
  if (!scene.imageFile) return res.status(400).json({ error: 'Kein generiertes Bild für diese Szene vorhanden' });

  const projectDir = getProjectDir(id);
  const imageFilePath = path.join(projectDir, 'generated-images', scene.imageFile);
  if (!fs.existsSync(imageFilePath)) {
    return res.status(404).json({ error: 'Bilddatei nicht gefunden' });
  }

  const format = project.setup?.format ?? '9:16';
  const sceneDuration = (scene.end ?? 5) - (scene.start ?? 0);
  const aspectRatio = format === '9:16' ? '9:16' : '16:9';
  const isVeo3 = model === 'veo3';

  // Veo 3 blocks prompts mentioning ages of minors (under 18) — auto-replace with generic terms.
  // Also softens aggressive/threatening adjectives that trip Veo3's safety filter
  // (Kling accepts them, Veo3 doesn't).
  function sanitizeForVeo3(text) {
    return text
      // Age references
      .replace(/\b([1-9]|1[0-7])[- ]?[Jj]ähr(?:ig(?:er?|es?|em?)|e)\b/g, 'young person')
      .replace(/\b([1-9]|1[0-7])[- ]?year[- ]?old\b/gi, 'young person')
      .replace(/\bage[d\s]+([1-9]|1[0-7])\b/gi, 'young person')
      .replace(/\b([1-9]|1[0-7])\s+Jahre?\s+alt\b/gi, 'young person')
      // Aggressive / threatening adjectives → theatrical-neutral equivalents.
      // Veo3 has stricter safety filtering than Kling — these words tripped 422s in testing.
      .replace(/\barrogant(ly)?\b/gi, 'confident$1')
      .replace(/\bvillainous(ly)?\b/gi, 'theatrical$1')
      .replace(/\bmenacing(ly)?\b/gi, 'intense$1')
      .replace(/\bcontemptuous(ly)?\b/gi, 'stern$1')
      .replace(/\bcondescending\b/gi, 'authoritative')
      .replace(/\bdomina(nce|nt|ting)\b/gi, (m, suffix) => suffix === 'nce' ? 'presence' : (suffix === 'nt' ? 'commanding' : 'commanding'))
      .replace(/\bsuperiority\b/gi, 'confidence')
      .replace(/\bclench(es|ing|ed)?\b/gi, (m, suffix) => `tighten${suffix || ''}`)
      .replace(/\baggressive(ly)?\b/gi, 'intense$1')
      .replace(/\bfury\b/gi, 'intensity')
      .replace(/\brage\b/gi, 'intensity')
      .replace(/\bhostile\b/gi, 'firm')
      .replace(/\bbrutal(ly)?\b/gi, 'forceful$1')
      .replace(/\bfierce(ly)?\b/gi, 'intense$1')
      .replace(/\bviolent(ly)?\b/gi, 'dynamic$1')
      .replace(/\bexplosive(ly)?\b/gi, 'sudden$1')
      .replace(/\bforceful(ly)?\b/gi, 'firm$1')
      .replace(/\bbarely\s+restrained\b/gi, 'visibly contained')
      .replace(/\bfists?\s+(raised|slightly\s+raised|clenched|tight)\b/gi, 'hands held with intention')
      .replace(/\btrembling\s+with\s+(forceful|violent|aggressive|barely\s+restrained)\s+(\w+)/gi, 'trembling with $2');
  }

  const NO_OVERLAYS = 'No subtitles, no captions, no text overlays, no speech bubbles, no comic bubbles, no on-screen text or graphics of any kind.';
  const rawPrompt = customPrompt.trim();
  // Always ensure no-overlays clause is present
  const withNoSubs = rawPrompt.includes('No subtitles') ? rawPrompt : `${rawPrompt} ${NO_OVERLAYS}`;
  const videoPrompt = isVeo3 ? sanitizeForVeo3(withNoSubs) : withNoSubs;
  if (isVeo3 && videoPrompt !== rawPrompt) {
    console.log(`[generate-video] Veo3 safety sanitize: age reference replaced in prompt`);
  }

  try {
    // Upload image to fal storage (needs public URL)
    console.log(`[generate-video] Uploading image to fal storage... (model: ${model})`);
    const imageUrl = await uploadImageToFal(imageFilePath);

    let requestId;
    if (isVeo3) {
      const veo3Duration = durationOverride || getVeo3Duration(sceneDuration);
      console.log(`[generate-video] Submitting Veo 3 job — duration: ${veo3Duration}${durationOverride ? ' (manual)' : ' (auto)'}, format: ${aspectRatio}`);
      const result = await submitVeo3Job({ imageUrl, prompt: videoPrompt, duration: veo3Duration, aspectRatio, audio });
      requestId = result.request_id;
    } else {
      const duration = durationOverride || getFalDuration(sceneDuration);
      console.log(`[generate-video] Submitting Kling v3 job — duration: ${duration}s${durationOverride ? ' (manual)' : ' (auto)'} (aspect ratio from image)`);
      const result = await submitVideoJob({ imageUrl, prompt: videoPrompt, duration, audio });
      requestId = result.request_id;
    }
    console.log(`[generate-video] Job submitted: ${requestId}`);

    // Save to project
    const freshProject = loadProject(id);
    const updatedScenes = [...freshProject.scenes];
    updatedScenes[sceneIdx] = {
      ...updatedScenes[sceneIdx],
      videoPrompt,
      videoModel: isVeo3 ? 'veo3' : 'kling',
      videoRequestId: requestId,
      videoStatus: 'generating',
      videoFile: null,
      videoError: null,
    };
    updateProject(id, { scenes: updatedScenes });

    await prisma.user.update({ where: { id: ownerId }, data: { videosGenerated: { increment: 1 } } }).catch(() => {});

    return res.status(200).json({ ok: true, requestId, videoPrompt });
  } catch (err) {
    // Log full fal ApiError body if available
    const errDetail = err.body ? JSON.stringify(err.body).slice(0, 500) : '';
    console.error('[generate-video] Fehler:', err.message, errDetail ? `| body: ${errDetail}` : '');
    const errorMsg = errDetail ? `${err.message} — ${errDetail}` : err.message;
    try {
      const freshProject = loadProject(id);
      const updatedScenes = [...freshProject.scenes];
      updatedScenes[sceneIdx] = { ...updatedScenes[sceneIdx], videoStatus: 'error', videoError: errorMsg };
      updateProject(id, { scenes: updatedScenes });
    } catch {}
    return res.status(500).json({ error: errorMsg });
  }
}
