import { loadProject, updateProject } from '../../../../../lib/project';
import { requireAuth, isAdmin } from '../../../../../lib/api-auth';

/**
 * Inserts a new manual scene at a given position.
 *
 * Body:
 *   insertAfterIndex  – insert after this scene index (-1 = at start)
 *   start             – start time (sec)
 *   end               – end time (sec)
 *   text              – optional script text
 *   cascadeTimestamps – if true, shift all subsequent scenes forward by (end - start) seconds
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Nur POST' });

  const { session, ownerId } = await requireAuth(req, res);
  if (!session) return;

  const { id } = req.query;
  const {
    insertAfterIndex = -1,
    start,
    end,
    text = '',
    manualInput = '',
    cascadeTimestamps = true,
  } = req.body ?? {};

  if (start == null || end == null) return res.status(400).json({ error: 'start und end sind pflicht' });
  if (end <= start) return res.status(400).json({ error: 'end muss größer als start sein' });

  const project = loadProject(id);
  if (!project) return res.status(404).json({ error: 'Projekt nicht gefunden' });

  if (project.ownerId && project.ownerId !== ownerId && !isAdmin(session)) {
    return res.status(403).json({ error: 'Kein Zugriff' });
  }

  const scenes = [...(project.scenes ?? [])];
  const duration = end - start;

  // Cascade: shift all scenes that come after the insertion point
  const insertPos = insertAfterIndex + 1; // 0-based index of new scene
  const shiftedScenes = cascadeTimestamps
    ? scenes.map((s, i) => {
        if (i < insertPos) return s;
        return { ...s, start: s.start + duration, end: s.end + duration };
      })
    : scenes;

  // Build new scene object
  const newScene = {
    id: insertPos,
    start,
    end,
    text,
    manualInput: manualInput || null,
    manual: true, // flag: manually created, no video source
    screenshotFiles: [],
    selectedScreenshot: null,
    refImageFile: null,       // uploaded reference image
    characters: [],
    characterDescription: null,
    characterImageFile: null,
    imagePrompt: null,
    imageFile: null,
    imageApproved: false,
    videoPrompt: null,
    videoFile: null,
    videoUrl: null,
    videoApproved: false,
    analysis: null,
  };

  // Insert and re-index
  shiftedScenes.splice(insertPos, 0, newScene);
  const reIndexed = shiftedScenes.map((s, i) => ({ ...s, id: i }));

  updateProject(id, { scenes: reIndexed });
  return res.status(200).json({ ok: true, scenes: reIndexed });
}
