// ─────────────────────────────────────────────────────────────
// Type definitions for the Real Estate Stager Agent
// ─────────────────────────────────────────────────────────────

/**
 * Seedance 2.0 task creation request body.
 * POST to https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks
 */
export interface SeedanceTaskCreateRequest {
  model: string;
  content: SeedanceContentPart[];
}

export type SeedanceContentPart =
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'text'; text: string };

/**
 * Seedance 2.0 task response (from both create and poll endpoints).
 */
export interface SeedanceTaskResponse {
  id: string;
  status: 'submitted' | 'running' | 'succeeded' | 'failed';
  video_url?: string;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Database row shape for the `staging_jobs` table in Butterbase PostgreSQL.
 */
export interface StagingJob {
  id: string;
  sender_id: string;
  image_object_id: string | null;
  video_object_id: string | null;
  seedance_task_id: string | null;
  status: 'processing' | 'succeeded' | 'failed';
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Response from Butterbase Storage upload endpoint.
 * POST /storage/{app_id}/upload
 */
export interface ButterbaseUploadResponse {
  uploadUrl: string;
  objectKey: string;
  objectId: string;
  expiresIn: number;
}

/**
 * Response from Butterbase Storage download endpoint.
 * GET /storage/{app_id}/download/{object_id}
 */
export interface ButterbaseDownloadResponse {
  downloadUrl: string;
  filename: string;
  expiresIn: number;
}

/**
 * Options for the staging prompt builder.
 */
export interface StagingPromptOptions {
  style?: 'modern' | 'mid-century' | 'minimalist' | 'scandinavian' | 'luxury';
  roomType?: 'living-room' | 'bedroom' | 'kitchen' | 'bathroom' | 'office';
}
