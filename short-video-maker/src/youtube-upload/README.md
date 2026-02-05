# YouTube Upload

> YouTube 업로드 및 채널 관리 모듈
> OAuth 토큰 관리, 멀티 채널 지원, 댓글 자동 등록

---

## 폴더 구조

```
youtube-upload/
├── services/
│   ├── YouTubeUploader.ts       # 비디오 업로드 + 댓글 등록
│   ├── YouTubeChannelManager.ts # 멀티 채널 관리
│   └── YouTubeSecretManager.ts  # OAuth 토큰 관리
├── routes/                      # API 라우트
├── interfaces/                  # 타입 정의
└── types/                       # 타입 정의
```

---

## 지원 채널

| channelName | YouTube 채널 | Channel ID | Type |
|-------------|-------------|------------|:----:|
| `clickaround` | ClickAround | UC896wwJyux9yn89pQ453CtQ | **Main** |
| `why_cat` | 왜저러냥 | UC896wwJyux9yn89pQ453CtQ | Sub |
| `red_news` | 빨강나라 보수공주 | UC8wQlyHC7iYjzZYBoOAYaKw | News |
| `blue_news` | ~~파랑나라 진보왕자~~ (삭제됨) | UC7Pj-MJOYkYgONLsk3uejSA | News |
| `blue_news_2` | 진보나라파랑왕자 | UCI8D5MdaoNzhSXWUaFAZb8g | News |

**계정**: clickaround8@gmail.com (전체 동일)

---

## API 엔드포인트

| Method | Endpoint | 설명 |
|--------|----------|------|
| `GET` | `/api/youtube/channels` | 채널 목록 |
| `POST` | `/api/youtube/upload` | 비디오 업로드 |
| `GET` | `/api/youtube/auth/health-check` | 토큰 상태 확인 |
| `GET` | `/api/youtube/auth/start?channelName=xxx` | OAuth 인증 시작 |

---

## 업로드 요청 예시

```bash
curl -X POST ".../api/youtube/upload" \
  -H "Content-Type: application/json" \
  -d '{
    "videoId": "generated_video_id",
    "channelName": "why_cat",
    "metadata": {
      "title": "고양이 일상 #shorts",
      "description": "까미와 딸기의 하루",
      "tags": ["고양이", "shorts", "일상"],
      "privacyStatus": "private"
    }
  }'
```

---

## 첫 댓글 자동 등록 (2026-02-02 추가)

### 기능 설명
비디오 업로드 후 자동으로 첫 댓글을 등록합니다 (출처 고지 등).

### 사용 방법
n8n payload의 `videos[0].firstComment` 필드에 댓글 텍스트를 포함:

```json
{
  "global_config": {
    "youtube": {
      "channelName": "blue_news_2"
    }
  },
  "videos": [{
    "video_id": "xxx",
    "firstComment": "이 영상은 AI가 작성한 뉴스입니다.\n출처: https://..."
  }]
}
```

### 동작 흐름
```
POST /api/news/create
  → 비디오 생성
  → YouTube 업로드 → youtubeVideoId
  → firstComment 존재하면 → postComment() 호출
  → 댓글 등록 (실패해도 파이프라인 중단 안 함)
```

### 관련 코드
- `YouTubeUploader.ts:463` - `postComment()` 메서드
- `NewsProjectService.ts:796` - 업로드 후 댓글 등록 호출

---

## OAuth 토큰 관리 (중요!)

### 토큰 파일 위치

| 위치 | 용도 | 설명 |
|------|------|------|
| `D:\Data\00_Personal\YTB\temp-yt\` | **마스터 토큰** | 최신 토큰 관리 위치 |
| `D:\Data\00_Personal\YTB\short-video-maker\` | 로컬 백업 | 개발 시 사용 |
| Secret Manager `YOUTUBE_DATA` | **Cloud Run 배포용** | tar.gz로 압축 저장 |

### 토큰 파일 구조

```
youtube-channels.json           # 채널 설정 (channelName, channelId, authenticated)
youtube-tokens-{channelName}.json  # 각 채널별 OAuth 토큰
```

### 토큰 JSON 예시

```json
{
  "access_token": "ya29.xxx",
  "scope": "https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/yt-analytics.readonly https://www.googleapis.com/auth/youtube.upload",
  "token_type": "Bearer",
  "refresh_token_expires_in": 604799,
  "expiry_date": 1738335600000,
  "refresh_token": "1//0exxx"
}
```

**중요**: `scope`에 `youtube` (전체 권한)가 포함되어야 댓글 등록 가능!

---

## 토큰 업데이트 프로세스 (필독!)

### 언제 업데이트가 필요한가?

1. **새 채널 추가** 시
2. **토큰 만료** 시 (refresh_token도 만료된 경우)
3. **scope 변경** 시 (예: 댓글 권한 추가)
4. **채널 삭제/변경** 시

### 업데이트 순서 (반드시 이 순서대로!)

```bash
# 1. 마스터 토큰 폴더에서 tar.gz 생성
cd D:\Data\00_Personal\YTB\temp-yt
tar -czvf youtube-data.tar.gz youtube-*.json

# 2. base64 인코딩 (중요! Cloud Run이 환경변수로 받으므로 UTF-8 필수)
base64 -w 0 youtube-data.tar.gz > youtube-data-base64.txt

# 3. Secret Manager 업데이트 (base64 파일 업로드)
gcloud secrets versions add YOUTUBE_DATA --data-file=youtube-data-base64.txt --project=dkdk-474008

# 4. 로컬 폴더에도 복사 (동기화)
cp youtube-*.json D:\Data\00_Personal\YTB\short-video-maker/

# 5. Cloud Run 재배포 (새 secret 적용)
cd D:\Data\00_Personal\YTB\short-video-maker
gcloud builds submit --config cloudbuild.yaml --project=dkdk-474008
```

**주의**: tar.gz를 직접 업로드하면 "non-UTF8 data" 에러 발생! 반드시 base64 인코딩 후 업로드!

### 흔한 실수와 해결

| 문제 | 원인 | 해결 |
|------|------|------|
| 채널 인증 실패 | Secret Manager에 토큰 없음 | 위 프로세스 실행 |
| 댓글 등록 실패 | scope에 `youtube` 없음 | OAuth 재인증 후 토큰 업데이트 |
| 업로드는 되는데 댓글 안 됨 | 토큰 파일 누락 | `temp-yt` 폴더 확인 후 업데이트 |
| **non-UTF8 data 에러** | tar.gz 직접 업로드 | **base64 인코딩 후 업로드** (위 프로세스 참고) |
| Container startup failed | Secret 포맷 오류 | base64 인코딩 확인, 버전 확인 |

---

## 새 채널 OAuth 인증

```bash
# 1. 로컬 서버 실행
cd D:\Data\00_Personal\YTB\short-video-maker
npm run dev

# 2. OAuth 인증 시작
curl "http://localhost:3124/api/youtube/auth/start?channelName=new_channel"

# 3. 반환된 URL로 Google 로그인 → 토큰 발급

# 4. temp-yt 폴더에 토큰 파일 복사
cp ~/.ai-agents-az-video-generator/youtube-tokens-new_channel.json D:\Data\00_Personal\YTB\temp-yt/

# 5. youtube-channels.json에 채널 추가

# 6. Secret Manager 업데이트 (위 프로세스)
```

---

## OAuth Scope

현재 사용하는 scope:

```javascript
scopes = [
  'https://www.googleapis.com/auth/youtube.upload',    // 비디오 업로드
  'https://www.googleapis.com/auth/youtube',           // 전체 권한 (댓글 포함)
  'https://www.googleapis.com/auth/yt-analytics.readonly',  // 분석 읽기
];
```

---

## 환경 변수

```bash
YOUTUBE_CLIENT_ID=xxx
YOUTUBE_CLIENT_SECRET=xxx
YOUTUBE_REDIRECT_URI=http://localhost:3124/oauth2callback
```

---

## 트러블슈팅

### 댓글이 안 달릴 때

1. **로그 확인**: Cloud Run 로그에서 "postComment" 또는 "첫 댓글" 검색
2. **토큰 scope 확인**: `youtube-tokens-{channel}.json`에 `youtube` scope 있는지
3. **Secret Manager 버전 확인**: 최신 토큰이 배포되었는지

```bash
# Secret Manager 버전 확인
gcloud secrets versions list YOUTUBE_DATA --project=dkdk-474008
```

### 채널 인증 실패

```bash
# 채널 목록 확인
curl "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/youtube/channels"

# 토큰 상태 확인
curl "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/youtube/auth/health-check"
```

---

## 변경 이력

| 날짜 | 버전 | 변경 내용 |
|------|------|----------|
| 2026-02-03 | v2.1 | Secret Manager 토큰 업데이트 (blue_news_2 추가) |
| 2026-02-02 | v2.0 | 첫 댓글 자동 등록 기능 추가 (`postComment`) |
| 2026-01-31 | v1.5 | blue_news_2 채널 추가 |
| 2026-01-18 | v1.4 | red_news, blue_news 뉴스 채널 추가 |

---

## 관련 문서

- [YOUTUBE_OAUTH_COMPLETE_FLOW.md](../../docs/YOUTUBE_OAUTH_COMPLETE_FLOW.md)
- [YOUTUBE_TOKEN_UPDATE.md](../../docs/Update/YOUTUBE_TOKEN_UPDATE.md)
- [YOUTUBE_CHANNEL_UPLOAD_GUIDE.md](../../docs/YOUTUBE_CHANNEL_UPLOAD_GUIDE.md)
- [YOUTUBE_NEW_CHANNEL_GUIDE.md](../../docs/YOUTUBE_NEW_CHANNEL_GUIDE.md)
