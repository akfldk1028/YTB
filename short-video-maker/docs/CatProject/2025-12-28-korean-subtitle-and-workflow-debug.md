# 한글 자막 및 워크플로우 디버깅 기록

> 날짜: 2025-12-28
> 작업자: Claude AI
> 목적: 한글 자막 깨짐 해결 및 전체 워크플로우 이해

---

## 📋 문제 히스토리 (시간순)

### 1. 초기 문제: 한글 자막 깨짐 (v3)
- **증상**: 한글이 □□□로 표시됨
- **원인**: FFmpeg fontfile 경로 문제 또는 인코딩 문제
- **파일**: `src/short-creator/libraries/ffmpeg-core/SubtitleFilter.ts`

### 2. v4 회귀: 자막 아예 안 보임
- **증상**: 자막이 완전히 사라짐
- **원인**: `fontfile='${fontPath}'`에서 작은따옴표가 FFmpeg에서 문제
- **해결**: fontfile 경로의 따옴표 제거

### 3. v5 수정 사항
```typescript
// 변경 전 (v4 - 문제 있음)
fontfile='${fontPath}'

// 변경 후 (v5 - 수정됨)
fontfile=${fontPath}
```

**수정 위치** (9곳):
- `SubtitleFilter.ts:63` - createSubtitleFilter (textfile 모드)
- `SubtitleFilter.ts:77` - createSubtitleFilter (inline 모드)
- `SubtitleFilter.ts:169` - createSimplifiedSubtitleFilter (textfile)
- `SubtitleFilter.ts:173` - createSimplifiedSubtitleFilter (inline)
- `SubtitleFilter.ts:270` - createDualLanguageSubtitleFilter (한글)
- `SubtitleFilter.ts:276` - createDualLanguageSubtitleFilter (한글 inline)
- `SubtitleFilter.ts:289` - createDualLanguageSubtitleFilter (영어)
- `SubtitleFilter.ts:370` - createTitleTextFilter (textfile)
- `SubtitleFilter.ts:374` - createTitleTextFilter (inline)

---

## 🔍 테스트 결과

### 테스트 1: PowerShell로 직접 전송 (실패)
```powershell
# PowerShell은 기본적으로 UTF-8을 사용하지 않음
$body = '{"titleText": {"ko": "테스트"}}'
# 서버 수신: "ko": "???? ???" (깨짐)
```

### 테스트 2: Node.js로 UTF-8 전송 (성공)
```javascript
// Node.js는 UTF-8이 기본
const data = JSON.stringify(jsonData);
req.write(data, 'utf8');
// 서버 수신: "ko": "오늘도 평화로운 하루" (정상)
```

### 테스트 비디오 정보
| 항목 | 값 |
|------|-----|
| videoId | `cmjp1j29900000es655mmez9w` |
| 파일 크기 | 479KB (정적 이미지 = VEO 미작동) |
| titleText | "오늘도 평화로운 하루" ✅ |
| 씬 개수 | 3개 |
| skipTTS | true |

---

## ⚠️ 발견된 문제점 (해결됨)

### 문제 1: VEO 영상 생성 실패 - ✅ 원인 규명
- **실제 원인**: Google Gemini API 할당량 초과 (Quota Exceeded)
- **에러 코드**: HTTP 429 `RESOURCE_EXHAUSTED`
- **에러 메시지**: `"You exceeded your current quota, please check your plan and billing details"`
- **VEO 호출 여부**: ✅ 정상적으로 3회 호출됨 (3개 씬 모두)
- **결과**: 3회 모두 실패 → 시스템이 정적 이미지로 fallback (설계대로 동작)
- **파일 크기**: 479KB (정적 이미지) vs ~10MB (VEO 영상)

```
GCP 로그 증거:
fallbackUsed=True;msg=📊 VEO3 conversion summary;totalScenes=3;veo3Failed=3;veo3Success=0
error=Failed to generate video with Veo API: {"error":{"code":429,"message":"You exceeded your current quota..."}}
```

### 해결 방법
1. Google AI Studio 할당량 확인: https://aistudio.google.com/apikey
2. 빌링 설정 확인 및 할당량 증가 요청
3. 또는 다음 리셋 시간까지 대기

### 문제 2: 기존 이미지 사용 안 됨
- `useStoredImageForVeo: false`로 설정됨
- 기존 캐릭터 이미지를 VEO에 사용하려면 `true` 필요

---

## 📁 주요 파일 구조

```
src/short-creator/
├── ShortCreatorRefactored.ts     # 메인 진입점
├── workflows/
│   └── ConsistentShortsWorkflow.ts  # 캐릭터 일관성 워크플로우
└── libraries/
    ├── ffmpeg-core/
    │   ├── index.ts              # FFMpeg Facade
    │   ├── SubtitleFilter.ts     # 자막 필터 (v5 수정됨)
    │   ├── VideoEditor.ts        # 비디오 편집
    │   ├── VideoConcat.ts        # 비디오 연결 (xfade)
    │   └── AudioProcessor.ts     # 오디오 처리
    ├── GoogleVeo.ts              # VEO 2/3/3.1 API
    └── elevenlabs-tts/
        └── ElevenLabsSoundEffects.ts  # 효과음
```

---

## 🔧 API 요청 형식

### 올바른 한글 테스트 요청 (Node.js)
```javascript
const testRequest = {
  "characterReference": {
    "profileId": "cat-couple",
    "characterIds": ["kami", "dalgi"]
  },
  "scenes": [
    {
      "text": "까미가 창문으로 햇살을 바라본다",
      "scenePrompt": "Black cat looking out window",
      "characterIds": ["kami"],
      "firstFrame": { "enabled": true, "description": "..." },
      "endFrame": { "enabled": true, "description": "..." }
    }
  ],
  "config": {
    "orientation": "portrait",
    "generateVideos": true,           // VEO 영상 생성
    "useFrameInterpolation": true,    // VEO 3.1 사용
    "skipTTS": true,                  // 효과음 모드
    "soundEffects": {
      "enabled": true,
      "autoGenerate": true,
      "preset": "CAT_CUTE"
    }
  },
  "titleText": {
    "ko": "오늘도 평화로운 하루",
    "style": "highlight",
    "position": "top",
    "duration": "full"
  }
};
```

### 전송 방법 (UTF-8 필수)
```javascript
// send-test.js
const fs = require('fs');
const https = require('https');

const jsonData = fs.readFileSync('test-korean.json', 'utf8');
const data = JSON.stringify(JSON.parse(jsonData));

// ... https.request with 'utf8' encoding
req.write(data, 'utf8');
```

---

## 📊 GCP 로그 확인 방법

```bash
# 특정 videoId 로그 조회
gcloud logging read "resource.type=cloud_run_revision \
  AND resource.labels.service_name=short-video-maker \
  AND jsonPayload.videoId=VIDEO_ID" \
  --limit=100 --format="value(jsonPayload)" --project=dkdk-474008

# 자막/폰트 관련 로그
... | grep -iE "(subtitle|font|textfile|UTF)"

# VEO 관련 로그
... | grep -iE "(veo|first.*frame|interpolat)"
```

---

## ✅ 해결된 사항

1. **fontfile 따옴표 제거** (v5)
   - 자막이 다시 표시됨

2. **UTF-8 전송 방법**
   - PowerShell 대신 Node.js 사용
   - 한글 정상 수신됨

3. **GCP 로그에서 한글 확인**
   - `titleTextKo=오늘도 평화로운 하루` ✅

---

## ✅ 해결된 사항 추가 (12/28 오후)

### VEO 영상 생성 실패 원인 규명
- **문제**: VEO 영상이 생성되지 않고 정적 이미지만 concat됨
- **분석 과정**: GCP 로그 상세 분석
- **발견**: VEO 3.1 API는 정상 호출됨 (3회), 모두 429 오류로 실패
- **결론**: 코드 버그 아님, Google Gemini API 할당량 문제
- **해결**: 할당량 리셋 대기 또는 빌링 설정 확인

---

## ❌ 미해결 사항 (다음 작업 필요)

### 1. Google Gemini API 할당량 해결
- https://aistudio.google.com/apikey 에서 할당량 확인
- 빌링 설정 확인 또는 리셋 시간 대기
- 할당량 복구 후 VEO 영상 생성 재테스트

### 2. 기존 캐릭터 이미지 사용
- `useStoredImageForVeo: true` 테스트 필요
- 프로필에 저장된 kami, dalgi 이미지 활용

### 3. 효과음 (Sound Effects)
- `skipTTS: true` + `soundEffects.enabled: true` 조합 테스트
- ElevenLabsSoundEffects.ts 동작 확인

### 4. 씬 전환 (Scene Transitions)
- firstFrame/endFrame → VEO 3.1
- xfade 전환 (fade, 0.5s)

---

## 📝 다음 AI를 위한 체크리스트

1. [x] VEO 영상이 실제로 생성되는지 확인
   - ✅ VEO 3.1 API 정상 호출됨 (코드 정상)
   - ⚠️ 현재 429 Quota Exceeded로 실패 중
   - 📋 할당량 복구 후 재테스트 필요

2. [ ] 한글 자막이 비디오에 렌더링되는지 확인
   - v5에서 fontfile 따옴표 제거 완료
   - 비디오 직접 재생하여 확인 필요
   - □□□가 아닌 실제 한글 표시 여부

3. [ ] firstFrame/endFrame 작동 확인
   - VEO 3.1 모드 사용 시
   - 할당량 복구 후 테스트 가능

4. [ ] 효과음 작동 확인
   - skipTTS + soundEffects 조합
   - CAT_CUTE 프리셋

5. [ ] Google Gemini API 할당량 확인
   - https://aistudio.google.com/apikey
   - 빌링 설정 확인

---

## 🔗 관련 문서

- `docs/CatProject/2025-12-25-complete-workflow-guide.md`
- `docs/CatProject/SOUND-EFFECTS-GUIDE.md`
- `docs/2025-12-23-character-image-registration.md`

---

## 💾 메모리 저장 정보

- **memory-service hash**: `066511f4` (테스트 결과)
- **memory-service hash**: `12960afd` (디버깅 히스토리)
- **tags**: `ytb, subtitle, korean, v5, ffmpeg`
