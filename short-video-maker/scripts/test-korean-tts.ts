/**
 * 한글 TTS (Gemini Pro) 테스트 스크립트
 *
 * 순차적으로 진단:
 * 1. Gemini API 키 확인
 * 2. TTS API 호출 테스트
 * 3. 한글 음성 생성 확인
 * 4. 오디오 파일 저장 및 재생
 *
 * 실행:
 *   npx tsx scripts/test-korean-tts.ts
 */

import path from "path";
import fs from "fs-extra";
import dotenv from "dotenv";

// .env 파일 로드
dotenv.config();

// 색상 출력
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

function log(color: string, prefix: string, message: string) {
  console.log(`${color}[${prefix}]${RESET} ${message}`);
}

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('🔊 한글 TTS (Gemini Pro) 테스트');
  console.log('='.repeat(60) + '\n');

  // Step 1: API 키 확인
  log(BLUE, 'STEP 1', 'Gemini API 키 확인');

  const apiKey = process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    log(RED, 'ERROR', 'GOOGLE_GEMINI_API_KEY 환경변수가 설정되지 않았습니다!');
    console.log('  💡 .env 파일에 GOOGLE_GEMINI_API_KEY=your-api-key 추가하세요');
    process.exit(1);
  }

  console.log(`  ✅ API Key: ${apiKey.substring(0, 8)}...${apiKey.slice(-4)}`);
  log(GREEN, 'OK', 'API 키 확인 완료');

  // Step 2: GeminiTTS 초기화
  console.log('');
  log(BLUE, 'STEP 2', 'GeminiTTS 초기화');

  // 직접 import하면 타입 에러가 날 수 있어서 require 사용
  const { GeminiTTS } = await import('../src/YTB-tts/providers/tts/GeminiTTS');

  let tts: InstanceType<typeof GeminiTTS>;
  try {
    tts = new GeminiTTS({ apiKey });
    console.log(`  ✅ Model: gemini-2.5-pro-preview-tts`);
    log(GREEN, 'OK', 'GeminiTTS 초기화 완료');
  } catch (error: any) {
    log(RED, 'ERROR', `GeminiTTS 초기화 실패: ${error.message}`);
    process.exit(1);
  }

  // Step 3: 한글 음성 생성 테스트
  console.log('');
  log(BLUE, 'STEP 3', '한글 음성 생성 테스트');

  const testTexts = [
    '안녕하세요, 한글 음성 테스트입니다.',
    '충격적인 뉴스 속보가 도착했습니다!',
    '이번 주 가장 핫한 뉴스를 알려드릴게요.',
  ];

  const tempDir = path.resolve(__dirname, '../temp');
  fs.ensureDirSync(tempDir);

  // 사용 가능한 Voice 목록
  const voices = tts.listAvailableVoices();
  console.log(`  🎤 사용 가능한 Voice: ${voices.join(', ')}`);

  // 테스트 Voice 선택 (뉴스용 추천)
  const testVoice = 'Aoede';  // 밝고 생동감 있는 여성 목소리
  console.log(`  🎤 테스트 Voice: ${testVoice}`);
  console.log('');

  for (let i = 0; i < testTexts.length; i++) {
    const text = testTexts[i];
    console.log(`  📝 테스트 ${i + 1}: "${text}"`);

    try {
      const startTime = Date.now();
      const result = await tts.generate(text, testVoice);
      const elapsed = Date.now() - startTime;

      console.log(`     ✅ 생성 완료! (${elapsed}ms)`);
      console.log(`     - Voice: ${result.voice}`);
      console.log(`     - Gender: ${result.gender}`);
      console.log(`     - Audio Size: ${result.audio.byteLength} bytes`);
      console.log(`     - Estimated Length: ${result.audioLength.toFixed(2)}s`);

      // PCM 파일로 저장 (24kHz, 16-bit, mono)
      const pcmPath = path.join(tempDir, `test_korean_tts_${i + 1}.pcm`);
      fs.writeFileSync(pcmPath, Buffer.from(result.audio));
      console.log(`     - Saved: ${pcmPath}`);

      // WAV 파일로 변환 (FFmpeg 사용)
      const wavPath = path.join(tempDir, `test_korean_tts_${i + 1}.wav`);
      try {
        const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
        const ffmpegPath = ffmpegInstaller.path;
        const { execSync } = require('child_process');

        // PCM → WAV 변환 (24kHz, 16-bit signed little-endian, mono)
        execSync(`"${ffmpegPath}" -f s16le -ar 24000 -ac 1 -i "${pcmPath}" -y "${wavPath}" 2>/dev/null`);
        console.log(`     - WAV: ${wavPath}`);
      } catch (e: any) {
        console.log(`     - WAV 변환 실패: ${e.message}`);
      }

      console.log('');

    } catch (error: any) {
      console.log(`     ❌ 실패: ${error.message}`);
      console.log('');
    }
  }

  // Step 4: 결과 요약
  console.log('');
  log(BLUE, 'STEP 4', '결과 요약');

  const generatedFiles = fs.readdirSync(tempDir).filter(f => f.startsWith('test_korean_tts'));
  console.log(`  생성된 파일: ${generatedFiles.length}개`);
  generatedFiles.forEach(f => {
    const filePath = path.join(tempDir, f);
    const stats = fs.statSync(filePath);
    console.log(`  - ${f} (${(stats.size / 1024).toFixed(1)} KB)`);
  });

  // WAV 파일이 있으면 첫 번째 파일 재생
  const wavFiles = generatedFiles.filter(f => f.endsWith('.wav'));
  if (wavFiles.length > 0) {
    const firstWav = path.join(tempDir, wavFiles[0]);
    console.log('');
    log(GREEN, 'DONE', '테스트 완료! WAV 파일을 재생해서 한글 음성을 확인하세요.');
    console.log(`  👉 ${firstWav}`);

    // Windows에서 자동 재생
    try {
      const { execSync } = require('child_process');
      execSync(`start "" "${firstWav}"`);
    } catch (e) {}
  }

  console.log('\n' + '='.repeat(60) + '\n');
}

main().catch(console.error);
