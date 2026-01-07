/**
 * YouTube to Shorts Workflow
 *
 * YouTube 영상을 Shorts로 변환하는 전체 워크플로우를 관리합니다.
 * YouTube 자동 업로드 기능 포함.
 */

import path from 'path';
import fs from 'fs-extra';
import crypto from 'crypto';
import { logger } from '../../logger';
import { Config } from '../../config';
import { GoogleCloudStorageService } from '../../storage/GoogleCloudStorageService';
import { YouTubeUploader } from '../../youtube-upload/services/YouTubeUploader';

// Core modules
import { YouTubeDownloader } from '../core/downloader';
import { SRTParser } from '../core/parser';
import { HighlightAnalyzer } from '../core/analyzer';
import { SubtitleBurner, VerticalCropper } from '../core/processor';
import { TextOverlayProcessor, OverlayOptions, DEFAULT_OVERLAY_OPTIONS } from '../core/overlay';

// Types
import {
  WorkflowInput,
  WorkflowOptions,
  WorkflowResult,
  ShortOutput,
  JobStatus,
  Highlight,
  YouTubeUploadOptions
} from './types';

const DEFAULT_OPTIONS: WorkflowOptions = {
  outputCount: 3,
  clipDuration: { min: 30, max: 60 },
  autoAnalyze: false,  // Politics: 균등 분할 사용 (자막 분석 없음)
  combineOutput: true,  // 기본값: 여러 클립을 하나로 합침
  // 오버레이 옵션 (정적 텍스트 모드가 기본)
  overlayOptions: {
    mode: 'static',
    static: {
      position: 'top',
      fontSize: 36,
      fontColor: 'white',
      outlineColor: 'black',
      outlineWidth: 2,
      marginY: 50
    }
  }
};

export class YouTubeToShortsWorkflow {
  private baseDir: string;
  private downloader: YouTubeDownloader;
  private parser: SRTParser;
  private _analyzer: HighlightAnalyzer | null = null;
  private burner: SubtitleBurner;
  private cropper: VerticalCropper;
  private overlayProcessor: TextOverlayProcessor;
  private _gcsService: GoogleCloudStorageService | null = null;
  private _youtubeUploader: YouTubeUploader | null = null;
  private _config: Config | null = null;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    this.downloader = new YouTubeDownloader(baseDir);
    this.parser = new SRTParser();
    // analyzer is lazy-initialized (only when needed)
    this.burner = new SubtitleBurner();
    this.cropper = new VerticalCropper();
    this.overlayProcessor = new TextOverlayProcessor();
  }

  /**
   * Lazy initialization of Config
   */
  private get config(): Config {
    if (!this._config) {
      this._config = new Config();
    }
    return this._config;
  }

  /**
   * Lazy initialization of GCS service
   */
  private get gcsService(): GoogleCloudStorageService | null {
    if (this._gcsService === null) {
      try {
        if (this.config.gcsBucketName) {
          this._gcsService = new GoogleCloudStorageService(this.config);
        }
      } catch (error) {
        logger.warn('GCS service not available, skipping upload');
      }
    }
    return this._gcsService;
  }

  /**
   * Lazy initialization of YouTube Uploader
   */
  private get youtubeUploader(): YouTubeUploader | null {
    if (this._youtubeUploader === null) {
      try {
        this._youtubeUploader = new YouTubeUploader(this.config);
        logger.info('YouTube Uploader initialized');
      } catch (error) {
        logger.warn({ error }, 'YouTube Uploader not available');
      }
    }
    return this._youtubeUploader;
  }

  /**
   * Lazy initialization of HighlightAnalyzer (requires GEMINI_API_KEY)
   */
  private get analyzer(): HighlightAnalyzer {
    if (!this._analyzer) {
      this._analyzer = new HighlightAnalyzer();
    }
    return this._analyzer;
  }

  /**
   * 전체 워크플로우 실행
   * - youtubeUrls: 여러 URL → 각각에서 하이라이트 1개씩 추출 → 합침
   * - youtubeUrl: 단일 URL → 1개 영상에서 여러 하이라이트 추출 → 합침
   */
  async run(input: WorkflowInput): Promise<WorkflowResult> {
    const jobId = crypto.randomUUID();
    const options = { ...DEFAULT_OPTIONS, ...input.options };
    const jobDir = path.join(this.baseDir, jobId);

    // 여러 URL 모드 vs 단일 URL 모드 결정
    const urls = input.youtubeUrls && input.youtubeUrls.length > 0
      ? input.youtubeUrls
      : input.youtubeUrl
        ? [input.youtubeUrl]
        : [];

    if (urls.length === 0) {
      return {
        jobId,
        status: 'failed',
        outputs: [],
        error: 'youtubeUrl or youtubeUrls is required'
      };
    }

    const isMultiUrlMode = urls.length > 1;
    logger.info({
      jobId,
      urlCount: urls.length,
      isMultiUrlMode
    }, '워크플로우 시작');

    try {
      let outputs: ShortOutput[] = [];

      if (isMultiUrlMode) {
        // 여러 URL 모드: 각 URL에서 하이라이트 1개씩 추출
        outputs = await this.processMultipleUrls(urls, jobDir, options);
      } else {
        // 단일 URL 모드: 기존 로직 (1개 영상에서 여러 하이라이트)
        outputs = await this.processSingleUrl(urls[0], jobDir, options);
      }

      // 클립 결합 (옵션)
      if (options.combineOutput && outputs.length > 1) {
        const combinedOutput = await this.combineOutputs(outputs, jobDir);
        if (combinedOutput) {
          outputs.unshift(combinedOutput);  // 결합본을 맨 앞에 추가
        }
      }

      // YouTube 업로드 (옵션)
      if (options.youtubeUpload?.enabled && outputs.length > 0) {
        // 결합본이 있으면 결합본만 업로드, 없으면 첫 번째 클립 업로드
        const targetOutput = outputs[0];
        const uploadResult = await this.uploadToYouTube(
          targetOutput,
          options.youtubeUpload,
          jobId
        );

        if (uploadResult) {
          targetOutput.youtube = uploadResult;
        }
      }

      // Step 7: 임시 파일 정리 (최종 결과물만 보존)
      await this.cleanup(jobDir, outputs);

      logger.info({
        jobId,
        outputCount: outputs.length,
        combined: options.combineOutput,
        youtubeUploaded: !!outputs[0]?.youtube
      }, '워크플로우 완료');

      return {
        jobId,
        status: 'completed',
        outputs
      };

    } catch (error) {
      logger.error({ jobId, error }, '워크플로우 실패');

      // 실패 시에도 정리
      try {
        await fs.remove(jobDir);
        logger.info({ jobDir }, '실패한 작업 디렉토리 삭제');
      } catch (cleanupError) {
        logger.warn({ cleanupError }, '정리 실패');
      }

      return {
        jobId,
        status: 'failed',
        outputs: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * 여러 URL 처리: 각 URL에서 하이라이트 1개씩 추출
   */
  private async processMultipleUrls(
    urls: string[],
    jobDir: string,
    options: WorkflowOptions
  ): Promise<ShortOutput[]> {
    logger.info({ urlCount: urls.length }, '여러 URL 모드: 각 영상에서 하이라이트 1개씩 추출');

    const outputs: ShortOutput[] = [];
    const shortsDir = path.join(jobDir, 'shorts');
    await fs.ensureDir(shortsDir);

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const urlDir = path.join(jobDir, `video_${i + 1}`);

      logger.info({ index: i + 1, url }, `영상 ${i + 1}/${urls.length} 처리 시작`);

      try {
        // 다운로드 (자막 없이 영상만)
        const downloadResult = await this.download(url, urlDir, options);

        // 하이라이트 분석 (1개만, 균등 분할)
        const highlights = await this.analyze(
          [],  // 자막 없음 → 균등 분할
          downloadResult.title,
          downloadResult.duration,
          { ...options, outputCount: 1 }  // 1개만 추출
        );

        if (highlights.length === 0) {
          logger.warn({ url }, '하이라이트 없음, 스킵');
          continue;
        }

        const highlight = highlights[0];
        const outputPath = path.join(shortsDir, `short_${i + 1}.mp4`);

        // 클립 생성 (정적 텍스트 오버레이)
        const maxDuration = options.clipDuration?.max || 60;
        const endSec = Math.min(highlight.endSec, highlight.startSec + maxDuration);

        // 오버레이 옵션 구성
        // 사용자 지정 텍스트가 없으면 영상 제목을 기본값으로 사용
        const overlayOpts: OverlayOptions = {
          mode: options.overlayOptions?.mode || 'static',
          static: {
            ...options.overlayOptions?.static,
            text: options.overlayOptions?.static?.text || downloadResult.title
          }
        };

        await this.overlayProcessor.apply(
          downloadResult.videoPath,
          outputPath,
          overlayOpts,
          highlight.startSec,
          endSec
        );

        // GCS 업로드
        let downloadUrl: string | undefined;
        let gcsPath: string | undefined;
        if (this.gcsService) {
          try {
            const gcsFileName = `politics/${path.basename(outputPath)}`;
            const uploadResult = await this.gcsService.uploadVideo(
              gcsFileName.replace('.mp4', ''),
              outputPath
            );
            if (uploadResult.success && uploadResult.signedUrl) {
              downloadUrl = uploadResult.signedUrl;
              gcsPath = uploadResult.gcsPath;
            }
          } catch (error) {
            logger.warn({ error }, 'GCS 업로드 실패');
          }
        }

        outputs.push({
          path: outputPath,
          title: highlight.title || downloadResult.title,
          duration: endSec - highlight.startSec,
          highlight,
          downloadUrl,
          gcsPath
        });

        logger.info({
          index: i + 1,
          title: highlight.title,
          duration: endSec - highlight.startSec
        }, `영상 ${i + 1}/${urls.length} 처리 완료`);

      } catch (error) {
        logger.error({ error, url }, `영상 ${i + 1} 처리 실패`);
        // 계속 진행 (다른 영상 처리)
      }
    }

    return outputs;
  }

  /**
   * 단일 URL 처리: 1개 영상에서 여러 하이라이트 추출 (기존 로직)
   */
  private async processSingleUrl(
    youtubeUrl: string,
    jobDir: string,
    options: WorkflowOptions
  ): Promise<ShortOutput[]> {
    logger.info({ youtubeUrl }, '단일 URL 모드: 1개 영상에서 여러 하이라이트 추출');

    // Step 1: 다운로드 (자막 없이 영상만)
    const downloadResult = await this.download(youtubeUrl, jobDir, options);

    // Step 2: 하이라이트 분석 (균등 분할)
    const highlights = await this.analyze(
      [],  // 자막 없음 → 균등 분할
      downloadResult.title,
      downloadResult.duration,
      options
    );

    // Step 3: Shorts 생성 (정적 텍스트 오버레이)
    return this.processWithOverlay(
      downloadResult.videoPath,
      downloadResult.title,  // 영상 제목을 정적 텍스트로 사용
      highlights,
      jobDir,
      options
    );
  }

  /**
   * Step 1: YouTube 영상 다운로드
   *
   * yt-dlp + Residential Proxy 실패 시 Invidious API로 폴백
   */
  private async download(
    youtubeUrl: string,
    outputDir: string,
    options: WorkflowOptions
  ) {
    logger.info('Step 1: 다운로드 시작 (폴백 지원)');

    // downloadWithFallback: yt-dlp 실패 시 Invidious로 자동 폴백
    return this.downloader.downloadWithFallback(youtubeUrl, {
      outputDir
    });
  }

  /**
   * Step 2: 자막 파싱
   */
  private async parse(subtitlePath: string | null) {
    logger.info('Step 2: 자막 파싱');

    if (!subtitlePath) {
      throw new Error('자막 파일이 없습니다');
    }

    return this.parser.parseFile(subtitlePath);
  }

  /**
   * Step 3: 하이라이트 분석
   */
  private async analyze(
    entries: { index: number; startSec: number; endSec: number; text: string }[],
    title: string,
    duration: number,
    options: WorkflowOptions
  ): Promise<Highlight[]> {
    logger.info('Step 3: 하이라이트 분석');

    const outputCount = options.outputCount || 3;

    // 자동 분석 비활성화 또는 자막 없을 때 균등 분할
    if (!options.autoAnalyze || entries.length === 0) {
      logger.info('자막 없음 또는 autoAnalyze=false, 균등 분할 사용');
      return this.createEvenHighlights(duration, outputCount);
    }

    try {
      const highlights = await this.analyzer.analyze(entries, {
        title,
        duration,
        maxHighlights: outputCount
      });

      // AI 분석 결과가 비어있으면 균등 분할로 fallback
      if (!highlights || highlights.length === 0) {
        logger.warn('AI 분석 결과 없음, 균등 분할로 fallback');
        return this.createEvenHighlights(duration, outputCount);
      }

      // 요청한 개수보다 적으면 균등 분할로 보충
      if (highlights.length < outputCount) {
        logger.warn({
          requested: outputCount,
          received: highlights.length
        }, 'AI 분석 결과 부족, 균등 분할로 보충');

        const additionalCount = outputCount - highlights.length;
        const additional = this.createEvenHighlights(duration, additionalCount);
        return [...highlights, ...additional].slice(0, outputCount);
      }

      return highlights;
    } catch (error) {
      logger.error({ error }, 'AI 분석 실패, 균등 분할로 fallback');
      return this.createEvenHighlights(duration, outputCount);
    }
  }

  /**
   * 균등 분할 하이라이트 생성
   */
  private createEvenHighlights(duration: number, count: number): Highlight[] {
    const clipDuration = 45; // 45초
    const interval = duration / count;

    return Array.from({ length: count }, (_, i) => ({
      startSec: i * interval,
      endSec: Math.min(i * interval + clipDuration, duration),
      title: `Part ${i + 1}`,
      reason: 'Auto-generated segment'
    }));
  }

  /**
   * Step 3: Shorts 영상 생성 (정적 텍스트 오버레이)
   */
  private async processWithOverlay(
    videoPath: string,
    videoTitle: string,
    highlights: Highlight[],
    outputDir: string,
    options: WorkflowOptions
  ): Promise<ShortOutput[]> {
    logger.info({ highlightCount: highlights.length }, 'Step 3: Shorts 생성 (오버레이)');

    const outputs: ShortOutput[] = [];
    const shortsDir = path.join(outputDir, 'shorts');
    await fs.ensureDir(shortsDir);

    for (let i = 0; i < highlights.length; i++) {
      const highlight = highlights[i];
      const outputPath = path.join(shortsDir, `short_${i + 1}.mp4`);

      // 클립 길이 제한
      const maxDuration = options.clipDuration?.max || 60;
      const endSec = Math.min(
        highlight.endSec,
        highlight.startSec + maxDuration
      );

      // 오버레이 옵션 구성
      // 사용자 지정 텍스트가 없으면 영상 제목을 기본값으로 사용
      const overlayOpts: OverlayOptions = {
        mode: options.overlayOptions?.mode || 'static',
        static: {
          ...options.overlayOptions?.static,
          text: options.overlayOptions?.static?.text || videoTitle
        }
      };

      // 오버레이 적용
      await this.overlayProcessor.apply(
        videoPath,
        outputPath,
        overlayOpts,
        highlight.startSec,
        endSec
      );

      // GCS 업로드 (사용 가능한 경우)
      let downloadUrl: string | undefined;
      let gcsPath: string | undefined;

      if (this.gcsService) {
        try {
          const gcsFileName = `politics/${path.basename(outputPath)}`;
          const uploadResult = await this.gcsService.uploadVideo(
            gcsFileName.replace('.mp4', ''),
            outputPath
          );

          if (uploadResult.success && uploadResult.signedUrl) {
            downloadUrl = uploadResult.signedUrl;
            gcsPath = uploadResult.gcsPath;
            logger.info({ gcsPath }, 'Short GCS 업로드 완료');
          }
        } catch (error) {
          logger.warn({ error }, 'GCS 업로드 실패, 로컬 경로만 반환');
        }
      }

      outputs.push({
        path: outputPath,
        title: highlight.title,
        duration: endSec - highlight.startSec,
        highlight,
        downloadUrl,
        gcsPath
      });

      logger.info({
        index: i + 1,
        title: highlight.title,
        duration: endSec - highlight.startSec,
        hasDownloadUrl: !!downloadUrl
      }, 'Short 생성 완료');
    }

    return outputs;
  }

  /**
   * Step 5: 여러 클립을 하나로 결합
   */
  private async combineOutputs(
    outputs: ShortOutput[],
    outputDir: string
  ): Promise<ShortOutput | null> {
    logger.info({ clipCount: outputs.length }, 'Step 5: 클립 결합');

    const clipPaths = outputs.map(o => o.path);
    const combinedPath = path.join(outputDir, 'shorts', 'combined.mp4');

    try {
      await this.burner.combineClips(clipPaths, combinedPath);

      // 총 duration 계산
      const totalDuration = outputs.reduce((sum, o) => sum + o.duration, 0);

      // GCS 업로드 (사용 가능한 경우)
      let downloadUrl: string | undefined;
      let gcsPath: string | undefined;

      if (this.gcsService) {
        try {
          const gcsFileName = `politics/combined_${Date.now()}`;
          const uploadResult = await this.gcsService.uploadVideo(
            gcsFileName,
            combinedPath
          );

          if (uploadResult.success && uploadResult.signedUrl) {
            downloadUrl = uploadResult.signedUrl;
            gcsPath = uploadResult.gcsPath;
            logger.info({ gcsPath }, '결합 영상 GCS 업로드 완료');
          }
        } catch (error) {
          logger.warn({ error }, 'GCS 업로드 실패, 로컬 경로만 반환');
        }
      }

      const combinedOutput: ShortOutput = {
        path: combinedPath,
        title: 'Combined Highlights',
        duration: totalDuration,
        highlight: {
          startSec: 0,
          endSec: totalDuration,
          title: 'Combined Highlights',
          reason: `${outputs.length}개 하이라이트 결합`
        },
        downloadUrl,
        gcsPath
      };

      logger.info({
        combinedPath,
        totalDuration,
        clipCount: outputs.length
      }, '클립 결합 완료');

      return combinedOutput;
    } catch (error) {
      logger.error({ error }, '클립 결합 실패');
      return null;
    }
  }

  /**
   * Step 6: YouTube 업로드
   *
   * 생성된 영상을 YouTube에 업로드합니다.
   */
  private async uploadToYouTube(
    output: ShortOutput,
    uploadOptions: YouTubeUploadOptions,
    jobId: string
  ): Promise<{ videoId: string; url: string; channelName: string } | null> {
    logger.info({
      channelName: uploadOptions.channelName,
      title: uploadOptions.title || output.title,
      outputPath: output.path
    }, 'Step 6: YouTube 업로드 시작');

    if (!this.youtubeUploader) {
      logger.error('YouTube Uploader가 초기화되지 않았습니다');
      return null;
    }

    try {
      // 채널 인증 확인
      if (!this.youtubeUploader.isChannelAuthenticated(uploadOptions.channelName)) {
        logger.error({
          channelName: uploadOptions.channelName
        }, '채널이 인증되지 않았습니다. 먼저 OAuth 인증을 완료하세요.');
        return null;
      }

      // 비디오 파일을 videos 디렉토리로 복사 (YouTubeUploader 규격)
      const videoId = `politics_${jobId}`;
      const targetPath = path.join(this.config.videosDirPath, `${videoId}.mp4`);
      await fs.copy(output.path, targetPath);

      // 업로드 메타데이터 설정
      const metadata = {
        title: uploadOptions.title || output.title || `정치 하이라이트 ${new Date().toLocaleDateString('ko-KR')}`,
        description: uploadOptions.description || `
🔥 오늘의 정치 하이라이트

자동으로 생성된 정치 뉴스 하이라이트입니다.

#정치 #뉴스 #하이라이트 #Shorts
`.trim(),
        tags: uploadOptions.tags || ['정치', '뉴스', '하이라이트', 'Shorts', 'politics'],
        privacyStatus: uploadOptions.privacyStatus || 'unlisted',
        categoryId: '25',  // News & Politics
        defaultLanguage: 'ko'
      };

      // YouTube 업로드 실행
      const youtubeVideoId = await this.youtubeUploader.uploadVideo(
        videoId,
        uploadOptions.channelName,
        metadata,
        uploadOptions.notifySubscribers || false,
        uploadOptions.subChannel
      );

      const youtubeUrl = `https://www.youtube.com/watch?v=${youtubeVideoId}`;

      logger.info({
        youtubeVideoId,
        youtubeUrl,
        channelName: uploadOptions.channelName
      }, 'YouTube 업로드 완료');

      // 임시 파일 정리
      try {
        await fs.remove(targetPath);
      } catch (e) {
        // 무시
      }

      return {
        videoId: youtubeVideoId,
        url: youtubeUrl,
        channelName: uploadOptions.channelName
      };

    } catch (error) {
      logger.error({ error, channelName: uploadOptions.channelName }, 'YouTube 업로드 실패');
      return null;
    }
  }

  /**
   * Step 7: 임시 파일 정리
   *
   * GCS에 업로드된 파일만 보존하고 나머지 삭제
   * - 원본 다운로드 영상: 삭제
   * - 중간 클립: 삭제
   * - 자막 파일: 삭제
   * - 최종 결합본: GCS 업로드 후 삭제
   */
  private async cleanup(jobDir: string, outputs: ShortOutput[]): Promise<void> {
    logger.info({ jobDir }, 'Step 7: 임시 파일 정리 시작');

    try {
      // GCS 업로드된 파일 경로 수집
      const uploadedPaths = outputs
        .filter(o => o.gcsPath)
        .map(o => o.path);

      // 전체 job 디렉토리에서 비디오 관련 폴더 삭제
      const entries = await fs.readdir(jobDir, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = path.join(jobDir, entry.name);

        // shorts 폴더는 보존 (GCS 업로드 안된 경우 로컬에서 접근 가능하도록)
        if (entry.name === 'shorts') {
          // shorts 내부의 개별 클립만 삭제, combined.mp4는 보존
          const shortsFiles = await fs.readdir(entryPath);
          for (const file of shortsFiles) {
            if (file.startsWith('short_') && file.endsWith('.mp4')) {
              const filePath = path.join(entryPath, file);
              // GCS에 업로드된 경우에만 삭제
              if (uploadedPaths.length > 0) {
                await fs.remove(filePath);
                logger.debug({ filePath }, '개별 클립 삭제');
              }
            }
          }
          continue;
        }

        // video_N 폴더 (다운로드된 원본) 삭제
        if (entry.isDirectory() && entry.name.startsWith('video_')) {
          await fs.remove(entryPath);
          logger.debug({ entryPath }, '원본 영상 폴더 삭제');
        }
      }

      // 정리 완료 로그
      const remainingFiles = await fs.readdir(jobDir, { withFileTypes: true });
      logger.info({
        jobDir,
        remaining: remainingFiles.map(e => e.name),
        deletedCount: entries.length - remainingFiles.length
      }, '임시 파일 정리 완료');

    } catch (error) {
      logger.warn({ error, jobDir }, '임시 파일 정리 중 오류 (계속 진행)');
    }
  }
}
