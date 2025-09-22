import { logger } from "../../config";
import { ImageGenerationResult, ImageGenerationQuery } from "../types/imagen";

/**
 * Gemini Batch API Service for cost-effective image generation
 * Provides 50% discount compared to synchronous requests
 */
export class GeminiBatchService {
  private apiKey: string;
  private baseUrl = "https://generativelanguage.googleapis.com/v1beta";
  private modelId = "gemini-2.5-flash-image-preview";

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("Google Gemini API key is required for Batch service");
    }
    this.apiKey = apiKey;
  }

  /**
   * Create a batch job for multiple image generation requests
   */
  async createBatchJob(requests: ImageGenerationQuery[]): Promise<{
    batchJobId: string;
    estimatedCompletion: string;
    totalRequests: number;
    estimatedCost: number;
  }> {
    try {
      logger.info({ requestCount: requests.length }, "Creating Gemini batch job for image generation");

      const batchRequests = requests.map((query, index) => ({
        custom_id: `img_${Date.now()}_${index}`,
        method: "POST",
        url: `/v1beta/models/${this.modelId}:generateContent`,
        body: this.buildBatchRequest(query)
      }));

      const batchPayload = {
        requests: batchRequests
      };

      const response = await fetch(`${this.baseUrl}/batches`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify(batchPayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({ status: response.status, errorText }, "Batch job creation failed");
        throw new Error(`Batch job creation failed: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      
      // Estimate completion time (typically 5-30 minutes for image generation)
      const estimatedMinutes = Math.max(5, Math.ceil(requests.length / 10));
      const estimatedCompletion = new Date(Date.now() + estimatedMinutes * 60000).toISOString();
      
      // Calculate estimated cost with 50% batch discount
      const baseImageCost = 0.039; // $0.039 per image at regular price
      const batchImageCost = baseImageCost * 0.5; // 50% discount
      const estimatedCost = requests.length * batchImageCost;

      logger.info({ 
        batchJobId: result.name,
        totalRequests: requests.length,
        estimatedCost,
        estimatedCompletion 
      }, "Batch job created successfully");

      return {
        batchJobId: result.name,
        estimatedCompletion,
        totalRequests: requests.length,
        estimatedCost
      };

    } catch (error) {
      logger.error({ error }, "Failed to create batch job");
      throw error;
    }
  }

  /**
   * Check the status of a batch job
   */
  async getBatchJobStatus(batchJobId: string): Promise<{
    status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
    completedRequests: number;
    totalRequests: number;
    progressPercentage: number;
    estimatedRemainingTime?: string;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/batches/${batchJobId}`, {
        method: "GET",
        headers: {
          "x-goog-api-key": this.apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get batch status: ${response.status}`);
      }

      const result = await response.json();
      
      const totalRequests = result.request_counts?.total || 0;
      const completedRequests = result.request_counts?.completed || 0;
      const progressPercentage = totalRequests > 0 ? (completedRequests / totalRequests) * 100 : 0;

      return {
        status: result.state,
        completedRequests,
        totalRequests,
        progressPercentage,
        estimatedRemainingTime: result.estimated_completion_time
      };

    } catch (error) {
      logger.error({ error, batchJobId }, "Failed to get batch job status");
      throw error;
    }
  }

  /**
   * Retrieve results from a completed batch job
   */
  async getBatchJobResults(batchJobId: string): Promise<ImageGenerationResult[]> {
    try {
      logger.info({ batchJobId }, "Retrieving batch job results");

      const response = await fetch(`${this.baseUrl}/batches/${batchJobId}/results`, {
        method: "GET",
        headers: {
          "x-goog-api-key": this.apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get batch results: ${response.status}`);
      }

      const results = await response.json();
      const imageResults: ImageGenerationResult[] = [];

      for (const result of results.responses) {
        if (result.response && result.response.candidates) {
          const images = [];
          
          for (let candidateIndex = 0; candidateIndex < result.response.candidates.length; candidateIndex++) {
            const candidate = result.response.candidates[candidateIndex];
            if (candidate.content && candidate.content.parts) {
              for (let partIndex = 0; partIndex < candidate.content.parts.length; partIndex++) {
                const part = candidate.content.parts[partIndex];
                if (part.inlineData && part.inlineData.data) {
                  const imageData = Buffer.from(part.inlineData.data, "base64");
                  images.push({
                    data: imageData,
                    filename: `batch-${result.custom_id}-c${candidateIndex}-p${partIndex}.png`,
                    mimeType: part.inlineData.mimeType || "image/png",
                  });
                }
              }
            }
          }

          imageResults.push({
            success: true,
            images,
            customId: result.custom_id
          });
        } else if (result.error) {
          imageResults.push({
            success: false,
            error: result.error.message || "Unknown batch error",
            customId: result.custom_id
          });
        }
      }

      logger.info({ 
        batchJobId, 
        totalResults: imageResults.length,
        successfulResults: imageResults.filter(r => r.success).length
      }, "Batch job results retrieved");

      return imageResults;

    } catch (error) {
      logger.error({ error, batchJobId }, "Failed to retrieve batch job results");
      throw error;
    }
  }

  /**
   * Create reference image set using batch processing for character consistency
   */
  async createReferenceImageSet(
    baseCharacter: string,
    count: number = 12,
    variations = {
      angles: ["front view", "45 degree angle", "side profile", "three-quarter view"],
      expressions: ["neutral expression", "gentle smile", "focused expression", "determined look"],
      compositions: ["upper body shot", "full body shot", "close-up portrait"],
      lighting: ["soft lighting", "dramatic lighting", "natural lighting", "backlit"]
    }
  ): Promise<{
    batchJobId: string;
    estimatedCompletion: string;
    totalRequests: number;
    estimatedCost: number;
    variations: any;
  }> {
    const { angles, expressions, compositions, lighting } = variations;
    const requests: ImageGenerationQuery[] = [];

    for (let i = 0; i < count; i++) {
      // Cycle through variations systematically
      const angle = angles[i % angles.length];
      const expression = expressions[Math.floor(i / angles.length) % expressions.length];
      const composition = compositions[Math.floor(i / (angles.length * expressions.length)) % compositions.length];
      const lightingStyle = lighting[Math.floor(i / (angles.length * expressions.length * compositions.length)) % lighting.length];
      
      // Create consistent character prompt with variation
      const variationPrompt = `${baseCharacter}, ${angle}, ${expression}, ${composition}, ${lightingStyle}, consistent character design, anime style`;
      
      requests.push({
        prompt: variationPrompt,
        numberOfImages: 1,
        aspectRatio: "1:1",
      });
    }

    const batchResult = await this.createBatchJob(requests);

    return {
      ...batchResult,
      variations
    };
  }

  /**
   * Build request for batch API
   */
  private buildBatchRequest(query: ImageGenerationQuery) {
    return {
      contents: [
        {
          parts: [
            {
              text: query.prompt
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 8192,
      }
    };
  }

  /**
   * Convenience method: Create batch job and wait for completion
   */
  async generateImagesAsync(
    requests: ImageGenerationQuery[],
    pollInterval: number = 30000 // 30 seconds
  ): Promise<ImageGenerationResult[]> {
    const { batchJobId } = await this.createBatchJob(requests);
    
    // Poll for completion
    while (true) {
      const status = await this.getBatchJobStatus(batchJobId);
      
      logger.info({ 
        batchJobId, 
        status: status.status, 
        progress: `${status.completedRequests}/${status.totalRequests} (${status.progressPercentage.toFixed(1)}%)` 
      }, "Batch job progress");

      if (status.status === 'COMPLETED') {
        return await this.getBatchJobResults(batchJobId);
      } else if (status.status === 'FAILED' || status.status === 'CANCELLED') {
        throw new Error(`Batch job ${status.status.toLowerCase()}`);
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }
}