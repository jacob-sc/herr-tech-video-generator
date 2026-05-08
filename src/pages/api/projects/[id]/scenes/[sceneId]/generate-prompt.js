import path from 'path';
import { loadProject, getProjectDir } from '../../../../../../lib/project';
import { requireAuth, isAdmin } from '../../../../../../lib/api-auth';
const { generateImagenPrompt } = require('../../../../../../lib/prompt-generator');

function getCharacters(scene, projectDir) {
  if (scene.characters && scene.characters.length > 0) {
    return scene.characters.map(c => ({
      label: c.label || null,
      description: c.description || null,
      imagePath: c.imageFile ? path.join(projectDir, 'character-images', c.imageFile) : null,
    }));
  }
  if (scene.characterDescription || scene.characterImageFile) {
    return [{
      label: null,
      description: scene.characterDescription || null,
      imagePath: scene.characterImageFile ? path.join(projectDir, 'character-images', scene.characterImageFile) : null,
    }];
  }
  return [];
}

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
  if (!project.setup) project.setup = { format: '9:16', styleDescription: '', styleDeviation: 3 };

  const scene = project.scenes?.[sceneIdx];
  if (!scene) return res.status(404).json({ error: 'Szene nicht gefunden' });

  const projectDir = getProjectDir(id);
  const selectedFile = scene.selectedScreenshot ?? `scene_${sceneIdx}_b.jpg`;
  const screenshotPath = path.join(projectDir, 'screenshots', selectedFile);

  const characters = getCharacters(scene, projectDir);

  try {
    const { prompt } = await generateImagenPrompt(
      screenshotPath,
      project.setup,
      characters,
      scene.analysis ?? null,
    );
    return res.status(200).json({ prompt });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
