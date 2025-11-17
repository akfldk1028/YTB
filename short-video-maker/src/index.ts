/* eslint-disable @typescript-eslint/no-unused-vars */
import path from "path";
import fs from "fs-extra";

import { GoogleTTS } from "./short-creator/libraries/google-tts";
import { ElevenLabsTTS } from "./short-creator/libraries/elevenlabs-tts";
import { TTSProvider } from "./short-creator/libraries/TTSProvider";
import { Whisper } from "./short-creator/libraries/Whisper";
import { FFMpeg } from "./short-creator/libraries/FFmpeg";
import { PexelsAPI } from "./short-creator/libraries/Pexels";
import { GoogleVeoAPI } from "./short-creator/libraries/GoogleVeo";
import { LeonardoAI } from "./short-creator/libraries/LeonardoAI";
import { ImageGenerationService } from "./image-generation/services/ImageGenerationService";
import { ImageModelType } from "./image-generation/models/imageModels";
import { GoogleCloudStorageService } from "./storage/GoogleCloudStorageService";
import { YouTubeUploader } from "./youtube-upload/services/YouTubeUploader";
import { Config } from "./config";
import { ShortCreator } from "./short-creator";
import { logger } from "./logger";
import { Server } from "./server/server";
import { MusicManager } from "./short-creator/music";

async function main() {
  const config = new Config();
  try {
    config.ensureConfig();
  } catch (err: unknown) {
    logger.error(err, "Error in config");
    process.exit(1);
  }

  // Cloud Run: Write YouTube secrets from environment variables to files
  if (process.env.DOCKER === "true") {
    try {
      // 1. Write YouTube client secret
      if (process.env.YOUTUBE_CLIENT_SECRET && !fs.existsSync(config.youtubeClientSecretPath)) {
        logger.debug("Writing YouTube client secret from environment variable to file");
        fs.ensureDirSync(path.dirname(config.youtubeClientSecretPath));
        fs.writeFileSync(config.youtubeClientSecretPath, process.env.YOUTUBE_CLIENT_SECRET);
        logger.info({ path: config.youtubeClientSecretPath }, "YouTube client secret written");
      }

      // 2. Extract YouTube data archive (channels.json + tokens-*.json)
      if (process.env.YOUTUBE_DATA) {
        const youtubeChannelsPath = path.join(config.dataDirPath, "youtube-channels.json");
        if (!fs.existsSync(youtubeChannelsPath)) {
          logger.debug("Extracting YouTube data archive");
          const { execSync } = require("child_process");
          const tarPath = "/tmp/youtube-data.tar.gz";

          // Write tar.gz to temp file
          fs.writeFileSync(tarPath, Buffer.from(process.env.YOUTUBE_DATA, "base64"));

          // Extract to data directory
          fs.ensureDirSync(config.dataDirPath);
          execSync(`tar xzf ${tarPath} -C ${config.dataDirPath}`);

          logger.info({ path: config.dataDirPath }, "YouTube data extracted from archive");

          // Clean up
          fs.unlinkSync(tarPath);
        }
      }
    } catch (err: unknown) {
      logger.warn(err, "Error writing YouTube secrets to files, YouTube upload may not work");
    }
  }

  const musicManager = new MusicManager(config);
  try {
    logger.debug("checking music files");
    musicManager.ensureMusicFilesExist();
  } catch (error: unknown) {
    logger.error(error, "Missing music files");
    process.exit(1);
  }

  
  // Initialize TTS provider with automatic fallback support
  logger.debug(`initializing ${config.ttsProvider} tts with fallback support`);
  
  const ttsConfigs = {
    elevenLabsConfig: config.elevenLabsApiKey ? { apiKey: config.elevenLabsApiKey } : undefined,
    googleTtsConfig: config.googleTtsProjectId ? {
      projectId: config.googleTtsProjectId,
      keyFilename: config.googleTtsApiKey
    } : undefined,
    kokoroConfig: { kokoroModelPrecision: config.kokoroModelPrecision }
  };
  
  const ttsProvider = await TTSProvider.createWithFallback(config.ttsProvider, ttsConfigs);
  
  logger.debug("initializing whisper");
  const whisper = await Whisper.init(config);
  logger.debug("initializing ffmpeg");
  const ffmpeg = await FFMpeg.init();
  const pexelsApi = new PexelsAPI(config.pexelsApiKey);
  
  // Initialize Veo API if configured
  let veoApi: GoogleVeoAPI | null = null;
  if (config.videoSource === "veo" || config.videoSource === "both") {
    if (config.googleGeminiApiKey) {
      logger.debug("initializing google veo api via gemini");
      veoApi = new GoogleVeoAPI(
        config.googleGeminiApiKey,
        config.googleCloudProjectId || "unused", // Not needed for Gemini API but kept for interface compatibility
        config.googleCloudRegion,
        config.veoModel
      );
    } else {
      logger.warn("Gemini API key not configured, but VIDEO_SOURCE includes 'veo'");
    }
  }

  // Initialize Leonardo.AI API if configured
  let leonardoApi: LeonardoAI | null = null;
  if (config.videoSource === "leonardo" || config.videoSource === "both") {
    if (config.leonardoApiKey) {
      logger.debug("initializing leonardo ai api");
      leonardoApi = new LeonardoAI(config.leonardoApiKey);
    } else {
      logger.warn("Leonardo.AI API key not configured, but VIDEO_SOURCE includes 'leonardo'");
    }
  }

  // Initialize Image Generation service (includes NANO BANANA) if Gemini API key is available
  let imageGenerationService: ImageGenerationService | null = null;
  if (config.googleGeminiApiKey) {
    logger.debug("initializing image generation service with nano banana support");
    imageGenerationService = new ImageGenerationService(config.googleGeminiApiKey, ImageModelType.NANO_BANANA, config.tempDirPath);
  } else {
    logger.warn("Gemini API key not configured, image generation will not be available");
  }

  // Initialize Google Cloud Storage service if bucket name is configured
  let gcsService: GoogleCloudStorageService | null = null;
  if (config.gcsBucketName) {
    try {
      logger.debug("initializing google cloud storage service");
      gcsService = new GoogleCloudStorageService(config);
      logger.info({ bucket: config.gcsBucketName }, "GCS service initialized successfully");
    } catch (error: unknown) {
      logger.error(error, "Failed to initialize GCS service");
    }
  } else {
    logger.info("GCS_BUCKET_NAME not configured, videos will be stored locally only");
  }

  // Initialize YouTube Uploader service
  let youtubeUploader: YouTubeUploader | null = null;
  try {
    logger.debug("initializing youtube uploader service");
    youtubeUploader = new YouTubeUploader(config);
    logger.info("YouTube uploader service initialized successfully");
  } catch (error: unknown) {
    logger.warn(error, "YouTube uploader service not initialized - check YOUTUBE_CLIENT_SECRET_PATH configuration");
  }

  logger.debug("initializing the short creator");
  const shortCreator = new ShortCreator(
    config,
    ttsProvider,
    whisper,
    ffmpeg,
    pexelsApi,
    musicManager,
    veoApi || undefined,
    leonardoApi || undefined,
    imageGenerationService || undefined,
    gcsService || undefined,
    undefined, // workflowManager
    undefined, // webhookManager
    youtubeUploader || undefined
  );

  if (!config.runningInDocker) {
    // the project is running with npm - we need to check if the installation is correct
    if (fs.existsSync(config.installationSuccessfulPath)) {
      logger.info("the installation is successful - starting the server");
    } else {
      logger.info(
        "testing if the installation was successful - this may take a while...",
      );
      try {
        const audioBuffer = (await ttsProvider.generate("hi", "af_heart")).audio;
        await ffmpeg.createMp3DataUri(audioBuffer);
        await pexelsApi.findVideo(["dog"], 2.4);
        // FFmpeg mode - no additional testing needed
        fs.writeFileSync(config.installationSuccessfulPath, "ok", {
          encoding: "utf-8",
        });
        logger.info("the installation was successful - starting the server");
      } catch (error: unknown) {
        logger.fatal(
          error,
          "The environment is not set up correctly - please follow the instructions in the README.md file https://github.com/gyoridavid/short-video-maker",
        );
        process.exit(1);
      }
    }
  }

  logger.debug("initializing the server");
  const server = new Server(config, shortCreator, youtubeUploader || undefined);
  const app = server.start();

  // todo add shutdown handler
}

main().catch((error: unknown) => {
  logger.error(error, "Error starting server");
});
