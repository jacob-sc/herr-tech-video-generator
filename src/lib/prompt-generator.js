require('./load-env');
const Anthropic = require('@anthropic-ai/sdk').default;
const fs = require('fs');
const { resizeForClaude, readImageForClaude } = require('./image-resize');

const getClient = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

function detectPreservations(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  const preserved = [];
  if (['ausdruck beibehalten','ausdruck nicht ändern','expression keep','keep the expression','preserve expression','expression unchanged','ausdruck erhalten'].some(p => lower.includes(p))) preserved.push('facial expression');
  if (['pose beibehalten','pose nicht ändern','haltung beibehalten','pose erhalten'].some(p => lower.includes(p))) preserved.push('body pose');
  if (['hintergrund beibehalten','hintergrund nicht ändern','background keep','same background'].some(p => lower.includes(p))) preserved.push('background');
  if (['beleuchtung beibehalten','licht beibehalten','same lighting','gleiche beleuchtung'].some(p => lower.includes(p))) preserved.push('lighting');
  if (['kleidung beibehalten','outfit beibehalten','same clothing','same outfit'].some(p => lower.includes(p))) preserved.push('clothing');
  return preserved;
}

/**
 * Detects what specific element a scene/style adjustment targets.
 * Returns a human-readable label or null if it's a general change.
 */
function detectAdjustmentElement(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  if (['hintergrund','background','szene','scene','environment','setting','location','outdoor','indoor','raum','room','street','wald','forest','city','stadt','himmel','sky'].some(k => lower.includes(k))) return 'background only';
  if (['beleuchtung','licht','lighting','helligkeit','brightness','dunkel','hell','schatten','shadow','kontrast','contrast'].some(k => lower.includes(k))) return 'lighting only';
  if (['farbe','color','colour','sättigung','saturation','ton','tint','filter'].some(k => lower.includes(k))) return 'color/tone only';
  if (['stil','style','kunststil','art style','zeichenstil'].some(k => lower.includes(k))) return 'art style only';
  if (['gesicht','face','kopf','head','augen','eyes','mund','mouth','haare','hair'].some(k => lower.includes(k))) return 'face/head only';
  if (['kleidung','outfit','shirt','pulli','hose','clothes','costume'].some(k => lower.includes(k))) return 'clothing only';
  return null;
}

/**
 * Detects whether the instruction is asking for a face-only swap.
 * Returns: 'face' | 'head' | 'character' | null
 */
function detectSwapScope(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  // Face-only: only swap the face, keep body/clothing/pose
  if (['nur gesicht','nur das gesicht','nur face','face only','only face','only the face',
       'gesicht tauschen','gesicht ersetzen','gesicht austauschen','nur kopf und gesicht'].some(p => lower.includes(p))) return 'face';
  // Head swap: replace the whole head
  if (['nur kopf','nur den kopf','kopf tauschen','kopf ersetzen','head only','only head',
       'only the head','replace head','swap head'].some(p => lower.includes(p))) return 'head';
  // If description mentions "gesicht" but not explicitly "only", still treat as face swap
  if (lower.includes('gesicht') && !lower.includes('körper') && !lower.includes('body') && !lower.includes('figur')) return 'face';
  return null;
}

function classifyAdjustment(text) {
  if (!text) return 'generic';
  const lower = text.toLowerCase();
  if (['hintergrund','background','szene','scene','environment','setting','location','outdoor','indoor','raum','room','street','wald','forest','city','stadt'].some(k => lower.includes(k))) return 'background';
  if (['charakter','character','person','figur','figure','gesicht','face','outfit','kleidung','clothes','haare','hair'].some(k => lower.includes(k))) return 'character';
  if (['stil','style','lighting','licht','farbe','color','colour','filter','mood','stimmung','effect'].some(k => lower.includes(k))) return 'style';
  return 'generic';
}

/**
 * Reference ID order — must match imagen.js exactly:
 * [1] = RAW screenshot
 * [2], [3]... = SUBJECT character images
 * next = adjustment image (SUBJECT)
 * last = STYLE image
 */
async function generateImagenPrompt(screenshotPath, setup, characters = [], sceneAnalysis = null, adjustmentRef = null, manualSceneInput = null) {
  const { format, styleDescription, styleDeviation } = setup;
  const formatLabel = format === '9:16' ? 'vertical 9:16 (Reels/TikTok/Shorts)' : 'horizontal 16:9 (YouTube)';
  const styleInfo = styleDescription?.trim() ? `Visual art style: ${styleDescription.trim()} (intensity ${styleDeviation}/5).` : '';

  const activeChars = (characters || []).filter(c => c.description || c.imagePath);
  const hasCharChanges = activeChars.length > 0;
  const hasAdjustment = !!(adjustmentRef?.description?.trim() || adjustmentRef?.base64);
  const hasScreenshot = screenshotPath && fs.existsSync(screenshotPath);
  const adjType = classifyAdjustment(adjustmentRef?.description || '');
  const isBgSwap = !hasCharChanges && hasAdjustment && adjType === 'background' && hasScreenshot && !manualSceneInput;

  if (hasScreenshot && !hasCharChanges && !hasAdjustment && !manualSceneInput) {
    return {
      prompt: `[1] is the source image. Reproduce [1] exactly 1:1 — same characters, background, lighting, camera angle, art style, mood. Change absolutely nothing.${styleInfo ? ` ${styleInfo}` : ''}\n\nFORMAT: ${formatLabel}`,
      editMode: null,
    };
  }

  if (isBgSwap) {
    return { prompt: await generateBgSwapPrompt(adjustmentRef.description.trim(), formatLabel, styleInfo), editMode: 'bgswap' };
  }

  // ── GEMINI modes: character swap or adjustment with reference image ──────────
  // Gemini receives images in natural order and understands natural-language instructions.
  const charsWithImages = activeChars.filter(c => c.imagePath && fs.existsSync(c.imagePath));
  if (charsWithImages.length > 0 && hasScreenshot && !manualSceneInput) {
    // Character swap with reference image — pass adjustmentRef so scene text + style are included
    return generateGeminiCharSwapPrompt(screenshotPath, charsWithImages, activeChars, formatLabel, styleInfo, adjustmentRef);
  }
  if (adjustmentRef?.base64 && hasScreenshot && !manualSceneInput) {
    // Style/scene adjustment with reference image (no character images)
    return generateGeminiAdjustmentPrompt(screenshotPath, adjustmentRef, formatLabel, styleInfo);
  }

  // ── Build Claude message ─────────────────────────────────────────────────────
  const msgContent = [];
  let imgCounter = 0;
  let sceneRefId = null;

  if (hasScreenshot) {
    imgCounter++;
    sceneRefId = imgCounter;
    const sceneImg = await readImageForClaude(screenshotPath);
    msgContent.push({ type: 'image', source: { type: 'base64', media_type: sceneImg.mimeType, data: sceneImg.base64 } });
    msgContent.push({ type: 'text', text: manualSceneInput
      ? `↑ [${sceneRefId}] STYLE REF only.`
      : `↑ [${sceneRefId}] = BASE SCENE. Imagen edits this image. Study it carefully: identify all characters (who is where, what they look like), the background, camera angle, lighting. You will list what must stay unchanged using [${sceneRefId}] as anchor.` });
  }

  const charBlocks = [];
  for (const c of activeChars) {
    if (c.imagePath && fs.existsSync(c.imagePath)) {
      imgCounter++;
      const cid = imgCounter;
      const charImg = await readImageForClaude(c.imagePath);
      msgContent.push({ type: 'image', source: { type: 'base64', media_type: charImg.mimeType, data: charImg.base64 } });
      msgContent.push({ type: 'text', text: `↑ [${cid}] = REPLACEMENT CHARACTER. Imagen receives this image as subject reference [${cid}]. Describe what you see here in detail: head shape, skin color+texture, crown/hair, facial expression (brows, eyes, mouth separately), body build, clothing, pose.${c.description ? ` Instruction: "${c.description}"` : ''}` });
      charBlocks.push({ id: cid, hasImage: true, description: c.description });
    } else if (c.description) {
      charBlocks.push({ id: null, hasImage: false, description: c.description });
    }
  }

  let adjBlock = null;
  if (adjustmentRef?.base64) {
    imgCounter++;
    const aid = imgCounter;
    const adjImg = await resizeForClaude(adjustmentRef.base64, adjustmentRef.mimeType || 'image/jpeg');
    msgContent.push({ type: 'image', source: { type: 'base64', media_type: adjImg.mimeType, data: adjImg.base64 } });
    msgContent.push({ type: 'text', text: `↑ [${aid}] = ADJUSTMENT REF. Imagen receives this as [${aid}].` });
    adjBlock = { id: aid, hasImage: true, description: adjustmentRef.description?.trim() || '' };
  } else if (adjustmentRef?.description?.trim()) {
    adjBlock = { id: null, hasImage: false, description: adjustmentRef.description.trim() };
  }

  if (manualSceneInput) {
    msgContent.push({ type: 'text', text: `Write a vivid Imagen prompt (40–80 words) for: "${manualSceneInput}"${charBlocks.length ? `\nCharacters: ${charBlocks.map(c => c.id ? `from [${c.id}]` : `"${c.description}"`).join(', ')}` : ''}${styleInfo ? `\n${styleInfo}` : ''}\nFORMAT: ${formatLabel}\nOutput ONLY the prompt.` });
    const r = await getClient().messages.create({ model: 'claude-sonnet-4-6', max_tokens: 300, system: 'Imagen 4 prompt writer.', messages: [{ role: 'user', content: msgContent }] });
    return { prompt: r.content[0].text.trim(), editMode: null };
  }

  const adjType2 = adjBlock ? classifyAdjustment(adjBlock.description) : null;
  const hasBgChange = adjType2 === 'background';
  const hasStyleChange = adjType2 === 'style';

  // ── Build change instructions ────────────────────────────────────────────────
  const changeInstructions = [];

  charBlocks.forEach((c) => {
    const preservations = detectPreservations(c.description || '');
    const preserveNote = preservations.length ? ` Explicitly also keep from [${sceneRefId}]: ${preservations.join(', ')}.` : '';
    if (c.hasImage && c.id) {
      changeInstructions.push(`CHARACTER SWAP from [${c.id}]:
Instruction: "${c.description || 'replace the main character'}"
- In the prompt: first identify the SWAP TARGET from [${sceneRefId}] in 4–6 words (e.g. "large green pear-faced figure upper-center background")
- Then describe the replacement character from [${c.id}] in 6–8 sentences:
  • Head shape and proportions (precise geometry)
  • Skin color (precise name, e.g. "deep crimson-red") and surface texture/pattern
  • Crown / hair / head accessory
  • Expression — BROWS: angle, position, emotion
  • Expression — EYES: shape, lid position, gaze, emotion
  • Expression — MOUTH: open/closed, teeth, corners, emotion
  • Body build, size, clothing (color + type)
  • Same position in frame as replaced target from [${sceneRefId}]
  Reference [${c.id}] twice naturally in this description.${preserveNote}`);
    } else {
      changeInstructions.push(`CHARACTER SWAP (text-only): "${c.description}"\nDescribe the new character in 6–8 sentences covering head, face, expression, body, outfit, position.${preserveNote}`);
    }
  });

  if (adjBlock) {
    const adjElement = detectAdjustmentElement(adjBlock.description);
    const keepEverythingElse = adjElement
      ? `IMPORTANT: Only the ${adjElement} changes. ALL other elements — characters, poses, expressions, clothing, composition, camera angle, art style${adjElement.includes('background') ? '' : ', background'} — stay pixel-perfect identical to [${sceneRefId}].`
      : `Keep everything else exactly as in [${sceneRefId}].`;

    if (hasBgChange) {
      changeInstructions.push(`BACKGROUND CHANGE ${adjBlock.id ? `from [${adjBlock.id}]` : `"${adjBlock.description}"`}:
Identify the current background in [${sceneRefId}] in 3–4 words.
Then describe the new background in 4–5 sentences: location type, floor/ground surface, architecture or environment elements, colors, atmosphere, lighting.${adjBlock.id ? ` Reference [${adjBlock.id}] twice.` : ''}
${keepEverythingElse}`);
    } else if (hasStyleChange) {
      changeInstructions.push(`STYLE/LIGHTING CHANGE ${adjBlock.id ? `from [${adjBlock.id}]` : `"${adjBlock.description}"`}:
Describe the new lighting/style in 3–4 sentences: light source, color/temperature, shadow quality, contrast, mood.${adjBlock.id ? ` Reference [${adjBlock.id}] twice.` : ''}
${keepEverythingElse}`);
    } else {
      changeInstructions.push(`MODIFICATION: "${adjBlock.description}"${adjBlock.id ? ` from [${adjBlock.id}]` : ''}.
Describe in 3–4 sentences what specifically changes and how it looks.${adjBlock.id ? ` Reference [${adjBlock.id}] twice.` : ''}
${keepEverythingElse}`);
    }
  }

  // Reference declaration lines
  const refDecls = [];
  if (sceneRefId) refDecls.push(`[${sceneRefId}] is the source scene — keep everything in [${sceneRefId}] exactly unchanged except what is listed below.`);
  charBlocks.filter(c => c.id).forEach(c => refDecls.push(`[${c.id}] is the replacement character subject reference — Imagen uses [${c.id}] directly.`));
  if (adjBlock?.id) refDecls.push(`[${adjBlock.id}] is the ${hasBgChange ? 'new background' : hasStyleChange ? 'new style/lighting' : 'adjustment'} reference.`);

  const userText = `TASK: Write an Imagen 3 editing prompt. Target: 200–260 words.

CRITICAL: This is a MINIMAL edit. Only the listed element(s) change. Everything else in [${sceneRefId}] stays pixel-perfect identical — same background, same lighting, same camera angle, same art style, same mood, same other characters, same clothing on unchanged characters.

OUTPUT STRUCTURE:

${refDecls.join('\n')}

DO NOT CHANGE anything in [${sceneRefId}] except what is explicitly listed below. Keep pixel-perfect: background, lighting, camera angle, art style, mood, composition, all characters not being replaced, clothing of all unchanged characters — everything exactly as in [${sceneRefId}].

ONLY THIS CHANGES:
[For each change: write "SWAP TARGET: [4–6 word identifier from [${sceneRefId}]]" then describe the replacement in 6–8 sentences covering key visual features. If a character image is provided as reference, describe what you actually see there precisely. Reference the image ID 2–3 times.]

FORMAT: ${formatLabel}

---
CHANGES TO MAKE:
${changeInstructions.join('\n\n')}
${styleInfo ? `\nStyle: ${styleInfo}` : ''}

RULES:
- "DO NOT CHANGE" line must be explicit and strong — say it clearly
- SWAP TARGET: identify precisely with 4–6 words what element in [${sceneRefId}] is replaced
- Replacement description: 6–8 sentences — head/face shape, skin color+texture, crown/hair, brows, eyes, mouth, body, outfit, same position as replaced element
- Colors: precise names (deep crimson-red, forest-green, bubblegum-pink)
- Reference each image ID 2–3 times
- Never describe unchanged elements in detail — just say "exactly as in [${sceneRefId}]"
- No bullet points, flowing prose
- End with FORMAT line only

Output ONLY the final prompt.`;

  msgContent.push({ type: 'text', text: userText });

  const systemPrompt = `You write Imagen 3 editing prompts (200–260 words).

IMPORTANT: Imagen uses [1] as the RAW scene to edit (it keeps [1] as the base). [2] is a SUBJECT reference — Imagen extracts the visual identity from [2] and applies it to the specified target in [1]. The prompt must make clear: what stays (anchored to [1]), and what the replacement looks like (described from [2]).

CRITICAL RULE: If the user instruction mentions a SPECIFIC element (only the face, only the head, only the hair, only the shirt, etc.), the prompt must say EXPLICITLY that ONLY that specific element changes. Everything else — body, clothing, pose, background, other characters — stays pixel-perfect identical to [1]. Never change more than what is described.

Structure:
1. Reference declarations (one line per image)
2. "Keep everything from [1] exactly as-is except what is listed below."
3. "SWAP TARGET: [4–6 word identifier of what changes in [1]]"
4. Full visual description of what the replacement looks like — drawn from [2] — covering head, face, expression, body, outfit (6–8 sentences, precise colors/textures)
5. FORMAT line

Key rule: Unchanged elements = just say "exactly as in [1]". Changed elements = describe fully and precisely from what you see in [2].`;

  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await getClient().messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 900,
        system: systemPrompt,
        messages: [{ role: 'user', content: msgContent }],
      });
      const result = response.content[0].text.trim();
      console.log(`[prompt-gen] Generated (${result.split(/\s+/).length} words): ${result.slice(0, 120)}...`);
      return { prompt: result, editMode: null };
    } catch (err) {
      lastErr = err;
      if ((err.status === 529 || err.message?.includes('overloaded')) && attempt < 3) {
        await new Promise(r => setTimeout(r, attempt * 8000));
      } else { throw err; }
    }
  }
  throw lastErr;
}

async function generateBgSwapPrompt(bgDescription, formatLabel, styleInfo) {
  const response = await getClient().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 120,
    system: `Imagen 3 BGSWAP prompt writer. 15–30 words, background only. No characters.`,
    messages: [{ role: 'user', content: `Background: "${bgDescription}"${styleInfo ? ` Style: ${styleInfo}` : ''}. Format: ${formatLabel}. Output ONLY the background description.` }],
  });
  return response.content[0].text.trim();
}

/**
 * Generates a Gemini-compatible character swap prompt.
 * Gemini receives images in this order: [scene, character1, character2, ...]
 * So in the prompt we refer to "the first image" (scene) and "the second image" (character).
 * Claude analyzes both images and writes the natural-language editing instruction.
 */
async function generateGeminiCharSwapPrompt(screenshotPath, charsWithImages, allChars, formatLabel, styleInfo, adjustmentRef = null) {
  const msgContent = [];

  // Show source scene to Claude
  const sceneImg = await readImageForClaude(screenshotPath);
  msgContent.push({ type: 'image', source: { type: 'base64', media_type: sceneImg.mimeType, data: sceneImg.base64 } });
  msgContent.push({ type: 'text', text: `↑ SOURCE SCENE (will be "the first image" in the Gemini call). Study carefully: who is in this scene, where, what they look like, background, lighting, camera angle, art style.` });

  // Detect swap scope from all char descriptions
  const allDescriptions = allChars.map(c => c.description || '').join(' ');
  const swapScope = detectSwapScope(allDescriptions);

  // Show character reference image(s) to Claude
  for (let i = 0; i < charsWithImages.length; i++) {
    const c = charsWithImages[i];
    const imgNum = i + 2; // scene=1, char1=2, char2=3, ...
    const ordinal = ['second', 'third', 'fourth'][i] ?? `${imgNum}th`;
    const charImg = await readImageForClaude(c.imagePath);
    msgContent.push({ type: 'image', source: { type: 'base64', media_type: charImg.mimeType, data: charImg.base64 } });
    msgContent.push({ type: 'text', text: `↑ REPLACEMENT ${swapScope === 'face' ? 'FACE/HEAD' : swapScope === 'head' ? 'HEAD' : 'CHARACTER'} REFERENCE (will be "the ${ordinal} image" in the Gemini call). Describe exactly what you see: ${swapScope === 'face' ? 'head shape, skin color+texture, facial features, expression, crown/hair.' : 'shape, colors, features, expression, clothing, body.'}${c.description ? ` User instruction: "${c.description}"` : ''}` });
  }

  // Optional adjustment reference image (scene modification / global style)
  let adjImgOrdinal = null;
  if (adjustmentRef?.base64) {
    const adjImgNum = charsWithImages.length + 2; // after scene + chars
    adjImgOrdinal = ['second', 'third', 'fourth', 'fifth'][adjImgNum - 2] ?? `${adjImgNum}th`;
    const adjImg = await resizeForClaude(adjustmentRef.base64, adjustmentRef.mimeType || 'image/jpeg');
    msgContent.push({ type: 'image', source: { type: 'base64', media_type: adjImg.mimeType, data: adjImg.base64 } });
    msgContent.push({ type: 'text', text: `↑ SCENE/STYLE ADJUSTMENT REFERENCE (will be "the ${adjImgOrdinal} image" in the Gemini call). Shows the target look for the scene/style change.${adjustmentRef.description ? ` Instruction: "${adjustmentRef.description}"` : ''}` });
  }

  // Text-only characters (no image)
  const textOnlyChars = allChars.filter(c => !c.imagePath || !fs.existsSync(c.imagePath));

  // Build adjustment text line for the task
  const adjTextLine = adjustmentRef?.description?.trim()
    ? `ALSO APPLY this scene/style modification: "${adjustmentRef.description.trim()}"${adjImgOrdinal ? ` (use the ${adjImgOrdinal} image as visual reference)` : ''}.`
    : '';

  // Build scope-specific instructions
  let scopeInstruction = '';
  let keepInstruction = '';
  if (swapScope === 'face') {
    scopeInstruction = `3. Says: "Replace ONLY THE FACE AND HEAD of the target character with the face/head from the second image." Describe the replacement face from image 2 in 3–4 sentences (head shape, skin color/texture, facial features, expression, crown/hair on top). Do NOT mention replacing the body, clothing, or pose.
4. Says explicitly: "Keep the body, clothing, pose, and hands of the target character EXACTLY as they are in the first image. Keep ALL other characters, the background, lighting, camera angle, and art style EXACTLY as in the first image. Change ONLY the face and head."`;
    keepInstruction = 'body, clothing, pose of target character AND everything else in the scene';
  } else if (swapScope === 'head') {
    scopeInstruction = `3. Says: "Replace ONLY THE HEAD of the target character with the head from the second image." Describe the replacement head in 3–4 sentences.
4. Says: "Keep the body, clothing, and pose of the target character EXACTLY as they are. Keep ALL other characters, background, lighting, camera angle, and art style EXACTLY as in the first image. Change ONLY the head."`;
    keepInstruction = 'body, clothing, pose AND everything else';
  } else {
    scopeInstruction = `3. Says: "Replace it with the character from the second image." Then describe the replacement character from image 2 in 4–5 sentences (shape, color, texture, expression, clothing, size).
4. Says explicitly: "Keep EVERYTHING ELSE in the first image EXACTLY as it is — same background, same other characters, same lighting, same camera angle, same art style, same composition. Change ONLY the specified character."`;
    keepInstruction = 'everything else';
  }

  const userText = `TASK: Write a Gemini image editing instruction (80–150 words).

Gemini receives the images in this order:
- Image 1 = source scene (shown above as first image)
- Image 2 = replacement ${swapScope === 'face' ? 'face/head' : swapScope === 'head' ? 'head' : 'character'} reference${adjImgOrdinal ? `\n- The ${adjImgOrdinal} image = scene/style adjustment reference` : ''}

Write an instruction that:
1. Says: "Edit the first image."
2. Identifies EXACTLY which element to replace: describe it precisely in 4–6 words (position in frame, color, shape). Use "the [description] in the first image".
${scopeInstruction}
${textOnlyChars.length ? `Also apply: ${textOnlyChars.map(c => `"${c.description}"`).join(', ')}` : ''}
${adjTextLine}
${styleInfo ? `Style note: ${styleInfo}` : ''}

CRITICAL: Be explicit that ONLY the ${swapScope === 'face' ? 'face/head' : swapScope === 'head' ? 'head' : 'specified character'} changes${adjTextLine ? ' and the listed scene/style modification is applied' : ''} — ${keepInstruction} stays pixel-perfect identical.

End the instruction with exactly this line: FORMAT: ${formatLabel}

Output ONLY the instruction. No explanations.`;

  msgContent.push({ type: 'text', text: userText });

  const system = `You write Gemini image editing instructions. The instruction is given DIRECTLY to Gemini as a text prompt alongside the reference images. Be precise and concise. Natural language only — no [1], [2] bracket notation.

CRITICAL RULE: If the user instruction mentions a SPECIFIC element (face, head, hair, shirt, background, eyes, etc.), the instruction must say EXPLICITLY that ONLY that element changes and EVERYTHING ELSE stays exactly the same. Never change more than what is described.`;

  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await getClient().messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        system,
        messages: [{ role: 'user', content: msgContent }],
      });
      const result = response.content[0].text.trim();
      console.log(`[prompt-gen] Gemini charswap prompt (${result.split(/\s+/).length} words): ${result.slice(0, 120)}...`);
      return { prompt: result, editMode: null };
    } catch (err) {
      lastErr = err;
      if ((err.status === 529 || err.message?.includes('overloaded')) && attempt < 3) {
        await new Promise(r => setTimeout(r, attempt * 8000));
      } else { throw err; }
    }
  }
  throw lastErr;
}

/**
 * Generates a Gemini prompt for style/scene adjustments with a reference image.
 * No character swap — just applying a visual change described by text + reference image.
 * Gemini receives: [source scene, adjustment reference image]
 */
async function generateGeminiAdjustmentPrompt(screenshotPath, adjustmentRef, formatLabel, styleInfo) {
  const msgContent = [];

  // Show source scene
  const sceneImg = await readImageForClaude(screenshotPath);
  msgContent.push({ type: 'image', source: { type: 'base64', media_type: sceneImg.mimeType, data: sceneImg.base64 } });
  msgContent.push({ type: 'text', text: `↑ SOURCE SCENE (will be "the first image" in the Gemini call). Study all elements carefully.` });

  // Show adjustment reference image
  const adjImg = await resizeForClaude(adjustmentRef.base64, adjustmentRef.mimeType || 'image/jpeg');
  msgContent.push({ type: 'image', source: { type: 'base64', media_type: adjImg.mimeType, data: adjImg.base64 } });
  msgContent.push({ type: 'text', text: `↑ ADJUSTMENT REFERENCE (will be "the second image"). This shows what should change.${adjustmentRef.description ? ` User instruction: "${adjustmentRef.description}"` : ''}` });

  const adjElement = detectAdjustmentElement(adjustmentRef.description || '');
  const scopeNote = adjElement
    ? `CRITICAL: Only the ${adjElement} changes. ALL other elements — characters, poses, expressions, clothing, composition, camera angle, art style${adjElement.includes('background') ? '' : ', background'} — stay EXACTLY as in the first image.`
    : `CRITICAL: Make ONLY the described change. Everything else stays EXACTLY as in the first image — characters, poses, expressions, clothing, background, camera angle, art style, composition.`;

  msgContent.push({ type: 'text', text: `TASK: Write a Gemini image editing instruction (60–100 words).

Gemini receives: Image 1 = source scene, Image 2 = adjustment reference.

Write an instruction that:
1. Says "Edit the first image."
2. Describes specifically what to change, referencing the second image as the visual guide.
3. Says explicitly: "${scopeNote}"
${styleInfo ? `Style: ${styleInfo}` : ''}

End the instruction with exactly this line: FORMAT: ${formatLabel}

Output ONLY the instruction.` });

  const system = `You write Gemini image editing instructions. Be precise and concise. Natural language only.

CRITICAL RULE: If a specific element is mentioned (background, lighting, style, etc.), the instruction must say ONLY that element changes. Everything else stays pixel-perfect identical.`;

  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await getClient().messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        system,
        messages: [{ role: 'user', content: msgContent }],
      });
      const result = response.content[0].text.trim();
      console.log(`[prompt-gen] Gemini adjustment prompt (${result.split(/\s+/).length} words): ${result.slice(0, 120)}...`);
      return { prompt: result, editMode: null };
    } catch (err) {
      lastErr = err;
      if ((err.status === 529 || err.message?.includes('overloaded')) && attempt < 3) {
        await new Promise(r => setTimeout(r, attempt * 8000));
      } else { throw err; }
    }
  }
  throw lastErr;
}

module.exports = { generateImagenPrompt, classifyAdjustment, detectPreservations };
