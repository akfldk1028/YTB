import express from "express";
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";

import { validateCreateShortInput } from "../validator";
import { ShortCreator } from "../../short-creator";
import { logger } from "../../logger";
import { Config } from "../../config";

/**
 * Consistent Shorts API Router
 *
 * This endpoint creates shorts with CHARACTER CONSISTENCY using Nano Banana's
 * reference image feature (inspired by Image_out.ipynb chat mode).
 *
 * Key features:
 * - Maintains the same character across all scenes
 * - Uses previous images as references (max 3)
 * - Optional VEO3 I2V conversion
 * - Perfect for storytelling with consistent characters
 */
export class ConsistentShortsAPIRouter {
  public router: express.Router;
  private shortCreator: ShortCreator;
  private config: Config;

  constructor(config: Config, shortCreator: ShortCreator) {
    this.config = config;
    this.router = express.Router();
    this.shortCreator = shortCreator;

    this.router.use(express.json());
    this.setupRoutes();
  }

  private setupRoutes() {
    /**
     * POST /api/video/consistent-shorts
     *
     * Creates a video with consistent character across all scenes
     *
     * Request Body:
     * {
     *   "character": {
     *     "description": "A young female astronaut with blonde hair...",
     *     "style": "cinematic",
     *     "mood": "adventurous",
     *     "referencePrompts": ["front view", "side view"] // Optional: generate reference set
     *   },
     *   "scenes": [
     *     {
     *       "text": "우주에서 떠다니는 외로운 우주비행사",
     *       "scenePrompt": "Floating in deep space with Earth in background",
     *       "duration": 3
     *     }
     *   ],
     *   "config": {
     *     "orientation": "landscape",
     *     "voice": "am_adam",
     *     "generateVideos": true,  // If true, use VEO3 I2V
     *     "useReferenceSet": false // If true, generate reference images first
     *   },
     *   "webhook_url": "https://your-n8n-webhook.com/callback"
     * }
     */
    this.router.post(
      "/",
      async (req: ExpressRequest, res: ExpressResponse) => {
        try {
          logger.info("Processing CONSISTENT SHORTS request (character consistency mode)");

          const { character, scenes, config, webhook_url, callback_url } = req.body;

          // Validation
          if (!character || !character.description) {
            res.status(400).json({
              error: "Missing character description",
              message: "Please provide character.description for consistent character generation"
            });
            return;
          }

          if (!scenes || !Array.isArray(scenes) || scenes.length === 0) {
            res.status(400).json({
              error: "Missing scenes",
              message: "Please provide at least one scene"
            });
            return;
          }

          const callbackUrl = webhook_url || callback_url;

          // Prepare scenes with character consistency flags
          const processedScenes = scenes.map((scene: any, index: number) => ({
            text: scene.text || scene.scenePrompt || `Scene ${index + 1}`,
            searchTerms: [], // Not used in consistent mode

            // Image generation data with character info
            imageData: {
              prompt: index === 0
                ? character.description // First scene: full character description
                : `${character.description}. ${scene.scenePrompt || scene.text}`, // Subsequent: char + scene
              style: character.style || "cinematic",
              mood: character.mood || "dynamic",
              numberOfImages: 1,

              // Character consistency metadata
              isCharacterConsistent: true,
              characterDescription: character.description,
              sceneIndex: index
            },

            // Video generation (if enabled)
            videoPrompt: scene.scenePrompt || scene.text,

            // Mark as needing image generation
            needsImageGeneration: true
          }));

          const validationInput = {
            scenes: processedScenes,
            config: {
              orientation: config?.orientation || "landscape",
              voice: config?.voice || "am_adam",
              musicVolume: config?.musicVolume || "low",
              subtitlePosition: config?.subtitlePosition || "bottom",

              // IMPORTANT: Always use "ffmpeg" for consistent shorts
              // The ConsistentShortsWorkflow handles NANO BANANA image generation internally
              // and optionally converts to VEO3 if metadata.generateVideos=true
              videoSource: "ffmpeg",

              ...config
            }
          };

          const input = validateCreateShortInput(validationInput);

          logger.info("API endpoint - About to call shortCreator.addToQueue", {
            scenesCount: input.scenes.length,
            mode: "consistent-shorts",
            generateVideos: config?.generateVideos || false
          });

          const videoId = this.shortCreator.addToQueue(
            input.scenes,
            input.config,
            callbackUrl,
            {
              mode: "consistent-shorts",
              characterDescription: character.description,
              characterStyle: character.style,
              useReferenceSet: config?.useReferenceSet || false,
              generateVideos: config?.generateVideos || false,
              youtubeUpload: req.body.youtubeUpload
            }
          );

          logger.info("API endpoint - shortCreator.addToQueue returned", {
            videoId
          });

          logger.info({
            videoId,
            mode: "consistent-shorts",
            sceneCount: scenes.length,
            generateVideos: config?.generateVideos || false
          }, "✨ CONSISTENT SHORTS video queued");

          res.status(201).json({
            videoId,
            mode: "consistent-shorts",
            sceneCount: scenes.length,
            characterDescription: character.description,
            generateVideos: config?.generateVideos || false,
            message: "Consistent character video generation started. All scenes will feature the same character."
          });

        } catch (error: unknown) {
          logger.error(error, "Error processing CONSISTENT SHORTS request");
          res.status(400).json({
            error: error instanceof Error ? error.message : "Consistent shorts processing failed"
          });
        }
      }
    );

    /**
     * GET /api/video/consistent-shorts/:videoId/status
     *
     * Get status of consistent shorts video generation
     */
    this.router.get(
      "/:videoId/status",
      async (req: ExpressRequest, res: ExpressResponse) => {
        const { videoId } = req.params;

        if (!videoId) {
          res.status(400).json({
            error: "videoId is required",
          });
          return;
        }

        try {
          const status = this.shortCreator.status(videoId);
          const detailedStatus = this.shortCreator.getDetailedStatus(videoId);

          res.status(200).json({
            status,
            mode: "consistent-shorts",
            ...detailedStatus
          });
        } catch (error: unknown) {
          logger.error(error, "Error getting CONSISTENT SHORTS video status");
          res.status(404).json({
            error: "Video not found or error getting status",
            message: error instanceof Error ? error.message : "Unknown error"
          });
        }
      }
    );

    /**
     * POST /api/video/consistent-shorts/reference-set
     *
     * Generate a reference image set for character consistency
     * (Similar to Image_out.ipynb but server-side)
     *
     * Request Body:
     * {
     *   "character": {
     *     "description": "A young female astronaut...",
     *     "style": "cinematic"
     *   },
     *   "variations": {
     *     "angles": ["front view", "45 degree", "side profile"],
     *     "expressions": ["neutral", "smile", "focused"],
     *     "compositions": ["upper body", "full body"]
     *   },
     *   "count": 12
     * }
     */
    this.router.post(
      "/reference-set",
      async (req: ExpressRequest, res: ExpressResponse) => {
        try {
          logger.info("Processing REFERENCE SET generation request");

          const { character, variations, count = 12 } = req.body;

          if (!character || !character.description) {
            res.status(400).json({
              error: "Missing character description"
            });
            return;
          }

          // Forward to image generation service
          const imageGenResponse = await fetch(
            `http://localhost:${this.config.port}/api/images/generate-reference-set`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                baseCharacter: character.description,
                count,
                variations: variations || {
                  angles: ["front view", "45 degree angle", "side profile", "three-quarter view"],
                  expressions: ["neutral expression", "gentle smile", "focused expression"],
                  compositions: ["upper body shot", "full body shot"],
                  lighting: ["soft lighting", "dramatic lighting", "natural lighting"]
                }
              })
            }
          );

          const result = await imageGenResponse.json();

          if (!imageGenResponse.ok) {
            res.status(500).json({
              error: "Reference set generation failed",
              details: result
            });
            return;
          }

          res.json({
            success: true,
            characterDescription: character.description,
            ...result
          });

        } catch (error: unknown) {
          logger.error(error, "Error generating reference set");
          res.status(500).json({
            error: error instanceof Error ? error.message : "Reference set generation failed"
          });
        }
      }
    );
  }
}
