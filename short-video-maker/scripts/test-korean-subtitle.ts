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

import fs from "fs-extra";
import path from "path";
import { execSync, spawn } from "child_process";

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
  console.log('🔍 한글 자막 FFmpeg 테스트');
  console.log('='.repeat(60) + '\n');

  // Step 1: 폰트 파일 경로 확인
  log(BLUE, 'STEP 1', '폰트 파일 경로 확인');

  const fontPaths = [
    // Docker 환경
    '/app/font/GmarketSansTTFBold.ttf',
    '/app/font/BlackHanSans-Regular.ttf',
    // 로컬 개발 환경
    path.resolve(__dirname, '../font/GmarketSansTTFBold.ttf'),
    path.resolve(__dirname, '../font/BlackHanSans-Regular.ttf'),
    // 시스템 폰트 (폴백)
    '/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf',
    'C:/Windows/Fonts/malgunbd.ttf',
  ];

  let subtitleFont: string | null = null;
  let titleFont: string | null = null;

  for (const fontPath of fontPaths) {
    const exists = fs.existsSync(fontPath);
    const icon = exists ? '✅' : '❌';
    console.log(`  ${icon} ${fontPath}: ${exists ? 'EXISTS' : 'NOT FOUND'}`);

    if (exists) {
      const stats = fs.statSync(fontPath);
      console.log(`     Size: ${stats.size} bytes (${(stats.size / 1024).toFixed(1)} KB)`);

      if (fontPath.includes('Gmarket') && !subtitleFont) {
        subtitleFont = fontPath;
      }
      if (fontPath.includes('BlackHan') && !titleFont) {
        titleFont = fontPath;
      }
    }
  }

  if (!subtitleFont && !titleFont) {
    log(RED, 'ERROR', '사용 가능한 한글 폰트를 찾을 수 없습니다!');
    process.exit(1);
  }

  const testFont = subtitleFont || titleFont!;
  log(GREEN, 'FOUND', `테스트에 사용할 폰트: ${testFont}`);

  // Step 2: 폰트 파일 유효성 검증
  console.log('');
  log(BLUE, 'STEP 2', '폰트 파일 유효성 검증 (TTF magic bytes)');

  const buffer = fs.readFileSync(testFont);
  const magicBytes = buffer.slice(0, 4);
  const isTTF = magicBytes[0] === 0x00 && magicBytes[1] === 0x01 && magicBytes[2] === 0x00 && magicBytes[3] === 0x00;
  const isOTF = magicBytes.toString('ascii') === 'OTTO';

  console.log(`  Magic bytes (hex): ${magicBytes.toString('hex')}`);
  console.log(`  Is TTF: ${isTTF ? '✅ YES' : '❌ NO'}`);
  console.log(`  Is OTF: ${isOTF ? '✅ YES' : '❌ NO'}`);

  if (!isTTF && !isOTF) {
    log(RED, 'ERROR', '폰트 파일이 유효한 TTF/OTF 형식이 아닙니다!');
    log(YELLOW, 'HINT', 'GCS에서 폰트 파일이 손상되어 다운로드되었을 수 있습니다.');
    process.exit(1);
  }

  log(GREEN, 'VALID', '폰트 파일이 유효합니다');

  // Step 3: UTF-8 텍스트 파일 생성
  console.log('');
  log(BLUE, 'STEP 3', 'UTF-8 텍스트 파일 생성');

  const tempDir = path.resolve(__dirname, '../temp');
  fs.ensureDirSync(tempDir);

  const koreanText = '테스트 한글 자막입니다';
  const textFilePath = path.join(tempDir, 'test_korean_subtitle.txt');
  fs.writeFileSync(textFilePath, koreanText, 'utf-8');

  const writtenContent = fs.readFileSync(textFilePath, 'utf-8');
  const writtenBuffer = Buffer.from(writtenContent, 'utf-8');

  console.log(`  Original text: "${koreanText}"`);
  console.log(`  Text file path: ${textFilePath}`);
  console.log(`  Written content: "${writtenContent}"`);
  console.log(`  Bytes (hex): ${writtenBuffer.toString('hex').substring(0, 60)}...`);
  console.log(`  Byte length: ${writtenBuffer.length}`);

  if (writtenContent !== koreanText) {
    log(RED, 'ERROR', '텍스트 파일 인코딩 문제!');
    process.exit(1);
  }

  log(GREEN, 'OK', 'UTF-8 텍스트 파일 생성 성공');

  // Step 4: FFmpeg 테스트 영상 생성
  console.log('');
  log(BLUE, 'STEP 4', 'FFmpeg drawtext 한글 렌더링 테스트');

  // FFmpeg 경로 찾기 (@ffmpeg-installer/ffmpeg 사용)
  let ffmpegPath = 'ffmpeg';
  try {
    if (fs.existsSync('/usr/bin/ffmpeg')) {
      ffmpegPath = '/usr/bin/ffmpeg';
    } else {
      // Windows/Mac: @ffmpeg-installer/ffmpeg 사용
      const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
      ffmpegPath = ffmpegInstaller.path;
    }
  } catch (e) {
    log(YELLOW, 'WARN', '@ffmpeg-installer/ffmpeg 로드 실패, 시스템 ffmpeg 사용');
  }

  // 출력 파일
  const outputPath = path.join(tempDir, 'test_korean_subtitle.mp4');

  // FFmpeg 필터 (drawtext with fontfile)
  const safeFontPath = testFont.replace(/\\/g, '/');
  const safeTextPath = textFilePath.replace(/\\/g, '/');

  // FFmpeg 명령어 구성
  const ffmpegArgs = [
    '-f', 'lavfi',
    '-i', 'color=c=blue:s=1080x1920:d=3',
    '-vf', `drawtext=fontfile=${safeFontPath}:textfile=${safeTextPath}:fontcolor=white:fontsize=80:x=(w-text_w)/2:y=(h-text_h)/2:borderw=3:bordercolor=black`,
    '-c:v', 'libx264',
    '-t', '3',
    '-y',
    outputPath
  ];

  console.log(`  FFmpeg path: ${ffmpegPath}`);
  console.log(`  Font path: ${safeFontPath}`);
  console.log(`  Text file: ${safeTextPath}`);
  console.log(`  Output: ${outputPath}`);
  console.log('');
  console.log(`  Command: ${ffmpegPath} ${ffmpegArgs.join(' ')}`);
  console.log('');

  // FFmpeg 실행
  log(YELLOW, 'RUNNING', 'FFmpeg 실행 중...');

  try {
    const result = execSync(`${ffmpegPath} ${ffmpegArgs.join(' ')}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60000
    });
    log(GREEN, 'SUCCESS', 'FFmpeg 실행 완료!');
  } catch (error: any) {
    // FFmpeg는 성공해도 stderr로 출력하므로, 파일 생성 여부로 판단
    if (fs.existsSync(outputPath)) {
      const outStats = fs.statSync(outputPath);
      if (outStats.size > 0) {
        log(GREEN, 'SUCCESS', `테스트 영상 생성 완료! (${(outStats.size / 1024).toFixed(1)} KB)`);
      }
    } else {
      log(RED, 'ERROR', 'FFmpeg 실행 실패!');
      console.log('  stderr:', error.stderr || error.message);
      process.exit(1);
    }
  }

  // Step 5: 결과 확인
  console.log('');
  log(BLUE, 'STEP 5', '결과 확인');

  if (fs.existsSync(outputPath)) {
    const outStats = fs.statSync(outputPath);
    console.log(`  ✅ 출력 파일: ${outputPath}`);
    console.log(`  ✅ 파일 크기: ${(outStats.size / 1024).toFixed(1)} KB`);
    console.log('');
    log(GREEN, 'DONE', '테스트 영상을 열어서 한글이 제대로 렌더링되었는지 확인하세요!');
    console.log(`  👉 ${outputPath}`);
  } else {
    log(RED, 'FAIL', '테스트 영상이 생성되지 않았습니다.');
  }

  console.log('\n' + '='.repeat(60) + '\n');
}

main().catch(console.error);
