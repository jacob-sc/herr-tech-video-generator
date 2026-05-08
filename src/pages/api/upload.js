import formidable from 'formidable';
import path from 'path';
import fs from 'fs';
import { createProject, updateProject } from '../../lib/project';
import { requireAuth } from '../../lib/api-auth';
import { prisma } from '../../lib/prisma';

export const config = { api: { bodyParser: false } };

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Nur POST' });

  const { session, ownerId } = await requireAuth(req, res);
  if (!session) return;

  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  const form = formidable({
    uploadDir: UPLOAD_DIR,
    keepExtensions: true,
    maxFileSize: 500 * 1024 * 1024,
  });

  try {
    const [, files] = await form.parse(req);
    const video = files.video?.[0];
    if (!video) return res.status(400).json({ error: 'Kein "video"-Feld gefunden' });

    const project = createProject(ownerId);
    updateProject(project.id, { videoPath: video.filepath, status: 'uploaded' });

    await prisma.user.update({
      where: { id: ownerId },
      data: { projectsCreated: { increment: 1 } },
    }).catch(() => {});

    return res.status(200).json({ projectId: project.id, videoPath: video.filepath });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
