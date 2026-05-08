import path from 'path';
import { loadProject, getProjectDir } from '../../../../../../lib/project';
import { requireAuth, isAdmin } from '../../../../../../lib/api-auth';

require('../../../../../../lib/load-env');
const Anthropic = require('@anthropic-ai/sdk').default;
const fs = require('fs');
const { readImageForClaude } = require('../../../../../../lib/image-resize');

function detectMediaType(filePath) {
  try {
    const buf = Buffer.alloc(4);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buf, 0, 4, 0);
    fs.closeSync(fd);
    if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
    if (buf[0] === 0xFF && buf[1] === 0xD8) return 'image/jpeg';
    if (buf[0] === 0x47 && buf[1] === 0x49) return 'image/gif';
    if (buf[0] === 0x52 && buf[1] === 0x49) return 'image/webp';
    return 'image/jpeg';
  } catch { return 'image/jpeg'; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Nur POST' });

  const { session, ownerId } = await requireAuth(req, res);
  if (!session) return;

  const { id, sceneId } = req.query;
  const sceneIdx = parseInt(sceneId, 10);
  const { additionalHints = '', scriptOverride = '', scriptType = 'spoken' } = req.body ?? {};

  const project = loadProject(id);
  if (!project) return res.status(404).json({ error: 'Projekt nicht gefunden' });

  if (project.ownerId && project.ownerId !== ownerId && !isAdmin(session)) {
    return res.status(403).json({ error: 'Kein Zugriff' });
  }

  const scene = project.scenes?.[sceneIdx];
  if (!scene) return res.status(404).json({ error: 'Szene nicht gefunden' });

  const projectDir = getProjectDir(id);
  const format = project.setup?.format ?? '9:16';
  const formatLabel = format === '9:16' ? 'vertical 9:16 (Reels/TikTok/Shorts)' : 'horizontal 16:9 (YouTube)';

  const scriptText = scriptOverride?.trim()
    || scene.manualText?.trim()
    || scene.transcriptText?.trim()
    || scene.text?.trim()
    || '';

  const isSpoken = scriptType !== 'voiceover';

  const analysis = scene.analysis ?? {};
  const duration = scene.end != null && scene.start != null
    ? (scene.end - scene.start).toFixed(1)
    : '5';

  // Position/direction words that are NOT character names
  const POSITION_WORDS = new Set(['vorne','vorn','hinten','links','rechts','oben','unten','mitte',
    'hintergrund','vordergrund','ecke','seite','mitte','neben','zwischen','hinter','vor',
    'im','in','der','die','das','ein','eine','am','an','auf','dem','den']);

  // Detect speaker from additional hints
  // e.g. "die Erdbeere spricht", "drachenfrucht vorne links spricht", "der linke Charakter sagt"
  function detectSpeaker(hints) {
    if (!hints) return null;
    // Split into sentences for per-sentence analysis
    const sentences = hints.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
    const speakVerbs = ['sagt','spricht','redet','says','speaks','sprechend','spricht','ruft','schreit','flüstert'];

    for (const sentence of sentences) {
      // Pattern with article: "die/der/das X [position words] sagt/spricht"
      const withArticle = sentence.match(/(?:die|der|das)\s+(.+?)\s+(?:sagt|spricht|redet|says|speaks|ruft|schreit|flüstert)/i);
      if (withArticle?.[1]) {
        // Remove trailing position words
        const parts = withArticle[1].split(/\s+/).filter(w => !POSITION_WORDS.has(w.toLowerCase()));
        if (parts.length > 0) return parts.join(' ').trim();
      }

      // No article: find verb, then scan backwards skipping position words
      const words = sentence.split(/\s+/);
      const verbIdx = words.findIndex(w => speakVerbs.includes(w.toLowerCase().replace(/[.,!?]/g,'')));
      if (verbIdx > 0) {
        // Collect words before verb, skipping position/direction words from the end
        const nameWords = [];
        for (let i = verbIdx - 1; i >= 0; i--) {
          const clean = words[i].toLowerCase().replace(/[.,!?]/g,'');
          if (POSITION_WORDS.has(clean)) continue; // skip position words
          nameWords.unshift(words[i].replace(/[.,!?]/g,''));
          if (nameWords.length >= 2) break; // max 2 name words
        }
        if (nameWords.length > 0) return nameWords.join(' ');
      }
    }
    return null;
  }

  // Extract additional character actions from hints (non-speaking actions)
  // e.g. "die banane zwinkert uns zu", "der apfel nickt"
  function extractCharacterActions(hints, speakerName) {
    if (!hints) return [];
    const actionVerbs = ['zwinkert','winkt','nickt','schüttelt','lächelt','lacht','schaut','blickt',
      'zeigt','hebt','senkt','dreht','springt','tanzt','läuft','steht','sitzt','liegt',
      'winks','nods','smiles','laughs','looks','points','turns','jumps','dances',
      'gestures','waves','claps','shakes','bows'];
    const sentences = hints.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
    const speakVerbs = ['sagt','spricht','redet','says','speaks','sprechend','ruft','schreit','flüstert'];
    const actions = [];
    for (const sentence of sentences) {
      const hasSpeak = speakVerbs.some(v => sentence.toLowerCase().includes(v));
      const hasAction = actionVerbs.some(v => sentence.toLowerCase().includes(v));
      if (hasAction && !hasSpeak) {
        actions.push(sentence.trim());
      }
    }
    return actions;
  }

  const detectedSpeaker = isSpoken ? detectSpeaker(additionalHints) : null;
  const characterActions = extractCharacterActions(additionalHints, detectedSpeaker);

  // Build context for Claude
  const contextParts = [];
  if (!scriptText) {
    // No script at all — nobody speaks, complete silence
    contextParts.push(`DIALOGUE/NARRATION: NONE — No character speaks. No dialogue. No lip movement for any character. Complete visual silence.`);
  } else if (scriptType === 'voiceover') {
    contextParts.push(`SCRIPT TEXT: "${scriptText}"\nSCRIPT TYPE: VOICEOVER — This is OFF-SCREEN narration only. NO visible character speaks. NO lip movement whatsoever. NO mouth opens. The voice comes from an invisible narrator outside the frame. All characters in the scene remain completely still and silent.`);
  } else {
    const speakerNote = detectedSpeaker ? ` — spoken by: ${detectedSpeaker}` : '';
    contextParts.push(`SCRIPT TEXT: "${scriptText}"\nSCRIPT TYPE: SPOKEN${speakerNote} (a visible character speaks out loud — include lip movement and facial expression matching the words)`);
  }
  if (analysis.action) contextParts.push(`ACTION IN SCENE: ${analysis.action}`);
  if (analysis.mood) contextParts.push(`MOOD/TONE: ${analysis.mood}`);
  if (analysis.setting) contextParts.push(`SETTING: ${analysis.setting}`);
  if (analysis.visualStyle) contextParts.push(`VISUAL STYLE: ${analysis.visualStyle}`);
  contextParts.push(`VIDEO DURATION: ${duration} seconds`);
  contextParts.push(`FORMAT: ${formatLabel}`);
  if (characterActions.length > 0) {
    contextParts.push(`MANDATORY CHARACTER ACTIONS (must appear verbatim in prompt):\n${characterActions.map((a,i) => `${i+1}. ${a}`).join('\n')}`);
  }
  if (additionalHints?.trim()) contextParts.push(`ADDITIONAL INSTRUCTIONS FROM USER: "${additionalHints.trim()}"`);

  // Build message with image if available
  const msgContent = [];

  // Prefer the generated image, fallback to original screenshot
  const imageFile = scene.imageFile
    ? path.join(projectDir, 'generated-images', scene.imageFile)
    : null;
  const screenshotFile = scene.screenshotPath
    ? path.join(projectDir, scene.screenshotPath.replace(/^.*screenshots\//, 'screenshots/'))
    : null;

  const imgPath = (imageFile && fs.existsSync(imageFile)) ? imageFile
    : (screenshotFile && fs.existsSync(screenshotFile)) ? screenshotFile
    : null;

  if (imgPath) {
    const imgData = await readImageForClaude(imgPath);
    msgContent.push({ type: 'image', source: { type: 'base64', media_type: imgData.mimeType, data: imgData.base64 } });
    msgContent.push({ type: 'text', text: '↑ This is the scene image to be animated.' });
  }

  const speakerLabel = detectedSpeaker || 'the character';

  const dialogueInstruction = !scriptText
    ? `SILENCE RULE: No character speaks or opens their mouth. No dialogue. No lip movement anywhere in the scene.
`
    : scriptType === 'voiceover'
    ? `VOICEOVER RULE — CRITICAL:
- An off-screen narrator speaks: "${scriptText}"
- ZERO lip movement for any character in the scene — no mouth opens, no character speaks
- All characters remain visually silent and still (only environmental/body motion)
- The voice is heard but originates from OUTSIDE the frame
`
    : `CRITICAL — SPOKEN DIALOGUE:
${detectedSpeaker ? `SPEAKER: "${detectedSpeaker}" — identify this character precisely from the scene image (color, position, appearance).` : 'SPEAKER: the main character in the scene.'}
EXACT WORDS (verbatim — no additions, no omissions): "${scriptText}"

The prompt MUST:
1. Start with: "${speakerLabel === 'the character' ? 'The character' : `The ${detectedSpeaker}`} says/shouts/exclaims [match tone]: "${scriptText}"
2. The character speaks EXACTLY these words — not more, not less, not paraphrased
3. Describe lip movement synchronized to this exact speech
4. Describe facial expression matching the emotional content of the words
5. ONLY ${speakerLabel} speaks — all other characters keep their mouths closed and stay still
`;

  const actionsBlock = characterActions.length > 0
    ? `MANDATORY — include these character actions word-for-word in the prompt:\n${characterActions.map((a,i) => `${i+1}. ${a}`).join('\n')}\n`
    : '';

  // Additional hints block — high priority, explicitly mandatory
  const hintsBlock = additionalHints?.trim()
    ? `⚠️ MANDATORY USER INSTRUCTIONS — these MUST be fully reflected in the prompt, not just hinted at:
"${additionalHints.trim()}"
Every detail mentioned here (emotions, actions, behaviors, mood, appearance changes) must appear clearly and explicitly in the generated prompt. Do not ignore or downplay any part of these instructions.
`
    : '';

  msgContent.push({
    type: 'text',
    text: `${contextParts.join('\n')}

Write a video generation prompt for this scene (70–110 words, English).

${hintsBlock}
${dialogueInstruction}
${actionsBlock}Also describe:
- CAMERA: one fitting movement (push-in, pan, tilt, cinematic glide, static + breathing)
- BODY/GESTURE: gestures and body language matching the energy — must reflect the emotional state from user instructions above
- SCENE DYNAMICS: environmental motion (wind, crowd energy, lights, etc.)

Energy: angry/protest → dynamic, intense | calm → slow, subtle | emotional/crying → trembling, overwhelmed, tears

MANDATORY ENDING: The last sentence of the prompt must be exactly: "No subtitles, no captions, no text overlays, no speech bubbles, no comic bubbles, no on-screen text or graphics of any kind."

Output ONLY the prompt — no intro, no explanation.`,
  });

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 250,
      system: `You write video generation prompts for Kling AI and Veo 3 image-to-video.

RULES:
1. SPOKEN DIALOGUE (scriptType=spoken): ALWAYS start with "[Speaker] says/shouts/exclaims: '[exact words verbatim]'". The spoken text must be quoted EXACTLY as given — word for word, nothing added, nothing removed, not paraphrased. Name the speaker precisely by their visible appearance (e.g. "the red strawberry character on the left", "the dragon fruit character front left"). Only that character moves their lips — all others stay completely still and silent.
2. VOICEOVER (scriptType=voiceover): NEVER have any character speak or open their mouth. Write "An off-screen narrator says: '[text]'" — then describe scene motion. No lip movement anywhere. Absolutely no character speaks visually.
3. NO DIALOGUE (no scriptText): NEVER mention any speaking or lip movement. All characters are completely silent and still in terms of speech.
4. MANDATORY USER INSTRUCTIONS: If the user provides additional hints/instructions (marked with ⚠️ MANDATORY), these are the HIGHEST PRIORITY. Every emotion, action, behavior, or detail mentioned must appear explicitly and prominently in the prompt. Examples: "weint" → describe tears streaming, trembling lips, glistening eyes; "emotional" → describe overwhelmed expression, voice cracking; "wütend" → describe clenched fists, intense glare, aggressive posture.
5. MANDATORY CHARACTER ACTIONS: If the user specifies actions for other characters (e.g. "the banana winks", "the apple nods"), these MUST be explicitly described in the prompt. Do not omit them.
6. NO TEXT/GRAPHICS OVERLAYS: Every prompt MUST end with: "No subtitles, no captions, no text overlays, no speech bubbles, no comic bubbles, no thought bubbles, no on-screen text or graphics of any kind."
7. Camera movement, gestures, body language, and scene dynamics are always described.
8. Keep prompts 70–110 words. Cinematic, specific, natural language.`,
      messages: [{ role: 'user', content: msgContent }],
    });

    const prompt = response.content[0].text.trim();
    console.log(`[generate-video-prompt] Scene ${sceneIdx}: ${prompt.slice(0, 80)}...`);
    return res.status(200).json({ ok: true, prompt });
  } catch (err) {
    console.error('[generate-video-prompt] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
