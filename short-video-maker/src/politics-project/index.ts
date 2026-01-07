/**
 * PoliticsProject - YouTube to Shorts 변환 모듈
 *
 * YouTube 영상에서 하이라이트를 분석하여
 * 9:16 세로 Shorts 영상을 자동 생성합니다.
 */

// API
export { politicsRouter } from './api';

// Workflow
export { YouTubeToShortsWorkflow } from './workflow';

// Core Modules
export { YouTubeDownloader } from './core/downloader';
export { SRTParser } from './core/parser';
export { HighlightAnalyzer } from './core/analyzer';
export { VerticalCropper, SubtitleBurner } from './core/processor';

// Types
export * from './types';
