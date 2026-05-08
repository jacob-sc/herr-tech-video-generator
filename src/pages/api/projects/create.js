import { createProject } from '../../../lib/project';
import { requireAuth } from '../../../lib/api-auth';
import { prisma } from '../../../lib/prisma';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Nur POST' });
  const { session, ownerId } = await requireAuth(req, res);
  if (!session) return;

  const project = createProject(ownerId);

  // Statistik-Zähler erhöhen
  await prisma.user.update({
    where: { id: ownerId },
    data: { projectsCreated: { increment: 1 } },
  }).catch(() => {});

  return res.status(200).json({ projectId: project.id });
}
