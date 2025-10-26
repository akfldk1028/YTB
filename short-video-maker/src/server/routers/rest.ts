import express from "express";
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";
import fs from "fs-extra";
import path from "path";

import { validateCreateShortInput } from "../validator";
import { ShortCreator } from "../../short-creator";
import { logger } from "../../logger";
import { Config } from "../../config";
import { RawDataParser } from "../parsers/N8NDataParser";

export class APIRouter {
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
    // Mode 1: PEXELS endpoint
    this.router.post(
      "/video/pexels",
      async (req: ExpressRequest, res: ExpressResponse) => {
        try {
          logger.info("Mode 1: PEXELS video request");
          const processedData = RawDataParser.parseRawData(req.body);

          // Force PEXELS mode
          processedData.config.videoSource = "pexels";

          const validationInput = {
            scenes: processedData.scenes,
            config: processedData.config
          };

          const input = validateCreateShortInput(validationInput);

          // Extract YouTube upload config from request body or parsed data
          const youtubeUpload = req.body.youtubeUpload || processedData.metadata?.youtubeUpload;

          const videoId = this.shortCreator.addToQueue(
            input.scenes,
            input.config,
            req.body.webhook_url || req.body.callback_url,
            { ...processedData.metadata, mode: "pexels", youtubeUpload }
          );

          res.status(201).json({ videoId });
        } catch (error: unknown) {
          logger.error(error, "Error in PEXELS mode");
          res.status(400).json({
            error: error instanceof Error ? error.message : "PEXELS mode failed"
          });
        }
      }
    );

    // Mode 2: NANO BANANA (FFmpeg static video) endpoint
    this.router.post(
      "/video/nano-banana",
      async (req: ExpressRequest, res: ExpressResponse) => {
        try {
          logger.info("Mode 2: NANO BANANA (FFmpeg) video request");
          const processedData = RawDataParser.parseRawData(req.body);

          // Force NANO BANANA + FFmpeg mode
          processedData.config.videoSource = "ffmpeg";
          processedData.config.imageModel = "nano-banana";

          // Ensure needsImageGeneration is set for all scenes
          processedData.scenes = processedData.scenes.map((scene: any, index: number) => ({
            ...scene,
            needsImageGeneration: true,
            imageData: scene.imageData || {
              prompt: `${scene.text} [scene_${index}]`, // Add scene index for unique cache keys
              style: "cinematic",
              mood: "dynamic"
            }
          }));

          const validationInput = {
            scenes: processedData.scenes,
            config: processedData.config
          };

          const input = validateCreateShortInput(validationInput);

          // Extract YouTube upload config
          const youtubeUpload = req.body.youtubeUpload || processedData.metadata?.youtubeUpload;

          const videoId = this.shortCreator.addToQueue(
            input.scenes,
            input.config,
            req.body.webhook_url || req.body.callback_url,
            { ...processedData.metadata, mode: "nano-banana", youtubeUpload }
          );

          res.status(201).json({ videoId });
        } catch (error: unknown) {
          logger.error(error, "Error in NANO BANANA mode");
          res.status(400).json({
            error: error instanceof Error ? error.message : "NANO BANANA mode failed"
          });
        }
      }
    );

    // Mode 3: VEO3 (NANO BANANA → VEO3) endpoint
    this.router.post(
      "/video/veo3",
      async (req: ExpressRequest, res: ExpressResponse) => {
        try {
          logger.info("Mode 3: VEO3 (NANO BANANA → VEO3) video request");
          const processedData = RawDataParser.parseRawData(req.body);

          // Force VEO3 mode with NANO BANANA workflow
          processedData.config.videoSource = "veo";
          processedData.config.imageModel = "nano-banana";

          // Ensure needsImageGeneration is set for all scenes
          processedData.scenes = processedData.scenes.map((scene: any, index: number) => ({
            ...scene,
            needsImageGeneration: true,
            imageData: scene.imageData || {
              prompt: `${scene.text} [scene_${index}]`, // Add scene index for unique cache keys
              style: "cinematic",
              mood: "dynamic"
            },
            videoPrompt: scene.videoPrompt || scene.text
          }));

          const validationInput = {
            scenes: processedData.scenes,
            config: processedData.config
          };

          const input = validateCreateShortInput(validationInput);

          // Extract YouTube upload config
          const youtubeUpload = req.body.youtubeUpload || processedData.metadata?.youtubeUpload;

          const videoId = this.shortCreator.addToQueue(
            input.scenes,
            input.config,
            req.body.webhook_url || req.body.callback_url,
            { ...processedData.metadata, mode: "veo3", veo3_priority: true, youtubeUpload }
          );

          res.status(201).json({ videoId });
        } catch (error: unknown) {
          logger.error(error, "Error in VEO3 mode");
          res.status(400).json({
            error: error instanceof Error ? error.message : "VEO3 mode failed"
          });
        }
      }
    );

    // Mode 4: GPT Image (FFmpeg static video) endpoint
    this.router.post(
      "/video/gpt-image",
      async (req: ExpressRequest, res: ExpressResponse) => {
        try {
          logger.info("Mode 4: GPT Image (FFmpeg) video request");
          const processedData = RawDataParser.parseRawData(req.body);

          // Force GPT Image + FFmpeg mode
          processedData.config.videoSource = "ffmpeg";
          processedData.config.imageModel = "gpt-image";

          // Ensure needsImageGeneration is set for all scenes
          processedData.scenes = processedData.scenes.map((scene: any, index: number) => ({
            ...scene,
            needsImageGeneration: true,
            imageData: scene.imageData || {
              prompt: `${scene.text} [scene_${index}]`, // Add scene index for unique cache keys
              style: "cinematic",
              mood: "dynamic"
            }
          }));

          const validationInput = {
            scenes: processedData.scenes,
            config: processedData.config
          };

          const input = validateCreateShortInput(validationInput);

          // Extract YouTube upload config
          const youtubeUpload = req.body.youtubeUpload || processedData.metadata?.youtubeUpload;

          const videoId = this.shortCreator.addToQueue(
            input.scenes,
            input.config,
            req.body.webhook_url || req.body.callback_url,
            { ...processedData.metadata, mode: "gpt-image", youtubeUpload }
          );

          res.status(201).json({ videoId });
        } catch (error: unknown) {
          logger.error(error, "Error in GPT Image mode");
          res.status(400).json({
            error: error instanceof Error ? error.message : "GPT Image mode failed"
          });
        }
      }
    );

    // Mode 5: VEO3 with GPT Image (GPT Image → VEO3) endpoint
    this.router.post(
      "/video/veo3-gpt",
      async (req: ExpressRequest, res: ExpressResponse) => {
        try {
          logger.info("Mode 5: VEO3 with GPT Image (GPT Image → VEO3) video request");
          const processedData = RawDataParser.parseRawData(req.body);

          // Force VEO3 mode with GPT Image
          processedData.config.videoSource = "veo";
          processedData.config.imageModel = "gpt-image";

          // Ensure needsImageGeneration is set for all scenes
          processedData.scenes = processedData.scenes.map((scene: any, index: number) => ({
            ...scene,
            needsImageGeneration: true,
            imageData: scene.imageData || {
              prompt: `${scene.text} [scene_${index}]`,
              style: "cinematic",
              mood: "dynamic"
            },
            videoPrompt: scene.videoPrompt || scene.text
          }));

          const validationInput = {
            scenes: processedData.scenes,
            config: processedData.config
          };

          const input = validateCreateShortInput(validationInput);

          // Extract YouTube upload config
          const youtubeUpload = req.body.youtubeUpload || processedData.metadata?.youtubeUpload;

          const videoId = this.shortCreator.addToQueue(
            input.scenes,
            input.config,
            req.body.webhook_url || req.body.callback_url,
            { ...processedData.metadata, mode: "veo3-gpt", veo3_priority: true, youtubeUpload }
          );

          res.status(201).json({ videoId });
        } catch (error: unknown) {
          logger.error(error, "Error in VEO3 with GPT Image mode");
          res.status(400).json({
            error: error instanceof Error ? error.message : "VEO3 with GPT Image mode failed"
          });
        }
      }
    );

    // Status endpoints for each mode
    this.router.get(
      "/video/:mode/:videoId/status",
      async (req: ExpressRequest, res: ExpressResponse) => {
        const { mode, videoId } = req.params;
        if (!videoId) {
          res.status(400).json({ error: "videoId is required" });
          return;
        }
        
        try {
          const status = this.shortCreator.status(videoId);
          const detailedStatus = this.shortCreator.getDetailedStatus(videoId);
          
          res.status(200).json({
            mode,
            status,
            ...detailedStatus
          });
        } catch (error: unknown) {
          logger.error(error, `Error getting ${mode} video status`);
          res.status(404).json({
            error: "Video not found",
            message: error instanceof Error ? error.message : "Unknown error"
          });
        }
      }
    );

    // Image-to-video generation endpoint
    this.router.post(
      "/create-video-from-image",
      async (req: ExpressRequest, res: ExpressResponse) => {
        try {
          logger.info("Received image-to-video request");
          
          const { prompt, imageBase64, mimeType, orientation = "portrait" } = req.body;
          
          if (!prompt || !imageBase64) {
            return res.status(400).json({ error: "prompt and imageBase64 are required" });
          }
          
          // Create scene data for image-to-video
          const sceneData = {
            text: prompt,
            searchTerms: prompt.split(" ").slice(0, 5), // Use first 5 words as search terms
            imageData: {
              data: imageBase64,
              mimeType: mimeType || "image/jpeg"
            }
          };
          
          const input = {
            scenes: [sceneData],
            config: { orientation }
          };
          
          const videoId = this.shortCreator.addToQueue(
            input.scenes,
            input.config,
            req.body.webhook_url || req.body.callback_url
          );
          
          logger.info({ videoId }, "Image-to-video request queued");
          res.json({ videoId });
          
        } catch (error: unknown) {
          logger.error(error, "Error processing image-to-video request");
          res.status(500).json({ error: (error as Error).message });
        }
      }
    );

    // Raw 데이터 엔드포인트 - 모든 타입 받음
    this.router.post(
      "/create-video",
      async (req: ExpressRequest, res: ExpressResponse) => {
        try {
          logger.info("Received raw data");
          
          const processedData = RawDataParser.parseRawData(req.body);
          
          // N8N callback webhook URL 추출 (있으면)
          const callbackUrl = req.body.webhook_url || req.body.callback_url;
          
          // ParsedVideoData에서 scenes와 config만 추출해서 validation
          const validationInput = {
            scenes: processedData.scenes,
            config: processedData.config
          };
          
          const input = validateCreateShortInput(validationInput);
          
          const videoId = this.shortCreator.addToQueue(
            input.scenes, 
            input.config, 
            callbackUrl, 
            processedData.metadata
          );
          
          res.status(201).json({ videoId });
        } catch (error: unknown) {
          logger.error(error, "Error processing raw data");
          res.status(400).json({
            error: error instanceof Error ? error.message : "Processing failed"
          });
        }
      },
    );

    // Batch image-to-video generation endpoint
    this.router.post(
      "/create-video-from-images",
      async (req: ExpressRequest, res: ExpressResponse) => {
        try {
          logger.info("Received batch image-to-video request");
          
          const { images, narrativeTexts, config } = req.body;
          
          // Input validation
          if (!images || !Array.isArray(images) || images.length === 0) {
            return res.status(400).json({ 
              error: "images array is required and must not be empty" 
            });
          }
          
          if (!narrativeTexts || !Array.isArray(narrativeTexts) || narrativeTexts.length !== images.length) {
            return res.status(400).json({ 
              error: "narrativeTexts array is required and must match images length" 
            });
          }
          
          // Validate each image
          for (let i = 0; i < images.length; i++) {
            const image = images[i];
            if (!image.imageBase64 || !image.prompt) {
              return res.status(400).json({ 
                error: `Image ${i + 1} missing imageBase64 or prompt` 
              });
            }
          }
          
          // Create scenes data for batch processing
          const scenes = images.map((image: any, index: number) => ({
            text: narrativeTexts[index],
            searchTerms: image.prompt.split(" ").slice(0, 5),
            imageData: {
              data: image.imageBase64,
              mimeType: image.mimeType || "image/png"
            },
            videoPrompt: image.prompt
          }));
          
          const input = {
            scenes,
            config: {
              orientation: config?.orientation || "landscape",
              voice: config?.voice || "am_adam",
              musicVolume: config?.musicVolume || "low",
              subtitlePosition: config?.subtitlePosition || "bottom",
              ...config
            }
          };
          
          const videoId = this.shortCreator.addToQueue(
            input.scenes,
            input.config,
            req.body.webhook_url || req.body.callback_url
          );
          
          logger.info({ videoId, imageCount: images.length }, "Batch image-to-video request queued");
          res.status(201).json({ videoId });
          
        } catch (error: unknown) {
          logger.error(error, "Error processing batch image-to-video request");
          res.status(500).json({ 
            error: error instanceof Error ? error.message : "Batch processing failed" 
          });
        }
      }
    );

    // 기존 엔드포인트 유지 (하위 호환성) - N8N raw 데이터도 지원
    this.router.post(
      "/short-video",
      async (req: ExpressRequest, res: ExpressResponse) => {
        try {
          logger.info("Processing request (legacy endpoint)");
          
          // N8N raw 데이터인지 확인하고 파싱 시도
          let processedData;
          let metadata;
          let callbackUrl;
          
          try {
            console.log('🔍 N8N RAW DATA received:', JSON.stringify(req.body, null, 2));
            const rawParseResult = RawDataParser.parseRawData(req.body);
            // ParsedVideoData에서 scenes와 config만 추출해서 validation
            processedData = {
              scenes: rawParseResult.scenes,
              config: rawParseResult.config
            };
            metadata = rawParseResult.metadata;
            callbackUrl = req.body.webhook_url || req.body.callback_url;
          } catch (parseError: unknown) {
            console.log('❌ N8N parsing failed:', parseError instanceof Error ? parseError.message : 'Unknown error');
            // 파싱 실패시 기존 방식으로 처리
            processedData = req.body;
            callbackUrl = req.body.webhook_url || req.body.callback_url;
          }
          
          const input = validateCreateShortInput(processedData);
          logger.info({ input }, "Creating short video");

          const videoId = this.shortCreator.addToQueue(
            input.scenes,
            input.config,
            callbackUrl,
            metadata
          );

          res.status(201).json({
            videoId,
          });
        } catch (error: unknown) {
          logger.error(error, "Error validating input");

          if (error instanceof Error && error.message.startsWith("{")) {
            try {
              const errorData = JSON.parse(error.message);
              res.status(400).json({
                error: "Validation failed",
                message: errorData.message,
                missingFields: errorData.missingFields,
              });
              return;
            } catch (parseError: unknown) {
              logger.error(parseError, "Error parsing validation error");
            }
          }

          res.status(400).json({
            error: "Invalid input",
            message: error instanceof Error ? error.message : "Unknown error",
          });
        }
      },
    );

    this.router.get(
      "/short-video/:videoId/status",
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
            ...detailedStatus
          });
        } catch (error: unknown) {
          logger.error(error, "Error getting video status");
          res.status(404).json({
            error: "Video not found or error getting status",
            message: error instanceof Error ? error.message : "Unknown error"
          });
        }
      },
    );

    this.router.get(
      "/music-tags",
      (req: ExpressRequest, res: ExpressResponse) => {
        res.status(200).json(this.shortCreator.ListAvailableMusicTags());
      },
    );

    this.router.get("/voices", (req: ExpressRequest, res: ExpressResponse) => {
      res.status(200).json(this.shortCreator.ListAvailableVoices());
    });

    this.router.get(
      "/short-videos",
      (req: ExpressRequest, res: ExpressResponse) => {
        const videos = this.shortCreator.listAllVideos();
        res.status(200).json({
          videos,
        });
      },
    );

    this.router.delete(
      "/short-video/:videoId",
      (req: ExpressRequest, res: ExpressResponse) => {
        const { videoId } = req.params;
        if (!videoId) {
          res.status(400).json({
            error: "videoId is required",
          });
          return;
        }
        this.shortCreator.deleteVideo(videoId);
        res.status(200).json({
          success: true,
        });
      },
    );

    this.router.get(
      "/tmp/:tmpFile",
      (req: ExpressRequest, res: ExpressResponse) => {
        const { tmpFile } = req.params;
        if (!tmpFile) {
          res.status(400).json({
            error: "tmpFile is required",
          });
          return;
        }
        const tmpFilePath = path.join(this.config.tempDirPath, tmpFile);
        if (!fs.existsSync(tmpFilePath)) {
          res.status(404).json({
            error: "tmpFile not found",
          });
          return;
        }

        if (tmpFile.endsWith(".mp3")) {
          res.setHeader("Content-Type", "audio/mpeg");
        }
        if (tmpFile.endsWith(".wav")) {
          res.setHeader("Content-Type", "audio/wav");
        }
        if (tmpFile.endsWith(".mp4")) {
          res.setHeader("Content-Type", "video/mp4");
        }

        const tmpFileStream = fs.createReadStream(tmpFilePath);
        tmpFileStream.on("error", (error) => {
          logger.error(error, "Error reading tmp file");
          res.status(500).json({
            error: "Error reading tmp file",
            tmpFile,
          });
        });
        tmpFileStream.pipe(res);
      },
    );

    this.router.get(
      "/music/:fileName",
      (req: ExpressRequest, res: ExpressResponse) => {
        const { fileName } = req.params;
        if (!fileName) {
          res.status(400).json({
            error: "fileName is required",
          });
          return;
        }
        const musicFilePath = path.join(this.config.musicDirPath, fileName);
        if (!fs.existsSync(musicFilePath)) {
          res.status(404).json({
            error: "music file not found",
          });
          return;
        }
        const musicFileStream = fs.createReadStream(musicFilePath);
        musicFileStream.on("error", (error) => {
          logger.error(error, "Error reading music file");
          res.status(500).json({
            error: "Error reading music file",
            fileName,
          });
        });
        musicFileStream.pipe(res);
      },
    );

    this.router.get(
      "/short-video/:videoId",
      (req: ExpressRequest, res: ExpressResponse) => {
        try {
          const { videoId } = req.params;
          if (!videoId) {
            res.status(400).json({
              error: "videoId is required",
            });
            return;
          }
          const video = this.shortCreator.getVideo(videoId);
          res.setHeader("Content-Type", "video/mp4");
          res.setHeader(
            "Content-Disposition",
            `inline; filename=${videoId}.mp4`,
          );
          res.send(video);
        } catch (error: unknown) {
          logger.error(error, "Error getting video");
          res.status(404).json({
            error: "Video not found",
          });
        }
      },
    );
  }
}