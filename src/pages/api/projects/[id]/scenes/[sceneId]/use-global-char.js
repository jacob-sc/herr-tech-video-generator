import { loadProject, updateProject } from '../../../../../../lib/project';
import { requireAuth, isAdmin } from '../../../../../../lib/api-auth';

/**
 * Adds a character from the project-level global library to this scene.
 * Body: { globalCharId: string }  (globalCharId = imageFile value, used as unique ID)
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Nur POST' });

  const { session, ownerId } = await requireAuth(req, res);
  if (!session) return;

  const { id, sceneId } = req.query;
  const sceneIdx = parseInt(sceneId, 10);
  const { globalCharId } = req.body ?? {};

  if (!globalCharId) return res.status(400).json({ error: 'globalCharId fehlt' });

  const project = loadProject(id);
  if (!project) return res.status(404).json({ error: 'Projekt nicht gefunden' });

  if (project.ownerId && project.ownerId !== ownerId && !isAdmin(session)) {
    return res.status(403).json({ error: 'Kein Zugriff' });
  }

  const scene = project.scenes?.[sceneIdx];
  if (!scene) return res.status(404).json({ error: 'Szene nicht gefunden' });

  const globalChar = (project.characters ?? []).find(c => c.id === globalCharId);
  if (!globalChar) return res.status(404).json({ error: 'Charakter nicht in Bibliothek' });

  // Don't add if already in this scene (same imageFile)
  const existing = scene.characters ?? [];
  if (existing.some(c => c.imageFile === globalChar.imageFile)) {
    return res.status(200).json({ ok: true, characters: existing, alreadyExists: true });
  }

  const characters = [...existing, {
    label: globalChar.label,
    description: globalChar.description,
    imageFile: globalChar.imageFile,
  }];

  const updatedScenes = [...project.scenes];
  updatedScenes[sceneIdx] = { ...scene, characters };
  updateProject(id, { scenes: updatedScenes });

  return res.status(200).json({ ok: true, characters });
}
