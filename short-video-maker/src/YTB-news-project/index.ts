/**
 * YTB News Project - 뉴스 숏츠 자동 생성 모듈
 *
 * n8n 워크플로우와 연동되어 뉴스 콘텐츠를 숏츠로 변환
 *
 * 🔥 기존 short-creator 모듈 재사용:
 * - short-creator/processors/AudioProcessor (TTS + 자막)
 * - short-creator/processors/VideoProcessor (FFmpeg)
 * - image-generation/ImageGenerationService (Nano Banana)
 *
 * 워크플로우:
 * 1. n8n에서 finalNode.json 형식으로 요청
 * 2. Nano Banana로 뉴스 인포그래픽 이미지 생성
 * 3. ElevenLabs TTS로 나레이션 생성 + 자막 추출
 * 4. FFmpeg로 비디오 합성 (이미지 → 비디오 + 자막)
 * 5. YouTube 업로드 (옵션)
 * 6. n8n 콜백
 */

// Router (Politics Project 패턴)
export { newsRouter } from './routes';

// Types
export * from './types';

// Services (optional direct usage)
export { NewsProjectService, type NewsProjectDependencies } from './NewsProjectService';
