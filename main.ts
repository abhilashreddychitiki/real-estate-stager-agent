/**
 * @fileoverview Real Estate Stager Agent — Main Entry Point
 *
 * Long-lived Node.js process that listens for iMessage photos via the
 * Photon Spectrum SDK and generates AI-staged room videos using
 * ByteDance Seedance 2.0. Built for Beta Hacks 2026.
 *
 * Architecture:
 * - Spectrum async iterator (`for await`) receives [space, message] tuples
 * - Image attachments are fire-and-forget processed via processImage()
 * - The message loop is never blocked by video generation (~60-120s)
 */

import 'dotenv/config';
import { Spectrum, attachment } from 'spectrum-ts';
import { imessage } from 'spectrum-ts/providers/imessage';
import { uploadFile, getDownloadUrl, insertJob, updateJob } from './lib/butterbase.js';
import { createStagingTask, pollTaskUntilDone, downloadVideo } from './lib/seedance-client.js';
import { buildStagingPrompt } from './lib/prompt-engineer.js';

// ── Startup ─────────────────────────────────────────────────

console.log('[STAGER] ─────────────────────────────────────────');
console.log('[STAGER] Real Estate Stager Agent starting...');
console.log('[STAGER] ─────────────────────────────────────────');

const requiredEnvVars = [
  'PHOTON_PROJECT_ID',
  'PHOTON_PROJECT_SECRET',
  'BUTTERBASE_APP_ID',
  'BUTTERBASE_API_URL',
  'BUTTERBASE_API_KEY',
  'ARK_API_KEY',
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`[STAGER] FATAL: Missing required env var: ${envVar}`);
    process.exit(1);
  }
}

console.log('[STAGER] All environment variables present ✓');

// ── Initialize Spectrum ─────────────────────────────────────

console.log('[STAGER] Connecting to Photon Spectrum...');

const app = await Spectrum({
  projectId: process.env.PHOTON_PROJECT_ID!,
  projectSecret: process.env.PHOTON_PROJECT_SECRET!,
  providers: [imessage.config()],
});

console.log('[STAGER] Spectrum SDK initialized, listening for iMessages... 📱');

// ── Background image processing ─────────────────────────────

/**
 * Process an incoming room image through the full staging pipeline.
 *
 * This function is called with `.catch()` (fire-and-forget) so the
 * Spectrum message loop stays responsive while Seedance processes.
 *
 * Pipeline: upload image → insert DB job → Seedance create → poll
 * → download video → upload video → update DB → send reply.
 *
 * @param space - The Spectrum Space object for sending replies
 * @param senderId - The sender's unique ID from message.sender.id
 * @param imageBuffer - The raw image bytes from message.content.data
 * @param imageName - Original filename from message.content.name
 * @param imageMimeType - MIME type from message.content.mimeType
 */
async function processImage(
  space: any,
  senderId: string,
  imageBuffer: Buffer,
  imageName: string,
  imageMimeType: string
): Promise<void> {
  let jobId: string | undefined;

  try {
    // Step 1: Upload image to Butterbase storage
    console.log(`[STAGER][${senderId}] Uploading image to storage...`);
    const { objectId: imageObjectId } = await uploadFile(imageBuffer, imageName, imageMimeType);

    // Step 2: Insert job row
    const job = await insertJob({ sender_id: senderId, image_object_id: imageObjectId });
    jobId = job.id;
    console.log(`[STAGER][${senderId}] Job created: ${jobId}`);

    // Step 3: Get download URL for the image (Seedance needs a public URL)
    const imageDownloadUrl = await getDownloadUrl(imageObjectId);

    // Step 4: Build the staging prompt
    const prompt = buildStagingPrompt();

    // Step 5: Create Seedance task
    console.log(`[STAGER][${senderId}][${jobId}] Submitting to Seedance...`);
    const taskId = await createStagingTask(imageDownloadUrl, prompt);
    await updateJob(jobId, { seedance_task_id: taskId });

    // Step 6: Poll until done
    console.log(`[STAGER][${senderId}][${jobId}] Polling Seedance task: ${taskId}...`);
    const result = await pollTaskUntilDone(taskId);
    if (!result.video_url) throw new Error('Seedance succeeded but no video_url returned');

    // Step 7: Download the generated video
    console.log(`[STAGER][${senderId}][${jobId}] Downloading generated video...`);
    const videoBuffer = await downloadVideo(result.video_url);

    // Step 8: Upload video to Butterbase storage
    const { objectId: videoObjectId } = await uploadFile(
      videoBuffer,
      `staged_${imageName.replace(/\.[^.]+$/, '')}.mp4`,
      'video/mp4'
    );

    // Step 9: Update job as succeeded
    await updateJob(jobId, { status: 'succeeded', video_object_id: videoObjectId });

    // Step 10: Send the video back to the user
    console.log(`[STAGER][${senderId}][${jobId}] Sending staged video to user...`);
    await space.send(
      '🏠✨ Your staged room is ready!',
      attachment(videoBuffer, { name: 'staged-room.mp4', mimeType: 'video/mp4' })
    );

    console.log(`[STAGER][${senderId}][${jobId}] ✅ Complete!`);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[STAGER][${senderId}][${jobId ?? 'no-job'}] ❌ Error:`, errorMessage);

    // Update job as failed
    if (jobId) {
      try {
        await updateJob(jobId, { status: 'failed', error_message: errorMessage });
      } catch (dbErr) {
        console.error(`[STAGER][${senderId}][${jobId}] Failed to update job status:`, dbErr);
      }
    }

    // Notify the user
    try {
      await space.send(
        "😔 Sorry, we couldn't stage your photo. Please try again with a different room image."
      );
    } catch (sendErr) {
      console.error(`[STAGER][${senderId}] Failed to send error notification:`, sendErr);
    }
  }
}

// ── Message Loop ────────────────────────────────────────────

for await (const [space, message] of app.messages) {
  const senderId = message.sender.id;
  console.log(`[STAGER] Message from ${senderId} (type: ${message.content.type}, platform: ${message.platform})`);

  // Only process attachment messages
  if (message.content.type !== 'attachment') {
    if (message.content.type === 'text') {
      console.log(`[STAGER][${senderId}] Text message received, sending instructions`);
      await space.send(
        "🏠 Hi! Send me a photo of an empty room and I'll create a virtual staging video for you. Just snap a picture and send it!"
      );
    }
    continue;
  }

  // Validate it's an image
  const { data: imageBuffer, mimeType, name: imageName } = message.content;

  if (!mimeType.startsWith('image/')) {
    console.log(`[STAGER][${senderId}] Non-image attachment: ${mimeType}`);
    await space.send('📷 Please send a photo (JPG, PNG, or HEIC). I can only stage room images!');
    continue;
  }

  console.log(`[STAGER][${senderId}] Image received: ${imageName} (${mimeType}, ${imageBuffer.byteLength} bytes)`);

  // Send immediate acknowledgment
  await space.send('🏠 Got your photo! Staging in progress... This usually takes 1-2 minutes. ⏳');

  // Fire-and-forget with .catch(): process in background so the message loop stays responsive
  processImage(space, senderId, Buffer.from(imageBuffer), imageName, mimeType)
    .catch((err) => {
      console.error(`[STAGER][${senderId}] Unhandled error in processImage:`, err);
    });
}
