/**
 * @fileoverview Seedance 2.0 Client — Volcengine Ark API Wrapper
 *
 * Implements the async task pattern for ByteDance Seedance 2.0:
 *   1. POST /contents/generations/tasks → create task, get task_id
 *   2. GET  /contents/generations/tasks/{id} → poll until terminal state
 *   3. Download the video from the returned video_url
 *
 * Base URL: https://ark.cn-beijing.volces.com/api/v3
 * Auth: Bearer token via ARK_API_KEY environment variable
 */

import axios, { type AxiosInstance } from 'axios';
import type { SeedanceTaskCreateRequest, SeedanceTaskResponse } from '../types/index.js';

const ARK_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';

// ── Singleton axios instance ────────────────────────────────

let _arkClient: AxiosInstance | null = null;

/**
 * Get or create the singleton axios instance for Ark API calls.
 *
 * Pre-configured with base URL, Bearer auth, and 30s timeout.
 *
 * @returns Configured axios instance
 * @throws {Error} If ARK_API_KEY environment variable is missing
 */
function getArkClient(): AxiosInstance {
  if (!_arkClient) {
    const apiKey = process.env.ARK_API_KEY;
    if (!apiKey) {
      throw new Error('[STAGER][SEEDANCE] Missing ARK_API_KEY environment variable');
    }

    _arkClient = axios.create({
      baseURL: ARK_BASE_URL,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    });

    console.log('[STAGER][SEEDANCE] Ark API client initialized');
  }
  return _arkClient;
}

// ── Create Task ─────────────────────────────────────────────

/**
 * Submit an image-to-video staging task to Seedance 2.0.
 *
 * Sends the image URL and staging prompt to the Volcengine Ark API.
 * The model ID is configurable via the SEEDANCE_MODEL env var,
 * defaulting to `doubao-seedance-2-0-260128`.
 *
 * @param imageUrl - Publicly accessible URL of the room image
 * @param prompt - The staging prompt (from prompt-engineer.ts)
 * @returns The task ID string for use with `pollTaskUntilDone()`
 * @throws {Error} If the API request fails or returns a non-2xx status
 */
export async function createStagingTask(
  imageUrl: string,
  prompt: string
): Promise<string> {
  const client = getArkClient();
  const model = process.env.SEEDANCE_MODEL || 'doubao-seedance-2-0-260128';

  console.log(`[STAGER][SEEDANCE] Creating task with model: ${model}`);
  console.log(`[STAGER][SEEDANCE] Image URL: ${imageUrl}`);
  console.log(`[STAGER][SEEDANCE] Prompt: ${prompt.substring(0, 100)}...`);

  const requestBody: SeedanceTaskCreateRequest = {
    model,
    content: [
      { type: 'image_url', image_url: { url: imageUrl } },
      { type: 'text', text: prompt },
    ],
  };

  const { data } = await client.post<SeedanceTaskResponse>(
    '/contents/generations/tasks',
    requestBody
  );

  console.log(`[STAGER][SEEDANCE] Task created: ${data.id} (status: ${data.status})`);

  return data.id;
}

// ── Poll Task ───────────────────────────────────────────────

/**
 * Poll a Seedance task until it reaches a terminal state.
 * Resolves on "succeeded", rejects on "failed" or timeout.
 *
 * @param taskId - The task ID from createStagingTask
 * @param intervalMs - Polling interval (default: 5000ms)
 * @param timeoutMs - Max wait time (default: 120000ms)
 */
export async function pollTaskUntilDone(
  taskId: string,
  intervalMs: number = 5_000,
  timeoutMs: number = 120_000
): Promise<SeedanceTaskResponse> {
  const client = getArkClient();
  const startTime = Date.now();
  let attempt = 0;

  console.log(`[STAGER][SEEDANCE] Polling task ${taskId} every ${intervalMs / 1000}s (timeout: ${timeoutMs / 1000}s)`);

  return new Promise((resolve, reject) => {
    const timer = setInterval(async () => {
      attempt++;
      const elapsed = Date.now() - startTime;

      if (elapsed >= timeoutMs) {
        clearInterval(timer);
        console.error(`[STAGER][SEEDANCE] Task ${taskId} timed out after ${timeoutMs / 1000}s`);
        reject(new Error(`Seedance task timed out after ${timeoutMs / 1000}s`));
        return;
      }

      try {
        console.log(`[STAGER][SEEDANCE][POLL] Attempt ${attempt} — elapsed: ${Math.round(elapsed / 1000)}s`);

        const { data } = await client.get<SeedanceTaskResponse>(
          `/contents/generations/tasks/${taskId}`
        );

        console.log(`[STAGER][SEEDANCE][POLL] Status: ${data.status}`);

        if (data.status === 'succeeded') {
          clearInterval(timer);
          console.log(`[STAGER][SEEDANCE] Task ${taskId} succeeded! Video URL: ${data.video_url}`);
          resolve(data);
        } else if (data.status === 'failed') {
          clearInterval(timer);
          console.error(`[STAGER][SEEDANCE] Task ${taskId} failed:`, data.error);
          reject(new Error(`Seedance task failed: ${data.error?.message || 'Unknown error'}`));
        }
        // else: still running, continue polling
      } catch (err) {
        clearInterval(timer);
        console.error(`[STAGER][SEEDANCE] Poll error for task ${taskId}:`, err);
        reject(err);
      }
    }, intervalMs);
  });
}

// ── Download Video ──────────────────────────────────────────

/**
 * Download the generated video from a Seedance video_url into a Buffer.
 *
 * Uses a 60-second timeout and accepts any response size.
 *
 * @param videoUrl - The video_url from a succeeded Seedance task response
 * @returns The video file contents as a Node.js Buffer
 * @throws {Error} If the download fails or times out
 */
export async function downloadVideo(videoUrl: string): Promise<Buffer> {
  console.log(`[STAGER][SEEDANCE] Downloading video from: ${videoUrl}`);

  const response = await axios.get(videoUrl, {
    responseType: 'arraybuffer',
    timeout: 60_000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });

  const buffer = Buffer.from(response.data);
  console.log(`[STAGER][SEEDANCE] Video downloaded: ${buffer.length} bytes`);

  return buffer;
}
