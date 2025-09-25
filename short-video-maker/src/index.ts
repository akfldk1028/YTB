/* eslint-disable @typescript-eslint/no-unused-vars */
import path from "path";
import fs from "fs-extra";

import { Kokoro } from "./short-creator/libraries/Kokoro";
import { GoogleTTS } from "./short-creator/libraries/google-tts";
import { Whisper } from "./short-creator/libraries/Whisper";
import { FFMpeg } from "./short-creator/libraries/FFmpeg";
import { PexelsAPI } from "./short-creator/libraries/Pexels";
import { GoogleVeoAPI } from "./short-creator/libraries/GoogleVeo";
import { LeonardoAI } from "./short-creator/libraries/LeonardoAI";
import { Config } from "./config";
import { ShortCreator } from "./short-creator/ShortCreator";
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

  const musicManager = new MusicManager(config);
  try {
    logger.debug("checking music files");
    musicManager.ensureMusicFilesExist();
  } catch (error: unknown) {
    logger.error(error, "Missing music files");
    process.exit(1);
  }

  
  // Initialize TTS provider based on config
  let ttsProvider: Kokoro | GoogleTTS;
  if (config.ttsProvider === "google") {
    logger.debug("initializing google tts");
    const googleTtsConfig = config.googleTtsProjectId ? {
      projectId: config.googleTtsProjectId,
      keyFilename: config.googleTtsApiKey
    } : undefined;
    ttsProvider = await GoogleTTS.init(googleTtsConfig);
  } else {
    logger.debug("initializing kokoro");
    ttsProvider = await Kokoro.init(config.kokoroModelPrecision);
  }
  
  logger.debug("initializing whisper");
  const whisper = await Whisper.init(config);
  logger.debug("initializing ffmpeg");
  const ffmpeg = await FFMpeg.init();
  const pexelsApi = new PexelsAPI(config.pexelsApiKey);
  
  // Initialize Veo API if configured
  let veoApi: GoogleVeoAPI | null = null;
  if (config.videoSource === "veo" || config.videoSource === "both") {
    if (config.googleVeoApiKey && config.googleCloudProjectId) {
      logger.debug("initializing google veo api");
      veoApi = new GoogleVeoAPI(
        config.googleVeoApiKey,
        config.googleCloudProjectId,
        config.googleCloudRegion
      );
    } else {
      logger.warn("Veo API keys not configured, but VIDEO_SOURCE includes 'veo'");
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
  const server = new Server(config, shortCreator);
  const app = server.start();

  // todo add shutdown handler
}

main().catch((error: unknown) => {
  logger.error(error, "Error starting server");
});
