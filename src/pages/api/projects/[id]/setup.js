import { loadProject, updateProject } from '../../../../lib/project';
import { requireAuth, isAdmin } from '../../../../lib/api-auth';

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

  const {
    format,
    styleDescription,
    styleDeviation,
    subtitleLanguage,
    subtitleColor,
    subtitleFont,
    subtitlePosition,
    subtitleAnimation,
  } = req.body ?? {};

  if (format && !['9:16', '16:9'].includes(format)) {
    return res.status(400).json({ error: 'Ungültiges Format (9:16 oder 16:9)' });
  }

  // Merge with existing setup so partial updates don't erase other fields
  const existing = project.setup ?? {};
  const setup = {
    ...existing,
    format: format ?? existing.format ?? '9:16',
    styleDescription: styleDescription ?? existing.styleDescription ?? '',
    styleDeviation: Number(styleDeviation ?? existing.styleDeviation ?? 3),
    subtitleLanguage: subtitleLanguage ?? existing.subtitleLanguage ?? 'de',
    subtitleColor: subtitleColor ?? existing.subtitleColor ?? '#FFFFFF',
    subtitleFont: subtitleFont ?? existing.subtitleFont ?? 'Arial Bold',
    subtitlePosition: subtitlePosition ?? existing.subtitlePosition ?? 'bottom',
    subtitleAnimation: subtitleAnimation ?? existing.subtitleAnimation ?? 'fade',
  };

  const updated = updateProject(id, { setup, status: 'setup_done' });
  return res.status(200).json({ ok: true, setup: updated.setup });
}
