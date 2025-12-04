# YouTube Token 문제 해결 가이드

Last Updated: 2025-12-04 (헬스체크 시스템 추가)

---

## 1. 토큰 구조 이해

```json
{
  "access_token": "ya29.xxx...",      // 1시간 유효, 자동 갱신됨
  "refresh_token": "1//0exxx...",     // 영구적 (취소 전까지)
  "scope": "...",
  "token_type": "Bearer",
  "expiry_date": 1733308800000        // access_token 만료 시간 (밀리초)
}
```

### 자동 갱신 흐름

```
access_token 만료 (1시간)
       ↓
oauth2Client.on('tokens') 이벤트 발생
       ↓
새 access_token 발급 (refresh_token 사용)
       ↓
로컬 파일 저장 + Secret Manager 백업
```

**코드 위치**: `src/youtube-upload/services/YouTubeUploader.ts:94-109`

---

## 2. 에러별 해결 방법

### 2.1 "Token has been expired or revoked" 에러

**원인**: refresh_token 자체가 무효화됨
- Google 계정 비밀번호 변경
- [Google 계정 > 보안 > 서드파티 앱 액세스](https://myaccount.google.com/permissions)에서 앱 삭제
- 6개월 이상 미사용
- OAuth 동의 화면 설정 변경

**해결**: 완전 재인증 필요

```bash
# 1. 로컬 서버 시작 (포트 3124 필수!)
cd /mnt/d/Data/00_Personal/YTB/short-video-maker
PORT=3124 node dist/index.js

# 2. 브라우저에서 인증 URL 열기
http://localhost:3124/api/youtube/auth/ATT

# 3. Google 계정 로그인 후 권한 승인

# 4. Secret Manager 업데이트
cd ~/.ai-agents-az-video-generator
tar czf /tmp/youtube-data.tar.gz youtube-channels.json youtube-tokens-*.json
base64 /tmp/youtube-data.tar.gz > /tmp/youtube-data-base64.txt
gcloud secrets versions add YOUTUBE_DATA --data-file=/tmp/youtube-data-base64.txt --project=dkdk-474008

# 5. Cloud Run 재시작
gcloud run services update short-video-maker --region=us-central1 --project=dkdk-474008 --update-env-vars="RESTART_TRIGGER=$(date +%s)"
```

### 2.2 "access_token expired" 에러 (자동 갱신 안됨)

**원인**: 자동 갱신 로직이 트리거 안됨

**해결**: 수동 갱신 API 호출

```bash
# Cloud Run에서 수동 갱신
curl -X POST "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/youtube/auth/refresh/ATT"

# 성공 응답
{
  "success": true,
  "channelName": "ATT",
  "message": "Access token refreshed for channel 'ATT'"
}
```

### 2.3 "Channel not found" 에러

**원인**: 채널이 등록되지 않음

**해결**: 채널 추가

```bash
curl -X POST "http://localhost:3124/api/youtube/channels" \
  -H "Content-Type: application/json" \
  -d '{"channelName": "NEW_CHANNEL"}'
```

---

## 3. 빠른 재인증 스크립트

```bash
#!/bin/bash
# reauth-youtube.sh

CHANNEL_NAME=${1:-ATT}
PROJECT_ID=${2:-dkdk-474008}
REGION=${3:-us-central1}

echo "=== YouTube 채널 재인증: $CHANNEL_NAME ==="

# 1. 서버가 3124 포트에서 실행 중인지 확인
if ! curl -s http://localhost:3124/health > /dev/null 2>&1; then
    echo "서버가 실행되지 않음. 먼저 실행하세요:"
    echo "  cd /mnt/d/Data/00_Personal/YTB/short-video-maker"
    echo "  PORT=3124 node dist/index.js"
    exit 1
fi

# 2. 인증 URL 가져오기
echo "브라우저에서 이 URL을 열어주세요:"
curl -s "http://localhost:3124/api/youtube/auth/$CHANNEL_NAME" | python3 -c "import sys,json; print(json.load(sys.stdin)['authUrl'])"

echo ""
echo "인증 완료 후 Enter를 누르세요..."
read

# 3. Secret Manager 업데이트
echo "Secret Manager 업데이트 중..."
cd ~/.ai-agents-az-video-generator
tar czf /tmp/youtube-data.tar.gz youtube-channels.json youtube-tokens-*.json
base64 /tmp/youtube-data.tar.gz > /tmp/youtube-data-base64.txt
gcloud secrets versions add YOUTUBE_DATA --data-file=/tmp/youtube-data-base64.txt --project=$PROJECT_ID

# 4. Cloud Run 재시작
echo "Cloud Run 재시작 중..."
gcloud run services update short-video-maker \
  --region=$REGION \
  --project=$PROJECT_ID \
  --update-env-vars="RESTART_TRIGGER=$(date +%s)"

echo "=== 완료! ==="
```

---

## 4. 토큰 상태 확인

### 4.1 로컬 토큰 확인

```bash
# 토큰 파일 확인
cat ~/.ai-agents-az-video-generator/youtube-tokens-ATT.json | python3 -m json.tool

# 만료 시간 확인
python3 -c "
from datetime import datetime
import json
with open('/home/akfldk1028/.ai-agents-az-video-generator/youtube-tokens-ATT.json') as f:
    data = json.load(f)
    expiry = datetime.fromtimestamp(data['expiry_date']/1000)
    print(f'Access Token 만료: {expiry}')
    print(f'현재 시간: {datetime.now()}')
    print(f'만료됨: {datetime.now() > expiry}')
"
```

### 4.2 Secret Manager 토큰 확인

```bash
# Secret 버전 확인
gcloud secrets versions list YOUTUBE_DATA --project=dkdk-474008

# 최신 토큰 내용 확인
gcloud secrets versions access latest --secret=YOUTUBE_DATA --project=dkdk-474008 | \
  base64 -d | tar xzf - -O youtube-tokens-ATT.json | python3 -m json.tool
```

### 4.3 Cloud Run 채널 상태 확인

```bash
# 채널 목록 및 인증 상태
curl -s "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/youtube/channels" | python3 -m json.tool

# 토큰 갱신 테스트
curl -X POST "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/youtube/auth/refresh/ATT"
```

---

## 5. GCP 계정/프로젝트 변경 체크리스트

새 GCP 계정이나 프로젝트로 이전할 때:

### 5.1 새 OAuth 클라이언트 생성

1. [Google Cloud Console](https://console.cloud.google.com) 접속
2. **APIs & Services > Credentials** > Create OAuth Client ID
3. Application type: **Web application**
4. Authorized redirect URIs 추가:
   - `http://localhost:3124/api/youtube/auth/callback`
5. JSON 다운로드 → `~/.ai-agents-az-video-generator/client_secret.json`

### 5.2 Secret Manager 업데이트

```bash
NEW_PROJECT_ID="new-project-id"

# 1. YouTube Client Secret
gcloud secrets create YOUTUBE_CLIENT_SECRET \
  --data-file=~/.ai-agents-az-video-generator/client_secret.json \
  --project=$NEW_PROJECT_ID

# 2. YouTube Data (채널 재인증 후)
cd ~/.ai-agents-az-video-generator
tar czf /tmp/youtube-data.tar.gz youtube-channels.json youtube-tokens-*.json
base64 /tmp/youtube-data.tar.gz > /tmp/youtube-data-base64.txt
gcloud secrets create YOUTUBE_DATA \
  --data-file=/tmp/youtube-data-base64.txt \
  --project=$NEW_PROJECT_ID
```

### 5.3 환경변수 변경 항목

| 변수 | 변경 필요 |
|------|----------|
| `GOOGLE_CLOUD_PROJECT_ID` | 새 프로젝트 ID |
| `GCS_BUCKET_NAME` | 새 버킷 생성 후 변경 |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | 새 시트 또는 권한 공유 |
| `GOOGLE_GEMINI_API_KEY` | 새 프로젝트에서 발급 |

### 5.4 전체 마이그레이션 명령어

```bash
NEW_PROJECT="new-project-id"
NEW_REGION="us-central1"

# 1. API 활성화
gcloud services enable youtube.googleapis.com --project=$NEW_PROJECT
gcloud services enable youtubeanalytics.googleapis.com --project=$NEW_PROJECT
gcloud services enable run.googleapis.com --project=$NEW_PROJECT
gcloud services enable secretmanager.googleapis.com --project=$NEW_PROJECT

# 2. Secrets 생성 (위 섹션 참고)

# 3. 채널 재인증 (위 섹션 참고)

# 4. Cloud Run 배포
./deploy-gcp.sh
```

---

## 6. 현재 설정 정보 (2025-12-04)

### 프로젝트 정보

| 항목 | 값 |
|------|---|
| GCP 프로젝트 | `dkdk-474008` |
| Cloud Run 리전 | `us-central1` |
| Cloud Run URL | `https://short-video-maker-7qtnitbuvq-uc.a.run.app` |

### 등록된 YouTube 채널

| channelName | YouTube 채널 | Channel ID |
|-------------|-------------|------------|
| main_channel | ATT (@att-m6i) | UC7Qhr0aTucaeQ9I-DhIbFpA |
| ATT | CGXR (@cgxr-h3x) | UCaadthD1K_3rUodAkVSucPA |

### Secret Manager 버전

```bash
# 현재 YOUTUBE_DATA 버전 확인
gcloud secrets versions list YOUTUBE_DATA --project=dkdk-474008 --limit=5
```

---

## 7. 자동 갱신 로직 상세

### 코드 위치

`src/youtube-upload/services/YouTubeUploader.ts`

```typescript
// Line 94-109: 자동 갱신 이벤트 핸들러
oauth2Client.on('tokens', (newTokens) => {
  logger.info({ channelName }, 'Access token automatically refreshed');

  // 기존 토큰과 병합 (refresh_token 보존)
  const existingTokens = this.channelManager.loadTokens(channelName);
  const updatedTokens = {
    ...existingTokens,
    ...newTokens,
    refresh_token: newTokens.refresh_token || existingTokens?.refresh_token,
  };

  // 저장 (로컬 + Secret Manager 백업)
  this.channelManager.saveTokens(channelName, updatedTokens);
});
```

### Secret Manager 백업 로직

`src/youtube-upload/services/YouTubeChannelManager.ts:246-250`

```typescript
// Cloud Run 환경에서 자동 백업
if (this.secretManager.isEnabled()) {
  this.secretManager.updateYouTubeDataSecret().catch(error => {
    logger.warn({ error, channelName }, 'Secret Manager backup failed');
  });
}
```

---

## 8. 주의사항

1. **포트 3124 필수**: client_secret.json의 redirect_uri가 `localhost:3124`로 설정됨
2. **prompt=consent 필수**: 새 refresh_token을 받으려면 `prompt=consent`가 필요 (코드에 이미 설정됨)
3. **Secret 버전 관리**: 자동으로 새 버전이 생성되므로 정리 필요
   ```bash
   # 오래된 버전 삭제 (최신 5개 유지)
   gcloud secrets versions list YOUTUBE_DATA --project=dkdk-474008 --format="value(name)" | tail -n +6 | xargs -I {} gcloud secrets versions destroy {} --secret=YOUTUBE_DATA --project=dkdk-474008 --quiet
   ```

---

## 9. 토큰 헬스체크 시스템

### 9.1 헬스체크 API 엔드포인트

모든 채널의 토큰 유효성을 한 번에 확인하는 엔드포인트입니다.

```bash
# 헬스체크 호출
curl -s "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/youtube/auth/health-check" | python3 -m json.tool
```

**응답 예시 (정상):**
```json
{
  "healthy": true,
  "message": "All YouTube tokens are valid",
  "channels": [
    {
      "channelName": "ATT",
      "status": "ok",
      "message": "Token is valid and refreshed"
    }
  ],
  "checkedAt": "2025-12-04T05:55:18.781Z"
}
```

**응답 예시 (문제 발견):**
```json
{
  "healthy": false,
  "message": "Some YouTube tokens are invalid - re-authentication required",
  "channels": [
    {
      "channelName": "main_channel",
      "status": "error",
      "message": "Token refresh failed"
    },
    {
      "channelName": "ATT",
      "status": "ok",
      "message": "Token is valid and refreshed"
    }
  ],
  "checkedAt": "2025-12-04T05:55:18.781Z"
}
```

**HTTP 상태 코드:**
| 코드 | 의미 |
|------|------|
| 200 | 모든 토큰 정상 |
| 503 | 하나 이상의 토큰 무효 (재인증 필요) |
| 500 | 헬스체크 자체 실패 |

### 9.2 Cloud Scheduler 자동 헬스체크

매일 오전 9시(KST)에 자동으로 토큰 상태를 확인합니다.

**스케줄러 정보:**
| 항목 | 값 |
|------|---|
| Job 이름 | `youtube-token-health-check` |
| 스케줄 | `0 9 * * *` (매일 09:00 KST) |
| 리전 | `us-central1` |
| 타임존 | `Asia/Seoul` |

**스케줄러 관리 명령어:**
```bash
# 스케줄러 상태 확인
gcloud scheduler jobs describe youtube-token-health-check \
  --location=us-central1 \
  --project=dkdk-474008

# 수동 실행 (테스트)
gcloud scheduler jobs run youtube-token-health-check \
  --location=us-central1 \
  --project=dkdk-474008

# 스케줄러 일시 중지
gcloud scheduler jobs pause youtube-token-health-check \
  --location=us-central1 \
  --project=dkdk-474008

# 스케줄러 재개
gcloud scheduler jobs resume youtube-token-health-check \
  --location=us-central1 \
  --project=dkdk-474008
```

### 9.3 알림 설정 (선택)

Cloud Monitoring에서 헬스체크 실패 시 이메일 알림을 설정할 수 있습니다.

1. [Cloud Monitoring > Alerting](https://console.cloud.google.com/monitoring/alerting?project=dkdk-474008) 접속
2. **Create Policy** 클릭
3. Log-based metric 선택:
   - Filter: `resource.type="cloud_scheduler_job" AND jsonPayload.status!="200"`
4. Notification channel 추가 (이메일)

---

## 요약

| 문제 | 해결 |
|------|------|
| access_token 만료 | 자동 갱신됨 (또는 `/api/youtube/auth/refresh/CHANNEL` 호출) |
| refresh_token 무효화 | 재인증 필요 (브라우저에서 `/api/youtube/auth/CHANNEL`) |
| Cloud Run 토큰 안됨 | Secret Manager 업데이트 + 서비스 재시작 |
| GCP 계정 변경 | OAuth 클라이언트 재생성 + 전체 재인증 |
| 토큰 상태 일괄 확인 | `/api/youtube/auth/health-check` 호출 |
