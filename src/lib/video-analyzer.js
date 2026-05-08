const Anthropic = require('@anthropic-ai/sdk').default;
const fs = require('fs');
const path = require('path');
const { readImageForClaude } = require('./image-resize');

const getClient = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Analysiert alle Szenen-Screenshots mit Claude Vision in einem einzigen API-Call.
 * Gibt pro Szene eine visuelle Analyse zurück (Charaktere, Setting, Stimmung, Aktion).
 * Diese Analyse wird für bessere Imagen- und Video-Prompts genutzt.
 *
 * @param {Array} scenes
 * @param {string} screenshotDir
 * @returns {Promise<Array>} scenes mit .analysis Feld
 */
async function analyzeVideoScenes(scenes, screenshotDir) {
  // Mittlere Screenshots (B) pro Szene laden
  const imageContents = [];
  const validIndices = [];

  for (const scene of scenes) {
    const file = scene.selectedScreenshot ?? `scene_${scene.id}_b.jpg`;
    const filePath = path.join(screenshotDir, file);

    // Fallback auf altes Format
    let resolvedPath = filePath;
    if (!fs.existsSync(resolvedPath)) {
      const fallback = path.join(screenshotDir, `scene_${scene.id}.jpg`);
      if (fs.existsSync(fallback)) resolvedPath = fallback;
      else continue;
    }

    try {
      const imgData = await readImageForClaude(resolvedPath);
      imageContents.push({
        type: 'image',
        source: { type: 'base64', media_type: imgData.mimeType, data: imgData.base64 },
      });
      validIndices.push(scene.id);
    } catch {
      // Bild konnte nicht gelesen werden → überspringen
    }
  }

  if (imageContents.length === 0) return scenes;

  // Alle Bilder + Analyse-Anfrage in einem Call
  const textContent = {
    type: 'text',
    text: `I'm showing you ${imageContents.length} screenshots from a video, one per scene (in order: scene ${validIndices.join(', scene ')}).

For EACH screenshot, analyze what you see and return a JSON array with one object per scene.

Each object must have:
- "id": the scene number (${validIndices.join(', ')})
- "characters": array of strings describing each visible character/person/object in detail (appearance, style, clothing, if it's a logo/mascot/CGI character etc.)
- "setting": description of the environment/background
- "mood": emotional tone/atmosphere
- "action": what is happening / what movement/action is visible
- "visualStyle": art style (CGI, realistic, animated, etc.) and color palette
- "keyElements": 2-3 most visually distinctive elements to reproduce in an AI image

Be VERY specific and visual. This will be used to generate AI images that match each scene.

Return ONLY the JSON array, no explanation.`,
  };

  try {
    const response = await getClient().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [...imageContents, textContent],
      }],
    });

    const raw = response.content[0].text.trim();
    // JSON aus Antwort extrahieren
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return scenes;

    const analyses = JSON.parse(match[0]);

    // Analyse in Szenen-Objekte einbauen
    const analysisMap = {};
    for (const a of analyses) {
      if (a.id !== undefined) analysisMap[a.id] = a;
    }

    return scenes.map(scene => ({
      ...scene,
      analysis: analysisMap[scene.id] ?? null,
    }));
  } catch (err) {
    console.error('[video-analyzer] Fehler:', err.message);
    return scenes; // Fallback ohne Analyse
  }
}

module.exports = { analyzeVideoScenes };
