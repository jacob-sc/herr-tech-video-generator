require('./load-env');
const fs = require('fs');
const path = require('path');

const FAL_MODEL_KLING     = 'fal-ai/kling-video/v3/standard/image-to-video';
const FAL_MODEL_VEO3      = 'fal-ai/veo3.1/lite/image-to-video';
const FAL_MODEL_VEO3_LITE = FAL_MODEL_VEO3; // kept for backward compat

// Legacy export (default = Kling)
const FAL_MODEL = FAL_MODEL_KLING;

function getFalClient() {
  const { fal } = require('@fal-ai/client');
  fal.config({ credentials: process.env.FAL_API_KEY || process.env.FAL_KEY });
  return fal;
}

function mimeForPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png')  return 'image/png';
  if (ext === '.gif')  return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

/**
 * Upload a local image to fal.ai storage and return a public URL.
 */
async function uploadImageToFal(imagePath) {
  const fal = getFalClient();
  const buffer   = fs.readFileSync(imagePath);
  const filename = path.basename(imagePath);
  const mimeType = mimeForPath(imagePath);

  let fileObj;
  if (typeof File !== 'undefined') {
    fileObj = new File([buffer], filename, { type: mimeType });
  } else {
    const { Blob } = require('buffer');
    fileObj = new Blob([buffer], { type: mimeType });
  }

  const url = await fal.storage.upload(fileObj);
  console.log(`[fal] Image uploaded: ${url.slice(0, 80)}...`);
  return url;
}

/**
 * Submit a Kling v3 Standard image-to-video job.
 * duration: any integer 3–15 as string (e.g. "5", "7", "10")
 * Aspect ratio is derived automatically from the input image — no parameter needed.
 */
async function submitVideoJob({ imageUrl, prompt, duration = '5', audio = true }) {
  const fal = getFalClient();
  const payload = {
    prompt,
    start_image_url: imageUrl,
    duration:        String(duration),
    negative_prompt: 'blur, distort, low quality, shaky, artifacts',
    generate_audio:  !!audio,
  };
  console.log(`[fal/kling-v3-std] Submitting to ${FAL_MODEL_KLING}`);
  console.log(`[fal/kling-v3-std] Payload: ${JSON.stringify({ ...payload, start_image_url: payload.start_image_url?.slice(0, 60) + '...' })}`);
  const result = await fal.queue.submit(FAL_MODEL_KLING, { input: payload });
  console.log(`[fal/kling-v3-std] Job submitted: ${result.request_id} (${duration}s)`);
  return result;
}

/**
 * Submit a Veo 3.1 Lite image-to-video job.
 * duration: "4s" | "6s" | "8s"  (1080p only at "8s")
 * aspectRatio: "9:16" | "16:9" | "auto"
 */
async function submitVeo3Job({ imageUrl, prompt, duration = '8s', aspectRatio = '9:16', audio = true }) {
  // 1080p is only supported at 8s; use 720p for shorter clips
  const resolution = duration === '8s' ? '1080p' : '720p';
  const fal = getFalClient();
  const payload = {
    prompt,
    image_url:       imageUrl,
    duration,
    aspect_ratio:    aspectRatio,
    resolution,
    negative_prompt: 'blur, distort, low quality, shaky, artifacts',
    generate_audio:  !!audio,
  };
  console.log(`[fal/veo3] Submitting to ${FAL_MODEL_VEO3}`);
  console.log(`[fal/veo3] Payload: ${JSON.stringify({ ...payload, image_url: payload.image_url?.slice(0, 60) + '...' })}`);
  try {
    const result = await fal.queue.submit(FAL_MODEL_VEO3, { input: payload });
    console.log(`[fal/veo3] Job submitted: ${result.request_id} (${duration} @ ${resolution} ${aspectRatio})`);
    return result;
  } catch (err) {
    const detail = err.body ? JSON.stringify(err.body, null, 2) : err.message;
    console.error(`[fal/veo3] Submit FAILED (${err.status ?? 'no-status'}): ${detail}`);
    throw err;
  }
}

/**
 * Check the status of a fal.ai queue job via SDK.
 * Returns { status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED', ... }
 */
async function checkJobStatus(requestId, model = FAL_MODEL_KLING) {
  const fal = getFalClient();
  const status = await fal.queue.status(model, { requestId, logs: false });
  return status; // { status, queue_position?, ... }
}

/**
 * Fetch the result of a completed fal.ai job via SDK.
 * Returns { video: { url, content_type, file_name, file_size } }
 */
async function getJobResult(requestId, model = FAL_MODEL_KLING) {
  const fal = getFalClient();
  const result = await fal.queue.result(model, { requestId });
  // SDK v1.x wraps output in { data, requestId } — unwrap to { video: { url, ... } }
  return result.data ?? result;
}

/**
 * Download a video from a URL and save it to a local file path.
 */
async function downloadVideo(url, outputPath) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Video download error ${response.status}`);
  const buffer = await response.arrayBuffer();
  fs.writeFileSync(outputPath, Buffer.from(buffer));
}

/**
 * Convert a scene duration (seconds) to the nearest Kling v3 duration string.
 * Kling v3 supports any integer from 3 to 15.
 * Rounds to nearest integer, clamped to [3, 15].
 */
function getFalDuration(sceneDurationSeconds) {
  return String(Math.max(3, Math.min(15, Math.round(sceneDurationSeconds))));
}

/**
 * Convert a scene duration (seconds) to the nearest Veo 3.1 duration string.
 * Veo 3.1 supports "4s", "6s", "8s". Midpoints: 5s and 7s.
 */
function getVeo3Duration(sceneDurationSeconds) {
  if (sceneDurationSeconds < 5) return '4s';
  if (sceneDurationSeconds < 7) return '6s';
  return '8s';
}

module.exports = {
  uploadImageToFal,
  submitVideoJob,
  submitVeo3Job,
  checkJobStatus,
  getJobResult,
  downloadVideo,
  getFalDuration,
  getVeo3Duration,
  FAL_MODEL,
  FAL_MODEL_KLING,
  FAL_MODEL_VEO3,
  FAL_MODEL_VEO3_LITE,
};
