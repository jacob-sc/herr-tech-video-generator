import { loadProject, updateProject } from '../../../../../../lib/project';
import { requireAuth, isAdmin } from '../../../../../../lib/api-auth';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Nur POST' });

  const { session, ownerId } = await requireAuth(req, res);
  if (!session) return;

  const { id, sceneId } = req.query;
  const sceneIdx = parseInt(sceneId, 10);
  const { screenshotFile } = req.body ?? {};

  const project = loadProject(id);
  if (!project) return res.status(404).json({ error: 'Projekt nicht gefunden' });

  if (project.ownerId && project.ownerId !== ownerId && !isAdmin(session)) {
    return res.status(403).json({ error: 'Kein Zugriff' });
  }

  const scene = project.scenes?.[sceneIdx];
  if (!scene) return res.status(404).json({ error: 'Szene nicht gefunden' });

  if (!scene.screenshotFiles?.includes(screenshotFile)) {
    return res.status(400).json({ error: 'Ungültiger Screenshot' });
  }

  const updatedScenes = [...project.scenes];
  updatedScenes[sceneIdx] = { ...scene, selectedScreenshot: screenshotFile };
  updateProject(id, { scenes: updatedScenes });

  return res.status(200).json({ ok: true, selectedScreenshot: screenshotFile });
}
