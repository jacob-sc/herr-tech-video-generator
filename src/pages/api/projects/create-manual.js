import { createProject, updateProject } from '../../../lib/project';
import { requireAuth } from '../../../lib/api-auth';
import { prisma } from '../../../lib/prisma';

/**
 * Creates a blank project without any video — user adds scenes manually.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Nur POST' });

  const { session, ownerId } = await requireAuth(req, res);
  if (!session) return;

  const project = createProject(ownerId);

  updateProject(project.id, {
    manualProject: true,
    status: 'setup_done',
    setup: {
      format: '9:16',
      styleDescription: '',
      styleDeviation: 3,
      subtitleLanguage: 'de',
      subtitleColor: '#FFFFFF',
      subtitleFont: 'Arial Bold',
      subtitlePosition: 'bottom',
      subtitleAnimation: 'word-by-word',
    },
  });

  await prisma.user.update({
    where: { id: ownerId },
    data: { projectsCreated: { increment: 1 } },
  }).catch(() => {});

  return res.status(200).json({ projectId: project.id });
}
