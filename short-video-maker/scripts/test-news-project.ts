/**
 * NewsProject 테스트 스크립트
 *
 * finalNode.json을 사용하여 영상 생성 테스트
 *
 * Usage:
 *   npx ts-node scripts/test-news-project.ts
 */

import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';

// ESM 환경에서 __dirname 대체
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 환경변수 로드
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  console.log('🎬 NewsProject 테스트 시작\n');

  // 1. finalNode.json 읽기
  const jsonPath = path.join(__dirname, '../docs/NewsProject/finalNode.json');

  if (!await fs.pathExists(jsonPath)) {
    console.error('❌ finalNode.json을 찾을 수 없습니다:', jsonPath);
    process.exit(1);
  }

  const payload = await fs.readJson(jsonPath);
  const newsPayload = Array.isArray(payload) ? payload[0] : payload;

  console.log('📄 JSON 로드 완료:');
  console.log('   - Channel:', newsPayload.channel.display_name);
  console.log('   - Video:', newsPayload.videos[0].title);
  console.log('   - Scenes:', newsPayload.videos[0].scenes.length);
  console.log('   - TTS Provider:', newsPayload.global_config.audio.tts_provider);
  console.log('   - Image Mode:', newsPayload.global_config.image_generation);
  console.log('');

  // 2. 환경변수 확인
  const requiredEnvVars = [
    'GOOGLE_GEMINI_API_KEY',
    'PEXELS_API_KEY',
  ];

  const missingVars = requiredEnvVars.filter(v => !process.env[v]);
  if (missingVars.length > 0) {
    console.warn('⚠️  일부 환경변수가 없습니다:', missingVars.join(', '));
    console.log('   (ElevenLabs fallback 또는 nanoBanana fallback 사용 가능)\n');
  }

  // 3. NewsProjectService 동적 import (ESM 호환)
  console.log('📦 NewsProjectService 로드 중...');

  const { NewsProjectService } = await import('../src/YTB-news-project/NewsProjectService');
  const service = new NewsProjectService();

  console.log('✅ 서비스 로드 완료\n');

  // 4. 영상 생성 시작
  console.log('🎥 영상 생성 시작...');
  console.log('   (시간이 걸릴 수 있습니다)\n');

  const startTime = Date.now();

  try {
    const result = await service.createVideo(newsPayload);

    console.log('📊 생성 요청 완료:');
    console.log('   - Video ID:', result.videoId);
    console.log('   - Status:', result.status);
    console.log('');

    // 5. 상태 폴링 (완료될 때까지)
    console.log('⏳ 처리 대기 중...\n');

    let completed = false;
    let lastStep = '';

    while (!completed) {
      await new Promise(resolve => setTimeout(resolve, 3000)); // 3초 대기

      const state = service.getStatus(result.videoId);

      if (!state) {
        console.error('❌ 상태를 찾을 수 없습니다');
        break;
      }

      // 진행 상황 표시 (변경 시에만)
      if (state.progress.step !== lastStep) {
        const progress = `${state.progress.current}/${state.progress.total}`;
        console.log(`   [${progress}] ${state.progress.step}`);
        lastStep = state.progress.step;
      }

      if (state.status === 'completed') {
        completed = true;

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log('\n🎉 영상 생성 완료!');
        console.log('   - 소요 시간:', elapsed, '초');
        console.log('   - 출력 경로:', state.result?.outputPath);
        console.log('   - Duration:', state.result?.duration?.toFixed(1), '초');

        if (state.result?.downloadUrl) {
          console.log('   - 다운로드 URL:', state.result.downloadUrl.substring(0, 80) + '...');
        }
      } else if (state.status === 'error') {
        console.error('\n❌ 에러 발생:', state.error);
        break;
      }
    }

  } catch (error) {
    console.error('❌ 에러:', error);
    process.exit(1);
  }

  console.log('\n✅ 테스트 완료');
}

main().catch(console.error);
