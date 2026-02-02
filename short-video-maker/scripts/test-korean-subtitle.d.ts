/**
 * 한글 자막 FFmpeg 테스트 스크립트
 *
 * 순차적으로 진단:
 * 1. 폰트 파일 존재 확인
 * 2. 폰트 파일 유효성 검증 (TTF magic bytes)
 * 3. 텍스트 파일 UTF-8 인코딩 테스트
 * 4. FFmpeg drawtext 명령어 생성 및 실행 테스트
 *
 * 실행:
 *   npx tsx scripts/test-korean-subtitle.ts
 */
export {};
