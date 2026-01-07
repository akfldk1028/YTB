/**
 * PoliticsProject 워크플로우 테스트
 *
 * 실행: npx ts-node src/politics-project/test-workflow.ts
 */

import { YouTubeToShortsWorkflow } from './workflow';
import path from 'path';

// 테스트용 YouTube 영상들 (여러 개)
const TEST_YOUTUBE_URLS = [
  'https://www.youtube.com/watch?v=jNQXAC9IVRw',  // Me at the zoo (18초)
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',  // Rick Roll
];

async function main() {
  console.log('=== PoliticsProject 워크플로우 테스트 (여러 URL) ===\n');

  const outputDir = path.join(__dirname, 'output');
  const workflow = new YouTubeToShortsWorkflow(outputDir);

  console.log('YouTube URLs:', TEST_YOUTUBE_URLS);
  console.log('Output Dir:', outputDir);
  console.log('\n워크플로우 시작...\n');

  try {
    const result = await workflow.run({
      youtubeUrls: TEST_YOUTUBE_URLS,  // 여러 URL 전달
      options: {
        outputCount: 1,  // 각 영상에서 1개씩
        clipDuration: { min: 10, max: 30 }, // 테스트용으로 짧게
        autoAnalyze: true,
        combineOutput: true,
        overlayOptions: {
          mode: 'static',
          static: {
            position: 'top',
            fontSize: 36
          }
        }
      }
    });

    console.log('\n=== 결과 ===');
    console.log('Job ID:', result.jobId);
    console.log('Status:', result.status);
    console.log('Outputs:', result.outputs.length);

    if (result.outputs.length > 0) {
      console.log('\n생성된 파일:');
      result.outputs.forEach((output, i) => {
        console.log(`  ${i + 1}. ${output.title}`);
        console.log(`     Path: ${output.path}`);
        console.log(`     Duration: ${output.duration}s`);
        console.log(`     Highlight: ${output.highlight.startSec}s ~ ${output.highlight.endSec}s`);
      });
    }

    if (result.error) {
      console.log('\nError:', result.error);
    }

  } catch (error) {
    console.error('테스트 실패:', error);
  }
}

main();
