/**
 * Downloader 모듈 export
 *
 * 파일 구조:
 * - YouTubeDownloader.ts  (~290줄) - 핵심 다운로드 로직
 * - InvidiousClient.ts    (~290줄) - Invidious API 폴백
 * - VideoSearcher.ts      (~130줄) - ytsearch 대체 영상 검색
 * - types.ts              - 타입 정의
 */

export { YouTubeDownloader } from './YouTubeDownloader';
export { InvidiousClient } from './InvidiousClient';
export { VideoSearcher } from './VideoSearcher';
export * from './types';
