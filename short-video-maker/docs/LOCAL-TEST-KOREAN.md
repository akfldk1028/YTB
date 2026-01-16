# 한글 자막/TTS 로컬 테스트 가이드

## 📋 요약

| 항목 | 로컬 | Docker/Cloud Run |
|------|------|------------------|
| FFmpeg 한글 자막 | ✅ 정상 | ❌ ☒☒☒ 박스 |
| TTS 한글 음성 | ✅ 정상 | ⚠️ 확인 필요 |

**결론: 로컬은 정상, 배포 환경이 문제**

---

## 🔧 테스트 스크립트

### 1. 한글 자막 테스트

```bash
npx tsx scripts/test-korean-subtitle.ts
```

**테스트 내용:**
1. 폰트 파일 존재 확인 (`font/GmarketSansTTFBold.ttf`)
2. TTF magic bytes 검증 (00010000)
3. UTF-8 텍스트 파일 생성
4. FFmpeg drawtext 렌더링

**출력:**
- `temp/test_korean_out.mp4` - 한글 자막이 있는 테스트 영상

### 2. TTS 한글 테스트

```bash
npx tsx scripts/test-korean-tts.ts
```

**테스트 내용:**
1. Gemini API 키 확인
2. GeminiTTS 초기화 (gemini-2.5-pro-preview-tts)
3. 한글 음성 생성 (3개 테스트 문장)
4. PCM → WAV 변환

**출력:**
- `temp/test_korean_tts_*.pcm` - 원본 PCM 파일
- `temp/test_korean_tts_*.wav` - 재생 가능한 WAV 파일

---

## 📁 로컬 테스트 결과 (2026-01-15)

### 한글 자막

```
✅ 폰트: font/GmarketSansTTFBold.ttf (2.4MB)
✅ TTF magic bytes: 00010000 (유효)
✅ UTF-8 인코딩: 정상
✅ FFmpeg 렌더링: 17KB 영상 생성
```

### TTS 한글 음성

```
✅ API: Gemini Pro TTS
✅ Voice: Aoede (여성, 밝고 생동감)
✅ 음성 생성: 3개 문장 모두 성공
✅ 오디오 크기: 128-141KB (2.7-3.0초)
```

---

## 🐳 Docker/Cloud Run 문제 원인 (추정)

### 1. GCS 폰트 다운로드 문제
- GCS에서 다운로드된 폰트 파일 손상
- 다운로드 경로 문제 (`/app/font/`)

### 2. fontconfig 캐시 문제
- `fc-cache` 미실행 또는 실패
- 런타임 폰트 등록 안됨

### 3. FFmpeg fontfile 경로 문제
- Docker 환경에서 경로 해석 차이
- 권한 문제

---

## 🔍 배포 후 확인할 로그

```bash
# Cloud Run 로그에서 검색
[GCS Font]        # 폰트 다운로드 상태
[FONT VALIDATE]   # 폰트 유효성 검증
[FONT CHECK]      # 폰트 파일 존재 확인
fc-cache          # fontconfig 캐시 업데이트
```

### 정상 로그 예시

```json
{"msg": "[GCS Font] ✅ Font downloaded and validated", "fontFile": "GmarketSansTTFBold.ttf", "isValidFont": true}
{"msg": "[GCS Font] ✅ fontconfig cache updated", "fcListOutput": "...Gmarket..."}
{"msg": "[FONT VALIDATE] Subtitle font validation result", "valid": true, "size": 2511976}
```

### 문제 로그 예시

```json
{"msg": "[GCS Font] ⚠️ Downloaded file may not be a valid font", "magicHex": "3c21444f"}
{"msg": "[FONT VALIDATE] Subtitle font validation result", "valid": false, "error": "Invalid font file"}
```

---

## 🛠️ 문제 해결 체크리스트

1. [ ] GCS에 폰트 업로드 확인
   ```bash
   gsutil ls gs://dkdk-474008-short-videos/fonts/
   ```

2. [ ] Cloud Run 로그에서 `[GCS Font]` 확인

3. [ ] 폰트 파일 무결성 검증
   ```bash
   # GCS에서 직접 다운로드해서 로컬과 비교
   gsutil cp gs://dkdk-474008-short-videos/fonts/GmarketSansTTFBold.ttf /tmp/
   diff font/GmarketSansTTFBold.ttf /tmp/GmarketSansTTFBold.ttf
   ```

4. [ ] fontconfig 캐시 확인 (Cloud Run 내부)
   ```bash
   fc-list | grep -i gmarket
   ```

---

## 📝 관련 파일

| 파일 | 설명 |
|------|------|
| `scripts/test-korean-subtitle.ts` | 한글 자막 테스트 |
| `scripts/test-korean-tts.ts` | TTS 한글 테스트 |
| `src/YTB-ffmpeg/SubtitleFilter.ts` | 자막 필터 (validateFontFile) |
| `src/YTB-ffmpeg/utils.ts` | 폰트 경로 탐색 |
| `src/storage/GoogleCloudStorageService.ts` | GCS 폰트 다운로드 + fc-cache |
| `src/YTB-tts/providers/tts/GeminiTTS.ts` | 한글 TTS |
