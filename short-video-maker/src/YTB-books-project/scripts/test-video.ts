/**
 * Books Video Test Script
 *
 * 이미지 + TTS + 자막 조합 테스트
 *
 * 사용법:
 *   1. 서버 로컬 실행: npx ts-node src/YTB-books-project/scripts/test-video.ts --local
 *   2. 원격 서버 호출: npx ts-node src/YTB-books-project/scripts/test-video.ts
 *   3. curl 테스트: 아래 예시 참조
 *
 * curl 예시:
 *   curl -X POST "http://localhost:3123/api/books/test-video" \
 *     -H "Content-Type: application/json" \
 *     -d '{
 *       "images": [
 *         { "path": "/path/to/image1.png", "narration": "첫 번째 씬 나레이션입니다." },
 *         { "path": "/path/to/image2.png", "narration": "두 번째 씬 나레이션입니다." }
 *       ]
 *     }'
 */

import path from 'path';
import fs from 'fs-extra';

// 로컬 테스트용 직접 호출
async function testLocal() {
  console.log('🧪 Books Video Test - Local Mode');
  console.log('='.repeat(50));

  // BooksVideoService 직접 import
  const { getBooksVideoService } = await import('../src/services/BooksVideoService.js');

  const videoService = getBooksVideoService();

  // 테스트 이미지 경로 (실제 이미지로 교체 필요)
  const testImages = [
    {
      path: 'D:/Data/00_Personal/YTB/short-video-maker/.ai-agents-az-video-generator/temp/gpt-to-nanobanana/test/scene_1.png',
      narration: '옛날 옛적, 작은 마을에 호기심 많은 고양이가 살았습니다.'
    },
    {
      path: 'D:/Data/00_Personal/YTB/short-video-maker/.ai-agents-az-video-generator/temp/gpt-to-nanobanana/test/scene_2.png',
      narration: '고양이는 매일 마을 언덕 위에서 해가 지는 것을 바라보았습니다.'
    },
    {
      path: 'D:/Data/00_Personal/YTB/short-video-maker/.ai-agents-az-video-generator/temp/gpt-to-nanobanana/test/scene_3.png',
      narration: '어느 날, 고양이는 언덕 너머에 무엇이 있는지 궁금해졌습니다.'
    }
  ];

  // 이미지 존재 확인
  console.log('\n📂 이미지 파일 확인:');
  const validImages: typeof testImages = [];

  for (const img of testImages) {
    const exists = await fs.pathExists(img.path);
    console.log(`  ${exists ? '✅' : '❌'} ${path.basename(img.path)}`);
    if (exists) {
      validImages.push(img);
    }
  }

  if (validImages.length === 0) {
    console.log('\n⚠️ 테스트할 이미지가 없습니다.');
    console.log('   먼저 GPT-to-NanoBanana로 이미지를 생성하거나,');
    console.log('   testImages 배열의 경로를 실제 이미지로 수정하세요.');
    console.log('\n💡 샘플 테스트 이미지 생성:');
    console.log('   curl -X POST "http://localhost:3123/api/gpt-to-nanobanana/generate" \\');
    console.log('     -H "Content-Type: application/json" \\');
    console.log('     -d \'{"character":{"description":"A cute orange cat, anime style"},"scenes":[{"text":"Cat in forest"},{"text":"Cat by river"}]}\'');
    return;
  }

  console.log(`\n🎬 테스트 시작 (${validImages.length}개 이미지)`);
  console.log('='.repeat(50));

  const outputPath = path.join(
    process.cwd(),
    '.ai-agents-az-video-generator/output/books',
    `test_${Date.now()}.mp4`
  );

  try {
    const result = await videoService.testImageTTSCombination(validImages, outputPath);

    console.log('\n📊 결과:');
    console.log(JSON.stringify(result, null, 2));

    if (result.success) {
      console.log('\n✅ 비디오 생성 완료!');
      console.log(`📁 Output: ${result.videoPath}`);
      console.log(`⏱️ Duration: ${result.duration?.toFixed(1)}s`);
    } else {
      console.log('\n❌ 비디오 생성 실패');
      console.log(`Error: ${result.error}`);
    }
  } catch (error) {
    console.error('\n❌ 테스트 실패:', error);
  }
}

// 원격 서버 API 호출 테스트
async function testRemote() {
  console.log('🧪 Books Video Test - Remote API Mode');
  console.log('='.repeat(50));

  const baseUrl = process.env.BASE_URL || 'http://localhost:3123';

  // 테스트 요청 데이터
  const requestData = {
    images: [
      {
        path: 'D:/Data/00_Personal/YTB/short-video-maker/.ai-agents-az-video-generator/temp/gpt-to-nanobanana/test/scene_1.png',
        narration: '옛날 옛적, 작은 마을에 호기심 많은 고양이가 살았습니다.'
      },
      {
        path: 'D:/Data/00_Personal/YTB/short-video-maker/.ai-agents-az-video-generator/temp/gpt-to-nanobanana/test/scene_2.png',
        narration: '고양이는 매일 마을 언덕 위에서 해가 지는 것을 바라보았습니다.'
      }
    ]
  };

  console.log(`\n🌐 Calling: POST ${baseUrl}/api/books/test-video`);
  console.log(`📝 Request:`, JSON.stringify(requestData, null, 2));

  try {
    const response = await fetch(`${baseUrl}/api/books/test-video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestData)
    });

    const result = await response.json();

    console.log('\n📊 Response:');
    console.log(JSON.stringify(result, null, 2));

    if (result.success) {
      console.log('\n✅ 비디오 생성 완료!');
    } else {
      console.log('\n❌ 비디오 생성 실패');
    }
  } catch (error) {
    console.error('\n❌ API 호출 실패:', error);
  }
}

// Main
const isLocal = process.argv.includes('--local');

if (isLocal) {
  testLocal().then(() => process.exit(0)).catch(e => {
    console.error(e);
    process.exit(1);
  });
} else {
  testRemote().then(() => process.exit(0)).catch(e => {
    console.error(e);
    process.exit(1);
  });
}
