const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// 폰트 경로
const PROJECT_ROOT = path.resolve(__dirname);
const titleFont = path.join(PROJECT_ROOT, 'font/BlackHanSans-Regular.ttf').replace(/\\/g, '/');
const subtitleFont = path.join(PROJECT_ROOT, 'font/GmarketSansTTFBold.ttf').replace(/\\/g, '/');

console.log('=== 폰트 확인 ===');
console.log('제목:', titleFont, fs.existsSync(titleFont) ? '✅' : '❌');
console.log('자막:', subtitleFont, fs.existsSync(subtitleFont) ? '✅' : '❌');

// 자막 텍스트 파일
fs.writeFileSync('test_subtitle.txt', '안녕하세요 테스트입니다', 'utf-8');
// 🔥 두 줄 제목: 첫 줄 흰색, 둘째 줄 노란색
fs.writeFileSync('test_title_line1.txt', '민간 드론이', 'utf-8');
fs.writeFileSync('test_title_line2.txt', '북한 넘어갔다', 'utf-8');

// FFmpeg 경로
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

// 검은 배경 3초 + 제목/자막
// Windows FFmpeg: 경로에 콜론 이스케이프 필요
const safeTitleFont = titleFont.replace(/:/g, '\\:');
const safeSubtitleFont = subtitleFont.replace(/:/g, '\\:');
// 🔥 두 줄 제목
const titleLine1Path = path.join(PROJECT_ROOT, 'test_title_line1.txt').replace(/\\/g, '/').replace(/:/g, '\\:');
const titleLine2Path = path.join(PROJECT_ROOT, 'test_title_line2.txt').replace(/\\/g, '/').replace(/:/g, '\\:');
const subtitleTextPath = path.join(PROJECT_ROOT, 'test_subtitle.txt').replace(/\\/g, '/').replace(/:/g, '\\:');

// 🔥 자극적인 뉴스 쇼츠 스타일
// 제목: 첫 줄 흰색, 둘째 줄 노란색
// 자막: 흰색
const fontSize = 100; // 제목 폰트
const lineHeight = fontSize * 1.2;
const filter = [
  // 첫 번째 줄 (흰색)
  `drawtext=fontfile='${safeTitleFont}':textfile='${titleLine1Path}':fontcolor=white:fontsize=${fontSize}:x=(w-text_w)/2:y=h*0.06:borderw=5:bordercolor=black`,
  // 두 번째 줄 (노란색)
  `drawtext=fontfile='${safeTitleFont}':textfile='${titleLine2Path}':fontcolor=0xFFEB3B:fontsize=${fontSize}:x=(w-text_w)/2:y=h*0.06+${lineHeight}:borderw=5:bordercolor=black`,
  // 자막 (흰색)
  `drawtext=fontfile='${safeSubtitleFont}':textfile='${subtitleTextPath}':fontcolor=white:fontsize=90:x=(w-text_w)/2:y=h*0.50:borderw=6:bordercolor=black`
].join(',');

const cmd = `${ffmpegPath} -y -f lavfi -i color=c=black:s=1080x1920:d=3 -vf "${filter}" -c:v libx264 -t 3 test_font_output.mp4`;

console.log('\n=== FFmpeg 실행 ===');
execSync(cmd, { stdio: 'inherit' });
console.log('\n✅ 완료: test_font_output.mp4');
