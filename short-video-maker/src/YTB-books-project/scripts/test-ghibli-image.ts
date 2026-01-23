/**
 * GPT Ghibli 이미지 생성 테스트
 *
 * 실행: npx ts-node src/YTB-books-project/scripts/test-ghibli-image.ts
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs-extra';

// .env 로드
dotenv.config({ path: path.join(__dirname, '../../../.env') });

import { GhibliImageService } from '../src/services/GhibliImageService';

async function testGhibliImage() {
  console.log('🎨 GPT Ghibli 이미지 생성 테스트 시작\n');

  // API 키 확인
  const googleApiKey = process.env.GOOGLE_GEMINI_API_KEY;
  const openAiApiKey = process.env.OPENAI_API_KEY;

  if (!googleApiKey) {
    console.error('❌ GOOGLE_GEMINI_API_KEY가 설정되지 않았습니다.');
    process.exit(1);
  }
  if (!openAiApiKey) {
    console.error('❌ OPENAI_API_KEY가 설정되지 않았습니다.');
    process.exit(1);
  }

  console.log('✅ API 키 확인 완료');
  console.log(`  - Google Gemini: ${googleApiKey.substring(0, 10)}...`);
  console.log(`  - OpenAI: ${openAiApiKey.substring(0, 10)}...\n`);

  // 출력 디렉토리 생성
  const outputDir = path.join(__dirname, '../../../temp/ghibli-test');
  await fs.ensureDir(outputDir);
  console.log(`📁 출력 디렉토리: ${outputDir}\n`);

  // GhibliImageService 초기화
  const service = new GhibliImageService(
    googleApiKey,
    openAiApiKey,
    outputDir
  );

  console.log('🎬 테스트 씬 생성 시작...\n');

  // 테스트 씬 정의
  const testScenes = [
    {
      prompt: 'A young girl with short black hair walking through a lush green meadow, wind gently blowing',
      config: { mood: 'nostalgic' as const, timeOfDay: 'day' as const }
    },
    {
      prompt: 'The same girl discovering an ancient stone gate covered in moss and vines',
      config: { mood: 'whimsical' as const, timeOfDay: 'sunset' as const }
    }
  ];

  try {
    // 첫 번째 씬만 테스트 (GPT 사용)
    console.log('📸 Scene 1: GPT-4o Ghibli 스타일 생성...');
    const result1 = await service.generateSceneImage(
      testScenes[0].prompt,
      0,  // sceneIndex 0 = GPT 사용
      '9:16',
      testScenes[0].config,
      'test-video-001'
    );

    if (result1.success && result1.imageBuffer) {
      const outputPath1 = path.join(outputDir, 'scene_1_gpt.png');
      await fs.writeFile(outputPath1, result1.imageBuffer);
      console.log(`✅ Scene 1 저장됨: ${outputPath1}`);
      console.log(`   - Generator: ${result1.generator}`);
      console.log(`   - Size: ${result1.imageBuffer.length} bytes\n`);
    } else {
      console.error(`❌ Scene 1 실패: ${result1.error}\n`);
    }

    // 두 번째 씬 테스트 (NanoBanana + reference)
    console.log('📸 Scene 2: NanoBanana + Reference 생성...');
    const result2 = await service.generateSceneImage(
      testScenes[1].prompt,
      1,  // sceneIndex > 0 = NanoBanana + reference
      '9:16',
      testScenes[1].config,
      'test-video-001'
    );

    if (result2.success && result2.imageBuffer) {
      const outputPath2 = path.join(outputDir, 'scene_2_nanobanana.png');
      await fs.writeFile(outputPath2, result2.imageBuffer);
      console.log(`✅ Scene 2 저장됨: ${outputPath2}`);
      console.log(`   - Generator: ${result2.generator}`);
      console.log(`   - Size: ${result2.imageBuffer.length} bytes\n`);
    } else {
      console.error(`❌ Scene 2 실패: ${result2.error}\n`);
    }

    // 상태 확인
    const state = service.getState();
    console.log('📊 GhibliImageService 상태:');
    console.log(`   - Reference 이미지 있음: ${state.hasReference}`);
    console.log(`   - 생성된 이미지 수: ${state.generatedCount}`);
    console.log(`   - Reference 이미지 크기: ${state.referenceImageSize || 0} bytes\n`);

    console.log('🎉 테스트 완료!');
    console.log(`📂 결과 확인: ${outputDir}`);

  } catch (error) {
    console.error('❌ 테스트 실패:', error);
    process.exit(1);
  }
}

// 실행
testGhibliImage().catch(console.error);
