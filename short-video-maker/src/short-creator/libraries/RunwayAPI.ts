/**
 * Runway API - Supports Gen-3 Alpha Turbo and VEO 3.1
 *
 * Alternative to Google VEO for AI video generation.
 * Supports first frame + last frame interpolation (keyframes).
 *
 * Models:
 * - gen3a_turbo: Runway's own model (5 credits/sec, fast)
 * - veo3.1: Google VEO 3.1 via Runway (40 credits/sec, high quality)
 *
 * @see https://docs.dev.runwayml.com/
 */

import { logger } from "../../logger";
import { OrientationEnum, type Video } from "../../types/shorts";
import { getOrientationConfig } from "../../components/utils";

const defaultTimeoutMs = 180000; // 3 minutes (VEO takes longer)
const pollIntervalMs = 5000; // Poll every 5 seconds
const maxPollAttempts = 90; // 7.5 minutes max

export type RunwayModel = 'gen3a_turbo' | 'veo3.1';

interface RunwayTask {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  output?: string[];  // Array of video URLs
  failure?: string;
  failureCode?: string;
}

interface RunwayImageUploadResponse {
  id: string;
  url?: string;
}

export class RunwayAPI {
  private apiKey: string;
  private baseUrl = 'https://api.dev.runwayml.com/v1';
  private apiVersion = '2024-11-06';
  private model: RunwayModel;
  private useVeoAudio: boolean;

  constructor(apiKey: string, model: RunwayModel = 'gen3a_turbo', useVeoAudio: boolean = false) {
    this.apiKey = apiKey;
    this.model = model;
    this.useVeoAudio = useVeoAudio;
    logger.info({ model, useVeoAudio }, `🎬 RunwayAPI initialized with model: ${model}`);
  }

  /**
   * Get current model
   */
  getModel(): RunwayModel {
    return this.model;
  }

  /**
   * Set model dynamically
   */
  setModel(model: RunwayModel): void {
    this.model = model;
    logger.info({ model }, `🔄 RunwayAPI model changed to: ${model}`);
  }

  /**
   * Check if Runway supports First + Last Frame interpolation
   * Gen-3 Alpha Turbo supports keyframes with first, middle, last
   */
  supportsFrameInterpolation(): boolean {
    return true; // Gen-3 Turbo always supports keyframes
  }

  /**
   * Upload image to Runway and get asset ID
   */
  private async uploadImage(imageData: string, mimeType: string): Promise<string> {
    // Convert base64 to data URI if needed
    const dataUri = imageData.startsWith('data:')
      ? imageData
      : `data:${mimeType};base64,${imageData}`;

    logger.debug({
      dataUriLength: dataUri.length,
      mimeType
    }, "📤 Uploading image to Runway");

    // For data URIs, we can use them directly in the API call
    // No separate upload needed - Runway accepts data URIs
    return dataUri;
  }

  /**
   * Create image-to-video task with optional keyframes
   * Supports both gen3a_turbo and veo3.1 models
   */
  private async createImageToVideoTask(
    prompt: string,
    duration: number,
    aspectRatio: string,
    firstImage?: string,
    lastImage?: string
  ): Promise<string> {
    const body: any = {
      model: this.model,
      promptText: prompt.substring(0, this.model === 'veo3.1' ? 1000 : 512),
      ratio: aspectRatio,
      duration: duration,
    };

    // VEO 3.1 specific: audio generation option
    if (this.model === 'veo3.1') {
      body.audio = this.useVeoAudio;
    }

    // Add keyframes if provided
    // Runway SDK format: promptImage as array with position indicators
    // Supported models: gen3a_turbo, veo3.1, veo3.1_fast (first + last frame)
    // gen4_turbo, veo3: only first frame supported
    if (firstImage && lastImage && (this.model === 'gen3a_turbo' || this.model === 'veo3.1')) {
      // Both first and last frame - use array format
      body.promptImage = [
        { position: "first", uri: firstImage },
        { position: "last", uri: lastImage }
      ];
    } else if (firstImage) {
      // Single first frame only
      body.promptImage = firstImage;
    }

    logger.info({
      model: this.model,
      promptLength: prompt.length,
      duration,
      aspectRatio,
      hasFirstImage: !!firstImage,
      hasLastImage: !!lastImage,
      audioEnabled: body.audio
    }, "🎬 Creating Runway image-to-video task");

    const response = await fetch(`${this.baseUrl}/image_to_video`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'X-Runway-Version': this.apiVersion,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error({
        status: response.status,
        statusText: response.statusText,
        error: errorText
      }, "❌ Runway API error");
      throw new Error(`Runway API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    logger.info({ taskId: result.id }, "✅ Runway task created");
    return result.id;
  }

  /**
   * Poll task status until completion
   */
  private async pollTaskStatus(taskId: string): Promise<RunwayTask> {
    let attempts = 0;

    while (attempts < maxPollAttempts) {
      attempts++;

      const response = await fetch(`${this.baseUrl}/tasks/${taskId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'X-Runway-Version': this.apiVersion
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to poll Runway task: ${response.status} - ${errorText}`);
      }

      const task: RunwayTask = await response.json();

      logger.info({
        taskId,
        status: task.status,
        attempt: attempts,
        maxAttempts: maxPollAttempts
      }, `⏳ Runway polling #${attempts}`);

      if (task.status === 'SUCCEEDED') {
        logger.info({ taskId, output: task.output }, "✅ Runway task completed");
        return task;
      }

      if (task.status === 'FAILED') {
        logger.error({
          taskId,
          failure: task.failure,
          failureCode: task.failureCode
        }, "❌ Runway task failed");
        throw new Error(`Runway task failed: ${task.failure || task.failureCode}`);
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(`Runway task timeout after ${maxPollAttempts} attempts`);
  }

  /**
   * Generate video from images - compatible with GoogleVeoAPI interface
   */
  async findVideo(
    searchTerms: string[],
    minDurationSeconds: number,
    excludeIds: string[] = [],
    orientation: OrientationEnum = OrientationEnum.portrait,
    timeout: number = defaultTimeoutMs,
    retryCounter: number = 0,
    initialImage?: { data: string; mimeType: string },
    lastImage?: { data: string; mimeType: string }
  ): Promise<Video> {
    const isFrameInterpolation = !!initialImage && !!lastImage;
    const prompt = this.createVideoPrompt(searchTerms, minDurationSeconds, orientation, !!initialImage, isFrameInterpolation);

    // Duration varies by model
    // gen3a_turbo: 5 or 10 seconds
    // veo3.1: 4, 6, or 8 seconds
    let duration: number;
    if (this.model === 'veo3.1') {
      // ⭐ VEO 3.1 First+Last Frame interpolation works best with duration=8
      // When using frame interpolation, force 8 seconds for smooth animation
      if (isFrameInterpolation) {
        duration = 8;
        logger.info({ forcedDuration: 8 }, "🎯 VEO 3.1 First+Last Frame mode: using duration=8 for best results");
      } else if (minDurationSeconds <= 5) {
        duration = 4;
      } else if (minDurationSeconds <= 7) {
        duration = 6;
      } else {
        duration = 8;
      }
    } else {
      duration = minDurationSeconds <= 7 ? 5 : 10;
    }

    // Aspect ratio varies by model
    // gen3a_turbo: "768:1280" (portrait), "1280:768" (landscape)
    // veo3.1: "720:1280" (portrait), "1280:720" (landscape), or "1080:1920" / "1920:1080" (HD)
    let aspectRatio: string;
    if (this.model === 'veo3.1') {
      aspectRatio = orientation === OrientationEnum.portrait ? '720:1280' : '1280:720';
    } else {
      aspectRatio = orientation === OrientationEnum.portrait ? '768:1280' : '1280:768';
    }

    logger.info({
      model: this.model,
      searchTerms,
      duration,
      aspectRatio,
      hasFirstImage: !!initialImage,
      hasLastImage: !!lastImage,
      isFrameInterpolation
    }, `🎬 Starting ${this.model === 'veo3.1' ? 'VEO 3.1' : 'Runway Gen-3'} video generation`);

    try {
      // Prepare images (convert to data URI if needed)
      let firstImageUri: string | undefined;
      let lastImageUri: string | undefined;

      if (initialImage) {
        firstImageUri = await this.uploadImage(initialImage.data, initialImage.mimeType);
      }
      if (lastImage) {
        lastImageUri = await this.uploadImage(lastImage.data, lastImage.mimeType);
      }

      // Create task
      const taskId = await this.createImageToVideoTask(
        prompt,
        duration,
        aspectRatio,
        firstImageUri,
        lastImageUri
      );

      // Poll for completion
      const task = await this.pollTaskStatus(taskId);

      if (!task.output || task.output.length === 0) {
        throw new Error("No video URL in Runway response");
      }

      const videoUrl = task.output[0];
      const videoId = `runway-${taskId}`;

      const { width: requiredVideoWidth, height: requiredVideoHeight } =
        getOrientationConfig(orientation);

      const video: Video = {
        id: videoId,
        url: videoUrl,
        width: requiredVideoWidth,
        height: requiredVideoHeight
      };

      logger.info({
        videoId,
        videoUrl: videoUrl.substring(0, 80) + "...",
        width: requiredVideoWidth,
        height: requiredVideoHeight
      }, "✅ Runway video generated successfully");

      return video;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Retry logic
      if (retryCounter < 2) {
        logger.warn({
          error: errorMessage,
          retryCounter
        }, "⚠️ Runway error, retrying...");

        await new Promise(resolve => setTimeout(resolve, 5000));

        return this.findVideo(
          searchTerms,
          minDurationSeconds,
          excludeIds,
          orientation,
          timeout,
          retryCounter + 1,
          initialImage,
          lastImage
        );
      }

      logger.error(error, "❌ Runway video generation failed");
      throw new Error(`Failed to generate video with Runway: ${errorMessage}`);
    }
  }

  /**
   * Create optimized prompt for Runway
   */
  private createVideoPrompt(
    searchTerms: string[],
    durationSeconds: number,
    orientation: OrientationEnum,
    isImageToVideo: boolean,
    isFrameInterpolation: boolean
  ): string {
    const baseTerms = searchTerms.join(" ");
    const orientationHint = orientation === OrientationEnum.portrait
      ? "vertical mobile format"
      : "cinematic widescreen";

    if (isFrameInterpolation) {
      // First + Last frame interpolation - smooth transition
      return `Smooth cinematic transition: ${baseTerms}. ` +
        `Create fluid motion connecting start to end scene. ` +
        `Maintain consistent style, lighting, and characters. ` +
        `${orientationHint}, professional quality.`;
    } else if (isImageToVideo) {
      // Single image animation
      return `Animate with cinematic motion: ${baseTerms}. ` +
        `Add smooth camera movement, subtle motion, dynamic lighting. ` +
        `${durationSeconds}s of fluid professional motion in ${orientationHint}.`;
    } else {
      // Text-to-video
      return `Create ${durationSeconds}s video: ${baseTerms}. ` +
        `High quality ${orientationHint}, smooth motion, professional lighting.`;
    }
  }
}

export default RunwayAPI;
