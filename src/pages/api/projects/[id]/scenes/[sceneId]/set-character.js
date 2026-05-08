import formidable from 'formidable';
import path from 'path';
import fs from 'fs';
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
  const charDir = path.join(projectDir, 'character-images');
  if (!fs.existsSync(charDir)) fs.mkdirSync(charDir, { recursive: true });

  const form = formidable({ uploadDir: charDir, keepExtensions: true, maxFileSize: 20 * 1024 * 1024 });

  try {
    const [fields, files] = await form.parse(req);

    const charIdxRaw = Array.isArray(fields.charIdx) ? fields.charIdx[0] : (fields.charIdx ?? '-1');
    const charIdx = parseInt(charIdxRaw, 10);
    const label = (Array.isArray(fields.label) ? fields.label[0] : fields.label) ?? '';
    const description = (Array.isArray(fields.description) ? fields.description[0] : fields.description) ?? '';

    // Get existing characters array with backward compat migration
    let characters = scene.characters ? [...scene.characters] : [];
    if (characters.length === 0 && (scene.characterDescription || scene.characterImageFile)) {
      characters = [{ label: 'Charakter 1', description: scene.characterDescription || '', imageFile: scene.characterImageFile || null }];
    }

    const targetIdx = (charIdx >= 0 && charIdx < characters.length) ? charIdx : characters.length;
    const existing = characters[targetIdx] || {};

    let imageFile = existing.imageFile || null;
    if (files.image?.[0]) {
      const uploaded = files.image[0];
      // Use mime type from upload to determine extension — don't force .jpg
      const mimeToExt = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp' };
      const ext = mimeToExt[uploaded.mimetype] ?? path.extname(uploaded.originalFilename || '.jpg').toLowerCase() ?? '.jpg';
      const filename = `scene_${sceneIdx}_char_${targetIdx}${ext}`;
      const destPath = path.join(charDir, filename);
      // Remove old file if it exists with different extension
      if (existing.imageFile && existing.imageFile !== filename) {
        const oldPath = path.join(charDir, existing.imageFile);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      fs.renameSync(uploaded.filepath, destPath);
      imageFile = filename;
    }

    characters[targetIdx] = {
      label: label || existing.label || `Charakter ${targetIdx + 1}`,
      description,
      imageFile,
    };

    const updatedScenes = [...project.scenes];
    updatedScenes[sceneIdx] = { ...scene, characters };

    // Sync to project-level character library (if character has an image)
    const savedChar = characters[targetIdx];
    const globalChars = [...(project.characters ?? [])];
    if (savedChar.imageFile) {
      const existIdx = globalChars.findIndex(c => c.imageFile === savedChar.imageFile);
      const entry = { id: savedChar.imageFile, label: savedChar.label, description: savedChar.description, imageFile: savedChar.imageFile };
      if (existIdx >= 0) { globalChars[existIdx] = { ...globalChars[existIdx], ...entry }; }
      else { globalChars.push(entry); }
    }

    updateProject(id, { scenes: updatedScenes, characters: globalChars });

    return res.status(200).json({ ok: true, characters, targetIdx });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
