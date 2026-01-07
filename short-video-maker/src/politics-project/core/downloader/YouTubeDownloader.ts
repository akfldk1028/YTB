/**
 * YouTube Downloader
 *
 * yt-dlp를 사용하여 YouTube 영상과 자막을 다운로드합니다.
 * Residential Proxy 지원: Cloud Run 환경에서 YouTube 봇 감지 우회
 *
 * 폴백 순서:
 * 1. yt-dlp + Residential Proxy (Cloud Run 필수)
 * 2. Invidious API - 프록시 실패 시
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs-extra';
import { logger } from '../../../logger';
import { DownloadOptions, DownloadResult } from './types';
import { InvidiousClient } from './InvidiousClient';
import { VideoSearcher } from './VideoSearcher';

const execAsync = promisify(exec);

// Residential Proxy 설정 (Decodo/SmartProxy)
// .trim()으로 개행문자 제거 (Secret Manager에서 개행 포함 가능)
const RESIDENTIAL_PROXY_URL = (process.env.RESIDENTIAL_PROXY_URL || '').trim();
const USE_PROXY = !!RESIDENTIAL_PROXY_URL;

// 최대 영상 길이 제한 (초) - 트래픽 절약
// 6분 = 360초, 720p 기준 약 130MB
const MAX_VIDEO_DURATION_SEC = 360;

export class YouTubeDownloader {
  private outputDir: string;
  private invidiousClient: InvidiousClient;
  private videoSearcher: VideoSearcher;

  constructor(outputDir: string) {
    this.outputDir = outputDir;
    this.invidiousClient = new InvidiousClient();
    this.videoSearcher = new VideoSearcher();
  }

  /**
   * YouTube 영상 + 자막 다운로드
   */
  async download(
    youtubeUrl: string,
    options?: Partial<DownloadOptions>
  ): Promise<DownloadResult> {
    const opts = this.mergeOptions(options);

    logger.info({ youtubeUrl }, 'YouTube 다운로드 시작');

    await fs.ensureDir(opts.outputDir);

    // 1. 영상 정보 먼저 가져오기 (프록시 사용)
    const videoInfo = await this.getVideoInfoInternal(youtubeUrl, USE_PROXY);

    // 2. 영상 다운로드
    const videoPath = await this.downloadVideo(youtubeUrl, opts);

    // 3. 자막 다운로드
    const subtitlePath = await this.downloadSubtitle(youtubeUrl, opts);

    logger.info({
      videoPath,
      subtitlePath,
      title: videoInfo.title
    }, 'YouTube 다운로드 완료');

    return {
      videoPath,
      subtitlePath,
      title: videoInfo.title,
      duration: videoInfo.duration
    };
  }

  /**
   * YouTube 영상 다운로드 (폴백 지원)
   *
   * Cloud Run 환경에서는 프록시 필수 (데이터센터 IP 차단)
   * 1차: yt-dlp + Residential Proxy
   * 2차: Invidious API (프록시 실패 시)
   */
  async downloadWithFallback(
    youtubeUrl: string,
    options?: Partial<DownloadOptions>
  ): Promise<DownloadResult> {
    const opts = this.mergeOptions(options);
    await fs.ensureDir(opts.outputDir);

    // 🚫 영상 길이 체크 (트래픽 절약) - 메타정보 조회는 트래픽 거의 안 씀
    try {
      const metaInfo = await this.getVideoInfoInternal(youtubeUrl, USE_PROXY);
      const durationMin = Math.floor(metaInfo.duration / 60);
      const durationSec = metaInfo.duration % 60;

      logger.info({
        title: metaInfo.title,
        duration: metaInfo.duration,
        durationStr: `${durationMin}분 ${durationSec}초`,
        maxAllowed: MAX_VIDEO_DURATION_SEC
      }, '영상 길이 확인');

      if (metaInfo.duration > MAX_VIDEO_DURATION_SEC) {
        const maxMin = Math.floor(MAX_VIDEO_DURATION_SEC / 60);
        throw new Error(
          `영상이 너무 깁니다: ${durationMin}분 ${durationSec}초 (최대 ${maxMin}분). ` +
          `트래픽 절약을 위해 ${maxMin}분 이하 영상만 지원합니다.`
        );
      }
    } catch (metaError) {
      // 메타정보 조회 실패해도 길이 제한 에러면 그대로 throw
      if ((metaError as Error).message.includes('영상이 너무 깁니다')) {
        throw metaError;
      }
      logger.warn({ error: metaError }, '메타정보 조회 실패, 다운로드 계속 진행');
    }

    // 1차: yt-dlp + 프록시 (Cloud Run 필수)
    if (USE_PROXY) {
      try {
        logger.info({ youtubeUrl }, '1차: yt-dlp + 프록시 다운로드 시도');
        return await this.downloadInternal(youtubeUrl, opts, true);
      } catch (proxyError) {
        const errorMsg = (proxyError as Error).message;
        logger.warn({ error: errorMsg }, '프록시 실패, Invidious 폴백');
      }
    } else {
      // 프록시 미설정 시 직접 시도
      try {
        logger.info({ youtubeUrl }, 'yt-dlp 직접 다운로드 시도 (프록시 미설정)');
        return await this.downloadInternal(youtubeUrl, opts, false);
      } catch (directError) {
        const errorMsg = (directError as Error).message;
        logger.warn({ error: errorMsg }, '직접 다운로드 실패, Invidious 폴백');
      }
    }

    // 2차: Invidious 폴백
    try {
      logger.info({ youtubeUrl }, '2차: Invidious 폴백 시도');
      const result = await this.invidiousClient.downloadVideo(youtubeUrl, opts);
      const subtitlePath = await this.invidiousClient.downloadSubtitle(youtubeUrl, opts);

      return {
        videoPath: result.videoPath,
        subtitlePath,
        title: result.title,
        duration: result.duration
      };
    } catch (invidiousError) {
      logger.error({ error: invidiousError }, 'Invidious 폴백도 실패');
      throw new Error(`YouTube 다운로드 실패 (모든 방법 실패): ${(invidiousError as Error).message}`);
    }
  }

  /**
   * 내부 다운로드 메서드 (프록시 옵션 지정)
   */
  private async downloadInternal(
    youtubeUrl: string,
    opts: DownloadOptions,
    useProxy: boolean
  ): Promise<DownloadResult> {
    // 1. 영상 정보 먼저 가져오기
    const videoInfo = await this.getVideoInfoInternal(youtubeUrl, useProxy);

    // 2. 영상 다운로드
    const videoPath = await this.downloadVideoInternal(youtubeUrl, opts, useProxy);

    // 3. 자막은 프록시 없이 시도 (트래픽 절약)
    const subtitlePath = await this.downloadSubtitle(youtubeUrl, opts);

    logger.info({
      videoPath,
      subtitlePath,
      title: videoInfo.title,
      usedProxy: useProxy
    }, 'YouTube 다운로드 완료');

    return {
      videoPath,
      subtitlePath,
      title: videoInfo.title,
      duration: videoInfo.duration
    };
  }

  /**
   * Proxy 설정 args 생성 (명시적 옵션)
   */
  private getProxyArgsExplicit(useProxy: boolean): string {
    if (!useProxy || !RESIDENTIAL_PROXY_URL) {
      return '';
    }
    logger.info('Residential Proxy 사용');
    return `--proxy "${RESIDENTIAL_PROXY_URL}"`;
  }

  /**
   * 영상 메타정보 조회 (프록시 옵션 지정)
   */
  private async getVideoInfoInternal(url: string, useProxy: boolean): Promise<{ title: string; duration: number }> {
    const proxyArgs = this.getProxyArgsExplicit(useProxy);
    const cmd = `yt-dlp ${proxyArgs} --print "%(title)s|||%(duration)s" "${url}"`.replace(/  +/g, ' ');

    logger.debug({ cmd, useProxy }, 'yt-dlp 메타정보 조회 명령');

    try {
      const { stdout } = await execAsync(cmd, { timeout: 30000 });
      const [title, durationStr] = stdout.trim().split('|||');

      return {
        title: this.sanitizeFilename(title),
        duration: parseInt(durationStr, 10) || 0
      };
    } catch (error) {
      logger.warn({ error, useProxy }, '영상 정보 조회 실패');
      throw error;
    }
  }

  /**
   * 영상 다운로드 (프록시 옵션 지정) - 480p로 트래픽 절약
   */
  private async downloadVideoInternal(url: string, opts: DownloadOptions, useProxy: boolean): Promise<string> {
    const outputTemplate = path.join(opts.outputDir, '%(title)s.%(ext)s');
    // 480p로 제한하여 트래픽 대폭 절약 (Politics용, Shorts는 어차피 세로 크롭)
    const maxHeight = opts.maxQuality || 480;
    const proxyArgs = this.getProxyArgsExplicit(useProxy);

    const videoCmd = [
      'yt-dlp',
      proxyArgs,
      `-f "bestvideo[height<=${maxHeight}]+bestaudio/best[height<=${maxHeight}]"`,
      '--merge-output-format mp4',
      `-o "${outputTemplate}"`,
      `"${url}"`
    ].filter(Boolean).join(' ').replace(/  +/g, ' ');

    logger.info({ cmd: videoCmd.substring(0, 200), useProxy, maxHeight }, 'yt-dlp 영상 다운로드');

    await execAsync(videoCmd, { maxBuffer: 50 * 1024 * 1024, timeout: 300000 });

    // 다운로드된 영상 파일 찾기
    const files = await fs.readdir(opts.outputDir);
    const videoFile = files.find(f => f.endsWith('.mp4'));

    if (!videoFile) {
      throw new Error('영상 다운로드 실패: mp4 파일을 찾을 수 없음');
    }

    return path.join(opts.outputDir, videoFile);
  }

  /**
   * 영상 다운로드 (자막 별도)
   *
   * 영상과 자막을 분리하여 다운로드. 자막 실패는 영상에 영향 없음.
   */
  private async downloadVideo(url: string, opts: DownloadOptions): Promise<string> {
    const outputTemplate = path.join(opts.outputDir, '%(title)s.%(ext)s');
    const maxHeight = opts.maxQuality || 480;
    const proxyArgs = this.getProxyArgsExplicit(USE_PROXY);

    // 1. 영상만 먼저 다운로드
    const videoCmd = [
      'yt-dlp',
      proxyArgs,
      `-f "bestvideo[height<=${maxHeight}]+bestaudio/best[height<=${maxHeight}]"`,
      '--merge-output-format mp4',
      `-o "${outputTemplate}"`,
      `"${url}"`
    ].filter(Boolean).join(' ');

    logger.info({ cmd: videoCmd, useProxy: USE_PROXY }, 'yt-dlp 영상 다운로드 명령');

    await execAsync(videoCmd, { maxBuffer: 50 * 1024 * 1024 });

    // 2. 자막 다운로드 시도 (프록시 사용, 딜레이 후 실행)
    const langs = opts.subtitleLang || ['ko', 'en'];
    const subtitleTemplate = path.join(opts.outputDir, '%(title)s');

    // 영상 다운로드 후 5초 대기 (레이트 리밋 회피)
    logger.info('자막 다운로드 전 5초 대기 (레이트 리밋 회피)');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 프록시로 자막 다운로드 시도
    const subtitleCmd = [
      'yt-dlp',
      proxyArgs,
      '--skip-download',
      '--write-auto-sub',
      `--sub-lang "${langs.join(',')}"`,
      '--convert-subs srt',
      `-o "${subtitleTemplate}"`,
      `"${url}"`
    ].filter(Boolean).join(' ');

    try {
      logger.info({ langs, useProxy: USE_PROXY }, '자막 다운로드 시도');
      await execAsync(subtitleCmd, { timeout: 60000 });
      logger.info('자막 다운로드 완료');
    } catch (proxyError) {
      logger.warn({ error: (proxyError as Error).message }, '프록시로 자막 실패, Invidious 폴백');

      // Invidious 폴백
      try {
        const subtitlePath = await this.invidiousClient.downloadSubtitle(url, opts);
        if (subtitlePath) {
          logger.info({ subtitlePath }, 'Invidious 자막 다운로드 성공');
        }
      } catch (invidiousError) {
        logger.warn({ error: (invidiousError as Error).message }, 'Invidious 자막도 실패');
      }
    }

    // 다운로드된 영상 파일 찾기
    const files = await fs.readdir(opts.outputDir);
    const videoFile = files.find(f => f.endsWith('.mp4'));

    if (!videoFile) {
      throw new Error('영상 다운로드 실패: mp4 파일을 찾을 수 없음');
    }

    return path.join(opts.outputDir, videoFile);
  }

  /**
   * 자막 파일 찾기
   *
   * downloadVideo에서 이미 자막을 함께 다운로드했으므로,
   * 이 함수는 다운로드된 자막 파일만 찾습니다.
   */
  private async downloadSubtitle(
    _url: string,
    opts: DownloadOptions
  ): Promise<string | null> {
    try {
      const files = await fs.readdir(opts.outputDir);
      const srtFile = files.find(f => f.endsWith('.srt'));

      if (srtFile) {
        logger.info({ srtFile }, '자막 파일 발견');
        return path.join(opts.outputDir, srtFile);
      }

      logger.warn('자막 파일이 없습니다 (영상에 자막이 없을 수 있음)');
      return null;
    } catch (error) {
      logger.warn({ error }, '자막 파일 검색 실패');
      return null;
    }
  }

  /**
   * 파일명에 사용할 수 없는 문자 제거
   */
  private sanitizeFilename(name: string): string {
    return name.replace(/[<>:"/\\|?*]/g, '').substring(0, 100);
  }

  /**
   * 옵션 병합
   */
  private mergeOptions(options?: Partial<DownloadOptions>): DownloadOptions {
    return {
      outputDir: this.outputDir,
      subtitleLang: ['ko', 'en'],
      maxQuality: 1080,
      ...options
    };
  }
}
