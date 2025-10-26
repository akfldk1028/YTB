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

export class NanoBananaAPIRouter {
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
    // Mode 2: NANO BANANA-only endpoint
    this.router.post(
      "/",
      async (req: ExpressRequest, res: ExpressResponse) => {
        try {
          logger.info("Processing Mode 2: NANO BANANA-only request");
          
          const processedData = RawDataParser.parseRawData(req.body);
          const callbackUrl = req.body.webhook_url || req.body.callback_url;
          
          // NANO BANANA mode: force image generation for static videos
          const validationInput = {
            scenes: processedData.scenes.map((scene: any) => ({
              ...scene,
              // Force image generation for NANO BANANA mode
              needsImageGeneration: true,
              imageData: {
                ...(scene.imageData || {}),
                prompt: scene.imageData?.prompt || scene.text,
                style: scene.imageData?.style || "cinematic",
                mood: scene.imageData?.mood || "dynamic",
                // Force single image per scene for static video
                numberOfImages: 1,
                count: 1
              }
            })),
            config: {
              ...processedData.config,
              videoSource: "ffmpeg" // Use ffmpeg for static image videos
            }
          };
          
          const input = validateCreateShortInput(validationInput);
          
          const videoId = this.shortCreator.addToQueue(
            input.scenes,
            input.config,
            callbackUrl,
            { ...processedData.metadata, mode: "nano-banana" }
          );
          
          logger.info({ videoId, mode: "nano-banana" }, "NANO BANANA-only video queued");
          res.status(201).json({ videoId, mode: "nano-banana" });
          
        } catch (error: unknown) {
          logger.error(error, "Error processing NANO BANANA-only request");
          res.status(400).json({
            error: error instanceof Error ? error.message : "NANO BANANA processing failed"
          });
        }
      }
    );

    // Status endpoint for NANO BANANA videos
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
            mode: "nano-banana",
            ...detailedStatus
          });
        } catch (error: unknown) {
          logger.error(error, "Error getting NANO BANANA video status");
          res.status(404).json({
            error: "Video not found or error getting status",
            message: error instanceof Error ? error.message : "Unknown error"
          });
        }
      }
    );

    // NEW: NANO BANANA → VEO3 endpoint (일관성 있는 여러 비디오 생성)
    this.router.post(
      "/to-veo3",
      async (req: ExpressRequest, res: ExpressResponse) => {
        try {
          logger.info("Processing NANO BANANA → VEO3 request");

          const processedData = RawDataParser.parseRawData(req.body);
          const callbackUrl = req.body.webhook_url || req.body.callback_url;

          // NANO BANANA + VEO3 mode: generate images then convert to videos
          const validationInput = {
            scenes: processedData.scenes.map((scene: any) => ({
              ...scene,
              // Enable image generation for consistency
              needsImageGeneration: true,
              imageData: {
                ...(scene.imageData || {}),
                prompt: scene.imageData?.prompt || scene.text,
                style: scene.imageData?.style || "cinematic",
                mood: scene.imageData?.mood || "dynamic",
                numberOfImages: 1,
                count: 1
              }
            })),
            config: {
              ...processedData.config,
              videoSource: "veo" // Use VEO3 for video generation
            }
          };

          const input = validateCreateShortInput(validationInput);

          const videoId = this.shortCreator.addToQueue(
            input.scenes,
            input.config,
            callbackUrl,
            { ...processedData.metadata, mode: "nano-banana-to-veo3" }
          );

          logger.info({ videoId, mode: "nano-banana-to-veo3" }, "NANO BANANA → VEO3 video queued");
          res.status(201).json({
            videoId,
            mode: "nano-banana-to-veo3",
            message: "Video generation started. NANO BANANA will create consistent images, then VEO3 will generate videos."
          });

        } catch (error: unknown) {
          logger.error(error, "Error processing NANO BANANA → VEO3 request");
          res.status(400).json({
            error: error instanceof Error ? error.message : "NANO BANANA → VEO3 processing failed"
          });
        }
      }
    );
  }
}