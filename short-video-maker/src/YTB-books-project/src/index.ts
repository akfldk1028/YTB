/**
 * YTB-books-project
 * 책 → Neo4j GraphDB → Ghibli Shorts 파이프라인
 *
 * @author Claude (Architecture Agent)
 * @version 1.0.0
 */

// Services
export { GHIBLI_STYLE_PREFIX } from '../../image-generation/services/GPTImageService';
export { GhibliImageService, SceneImageResult, GhibliStyleConfig } from './services/GhibliImageService';

// Types
export type {
  BookChunk,
  SceneGenerationInput,
  GhibliScene,
  BookMetadata,
  ShortsGenerationConfig
} from './types';

// Constants
export const BOOKS_PROJECT_VERSION = '1.0.0';
