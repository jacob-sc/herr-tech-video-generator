import { loadProject, updateProject } from '../../../../../../lib/project';
import { requireAuth, isAdmin } from '../../../../../../lib/api-auth';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Nur POST' });

  const { session, ownerId } = await requireAuth(req, res);
  if (!session) return;

  const { id, sceneId } = req.query;
  const sceneIdx = parseInt(sceneId, 10);

  const project = loadProject(id);
  if (!project) return res.status(404).json({ error: 'Projekt nicht gefunden' });

  if (project.ownerId && project.ownerId !== ownerId && !isAdmin(session)) {
    return res.status(403).json({ error: 'Kein Zugriff' });
  }

  const scenes = [...(project.scenes ?? [])];
  if (sceneIdx < 0 || sceneIdx >= scenes.length) {
    return res.status(404).json({ error: 'Szene nicht gefunden' });
  }

  const deleted = scenes[sceneIdx];
  const hasPrev = sceneIdx > 0;

  scenes.splice(sceneIdx, 1);

  const reIndexed = scenes.map((s, i) => {
    if (hasPrev && i === sceneIdx - 1) {
      // Extend previous scene's end to cover the deleted scene's time range
      return { ...s, id: i, end: deleted.end };
    }
    return { ...s, id: i };
  });

  updateProject(id, { scenes: reIndexed });
  return res.status(200).json({ ok: true, scenes: reIndexed });
}
