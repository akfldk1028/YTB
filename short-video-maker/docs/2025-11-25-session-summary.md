# Session Summary - 2025-11-25

## 해결한 문제들

### 1. VEO3 API 불안정 문제

**증상:** VEO3 API가 간헐적으로 "No video generated" 에러 발생

**원인:** VEO3 API가 operation은 "completed" 되지만 비디오가 없는 경우 발생

**해결:**
- `src/short-creator/libraries/GoogleVeo.ts` 수정
- 재시도 로직 추가: "No video generated", "No video URL found", "timeout" 에러 시 3회 재시도
- 대기 시간: 5초 → 10초 → 15초 (점진적)

```typescript
// GoogleVeo.ts:269-306
const isRetryable =
  errorMessage.includes("No video generated") ||
  errorMessage.includes("No video URL found") ||
  errorMessage.includes("timeout");

if (isRetryable && retryCounter < retryTimes) {
  const waitTime = Math.min(5000 * (retryCounter + 1), 15000);
  await new Promise(resolve => setTimeout(resolve, waitTime));
  return await this.findVideo(..., retryCounter + 1, initialImage);
}
```

---

### 2. Scene별 Fallback 처리

**증상:** VEO3가 하나의 scene에서 실패하면 전체 workflow 실패

**해결:**
- `src/short-creator/workflows/ConsistentShortsWorkflow.ts` 수정
- 각 scene을 try-catch로 감싸서 개별 에러 처리
- 3가지 케이스 처리:
  1. 모든 VEO3 성공 → 비디오 클립 결합
  2. 모든 VEO3 실패 → 정적 이미지 비디오로 fallback
  3. 혼합 (일부 성공/실패) → 실패한 scene만 이미지로 변환 후 결합

```typescript
// ConsistentShortsWorkflow.ts:213-358
const sceneResults: Array<{type: 'video' | 'image', path: string, duration: number}> = [];
let veo3SuccessCount = 0;
let veo3FailCount = 0;

for (let i = 0; i < imageDataList.length; i++) {
  try {
    // VEO3 시도
    const video = await this.veoAPI.findVideo(...);
    sceneResults.push({ type: 'video', path: videoPath, duration });
    veo3SuccessCount++;
  } catch (veoError) {
    // 실패 시 이미지로 fallback
    sceneResults.push({ type: 'image', path: imageData.imagePath, duration });
    veo3FailCount++;
  }
}
```

---

### 3. YouTube 자동 업로드 설정

**문제:** Cloud Run에서 "Channel not authenticated" 에러

**해결:**
1. 로컬에서 ATT 채널 OAuth 인증
2. refresh_token이 포함된 토큰 저장
3. Cloud Run Secret Manager에 동기화

**인증된 채널:**
| 채널명 | Channel ID | 상태 |
|--------|------------|------|
| main_channel (CGXR) | UCaadthD1K_3rUodAkVSucPA | ✅ |
| ATT | UC7Qhr0aTucaeQ9I-DhIbFpA | ✅ |

---

## 현재 배포 상태

- **Cloud Run Revision:** short-video-maker-00050-jbg
- **Service URL:** https://short-video-maker-550996044521.us-central1.run.app
- **Git Commit:** 64b013f "Fix: VEO3 retry logic and image fallback on failure"

---

## API 엔드포인트

### Consistent Shorts (캐릭터 일관성 + VEO3 + YouTube 업로드)

```bash
POST /api/video/consistent-shorts

{
  "scenes": [
    {
      "text": "나레이션 텍스트",
      "scenePrompt": "이미지/비디오 프롬프트"
    }
  ],
  "config": {
    "orientation": "portrait",      // portrait | landscape
    "generateVideos": true          // true = VEO3 사용, false = 정적 이미지
  },
  "character": {
    "description": "캐릭터 설명",
    "style": "cinematic",
    "mood": "happy"
  },
  "youtubeUpload": {
    "enabled": true,
    "channelName": "ATT",           // 채널명 (youtube-channels.json에 등록된)
    "title": "영상 제목",
    "description": "설명",
    "tags": ["tag1", "tag2"],
    "privacyStatus": "public"       // public | unlisted | private
  }
}
```

---

## 파일 구조

```
~/.ai-agents-az-video-generator/
├── client_secret.json              # OAuth 클라이언트 정보
├── youtube-channels.json           # 채널 목록
├── youtube-tokens-main_channel.json
├── youtube-tokens-ATT.json
└── youtube-data.tar.gz             # Cloud Run용 압축 파일

/mnt/d/Data/00_Personal/YTB/short-video-maker/
├── src/
│   ├── short-creator/
│   │   ├── libraries/GoogleVeo.ts       # VEO3 재시도 로직
│   │   └── workflows/ConsistentShortsWorkflow.ts  # Fallback 처리
│   └── server/api/consistent-shorts.ts  # API 엔드포인트
└── docs/
    ├── 2025-11-25-youtube-oauth-token-guide.md
    ├── 2025-11-25-cloud-run-queue-processing-issue.md
    └── 2025-11-25-session-summary.md (이 파일)
```

---

## 새 채널 추가 방법

```bash
# 1. 로컬 서버 시작
cd /mnt/d/Data/00_Personal/YTB/short-video-maker
PORT=3124 npm start

# 2. 채널 추가 요청
curl -X POST "http://localhost:3124/api/youtube/channels" \
  -H "Content-Type: application/json" \
  -d '{"channelName": "NEW_CHANNEL"}'

# 3. 브라우저에서 반환된 authUrl 열고 Google 인증

# 4. Cloud Run 동기화
cd ~/.ai-agents-az-video-generator
tar czf youtube-data.tar.gz youtube-channels.json youtube-tokens-*.json
cat youtube-data.tar.gz | base64 > /tmp/yt.txt
gcloud secrets versions add YOUTUBE_DATA --data-file=/tmp/yt.txt

# 5. Cloud Run 재시작
gcloud run services update short-video-maker --region=us-central1 --update-env-vars="RESTART=$(date +%s)"
```

---

## 테스트 결과

### VEO3 + YouTube 업로드 테스트

- **Video ID:** cmief99lv00000es604tkd1n6
- **YouTube URL:** https://www.youtube.com/watch?v=75qw1Uzn96A
- **채널:** ATT (@att-m6i)
- **VEO3:** 2/2 scenes 성공 (각 40초)
- **GCS:** gs://dkdk-474008-short-videos/videos/cmief99lv00000es604tkd1n6.mp4

---

## 주의사항

1. **Refresh Token 만료 조건:**
   - Google 비밀번호 변경
   - 앱 권한 취소
   - 6개월 미사용

2. **VEO3 제한:**
   - Duration: 5-8초 (6 또는 8 권장)
   - 간헐적 실패 가능 → 재시도 로직으로 대응

3. **배포 시:**
   - YouTube 토큰은 YOUTUBE_DATA secret에 저장
   - 새 revision 배포 시 자동으로 최신 secret 사용
