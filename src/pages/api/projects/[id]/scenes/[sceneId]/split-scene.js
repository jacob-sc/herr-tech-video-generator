import { loadProject, updateProject } from '../../../../../../lib/project';
import { requireAuth, isAdmin } from '../../../../../../lib/api-auth';

/**
 * Splits a scene or inserts a new scene after the given sceneId.
 *
 * Body:
 *   newStart  – start time (sec) of the new scene
 *   newEnd    – end time (sec) of the new scene
 *   screenshot – optional: screenshot filename to use as reference for the new scene
 *   trimCurrent – if true, shrink the current scene's end to newStart (default: true)
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Nur POST' });

  const { session, ownerId } = await requireAuth(req, res);
  if (!session) return;

  const { id, sceneId } = req.query;
  const sceneIdx = parseInt(sceneId, 10);
  const { newStart, newEnd, screenshot, trimCurrent = true } = req.body ?? {};

  if (newStart == null || newEnd == null) {
    return res.status(400).json({ error: 'newStart und newEnd sind pflicht' });
  }
  if (newEnd <= newStart) {
    return res.status(400).json({ error: 'newEnd muss größer als newStart sein' });
  }

  const project = loadProject(id);
  if (!project) return res.status(404).json({ error: 'Projekt nicht gefunden' });

  if (project.ownerId && project.ownerId !== ownerId && !isAdmin(session)) {
    return res.status(403).json({ error: 'Kein Zugriff' });
  }

  const scenes = [...(project.scenes ?? [])];
  const currentScene = scenes[sceneIdx];
  if (!currentScene) return res.status(404).json({ error: 'Szene nicht gefunden' });

  // Optionally trim the current scene so it ends at newStart
  if (trimCurrent) {
    scenes[sceneIdx] = { ...currentScene, end: newStart };
  }

  // Determine screenshot for new scene – prefer the passed filename,
  // fall back to the screenshot the user currently has selected (usually C).
  const refScreenshot = screenshot ?? currentScene.selectedScreenshot ?? currentScene.screenshotFiles?.[2] ?? `scene_${sceneIdx}_c.jpg`;

  // Build transcript text for new time range from project transcript
  const transcript = project.transcript?.segments ?? [];
  const newText = transcript
    .filter(seg => seg.end > newStart && seg.start < newEnd)
    .map(seg => seg.text)
    .join(' ')
    .trim();

  // New scene object – place right after the current scene
  const newScene = {
    id: sceneIdx + 1,            // will be re-indexed below
    start: newStart,
    end: newEnd,
    text: newText || '',
    fromSplit: true,             // marks that this scene was created by splitting
    splitFromSceneIdx: sceneIdx, // original scene index for restore-on-delete
    screenshotFiles: [refScreenshot],   // single inherited reference — user can replace
    selectedScreenshot: refScreenshot,
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

  // Insert new scene after current scene and re-index all IDs
  scenes.splice(sceneIdx + 1, 0, newScene);
  const reIndexed = scenes.map((s, i) => ({ ...s, id: i }));

  updateProject(id, { scenes: reIndexed });

  return res.status(200).json({ ok: true, scenes: reIndexed });
}
