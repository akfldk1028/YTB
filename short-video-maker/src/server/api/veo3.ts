import express from "express";
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";

import { validateCreateShortInput } from "../validator";
import { ShortCreator } from "../../short-creator";
import { logger } from "../../logger";
import { Config } from "../../config";
import { RawDataParser } from "../parsers/N8NDataParser";

export class VEO3APIRouter {
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
    // Mode 3: NANO BANANA + VEO3 endpoint
    this.router.post(
      "/",
      async (req: ExpressRequest, res: ExpressResponse) => {
        try {
          logger.info("Processing Mode 3: NANO BANANA + VEO3 request");
          
          const processedData = RawDataParser.parseRawData(req.body);
          const callbackUrl = req.body.webhook_url || req.body.callback_url;
          
          // VEO3 mode: force NANO BANANA + VEO3 workflow
          const validationInput = {
            scenes: processedData.scenes.map((scene: any) => ({
              ...scene,
              // Force NANO BANANA + VEO3: enable image generation for all scenes
              needsImageGeneration: true,
              imageData: scene.imageData || {
                prompt: scene.videoPrompt || scene.text,
                style: "cinematic", 
                mood: "dynamic"
              }
            })),
            config: {
              ...processedData.config,
              videoSource: "veo" // Force VEO3 with NANO BANANA
            }
          };
          
          // Force VEO3 priority in metadata
          const metadata = {
            ...processedData.metadata,
            mode: "veo3",
            channel_config: {
              ...processedData.metadata?.channel_config,
              veo3_priority: true // Force VEO3 priority
            }
          };
          
          const input = validateCreateShortInput(validationInput);
          
          const videoId = this.shortCreator.addToQueue(
            input.scenes,
            input.config,
            callbackUrl,
            metadata
          );
          
          logger.info({ videoId, mode: "veo3" }, "NANO BANANA + VEO3 video queued");
          res.status(201).json({ videoId, mode: "veo3" });
          
        } catch (error: unknown) {
          logger.error(error, "Error processing NANO BANANA + VEO3 request");
          res.status(400).json({
            error: error instanceof Error ? error.message : "VEO3 processing failed"
          });
        }
      }
    );

    // Status endpoint for VEO3 videos
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
            mode: "veo3",
            ...detailedStatus
          });
        } catch (error: unknown) {
          logger.error(error, "Error getting VEO3 video status");
          res.status(404).json({
            error: "Video not found or error getting status",
            message: error instanceof Error ? error.message : "Unknown error"
          });
        }
      }
    );
  }
}