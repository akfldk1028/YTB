# YouTube Auto-Upload Token Expiry Issue

**Date**: 2025-11-24
**Issue**: YouTube 자동 업로드가 Cloud Run에서는 실패하지만 로컬에서는 작동

## 문제 요약

Consistent Shorts 워크플로우가 Cloud Run에서 다음과 같이 작동:
- ✅ TTS 생성 - 정상
- ✅ Nano Banana 이미지 생성 - 정상
- ✅ 비디오 합성 - 정상
- ✅ GCS 업로드 - 정상 (`cmicspoez00040es6g1t33dqq`)
- ❌ **YouTube 업로드 - 실패**

## 에러 내용

```
ERROR: 'invalid_grant'
'Token has been expired or revoked.'
URL: https://oauth2.googleapis.com/token
```

## 순차적 분석 결과

### 1. YouTube 채널 이름 문제 (해결됨)
- **문제**: 테스트에서 `channelName: "default"` 사용했으나 실제는 `"main_channel"`
- **해결**: GCP Secret에서 youtube-channels.json 확인 → "main_channel" 사용하도록 수정
- **결과**: 채널은 인식되었으나 토큰 만료 에러 발생

### 2. 토큰 만료 시간 확인

#### 로컬 환경:
```bash
파일: /home/akfldk1028/.ai-agents-az-video-generator/youtube-tokens-main_channel.json
생성: Nov 17 10:46 (11월 17일)
만료: 2025-11-17 11:46:11 UTC
```

#### GCP Secret:
```bash
Secret: YOUTUBE_DATA
최신 버전: Version 10 (2025-11-21 16:36:34)
```

#### 현재 시간:
```
2025-11-24 07:11:11 UTC
```

### 3. 문제 원인

**로컬 토큰이 11월 17일에 이미 만료되었습니다!**
현재 11월 24일이므로 **7일 전에 만료**된 토큰입니다.

## 왜 로컬에서는 작동하나요?

YouTube OAuth2는 다음 두 가지 토큰을 사용:

1. **Access Token** (단기, 1시간): API 요청에 사용
2. **Refresh Token** (장기, 만료 없음): Access Token 갱신에 사용

### 로컬 환경:
- `google-auth-library`가 자동으로 refresh token으로 access token 갱신
- 토큰 파일(`youtube-tokens-main_channel.json`)을 **자동 업데이트**
- 따라서 만료된 것처럼 보여도 실제로는 런타임에 갱신됨

### Cloud Run 환경:
- GCP Secret Manager는 **읽기 전용**
- 토큰 파일 업데이트 불가능
- Refresh token으로 갱신한 새 access token을 저장할 수 없음
- → **"Token expired" 에러 발생**

## 해결 방법

### Option 1: 로컬에서 최신 토큰 업데이트 (권장)

```bash
# 1. 로컬에서 YouTube 재인증 (웹 UI에서)
cd /mnt/d/Data/00_Personal/YTB/short-video-maker
npm start
# → http://localhost:3000 접속
# → YouTube 채널 재인증

# 2. 최신 토큰 파일 압축
cd /home/akfldk1028/.ai-agents-az-video-generator
tar czf youtube-data.tar.gz \
  youtube-channels.json \
  youtube-tokens-main_channel.json

# 3. GCP Secret 업데이트
cat youtube-data.tar.gz | base64 | \
  gcloud secrets versions add YOUTUBE_DATA --data-file=-

# 4. Cloud Run 재배포 (새 secret 반영)
cd /mnt/d/Data/00_Personal/YTB/short-video-maker
./deploy-gcp.sh
```

### Option 2: YouTubeUploader 코드 수정 (근본적 해결)

현재 YouTubeUploader는 토큰을 파일에서 읽고 쓰는 구조입니다.
Cloud Run 환경을 위해 다음과 같이 수정 필요:

1. **Token Storage Abstraction**:
   - 로컬: 파일 시스템 사용
   - Cloud Run: GCP Secret Manager에 직접 쓰기

2. **코드 위치**: `src/youtube-upload/services/YouTubeUploader.ts`

```typescript
// 현재 구조 (파일 기반)
const auth = await this.authenticate(channelName);

// 개선 필요 (Secret Manager 통합)
if (process.env.USE_GCP_SECRETS === 'true') {
  // Refresh token으로 access token 갱신 후
  // GCP Secret Manager에 직접 업데이트
  await this.updateSecretToken(channelName, newToken);
}
```

## 테스트 로그 증거

### Cloud Run 로그 (2025-11-24 06:59:09 UTC):
```
✅ Video uploaded to GCS successfully
📤 Starting YouTube auto-upload (Channel: main_channel)
❌ YouTube upload failed
ERROR: {
  "error": "invalid_grant",
  "error_description": "Token has been expired or revoked.",
  "url": "https://oauth2.googleapis.com/token"
}
```

### 비디오 정보:
- Video ID: `cmicspoez00040es6g1t33dqq`
- GCS 업로드: 성공 ✓
- YouTube 업로드: 실패 (토큰 만료)

## 다음 단계

1. **즉시 해결**: Option 1로 토큰 재인증 및 업데이트
2. **장기 해결**: Option 2로 코드 수정 (Token refresh를 GCP Secret에 반영)

## 참고 파일

- Local tokens: `/home/akfldk1028/.ai-agents-az-video-generator/youtube-*.json`
- GCP Secret: `YOUTUBE_DATA` (base64 encoded tar.gz)
- Uploader code: `src/youtube-upload/services/YouTubeUploader.ts`
- Test config: `/tmp/consistent-shorts-youtube-test.json`

## 메모리 업데이트 필요

다음 AI를 위한 핵심 정보:
- YouTube 토큰은 **refresh token 메커니즘** 사용
- 로컬은 자동 갱신되지만 **Cloud Run은 read-only secret** 때문에 갱신 불가
- 주기적으로 (30일마다?) 토큰 재인증 필요
- 근본적 해결을 위해서는 **GCP Secret Manager Write 권한** 필요
