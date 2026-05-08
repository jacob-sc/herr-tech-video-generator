import { loadProject, updateProject } from '../../../../../../lib/project';
import { requireAuth, isAdmin } from '../../../../../../lib/api-auth';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Nur POST' }); return; }

  const { session, ownerId } = await requireAuth(req, res);
  if (!session) return;

  const { id, sceneId } = req.query;
  const sceneIdx = parseInt(sceneId, 10);
  const { text, manualInput, sceneAdjustment, videoHints, videoStatus, videoRequestId, videoError, videoFile, videoModel, videoAudio, scriptType } = req.body ?? {};

  const project = loadProject(id);
  if (!project) { res.status(404).json({ error: 'Projekt nicht gefunden' }); return; }

  if (project.ownerId && project.ownerId !== ownerId && !isAdmin(session)) {
    res.status(403).json({ error: 'Kein Zugriff' }); return;
  }

  const scene = project.scenes?.[sceneIdx];
  if (!scene) { res.status(404).json({ error: 'Szene nicht gefunden' }); return; }

  const updatedScenes = [...project.scenes];
  const patch = {};
  if (text !== undefined) patch.text = text;
  if (manualInput !== undefined) patch.manualInput = manualInput;
  if (sceneAdjustment !== undefined) patch.sceneAdjustment = sceneAdjustment;
  if (videoHints !== undefined) patch.videoHints = videoHints;
  // Video reset fields
  if ('videoStatus' in (req.body ?? {})) patch.videoStatus = videoStatus;
  if ('videoRequestId' in (req.body ?? {})) patch.videoRequestId = videoRequestId;
  if ('videoError' in (req.body ?? {})) patch.videoError = videoError;
  if ('videoFile' in (req.body ?? {})) patch.videoFile = videoFile;
  // Scene video settings
  if (videoModel !== undefined) patch.videoModel = videoModel;
  if (videoAudio !== undefined) patch.videoAudio = videoAudio;
  if (scriptType !== undefined) patch.scriptType = scriptType;
  updatedScenes[sceneIdx] = { ...scene, ...patch };
  updateProject(id, { scenes: updatedScenes });

  res.status(200).json({ ok: true });
}
