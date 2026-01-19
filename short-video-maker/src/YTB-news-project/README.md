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

### 자막 (Subtitles) - 2026-01-17 업데이트
- 폰트: GmarketSans Bold
- 크기: Portrait **90px**, Landscape 72px
- 위치: 화면 중앙 아래 (`h*0.55`)
- 색상: 흰색 (FFFFFF) + 검정 테두리
- **2줄 자동 분리**: **12자** 초과 시 자동 분리 (Portrait)
- 파일: `src/YTB-ffmpeg/SubtitleFilter.ts`

### 제목 오버레이 (text_overlay) - 2026-01-17 업데이트
- 폰트: BlackHanSans
- 크기: **Portrait 90px**, Landscape 72px (⬆️ 72→90 증가!)
- 위치: 화면 상단 8% (`h*0.08`)
- 색상: 검은 글씨 (000000) + 노란 배경 (FFEB3B)
- **2줄 자동 분리**: **10자** 초과 시 자동 분리
- 파일: `src/YTB-ffmpeg/SubtitleFilter.ts`

### 프로젝트별 폰트 설정 (ProjectFontConfig)

n8n에서 프로젝트별로 폰트 크기/색상 조정 가능:

```typescript
interface ProjectFontConfig {
  title_size?: number;      // 제목 크기 (기본: 90) ← 2026-01-17 업데이트
  subtitle_size?: number;   // 자막 크기 (기본: 90)
  title_color?: string;     // 제목 색상 (기본: #000000)
  title_bg_color?: string;  // 제목 배경 (기본: #FFEB3B)
  subtitle_color?: string;  // 자막 색상 (기본: red)
  title_font?: FontPreset;  // 제목 폰트
  subtitle_font?: FontPreset; // 자막 폰트
}
```

**사용 예시** (NewsProjectService에서):
```typescript
const fontConfig: ProjectFontConfig = {
  title_size: 80,           // 제목 더 크게
  subtitle_size: 100,       // 자막 더 크게
  title_color: '#FFFFFF',   // 흰색 제목
  title_bg_color: '#FF0000' // 빨간 배경
};
```

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

## 🔴 한글 자막 ☒☒☒ 문제 - 전체 해결 과정

한글 자막이 ☒☒☒ 박스로 표시되는 문제는 **여러 원인이 겹쳐서** 발생했습니다.
아래는 순차적으로 발견하고 해결한 과정입니다.

### 원인 1: Docker 컨테이너에 한글 폰트 없음 (2026-01-15)

**증상**: Cloud Run에서만 ☒☒☒, 로컬은 정상
**원인**: Docker 이미지에 한글 폰트가 설치되지 않음
**해결**:
```dockerfile
# gcp.Dockerfile
RUN apt-get update && apt-get install -y fontconfig fonts-noto-cjk
COPY fonts/ /usr/share/fonts/truetype/custom/
RUN fc-cache -fv
```

### 원인 2: NFD → NFC 정규화 필요 (2026-01-15 오후)

**증상**: 폰트 설치 후에도 일부 한글이 깨짐
**원인**: Mac/일부 시스템에서 NFD(분해형) 인코딩 사용 → 폰트 글리프 매칭 실패
**해결**:
```typescript
// SubtitleFilter.ts
import { normalizeKoreanText } from './utils';
fs.writeFileSync(textFilePath, normalizeKoreanText(displayText), 'utf-8');

// utils.ts
export function normalizeKoreanText(text: string): string {
  return text.normalize('NFC');  // 조합형으로 변환
}
```

### 원인 3: GCS에서 폰트 다운로드 실패 (2026-01-15 오후)

**증상**: 간헐적으로 ☒☒☒ 발생
**원인**: Container 시작 시 GCS에서 폰트 다운로드가 타임아웃
**해결**:
```typescript
// utils.ts - setupKoreanFonts()
// Dockerfile에 폰트 직접 포함 (GCS 의존성 제거)
```

### 원인 4: Windows 터미널 인코딩 손상 (2026-01-16) ⭐ 가장 어려웠던 문제

**증상**: curl로 테스트하면 ☒☒☒, n8n에서는 정상
**디버깅 방법**: hex 로그 추가
```typescript
// routes.ts
const narrationHex = Buffer.from(narrationText, 'utf-8').toString('hex');
logger.info({ narrationHex }, '[DEBUG] 인코딩 확인');
```

**로그 분석**:
```
# 정상 (UTF-8 JSON 파일로 전송)
narrationHex: ec9588eb8595ed9598ec84b8ec9a94  → "안녕하세요" ✅

# 비정상 (Windows cmd/PowerShell curl)
narrationHex: efbfbdefbfbdefbfbd...           → "���" ❌
```

**원인**: `efbfbd` = U+FFFD (Unicode Replacement Character)
- Windows 터미널이 UTF-8을 CP949로 잘못 변환
- 서버에 도착할 때 이미 깨진 상태

**해결**: 테스트 방법 변경
```bash
# ❌ 잘못된 방법 (Windows cmd/PowerShell)
curl -d '{"narration": "안녕하세요"}'  # 인코딩 손상됨

# ✅ 올바른 방법 1: UTF-8 JSON 파일 사용
curl -d @test_payload_utf8.json -H "Content-Type: application/json; charset=utf-8"

# ✅ 올바른 방법 2: Git Bash + heredoc
curl --data-binary @- << 'EOF'
{"narration": "안녕하세요"}
EOF
```

### 원인 5: fontconfig vs fontfile 경로 혼동 (2026-01-16)

**증상**: Docker에서는 작동, Windows에서 실패 (또는 반대)
**원인**: FFmpeg drawtext 필터가 환경에 따라 다른 폰트 지정 방식 필요

### 🔴 원인 6: fontconfig 폰트 이름 불일치 (2026-01-17) - 최종 해결

**증상**: Docker/Cloud Run에서 한글이 ☒☒☒ 박스로 표시됨
**원인**: fontconfig 방식(`font='Gmarket Sans TTF Bold'`)을 사용할 때,
fc-list에 등록된 실제 폰트 이름과 코드에서 기대하는 이름이 다르면 폰트 로드 실패!

예시:
- 코드 기대값: `font='Gmarket Sans TTF Bold'`
- fc-list 실제: `Gmarket Sans,Gmarket Sans Bold:style=Bold,Regular`

**🔥 최종 해결**:
fontconfig 방식을 완전히 비활성화하고 **fontfile 방식만 사용**
```typescript
// SubtitleFilter.ts - 2026-01-17 수정
function shouldUseFontConfig(): boolean {
  // 🔥 항상 false 반환 → fontfile 방식만 사용
  // fontconfig 방식은 폰트 이름 불일치로 한글 렌더링 실패 위험
  return false;
}
```

**fontfile 방식의 장점**:
- 파일 경로를 직접 지정하므로 폰트 이름 불일치 문제 없음
- `fontfile=/app/font/GmarketSansTTFBold.ttf` 형태
- Docker, Windows, Mac 모든 환경에서 동일하게 작동

### 🔴 원인 7: Windows curl 인코딩 문제 (2026-01-17) - ⭐ 가장 흔한 원인!

**증상**: fontfile 방식 사용해도 여전히 ☒☒☒ 박스
**로그 확인**:
```
# 로그에서 확인
originalText=�ȳ��ϼ��� ❌ 이미 깨진 상태!
originalHex=efbfbdc8b3efbfbd... (efbfbd = 대체 문자)
```

**원인**: Windows 콘솔(cmd/PowerShell)에서 curl 실행 시 시스템 기본 인코딩(CP949)으로 전송
→ 서버에 도착할 때 **이미 한글이 깨진 상태**
→ 폰트 문제가 아님!

**🔥 해결 방법**:
```bash
# ❌ 잘못된 방법 (Windows에서 직접 입력)
curl -d '{"narration": "안녕하세요"}' ...

# ✅ 올바른 방법: UTF-8 JSON 파일 사용
curl -X POST "https://..." \
  -H "Content-Type: application/json; charset=utf-8" \
  -d @test_payload_utf8.json
```

**JSON 파일 작성 시 주의**:
- 파일을 **UTF-8 인코딩**으로 저장 (VS Code: 하단 인코딩 클릭 → "Save with Encoding" → UTF-8)
- `file --mime-encoding filename.json`으로 확인: `utf-8` 출력되어야 함

### 문제 해결 체크리스트 (다음 AI를 위한 참고)

☒☒☒ 박스 발생 시 **순서대로** 확인 (⭐ = 가장 흔한 원인):

| 순서 | 확인 사항 | 확인 방법 | 빈도 |
|------|----------|-----------|------|
| ⭐1 | **API 요청 인코딩** | 로그에서 `originalHex`에 `efbfbd` 있으면 요청 깨짐 | 가장 흔함 |
| 2 | 폰트 파일 존재 | `[FONT CHECK]` 로그에서 fontExists 확인 | 드묾 |
| 3 | NFC 정규화 | `writtenHex` vs `originalHex` 비교 | 드묾 |
| 4 | fontconfig 등록 | `fc-list \| grep -i gmarket` 확인 | 해결됨 |
| 5 | FFmpeg 폰트 파라미터 | `[FONT PARAM]` 로그 확인 | 해결됨 |

**핵심**: 폰트 문제로 보이지만 **대부분 인코딩 문제**임. 먼저 `originalHex` 확인!

---

## 🔧 2026-01-17 UI 개선

### 1. 제목 크기 증가
- Portrait: 72px → **90px**
- Landscape: 56px → **72px**

### 2. 자막 2줄 분리 지원
긴 자막(12자 초과)이 화면 밖으로 넘치는 문제 해결

```typescript
// SubtitleFilter.ts
const maxCharsPerLine = orientation === 'portrait' ? 12 : 16;
const needsTwoLines = captionText.length > maxCharsPerLine;

if (needsTwoLines) {
  // 자막을 2줄로 분리하여 표시
  const { line1, line2 } = this.splitTextIntoTwoLines(captionText, maxCharsPerLine);
  // 첫째 줄: y=h*0.47
  // 둘째 줄: y=h*0.47 + lineHeight
}
```

### 3. 제목 2줄 분리 지원
긴 제목(10자 초과)도 자동으로 2줄 분리

| 항목 | Portrait | Landscape |
|------|----------|-----------|
| 제목 크기 | 90px | 72px |
| 제목 최대 글자수 | 10자 | 14자 |
| 자막 크기 | 90px | 72px |
| 자막 최대 글자수 | 12자 | 16자|

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
- `news_daily_news_cmkgqolr600020ps687wv4o0e` (finalNode.json 테스트, 6씬, 110초)

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

## 🔴 비디오 멈춤(Freeze) 문제 해결 (2026-01-17)

### 증상
- 영상이 중간에 멈추고 오디오만 계속 재생됨
- 특정 씬에서 비디오가 프리즈됨

### 원인
Pexels 비디오가 필요한 씬 duration보다 짧을 때:
- FFmpeg `setDuration(duration)`은 비디오를 **연장하지 않음** (잘라내기만 함)
- 예: 5초 Pexels 비디오 + 10초 씬 → 5초 후 비디오 멈춤

### 해결 (VideoEditor.ts)
`trimAndResizeVideo()` 함수에서 자동 loop 적용:

```typescript
// 1. 소스 비디오 길이 확인
const sourceDuration = await this.getVideoDuration(inputPath);
const needsLoop = sourceDuration < duration;

// 2. 짧으면 무한 루프 적용
if (needsLoop) {
  logger.warn({ sourceDuration, requiredDuration: duration },
    "🔄 Source video shorter than required - applying loop");
  command.inputOptions(['-stream_loop', '-1']);
}
command.setDuration(duration);
```

### 확인 로그
```
🔄 Source video shorter than required - applying loop
   sourceDuration: 5.2
   requiredDuration: 18
   shortfall: 12.8
```

### 관련 파일
- `src/YTB-ffmpeg/VideoEditor.ts` - `trimAndResizeVideo()`, `getVideoDuration()`
- `src/YTB-ffmpeg/README.md` - 상세 설명

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

---

## 🔴🔵 뉴스 채널 설정 (2026-01-18)

### YouTube 채널

| channelName | YouTube 채널명 | Channel ID | 성향 |
|-------------|---------------|------------|------|
| `red_news` | 빨강나라 보수공주 | UC8wQlyHC7iYjzZYBoOAYaKw | 🔴 보수 |
| `blue_news` | 파랑나라 진보왕자 | UC7Pj-MJOYkYgONLsk3uejSA | 🔵 진보 |

**계정**: clickaround8@gmail.com (전체 동일)

### n8n 워크플로우

**파일**: `docs/NewsProject/YTB_260118_NEWS_VIDEO_v2.1.json`

### 채널 타입 옵션

```javascript
// n8n Set Channel Type 노드에서 설정
channel_type: "red_news" | "blue_news" | "news_politics" | "news_economy" | "news_social"
tone: "conservative_fun" | "progressive_fun" | "neutral_fun" | ...
target: "ajae" | "mz" | "senior"
```

### 톤별 스타일

| tone | 설명 | 타겟 |
|------|------|------|
| `conservative_fun` | 🔴 보수 + 유머 | 아재 |
| `progressive_fun` | 🔵 진보 + 유머 | MZ |
| `neutral_fun` | 중립 + 유머 | 전체 |

### 말투 스타일 설정 (2026-01-19 업데이트)

n8n 워크플로우에서 Gemini systemMessage를 통해 말투 스타일 조정:

**핵심 설정 위치**: `Gemini Script (RED/BLUE)` 노드의 `systemMessage`

**현재 스타일**: 디시인사이드/에펨코리아 인터넷 커뮤니티 말투
- 예시 표현: `실화냐?`, `이게 뭔 말임? ㅋㅋ`, `아 진짜 ㅋㅋㅋ`, `미쳤다 진짜`, `대박 ㅋㅋ`, `헐 ㅋㅋ`, `와 진짜`, `뭐하냐고 ㅋㅋ`
- **욕설 절대 금지**: 과장된 감탄과 ㅋㅋㅋ로 유쾌하게
- MZ세대 밈/신조어 적극 활용

**TARGET_OPTIONS speechStyle**:
| target | speechStyle |
|--------|-------------|
| `ajae` | 인터넷 커뮤니티 반말 (실화냐, 미쳤다 진짜, ㅋㅋㅋ) |
| `mz` | 밈/신조어 + 커뮤니티 반말 (ㅋㅋㅋ, 실화냐, 대박) |
| `senior` | 존댓말 |

### 관련 문서

- `docs/Update/NEWS_CHANNEL_SETUP.md` - 뉴스 채널 설정 가이드
- `docs/NewsProject/news_channel_config.js` - n8n 채널 설정 코드 참조

---

## ⏱️ 자막 타이밍 조정 (2026-01-19)

### initialDelayMs 설정

TTS 음성 시작 전 자막이 먼저 나오는 문제 해결을 위한 지연 설정:

**파일**: `src/YTB-news-project/utils/KoreanCaptionSplitter.ts`

```typescript
const initialDelay = options?.initialDelayMs ?? 500;  // 기본값 500ms
```

| 값 | 설명 |
|----|------|
| 100ms | 자막이 TTS보다 빠름 (너무 빠름) |
| 300ms | 기존 기본값 |
| **500ms** | 현재 기본값 (TTS와 동기화 최적) |

### 조정 히스토리
- 2026-01-19: 300ms → 100ms (사용자 피드백: 느림) → **500ms** (최종: 빠름 수정)

---

## 🎬 비디오 Concat 문제 해결 (2026-01-18)

### 증상
- 4번째 씬부터 Pexels 비디오가 멈춤
- 씬과 씬이 겹침 (예: 151초 concat vs 93초 예상)
- 전체 duration은 맞지만 개별 씬 재생 오류

### 원인
FFmpeg stream copy concat 방식의 한계:
- Pexels 비디오 간 keyframe/GOP 구조 차이
- FFmpeg 공식 문서: "Filters are incompatible with stream copying"
- 서로 다른 비디오 소스를 stream copy로 concat하면 재생 오류 발생

### 해결 (VideoConcat.ts)

**이전 방식 (문제 발생)**:
```typescript
// Stream copy - keyframe 불일치로 재생 오류
await runFFmpegSpawn([
  ...inputArgs,
  '-f', 'concat', '-safe', '0', '-i', listFilePath,
  '-c', 'copy',  // ❌ 문제!
  '-y', outputPath
]);
```

**새로운 방식 (정상 동작)**:
```typescript
// 🔥 Filter complex + re-encoding
// 모든 비디오를 정규화 (fps=30, setsar=1, format=yuv420p) 후 concat
const normalizeFilters = inputPaths.map((_, i) =>
  `[${i}:v]fps=30,setsar=1,format=yuv420p[v${i}]`
).join(';');
const concatInputs = inputPaths.map((_, i) => `[v${i}]`).join('');
const filterComplex = `${normalizeFilters};${concatInputs}concat=n=${inputPaths.length}:v=1:a=0[outv]`;

await runFFmpegSpawn([
  ...inputArgs,
  '-filter_complex', filterComplex,
  '-map', '[outv]',
  '-c:v', 'libx264',
  '-preset', 'ultrafast',
  '-crf', '23',
  '-pix_fmt', 'yuv420p',
  '-an',
  '-y',
  outputPath
], 300000); // 5분 타임아웃
```

### FFmpeg 공식 문서 참조
- https://trac.ffmpeg.org/wiki/Concatenate
- "All segments must have same framerate"
- "Filters are incompatible with stream copying"

### 검증 로그
```
📹 [CONCAT VERIFY] 클립 concat 검증
   actualDuration: 96.267
   expectedDuration: 96.262
   difference: 0.005  ✅ (이전: 57.45초 차이)
```

### 관련 파일
- `src/YTB-ffmpeg/VideoConcat.ts` - `concatVideos()`
- `src/YTB-news-project/NewsProjectService.ts` - Pexels 비디오 검증 로그

---

## 🔤 자막 텍스트 Corruption 디버깅 (2026-01-18)

### 증상
- TTS는 정확하게 읽지만 자막에 이상한 문자 표시
- 예: "정의는 반드시 승리한다" → "정의는 반드시 게승리한다"
- 줄바꿈 시 문자 깨짐

### 디버깅 로그 위치

| 단계 | 파일 | 로그 태그 |
|------|------|-----------|
| API 입력 | `routes.ts` | `[DEBUG] 🔍 API 요청 원본 확인` |
| 자막 분리 입력 | `KoreanCaptionSplitter.ts` | `[CAPTION SPLIT DEBUG] 입력 narration 검증` |
| 자막 분리 출력 | `KoreanCaptionSplitter.ts` | `[KoreanCaptionSplitter] 자막 분리 완료` |
| 2줄 분리 | `SubtitleFilter.ts` | `[SPLIT 2LINE DEBUG]` |
| 3줄 분리 | `SubtitleFilter.ts` | `[SPLIT 3LINE DEBUG]` |
| 텍스트 파일 | `SubtitleFilter.ts` | `[DEBUG] 🔍 Subtitle textfile content verification` |

### 유니코드 안전 처리 (2026-01-18 수정)

**이전 방식 (문제 가능)**:
```typescript
// substring은 surrogate pair를 깨뜨릴 수 있음
const mid = Math.ceil(text.length / 2);
line1 = text.substring(0, mid);
line2 = text.substring(mid);
```

**새로운 방식 (유니코드 안전)**:
```typescript
// [...text]는 유니코드 코드포인트 배열로 변환
const chars = [...text];
const mid = Math.ceil(chars.length / 2);
line1 = chars.slice(0, mid).join('');
line2 = chars.slice(mid).join('');
```

### 텍스트 무결성 검증
```typescript
// 분리 전후 텍스트 비교
const combinedText = line1.trim() + ' ' + line2.trim();
const originalNormalized = text.replace(/\s+/g, ' ').trim();
logger.debug({
  textIntegrity: combinedText === originalNormalized,
  combinedText,
  originalNormalized
}, '[SPLIT 2LINE DEBUG] 텍스트 무결성 검증');
```

### Cloud Run 로그 확인
```bash
# 자막 분리 입력 검증
gcloud logging read "jsonPayload.msg:\"CAPTION SPLIT DEBUG\"" --limit=5

# 2줄 분리 디버깅
gcloud logging read "jsonPayload.msg:\"SPLIT 2LINE DEBUG\"" --limit=5

# hex 인코딩 확인 (corruption 추적)
gcloud logging read "jsonPayload.narrationHex:*" --limit=5
```

### Hex 패턴 가이드
- 정상 한글: `ec9588` (안), `eb8595` (녕), `ed9598` (하)
- 손상됨: `efbfbd` (U+FFFD = Unicode Replacement Character)
- 정상 공백: `20`

---

## 📊 프로젝트 현황 요약

### 지원 기능

| 기능 | 상태 | 설명 |
|------|------|------|
| Pexels 스톡 이미지 | ✅ | YouTube 정책 안전 |
| Nano Banana AI 이미지 | ✅ | fallback 용 |
| Gemini Pro TTS | ✅ | 고품질 한국어 음성 |
| ElevenLabs TTS | ✅ | 영어/다국어 |
| 한글 자막 | ✅ | NFC 정규화 + fontfile 방식 |
| 자막 2줄 분리 | ✅ | 12자 초과 시 자동 |
| 제목 2줄 분리 | ✅ | 10자 초과 시 자동 |
| GCS 업로드 | ✅ | Signed URL 다운로드 |
| 비디오 루프 | ✅ | 짧은 비디오 자동 루프 |

### 해결된 주요 이슈

| 이슈 | 원인 | 해결 |
|------|------|------|
| ☒☒☒ 한글 박스 | 인코딩/폰트 | fontfile 방식 + NFC |
| 비디오 프리즈 | 소스 비디오 짧음 | stream_loop 자동 적용 |
| TTS 오디오 없음 | model 필드 누락 | request body에 model 추가 |
| 자막 동기화 | 그룹 타이밍 | 개별 타이밍 적용 |
| 씬 겹침/멈춤 | stream copy concat | filter_complex + re-encoding |
| 자막 문자 깨짐 | substring 유니코드 | [...text] 코드포인트 배열 |
| 자막 TTS 동기화 | 자막이 TTS보다 빠름 | initialDelayMs=500ms |
| 말투 스타일 | 단조로운 말투 | 인터넷 커뮤니티 말투 (ㅋㅋㅋ, 실화냐) |

---

## 🎯 프로젝트별 설정 (2026-01-19)

### 자막 위치 (SubtitleConfig)

| 프로젝트 | 자막 위치 | yPosition | 설정 파일 |
|---------|----------|-----------|-----------|
| NewsProject | 화면 중앙 | `h*0.50` | `NewsProjectService.ts` |
| CatProject (ShortCreator) | 화면 하단 | `h*0.72` | `VideoProcessor.ts` |

**코드 예시**:
```typescript
// NewsProject: 중앙 자막
const subtitleConfig: SubtitleConfig = {
  yPosition: 'h*0.50',  // 정치 채널은 중앙 자막
};

// CatProject: 하단 자막
const subtitleConfig: SubtitleConfig = {
  yPosition: 'h*0.72',  // 고양이 채널은 하단 자막
};
```

### 제목 크기 (ProjectFontConfig)

| 프로젝트 | 제목 크기 | 기본값 | 설정 파일 |
|---------|----------|--------|-----------|
| NewsProject | 90 (기본) | 90 | `NewsProjectService.ts` |
| CatProject | 70 | 90 | `VideoProcessor.ts` |

**코드 예시**:
```typescript
// CatProject: 제목 작게
const fontConfig: ProjectFontConfig = {
  title_size: 70,  // 고양이 채널은 제목 작게 (기본 90)
};
```

### n8n 수정 필요 없음

프로젝트별 설정은 **코드에서 자동 적용**됨:
- n8n에서 채널별 switch → 다른 API endpoint 호출
- 각 프로젝트 코드에서 자막 위치, 제목 크기 자동 설정
- fontConfig, subtitleConfig 추가 파라미터 필요 없음
