/**
 * RouterContext — 핸들러 파일들이 공유하는 의존성 인터페이스
 * BooksRouter가 구현하여 각 핸들러에 주입
 */

import type { Router } from 'express';
import type { Neo4jService } from '../../services/Neo4jService';
import type { ContentPlannerService, ShortsPlan, ContentType } from '../../services/ContentPlannerService';
import type { EpisodeOrchestrator } from '../../orchestration/EpisodeOrchestrator';
import type { VideoStyleProfile } from '../../styles';
import type { EpisodeWithScenes } from '../../types';

export interface ContentPlannerOptions {
  audienceLevel?: 'elementary' | 'general' | 'professional';
  useELI5Style?: boolean;
  style?: string;
  maxShortsPerBook?: number;
  maxScenesPerShort?: number;
  contentType?: ContentType;
  visualPromptStyleGuide?: string;
  engagementGuideOverride?: string;
  useVeoInterpolation?: boolean;
}

export interface VideoPipelineResult {
  success: boolean;
  videoResult?: any;
  gcsUrl?: string;
  publicUrl?: string;
  error?: string;
  _styleDebug?: any;
}

export interface RouterContext {
  getNeo4jService(): Promise<Neo4jService>;
  getContentPlannerService(options?: ContentPlannerOptions): ContentPlannerService;
  orchestrator: EpisodeOrchestrator;
  plansCache: Map<string, ShortsPlan>;
  buildVisualPromptStyleGuide(profile: VideoStyleProfile): string | undefined;
  generateEpisodeVideoPipeline(episode: EpisodeWithScenes, config: any, neo4j: Neo4jService): Promise<VideoPipelineResult>;
}

/** 핸들러 등록 함수 시그니처 */
export type HandlerRegister = (router: Router, ctx: RouterContext) => void;
