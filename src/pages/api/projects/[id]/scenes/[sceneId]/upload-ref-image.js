import path from 'path';
import fs from 'fs';
import formidable from 'formidable';
import { loadProject, updateProject, getProjectDir } from '../../../../../../lib/project';
import { requireAuth, isAdmin } from '../../../../../../lib/api-auth';

export const config = { api: { bodyParser: false } };

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

  const scene = project.scenes?.[sceneIdx];
  if (!scene) return res.status(404).json({ error: 'Szene nicht gefunden' });

  const projectDir = getProjectDir(id);
  const refDir = path.join(projectDir, 'ref-images');
  if (!fs.existsSync(refDir)) fs.mkdirSync(refDir, { recursive: true });

  const form = formidable({ uploadDir: refDir, keepExtensions: true, maxFileSize: 20 * 1024 * 1024 });

  try {
    const [, files] = await form.parse(req);
    const uploaded = files.image?.[0];
    if (!uploaded) return res.status(400).json({ error: 'Kein Bild hochgeladen' });

    const mimeToExt = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
    const ext = mimeToExt[uploaded.mimetype] ?? path.extname(uploaded.originalFilename || '.jpg') ?? '.jpg';
    const filename = `scene_${sceneIdx}_ref${ext}`;
    const destPath = path.join(refDir, filename);

    // Remove old ref image if exists
    if (scene.refImageFile) {
      const old = path.join(projectDir, scene.refImageFile);
      if (fs.existsSync(old)) fs.unlinkSync(old);
    }

    fs.renameSync(uploaded.filepath, destPath);
    const relPath = path.join('ref-images', filename);

    const updatedScenes = [...project.scenes];
    updatedScenes[sceneIdx] = { ...scene, refImageFile: relPath };
    updateProject(id, { scenes: updatedScenes });

    return res.status(200).json({ ok: true, refImageFile: relPath });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
