/* eslint-disable @remotion/deterministic-randomness */
import { GoogleGenAI } from "@google/genai";
import { getOrientationConfig } from "../../components/utils";
import { logger } from "../../logger";
import { OrientationEnum, type Video } from "../../types/shorts";

const defaultTimeoutMs = 30000; // Veo takes longer to generate
const retryTimes = 3;
const maxGenerationTimeMs = 120000; // 2 minutes max wait
const pollIntervalMs = 10000; // Poll every 10 seconds

export class GoogleVeoAPI {
  private ai: GoogleGenAI;
  private veoModel: string;
  
  constructor(
    private geminiApiKey: string, // Gemini API key
    projectId: string, // Not used in Gemini API, but kept for interface compatibility
    region: string = "us-central1", // Not used in Gemini API, but kept for interface compatibility
    veoModel: "veo-2.0-generate-001" | "veo-3.0-fast-generate-001" = "veo-2.0-generate-001"
  ) {
    this.veoModel = veoModel;
    this.ai = new GoogleGenAI({ apiKey: this.geminiApiKey });
  }
  
  private getGeminiVeoModel(): string {
    // Map internal model names to Gemini API model names
    const modelMapping = {
      "veo-2.0-generate-001": "veo-2.0-generate-001",
      "veo-3.0-fast-generate-001": "veo-3.0-fast-generate-preview"
    };
    
    return modelMapping[this.veoModel as keyof typeof modelMapping] || this.veoModel;
  }

  private async _generateVideo(
    prompt: string,
    minDurationSeconds: number,
    orientation: OrientationEnum,
    timeout: number = defaultTimeoutMs,
    initialImage?: { data: string; mimeType: string },
  ): Promise<Video> {
    const isVeo3 = this.veoModel.includes("veo-3");
    const modelName = isVeo3 ? "VEO3" : "VEO2";

    logger.info({
      model: this.veoModel,
      modelName,
      prompt,
      minDurationSeconds,
      orientation,
      hasInitialImage: !!initialImage,
      imageSize: initialImage ? initialImage.data.length : 0
    }, `🎬 Starting ${modelName} video generation`);

    const aspectRatio = orientation === OrientationEnum.portrait ? "9:16" : "16:9";
    // VEO 3 Fast supports 4, 6, or 8 seconds, VEO 2 supports 5-8 seconds
    const duration = isVeo3
      ? (minDurationSeconds <= 4 ? 4 : minDurationSeconds <= 6 ? 6 : 8)
      : Math.min(Math.max(minDurationSeconds, 5), 8);

    const geminiModel = this.getGeminiVeoModel();

    logger.debug({
      geminiModel,
      requestedDuration: minDurationSeconds,
      adjustedDuration: duration,
      aspectRatio,
      isImageToVideo: !!initialImage
    }, `📋 ${modelName} API parameters prepared`);

    try {
      // Start video generation operation
      logger.info({
        geminiModel,
        duration,
        aspectRatio,
        promptLength: prompt.length,
        imageProvided: !!initialImage
      }, `🚀 Calling ${modelName} API`);
      
      // VEO 3.0 Fast vs VEO 2.0 parameter differences
      const config: any = {
        aspectRatio: aspectRatio,
      };
      
      if (isVeo3) {
        // VEO 3.0 Fast parameters - minimal config only
        // Many parameters from documentation are not actually supported yet
        // Keep only aspectRatio which is confirmed to work
      } else {
        // VEO 2.0 parameters
        config.durationSeconds = duration;
        config.personGeneration = "dont_allow";
      }
      
      // Prepare generateVideos parameters
      const generateParams: any = {
        model: geminiModel,
        prompt: prompt,
        config: config,
      };

      // Add image input if provided (for image-to-video generation)
      if (initialImage) {
        generateParams.image = {
          imageBytes: initialImage.data,
          mimeType: initialImage.mimeType,
        };
        logger.debug({ imageProvided: true, mimeType: initialImage.mimeType }, "Using image input for video generation");
      }

      let operation = await this.ai.models.generateVideos(generateParams);

      logger.info({
        operationId: operation.name,
        operationDone: operation.done
      }, `⏳ ${modelName} operation started, polling for completion`);

      // Poll for completion with timeout
      const startTime = Date.now();
      let pollCount = 0;
      while (!operation.done) {
        const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);

        if (Date.now() - startTime > maxGenerationTimeMs) {
          throw new Error(`${modelName} generation timeout exceeded after ${elapsedSeconds}s`);
        }

        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        pollCount++;

        try {
          operation = await this.ai.operations.getVideosOperation({
            operation: operation,
          });

          logger.info({
            operationId: operation.name,
            done: operation.done,
            pollCount,
            elapsedSeconds,
            progress: operation.metadata?.progress
          }, `⏳ ${modelName} polling #${pollCount} (${elapsedSeconds}s elapsed)`);
        } catch (pollError) {
          logger.warn({
            error: pollError,
            pollCount,
            elapsedSeconds
          }, `⚠️ Error polling ${modelName} operation status`);
          // Continue polling unless it's a fatal error
        }
      }

      const totalSeconds = Math.floor((Date.now() - startTime) / 1000);
      logger.info({
        operationId: operation.name,
        totalPolls: pollCount,
        totalSeconds
      }, `✅ ${modelName} operation completed after ${totalSeconds}s`);


      // Check if operation completed successfully
      logger.debug({
        hasResponse: !!operation.response,
        hasGeneratedVideos: !!operation.response?.generatedVideos,
        videosLength: operation.response?.generatedVideos?.length,
        fullResponse: JSON.stringify(operation.response, null, 2)
      }, "📋 VEO3 operation response structure");

      if (!operation.response?.generatedVideos?.length) {
        logger.error({
          response: operation.response,
          operationName: operation.name,
          operationDone: operation.done
        }, "❌ No video generated by Veo API");
        throw new Error("No video generated by Veo API");
      }

      const generatedVideo = operation.response.generatedVideos[0];
      logger.debug({
        hasVideo: !!generatedVideo.video,
        hasUri: !!generatedVideo.video?.uri,
        hasVideoBytes: !!generatedVideo.video?.videoBytes,
        videoKeys: generatedVideo.video ? Object.keys(generatedVideo.video) : []
      }, "📹 Generated video structure");

      if (!generatedVideo.video?.uri) {
        logger.error({
          generatedVideo,
          videoObject: generatedVideo.video
        }, "❌ No video URL found in Veo API response");
        throw new Error("No video URL found in Veo API response");
      }

      // Create video URL with API key for access
      const videoUrl = `${generatedVideo.video.uri}&key=${this.geminiApiKey}`;
      const videoId = `veo-${Date.now()}`;

      const { width: requiredVideoWidth, height: requiredVideoHeight } =
        getOrientationConfig(orientation);

      const video: Video = {
        id: videoId,
        url: videoUrl,
        width: requiredVideoWidth,
        height: requiredVideoHeight,
      };

      logger.info({
        videoId,
        videoUrl: videoUrl.substring(0, 100) + "...",
        width: requiredVideoWidth,
        height: requiredVideoHeight,
        totalGenerationTimeSeconds: totalSeconds
      }, `✅ ${modelName} video generated successfully`);

      return video;

    } catch (error: unknown) {
      logger.error(error, "Error generating video with Veo via Gemini API");
      throw error;
    }
  }

  async findVideo(
    searchTerms: string[],
    minDurationSeconds: number,
    excludeIds: string[] = [],
    orientation: OrientationEnum = OrientationEnum.portrait,
    timeout: number = defaultTimeoutMs,
    retryCounter: number = 0,
    initialImage?: { data: string; mimeType: string }, // Add image input support
  ): Promise<Video> {
    // Create a comprehensive prompt from search terms
    // For image-to-video, use motion-focused prompt
    const prompt = this.createVideoPrompt(searchTerms, minDurationSeconds, orientation, false, !!initialImage);

    try {
      const video = await this._generateVideo(
        prompt,
        minDurationSeconds,
        orientation,
        timeout,
        initialImage,
      );

      // Check if this video ID should be excluded (unlikely with generated content, but keeping interface)
      if (excludeIds.includes(video.id)) {
        // Generate with a slightly modified prompt
        const modifiedPrompt = this.createVideoPrompt(searchTerms, minDurationSeconds, orientation, true);
        return await this._generateVideo(modifiedPrompt, minDurationSeconds, orientation, timeout, initialImage);
      }

      return video;

    } catch (error: unknown) {
      if (
        error instanceof Error &&
        error instanceof DOMException &&
        error.name === "TimeoutError"
      ) {
        if (retryCounter < retryTimes) {
          logger.warn(
            { searchTerms, retryCounter },
            "Timeout error generating video, retrying...",
          );
          return await this.findVideo(
            searchTerms,
            minDurationSeconds,
            excludeIds,
            orientation,
            timeout,
            retryCounter + 1,
          );
        }
        logger.error(
          { searchTerms, retryCounter },
          "Timeout error, retry limit reached",
        );
      }

      logger.error(error, "Error finding video with Veo API");
      throw new Error(`Failed to generate video with Veo API: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private createVideoPrompt(
    searchTerms: string[],
    durationSeconds: number,
    orientation: OrientationEnum,
    variant: boolean = false,
    isImageToVideo: boolean = false
  ): string {
    const baseTerms = searchTerms.join(" ");
    const orientationHint = orientation === OrientationEnum.portrait
      ? "vertical mobile-friendly format"
      : "cinematic widescreen format";

    const variantSuffix = variant ? ", alternative perspective" : "";

    let prompt: string;

    if (isImageToVideo) {
      // For image-to-video: focus on motion, camera movement, and animation
      // The baseTerms should already contain detailed motion instructions from image_prompt
      prompt = `Animate this image with cinematic motion: ${baseTerms}. ` +
        `Add smooth camera movements (slow zoom, pan, or tilt), subtle parallax effects, and dynamic lighting changes. ` +
        `Create ${durationSeconds} seconds of fluid, professional video motion in ${orientationHint}. ` +
        `Maintain high quality, rich details, and engaging composition throughout${variantSuffix}.`;
    } else {
      // For text-to-video: full scene generation
      prompt = `Create a high-quality ${durationSeconds}-second video featuring ${baseTerms}. ` +
        `The video should be in ${orientationHint}, with smooth camera movements and professional lighting. ` +
        `Include rich details, vibrant colors, and engaging composition. ` +
        `Make it suitable for social media content${variantSuffix}.`;
    }

    logger.debug({
      prompt: prompt.substring(0, 200) + "...",
      searchTerms,
      orientation,
      isImageToVideo
    }, "Created Veo prompt");

    return prompt;
  }
}