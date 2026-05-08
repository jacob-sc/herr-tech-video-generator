/**
 * Erkennt Szenen aus Whisper-Segmenten anhand von Pausen, Länge und Satzgrenzen.
 * Max 11 Sek pro Szene (Veo3-Limit). Zieldauern: 4, 6 oder 9 Sekunden.
 */

const PAUSE_THRESHOLD = 1.0;    // Sekunden Pause → neue Szene
const MAX_SCENE_DURATION = 11;  // Hartes Limit: keine Szene darf länger sein
const MIN_SCENE_DURATION = 2;   // Kürzer → mit nächster zusammenführen
const PREFERRED_DURATIONS = [4, 6, 9]; // Zieldauern in Sekunden
const PREFERRED_TOLERANCE = 1.0;       // ±1s Toleranz um jeden Zielwert

// ── Hilfsfunktionen ──────────────────────────────────────────────────────────

function endsWithSentence(text) {
  return /[.!?]["'»]?\s*$/.test(text.trim());
}

function endsWithPause(text) {
  return /[,;:]\s*$/.test(text.trim());
}

function isNearPreferredDuration(duration) {
  return PREFERRED_DURATIONS.some(t => Math.abs(duration - t) <= PREFERRED_TOLERANCE);
}

/**
 * Wandelt rohe Szenen-Objekte in das finale Szenen-Format um.
 */
function toSceneObjects(rawScenes) {
  return rawScenes.map((scene, i) => ({
    id: i,
    start: Math.round(scene.start * 100) / 100,
    end: Math.round(scene.end * 100) / 100,
    text: scene.segments.map((s) => s.text).join(' ').trim(),
    screenshotFiles: [`scene_${i}_a.jpg`, `scene_${i}_b.jpg`, `scene_${i}_c.jpg`],
    selectedScreenshot: `scene_${i}_b.jpg`,
    characterDescription: null,
    characterImageFile: null,
    imagePrompt: null,
    imageFile: null,
    imageApproved: false,
    videoPrompt: null,
    videoFile: null,
    videoUrl: null,
    videoApproved: false,
  }));
}

/**
 * Erzwingt MAX_SCENE_DURATION: Szenen die länger sind werden an Segment-Grenzen
 * aufgeteilt — bevorzugt nach Satzenden (. ! ?), sonst hard-cut.
 */
function enforceMaxDuration(rawScenes) {
  const result = [];
  for (const scene of rawScenes) {
    if (scene.end - scene.start <= MAX_SCENE_DURATION) {
      result.push(scene);
      continue;
    }
    // Aufteilen
    let cur = { start: scene.segments[0].start, end: scene.segments[0].end, segments: [scene.segments[0]] };
    for (let i = 1; i < scene.segments.length; i++) {
      const seg = scene.segments[i];
      if (seg.end - cur.start > MAX_SCENE_DURATION) {
        // Rückwärts nach Satzende suchen
        let splitAt = null;
        for (let j = cur.segments.length - 1; j >= 0; j--) {
          if (endsWithSentence(cur.segments[j].text) &&
              cur.segments[j].end - cur.start >= MIN_SCENE_DURATION) {
            splitAt = j;
            break;
          }
        }
        if (splitAt !== null) {
          const first = cur.segments.slice(0, splitAt + 1);
          const rest = cur.segments.slice(splitAt + 1);
          result.push({ start: first[0].start, end: first[first.length - 1].end, segments: first });
          cur = {
            start: rest.length > 0 ? rest[0].start : seg.start,
            end: seg.end,
            segments: rest.length > 0 ? [...rest, seg] : [seg],
          };
        } else {
          result.push(cur);
          cur = { start: seg.start, end: seg.end, segments: [seg] };
        }
      } else {
        cur.end = seg.end;
        cur.segments.push(seg);
      }
    }
    result.push(cur);
  }
  return result;
}

/**
 * Erkennt Szenen aus Whisper-Segmenten.
 * 3-Layer Split-Logik:
 *   1. mustSplit   — Szene würde >11s werden
 *   2. preferredSplit — Szene liegt bei Zieldauer (4/6/9s) UND vorheriges Segment endet mit Satz
 *   3. naturalGap  — Pause >1s UND Satzende oder Komma
 */
function detectScenes(segments) {
  if (!segments || segments.length === 0) return [];

  const rawScenes = [];
  let current = { start: segments[0].start, end: segments[0].end, segments: [segments[0]] };

  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    const prev = segments[i - 1];
    const gap = seg.start - prev.end;
    const currentDuration = current.end - current.start;
    const durationIfAdded = seg.end - current.start;

    const mustSplit = durationIfAdded > MAX_SCENE_DURATION;
    const preferredSplit = isNearPreferredDuration(currentDuration) && endsWithSentence(prev.text);
    const naturalGap = gap > PAUSE_THRESHOLD && (endsWithSentence(prev.text) || endsWithPause(prev.text));

    if (mustSplit || preferredSplit || naturalGap) {
      rawScenes.push(current);
      current = { start: seg.start, end: seg.end, segments: [seg] };
    } else {
      current.end = seg.end;
      current.segments.push(seg);
    }
  }
  rawScenes.push(current);

  // Zu kurze Szenen mit der nächsten zusammenführen
  const merged = [];
  for (const scene of rawScenes) {
    const duration = scene.end - scene.start;
    if (merged.length > 0 && duration < MIN_SCENE_DURATION) {
      const last = merged[merged.length - 1];
      last.end = scene.end;
      last.segments.push(...scene.segments);
    } else {
      merged.push({ ...scene });
    }
  }

  return toSceneObjects(enforceMaxDuration(merged));
}

/**
 * Erkennt Szenen mit Claude (Haiku) für thematische Trennung + Satzgrenzen.
 * Akzeptiert optionale visuelle Breakpoints aus FFmpeg scdet.
 * Fallback auf detectScenes() bei Fehler.
 */
async function detectScenesWithClaude(segments, visualBreakpoints = []) {
  const baseScenes = detectScenes(segments);
  if (!segments || segments.length === 0) return baseScenes;

  try {
    const Anthropic = require('@anthropic-ai/sdk').default;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // Segmente als nummerierte Liste (Index-basiert — keine Float-Probleme)
    const numberedSegments = segments
      .map((s, i) => `[${i}] ${s.start.toFixed(2)}s: "${s.text.trim()}"`)
      .join('\n');

    const visualBreakpointsText = visualBreakpoints.length > 0
      ? `\nVisual scene cuts detected at: ${visualBreakpoints.map(t => t.toFixed(2) + 's').join(', ')}\nThese are HARD visual cuts in the video — always start a new scene at or very near these timestamps.`
      : '';

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `You are analyzing transcript segments from a video. Your task is to find the best scene boundaries.

Here are all transcript segments with their indices:
${numberedSegments}
${visualBreakpointsText}

Rules:
- NEVER split mid-sentence. Only cut after . ! or ?
- Prefer cuts at pauses (, ; :) when no sentence boundary is nearby
- Aim for scenes of ~4, ~6, or ~9 seconds
- STRICT maximum: no scene > 11 seconds
- Visual cuts listed above are HARD boundaries — always create a new scene at or very near them
- Topic changes, character switches, new on-screen visuals = new scene

Return a JSON array of segment INDICES where new scenes should START.
Always include index 0.
Example: [0, 5, 11, 18]
Output ONLY the JSON array, no explanation.`,
        },
      ],
    });

    const raw = response.content[0].text.trim();
    // Extrahiere JSON-Array aus Antwort
    const match = raw.match(/\[[\d,\s]+\]/);
    if (!match) return baseScenes;

    const indices = JSON.parse(match[0]);
    if (!Array.isArray(indices) || indices.length === 0) return baseScenes;

    // Validiere: nur gültige Integer-Indizes
    const validIndices = indices.filter(i => Number.isInteger(i) && i >= 0 && i < segments.length);
    if (validIndices.length === 0) return baseScenes;

    // Index 0 muss immer dabei sein
    if (!validIndices.includes(0)) validIndices.unshift(0);

    // Deduplizieren und sortieren
    const sorted = [...new Set(validIndices)].sort((a, b) => a - b);

    // Segmente per slice zuweisen — KEIN Float-Problem
    const rawScenes = sorted.map((startIdx, i) => {
      const endIdx = i + 1 < sorted.length ? sorted[i + 1] : segments.length;
      const segs = segments.slice(startIdx, endIdx);
      if (!segs.length) return null;
      return { start: segs[0].start, end: segs[segs.length - 1].end, segments: segs };
    }).filter(Boolean);

    if (rawScenes.length === 0) return baseScenes;

    return toSceneObjects(enforceMaxDuration(rawScenes));
  } catch (err) {
    console.error('[detectScenesWithClaude] Fehler, Fallback auf detectScenes:', err.message);
    return baseScenes;
  }
}

module.exports = { detectScenes, detectScenesWithClaude };
