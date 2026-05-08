import path from 'path';
import fs from 'fs';
import { getProjectDir, loadProject } from '../../../../../lib/project';
import { requireAuth, isAdmin } from '../../../../../lib/api-auth';

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).end(); return; }

  const { session, ownerId } = await requireAuth(req, res);
  if (!session) return;

  const { id, file } = req.query;

  const project = loadProject(id);
  if (project && project.ownerId && project.ownerId !== ownerId && !isAdmin(session)) {
    res.status(403).end(); return;
  }
  if (!file || typeof file !== 'string') { res.status(400).end(); return; }

  // Prevent path traversal
  const safeFile = path.basename(file);
  const projectDir = getProjectDir(id);
  const filePath = path.join(projectDir, 'exports', safeFile);

  if (!filePath.startsWith(projectDir + path.sep)) {
    res.status(403).end();
    return;
  }

  if (!fs.existsSync(filePath)) {
    res.status(404).end();
    return;
  }

  const stat = fs.statSync(filePath);
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Content-Disposition', `attachment; filename="${safeFile}"`);
  res.setHeader('Cache-Control', 'no-cache');

  fs.createReadStream(filePath).pipe(res);
}
