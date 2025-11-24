# YouTube OAuth2 재인증 가이드

**Date**: 2025-11-24
**Problem**: YouTube refresh token revoked - "invalid_grant" error
**Environment**: Google Cloud Shell / WSL / Local Terminal

## 문제 원인

YouTube OAuth2 refresh token이 revoked되는 이유:
- Google 계정당 OAuth 클라이언트당 **최대 50개의 refresh token 제한**
- 새 토큰 생성 시 가장 오래된 토큰 자동 무효화
- 앱 권한 취소 (YouTube Studio에서 연결된 앱 제거)
- 보안 이유로 Google이 token revoke
- 서버 시계가 NTP와 동기화되지 않음

## 순차적 해결 방법

### Step 1: 로컬 서버 시작

WSL 또는 로컬 터미널에서:

```bash
# 프로젝트 디렉토리로 이동
cd /mnt/d/Data/00_Personal/YTB/short-video-maker

# 서버 시작
npm start

# 출력 예시:
# Server running on port 3000
# Open http://localhost:3000 in your browser
```

**중요**: Cloud Run이 아닌 **로컬 환경**에서 실행해야 합니다!

### Step 2: 웹 브라우저에서 접속

```
http://localhost:3000
```

웹 UI가 열리면 "YouTube Channels" 섹션을 찾습니다.

### Step 3: YouTube 채널 재인증

#### 3-1. 기존 채널 확인

웹 UI에서:
- Channel: `main_channel`
- Status: `Authenticated: false` (빨간색) 또는 "Token expired"

#### 3-2. 재인증 시작

1. "main_channel" 옆의 **"Re-authenticate"** 또는 **"Authenticate"** 버튼 클릭
2. Google OAuth 동의 화면으로 리다이렉트됨
3. YouTube 채널 계정으로 로그인
4. 권한 승인:
   - ✅ View your YouTube account
   - ✅ Manage your YouTube videos
   - ✅ Upload YouTube videos

**중요**: `access_type=offline`과 `prompt=consent`로 설정되어 있어야 새 refresh_token을 받습니다.

#### 3-3. 인증 완료 확인

- 웹 UI로 리다이렉트
- Status: `Authenticated: true` (초록색)
- Channel ID, Title 표시됨

### Step 4: 토큰 파일 확인

터미널에서 토큰이 제대로 저장되었는지 확인:

```bash
# 토큰 파일 위치
ls -lh /home/akfldk1028/.ai-agents-az-video-generator/youtube-tokens-main_channel.json

# 토큰 내용 확인 (민감 정보 주의!)
cat /home/akfldk1028/.ai-agents-az-video-generator/youtube-tokens-main_channel.json | python3 -c "
import sys, json
from datetime import datetime
d = json.load(sys.stdin)
exp = d.get('expiry_date', 0)
if exp:
    exp_date = datetime.fromtimestamp(exp/1000)
    print(f'Token expires: {exp_date.strftime(\"%Y-%m-%d %H:%M:%S UTC\")}')
    print(f'Has refresh_token: {\"refresh_token\" in d}')
"
```

**예상 출력**:
```
Token expires: 2025-11-24 08:30:00 UTC  (현재 시각 + 1시간)
Has refresh_token: True
```

### Step 5: GCP Secret Manager 업데이트

#### 5-1. Google Cloud SDK 인증 (처음 1회만)

```bash
# 인증
gcloud auth login

# 프로젝트 설정
gcloud config set project YOUR_PROJECT_ID
```

#### 5-2. 토큰 파일 압축

```bash
cd /home/akfldk1028/.ai-agents-az-video-generator

# tar.gz로 압축
tar czf youtube-data.tar.gz \
  youtube-channels.json \
  youtube-tokens-main_channel.json

# 파일 크기 확인 (약 1-2KB 예상)
ls -lh youtube-data.tar.gz
```

#### 5-3. GCP Secret에 새 버전 추가

**방법 1: 파일에서 직접**
```bash
cat youtube-data.tar.gz | base64 | gcloud secrets versions add YOUTUBE_DATA --data-file=-
```

**방법 2: 명령어 체인**
```bash
base64 youtube-data.tar.gz | gcloud secrets versions add YOUTUBE_DATA --data-file=-
```

**성공 출력**:
```
Created version [11] of the secret [YOUTUBE_DATA].
```

#### 5-4. Secret 업데이트 확인

```bash
# 최신 버전 확인
gcloud secrets versions list YOUTUBE_DATA --limit=3

# 출력 예시:
# NAME  STATE    CREATED
# 11    enabled  2025-11-24T07:20:00
# 10    enabled  2025-11-21T16:36:34
# 9     enabled  2025-11-21T08:11:27
```

**토큰 만료 시간 확인**:
```bash
gcloud secrets versions access latest --secret="YOUTUBE_DATA" | \
  base64 -d | \
  tar xzf - -O youtube-tokens-main_channel.json | \
  python3 -c "
import sys, json
from datetime import datetime
d = json.load(sys.stdin)
exp = d.get('expiry_date', 0)
if exp:
    exp_date = datetime.fromtimestamp(exp/1000)
    now = datetime.utcnow()
    print(f'Token expires: {exp_date.strftime(\"%Y-%m-%d %H:%M:%S UTC\")}')
    print(f'Current time: {now.strftime(\"%Y-%m-%d %H:%M:%S UTC\")}')
    diff = (exp_date - now).total_seconds()
    print(f'Time remaining: {diff/3600:.2f} hours')
    print('✅ Token is VALID' if diff > 0 else '❌ Token is EXPIRED')
"
```

### Step 6: Cloud Run 재배포 (선택 사항)

**Option A: 자동 반영 대기 (권장)**

Cloud Run은 새로운 인스턴스 생성 시 최신 secret version을 자동으로 읽습니다.
- 기존 인스턴스가 idle timeout으로 종료되면 자동 반영
- 또는 다음 비디오 생성 요청 시 반영

**Option B: 즉시 재배포**

```bash
cd /mnt/d/Data/00_Personal/YTB/short-video-maker

# 기존 코드로 재배포 (secret만 업데이트)
gcloud run deploy short-video-maker \
  --region=us-central1 \
  --update-secrets=YOUTUBE_DATA=YOUTUBE_DATA:latest

# 또는 전체 재배포
./deploy-gcp.sh
```

**재배포 확인**:
```bash
# 배포 상태 확인
gcloud run services describe short-video-maker \
  --region=us-central1 \
  --format='value(status.latestReadyRevisionName)'
```

### Step 7: 테스트

Consistent Shorts API 테스트:

```bash
curl -X POST https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/video/consistent-shorts \
  -H "Content-Type: application/json" \
  -d '{
    "character": {
      "description": "Test character",
      "style": "cinematic"
    },
    "scenes": [
      {
        "text": "테스트 영상",
        "scenePrompt": "Test scene"
      }
    ],
    "config": {
      "orientation": "portrait",
      "voice": "af_sky",
      "generateVideos": false
    },
    "youtubeUpload": {
      "enabled": true,
      "channelName": "main_channel",
      "title": "YouTube 자동 업로드 테스트",
      "privacyStatus": "private"
    }
  }'
```

**성공 로그 확인**:
```bash
# Cloud Run 로그에서 확인
gcloud run services logs read short-video-maker \
  --region=us-central1 \
  --limit=50 | grep -E "YouTube|upload|authenticated"

# 예상 출력:
# ✅ Video uploaded to GCS successfully
# 📤 Starting YouTube auto-upload (Channel: main_channel)
# ✅ YouTube video uploaded: VIDEO_ID
```

## 트러블슈팅

### 문제 1: "Channel not found" 에러

**원인**: GCP Secret에 youtube-channels.json이 없거나 손상됨

**해결**:
```bash
# 로컬의 youtube-channels.json 확인
cat /home/akfldk1028/.ai-agents-az-video-generator/youtube-channels.json

# tar.gz 재생성 시 반드시 포함
tar czf youtube-data.tar.gz youtube-channels.json youtube-tokens-main_channel.json
```

### 문제 2: "invalid_grant" 에러 반복

**원인**:
1. Refresh token이 여전히 invalid
2. 서버 시계 동기화 문제

**해결**:
```bash
# 1. YouTube Studio에서 연결된 앱 완전 제거
# https://myaccount.google.com/permissions
# → "Short Video Maker" 찾아서 "Remove Access"

# 2. 로컬 토큰 파일 삭제
rm /home/akfldk1028/.ai-agents-az-video-generator/youtube-tokens-main_channel.json

# 3. 웹 UI에서 완전 재인증 (Step 3부터 다시)

# 4. NTP 시계 동기화 확인 (WSL)
sudo ntpdate time.google.com
```

### 문제 3: "Token expired" 로그인 후 즉시 발생

**원인**: 시계가 1시간 이상 차이남

**해결**:
```bash
# WSL 시계 동기화
sudo hwclock -s
sudo ntpdate pool.ntp.org

# 현재 시각 확인
date -u
```

### 문제 4: Web UI 접속 안 됨

**원인**: 방화벽 또는 포트 충돌

**해결**:
```bash
# 포트 3000 사용 중인 프로세스 확인
lsof -i :3000

# 다른 포트로 시작
PORT=3124 npm start

# 그럼 http://localhost:3124 접속
```

## 자동화된 Token Refresh 메커니즘

코드에 이미 구현되어 있음 (`YouTubeUploader.ts:94-108`):

```typescript
oauth2Client.on('tokens', (newTokens) => {
  // Access token 자동 갱신
  const updatedTokens = { ...existingTokens, ...newTokens };

  // 로컬 파일에 저장
  this.channelManager.saveTokens(channelName, updatedTokens);

  // GCP Secret Manager에 백업 (Cloud Run only)
  if (this.secretManager.isEnabled()) {
    this.secretManager.updateYouTubeDataSecret();
  }
});
```

**동작 방식**:
1. Access token 만료 시 google-auth-library가 자동으로 refresh token 사용
2. 새 access token 받으면 `tokens` 이벤트 발생
3. 로컬 파일 업데이트
4. Cloud Run 환경이면 GCP Secret도 자동 업데이트

**하지만**: Refresh token 자체가 revoked되면 이 메커니즘이 작동하지 않음 → 수동 재인증 필요!

## 참고 자료

### Google 공식 문서

- [Implementing OAuth 2.0 Authorization - YouTube Data API](https://developers.google.com/youtube/v3/guides/authentication)
- [Using OAuth 2.0 for Web Server Applications](https://developers.google.com/youtube/v3/guides/auth/server-side-web-apps)
- [Add a secret version - Secret Manager](https://docs.cloud.google.com/secret-manager/docs/add-secret-version)
- [gcloud secrets update reference](https://cloud.google.com/sdk/gcloud/reference/secrets/update)
- [Configure secrets for Cloud Run services](https://docs.cloud.google.com/run/docs/configuring/services/secrets)

### Stack Overflow 참고

- [YouTube API refresh token revoked with 400 code "invalid_grant"](https://stackoverflow.com/questions/12784816/youtube-api-refresh-token-revoked-with-400-code-invalid-grant-for-seemingly-n)
- [YouTube Data API v3 Refresh Token Keeps Expiring](https://stackoverflow.com/questions/66145647/youtube-data-api-v3-refresh-token-keeps-expiring-on-app-with-publishing-status-s)

## 중요 사항

### Refresh Token 제한

- Google 계정당 OAuth 클라이언트당 **최대 50개**
- 51번째 토큰 생성 시 가장 오래된 토큰 자동 삭제
- 프로덕션 환경에서는 1개의 토큰만 유지 권장

### 보안 주의사항

- Refresh token은 **절대 공개하지 마세요** (Git commit 금지!)
- GCP Secret Manager로 안전하게 관리
- `.gitignore`에 토큰 파일 경로 추가:
  ```
  youtube-tokens-*.json
  youtube-channels.json
  youtube-data.tar.gz
  ```

### Testing vs Production

- **Testing** 앱: Refresh token이 7일마다 만료됨
- **Production** 앱: Refresh token 영구적 (revoke될 때까지)

현재 앱 상태 확인:
1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. OAuth 2.0 Client ID 선택
3. Publishing status 확인

## 다음 AI를 위한 체크리스트

다음에 이 문제를 만나면:

1. ✅ Cloud Run 로그에서 "invalid_grant" 확인
2. ✅ GCP Secret의 토큰 만료 시간 확인
3. ✅ 로컬 환경에서 웹 UI로 재인증
4. ✅ 새 토큰을 GCP Secret에 업데이트
5. ✅ (선택) Cloud Run 재배포
6. ✅ 테스트 API 호출로 검증

**핵심**: Refresh token revoked는 자동 복구 불가능 → 수동 재인증 필수!
