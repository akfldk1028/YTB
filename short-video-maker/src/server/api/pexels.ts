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

export class PexelsAPIRouter {
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
    // Mode 1: PEXELS-only endpoint
    this.router.post(
      "/",
      async (req: ExpressRequest, res: ExpressResponse) => {
        try {
          logger.info("Processing Mode 1: PEXELS-only request");
          
          const processedData = RawDataParser.parseRawData(req.body);
          const callbackUrl = req.body.webhook_url || req.body.callback_url;
          
          // Force PEXELS mode: ignore VEO3 fields, use only PEXELS
          const validationInput = {
            scenes: processedData.scenes.map((scene: any) => ({
              ...scene,
              // Remove VEO3-specific fields to force PEXELS usage
              needsImageGeneration: false,
              imageData: undefined,
              videoPrompt: undefined
            })),
            config: {
              ...processedData.config,
              videoSource: "pexels" // Force PEXELS only
            }
          };
          
          const input = validateCreateShortInput(validationInput);
          
          const videoId = this.shortCreator.addToQueue(
            input.scenes,
            input.config,
            callbackUrl,
            { ...processedData.metadata, mode: "pexels" }
          );
          
          logger.info({ videoId, mode: "pexels" }, "PEXELS-only video queued");
          res.status(201).json({ videoId, mode: "pexels" });
          
        } catch (error: unknown) {
          logger.error(error, "Error processing PEXELS-only request");
          res.status(400).json({
            error: error instanceof Error ? error.message : "PEXELS processing failed"
          });
        }
      }
    );

    // Status endpoint for PEXELS videos
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
            mode: "pexels",
            ...detailedStatus
          });
        } catch (error: unknown) {
          logger.error(error, "Error getting PEXELS video status");
          res.status(404).json({
            error: "Video not found or error getting status",
            message: error instanceof Error ? error.message : "Unknown error"
          });
        }
      }
    );
  }
}