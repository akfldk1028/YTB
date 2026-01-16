# YTB News Project

뉴스 숏츠 자동 생성 모듈. n8n 워크플로우와 연동되어 뉴스 콘텐츠를 YouTube Shorts로 변환합니다.

## 워크플로우

```
n8n (finalNode.json)
    ↓
POST /api/news/create
    ↓
┌─────────────────────────────────────┐
│ 1. Pexels 스톡 이미지 검색          │
│    (실패 시 Nano Banana AI fallback) │
├─────────────────────────────────────┤
│ 2. Gemini Pro TTS 음성 생성         │
│    (한국어 여성 Voice: Aoede 등)     │
├─────────────────────────────────────┤
│ 3. FFmpeg 비디오 합성                │
│    - 이미지 → 비디오                 │
│    - 자막 (GmarketSans Bold)         │
│    - 제목 오버레이 (BlackHanSans)    │
├─────────────────────────────────────┤
│ 4. GCS 업로드                        │
└─────────────────────────────────────┘
    ↓
GET /api/news/status/:videoId
    ↓
downloadUrl (GCS Signed URL)
```

## API 엔드포인트

| Method | Endpoint | 설명 |
|--------|----------|------|
| `POST` | `/api/news/create` | 뉴스 비디오 생성 요청 |
| `GET` | `/api/news/status/:videoId` | 생성 상태 조회 |
| `GET` | `/api/news/download/:videoId` | 비디오 다운로드 |
| `GET` | `/api/news/health` | 헬스 체크 |

## 요청 예시

```bash
curl -X POST https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/news/create \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_version": "1.0",
    "channel": {
      "name": "news_channel",
      "display_name": "뉴스 채널"
    },
    "global_config": {
      "image_generation": "pexels_stock",
      "audio": {
        "voice": "Aoede",
        "tts_provider": "gemini"
      },
      "video": {
        "orientation": "portrait"
      }
    },
    "videos": [{
      "video_id": "news-001",
      "title": "오늘의 뉴스",
      "scenes": [{
        "scene_id": 1,
        "scene_type": "news",
        "narration": "오늘의 주요 뉴스입니다.",
        "image_prompt": "business news",
        "duration": 5,
        "text_overlay": "속보"
      }]
    }]
  }'
```

## TTS 설정

### Gemini TTS (권장) - 2026-01-16 업데이트

**공식 API Voice 목록** (이전 voice name은 deprecated):

| Voice | 성별 | 스타일 | 뉴스 추천 |
|-------|------|--------|-----------|
| `Kore` | 여성 | 또렷하고 명확 | ✅ (뉴스/안내) |
| `Leda` | 여성 | 따뜻하고 친근 | |
| `Zephyr` | 여성 | 부드럽고 편안 | |
| `Aoede` | 여성 | 밝고 생동감 | ✅ |
| `Puck` | 남성 | 활기차고 경쾌 | ✅ |
| `Charon` | 남성 | 단단하고 힘있음 | ✅ (뉴스) |
| `Fenrir` | 남성 | 깊고 중후 | |
| `Enceladus` | 남성 | 차분하고 안정적 | |

```json
{
  "global_config": {
    "audio": {
      "voice": "Kore",
      "tts_provider": "gemini"
    }
  }
}
```

> **Note:** 이전 voice name (Despina, Achernar 등)은 더 이상 지원되지 않습니다.

## 이미지 생성 모드

| 모드 | 설명 |
|------|------|
| `pexels_stock` | Pexels 스톡 이미지만 사용 (YouTube 정책 안전) |
| `nanoBanana` | AI 이미지만 사용 |
| `hybrid` | Pexels 우선, 실패 시 AI fallback (권장) |

## 비디오 스타일

### 자막 (Subtitles)
- 폰트: GmarketSans Bold
- 위치: 화면 중앙
- 색상: 빨간색 (뉴스 스타일)

### 제목 오버레이 (Title)
- 폰트: BlackHanSans
- 위치: 화면 상단
- 배경: 노란색

## 파일 구조

```
src/YTB-news-project/
├── index.ts              # 모듈 export
├── types.ts              # 타입 정의
├── routes.ts             # API 라우터
├── NewsProjectService.ts # 메인 서비스
├── NewsVisualSource.ts   # 이미지 소스 관리
└── utils/
    └── KoreanCaptionSplitter.ts  # 한국어 자막 분리
```

## 환경 변수

```env
# TTS
TTS_PROVIDER=gemini
GOOGLE_GEMINI_API_KEY=your_gemini_api_key

# 이미지
PEXELS_API_KEY=your_pexels_api_key

# 스토리지
GCS_BUCKET_NAME=your-bucket-name
```

## 응답 예시

### 생성 요청 응답
```json
{
  "success": true,
  "videoId": "news_news-001_cmxxxxxx",
  "status": "pending",
  "message": "뉴스 비디오 생성이 시작되었습니다."
}
```

### 상태 조회 응답 (완료)
```json
{
  "videoId": "news_news-001_cmxxxxxx",
  "status": "completed",
  "progress": {
    "current": 4,
    "total": 4,
    "step": "완료"
  },
  "result": {
    "videoId": "news_news-001_cmxxxxxx",
    "status": "completed",
    "duration": 5,
    "downloadUrl": "https://storage.googleapis.com/...",
    "gcsPath": "gs://bucket/videos/..."
  }
}
```

---

## 문제 해결 기록 (2026-01-15)

### 1. Gemini Pro TTS "No audio data in response" 오류

**문제**: Cloud Run에서 Gemini TTS API가 응답은 오지만 audio 데이터가 없음
```
Error: No audio data in response
Response keys: candidates, usageMetadata, modelVersion, responseId
```

**원인**: 공식 문서 기준 request body에 `model` 필드 누락

**해결**: `GeminiTTS.ts`에 `model` 필드 추가
```typescript
// src/YTB-tts/providers/tts/GeminiTTS.ts
const requestBody = {
  contents: [{ parts: [{ text }] }],
  generationConfig: {
    responseModalities: ['AUDIO'],
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: { voiceName: selectedVoice.name }
      }
    }
  },
  // 🔥 공식 문서: model 필드 필수
  model: this.model  // "gemini-2.5-pro-preview-tts"
};
```

**참고**: https://ai.google.dev/gemini-api/docs/speech-generation

---

### 2. 한국어 자막 깨짐 (☒☒☒ 박스 문자)

**문제**: Cloud Run에서 한글 자막이 ☒☒☒ 박스로 표시됨 (로컬은 정상)

**원인**: Docker 컨테이너에 한글 폰트 미설치

**해결**:
1. GCS에서 폰트 다운로드
2. fontconfig에 폰트 등록 (`fc-cache -fv`)

```typescript
// src/YTB-ffmpeg/utils.ts - setupKoreanFonts()
async function setupKoreanFonts(): Promise<void> {
  // 1. GCS에서 폰트 다운로드
  const fontBucket = 'dkdk-474008-short-videos';
  const fontFiles = ['GmarketSansTTFBold.ttf', 'BlackHanSans-Regular.ttf'];

  for (const fontFile of fontFiles) {
    await storage.bucket(fontBucket).file(`fonts/${fontFile}`)
      .download({ destination: path.join(fontDir, fontFile) });
  }

  // 2. fontconfig 등록
  execSync('fc-cache -fv', { stdio: 'inherit' });
}
```

**폰트 GCS 업로드**:
```bash
gsutil cp ./fonts/*.ttf gs://dkdk-474008-short-videos/fonts/
```

---

### 3. 자막-TTS 타이밍 불일치

**문제**: 자막이 TTS 음성과 동기화되지 않고 그룹 단위로 한꺼번에 표시됨

**원인**: `SubtitleFilter.ts`에서 그룹화된 타이밍 사용
```typescript
// Before: 모든 자막이 그룹 시작~끝 시간에 동시 표시
const groupStartTime = startTime / 1000;
const groupEndTime = endTime / 1000;
```

**해결**: 각 자막의 개별 타이밍 사용
```typescript
// After: 각 자막이 자신의 startMs~endMs에 표시
// src/YTB-ffmpeg/SubtitleFilter.ts
captions.forEach((caption, captionIndex) => {
  const startTime = caption.startMs / 1000;  // 개별 타이밍
  const endTime = caption.endMs / 1000;      // 개별 타이밍

  drawTextFilters.push(
    `drawtext=...:enable=between(t\\,${startTime}\\,${endTime})`
  );
});
```

---

### 4. 한국어 자막 분리 로직

**파일**: `src/YTB-news-project/utils/KoreanCaptionSplitter.ts`

**기능**: 나레이션 텍스트를 음절 비율로 시간 배분

```typescript
// 입력: "안녕하세요 반갑습니다" (총 3초)
// 출력:
[
  { text: "안녕하세요", startMs: 0, endMs: 1500 },      // 5음절
  { text: "반갑습니다", startMs: 1500, endMs: 3000 }   // 5음절
]
```

---

## 주요 파일 수정 이력

| 파일 | 수정 내용 |
|------|-----------|
| `src/YTB-tts/providers/tts/GeminiTTS.ts` | request body에 `model` 필드 추가 |
| `src/YTB-ffmpeg/utils.ts` | GCS 폰트 다운로드 + fontconfig 등록 |
| `src/YTB-ffmpeg/SubtitleFilter.ts` | 개별 자막 타이밍 적용 (TTS 동기화) |
| `gcp.Dockerfile` | 폰트 복사 및 fontconfig 설치 |

---

## 테스트

### 로컬 테스트
```bash
cd short-video-maker
npx ts-node scripts/test-news-project.ts
```

### Cloud Run 테스트
```bash
curl -X POST https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/news/create \
  -H "Content-Type: application/json" \
  -d @test_payload.json
```

### 테스트 payload
```json
{
  "workflow_version": "v1.0.0",
  "channel": { "name": "test_channel", "display_name": "테스트 채널" },
  "global_config": {
    "image_generation": "pexels_stock",
    "audio": { "voice": "Aoede", "tts_provider": "gemini" },
    "video": { "orientation": "portrait" }
  },
  "videos": [{
    "video_id": "test_korean_tts",
    "title": "한글 TTS 테스트",
    "scenes": [
      { "scene_id": 1, "narration": "안녕하세요, 한글 음성 테스트입니다.", "image_prompt": "professional news studio" },
      { "scene_id": 2, "narration": "충격적인 뉴스 속보가 도착했습니다!", "image_prompt": "breaking news alert" }
    ]
  }]
}
```

---

## 문제 해결 기록 (2026-01-16)

### 5. Gemini TTS Voice Validation 오류

**문제**: ElevenLabs voice ID가 Gemini TTS로 전달되어 오류 발생
```
Error: Voice name 21m00Tcm4TlvDq8ikWAM is not supported
```

**해결**: `GeminiTTS.ts`에서 voice ID 유효성 검사 추가
```typescript
if (voice) {
  const isFemale = GEMINI_KOREAN_VOICES.female.some(v => v.name === voice);
  const isMale = GEMINI_KOREAN_VOICES.male.some(v => v.name === voice);

  if (!isFemale && !isMale) {
    // 유효하지 않은 voice → 랜덤 voice로 fallback
    selectedVoice = this.getRandomVoice(options?.gender);
  }
}
```

---

### 6. Gemini TTS Voice Names 오류

**문제**: 잘못된 voice name 사용으로 `finishReason: "OTHER"` 반환
- ❌ Achernar, Despina, Autonoe, Erinome, Alnilam (지원 안 됨)
- ✅ Kore, Leda, Zephyr, Aoede, Puck, Charon, Fenrir, Enceladus

**해결**: 공식 API voice name으로 업데이트

---

### 7. Raw PCM Audio 처리 오류

**문제**: Gemini TTS가 raw PCM 반환 → FFmpeg 자동 감지 실패
```
Error: pipe:0: Invalid data found when processing input
```

**해결**: `AudioProcessor.ts`에서 포맷 감지 후 적절한 입력 옵션 적용
```typescript
// Raw PCM: 24kHz, 16-bit signed little-endian, mono
ffmpeg()
  .inputFormat('s16le')
  .inputOptions(['-ar 24000', '-ac 1'])
```

---

### 8. 한글 자막 NFC 정규화

**문제**: NFD 인코딩된 한글이 FFmpeg에서 ☒☒☒로 렌더링

**해결**: `SubtitleFilter.ts`에서 NFC 정규화 추가

---

### 수정된 파일 요약 (2026-01-16)

| 파일 | 수정 내용 |
|------|-----------|
| `GeminiTTS.ts` | Voice validation, 공식 voice names |
| `AudioProcessor.ts` | Raw PCM 포맷 감지 및 처리 |
| `SubtitleFilter.ts` | 한글 NFC 정규화 |
| `gcp.Dockerfile` | UTF-8 locale, 한글 폰트 |

**Cloud Run 환경변수**: `TTS_PROVIDER=gemini`

**테스트 성공**: `news_korean-subtitle-test-01_cmkgh4u2500020ps6a8hh7efm`

---

### 9. 한글 자막 ☒☒☒ 박스 - 인코딩 추적 (2026-01-16 오후)

**문제**: 한글 자막이 다시 ☒☒☒ 박스로 표시됨

**디버깅 방법**: 인코딩 추적을 위한 debug logging 추가

```typescript
// src/YTB-news-project/routes.ts - API 진입점
logger.info({
  rawBodySample: rawBody.substring(0, 500),
  narrationText,
  narrationHex,  // 🔥 hex bytes로 인코딩 검증
  narrationLength: narrationText.length,
  contentType: req.headers['content-type'],
}, '[DEBUG] 🔍 API 요청 원본 확인 (인코딩 추적)');

// src/YTB-ffmpeg/SubtitleFilter.ts - 텍스트 파일 검증
logger.info({
  originalText: caption.text,
  normalizedText,
  writtenContent,
  originalHex,  // 🔥 원본 hex
  writtenHex,   // 🔥 파일에 쓴 후 hex
  textFilePath,
  fileSize: fs.statSync(textFilePath).size,
}, '[DEBUG] 🔍 Subtitle textfile content verification');
```

**근본 원인 발견**:
```
# 정상 (bash heredoc / UTF-8 JSON 파일)
narrationHex: ec9588eb8595ed9598ec84b8ec9a94  → "안녕하세요" ✅

# 비정상 (Windows cmd/PowerShell curl)
narrationHex: efbfbdc8b3efbfbdefbfbd...      → "�ȳ��ϼ���" ❌ (U+FFFD)
```

**결론**: 서버 코드 문제 아님! **클라이언트(Windows 터미널) 인코딩 문제**

- Windows cmd/PowerShell에서 curl로 한글 전송 시 인코딩 손상
- bash heredoc 또는 UTF-8 JSON 파일로 전송 시 정상 작동
- n8n은 UTF-8로 전송하므로 프로덕션에서는 정상 동작

**올바른 테스트 방법**:
```bash
# 방법 1: UTF-8 JSON 파일 사용 (권장)
curl -X POST ".../api/news/create" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d @test_payload_utf8.json

# 방법 2: bash heredoc (Git Bash에서)
curl -X POST ".../api/news/create" \
  -H "Content-Type: application/json; charset=utf-8" \
  --data-binary @- << 'JSONEOF'
{
  "narration": "안녕하세요"
}
JSONEOF
```

**테스트 성공**:
- `news_encoding-test-01_cmkgq4vxg00000ps6dmedg176`
- `news_file-encoding-test-01_cmkgq7z2q00010ps66c4lcwdx`

---

## 🔍 디버깅 로그 위치

| 단계 | 파일 | 로그 메시지 |
|------|------|------------|
| API 진입점 | `routes.ts` | `[DEBUG] 🔍 API 요청 원본 확인` |
| TTS 생성 | `GeminiTTS.ts` | `[GeminiTTS] REST API 호출` |
| 자막 파일 | `SubtitleFilter.ts` | `[DEBUG] 🔍 Subtitle textfile content verification` |
| FFmpeg 폰트 | `SubtitleFilter.ts` | `[FONT PARAM] Generating font parameter` |

**Cloud Run 로그 확인**:
```bash
gcloud logging read "resource.type=cloud_run_revision \
  AND resource.labels.service_name=short-video-maker \
  AND jsonPayload.msg:\"API 요청 원본\"" \
  --limit=5 --format="json" --freshness=10m
```

---

### 10. 제목(Title) 및 자막(Subtitle) 구조 이해 (2026-01-16)

#### 제목(Title) 생성 방식

**중요**: `video.title`과 `scene.text_overlay`는 다른 용도입니다!

| 필드 | 위치 | 용도 | 영상에 표시 |
|------|------|------|------------|
| `video.title` | 비디오 레벨 | YouTube 업로드 메타데이터 | ❌ 표시 안됨 |
| `scene.text_overlay` | 씬 레벨 | **화면 상단 제목** (노란 배경) | ✅ 표시됨 |

```json
{
  "videos": [{
    "video_id": "news-001",
    "title": "오늘의 뉴스",  // ⚠️ 영상에 표시 안됨 (메타데이터용)
    "scenes": [{
      "scene_id": 1,
      "narration": "오늘 주요 뉴스입니다.",
      "text_overlay": "속보",  // ✅ 영상 상단에 표시됨
      "image_prompt": "news studio"
    }]
  }]
}
```

**제목이 안 나오는 원인**:
1. `text_overlay` 필드가 누락됨 → n8n 워크플로우에서 추가 필요
2. `video.title`만 있고 `text_overlay`가 없음 → 구조 변경 필요

#### 자막(Caption) 분리 로직

**파일**: `utils/KoreanCaptionSplitter.ts`

| 설정 | 기본값 | 설명 |
|------|--------|------|
| `maxCaptions` | 8 | 씬당 최대 자막 수 |
| `groupSize` | 5 | 어절 그룹 크기 |
| `minDurationMs` | 400ms | 최소 자막 표시 시간 |
| `maxDurationMs` | 4000ms | 최대 자막 표시 시간 |

**자막 병합 동작**:
- 어절 수가 많으면 그룹화 → 최대 8개 자막으로 제한
- 텍스트는 **짤리지 않음** (병합만 됨)
- 긴 문장은 2줄로 자동 분리 (90px 기준 10자 초과 시)

```typescript
// 예시: "안녕하세요 반갑습니다 오늘 뉴스입니다 감사합니다" (10어절)
// → 그룹화 후: ["안녕하세요 반갑습니다", "오늘 뉴스입니다 감사합니다"]
// → 최대 8개 제한 적용
```

**자막이 짧게 느껴지는 원인**:

| 원인 | 설명 | 해결 방법 |
|------|------|-----------|
| TTS < JSON duration | 자막이 TTS 길이에 맞춰지고, 무음 구간에는 자막 없음 | 정상 동작 (의도된 설계) |
| `maxDurationMs: 4000ms` | 개별 자막 최대 4초 | 설정 변경 가능 |
| 어절 병합 | 긴 narration이 8개 자막으로 압축됨 | `maxCaptions` 증가 |
| 2줄 분리 실패 | 10자 초과 텍스트가 한 줄에 표시 | 자동 2줄 분리 작동 |

**중요한 설계 결정**:
```
씬 타이밍: |--- effectiveDuration (5초) ---|
자막 타이밍: |--- audioDuration (3초) ---|---- 무음 (2초) ----|
                  ↑ 자막 표시                  ↑ 자막 없음
```

현재 자막은 **TTS 음성과 동기화**되도록 설계됨.
무음 구간에는 의도적으로 자막이 표시되지 않음.

**디버깅 로그**:
```bash
# 자막 타이밍 확인
gcloud logging read "jsonPayload.msg:\"SUBTITLE TIMING DEBUG\"" --limit=5

# 개별 씬 duration 확인
gcloud logging read "jsonPayload.msg:\"음성 생성 완료\"" --limit=10
```

**코드 위치 (타이밍 조정 필요시)**:
- `NewsProjectService.ts` Line 279-284: Gemini TTS 자막 생성
- `KoreanCaptionSplitter.ts` Line 76-82: 자막 수 제한 설정

---

## ⚠️ 주의사항 (다음 AI를 위한 메모)

1. **한글 자막 ☒☒☒ 문제 발생 시**:
   - 먼저 Cloud Run 로그에서 `narrationHex` 확인
   - `efbfbd` (U+FFFD) 보이면 → 클라이언트 인코딩 문제
   - 정상 UTF-8 hex 보이면 → FFmpeg/폰트 문제

2. **인코딩 검증 hex 패턴**:
   - `ec9588` = 안, `eb8595` = 녕, `ed9598` = 하 (정상 UTF-8 한글)
   - `efbfbd` = U+FFFD (Unicode Replacement Character = 손상됨)

3. **fontconfig vs fontfile**:
   - Docker: `font='Gmarket Sans TTF Bold'` (fontconfig 방식)
   - Windows: `fontfile=/path/to/font.ttf` (파일 경로 방식)
   - `shouldUseFontConfig()` 함수가 자동 결정

4. **NFC 정규화 필수**:
   - `normalizeKoreanText(text)` → `text.normalize('NFC')`
   - NFD(분해형)로 저장되면 폰트 글리프 매칭 실패
