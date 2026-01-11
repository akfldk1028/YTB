/**
 * ElevenLabs TTS 테스트 스크립트
 * 환경변수로 ELEVENLABS_API_KEY 설정 후 실행하여 ElevenLabs TTS 테스트
 * 
 * 사용법:
 * 1. .env 파일에 ELEVENLABS_API_KEY=your_api_key 추가
 * 2. npm run build
 * 3. node dist/short-creator/libraries/elevenlabs-tts/test.js
 */

import { ElevenLabsTTS } from './ElevenLabsTTS';
import fs from 'fs-extra';
import path from 'path';

async function testElevenLabsTTS() {
  console.log('🎤 ElevenLabs TTS 테스트 시작...');
  
  // API 키 확인
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error('❌ ELEVENLABS_API_KEY 환경변수가 설정되지 않았습니다.');
    console.error('   .env 파일에 ELEVENLABS_API_KEY=your_api_key 추가해주세요.');
    process.exit(1);
  }

  try {
    // ElevenLabs TTS 초기화
    const elevenLabsTts = await ElevenLabsTTS.init({ apiKey });
    console.log('✅ ElevenLabs TTS 초기화 완료');

    // 음성 목록 확인
    const availableVoices = elevenLabsTts.listAvailableVoices();
    console.log(`📋 사용 가능한 음성 수: ${availableVoices.length}`);

    // 테스트 텍스트들
    const testTexts = [
      {
        text: "Hello! This is a test of ElevenLabs Text-to-Speech integration.",
        voice: "baRq1qg6PxLsnSQ04d8c" as const, // el_axl
        filename: "elevenlabs_test_english.mp3"
      },
      {
        text: "안녕하세요! ElevenLabs 음성 합성 테스트입니다. 한국어도 잘 지원됩니다.",
        voice: "N8CqI3qXFmT0tJHnzlrq" as const, // el_arfa
        filename: "elevenlabs_test_korean.mp3"
      },
      {
        text: "¡Hola! Esta es una prueba del sistema de síntesis de voz ElevenLabs.",
        voice: "TtRFBnwQdH1k01vR0hMz" as const, // el_arthur
        filename: "elevenlabs_test_spanish.mp3"
      }
    ];

    // 출력 디렉토리 생성
    const outputDir = path.join(process.cwd(), 'elevenlabs_test_output');
    await fs.ensureDir(outputDir);

    console.log('🎯 음성 생성 테스트 시작...');
    
    for (const testCase of testTexts) {
      console.log(`\n📝 테스트: ${testCase.text.substring(0, 50)}...`);
      console.log(`🎤 음성: ${testCase.voice}`);
      
      const startTime = Date.now();
      
      try {
        // 음성 생성
        const result = await elevenLabsTts.generate(testCase.text, testCase.voice);
        const endTime = Date.now();
        const processingTime = (endTime - startTime) / 1000;
        
        console.log(`✅ 음성 생성 완료:`);
        console.log(`   - 처리 시간: ${processingTime.toFixed(2)}초`);
        console.log(`   - 오디오 길이: ${result.audioLength.toFixed(2)}초`);
        console.log(`   - 파일 크기: ${(result.audio.byteLength / 1024).toFixed(1)}KB`);
        console.log(`   - 품질 비율: ${(result.audio.byteLength / result.audioLength / 1024).toFixed(1)}KB/초`);
        
        // MP3 파일로 저장 (테스트용)
        const outputPath = path.join(outputDir, testCase.filename);
        await fs.writeFile(outputPath, Buffer.from(result.audio));
        console.log(`💾 저장됨: ${outputPath}`);
        
      } catch (error) {
        console.error(`❌ 음성 생성 실패:`, error);
      }
    }

    // ElevenLabs 전용 음성 목록 테스트
    console.log('\n📊 ElevenLabs 음성 정보:');
    const elevenLabsVoices = await elevenLabsTts.getElevenLabsVoices();
    elevenLabsVoices.slice(0, 5).forEach(voice => {
      console.log(`   - ${voice.name} (${voice.category}): ${voice.voiceId}`);
    });

    console.log('\n🎉 ElevenLabs TTS 테스트 완료!');
    console.log(`📁 테스트 파일들이 ${outputDir}에 저장되었습니다.`);
    
  } catch (error) {
    console.error('❌ ElevenLabs TTS 테스트 실패:', error);
    process.exit(1);
  }
}

// 테스트 실행
if (require.main === module) {
  testElevenLabsTTS().catch(console.error);
}

export { testElevenLabsTTS };