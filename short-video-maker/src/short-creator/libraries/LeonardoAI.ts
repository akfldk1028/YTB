/* eslint-disable @remotion/deterministic-randomness */
import { getOrientationConfig } from "../../components/utils";
import { logger } from "../../logger";
import { OrientationEnum, type Video } from "../../types/shorts";

const defaultTimeoutMs = 60000; // Leonardo takes time to generate
const retryTimes = 3;
const maxGenerationTimeMs = 180000; // 3 minutes max wait
const pollIntervalMs = 5000; // Check every 5 seconds

export class LeonardoAI {
  private baseURL = "https://cloud.leonardo.ai/api/rest/v1";
  
  constructor(private API_KEY: string) {}

  private async _generateVideo(
    prompt: string,
    minDurationSeconds: number,
    orientation: OrientationEnum,
    timeout: number = defaultTimeoutMs,
  ): Promise<Video> {
    if (!this.API_KEY) {
      throw new Error("Leonardo.AI API key not set");
    }
    
    logger.debug(
      { prompt, minDurationSeconds, orientation },
      "Generating video with Leonardo.AI API",
    );

    const { width: requiredVideoWidth, height: requiredVideoHeight } =
      getOrientationConfig(orientation);
    
    // Use 720p for better quality, fall back to 480p if needed
    const resolution = "RESOLUTION_720";
    const duration = Math.max(minDurationSeconds, 5); // Minimum 5 seconds

    const headers = new Headers();
    headers.append("Authorization", `Bearer ${this.API_KEY}`);
    headers.append("Content-Type", "application/json");

    // Leonardo.AI Text-to-Video endpoint
    const endpoint = `${this.baseURL}/generations-text-to-video`;
    
    const requestBody = {
      prompt: prompt,
      height: requiredVideoHeight,
      width: requiredVideoWidth,
      resolution: resolution,
      frameInterpolation: true, // Enable smooth video
      isPublic: false, // Keep private
      promptEnhance: true, // Improve prompt automatically
      // Note: Leonardo doesn't support custom duration in API yet
      // Videos are typically 5 seconds
    };

    logger.debug({ requestBody }, "Sending request to Leonardo.AI API");

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(timeout),
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error(
            "Invalid Leonardo.AI API key - please check your API key and subscription"
          );
        }
        if (response.status === 402) {
          throw new Error(
            "Insufficient Leonardo.AI API credits - please top up your account"
          );
        }
        if (response.status === 429) {
          throw new Error(
            "Leonardo.AI rate limit exceeded - please wait and try again"
          );
        }
        const errorText = await response.text();
        throw new Error(`Leonardo.AI API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();
      logger.debug({ result }, "Received response from Leonardo.AI API");

      // Leonardo returns a generation ID that we need to poll
      if (!result.sdGenerationJob || !result.sdGenerationJob.generationId) {
        throw new Error("No generation ID received from Leonardo.AI API");
      }

      const generationId = result.sdGenerationJob.generationId;
      logger.debug({ generationId }, "Leonardo.AI video generation started");

      // Poll for completion
      const videoUrl = await this.pollForCompletion(generationId, maxGenerationTimeMs);

      const video: Video = {
        id: `leonardo-${generationId}`,
        url: videoUrl,
        width: requiredVideoWidth,
        height: requiredVideoHeight,
      };

      logger.debug(
        { prompt, video, minDurationSeconds, orientation },
        "Generated video with Leonardo.AI API",
      );

      return video;

    } catch (error: unknown) {
      logger.error(error, "Error generating video with Leonardo.AI API");
      throw error;
    }
  }

  private async pollForCompletion(generationId: string, maxWaitTime: number): Promise<string> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      try {
        const statusResponse = await fetch(`${this.baseURL}/generations/${generationId}`, {
          headers: {
            "Authorization": `Bearer ${this.API_KEY}`,
            "Content-Type": "application/json",
          },
        });

        if (!statusResponse.ok) {
          throw new Error(`Failed to check generation status: ${statusResponse.status}`);
        }

        const statusResult = await statusResponse.json();
        logger.debug({ generationId, status: statusResult }, "Checking Leonardo.AI generation status");

        if (statusResult.generations_by_pk && statusResult.generations_by_pk.status === "COMPLETE") {
          const generation = statusResult.generations_by_pk;
          
          // Look for video in generated_videos array
          if (generation.generated_videos && generation.generated_videos.length > 0) {
            const videoUrl = generation.generated_videos[0].url;
            if (videoUrl) {
              logger.debug({ generationId, videoUrl }, "Leonardo.AI video generation completed");
              return videoUrl;
            }
          }
          
          throw new Error("Video generation completed but no video URL found");
        }

        if (statusResult.generations_by_pk && statusResult.generations_by_pk.status === "FAILED") {
          throw new Error("Leonardo.AI video generation failed");
        }

        // Still processing, wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));

      } catch (error) {
        logger.warn({ error, generationId }, "Error polling Leonardo.AI status");
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      }
    }

    throw new Error("Leonardo.AI video generation timed out");
  }

  async findVideo(
    searchTerms: string[],
    minDurationSeconds: number,
    excludeIds: string[] = [],
    orientation: OrientationEnum = OrientationEnum.portrait,
    timeout: number = defaultTimeoutMs,
    retryCounter: number = 0,
  ): Promise<Video> {
    // Create a detailed prompt from search terms
    const prompt = this.createVideoPrompt(searchTerms, minDurationSeconds, orientation);
    
    try {
      const video = await this._generateVideo(
        prompt,
        minDurationSeconds,
        orientation,
        timeout,
      );

      // Check if this video ID should be excluded (unlikely with generated content, but keeping interface)
      if (excludeIds.includes(video.id)) {
        // Generate with a slightly modified prompt
        const modifiedPrompt = this.createVideoPrompt(searchTerms, minDurationSeconds, orientation, true);
        return await this._generateVideo(modifiedPrompt, minDurationSeconds, orientation, timeout);
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

      logger.error(error, "Error finding video with Leonardo.AI API");
      throw new Error(`Failed to generate video with Leonardo.AI API: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private createVideoPrompt(
    searchTerms: string[], 
    durationSeconds: number, 
    orientation: OrientationEnum,
    variant: boolean = false
  ): string {
    const baseTerms = searchTerms.join(" ");
    const orientationHint = orientation === OrientationEnum.portrait 
      ? "vertical mobile format" 
      : "cinematic horizontal format";
    
    const variantSuffix = variant ? ", different angle" : "";
    
    // Create a detailed prompt optimized for Leonardo.AI Motion 2.0
    const prompt = `High-quality cinematic video featuring ${baseTerms}. ` +
      `Shot in ${orientationHint} with smooth camera movements, professional lighting, and vibrant colors. ` +
      `Dynamic motion with realistic physics, engaging composition, and visual appeal. ` +
      `Perfect for social media content${variantSuffix}.`;
    
    logger.debug({ prompt, searchTerms, orientation }, "Created Leonardo.AI prompt");
    
    return prompt;
  }
}