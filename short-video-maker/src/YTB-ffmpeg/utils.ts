/**
 * FFmpeg Utilities
 * Shared utilities for FFmpeg operations
 */

import ffmpeg from "fluent-ffmpeg";
import { spawn } from "child_process";
import fs from "fs-extra";
import { logger } from "../logger";

// ============================================
// 🔥 폰트 설정 - NewsProject 스타일
// 제목: Black Han Sans (두꺼운 임팩트)
// 본문/자막: Gmarket Sans Bold (깔끔한 가독성)
// ============================================

// 프로젝트 폰트 경로 (우선)
import path from "path";

// 🔥 Docker 환경 감지: process.env.DOCKER 또는 /app 경로 존재 확인
const isDocker = process.env.DOCKER === 'true' || fs.existsSync('/app/font');

// 🔥 PROJECT_ROOT 계산 - Docker vs 로컬 구분
// Docker: /app/dist/YTB-ffmpeg/__dirname → /app (font는 /app/font에 있음)
// 로컬: D:/Data/.../dist/YTB-ffmpeg/__dirname → D:/Data/.../short-video-maker
const PROJECT_ROOT = isDocker ? '/app' : path.resolve(__dirname, '../..');

// 제목용 폰트 (Black Han Sans)
// 🔥 프로젝트 폰트 우선! fonts-nanum은 한글 렌더링 문제 발생
const TITLE_FONT_PATHS = [
  // 🔥 프로젝트 커스텀 폰트 - 최우선 (한글 완벽 지원)
  '/app/font/BlackHanSans-Regular.ttf',
  // 프로젝트 폰트 (로컬 개발용)
  path.join(PROJECT_ROOT, 'font/BlackHanSans-Regular.ttf'),
  // 🔥 시스템 폰트 - 폴백 (fonts-nanum은 한글 렌더링 문제 있음)
  '/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf',
  '/usr/share/fonts/truetype/nanum/NanumGothic-Bold.ttf',
  // Windows fallback
  'C:/Windows/Fonts/malgunbd.ttf',
];

// 본문/자막용 폰트 (Gmarket Sans Bold)
// 🔥 프로젝트 폰트 우선! fonts-nanum은 한글 렌더링 문제 발생
const SUBTITLE_FONT_PATHS = [
  // 🔥 프로젝트 커스텀 폰트 - 최우선 (한글 완벽 지원)
  '/app/font/GmarketSansTTFBold.ttf',
  // 프로젝트 폰트 (로컬 개발용)
  path.join(PROJECT_ROOT, 'font/GmarketSansTTFBold.ttf'),
  // 🔥 시스템 폰트 - 폴백 (fonts-nanum은 한글 렌더링 문제 있음)
  '/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf',
  '/usr/share/fonts/truetype/nanum/NanumGothic-Bold.ttf',
  // Windows fallback
  'C:/Windows/Fonts/malgunbd.ttf',
];

// Legacy: 기존 코드 호환성용 (deprecated)
// 🔥 프로젝트 폰트 우선! fonts-nanum은 한글 렌더링 문제 있음
const FONT_PATHS = [
  // 🔥 프로젝트 커스텀 폰트 - 최우선 (한글 완벽 지원)
  '/app/font/GmarketSansTTFBold.ttf',
  '/app/font/BlackHanSans-Regular.ttf',
  // Docker/Cloud Run paths (fonts-nanum package) - 폴백
  '/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf',
  '/usr/share/fonts/truetype/nanum/NanumGothic-Bold.ttf',
  // Local development paths
  '/home/akfldk1028/.fonts/NanumGothic-Bold.ttf',
  // Windows paths (Bold 폰트 우선)
  'C:/Windows/Fonts/malgunbd.ttf',   // 맑은 고딕 Bold
  'C:/Windows/Fonts/malgun.ttf',
  'C:/Windows/Fonts/NanumGothic.ttf',
  // Fallback to DejaVu Sans (commonly available)
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  // Ubuntu/Debian default fonts
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
];

// Cache the found font paths
// 🔥 NOTE: Cache is disabled for now to ensure correct font priority
let cachedFontPath: string | null = null;
let cachedTitleFontPath: string | null = null;
let cachedSubtitleFontPath: string | null = null;
let ffmpegPath: string | null = null;

/**
 * 🔥 Clear font cache to force re-detection
 * Call this when font priority changes or fonts are updated
 */
export function clearFontCache(): void {
  cachedFontPath = null;
  cachedTitleFontPath = null;
  cachedSubtitleFontPath = null;
  logger.info('[Font] Font cache cleared - will re-detect on next use');
}

/**
 * Initialize FFmpeg path
 * On Linux (Docker/GCP), use system FFmpeg for newer features (xfade, etc.)
 * On other platforms, use @ffmpeg-installer/ffmpeg
 */
export async function initFFmpeg(): Promise<void> {
  if (ffmpegPath) return;

  // 🔥 Clear font cache at startup to ensure fresh detection with new priority
  clearFontCache();

  const isLinux = process.platform === 'linux';
  const systemFfmpegPath = '/usr/bin/ffmpeg';

  if (isLinux) {
    // Use system FFmpeg on Linux (has xfade filter, FFmpeg 5.x+)
    const fs = await import('fs');
    if (fs.existsSync(systemFfmpegPath)) {
      ffmpeg.setFfmpegPath(systemFfmpegPath);
      ffmpegPath = systemFfmpegPath;
      logger.info(`FFmpeg path set to system: ${systemFfmpegPath} (Linux)`);
      // system ffprobe
      const systemFfprobePath = '/usr/bin/ffprobe';
      if (fs.existsSync(systemFfprobePath)) {
        ffmpeg.setFfprobePath(systemFfprobePath);
        logger.info(`FFprobe path set to system: ${systemFfprobePath}`);
      }
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

  // v3.4.0: Set ffprobe path from @ffprobe-installer/ffprobe
  // v3.5.1: Only use npm installer on Windows/Mac - Linux uses system ffprobe (set above)
  // Docker COPY --from strips execute permissions on npm binary → EACCES on Cloud Run
  if (!isLinux) {
    try {
      const ffprobeInstaller = await import("@ffprobe-installer/ffprobe");
      ffmpeg.setFfprobePath(ffprobeInstaller.path);
      logger.info(`FFprobe path set to npm installer: ${ffprobeInstaller.path}`);
    } catch {
      logger.warn('FFprobe installer not found - ffprobe features may not work');
    }
  }

  // 🔥 앱 시작 시 모든 폰트 경로 확인 (디버깅용)
  const appFontDir = '/app/font';
  const appFontDirExists = fs.existsSync(appFontDir);
  let appFontFiles: string[] = [];

  if (appFontDirExists) {
    try {
      appFontFiles = fs.readdirSync(appFontDir);
    } catch (e) {
      logger.warn({ error: e }, "[Font] Failed to read /app/font directory");
    }
  }

  logger.info({
    isDocker,
    PROJECT_ROOT,
    dockerEnv: process.env.DOCKER,
    appFontDirExists,
    appFontFiles,
    expectedFonts: ['BlackHanSans-Regular.ttf', 'GmarketSansTTFBold.ttf']
  }, "[Font] Environment check at startup");

  // 제목 폰트 확인
  const titleFontPath = findTitleFontPath();
  logger.info({ titleFont: titleFontPath }, "[Font] Title font configured");

  // 자막 폰트 확인
  const subtitleFontPath = findSubtitleFontPath();
  logger.info({ subtitleFont: subtitleFontPath }, "[Font] Subtitle font configured");

  // Legacy 폰트 확인
  const legacyFontPath = findAvailableFontPath();
  logger.info({ legacyFont: legacyFontPath }, "[Font] Legacy font configured");
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
 * 🔥 제목용 폰트 경로 찾기 (Black Han Sans)
 */
export function findTitleFontPath(): string {
  if (cachedTitleFontPath) {
    logger.debug({ cachedPath: cachedTitleFontPath }, "[Font] Using cached title font path");
    return cachedTitleFontPath;
  }

  // 🔥 상세 디버깅 로그
  logger.info({
    isDocker,
    PROJECT_ROOT,
    pathsToCheck: TITLE_FONT_PATHS
  }, "[Font] Searching for title font (Black Han Sans)");

  for (const fontPath of TITLE_FONT_PATHS) {
    const exists = fs.existsSync(fontPath);
    logger.debug({ fontPath, exists }, "[Font] Checking title font path");

    if (exists) {
      // 파일 크기 확인 (유효한 폰트인지)
      const stats = fs.statSync(fontPath);
      logger.info({
        fontPath,
        sizeBytes: stats.size,
        sizeMB: (stats.size / 1024 / 1024).toFixed(2)
      }, "[Font] ✅ Found title font (Black Han Sans)");
      cachedTitleFontPath = fontPath;
      return fontPath;
    }
  }

  // Fallback to legacy
  const fallbackPath = findAvailableFontPath();
  logger.warn({
    triedPaths: TITLE_FONT_PATHS,
    fallbackPath
  }, "[Font] ⚠️ Title font not found, using fallback");
  return fallbackPath;
}

/**
 * 🔥 자막용 폰트 경로 찾기 (Gmarket Sans Bold)
 */
export function findSubtitleFontPath(): string {
  if (cachedSubtitleFontPath) {
    logger.debug({ cachedPath: cachedSubtitleFontPath }, "[Font] Using cached subtitle font path");
    return cachedSubtitleFontPath;
  }

  // 🔥 상세 디버깅 로그
  logger.info({
    isDocker,
    PROJECT_ROOT,
    pathsToCheck: SUBTITLE_FONT_PATHS
  }, "[Font] Searching for subtitle font (Gmarket Sans Bold)");

  for (const fontPath of SUBTITLE_FONT_PATHS) {
    const exists = fs.existsSync(fontPath);
    logger.debug({ fontPath, exists }, "[Font] Checking subtitle font path");

    if (exists) {
      // 파일 크기 확인 (유효한 폰트인지)
      const stats = fs.statSync(fontPath);
      logger.info({
        fontPath,
        sizeBytes: stats.size,
        sizeMB: (stats.size / 1024 / 1024).toFixed(2)
      }, "[Font] ✅ Found subtitle font (Gmarket Sans Bold)");
      cachedSubtitleFontPath = fontPath;
      return fontPath;
    }
  }

  // Fallback to legacy
  const fallbackPath = findAvailableFontPath();
  logger.warn({
    triedPaths: SUBTITLE_FONT_PATHS,
    fallbackPath
  }, "[Font] ⚠️ Subtitle font not found, using fallback");
  return fallbackPath;
}

/**
 * Find the first available font path from the list of candidates (Legacy)
 * @deprecated Use findTitleFontPath() or findSubtitleFontPath() instead
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

// ============================================
// 🔥 프로젝트별 폰트 설정 지원
// ============================================

/**
 * 폰트 프리셋 타입
 */
export type FontPreset = 'nanum' | 'blackhansans' | 'gmarket' | 'malgun';

/**
 * 폰트 프리셋 -> 실제 경로 매핑
 * 🔥 프로젝트 폰트 우선! fonts-nanum은 한글 렌더링 문제 있음
 */
const FONT_PRESET_PATHS: Record<FontPreset, string[]> = {
  // 🔥 nanum 프리셋도 프로젝트 폰트 먼저 시도
  nanum: [
    '/app/font/GmarketSansTTFBold.ttf',  // 프로젝트 폰트 우선
    path.join(PROJECT_ROOT, 'font/GmarketSansTTFBold.ttf'),
    '/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf',
    '/usr/share/fonts/truetype/nanum/NanumGothic-Bold.ttf',
    'C:/Windows/Fonts/NanumGothicBold.ttf',
  ],
  blackhansans: [
    '/app/font/BlackHanSans-Regular.ttf',
    path.join(PROJECT_ROOT, 'font/BlackHanSans-Regular.ttf'),
  ],
  gmarket: [
    '/app/font/GmarketSansTTFBold.ttf',
    path.join(PROJECT_ROOT, 'font/GmarketSansTTFBold.ttf'),
  ],
  malgun: [
    'C:/Windows/Fonts/malgunbd.ttf',
    'C:/Windows/Fonts/malgun.ttf',
  ],
};

/**
 * 🔥 폰트 프리셋을 실제 경로로 변환
 * 프리셋이 없거나 파일이 없으면 시스템 폰트(nanum) 반환
 *
 * @param preset - 폰트 프리셋 ('nanum', 'blackhansans', 'gmarket', 'malgun')
 * @param fallbackToSystem - 실패시 시스템 폰트로 폴백 (기본: true)
 */
export function resolveFontPreset(preset?: FontPreset | string, fallbackToSystem = true): string {
  // 프리셋이 없으면 기본값 (nanum - 가장 안정적)
  const fontPreset = (preset as FontPreset) || 'nanum';

  // 프리셋 경로 목록 가져오기
  const paths = FONT_PRESET_PATHS[fontPreset];

  if (!paths) {
    logger.warn({ preset }, '[Font] Unknown font preset, using nanum');
    return resolveFontPreset('nanum', false);
  }

  // 첫 번째로 존재하는 경로 반환
  for (const fontPath of paths) {
    if (fs.existsSync(fontPath)) {
      const stats = fs.statSync(fontPath);
      if (stats.size > 0) {
        logger.debug({ preset, fontPath, sizeBytes: stats.size }, '[Font] Resolved font preset');
        return fontPath;
      }
    }
  }

  // 폴백: 시스템 폰트 (nanum)
  if (fallbackToSystem && fontPreset !== 'nanum') {
    logger.warn({ preset, triedPaths: paths }, '[Font] Preset font not found, falling back to nanum');
    return resolveFontPreset('nanum', false);
  }

  // 최후의 폴백: findAvailableFontPath
  logger.warn({ preset }, '[Font] No preset fonts found, using legacy findAvailableFontPath');
  return findAvailableFontPath();
}
