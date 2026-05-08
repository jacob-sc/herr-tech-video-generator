const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PROJECTS_DIR = path.join(process.cwd(), 'data', 'projects');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function createProject(ownerId) {
  ensureDir(PROJECTS_DIR);
  const id = `proj_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const dir = path.join(PROJECTS_DIR, id);
  ensureDir(dir);
  ensureDir(path.join(dir, 'screenshots'));
  ensureDir(path.join(dir, 'generated-images'));
  ensureDir(path.join(dir, 'generated-videos'));

  const project = {
    id,
    ownerId: ownerId || null,
    createdAt: new Date().toISOString(),
    videoPath: null,
    status: 'created',
    transcript: null,
    scenes: [],
    setup: null,
  };

  saveProject(project);
  return project;
}

function getProjectDir(id) {
  return path.join(PROJECTS_DIR, id);
}

function loadProject(id) {
  const jsonPath = path.join(PROJECTS_DIR, id, 'project.json');
  if (!fs.existsSync(jsonPath)) return null;
  return JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
}

function saveProject(project) {
  const dir = path.join(PROJECTS_DIR, project.id);
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify(project, null, 2));
}

function updateProject(id, updates) {
  const project = loadProject(id);
  if (!project) throw new Error(`Projekt nicht gefunden: ${id}`);
  const updated = { ...project, ...updates };
  saveProject(updated);
  return updated;
}

module.exports = { createProject, loadProject, saveProject, updateProject, getProjectDir, PROJECTS_DIR };
