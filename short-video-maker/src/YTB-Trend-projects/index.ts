/**
 * YTB-Trend-projects Module v2.0
 * 트렌드 발견 → 스타일 분석 → 콘텐츠 재창작 → 영상 생성 파이프라인
 *
 * n8n Node Pattern: 각 서비스는 독립 노드, 오케스트레이터가 연결
 */

export * from './types';
export { createTrendRouter } from './api/TrendRouter';

// Services
export { VideoCloneService } from './services/VideoCloneService';
export { YouTubeDownloaderService } from './services/YouTubeDownloaderService';
export { GeminiVideoAnalyzerService } from './services/GeminiVideoAnalyzerService';
export { StyleProfileBuilderService } from './services/StyleProfileBuilderService';
export { TrendAggregatorService } from './services/TrendAggregatorService';
export { VideoDiscoveryService } from './services/VideoDiscoveryService';
export { ContentRewriterService } from './services/ContentRewriterService';
export { AutoClonePipelineService } from './services/AutoClonePipelineService';

// Scrapers
export { BaseTrendScraper, getScrapers } from './scrapers';
export { YouTubeTrendScraper } from './scrapers/YouTubeTrendScraper';
export { TikTokTrendScraper } from './scrapers/TikTokTrendScraper';
export { RedditTrendScraper } from './scrapers/RedditTrendScraper';
export { BilibiliTrendScraper } from './scrapers/BilibiliTrendScraper';
export { GoogleTrendsScraper } from './scrapers/GoogleTrendsScraper';
