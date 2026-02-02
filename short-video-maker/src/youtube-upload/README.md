# YouTube Upload

> YouTube 업로드 및 채널 관리 모듈
> OAuth 토큰 관리, 멀티 채널 지원

---

## 폴더 구조

```
youtube-upload/
├── services/
│   ├── YouTubeUploader.ts       # 비디오 업로드 핵심 로직
│   ├── YouTubeChannelManager.ts # 멀티 채널 관리
│   └── YouTubeSecretManager.ts  # OAuth 토큰 관리
├── routes/                      # API 라우트
├── interfaces/                  # 타입 정의
└── types/                       # 타입 정의
```

---

## 지원 채널

| channelName | YouTube 채널 | Type |
|-------------|-------------|:----:|
| `clickaround` | ClickAround | **Main** |
| `why_cat` | 왜저러냥 | Sub |
| `red_news` | 빨강나라 보수공주 | News |
| `blue_news` | ~~파랑나라 진보왕자~~ (삭제됨) | News |
| `blue_news_2` | 진보나라파랑왕자 | News |

**계정**: clickaround8@gmail.com (전체 동일)

---

## API 엔드포인트

| Method | Endpoint | 설명 |
|--------|----------|------|
| `GET` | `/api/youtube/channels` | 채널 목록 |
| `POST` | `/api/youtube/upload` | 비디오 업로드 |
| `GET` | `/api/youtube/auth/health-check` | 토큰 상태 확인 |

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

## OAuth 토큰 관리

### Secret Manager 구조

```bash
# YouTube 토큰은 Secret Manager에 tar.gz로 저장
gcloud secrets versions add YOUTUBE_DATA --data-file=youtube-data.tar.gz

# 포함 파일:
# - youtube-oauth-token.json (OAuth 토큰)
# - youtube-channels.json (채널 설정)
```

### 토큰 갱신

```bash
# 1. 로컬에서 OAuth 재인증
npm run youtube:auth

# 2. Secret Manager 업데이트
cd scripts
./update-youtube-secret.sh
```

---

## 환경 변수

```bash
YOUTUBE_CLIENT_ID=xxx
YOUTUBE_CLIENT_SECRET=xxx
YOUTUBE_REDIRECT_URI=http://localhost:3124/oauth2callback
```

---

## 관련 문서

- [YOUTUBE_OAUTH_COMPLETE_FLOW.md](../../docs/YOUTUBE_OAUTH_COMPLETE_FLOW.md)
- [YOUTUBE_TOKEN_UPDATE.md](../../docs/Update/YOUTUBE_TOKEN_UPDATE.md)
- [YOUTUBE_CHANNEL_UPLOAD_GUIDE.md](../../docs/YOUTUBE_CHANNEL_UPLOAD_GUIDE.md)
- [YOUTUBE_NEW_CHANNEL_GUIDE.md](../../docs/YOUTUBE_NEW_CHANNEL_GUIDE.md)
