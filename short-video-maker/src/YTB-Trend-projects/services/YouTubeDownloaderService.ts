/**
 * YouTubeDownloaderService (Node 1)
 * YouTube URL → MP4 다운로드 (yt-dlp 사용)
 *
 * Input:  YouTubeDownloadRequest { url, maxQuality? }
 * Output: YouTubeDownloadResult { success, videoPath?, metadata?, error? }
 *
 * Security: execFile 사용 (shell injection 방지)
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs-extra';
import { logger } from '../../config';
import type { YouTubeDownloadRequest, YouTubeDownloadResult, YouTubeVideoMetadata } from '../types';

const execFileAsync = promisify(execFile);

const DOWNLOAD_TIMEOUT_MS = 120_000; // 2분
const MAX_RETRIES = 2;
const VALID_URL_PATTERNS = [
  /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[A-Za-z0-9_-]+/,
  /^https?:\/\/youtu\.be\/[A-Za-z0-9_-]+/,
  /^https?:\/\/(www\.)?youtube\.com\/shorts\/[A-Za-z0-9_-]+/,
];

export class YouTubeDownloaderService {
  private downloadDir: string;

  constructor(downloadDir: string) {
    this.downloadDir = downloadDir;
  }

  async download(request: YouTubeDownloadRequest): Promise<YouTubeDownloadResult> {
    // URL 검증
    const urlError = this.validateUrl(request.url);
    if (urlError) {
      return { success: false, error: urlError };
    }

    await fs.ensureDir(this.downloadDir);

    const timestamp = Date.now();
    const outputTemplate = path.join(this.downloadDir, `yt_${timestamp}.%(ext)s`);
    const expectedOutput = path.join(this.downloadDir, `yt_${timestamp}.mp4`);
    const infoJsonPath = path.join(this.downloadDir, `yt_${timestamp}.info.json`);

    const maxQuality = request.maxQuality || 720;

    // execFile: 인수를 배열로 전달 → shell injection 불가능
    const args = [
      '-f', `bestvideo[height<=${maxQuality}]+bestaudio/best[height<=${maxQuality}]`,
      '--merge-output-format', 'mp4',
      '-o', outputTemplate,
      '--write-info-json',
      '--no-playlist',
      '--no-warnings',
      request.url,
    ];

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        logger.info({ url: request.url, attempt, maxQuality }, '[YTDownloader] Starting download');

        await execFileAsync('yt-dlp', args, { timeout: DOWNLOAD_TIMEOUT_MS });

        // 결과 확인
        const videoExists = await fs.pathExists(expectedOutput);
        if (!videoExists) {
          // yt-dlp이 다른 확장자로 저장했을 수 있음
          const files = await fs.readdir(this.downloadDir);
          const match = files.find(f => f.startsWith(`yt_${timestamp}`) && f.endsWith('.mp4'));
          if (!match) {
            throw new Error('Download completed but MP4 file not found');
          }
        }

        // 메타데이터 추출
        let metadata: YouTubeVideoMetadata | undefined;
        if (await fs.pathExists(infoJsonPath)) {
          try {
            const infoRaw = await fs.readFile(infoJsonPath, 'utf-8');
            const info = JSON.parse(infoRaw);
            metadata = {
              title: info.title || '',
              channel: info.channel || info.uploader || '',
              duration: info.duration || 0,
              description: (info.description || '').substring(0, 500),
            };
          } catch {
            // 메타데이터 파싱 실패는 무시
          }
          // info.json 클린업
          await fs.remove(infoJsonPath).catch(() => {});
        }

        logger.info({ videoPath: expectedOutput, metadata }, '[YTDownloader] Download complete');

        return {
          success: true,
          videoPath: expectedOutput,
          metadata,
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        const isLast = attempt >= MAX_RETRIES;

        if (isLast) {
          logger.error({ error: msg, attempt }, '[YTDownloader] All retries exhausted');
          return { success: false, error: `Download failed after ${MAX_RETRIES + 1} attempts: ${msg}` };
        }

        logger.warn({ error: msg, attempt }, '[YTDownloader] Retrying...');
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    return { success: false, error: 'Unexpected error' };
  }

  validateUrl(url: string): string | null {
    if (!url || url.trim().length === 0) {
      return 'URL is required';
    }
    const isValid = VALID_URL_PATTERNS.some(p => p.test(url));
    if (!isValid) {
      return `Invalid YouTube URL. Supported: youtube.com/watch, youtu.be, youtube.com/shorts`;
    }
    return null;
  }

  /** 다운로드 디렉토리 클린업 */
  async cleanup(): Promise<void> {
    if (await fs.pathExists(this.downloadDir)) {
      const files = await fs.readdir(this.downloadDir);
      for (const f of files) {
        if (f.startsWith('yt_')) {
          await fs.remove(path.join(this.downloadDir, f)).catch(() => {});
        }
      }
    }
  }
}
