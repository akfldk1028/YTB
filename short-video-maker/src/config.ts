import path from "path";
import "dotenv/config";
import os from "os";
import fs from "fs-extra";
import pino from "pino";
import { kokoroModelPrecision, whisperModels } from "./types/shorts";

const defaultLogLevel: pino.Level = "info";
const defaultPort = 3123;
const whisperVersion = "1.7.1";
const defaultWhisperModel: whisperModels = "medium"; // For multilingual support including Korean. English-only options: "tiny.en", "base.en", "small.en", "medium.en"

// Create the global logger
const versionNumber = process.env.npm_package_version;
export const logger = pino({
  level: process.env.LOG_LEVEL || defaultLogLevel,
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  base: {
    pid: process.pid,
    version: versionNumber,
  },
});

export class Config {
  private dataDirPath: string;
  private libsDirPath: string;
  private staticDirPath: string;

  public installationSuccessfulPath: string;
  public whisperInstallPath: string;
  public videosDirPath: string;
  public tempDirPath: string;
  public packageDirPath: string;
  public musicDirPath: string;
  public pexelsApiKey: string;
  public googleVeoApiKey?: string; // Service account key file path for Veo
  public googleCloudProjectId?: string;
  public googleCloudRegion: string = "us-central1";
  public leonardoApiKey?: string;
  public googleGeminiApiKey?: string; // For Imagen image generation
  public googleTtsApiKey?: string; // For Google Cloud Text-to-Speech
  public googleTtsProjectId?: string; // For Google Cloud TTS project
  public elevenLabsApiKey?: string; // For ElevenLabs Text-to-Speech
  public ttsProvider: "kokoro" | "google" | "elevenlabs" = "kokoro"; // TTS provider selection
  public videoSource: "pexels" | "veo" | "leonardo" | "both" | "ffmpeg" = "pexels";
  public logLevel: pino.Level;
  public whisperVerbose: boolean;
  public port: number;
  public runningInDocker: boolean;
  public devMode: boolean;
  public whisperVersion: string = whisperVersion;
  public whisperModel: whisperModels = defaultWhisperModel;
  public kokoroModelPrecision: kokoroModelPrecision = "fp32";

  // docker-specific, performance-related settings to prevent memory issues
  public concurrency?: number;
  public videoCacheSizeInBytes: number | null = null;

  constructor() {
    this.dataDirPath =
      process.env.DATA_DIR_PATH ||
      path.join(os.homedir(), ".ai-agents-az-video-generator");
    this.libsDirPath = path.join(this.dataDirPath, "libs");

    this.whisperInstallPath = path.join(this.libsDirPath, "whisper");
    this.videosDirPath = path.join(this.dataDirPath, "videos");
    this.tempDirPath = path.join(this.dataDirPath, "temp");
    this.installationSuccessfulPath = path.join(
      this.dataDirPath,
      "installation-successful",
    );

    fs.ensureDirSync(this.dataDirPath);
    fs.ensureDirSync(this.libsDirPath);
    fs.ensureDirSync(this.videosDirPath);
    fs.ensureDirSync(this.tempDirPath);

    this.packageDirPath = path.join(__dirname, "..");
    this.staticDirPath = path.join(this.packageDirPath, "static");
    this.musicDirPath = path.join(this.staticDirPath, "music");

    this.pexelsApiKey = process.env.PEXELS_API_KEY as string;
    this.googleVeoApiKey = process.env.GOOGLE_VEO_API_KEY;
    this.googleCloudProjectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
    this.googleCloudRegion = process.env.GOOGLE_CLOUD_REGION || "us-central1";
    this.leonardoApiKey = process.env.LEONARDO_API_KEY;
    this.googleGeminiApiKey = process.env.GOOGLE_GEMINI_API_KEY;
    this.googleTtsApiKey = process.env.GOOGLE_TTS_API_KEY;
    this.googleTtsProjectId = process.env.GOOGLE_TTS_PROJECT_ID;
    this.elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
    this.ttsProvider = (process.env.TTS_PROVIDER as "kokoro" | "google" | "elevenlabs") || "kokoro";
    this.videoSource = (process.env.VIDEO_SOURCE as "pexels" | "veo" | "leonardo" | "both" | "ffmpeg") || "pexels";
    this.logLevel = (process.env.LOG_LEVEL || defaultLogLevel) as pino.Level;
    this.whisperVerbose = process.env.WHISPER_VERBOSE === "true";
    this.port = process.env.PORT ? parseInt(process.env.PORT) : defaultPort;
    this.runningInDocker = process.env.DOCKER === "true";
    this.devMode = process.env.DEV === "true";

    if (process.env.WHISPER_MODEL) {
      this.whisperModel = process.env.WHISPER_MODEL as whisperModels;
    }
    if (process.env.KOKORO_MODEL_PRECISION) {
      this.kokoroModelPrecision = process.env
        .KOKORO_MODEL_PRECISION as kokoroModelPrecision;
    }

    this.concurrency = process.env.CONCURRENCY
      ? parseInt(process.env.CONCURRENCY)
      : undefined;

    if (process.env.VIDEO_CACHE_SIZE_IN_BYTES) {
      this.videoCacheSizeInBytes = parseInt(
        process.env.VIDEO_CACHE_SIZE_IN_BYTES,
      );
    }
  }

  public ensureConfig() {
    if (this.videoSource === "pexels" || this.videoSource === "both") {
      if (!this.pexelsApiKey) {
        throw new Error(
          "PEXELS_API_KEY environment variable is missing. Get your free API key: https://www.pexels.com/api/key/ - see how to run the project: https://github.com/gyoridavid/short-video-maker",
        );
      }
    }
    
    if (this.videoSource === "veo" || this.videoSource === "both") {
      if (!this.googleVeoApiKey) {
        throw new Error(
          "GOOGLE_VEO_API_KEY environment variable is missing. Please provide the path to your Google Cloud service account key file for Vertex AI Veo API.",
        );
      }
      if (!this.googleCloudProjectId) {
        throw new Error(
          "GOOGLE_CLOUD_PROJECT_ID environment variable is missing. Please provide your Google Cloud project ID.",
        );
      }
    }
    
    if (this.videoSource === "leonardo" || this.videoSource === "both") {
      if (!this.leonardoApiKey) {
        throw new Error(
          "LEONARDO_API_KEY environment variable is missing. Please get your API key from https://leonardo.ai/api/",
        );
      }
    }
  }
}

export const KOKORO_MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
