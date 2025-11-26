# YouTube OAuth Token Guide - 영구 토큰 설정

Date: 2025-11-25

## 개요

YouTube API를 사용해 자동 업로드를 하려면 OAuth 2.0 인증이 필요합니다.
Refresh Token을 사용하면 영구적으로 인증을 유지할 수 있습니다.

---

## 1. 사전 준비

### 1.1 Google Cloud Console 설정

1. [Google Cloud Console](https://console.cloud.google.com) 접속
2. 프로젝트 선택 또는 새 프로젝트 생성
3. **APIs & Services > Library** 에서 YouTube Data API v3 활성화
4. **APIs & Services > Credentials** 에서 OAuth 2.0 Client ID 생성
   - Application type: Web application
   - Authorized redirect URIs: `http://localhost:3124/api/youtube/auth/callback`

### 1.2 client_secret.json 저장

```bash
# OAuth 클라이언트 정보를 저장
~/.ai-agents-az-video-generator/client_secret.json
```

---

## 2. 채널 인증 절차

### 2.1 로컬 서버 시작

```bash
cd /mnt/d/Data/00_Personal/YTB/short-video-maker
PORT=3124 npm start
```

### 2.2 새 채널 추가 및 인증

```bash
# 1. 채널 추가 (예: ATT 채널)
curl -X POST "http://localhost:3124/api/youtube/channels" \
  -H "Content-Type: application/json" \
  -d '{"channelName": "ATT", "description": "ATT YouTube channel"}'

# 응답에서 authUrl을 브라우저에서 열기
```

### 2.3 브라우저에서 인증

1. authUrl을 브라우저에서 열기
2. 해당 채널이 연결된 Google 계정으로 로그인
3. "허용" 클릭
4. 자동으로 콜백 처리됨

### 2.4 인증 확인

```bash
# 채널 목록 확인
curl "http://localhost:3124/api/youtube/channels"

# 특정 채널 상태 확인
curl "http://localhost:3124/api/youtube/channels/ATT"
```

---

## 3. Refresh Token 작동 원리

### 3.1 토큰 구조

```json
{
  "access_token": "ya29.xxx...",      // 1시간 유효
  "refresh_token": "1//0exxx...",     // 영구 (취소 전까지)
  "scope": "...",
  "token_type": "Bearer",
  "expiry_date": 1764069136187
}
```

### 3.2 자동 갱신 로직

코드에서 자동으로 처리됩니다:

```typescript
// src/youtube-upload/services/YouTubeUploader.ts
private async refreshAccessToken(channelName: string): Promise<string> {
  // access_token 만료 시 refresh_token으로 자동 갱신
  const response = await oauth2Client.refreshToken(refreshToken);
  // 새 access_token 저장
}
```

### 3.3 토큰 만료 시나리오

| 상황 | 동작 |
|------|------|
| access_token 만료 (1시간) | refresh_token으로 자동 갱신 |
| refresh_token 유효 | 계속 사용 가능 |
| refresh_token 취소됨 | 재인증 필요 |
| Google 계정 비밀번호 변경 | 재인증 필요 |

---

## 4. Cloud Run 동기화

### 4.1 로컬 토큰을 Cloud Run에 업로드

```bash
# 1. 토큰 파일 압축
cd ~/.ai-agents-az-video-generator
tar czf youtube-data.tar.gz youtube-channels.json youtube-tokens-*.json

# 2. Base64 인코딩 후 Secret Manager에 업로드
cat youtube-data.tar.gz | base64 > /tmp/youtube-data-base64.txt
gcloud secrets versions add YOUTUBE_DATA --data-file=/tmp/youtube-data-base64.txt

# 3. Cloud Run 서비스 재시작 (새 secret 적용)
gcloud run services update short-video-maker --region=us-central1
```

### 4.2 Secret 버전 확인

```bash
gcloud secrets versions list YOUTUBE_DATA
```

---

## 5. 파일 구조

```
~/.ai-agents-az-video-generator/
├── client_secret.json              # OAuth 클라이언트 정보
├── youtube-channels.json           # 채널 목록 및 메타데이터
├── youtube-tokens-main_channel.json  # main_channel 토큰
├── youtube-tokens-ATT.json         # ATT 채널 토큰
└── youtube-data.tar.gz             # Cloud Run용 압축 파일
```

---

## 6. 새 채널 추가 빠른 가이드

```bash
# 1. 로컬 서버 시작
PORT=3124 npm start

# 2. 채널 추가
curl -X POST "http://localhost:3124/api/youtube/channels" \
  -H "Content-Type: application/json" \
  -d '{"channelName": "NEW_CHANNEL", "description": "새 채널"}'

# 3. 브라우저에서 authUrl 열고 인증

# 4. Cloud Run 동기화
cd ~/.ai-agents-az-video-generator
tar czf youtube-data.tar.gz youtube-channels.json youtube-tokens-*.json
cat youtube-data.tar.gz | base64 > /tmp/youtube-data-base64.txt
gcloud secrets versions add YOUTUBE_DATA --data-file=/tmp/youtube-data-base64.txt

# 5. (선택) Cloud Run 재시작
gcloud run services update short-video-maker --region=us-central1
```

---

## 7. 문제 해결

### 7.1 "Channel not authenticated" 에러

```bash
# 해결: 채널 재인증
curl "http://localhost:3124/api/youtube/auth/CHANNEL_NAME"
# 반환된 URL로 브라우저에서 인증
```

### 7.2 "Invalid grant" 에러

Refresh token이 무효화됨. 재인증 필요:
- Google 계정 비밀번호 변경
- 앱 액세스 권한 취소
- 토큰 6개월 미사용

```bash
# 해결: 채널 재인증
curl "http://localhost:3124/api/youtube/auth/CHANNEL_NAME"
```

### 7.3 Cloud Run에서 인증 안됨

```bash
# Secret 확인
gcloud secrets versions access latest --secret=YOUTUBE_DATA | base64 -d | tar tzf -

# 최신 토큰으로 업데이트
cd ~/.ai-agents-az-video-generator
tar czf youtube-data.tar.gz youtube-channels.json youtube-tokens-*.json
cat youtube-data.tar.gz | base64 > /tmp/youtube-data-base64.txt
gcloud secrets versions add YOUTUBE_DATA --data-file=/tmp/youtube-data-base64.txt
```

---

## 8. API 사용 예시

### 8.1 비디오 생성 + YouTube 자동 업로드

```bash
curl -X POST "https://short-video-maker-xxx.run.app/api/video/consistent-shorts" \
  -H "Content-Type: application/json" \
  -d '{
    "scenes": [...],
    "config": {
      "orientation": "portrait",
      "generateVideos": true
    },
    "character": {
      "description": "캐릭터 설명"
    },
    "youtubeUpload": {
      "enabled": true,
      "channelName": "ATT",
      "title": "비디오 제목",
      "description": "설명",
      "tags": ["tag1", "tag2"],
      "privacyStatus": "public"
    }
  }'
```

### 8.2 Privacy Status 옵션

| 값 | 설명 |
|---|------|
| `public` | 공개 |
| `unlisted` | 미등록 (링크 있는 사람만) |
| `private` | 비공개 |

---

## 9. 현재 등록된 채널

| 채널명 | Channel ID | 상태 |
|--------|------------|------|
| main_channel (CGXR) | UCaadthD1K_3rUodAkVSucPA | ✅ 인증됨 |
| ATT | UC7Qhr0aTucaeQ9I-DhIbFpA | ✅ 인증됨 |

---

## 요약

1. **Refresh Token = 영구 인증** (취소 전까지)
2. **Access Token은 1시간** → 자동 갱신됨
3. **새 채널 추가**: 로컬 서버 → 인증 → Cloud Run 동기화
4. **인증 문제**: 재인증 후 Cloud Run 동기화
