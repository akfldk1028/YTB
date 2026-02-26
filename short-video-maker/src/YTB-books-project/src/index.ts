/**
 * YTB-books-project
 * 책 → Neo4j GraphDB → YouTube Shorts 파이프라인
 *
 * @author Claude (Architecture Agent)
 * @version 7.0.0
 */

// Services
export { GHIBLI_STYLE_PREFIX } from '../../image-generation/services/GPTImageService';
export { SceneImageService, SceneImageService as GhibliImageService } from './services/SceneImageService';
export type { SceneImageResult, SceneImageConfig, SceneImageConfig as GhibliStyleConfig } from './services/SceneImageService';

// Orchestration
export { EpisodeOrchestrator } from './orchestration/EpisodeOrchestrator';
export type { PipelineResult, ImageGenerationResult } from './orchestration/EpisodeOrchestrator';

// Types
export type {
  BookChunk,
  SceneGenerationInput,
  BookScene,
  BookScene as GhibliScene,
  BookMetadata,
  ShortsGenerationConfig
} from './types';

// Constants
export const BOOKS_PROJECT_VERSION = '7.0.0';
