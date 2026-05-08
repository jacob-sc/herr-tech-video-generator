import fs from 'fs';
import path from 'path';
import { PROJECTS_DIR, loadProject } from '../../../../lib/project';
import { requireAuth, isAdmin } from '../../../../lib/api-auth';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Nur POST' });

  const { session, ownerId } = await requireAuth(req, res);
  if (!session) return;

  const { id } = req.query;
  if (!id || id.includes('..') || id.includes('/')) {
    return res.status(400).json({ error: 'Ungültige Projekt-ID' });
  }

  const projectDir = path.join(PROJECTS_DIR, id);
  if (!fs.existsSync(projectDir)) {
    return res.status(404).json({ error: 'Projekt nicht gefunden' });
  }

  const project = loadProject(id);
  if (project && project.ownerId && project.ownerId !== ownerId && !isAdmin(session)) {
    return res.status(403).json({ error: 'Kein Zugriff' });
  }

  try {
    fs.rmSync(projectDir, { recursive: true, force: true });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[delete-project]', err);
    return res.status(500).json({ error: err.message });
  }
}
