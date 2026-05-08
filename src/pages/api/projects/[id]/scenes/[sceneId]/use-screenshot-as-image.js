import path from 'path';
import fs from 'fs';
import { loadProject, updateProject, getProjectDir } from '../../../../../../lib/project';
import { requireAuth, isAdmin } from '../../../../../../lib/api-auth';

/**
 * Copies a screenshot (from the left panel) to generated-images and sets it as the
 * scene's active imageFile — allowing it to be used for video generation directly.
 * Body: { screenshotFile: string }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Nur POST' });

  const { session, ownerId } = await requireAuth(req, res);
  if (!session) return;

  const { id, sceneId } = req.query;
  const sceneIdx = parseInt(sceneId, 10);
  const { screenshotFile } = req.body ?? {};

  if (!screenshotFile) return res.status(400).json({ error: 'screenshotFile fehlt' });

  const project = loadProject(id);
  if (!project) return res.status(404).json({ error: 'Projekt nicht gefunden' });

  if (project.ownerId && project.ownerId !== ownerId && !isAdmin(session)) {
    return res.status(403).json({ error: 'Kein Zugriff' });
  }

  const scene = project.scenes?.[sceneIdx];
  if (!scene) return res.status(404).json({ error: 'Szene nicht gefunden' });

  const projectDir = getProjectDir(id);
  const srcPath = path.join(projectDir, 'screenshots', screenshotFile);
  if (!fs.existsSync(srcPath)) return res.status(404).json({ error: 'Screenshot nicht gefunden' });

  // Copy screenshot into generated-images with a unique name
  const generatedDir = path.join(projectDir, 'generated-images');
  if (!fs.existsSync(generatedDir)) fs.mkdirSync(generatedDir, { recursive: true });

  const ext = path.extname(screenshotFile) || '.jpg';
  const destFilename = `scene_${sceneIdx}_screenshot_${Date.now()}${ext}`;
  const destPath = path.join(generatedDir, destFilename);
  fs.copyFileSync(srcPath, destPath);

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
}
