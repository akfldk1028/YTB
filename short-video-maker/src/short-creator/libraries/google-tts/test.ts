/**
 * Google TTS 테스트 스크립트
 * 환경변수로 TTS_PROVIDER=google 설정 시 Google TTS를 사용하여 음성 생성 테스트
 */

import { GoogleTTS } from './GoogleTTS';
import { logger } from '../../../config';
import fs from 'fs';
import path from 'path';

async function testGoogleTTS() {
  try {
    logger.info("Starting Google TTS test...");
    
    // Google TTS 초기화 (환경변수에서 프로젝트 ID와 키 파일 경로 읽기)
    const googleTtsConfig = process.env.GOOGLE_TTS_PROJECT_ID ? {
      projectId: process.env.GOOGLE_TTS_PROJECT_ID,
      keyFilename: process.env.GOOGLE_TTS_API_KEY
    } : undefined;
    
    const googleTts = await GoogleTTS.init(googleTtsConfig);
    logger.info("Google TTS initialized successfully");
    
    // 사용 가능한 음성 목록 조회
    const voices = googleTts.listAvailableVoices();
    logger.info({ voiceCount: voices.length }, "Available voices loaded");
    
    // 실제 Google 음성 목록 조회 (선택사항)
    try {
      const googleVoices = await googleTts.getGoogleVoices();
      logger.info({ googleVoiceCount: googleVoices.length }, "Google voices fetched");
    } catch (error) {
      logger.warn({ error }, "Could not fetch Google voices (authentication may be required)");
    }
    
    // 테스트 텍스트로 음성 생성
    const testText = "Hello, this is a test of Google Cloud Text-to-Speech integration. The voice quality should be much more natural than Kokoro.";
    logger.info({ text: testText }, "Generating test audio");
    
    const startTime = Date.now();
    const result = await googleTts.generate(testText, "af_heart");
    const generationTime = Date.now() - startTime;
    
    logger.info({ 
      audioLength: result.audioLength,
      audioSizeBytes: result.audio.byteLength,
      generationTimeMs: generationTime
    }, "Audio generated successfully");
    
    // 생성된 오디오를 파일로 저장 (테스트 목적)
    const outputDir = path.join(__dirname, '../../../../temp');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const outputPath = path.join(outputDir, 'google-tts-test.wav');
    fs.writeFileSync(outputPath, Buffer.from(result.audio));
    logger.info({ outputPath }, "Test audio saved");
    
    // 다른 음성으로도 테스트
    const voices_to_test = ['am_adam', 'af_nova', 'am_onyx'];
    for (const voice of voices_to_test) {
      try {
        const voiceResult = await googleTts.generate(`Testing voice ${voice}`, voice as any);
        logger.info({ 
          voice, 
          audioLength: voiceResult.audioLength,
          audioSizeBytes: voiceResult.audio.byteLength
        }, "Voice test completed");
      } catch (error) {
        logger.error({ voice, error }, "Voice test failed");
      }
    }
    
    logger.info("Google TTS test completed successfully!");
    
  } catch (error) {
    logger.error({ error }, "Google TTS test failed");
    throw error;
  }
}

// 직접 실행 시 테스트 수행
if (require.main === module) {
  testGoogleTTS().catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
}

export { testGoogleTTS };