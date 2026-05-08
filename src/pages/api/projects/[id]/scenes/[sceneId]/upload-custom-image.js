import path from 'path';
import fs from 'fs';
import formidable from 'formidable';
import { loadProject, updateProject, getProjectDir } from '../../../../../../lib/project';
import { requireAuth, isAdmin } from '../../../../../../lib/api-auth';

export const config = { api: { bodyParser: false } };

/**
 * Uploads a custom image (JPG/PNG/WebP) and sets it as the scene's active imageFile,
 * so it appears on the right panel and is used for video generation.
 */
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
  const generatedDir = path.join(projectDir, 'generated-images');
  if (!fs.existsSync(generatedDir)) fs.mkdirSync(generatedDir, { recursive: true });

  const form = formidable({ uploadDir: generatedDir, keepExtensions: true, maxFileSize: 30 * 1024 * 1024 });

  try {
    const [, files] = await form.parse(req);
    const uploaded = files.image?.[0];
    if (!uploaded) return res.status(400).json({ error: 'Kein Bild hochgeladen' });

    const mimeToExt = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
    const ext = mimeToExt[uploaded.mimetype] ?? path.extname(uploaded.originalFilename || '.jpg') ?? '.jpg';
    const destFilename = `scene_${sceneIdx}_custom_${Date.now()}${ext}`;
    const destPath = path.join(generatedDir, destFilename);

    fs.renameSync(uploaded.filepath, destPath);

    // Append to imageHistory and set as active
    const history = scene.imageHistory ?? (scene.imageFile ? [scene.imageFile] : []);
    const newHistory = [...history, destFilename];

    const updatedScenes = [...project.scenes];
    updatedScenes[sceneIdx] = {
      ...scene,
      imageFile: destFilename,
      imageHistory: newHistory,
      imageApproved: false,
      imageStatus: null,
    };
    updateProject(id, { scenes: updatedScenes });

    return res.status(200).json({ ok: true, imageFile: destFilename });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
