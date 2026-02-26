/**
 * AutoClonePipelineService — 전자동 오케스트레이터 (n8n 메인 워크플로우)
 *
 * 전체 파이프라인을 하나의 API 호출로 실행:
 *   1. TrendAggregator.discover()       → 상위 트렌드
 *   2. VideoDiscovery.search()          → 레퍼런스 영상
 *   3. YouTubeDownloader.download()     → MP4
 *   4. GeminiAnalyzer.analyzeWithContent() → StyleDNA + ContentDNA
 *   5. ContentRewriter.rewrite()        → VideoCloneContent
 *   6. VideoCloneService.clone()        → 영상 파일
 *   7. (optional) YouTube Upload        → YouTube Shorts 게시
 *
 * Input:  AutoCloneRequest
 * Output: AutoCloneResult
 */

import path from 'path';
import fs from 'fs-extra';
import { Config, logger } from '../../config';
import { TrendAggregatorService } from './TrendAggregatorService';
import { VideoDiscoveryService } from './VideoDiscoveryService';
import { ContentRewriterService } from './ContentRewriterService';
import { GeminiVideoAnalyzerService } from './GeminiVideoAnalyzerService';
import { YouTubeDownloaderService } from './YouTubeDownloaderService';
import { VideoCloneService } from './VideoCloneService';
import type {
  AutoCloneRequest,
  AutoCloneResult,
  AggregatedTrend,
  DiscoveredVideo,
  VideoGenProvider,
} from '../types';

export class AutoClonePipelineService {
  private config: Config;
  private aggregator: TrendAggregatorService;
  private discovery: VideoDiscoveryService;
  private rewriter: ContentRewriterService;
  private analyzer: GeminiVideoAnalyzerService;
  private downloader: YouTubeDownloaderService;
  private cloner: VideoCloneService;

  constructor(config: Config) {
    this.config = config;
    const apiKey = config.googleGeminiApiKey || '';
    const cacheDir = path.join(config.tempDirPath, 'trend-cache');

    this.aggregator = new TrendAggregatorService(apiKey, cacheDir);
    this.discovery = new VideoDiscoveryService(apiKey);
    this.rewriter = new ContentRewriterService(apiKey);
    this.analyzer = new GeminiVideoAnalyzerService(apiKey);
    this.downloader = new YouTubeDownloaderService(config.tempDirPath);
    this.cloner = new VideoCloneService(config);
  }

  async run(request: AutoCloneRequest): Promise<AutoCloneResult> {
    const timing: Record<string, number> = {};
    const costs: Record<string, number> = {};
    let trend: AggregatedTrend | undefined;
    let refVideo: DiscoveredVideo | undefined;

    try {
      // ========== Phase 0: 트렌드 발견 ==========
      const t0 = Date.now();
      logger.info({ request }, '[AutoClone] Starting pipeline');

      if (request.trendKeyword) {
        // 지정 키워드 사용
        trend = {
          keyword: request.trendKeyword,
          normalizedKeyword: request.trendKeyword.toLowerCase(),
          totalScore: 100,
          platformCount: 1,
          sources: [],
          estimatedNiche: 'education',
        };
      } else {
        // 자동 발견
        const discoveryResult = await this.aggregator.discover({
          region: 'KR',
          maxResults: 10,
        });

        if (!discoveryResult.success || !discoveryResult.trends || discoveryResult.trends.length === 0) {
          return { success: false, error: 'No trends discovered' };
        }

        trend = discoveryResult.trends[0]; // 최고 점수 트렌드
      }

      timing.discoveryMs = Date.now() - t0;
      costs.trendDiscovery = 0; // 스크래핑은 무료

      logger.info(
        { keyword: trend.keyword, score: trend.totalScore, niche: trend.estimatedNiche },
        '[AutoClone] Phase 0 — Trend selected'
      );

      // ========== Phase 1: 레퍼런스 영상 검색 ==========
      const t1 = Date.now();
      const maxRef = request.maxReferenceVideos || 3;
      const videos = await this.discovery.search(trend.keyword, maxRef);

      if (videos.length === 0) {
        return {
          success: false,
          trendUsed: trend,
          error: `No reference videos found for keyword: ${trend.keyword}`,
        };
      }

      refVideo = videos[0]; // 최고 engagement 영상
      timing.searchMs = Date.now() - t1;

      logger.info(
        { url: refVideo.url, views: refVideo.views, engagement: refVideo.engagementRate },
        '[AutoClone] Phase 1 — Reference video selected'
      );

      // ========== Phase 2: 다운로드 ==========
      const t2 = Date.now();
      const downloadResult = await this.downloader.download({ url: refVideo.url });

      if (!downloadResult.success || !downloadResult.videoPath) {
        return {
          success: false,
          trendUsed: trend,
          referenceVideoAnalyzed: refVideo,
          error: `Download failed: ${downloadResult.error}`,
        };
      }

      timing.downloadMs = Date.now() - t2;
      logger.info('[AutoClone] Phase 2 — Download complete');

      // ========== Phase 3: 분석 (StyleDNA + ContentDNA) ==========
      const t3 = Date.now();
      const analysisResult = await this.analyzer.analyzeWithContent({
        videoPath: downloadResult.videoPath,
      });

      if (!analysisResult.success || !analysisResult.styleDNA || !analysisResult.contentDNA) {
        return {
          success: false,
          trendUsed: trend,
          referenceVideoAnalyzed: refVideo,
          error: `Analysis failed: ${analysisResult.error}`,
        };
      }

      timing.analysisMs = Date.now() - t3;
      costs.analysis = this.analyzer.getCostEstimate();

      logger.info(
        { topic: analysisResult.contentDNA.topic, hookType: analysisResult.contentDNA.hook.type },
        '[AutoClone] Phase 3 — Analysis complete'
      );

      // ========== Phase 4: 콘텐츠 재창작 ==========
      const t4 = Date.now();
      const rewritten = await this.rewriter.rewrite(
        analysisResult.contentDNA,
        request.targetLanguage || 'ko'
      );

      if (!rewritten) {
        return {
          success: false,
          trendUsed: trend,
          referenceVideoAnalyzed: refVideo,
          contentDNA: analysisResult.contentDNA,
          styleDNA: analysisResult.styleDNA,
          error: 'Content rewrite failed',
        };
      }

      timing.rewriteMs = Date.now() - t4;
      costs.contentRewrite = this.rewriter.getCostEstimate();

      logger.info(
        { title: rewritten.title, points: rewritten.mainPoints.length },
        '[AutoClone] Phase 4 — Content rewritten'
      );

      // ========== Phase 5: 영상 생성 (기존 clone 파이프라인) ==========
      const t5 = Date.now();
      const provider = request.provider || ('kenburns' as VideoGenProvider);

      const cloneResult = await this.cloner.clone({
        referenceUrl: refVideo.url,
        content: rewritten,
        provider,
        forceStyleProfile: undefined, // 매번 새로 분석
      });

      timing.videoGenMs = Date.now() - t5;

      if (!cloneResult.success) {
        return {
          success: false,
          trendUsed: trend,
          referenceVideoAnalyzed: refVideo,
          contentDNA: analysisResult.contentDNA,
          styleDNA: analysisResult.styleDNA,
          rewrittenContent: rewritten,
          error: `Video generation failed: ${cloneResult.error}`,
        };
      }

      // ========== Phase 6: 업로드 (optional) ==========
      let uploadResult: { youtubeVideoId: string; url: string } | undefined;

      // YouTube 업로드는 channelName이 있을 때만
      // 실제 업로드 로직은 별도 노드로 분리 가능
      // 여기서는 생략 (기존 YouTubeUploader 통합은 별도 작업)

      // ========== 결과 ==========
      const totalMs = Date.now() - t0;

      const result: AutoCloneResult = {
        success: true,
        trendUsed: trend,
        referenceVideoAnalyzed: refVideo,
        contentDNA: analysisResult.contentDNA,
        styleDNA: analysisResult.styleDNA,
        rewrittenContent: rewritten,
        outputVideoPath: cloneResult.outputVideoPath,
        uploadResult,
        costs: {
          analysis: costs.analysis || 0,
          videoGeneration: cloneResult.costs?.videoGeneration || 0,
          tts: cloneResult.costs?.tts || 0,
          total: (costs.analysis || 0) + (costs.contentRewrite || 0) + (cloneResult.costs?.total || 0),
          trendDiscovery: 0,
          contentRewrite: costs.contentRewrite || 0,
        },
        timing: {
          downloadMs: timing.downloadMs || 0,
          analysisMs: timing.analysisMs || 0,
          videoGenMs: timing.videoGenMs || 0,
          totalMs,
          discoveryMs: timing.discoveryMs || 0,
          searchMs: timing.searchMs || 0,
          rewriteMs: timing.rewriteMs || 0,
        },
      };

      logger.info(
        { totalMs, costs: result.costs, outputPath: result.outputVideoPath },
        '[AutoClone] Pipeline complete!'
      );

      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({ error: msg }, '[AutoClone] Pipeline failed');
      return {
        success: false,
        trendUsed: trend,
        referenceVideoAnalyzed: refVideo,
        error: msg,
      };
    }
  }
}
