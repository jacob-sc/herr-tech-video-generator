import formidable from 'formidable';
import path from 'path';
import fs from 'fs';
import { loadProject, updateProject, getProjectDir } from '../../../../lib/project';
import { requireAuth, isAdmin } from '../../../../lib/api-auth';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Nur POST' });

  const { session, ownerId } = await requireAuth(req, res);
  if (!session) return;

  const { id } = req.query;
  const project = loadProject(id);
  if (!project) return res.status(404).json({ error: 'Projekt nicht gefunden' });

  if (project.ownerId && project.ownerId !== ownerId && !isAdmin(session)) {
    return res.status(403).json({ error: 'Kein Zugriff' });
  }

  const projectDir = getProjectDir(id);
  const form = formidable({ uploadDir: projectDir, keepExtensions: true, maxFileSize: 20 * 1024 * 1024 });

  try {
    const [, files] = await form.parse(req);
    const image = files.image?.[0];
    if (!image) return res.status(400).json({ error: 'Kein Bild gefunden' });

    // Umbenennen in festen Namen
    const destPath = path.join(projectDir, 'setup-style.jpg');
    fs.renameSync(image.filepath, destPath);

    const setup = { ...(project.setup ?? {}), styleImageFile: 'setup-style.jpg' };
    updateProject(id, { setup });

    return res.status(200).json({ ok: true, styleImageFile: 'setup-style.jpg' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
