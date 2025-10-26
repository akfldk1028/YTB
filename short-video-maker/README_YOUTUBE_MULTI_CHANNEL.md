# YouTube Multi-Channel Upload API

## 개요

여러 YouTube 채널을 관리하고 각 채널에 비디오를 업로드할 수 있는 다중 채널 지원 API입니다.

## 주요 기능

- ✅ 여러 YouTube 채널 관리
- ✅ 채널별 독립적인 OAuth2 인증
- ✅ **자동 토큰 갱신 (Automatic Token Refresh)**
- ✅ 채널별 비디오 업로드
- ✅ 채널 인증 상태 추적
- ✅ 모듈화된 API 구조

## 파일 구조

```
src/youtube-upload/
├── services/
│   ├── YouTubeChannelManager.ts  # 채널 관리 로직
│   └── YouTubeUploader.ts         # 업로드 로직
├── routes/
│   ├── authRoutes.ts              # OAuth 인증 (~150줄)
│   ├── channelRoutes.ts           # 채널 관리 (~200줄)
│   ├── uploadRoutes.ts            # 비디오 업로드 (~250줄)
│   └── youtubeRoutes.ts           # 메인 라우터 (~40줄)
└── types/
    └── youtube.ts                  # 타입 정의
```

## API 엔드포인트

### 1. 채널 관리 (`/api/youtube/channels`)

#### 채널 추가
```bash
POST /api/youtube/channels
Content-Type: application/json

{
  "channelName": "main_channel"
}
```

Response:
```json
{
  "success": true,
  "channelName": "main_channel",
  "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?...",
  "message": "Channel 'main_channel' added. Please authenticate using the provided URL."
}
```

#### 채널 목록 조회
```bash
GET /api/youtube/channels
# 또는 인증된 채널만
GET /api/youtube/channels?authenticated=true
```

Response:
```json
{
  "channels": [
    {
      "channelName": "main_channel",
      "channelId": "UCxxx...",
      "channelTitle": "My Main Channel",
      "email": "main@example.com",
      "authenticated": true,
      "createdAt": "2025-10-12T10:00:00Z"
    }
  ],
  "count": 1
}
```

#### 특정 채널 조회
```bash
GET /api/youtube/channels/main_channel
```

#### 채널 삭제
```bash
DELETE /api/youtube/channels/main_channel
```

### 2. 인증 (`/api/youtube/auth`)

#### 채널 인증 URL 생성
```bash
GET /api/youtube/auth/main_channel
```

Response:
```json
{
  "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?...",
  "channelName": "main_channel",
  "message": "Please visit this URL to authorize channel 'main_channel'"
}
```

#### OAuth 콜백 (자동 처리)
```bash
GET /api/youtube/auth/callback?code={AUTH_CODE}&state={CHANNEL_NAME}
```

#### 인증 취소
```bash
POST /api/youtube/auth/revoke/main_channel
```

#### 토큰 갱신
```bash
POST /api/youtube/auth/refresh/main_channel
```

### 3. 비디오 업로드 (`/api/youtube/upload`)

#### 비디오 업로드
```bash
POST /api/youtube/upload
Content-Type: application/json

{
  "videoId": "cmg123abc456",
  "channelName": "main_channel",
  "metadata": {
    "title": "My Amazing Video",
    "description": "Video description here",
    "tags": ["shorts", "ai", "viral"],
    "categoryId": "22",
    "privacyStatus": "private"
  },
  "notifySubscribers": false
}
```

Response:
```json
{
  "success": true,
  "videoId": "cmg123abc456",
  "channelName": "main_channel",
  "youtubeVideoId": "dQw4w9WgXcQ",
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "message": "Video uploaded successfully"
}
```

#### 업로드 상태 확인
```bash
GET /api/youtube/upload/status/{videoId}/{channelName}
```

Response:
```json
{
  "videoId": "cmg123abc456",
  "channelName": "main_channel",
  "status": "completed",
  "progress": 100,
  "youtubeVideoId": "dQw4w9WgXcQ",
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "uploadedAt": "2025-10-12T10:30:00Z"
}
```

#### 모든 업로드 상태 조회
```bash
GET /api/youtube/upload/statuses
# 또는 특정 채널의 업로드만
GET /api/youtube/upload/statuses?channelName=main_channel
```

## N8N 워크플로우 예시

### 1단계: 채널 추가 및 인증

```json
// Node 1: 채널 추가
POST http://localhost:3123/api/youtube/channels
{
  "channelName": "main_channel"
}

// Node 2: 반환된 authUrl로 브라우저에서 인증
// 자동으로 /api/youtube/auth/callback 호출됨
```

### 2단계: 비디오 생성 및 업로드

```json
// Node 1: 비디오 생성
POST http://localhost:3123/api/video/nano-banana
{
  "scenes": [...],
  "config": {...}
}

// Node 2: 완료 대기
GET http://localhost:3123/api/video/nano-banana/{{videoId}}/status

// Node 3: YouTube 업로드
POST http://localhost:3123/api/youtube/upload
{
  "videoId": "{{videoId}}",
  "channelName": "main_channel",
  "metadata": {
    "title": "{{title}}",
    "description": "{{description}}",
    "privacyStatus": "private"
  }
}
```

### 3단계: 다중 채널 업로드

```json
// 같은 비디오를 여러 채널에 업로드
// Loop Node로 각 채널에 순차적으로 업로드

// 채널 목록: ["main_channel", "shorts_channel", "viral_channel"]

POST http://localhost:3123/api/youtube/upload
{
  "videoId": "{{videoId}}",
  "channelName": "{{$json.channelName}}",  // Loop에서 주입
  "metadata": {
    "title": "{{title}}",
    "description": "{{description}}",
    "privacyStatus": "private"
  }
}
```

## 데이터 저장 구조

```
~/.ai-agents-az-video-generator/
├── youtube-channels.json           # 채널 목록 및 메타데이터
├── youtube-tokens-main_channel.json    # main_channel 토큰
├── youtube-tokens-shorts_channel.json  # shorts_channel 토큰
└── youtube-tokens-viral_channel.json   # viral_channel 토큰
```

### channels.json 구조:
```json
{
  "channels": {
    "main_channel": {
      "channelName": "main_channel",
      "channelId": "UCxxx...",
      "channelTitle": "My Main Channel",
      "email": "main@example.com",
      "thumbnailUrl": "https://...",
      "authenticated": true,
      "createdAt": "2025-10-12T10:00:00Z"
    }
  }
}
```

## 환경 변수

```bash
# .env 파일
YOUTUBE_CLIENT_SECRET_PATH=D:\Data\00_Personal\YTB\client_secret.json
```

## 설치 및 실행

```bash
# 1. 의존성 설치
npm install

# 2. 환경 변수 설정
echo "YOUTUBE_CLIENT_SECRET_PATH=/path/to/client_secret.json" >> .env

# 3. 서버 시작
npm run dev

# 4. 채널 추가
curl -X POST http://localhost:3123/api/youtube/channels \
  -H "Content-Type: application/json" \
  -d '{"channelName": "main_channel"}'

# 5. 반환된 authUrl로 인증

# 6. 비디오 업로드
curl -X POST http://localhost:3123/api/youtube/upload \
  -H "Content-Type: application/json" \
  -d '{
    "videoId": "your_video_id",
    "channelName": "main_channel",
    "metadata": {
      "title": "Test Video",
      "description": "Testing multi-channel upload",
      "privacyStatus": "private"
    }
  }'
```

## 자동 토큰 갱신 (Automatic Token Refresh)

### 작동 방식

YouTube OAuth2 access token은 **1시간** 후 만료됩니다. 이 API는 **자동으로 토큰을 갱신**합니다:

1. **자동 감지**: OAuth2Client가 토큰 만료를 감지하면 자동으로 refresh token을 사용해 새 access token을 요청
2. **이벤트 리스너**: `oauth2Client.on('tokens')` 이벤트가 발생하면 새 토큰을 자동 저장
3. **Refresh Token 보존**: 새 토큰을 저장할 때 기존 refresh_token을 보존
4. **투명한 처리**: 업로드 중 토큰이 만료되어도 사용자 개입 없이 자동 갱신

### 구현 코드 (YouTubeUploader.ts)

```typescript
// Automatically refresh and save tokens when they expire
oauth2Client.on('tokens', (newTokens) => {
  logger.info({ channelName }, 'Access token automatically refreshed');

  // Merge new tokens with existing tokens (preserve refresh_token)
  const existingTokens = this.channelManager.loadTokens(channelName);
  const updatedTokens = {
    ...existingTokens,
    ...newTokens,
    // Keep refresh_token if not provided in newTokens
    refresh_token: newTokens.refresh_token || existingTokens?.refresh_token,
  };

  // Save updated tokens
  this.channelManager.saveTokens(channelName, updatedTokens as YouTubeTokens);
});
```

### 수동 갱신 (필요시)

자동 갱신이 실패하면 수동으로 갱신 가능:

```bash
POST /api/youtube/auth/refresh/main_channel
```

Response:
```json
{
  "success": true,
  "channelName": "main_channel",
  "message": "Access token refreshed for channel 'main_channel'"
}
```

### 로그 예시

자동 갱신 시 로그에 다음과 같이 표시됩니다:

```json
{
  "level": "info",
  "channelName": "main_channel",
  "msg": "Access token automatically refreshed"
}
```

## 보안 주의사항

1. **절대 커밋하지 말 것:**
   - `client_secret.json`
   - `youtube-tokens-*.json`
   - `youtube-channels.json`

2. **프로덕션 환경:**
   - 모든 업로드는 `privacyStatus: "private"` 로 테스트
   - `notifySubscribers: false` 사용
   - 토큰 파일은 암호화된 저장소에 보관
   - **Refresh token은 절대 노출하지 말 것** - 영구적으로 채널에 접근 가능

3. **API 할당량:**
   - YouTube Data API v3는 일일 할당량 제한이 있음
   - 대량 업로드 시 할당량 관리 필요

## 문제 해결

### "Channel not found"
- 채널을 먼저 추가해야 합니다: `POST /api/youtube/channels`

### "Channel not authenticated"
- 채널 인증이 필요합니다: `GET /api/youtube/auth/{channelName}`
- 반환된 URL로 인증 진행

### "Video file not found"
- videoId로 생성된 비디오가 존재하는지 확인
- `~/.ai-agents-az-video-generator/videos/` 폴더 확인

### "Token expired"
- 토큰 갱신: `POST /api/youtube/auth/refresh/{channelName}`
- 또는 재인증

## 코드 구조 설명

### 모듈화 설계

각 파일이 **200-300줄 이내**로 유지되어 유지보수가 쉽습니다:

- **authRoutes.ts** (~150줄): OAuth 인증만 담당
- **channelRoutes.ts** (~200줄): 채널 CRUD만 담당
- **uploadRoutes.ts** (~250줄): 업로드만 담당
- **youtubeRoutes.ts** (~40줄): 라우터 통합만 담당

### 책임 분리

- **YouTubeChannelManager**: 채널 데이터 관리
- **YouTubeUploader**: 업로드 로직
- **Routes**: API 엔드포인트

이렇게 분리하면:
- 테스트가 쉬움
- 버그 추적이 빠름
- 새 기능 추가가 명확함

## 다음 단계

1. 채널별 업로드 스케줄링
2. 채널별 통계 수집
3. 자동 재시도 로직
4. 업로드 큐 관리

---

**문의사항이나 버그는 GitHub Issues에 등록해주세요.**
