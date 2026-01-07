# PoliticsProject - YouTube to Shorts 자동화

## 개요

YouTube 영상을 다운로드하여 하이라이트를 추출하고, Shorts 형태로 변환 후 자동 업로드하는 시스템.

**Base URL:** `https://short-video-maker-7qtnitbuvq-uc.a.run.app`

---

## 핵심 기능

1. **YouTube 다운로드** - Residential Proxy 사용 (봇 감지 우회)
2. **자막 추출** - 한국어/영어 자동 자막
3. **하이라이트 분석** - Gemini AI로 핵심 구간 추출
4. **세로 영상 변환** - 9:16 비율로 자동 크롭
5. **자막 합성** - 한글 폰트 지원 (NanumGothicBold)
6. **GCS 업로드** - Google Cloud Storage 자동 업로드
7. **YouTube 업로드** - 자동 업로드 (선택)
8. **파일 정리** - 처리 완료 후 임시 파일 자동 삭제

---

## API 엔드포인트

### POST /api/politics/convert

YouTube 영상을 Shorts로 변환

```json
{
  "youtubeUrls": [
    "https://www.youtube.com/watch?v=VIDEO_ID_1",
    "https://www.youtube.com/watch?v=VIDEO_ID_2"
  ],
  "options": {
    "sync": true,
    "outputCount": 3,
    "clipDuration": { "min": 30, "max": 60 },
    "subtitleLang": ["ko", "en"],
    "combineOutput": true,
    "subtitleStyle": {
      "language": "ko",
      "bodySize": 55,
      "outline": 3
    },
    "youtubeUpload": {
      "enabled": true,
      "channelName": "your_channel",
      "privacyStatus": "unlisted"
    }
  }
}
```

### GET /api/politics/status/:jobId

작업 상태 조회

### GET /api/politics/health

헬스체크

---

## 환경 변수

| 변수명 | 설명 | 필수 |
|--------|------|------|
| `RESIDENTIAL_PROXY_URL` | Decodo Proxy URL | ✅ |
| `GOOGLE_GEMINI_API_KEY` | Gemini AI API 키 | ✅ |
| `GCS_BUCKET_NAME` | GCS 버킷 이름 | ✅ |
| `ELEVENLABS_API_KEY` | TTS API (선택) | - |

---

## Residential Proxy 설정

### Decodo (SmartProxy) 설정

```
Host: gate.decodo.com
Port: 10001
Username: sp49ev2jco
Password: [SECRET]
```

### URL 형식

```
http://USERNAME:PASSWORD@gate.decodo.com:10001
```

### GCP Secret Manager 저장

```bash
echo "http://sp49ev2jco:PASSWORD@gate.decodo.com:10001" | \
  gcloud secrets create RESIDENTIAL_PROXY_URL --data-file=-
```

### 대역폭 사용량

- 2GB 플랜 기준
- 720p 10분 영상 ≈ 150MB
- 약 13개 영상 다운로드 가능

---

## 파일 구조

```
src/politics-project/
├── api/
│   ├── routes.ts          # API 라우트
│   └── types.ts           # API 타입
├── core/
│   ├── downloader/
│   │   └── YouTubeDownloader.ts  # YouTube 다운로드 + Proxy
│   ├── parser/
│   │   └── SRTParser.ts          # 자막 파싱
│   ├── analyzer/
│   │   └── HighlightAnalyzer.ts  # AI 하이라이트 분석
│   └── processor/
│       ├── SubtitleBurner.ts     # 자막 합성
│       └── VerticalCropper.ts    # 세로 영상 변환
├── workflow/
│   └── YouTubeToShortsWorkflow.ts  # 전체 워크플로우
└── types/
    └── index.ts           # 공통 타입
```

---

## 워크플로우 흐름

```
1. YouTube URL 입력
   ↓
2. yt-dlp + Residential Proxy로 다운로드
   │
   └─ 실패 시 → ytsearch로 대체 영상 검색 → 대체 영상 다운로드
   │
   └─ 여전히 실패 → Invidious API 폴백
   ↓
3. 자막 추출 (SRT)
   ↓
4. Gemini AI로 하이라이트 분석
   ↓
5. FFmpeg로 클립 추출 + 세로 변환
   ↓
6. 자막 합성 (한글 폰트)
   ↓
7. GCS 업로드
   ↓
8. (선택) YouTube 자동 업로드
   ↓
9. 임시 파일 삭제
```

### 대체 영상 검색 로직

특정 영상이 지역 제한 또는 저작권 문제로 실패하면:

1. **영상 제목 추출** - 메타데이터에서 제목 가져오기
2. **ytsearch 검색** - `ytsearch3:제목`으로 유사 영상 검색
3. **대체 영상 선택** - 원본 제외한 첫 번째 결과로 재시도
4. **Invidious 폴백** - 모든 방법 실패 시 최후의 수단

---

## N8N 연동 예시

### HTTP Request 노드 설정

- **Method:** POST
- **URL:** `https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/politics/convert`
- **Body:**

```json
{
  "youtubeUrls": ["{{ $json.url1 }}", "{{ $json.url2 }}"],
  "options": {
    "sync": true,
    "outputCount": 2,
    "youtubeUpload": {
      "enabled": true,
      "channelName": "politics_channel"
    }
  }
}
```

---

## 테스트 결과 (2026-01-06)

```bash
curl -X POST .../api/politics/convert \
  -d '{"youtubeUrls": ["https://youtube.com/watch?v=..."], "options": {"sync": true}}'
```

**결과:**
- Status: `completed`
- YouTube 다운로드: ✅ (Proxy 사용)
- GCS 업로드: ✅
- 파일 정리: ✅

---

## 트러블슈팅

### 1. YouTube 봇 감지 에러

```
ERROR: Sign in to confirm you're not a bot
```

**해결:** `RESIDENTIAL_PROXY_URL` 환경변수 확인

### 2. 자막 없음

**원인:** 영상에 자막이 없거나, 자동 자막 미지원

**해결:** `subtitleLang` 옵션 조정 또는 자막 없이 진행

### 3. 대역폭 초과

**원인:** Proxy 플랜 용량 초과

**해결:** Decodo 대시보드에서 잔여 용량 확인 및 충전

### 4. Proxy URL 407 Authentication Required

```
WARNING: [youtube] <urlopen error Tunnel connection failed: 407 Proxy Authentication Required>
```

**원인:** Secret Manager의 RESIDENTIAL_PROXY_URL에 개행문자(\n) 포함

**해결:** 코드에서 `.trim()` 적용 (YouTubeDownloader.ts:20)

### 5. 영상이 합쳐지지 않음 (combineOutput 미작동)

**원인:** 2개 URL 중 1개가 실패하면 `outputs.length === 1`이 되어 combine 조건(`> 1`) 불충족

**해결:**
1. 두 URL 모두 성공해야 combine 가능
2. 로그에서 "영상 X 처리 실패" 확인
3. Proxy 연결 문제 해결 (위 4번 참조)

### 6. 자막이 너무 큼

**원인:** CatProject용 기본값 (bodySize: 90)이 Politics에 부적합

**해결:** subtitleStyle 옵션으로 조정 또는 기본값 변경 (55 권장)

```json
{
  "subtitleStyle": {
    "bodySize": 55,
    "outline": 3
  }
}
```

---

## 참고 문서

- [Decodo Dashboard](https://dashboard.decodo.com)
- [yt-dlp PO Token Guide](https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide)
- [GCS 설정 가이드](../GCS_SETUP_GUIDE.md)

---

## 변경 이력

| 날짜 | 변경 내용 |
|------|-----------|
| 2026-01-06 | Residential Proxy 연동 완료 |
| 2026-01-06 | PO Token 방식에서 Proxy 방식으로 전환 |
| 2026-01-06 | 테스트 성공 (YouTube 다운로드 + GCS 업로드) |
| 2026-01-06 | Proxy URL `.trim()` 버그 수정 (407 에러 해결) |
| 2026-01-06 | Politics용 자막 크기 조정 (90 → 55) |
| 2026-01-06 | 대체 영상 검색 로직 추가 (ytsearch 폴백) |
