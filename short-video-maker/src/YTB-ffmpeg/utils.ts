/**
 * FFmpeg Utilities
 * Shared utilities for FFmpeg operations
 */

import ffmpeg from "fluent-ffmpeg";
import { spawn } from "child_process";
import fs from "fs-extra";
import { logger } from "../logger";

// Font paths to check (in order of preference)
const FONT_PATHS = [
  // Docker/Cloud Run paths (fonts-nanum package)
  '/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf',
  '/usr/share/fonts/truetype/nanum/NanumGothic-Bold.ttf',
  // Local development paths
  '/home/akfldk1028/.fonts/NanumGothic-Bold.ttf',
  // Windows paths
  'C:/Windows/Fonts/malgun.ttf',
  'C:/Windows/Fonts/NanumGothic.ttf',
  // Fallback to DejaVu Sans (commonly available)
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  // Ubuntu/Debian default fonts
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
];

// Cache the found font path
let cachedFontPath: string | null = null;
let ffmpegPath: string | null = null;

/**
 * Initialize FFmpeg path
 * On Linux (Docker/GCP), use system FFmpeg for newer features (xfade, etc.)
 * On other platforms, use @ffmpeg-installer/ffmpeg
 */
export async function initFFmpeg(): Promise<void> {
  if (ffmpegPath) return;

  const isLinux = process.platform === 'linux';
  const systemFfmpegPath = '/usr/bin/ffmpeg';

  if (isLinux) {
    // Use system FFmpeg on Linux (has xfade filter, FFmpeg 5.x+)
    const fs = await import('fs');
    if (fs.existsSync(systemFfmpegPath)) {
      ffmpeg.setFfmpegPath(systemFfmpegPath);
      ffmpegPath = systemFfmpegPath;
      logger.info(`FFmpeg path set to system: ${systemFfmpegPath} (Linux)`);
    } else {
      // Fallback to npm installer if system FFmpeg not found
      const ffmpegInstaller = await import("@ffmpeg-installer/ffmpeg");
      ffmpeg.setFfmpegPath(ffmpegInstaller.path);
      ffmpegPath = ffmpegInstaller.path;
      logger.warn(`System FFmpeg not found, using npm installer: ${ffmpegInstaller.path}`);
    }
  } else {
    // Use npm installer on Windows/Mac
    const ffmpegInstaller = await import("@ffmpeg-installer/ffmpeg");
    ffmpeg.setFfmpegPath(ffmpegInstaller.path);
    ffmpegPath = ffmpegInstaller.path;
    logger.info(`FFmpeg path set to npm installer: ${ffmpegInstaller.path}`);
  }

  // Log the font path that will be used
  const fontPath = findAvailableFontPath();
  logger.info(`Caption font path: ${fontPath}`);
}

/**
 * Get the FFmpeg path
 */
export function getFFmpegPath(): string {
  if (!ffmpegPath) {
    throw new Error("FFmpeg not initialized. Call initFFmpeg() first.");
  }
  return ffmpegPath;
}

/**
 * Get the fluent-ffmpeg instance
 */
export { ffmpeg };

/**
 * Find the first available font path from the list of candidates
 */
export function findAvailableFontPath(): string {
  if (cachedFontPath) {
    return cachedFontPath;
  }

  for (const fontPath of FONT_PATHS) {
    if (fs.existsSync(fontPath)) {
      logger.info({ fontPath }, "Found available font for captions");
      cachedFontPath = fontPath;
      return fontPath;
    }
  }

  // If no font found, log warning and return first path (will fail gracefully)
  logger.warn({ triedPaths: FONT_PATHS }, "No font file found for captions, subtitles may not render");
  return FONT_PATHS[0];
}

/**
 * Get video duration in seconds using ffprobe
 */
export async function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        logger.error({ err, videoPath }, "Failed to get video duration");
        reject(err);
        return;
      }
      const duration = metadata.format.duration || 0;
      resolve(duration);
    });
  });
}

/**
 * FFmpeg command execution via spawn (Cloud Run compatible)
 * fluent-ffmpeg can hang in some environments, this is a fallback
 */
export async function runFFmpegSpawn(args: string[], timeoutMs: number): Promise<string> {
  return new Promise(async (resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let killed = false;

    // Use initialized FFmpeg path (system on Linux, npm installer on Windows/Mac)
    if (!ffmpegPath) {
      await initFFmpeg();
    }
    const ffPath = ffmpegPath!;

    logger.debug({ ffmpegPath: ffPath, args, timeoutMs }, "Starting FFmpeg spawn process");

    const proc = spawn(ffPath, args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const timer = setTimeout(() => {
      killed = true;
      proc.kill('SIGKILL');
      reject(new Error(`FFmpeg process timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
      // FFmpeg outputs progress to stderr
      if (stderr.includes('frame=') || stderr.includes('time=')) {
        logger.debug({ progress: stderr.slice(-200) }, "FFmpeg progress");
      }
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (killed) return;

      if (code === 0) {
        resolve(stdout);
      } else {
        logger.error({ code, stderr: stderr.slice(-500), stdout }, "FFmpeg process failed");
        reject(new Error(`FFmpeg process exited with code ${code}: ${stderr.slice(-500)}`));
      }
    });

    proc.on('error', (error) => {
      clearTimeout(timer);
      logger.error({ error }, "FFmpeg spawn error");
      reject(new Error(`Failed to spawn FFmpeg process: ${error.message}`));
    });
  });
}
