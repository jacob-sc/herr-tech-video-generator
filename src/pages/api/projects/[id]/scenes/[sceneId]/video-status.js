import path from 'path';
import { loadProject, updateProject, getProjectDir } from '../../../../../../lib/project';
import { requireAuth, isAdmin } from '../../../../../../lib/api-auth';

const { checkJobStatus, getJobResult, downloadVideo, FAL_MODEL_KLING, FAL_MODEL_VEO3 } = require('../../../../../../lib/fal-video');
const fs = require('fs');

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Nur GET' });

  const { session, ownerId } = await requireAuth(req, res);
  if (!session) return;

  const { id, sceneId } = req.query;
  const sceneIdx = parseInt(sceneId, 10);

  const project = loadProject(id);
  if (!project) return res.status(404).json({ error: 'Projekt nicht gefunden' });

  if (project.ownerId && project.ownerId !== ownerId && !isAdmin(session)) {
    return res.status(403).json({ error: 'Kein Zugriff' });
  }

  const scene = project.scenes?.[sceneIdx];
  if (!scene) return res.status(404).json({ error: 'Szene nicht gefunden' });

  // Already done — return cached result
  if (scene.videoStatus === 'done' && scene.videoFile) {
    return res.status(200).json({ status: 'done', videoFile: scene.videoFile, videoPrompt: scene.videoPrompt });
  }

  if (scene.videoStatus === 'error') {
    return res.status(200).json({ status: 'error', error: scene.videoError });
  }

  if (!scene.videoRequestId || scene.videoStatus !== 'generating') {
    return res.status(200).json({ status: scene.videoStatus ?? 'pending' });
  }

  // Determine which fal model was used
  const falModel = scene.videoModel === 'veo3' ? FAL_MODEL_VEO3 : FAL_MODEL_KLING;

  try {
    const { status } = await checkJobStatus(scene.videoRequestId, falModel);
    console.log(`[video-status] Scene ${sceneIdx} fal status: ${status} (model: ${scene.videoModel ?? 'kling'})`);

    if (status === 'COMPLETED') {
      let result;
      try {
        result = await getJobResult(scene.videoRequestId, falModel);
      } catch (resultErr) {
        // Log the FULL error detail so we can see exactly what fal.ai complains about
        const detail = resultErr.body ? JSON.stringify(resultErr.body, null, 2) : resultErr.message;
        console.error(`[video-status] getJobResult FAILED (${resultErr.status ?? 'no-status'}): ${detail}`);
        // Benutzerfreundliche Fehlermeldung je nach Fehlertyp
        let errMsg;
        if (detail.includes('no_media_generated')) {
          errMsg = 'CONTENT_FILTER: Das KI-Modell hat dieses Video abgelehnt — der Inhalt (z.B. Verletzungen, Betrug, sensible Themen) wurde von Veo 3 gefiltert. Bitte auf Kling wechseln oder den Prompt anpassen.';
        } else {
          errMsg = `fal.ai result error (${resultErr.status ?? '?'}): ${detail.slice(0, 200)}`;
        }
        const freshProject = loadProject(id);
        const updatedScenes = [...freshProject.scenes];
        updatedScenes[sceneIdx] = { ...updatedScenes[sceneIdx], videoStatus: 'error', videoError: errMsg };
        updateProject(id, { scenes: updatedScenes });
        return res.status(200).json({ status: 'error', error: errMsg });
      }

      // Log full result to diagnose structure differences between Kling and Veo3
      console.log(`[video-status] Result structure: ${JSON.stringify(result).slice(0, 600)}`);
      // Support both singular and plural video keys, and nested data
      const videoUrl = result?.video?.url ?? result?.videos?.[0]?.url ?? result?.data?.video?.url ?? result?.data?.videos?.[0]?.url ?? null;
      if (!videoUrl) {
        const errMsg = `Keine Video-URL in der fal-Antwort. Keys: ${Object.keys(result ?? {}).join(', ')}. Full: ${JSON.stringify(result).slice(0, 300)}`;
        console.error(`[video-status] ${errMsg}`);
        const freshProject = loadProject(id);
        const updatedScenes = [...freshProject.scenes];
        updatedScenes[sceneIdx] = { ...updatedScenes[sceneIdx], videoStatus: 'error', videoError: errMsg };
        updateProject(id, { scenes: updatedScenes });
        return res.status(200).json({ status: 'error', error: errMsg });
      }

      const filename = `scene_${sceneIdx}_${Date.now()}.mp4`;
      const projectDir = getProjectDir(id);
      const outputDir = path.join(projectDir, 'generated-videos');
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
      const outputPath = path.join(outputDir, filename);

      console.log(`[video-status] Downloading video to ${filename}...`);
      await downloadVideo(videoUrl, outputPath);
      console.log(`[video-status] Video saved ✓`);

      const freshProject = loadProject(id);
      const freshScene = freshProject.scenes[sceneIdx] ?? {};
      const prevVideoHistory = freshScene.videoHistory ?? (freshScene.videoFile ? [freshScene.videoFile] : []);
      const videoHistory = [...prevVideoHistory, filename];
      const updatedScenes = [...freshProject.scenes];
      updatedScenes[sceneIdx] = { ...updatedScenes[sceneIdx], videoStatus: 'done', videoFile: filename, videoHistory };
      updateProject(id, { scenes: updatedScenes });

      return res.status(200).json({ status: 'done', videoFile: filename, videoHistory });
    }

    if (status === 'FAILED') {
      const freshProject = loadProject(id);
      const updatedScenes = [...freshProject.scenes];
      updatedScenes[sceneIdx] = { ...updatedScenes[sceneIdx], videoStatus: 'error', videoError: 'GENERATION_FAILED: fal.ai konnte kein Video generieren. Bitte nochmal versuchen oder auf Kling wechseln.' };
      updateProject(id, { scenes: updatedScenes });
      return res.status(200).json({ status: 'error', error: 'GENERATION_FAILED: fal.ai konnte kein Video generieren. Bitte nochmal versuchen oder auf Kling wechseln.' });
    }

    return res.status(200).json({ status: 'generating', falStatus: status });
  } catch (err) {
    // Log full error including body detail
    const detail = err.body ? JSON.stringify(err.body, null, 2) : '';
    console.error(`[video-status] Fehler (${err.status ?? 'no-status'}): ${err.message}${detail ? `\nDetail: ${detail}` : ''}`);
    return res.status(500).json({ error: err.message, detail });
  }
}
