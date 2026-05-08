import { loadProject, updateProject } from '../../../../lib/project';
import { requireAuth, isAdmin } from '../../../../lib/api-auth';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Nur POST' });

  const { session, ownerId } = await requireAuth(req, res);
  if (!session) return;

  const { id } = req.query;
  const { title } = req.body ?? {};
  if (!title?.trim()) return res.status(400).json({ error: 'Kein Titel' });

  const project = loadProject(id);
  if (!project) return res.status(404).json({ error: 'Nicht gefunden' });

  if (project.ownerId && project.ownerId !== ownerId && !isAdmin(session)) {
    return res.status(403).json({ error: 'Kein Zugriff' });
  }

  updateProject(id, { title: title.trim() });
  return res.status(200).json({ ok: true });
}
