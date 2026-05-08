import { loadProject, updateProject } from '../../../../../../lib/project';
import { requireAuth, isAdmin } from '../../../../../../lib/api-auth';

/**
 * Sets a specific image from the scene's imageHistory as the active imageFile.
 * Body: { imageFile: string }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Nur POST' });

  const { session, ownerId } = await requireAuth(req, res);
  if (!session) return;

  const { id, sceneId } = req.query;
  const sceneIdx = parseInt(sceneId, 10);
  const { imageFile } = req.body ?? {};

  if (!imageFile) return res.status(400).json({ error: 'imageFile fehlt' });

  const project = loadProject(id);
  if (!project) return res.status(404).json({ error: 'Projekt nicht gefunden' });

  if (project.ownerId && project.ownerId !== ownerId && !isAdmin(session)) {
    return res.status(403).json({ error: 'Kein Zugriff' });
  }

  const scene = project.scenes?.[sceneIdx];
  if (!scene) return res.status(404).json({ error: 'Szene nicht gefunden' });

  const history = scene.imageHistory ?? (scene.imageFile ? [scene.imageFile] : []);
  if (!history.includes(imageFile)) {
    return res.status(400).json({ error: 'Bild nicht in History' });
  }

  // Move selected image to end of history (others shift forward by one)
  const reordered = [...history.filter(f => f !== imageFile), imageFile];

  const updatedScenes = [...project.scenes];
  updatedScenes[sceneIdx] = { ...scene, imageFile, imageHistory: reordered, imageApproved: false };
  updateProject(id, { scenes: updatedScenes });

  return res.status(200).json({ ok: true });
}
