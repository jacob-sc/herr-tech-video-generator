import path from 'path';
import { loadProject, updateProject, getProjectDir } from '../../../../../../lib/project';
import { requireAuth, isAdmin } from '../../../../../../lib/api-auth';
import { prisma } from '../../../../../../lib/prisma';

const { generateImagenPrompt } = require('../../../../../../lib/prompt-generator');
const { generateImage } = require('../../../../../../lib/imagen');

/** Build characters array from scene, supporting both new and legacy format */
function getCharacters(scene, projectDir) {
  if (scene.characters && scene.characters.length > 0) {
    return scene.characters.map(c => ({
      label: c.label || null,
      description: c.description || null,
      imagePath: c.imageFile ? path.join(projectDir, 'character-images', c.imageFile) : null,
    }));
  }
  if (scene.characterDescription || scene.characterImageFile) {
    return [{
      label: null,
      description: scene.characterDescription || null,
      imagePath: scene.characterImageFile ? path.join(projectDir, 'character-images', scene.characterImageFile) : null,
    }];
  }
  return [];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Nur POST' });

  const { session, ownerId } = await requireAuth(req, res);
  if (!session) return;

  const { id, sceneId } = req.query;
  const sceneIdx = parseInt(sceneId, 10);
  const {
    customPrompt,
    sceneAdjustment,
    useScreenshotRef = true,
    adjustmentImageBase64,
    adjustmentImageMime,
    manualSceneInput,
    externalRefProjectId,
    externalRefImageFile,
    globalStyleText,
    globalStyleImageBase64,
    globalStyleImageMime,
  } = req.body ?? {};

  const project = loadProject(id);
  if (!project) return res.status(404).json({ error: 'Projekt nicht gefunden' });

  if (project.ownerId && project.ownerId !== ownerId && !isAdmin(session)) {
    return res.status(403).json({ error: 'Kein Zugriff' });
  }

  // Use default setup if none has been saved yet
  if (!project.setup) {
    project.setup = { format: '9:16', styleDescription: '', styleDeviation: 3 };
  }

  const scene = project.scenes?.[sceneIdx];
  if (!scene) return res.status(404).json({ error: 'Szene nicht gefunden' });

  const projectDir = getProjectDir(id);
  const screenshotDir = path.join(projectDir, 'screenshots');

  // Manual scenes may use an uploaded ref image instead of a screenshot
  const refImagePath = scene.refImageFile
    ? path.join(projectDir, scene.refImageFile)
    : null;
  const selectedFile = scene.selectedScreenshot ?? scene.screenshotFiles?.[1] ?? null;
  const screenshotPath = selectedFile ? path.join(screenshotDir, selectedFile) : null;

  // External ref: image from another scene (e.g. prev/next scene's generated image)
  let externalRefPath = null;
  if (externalRefProjectId && externalRefImageFile) {
    const extPath = path.join(getProjectDir(externalRefProjectId), 'generated-images', externalRefImageFile);
    if (require('fs').existsSync(extPath)) externalRefPath = extPath;
  }

  // For prompt generation: prefer external ref > uploaded ref image > screenshot
  const visualRefForPrompt = externalRefPath ?? refImagePath ?? screenshotPath;

  const styleImagePath = project.setup.styleImageFile
    ? path.join(projectDir, project.setup.styleImageFile)
    : null;

  const characters = getCharacters(scene, projectDir);
  const characterImagePaths = characters.map(c => c.imagePath).filter(Boolean);

  // Mark scene as generating immediately so the UI can track it across navigations
  try {
    const markScenes = [...project.scenes];
    markScenes[sceneIdx] = { ...markScenes[sceneIdx], imageStatus: 'generating' };
    updateProject(id, { scenes: markScenes });
  } catch {}

  try {
    // Merge scene adjustment with global style text
    const combinedAdjustment = [sceneAdjustment?.trim(), globalStyleText?.trim()].filter(Boolean).join(' | ');
    // Prefer scene-specific adjustment image; fall back to global style image
    const effectiveAdjBase64 = adjustmentImageBase64 ?? globalStyleImageBase64 ?? null;
    const effectiveAdjMime = adjustmentImageBase64 ? (adjustmentImageMime ?? 'image/jpeg') : (globalStyleImageMime ?? 'image/jpeg');

    // Build adjustment reference (image + text)
    const adjustmentRef = (effectiveAdjBase64 || combinedAdjustment)
      ? {
          base64: effectiveAdjBase64,
          mimeType: effectiveAdjMime,
          description: combinedAdjustment || (globalStyleText ? `Global style: ${globalStyleText}` : ''),
        }
      : null;

    let imagePrompt = customPrompt?.trim() || null;
    let editMode = null;

    if (!imagePrompt) {
      const result = await generateImagenPrompt(
        visualRefForPrompt,
        project.setup,
        characters,
        scene.analysis ?? null,
        adjustmentRef,
        manualSceneInput?.trim() || null,
      );
      // generateImagenPrompt now returns { prompt, editMode }
      if (typeof result === 'object' && result.prompt) {
        imagePrompt = result.prompt;
        editMode = result.editMode ?? null;
      } else {
        // backwards compat: if still returns string
        imagePrompt = result;
      }
    } else if (sceneAdjustment?.trim()) {
      // Custom prompt provided: still append text adjustment
      imagePrompt = `${imagePrompt}. Visual adjustments: ${sceneAdjustment.trim()}`;
    }

    const filename = `scene_${sceneIdx}_${Date.now()}.jpg`;
    const outputDir = path.join(projectDir, 'generated-images');

    const resolvedScreenshotRef = useScreenshotRef ? (externalRefPath ?? refImagePath ?? screenshotPath ?? undefined) : undefined;

    console.log(`[generate-image] ── REFERENCE IMAGES ──`);
    console.log(`[generate-image]  [1] screenshotRef: ${resolvedScreenshotRef ?? 'NONE'} exists=${resolvedScreenshotRef ? require('fs').existsSync(resolvedScreenshotRef) : false}`);
    characterImagePaths.forEach((p, i) => console.log(`[generate-image]  [${i+2}] character: ${p} exists=${require('fs').existsSync(p)}`));
    console.log(`[generate-image]  adj base64: ${effectiveAdjBase64 ? 'YES ('+effectiveAdjMime+')' : 'NONE'}`);
    console.log(`[generate-image]  styleImage: ${styleImagePath ?? 'NONE'}`);
    console.log(`[generate-image]  editMode: ${editMode ?? 'instruct'}`);
    console.log(`[generate-image]  prompt: "${imagePrompt?.slice(0, 120)}..."`);

    await generateImage(imagePrompt, {
      format: project.setup.format,
      outputDir,
      filename,
      styleImagePath: styleImagePath ?? undefined,
      editMode,
      screenshotRefPath: resolvedScreenshotRef,
      subjectImagePaths: characterImagePaths,
      adjustmentImageBase64: effectiveAdjBase64 ?? undefined,
      adjustmentImageMime: effectiveAdjMime ?? 'image/jpeg',
    });

    // Reload project fresh before writing to avoid race condition when
    // multiple scenes are generating concurrently (each read the same stale snapshot).
    const freshProject = loadProject(id);
    const freshScene = freshProject.scenes[sceneIdx] ?? scene;
    const prevHistory = freshScene.imageHistory ?? (freshScene.imageFile ? [freshScene.imageFile] : []);
    const imageHistory = [...prevHistory, filename];

    const updatedScenes = [...freshProject.scenes];
    updatedScenes[sceneIdx] = { ...freshScene, imagePrompt, imageFile: filename, imageApproved: false, imageHistory, imageStatus: null };
    updateProject(id, { scenes: updatedScenes });

    await prisma.user.update({ where: { id: ownerId }, data: { imagesGenerated: { increment: 1 } } }).catch(() => {});

    return res.status(200).json({ ok: true, sceneId: sceneIdx, imagePrompt, imageFile: filename });
  } catch (err) {
    console.error('[generate-image] Fehler:', err);
    // Clear generating status on error
    try {
      const errProject = loadProject(id);
      const errScenes = [...errProject.scenes];
      errScenes[sceneIdx] = { ...errScenes[sceneIdx], imageStatus: null };
      updateProject(id, { scenes: errScenes });
    } catch {}
    return res.status(500).json({ error: err.message });
  }
}
