/**
 * GCS 폰트 업로드 스크립트
 *
 * 로컬 font/ 디렉토리의 폰트 파일을 GCS에 업로드합니다.
 * Cloud Run에서 앱 시작 시 이 폰트들을 다운로드하여 사용합니다.
 *
 * 사용법:
 *   pnpm run upload-fonts
 *   # 또는
 *   npx tsx src/scripts/upload-fonts.ts
 *
 * 환경변수:
 *   - GCS_BUCKET_NAME: GCS 버킷 이름 (필수)
 *   - GCS_SERVICE_ACCOUNT_PATH: 서비스 계정 키 파일 경로 (선택)
 *   - GOOGLE_CLOUD_PROJECT_ID: GCP 프로젝트 ID (선택)
 */

import path from "path";
import fs from "fs-extra";
import { GoogleCloudStorageService } from "../storage/GoogleCloudStorageService";
import { Config } from "../config";
import { logger } from "../logger";

async function uploadFonts() {
  console.log("🔤 GCS Font Upload Script\n");

  // Config 초기화
  const config = new Config();

  // GCS 설정 확인
  if (!config.gcsBucketName) {
    console.error("❌ GCS_BUCKET_NAME 환경변수가 설정되지 않았습니다.");
    console.log("\n환경변수 설정 예시:");
    console.log("  export GCS_BUCKET_NAME=your-bucket-name");
    process.exit(1);
  }

  console.log(`📦 GCS Bucket: ${config.gcsBucketName}`);

  // 로컬 폰트 디렉토리 경로
  const localFontDir = path.resolve(__dirname, "../../font");
  console.log(`📁 Local Font Directory: ${localFontDir}`);

  // 디렉토리 존재 확인
  if (!fs.existsSync(localFontDir)) {
    console.error(`\n❌ 폰트 디렉토리가 존재하지 않습니다: ${localFontDir}`);
    process.exit(1);
  }

  // 폰트 파일 목록 확인
  const fontFiles = fs.readdirSync(localFontDir).filter((f) => f.endsWith(".ttf"));
  console.log(`\n📋 발견된 폰트 파일 (${fontFiles.length}개):`);
  fontFiles.forEach((f) => {
    const stats = fs.statSync(path.join(localFontDir, f));
    console.log(`   - ${f} (${(stats.size / 1024).toFixed(1)} KB)`);
  });

  if (fontFiles.length === 0) {
    console.error("\n❌ 업로드할 폰트 파일이 없습니다.");
    process.exit(1);
  }

  // GCS 서비스 초기화
  console.log("\n🔌 GCS 서비스 초기화 중...");
  let gcsService: GoogleCloudStorageService;
  try {
    gcsService = new GoogleCloudStorageService(config);
    console.log("✅ GCS 서비스 초기화 완료");
  } catch (error) {
    console.error("❌ GCS 서비스 초기화 실패:", error);
    process.exit(1);
  }

  // GCS 연결 테스트
  console.log("\n🔍 GCS 연결 테스트 중...");
  const connectionTest = await gcsService.testConnection();
  if (!connectionTest.success) {
    console.error("❌ GCS 연결 실패:", connectionTest.error);
    process.exit(1);
  }
  console.log("✅ GCS 연결 성공");

  // 기존 폰트 확인
  console.log("\n🔍 GCS 기존 폰트 확인 중...");
  const existingFonts = await gcsService.checkFontsExistInGCS();
  if (existingFonts.existingFonts.length > 0) {
    console.log("⚠️  이미 GCS에 있는 폰트:");
    existingFonts.existingFonts.forEach((f) => console.log(`   - ${f}`));
  }
  if (existingFonts.missingFonts.length > 0) {
    console.log("📤 GCS에 없는 폰트 (업로드 예정):");
    existingFonts.missingFonts.forEach((f) => console.log(`   - ${f}`));
  }

  // 폰트 업로드
  console.log("\n📤 폰트 업로드 시작...");
  const uploadResult = await gcsService.uploadFonts(localFontDir);

  // 결과 출력
  console.log("\n========================================");
  if (uploadResult.success) {
    console.log("✅ 폰트 업로드 완료!");
    console.log(`\n📊 업로드된 폰트 (${uploadResult.uploadedFonts.length}개):`);
    uploadResult.uploadedFonts.forEach((f) => console.log(`   ✅ gs://${config.gcsBucketName}/${f}`));
  } else {
    console.log("⚠️  폰트 업로드 중 일부 오류 발생");
  }

  if (uploadResult.errors.length > 0) {
    console.log(`\n⚠️  오류 (${uploadResult.errors.length}개):`);
    uploadResult.errors.forEach((e) => console.log(`   ❌ ${e}`));
  }

  console.log("========================================\n");

  // 최종 확인
  console.log("🔍 업로드 후 GCS 폰트 상태 확인...");
  const finalCheck = await gcsService.checkFontsExistInGCS();
  console.log(`\n✅ GCS에 있는 폰트 (${finalCheck.existingFonts.length}개):`);
  finalCheck.existingFonts.forEach((f) => console.log(`   - ${f}`));

  if (finalCheck.missingFonts.length > 0) {
    console.log(`\n⚠️  여전히 없는 폰트 (${finalCheck.missingFonts.length}개):`);
    finalCheck.missingFonts.forEach((f) => console.log(`   - ${f}`));
  }

  console.log("\n🎉 완료! Cloud Run 배포 시 자동으로 GCS에서 폰트를 다운로드합니다.");
}

// 스크립트 실행
uploadFonts().catch((error) => {
  console.error("❌ 스크립트 실행 오류:", error);
  process.exit(1);
});
