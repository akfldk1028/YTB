/**
 * Books API Router — 핸들러 위임 패턴
 *
 * 모든 라우트 핸들러는 handlers/ 폴더에 분리.
 * 이 파일은 RouterContext 구현 + 핸들러 등록만 담당.
 *
 * handlers/
 * ├── types.ts                 — RouterContext 인터페이스
 * ├── episodeHandler.ts        — Episode CRUD
 * ├── videoGenerationHandler.ts — 비디오 생성 파이프라인
 * ├── youtubePublishHandler.ts — YouTube 업로드/자동 파이프라인
 * ├── contentPlanningHandler.ts — 커리큘럼/분석/에피소드 생성
 * ├── notebookLMHandler.ts     — NotebookLM export/import/rechunk
 * ├── longFormHandler.ts       — 롱폼 컴필레이션
 * ├── booksDataHandler.ts      — Books CRUD/검색/다운로드
 * └── testHandler.ts           — v12.0 모듈별 테스트
 */

import { Router } from 'express';
import { Neo4jService, createNeo4jService } from '../services/Neo4jService';
import { ContentPlannerService, createContentPlannerService, ShortsPlan } from '../services/ContentPlannerService';
import { EpisodeOrchestrator } from '../orchestration/EpisodeOrchestrator';
import type { VideoStyleProfile } from '../styles';
import type { EpisodeWithScenes } from '../types';
import type { RouterContext, ContentPlannerOptions, VideoPipelineResult } from './handlers/types';

import {
  registerEpisodeRoutes,
  registerVideoGenerationRoutes,
  registerYouTubePublishRoutes,
  registerContentPlanningRoutes,
  registerNotebookLMRoutes,
  registerLongFormRoutes,
  registerBooksDataRoutes,
  registerTestRoutes,
} from './handlers';

export class BooksRouter implements RouterContext {
  public router: Router;
  private neo4jService: Neo4jService | null = null;
  private contentPlannerService: ContentPlannerService | null = null;
  public orchestrator = new EpisodeOrchestrator();
  public plansCache: Map<string, ShortsPlan> = new Map();

  constructor() {
    this.router = Router();
    this.registerAllHandlers();
  }

  // ============================================
  // RouterContext 구현
  // ============================================

  async getNeo4jService(): Promise<Neo4jService> {
    if (!this.neo4jService) {
      this.neo4jService = createNeo4jService();
    }
    return this.neo4jService;
  }

  getContentPlannerService(options?: ContentPlannerOptions): ContentPlannerService {
    if (options) {
      return createContentPlannerService({
        audienceLevel: options.audienceLevel,
        useELI5Style: options.useELI5Style,
        style: options.style,
        maxShortsPerBook: options.maxShortsPerBook,
        maxScenesPerShort: options.maxScenesPerShort,
        contentType: options.contentType,
        visualPromptStyleGuide: options.visualPromptStyleGuide,
        engagementGuideOverride: options.engagementGuideOverride,
        useVeoInterpolation: options.useVeoInterpolation,
      });
    }
    if (!this.contentPlannerService) {
      this.contentPlannerService = createContentPlannerService();
    }
    return this.contentPlannerService;
  }

  buildVisualPromptStyleGuide(profile: VideoStyleProfile): string | undefined {
    return this.orchestrator.buildVisualPromptStyleGuide(profile);
  }

  async generateEpisodeVideoPipeline(
    episode: EpisodeWithScenes,
    config: any,
    neo4j: Neo4jService
  ): Promise<VideoPipelineResult> {
    return this.orchestrator.generateEpisodeVideo(episode, config, neo4j);
  }

  // ============================================
  // 핸들러 등록 (라우트 순서 중요!)
  // ============================================

  private registerAllHandlers() {
    // 1. /test/* 먼저 등록 (/:bookId 파라미터 라우트보다 우선해야 함)
    registerTestRoutes(this.router, this);

    // 2. 정적 경로 (/:bookId 보다 먼저)
    //    - /episodes/*, /pending, /stats, /connection, /search
    //    - /generate-next-episode, /auto-pipeline, /bulk-pipeline
    //    - /longform/*, /download/*
    registerEpisodeRoutes(this.router, this);
    registerVideoGenerationRoutes(this.router, this);
    registerYouTubePublishRoutes(this.router, this);
    registerLongFormRoutes(this.router, this);

    // 3. /:bookId 동적 라우트
    //    - NotebookLM (rechunk, export, import)
    //    - Content planning (curriculum, entities, analyze, etc.)
    //    - Books data (CRUD, chunks, series, episodes)
    registerNotebookLMRoutes(this.router, this);
    registerContentPlanningRoutes(this.router, this);
    registerBooksDataRoutes(this.router, this);
  }

  /**
   * 리소스 정리
   */
  async close() {
    if (this.neo4jService) {
      await this.neo4jService.close();
      this.neo4jService = null;
    }
  }
}

// 싱글톤 라우터 생성
export function createBooksRouter(): Router {
  const booksRouter = new BooksRouter();
  return booksRouter.router;
}
