import { loadProject } from '../../../../lib/project';
import { requireAuth, isAdmin } from '../../../../lib/api-auth';

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).end(); return; }

  const { session, ownerId } = await requireAuth(req, res);
  if (!session) return;

  const { id } = req.query;
  const project = loadProject(id);
  if (!project) { res.status(404).json({ error: 'Projekt nicht gefunden' }); return; }

  if (project.ownerId && project.ownerId !== ownerId && !isAdmin(session)) {
    return res.status(403).json({ error: 'Kein Zugriff' });
  }

  res.json({
    status: project.exportStatus || 'idle',
    exportFile: project.exportFile || null,
    exportError: project.exportError || null,
  });
}
