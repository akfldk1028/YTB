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
  public dataDirPath: string;
  private libsDirPath: string;
  private staticDirPath: string;

  public installationSuccessfulPath: string;
  public whisperInstallPath: string;
  public videosDirPath: string;
  public tempDirPath: string;
  public packageDirPath: string;
  public musicDirPath: string;
  public pexelsApiKey: string;
  public googleVeoApiKey?: string; // DEPRECATED: Used for Vertex AI VEO, now using Gemini API
  public googleCloudProjectId?: string;
  public googleCloudRegion: string = "us-central1";
  public veoModel: "veo-2.0-generate-001" | "veo-3.0-generate-001" | "veo-3.0-fast-generate-001" = "veo-3.0-fast-generate-001";
  public leonardoApiKey?: string;
  public googleGeminiApiKey?: string; // For Gemini API (Imagen image generation and VEO video generation)
  public googleTtsApiKey?: string; // For Google Cloud Text-to-Speech
  public googleTtsProjectId?: string; // For Google Cloud TTS project
  public elevenLabsApiKey?: string; // For ElevenLabs Text-to-Speech
  public ttsProvider: "kokoro" | "google" | "elevenlabs" = "kokoro"; // TTS provider selection
  public videoSource: "pexels" | "veo" | "leonardo" | "both" | "ffmpeg" = "pexels";
  public veo3UseNativeAudio: boolean = false; // false: use TTS audio (숏츠용), true: use VEO3 audio (대화/연기용)
  public youtubeClientSecretPath: string; // Path to YouTube OAuth client secret JSON file

  // Google Cloud Storage Configuration
  public gcsBucketName?: string;
  public gcsServiceAccountPath?: string;
  public gcsRegion: string = "us-central1";
  public gcsStorageClass: "STANDARD" | "NEARLINE" | "COLDLINE" | "ARCHIVE" = "STANDARD";
  public gcsAutoDeleteLocalAfterDays: number = 0; // 0 = never delete, 7 = delete after 7 days, etc.
  public gcsAutoDeleteDays: number = 30; // GCS lifecycle: delete from cloud after 30 days
  public gcsSignedUrlExpiryHours: number = 24;

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
    this.veoModel = (process.env.VEO_MODEL as "veo-2.0-generate-001" | "veo-3.0-generate-001" | "veo-3.0-fast-generate-001") || "veo-3.0-fast-generate-001";
    this.leonardoApiKey = process.env.LEONARDO_API_KEY;
    this.googleGeminiApiKey = process.env.GOOGLE_GEMINI_API_KEY;
    this.googleTtsApiKey = process.env.GOOGLE_TTS_API_KEY;
    this.googleTtsProjectId = process.env.GOOGLE_TTS_PROJECT_ID;
    this.elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
    this.ttsProvider = (process.env.TTS_PROVIDER as "kokoro" | "google" | "elevenlabs") || "kokoro";
    this.videoSource = (process.env.VIDEO_SOURCE as "pexels" | "veo" | "leonardo" | "both" | "ffmpeg") || "pexels";
    this.veo3UseNativeAudio = process.env.VEO3_USE_NATIVE_AUDIO === "true";
    this.youtubeClientSecretPath = process.env.YOUTUBE_CLIENT_SECRET_PATH || path.join(this.dataDirPath, "client_secret.json");

    // GCS Configuration
    this.gcsBucketName = process.env.GCS_BUCKET_NAME;
    this.gcsServiceAccountPath = process.env.GCS_SERVICE_ACCOUNT_PATH;
    this.gcsRegion = process.env.GCS_REGION || "us-central1";
    this.gcsStorageClass = (process.env.GCS_STORAGE_CLASS as "STANDARD" | "NEARLINE" | "COLDLINE" | "ARCHIVE") || "STANDARD";
    this.gcsAutoDeleteLocalAfterDays = parseInt(process.env.GCS_AUTO_DELETE_LOCAL_AFTER_DAYS || "0"); // 0 = never delete locally
    this.gcsAutoDeleteDays = parseInt(process.env.GCS_AUTO_DELETE_DAYS || "30");
    this.gcsSignedUrlExpiryHours = parseInt(process.env.GCS_SIGNED_URL_EXPIRY_HOURS || "24");

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
      if (!this.googleGeminiApiKey) {
        throw new Error(
          "GOOGLE_GEMINI_API_KEY environment variable is missing. Please provide your Gemini API key for VEO video generation.",
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

  /**
   * Get data directory path
   */
  public getDataDirPath(): string {
    return this.dataDirPath;
  }
}

export const KOKORO_MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
