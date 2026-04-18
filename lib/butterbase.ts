/**
 * @fileoverview Butterbase Storage + Database Helper
 *
 * Uses `@butterbase/sdk` for database operations (query builder)
 * and raw `axios` for the two-step presigned URL storage flow.
 *
 * Storage flow (per Butterbase docs):
 *   1. POST /storage/{appId}/upload → get uploadUrl + objectId
 *   2. PUT buffer to the presigned uploadUrl
 *   3. Store objectId (source of truth — never store presigned URLs)
 *
 * All functions log with the [STAGER] prefix for Butterbase log debugging.
 */

import { createClient } from '@butterbase/sdk';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import type {
  StagingJob,
  ButterbaseUploadResponse,
  ButterbaseDownloadResponse,
} from '../types/index.js';

// ── Singleton SDK client ────────────────────────────────────

let _client: ReturnType<typeof createClient> | null = null;

/**
 * Get or create the singleton Butterbase SDK client.
 *
 * Uses `createClient({ appId, apiUrl, apiKey })` with the service key
 * for full access (no user auth needed for this agent).
 *
 * @returns The Butterbase SDK client instance
 * @throws {Error} If BUTTERBASE_APP_ID, BUTTERBASE_API_URL, or BUTTERBASE_API_KEY is missing
 */
function getClient() {
  if (!_client) {
    const appId = process.env.BUTTERBASE_APP_ID;
    const apiUrl = process.env.BUTTERBASE_API_URL;
    const apiKey = process.env.BUTTERBASE_API_KEY;

    if (!appId || !apiUrl || !apiKey) {
      throw new Error(
        '[STAGER][BUTTERBASE] Missing BUTTERBASE_APP_ID, BUTTERBASE_API_URL, or BUTTERBASE_API_KEY'
      );
    }

    _client = createClient({ appId, apiUrl, apiKey });
    console.log('[STAGER][BUTTERBASE] Client initialized for app:', appId);
  }
  return _client;
}

// ── Storage: Presigned URL Upload Flow ──────────────────────

/**
 * Upload a file buffer to Butterbase storage via the presigned URL flow.
 *
 * This is a two-step process per the Butterbase Storage API:
 * 1. Request a presigned upload URL from `POST /storage/{appId}/upload`
 * 2. PUT the raw file bytes to the presigned URL
 *
 * Files are given a UUID-prefixed filename to avoid collisions.
 *
 * @param buffer - The file contents as a Node.js Buffer
 * @param filename - Original filename (will be prefixed with a UUID)
 * @param contentType - MIME type (e.g., 'image/jpeg', 'video/mp4')
 * @returns Object containing the `objectId` — store this, not the URL
 * @throws {Error} If the presigned URL request or PUT upload fails
 */
export async function uploadFile(
  buffer: Buffer,
  filename: string,
  contentType: string
): Promise<{ objectId: string }> {
  const appId = process.env.BUTTERBASE_APP_ID!;
  const apiUrl = process.env.BUTTERBASE_API_URL!;
  const apiKey = process.env.BUTTERBASE_API_KEY!;

  const uniqueFilename = `${uuidv4()}_${filename}`;

  console.log(`[STAGER][STORAGE] Requesting upload URL for: ${uniqueFilename} (${contentType}, ${buffer.length} bytes)`);

  // Step 1: Get presigned upload URL
  const { data: uploadData } = await axios.post<ButterbaseUploadResponse>(
    `${apiUrl}/storage/${appId}/upload`,
    {
      filename: uniqueFilename,
      contentType,
      sizeBytes: buffer.length,
    },
    {
      headers: { Authorization: `Bearer ${apiKey}` },
    }
  );

  console.log(`[STAGER][STORAGE] Got upload URL, objectId: ${uploadData.objectId}`);

  // Step 2: PUT file bytes to presigned URL
  await axios.put(uploadData.uploadUrl, buffer, {
    headers: { 'Content-Type': contentType },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });

  console.log(`[STAGER][STORAGE] Upload complete: ${uploadData.objectId}`);

  return { objectId: uploadData.objectId };
}

/**
 * Get a fresh presigned download URL for a stored object.
 *
 * Per Butterbase docs, download URLs expire after 1 hour.
 * Always call this fresh when you need a URL — never cache them.
 *
 * @param objectId - The object ID returned from `uploadFile()`
 * @returns A presigned download URL (valid for ~1 hour)
 * @throws {Error} If the download URL request fails or objectId is invalid
 */
export async function getDownloadUrl(objectId: string): Promise<string> {
  const appId = process.env.BUTTERBASE_APP_ID!;
  const apiUrl = process.env.BUTTERBASE_API_URL!;
  const apiKey = process.env.BUTTERBASE_API_KEY!;

  console.log(`[STAGER][STORAGE] Requesting download URL for objectId: ${objectId}`);

  const { data } = await axios.get<ButterbaseDownloadResponse>(
    `${apiUrl}/storage/${appId}/download/${objectId}`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
    }
  );

  console.log(`[STAGER][STORAGE] Download URL obtained (expires in ${data.expiresIn}s)`);

  return data.downloadUrl;
}

// ── Database: Staging Jobs CRUD ─────────────────────────────

/**
 * Insert a new staging job row into the `staging_jobs` table.
 *
 * Creates a row with status 'processing' and optional image_object_id.
 * The returned job includes the generated UUID id.
 *
 * @param job - Must include `sender_id`; may include `image_object_id`
 * @returns The inserted StagingJob row with all fields populated
 * @throws {Error} If the database insert fails
 */
export async function insertJob(
  job: Pick<StagingJob, 'sender_id'> & Partial<StagingJob>
): Promise<StagingJob> {
  const client = getClient();

  console.log(`[STAGER][DB] Inserting job for sender: ${job.sender_id}`);

  const { data, error } = await client
    .from<StagingJob>('staging_jobs')
    .insert({
      sender_id: job.sender_id,
      status: 'processing',
      image_object_id: job.image_object_id ?? null,
      video_object_id: null,
      seedance_task_id: null,
      error_message: null,
    });

  if (error) {
    console.error('[STAGER][DB] Insert failed:', error);
    throw new Error(`DB insert failed: ${JSON.stringify(error)}`);
  }

  const inserted = Array.isArray(data) ? data[0] : data;
  console.log(`[STAGER][DB] Job created: ${inserted?.id}`);

  return inserted as StagingJob;
}

/**
 * Update an existing staging job row by ID.
 *
 * Automatically sets `updated_at` to the current timestamp.
 * Commonly used to update status, attach video_object_id, or record errors.
 *
 * @param id - UUID of the job to update
 * @param updates - Partial fields to update (status, video_object_id, etc.)
 * @throws {Error} If the database update fails or the job ID is not found
 */
export async function updateJob(
  id: string,
  updates: Partial<Pick<StagingJob, 'status' | 'image_object_id' | 'video_object_id' | 'seedance_task_id' | 'error_message'>>
): Promise<void> {
  const client = getClient();

  console.log(`[STAGER][DB] Updating job ${id}:`, updates);

  const { error } = await client
    .from<StagingJob>('staging_jobs')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    console.error(`[STAGER][DB] Update failed for job ${id}:`, error);
    throw new Error(`DB update failed: ${JSON.stringify(error)}`);
  }

  console.log(`[STAGER][DB] Job ${id} updated successfully`);
}
