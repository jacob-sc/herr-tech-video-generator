import path from 'path';
import fs from 'fs';
import { getProjectDir, loadProject } from '../../../../../lib/project';
import { requireAuth, isAdmin } from '../../../../../lib/api-auth';

const MIME = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  mp4: 'video/mp4',
  webm: 'video/webm',
};

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).end(); return; }

  const { session, ownerId } = await requireAuth(req, res);
  if (!session) return;

  const { id, file } = req.query;

  const project = loadProject(id);
  if (project && project.ownerId && project.ownerId !== ownerId && !isAdmin(session)) {
    res.status(403).end(); return;
  }
  const relativePath = Array.isArray(file) ? path.join(...file) : file;
  const projectDir = getProjectDir(id);
  const filePath = path.join(projectDir, relativePath);

  // Path-Traversal-Schutz
  if (!filePath.startsWith(projectDir + path.sep) && filePath !== projectDir) {
    res.status(403).end();
    return;
  }

  let resolvedPath = filePath;
  if (!fs.existsSync(resolvedPath)) {
    // Rückwärtskompatibilität: neues Format scene_0_b.jpg → versuche altes scene_0.jpg
    const newFmtMatch = relativePath.match(/^screenshots\/scene_(\d+)_[abc]\.jpg$/);
    if (newFmtMatch) {
      resolvedPath = path.join(projectDir, `screenshots/scene_${newFmtMatch[1]}.jpg`);
    }
    if (!fs.existsSync(resolvedPath)) {
      res.status(404).end();
      return;
    }
  }

  const ext = path.extname(resolvedPath).slice(1).toLowerCase();
  const contentType = MIME[ext] ?? 'application/octet-stream';

  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'public, max-age=3600');
  fs.createReadStream(resolvedPath).pipe(res);
}
