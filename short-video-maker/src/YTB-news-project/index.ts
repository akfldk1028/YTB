/**
 * YTB News Project - 뉴스 숏츠 자동 생성 모듈
 *
 * n8n 워크플로우와 연동되어 뉴스 콘텐츠를 숏츠로 변환
 *
 * 🔥 비주얼 소스 (우선순위):
 * 1. Pexels 스톡 이미지 (자연스러움, YouTube 정책 안전)
 * 2. Nano Banana AI 이미지 (fallback)
 *
 * 워크플로우:
 * 1. n8n에서 finalNode.json 형식으로 요청
 * 2. NewsVisualSource로 비주얼 생성 (Pexels → AI fallback)
 * 3. ElevenLabs TTS로 나레이션 생성 + 자막 추출
 * 4. FFmpeg로 비디오 합성 (이미지 → 비디오 + 자막)
 * 5. YouTube 업로드 (옵션)
 * 6. n8n 콜백
 */

// Router (Politics Project 패턴)
export { newsRouter } from './routes';

// Types
export * from './types';

// Services
export { NewsProjectService, type NewsProjectDependencies } from './NewsProjectService';
export { NewsVisualSource, type ImageGenerationMode, type VisualResult, type VisualRequest } from './NewsVisualSource';
