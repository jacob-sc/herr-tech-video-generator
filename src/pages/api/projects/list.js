import fs from 'fs';
import path from 'path';
import { PROJECTS_DIR } from '../../../lib/project';
import { requireAuth } from '../../../lib/api-auth';
import { isAdmin } from '../../../lib/api-auth';
import { prisma } from '../../../lib/prisma';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Nur GET' });

  const { session, ownerId } = await requireAuth(req, res);
  if (!session) return;

  if (!fs.existsSync(PROJECTS_DIR)) return res.status(200).json({ projects: [] });

  const dirs = fs.readdirSync(PROJECTS_DIR).filter(d => {
    const jsonPath = path.join(PROJECTS_DIR, d, 'project.json');
    return fs.existsSync(jsonPath);
  });

  const adminView = isAdmin(session);

  const projects = dirs
    .map(d => {
      try {
        const raw = fs.readFileSync(path.join(PROJECTS_DIR, d, 'project.json'), 'utf-8');
        return JSON.parse(raw);
      } catch { return null; }
    })
    .filter(Boolean)
    // Jeder User sieht nur seine eigenen Projekte; Admin sieht alle
    .filter(p => adminView || p.ownerId === ownerId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Für Admins: Owner-Email zu jedem Projekt hinzufügen
  if (adminView) {
    const ownerIds = [...new Set(projects.map(p => p.ownerId).filter(Boolean))];
    const users = ownerIds.length > 0
      ? await prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, email: true, name: true } })
      : [];
    const userMap = Object.fromEntries(users.map(u => [u.id, u]));

    const enriched = projects.map(p => ({
      ...p,
      ownerEmail: userMap[p.ownerId]?.email ?? null,
      ownerName: userMap[p.ownerId]?.name ?? null,
    }));
    return res.status(200).json({ projects: enriched });
  }

  return res.status(200).json({ projects });
}
