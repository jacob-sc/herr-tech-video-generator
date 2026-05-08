require('./load-env');
const fs = require('fs');
const path = require('path');

/**
 * Standalone-Modus: Bildgenerierung läuft ausschließlich über Gemini /
 * "Nano Banana" (gemini-3-pro-image-preview, Fallback gemini-2.5-flash-image).
 *
 * Vertex AI ist NICHT enthalten — die Bildqualität war im Fallback-Pfad
 * unzuverlässig. Wenn Gemini fehlschlägt, kommt eine klare Fehlermeldung,
 * keine versteckte Vertex-Anfrage.
 */

const GEMINI_IMAGE_MODEL = 'gemini-3-pro-image-preview';
const GEMINI_IMAGE_MODEL_FALLBACK = 'gemini-2.5-flash-image';

/** Detect actual image media type from file magic bytes */
function detectMediaType(filePath) {
  try {
    const buf = Buffer.alloc(12);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);
    if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
    if (buf[0] === 0xFF && buf[1] === 0xD8) return 'image/jpeg';
    if (buf[0] === 0x47 && buf[1] === 0x49) return 'image/gif';
    if (buf[0] === 0x52 && buf[1] === 0x49 && buf[8] === 0x57) return 'image/webp';
    return 'image/jpeg';
  } catch { return 'image/jpeg'; }
}

/**
 * Generates an image via Gemini (Nano Banana).
 *
 * @param {string} prompt
 * @param {{
 *   format: '9:16'|'16:9',
 *   outputDir: string,
 *   filename: string,
 *   screenshotRefPath?: string,
 *   subjectImagePaths?: string[],
 *   adjustmentImageBase64?: string,
 *   adjustmentImageMime?: string,
 * }} options
 */
async function generateImage(prompt, { format = '9:16', outputDir, filename, screenshotRefPath, subjectImagePaths = [], adjustmentImageBase64 = null, adjustmentImageMime = 'image/jpeg' } = {}) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY fehlt in .env.local — Bildgenerierung nicht möglich.');
  }
  return generateImageGemini(prompt, {
    format, outputDir, filename, screenshotRefPath, subjectImagePaths,
    adjustmentImageBase64, adjustmentImageMime, apiKey,
  });
}

async function generateImageGemini(prompt, { format, outputDir, filename, screenshotRefPath, subjectImagePaths, adjustmentImageBase64, adjustmentImageMime, apiKey, _retries = 0, _model = GEMINI_IMAGE_MODEL }) {
  console.log(`[imagen] Gemini image — model: ${_model}`);

  const parts = [];

  if (screenshotRefPath && fs.existsSync(screenshotRefPath)) {
    const b64 = fs.readFileSync(screenshotRefPath).toString('base64');
    const mimeType = detectMediaType(screenshotRefPath);
    parts.push({ inlineData: { mimeType, data: b64 } });
    console.log(`[imagen] Gemini + scene: ${path.basename(screenshotRefPath)}`);
  }

  for (const subjectPath of subjectImagePaths) {
    if (subjectPath && fs.existsSync(subjectPath)) {
      const b64 = fs.readFileSync(subjectPath).toString('base64');
      const mimeType = detectMediaType(subjectPath);
      parts.push({ inlineData: { mimeType, data: b64 } });
      console.log(`[imagen] Gemini + character: ${path.basename(subjectPath)}`);
    }
  }

  if (adjustmentImageBase64) {
    parts.push({ inlineData: { mimeType: adjustmentImageMime || 'image/jpeg', data: adjustmentImageBase64 } });
    console.log(`[imagen] Gemini + adjustment image`);
  }

  parts.push({ text: prompt });

  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseModalities: ['IMAGE'],
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${_model}:generateContent?key=${apiKey}`;
  console.log(`[imagen] Gemini POST → ${parts.length - 1} images + prompt: "${prompt.slice(0, 80)}..."`);

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error(`[imagen] Gemini network error: ${err.message}`);
    if (_model !== GEMINI_IMAGE_MODEL_FALLBACK) {
      console.warn(`[imagen] Retrying with fallback model: ${GEMINI_IMAGE_MODEL_FALLBACK}`);
      return generateImageGemini(prompt, { format, outputDir, filename, screenshotRefPath, subjectImagePaths, adjustmentImageBase64, adjustmentImageMime, apiKey, _retries: 0, _model: GEMINI_IMAGE_MODEL_FALLBACK });
    }
    throw new Error(`Gemini-Bildgenerierung fehlgeschlagen: ${err.message}`);
  }

  if (!response.ok) {
    const errText = await response.text();
    console.error(`[imagen] Gemini error (${response.status}): ${errText.slice(0, 400)}`);
    if ((response.status === 500 || response.status === 503) && _retries < 2) {
      const wait = (_retries + 1) * 8000;
      console.warn(`[imagen] Gemini retry ${_retries + 1}/2 in ${wait / 1000}s...`);
      await new Promise(r => setTimeout(r, wait));
      return generateImageGemini(prompt, { format, outputDir, filename, screenshotRefPath, subjectImagePaths, adjustmentImageBase64, adjustmentImageMime, apiKey, _retries: _retries + 1, _model });
    }
    if ((response.status === 404 || response.status === 400) && _model !== GEMINI_IMAGE_MODEL_FALLBACK) {
      console.warn(`[imagen] ${_model} not available — switching to fallback: ${GEMINI_IMAGE_MODEL_FALLBACK}`);
      return generateImageGemini(prompt, { format, outputDir, filename, screenshotRefPath, subjectImagePaths, adjustmentImageBase64, adjustmentImageMime, apiKey, _retries: 0, _model: GEMINI_IMAGE_MODEL_FALLBACK });
    }
    throw new Error(`Gemini-Bildgenerierung fehlgeschlagen: ${response.status} ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];
  const imagePart = candidate?.content?.parts?.find(p => p.inlineData?.data);

  if (!imagePart?.inlineData?.data) {
    console.warn(`[imagen] Gemini returned no image. Response: ${JSON.stringify(data).slice(0, 300)}`);
    if (_retries < 2) {
      await new Promise(r => setTimeout(r, (_retries + 1) * 6000));
      return generateImageGemini(prompt, { format, outputDir, filename, screenshotRefPath, subjectImagePaths, adjustmentImageBase64, adjustmentImageMime, apiKey, _retries: _retries + 1, _model });
    }
    if (_model !== GEMINI_IMAGE_MODEL_FALLBACK) {
      console.warn(`[imagen] No image from ${_model} — trying fallback model`);
      return generateImageGemini(prompt, { format, outputDir, filename, screenshotRefPath, subjectImagePaths, adjustmentImageBase64, adjustmentImageMime, apiKey, _retries: 0, _model: GEMINI_IMAGE_MODEL_FALLBACK });
    }
    throw new Error('Gemini lieferte kein Bild zurück (auch nach Fallback-Versuch).');
  }

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, filename);
  const mimeType = imagePart.inlineData.mimeType || 'image/jpeg';
  fs.writeFileSync(filePath, Buffer.from(imagePart.inlineData.data, 'base64'));
  console.log(`[imagen] Gemini saved: ${filename} (${format}) ✓ model: ${_model}`);
  return { filePath, mimeType };
}

module.exports = { generateImage, IMAGEN_MODEL: GEMINI_IMAGE_MODEL };
