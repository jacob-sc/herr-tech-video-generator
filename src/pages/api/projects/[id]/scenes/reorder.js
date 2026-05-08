import { loadProject, updateProject } from '../../../../../lib/project';
import { requireAuth, isAdmin } from '../../../../../lib/api-auth';

/**
 * Reorders scenes by swapping two indices, adjusting timestamps to preserve durations.
 * Body: { fromIdx: number, toIdx: number }
 *
 * Timestamps are recalculated so durations stay the same but start/end times
 * are continuous from the first scene's start time.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Nur POST' });

  const { session, ownerId } = await requireAuth(req, res);
  if (!session) return;

  const { id } = req.query;
  const { fromIdx, toIdx } = req.body ?? {};

  if (fromIdx == null || toIdx == null || fromIdx === toIdx) {
    return res.status(400).json({ error: 'fromIdx und toIdx sind pflicht und müssen verschieden sein' });
  }

  const project = loadProject(id);
  if (!project) return res.status(404).json({ error: 'Projekt nicht gefunden' });

  if (project.ownerId && project.ownerId !== ownerId && !isAdmin(session)) {
    return res.status(403).json({ error: 'Kein Zugriff' });
  }

  const scenes = [...(project.scenes ?? [])];
  if (fromIdx < 0 || fromIdx >= scenes.length || toIdx < 0 || toIdx >= scenes.length) {
    return res.status(400).json({ error: 'Index außerhalb des Bereichs' });
  }

  // Move scene from fromIdx to toIdx
  const [moved] = scenes.splice(fromIdx, 1);
  scenes.splice(toIdx, 0, moved);

  // Recalculate timestamps: keep durations, chain continuously from first scene's original start
  const baseStart = scenes[0]?.start ?? 0;
  let cursor = baseStart;
  const reIndexed = scenes.map((s, i) => {
    const duration = s.end - s.start;
    const newStart = cursor;
    const newEnd = cursor + duration;
    cursor = newEnd;
    return { ...s, id: i, start: parseFloat(newStart.toFixed(3)), end: parseFloat(newEnd.toFixed(3)) };
  });

  updateProject(id, { scenes: reIndexed });
  return res.status(200).json({ ok: true, scenes: reIndexed });
}
