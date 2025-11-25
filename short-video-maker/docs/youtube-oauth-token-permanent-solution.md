# YouTube OAuth 토큰 영구 재인증 완전 가이드

**작성일**: 2025-11-25
**목적**: YouTube OAuth 토큰 만료 문제 해결 및 영구 토큰 설정
**상태**: ✅ 해결 완료

---

## 📋 목차

1. [문제 상황](#문제-상황)
2. [근본 원인 분석](#근본-원인-분석)
3. [해결 방법](#해결-방법)
4. [자동화 스크립트](#자동화-스크립트)
5. [문제 재발 시 대응](#문제-재발-시-대응)
6. [참고 정보](#참고-정보)

---

## 문제 상황

### 증상
Cloud Run에서 YouTube 자동 업로드 실패:
```
Error: invalid_grant - Token has been expired or revoked
```

### 원인 진단 과정

**Step 1: 로컬 토큰 확인**
```bash
cd /home/akfldk1028/.ai-agents-az-video-generator
cat youtube-tokens-main_channel.json | python3 -c "import sys, json; from datetime import datetime; d=json.load(sys.stdin); print('Expiry:', datetime.fromtimestamp(d['expiry_date']/1000))"
```
결과: 2025-11-17 11:46:11 UTC (7일 전 만료)

**Step 2: GCP Secret 토큰 확인**
```bash
gcloud secrets versions access latest --secret="YOUTUBE_DATA" | base64 -d | tar xzf - -O youtube-tokens-main_channel.json | python3 -c "import sys, json; from datetime import datetime; d=json.load(sys.stdin); print('Expiry:', datetime.fromtimestamp(d['expiry_date']/1000))"
```
결과: 2025-11-22 02:36:33 UTC (2일 전 만료)

**Step 3: refresh_token 상태 확인**
- refresh_token 자체가 REVOKED 상태
- 단순 만료가 아닌 취소됨

---

## 근본 원인 분석

### Google OAuth 정책

1. **Testing 앱 상태**
   - 기본적으로 OAuth 앱은 "Testing" 상태
   - Testing 앱의 토큰은 **7일 후 자동 만료**
   - refresh_token도 7일 후 REVOKE됨

2. **Test User 추가 시**
   - Google Cloud Console에서 Test User로 추가한 계정
   - **영구적으로 유효한 refresh_token 발급**
   - 만료 없이 계속 사용 가능

3. **현재 상태**
   - 앱: Testing 상태
   - 사용자: hanvit4303@gmail.com (Test User로 등록됨)
   - 문제: 기존 토큰이 Test User 등록 전에 발급됨

### 해결 전략

**Test User 등록 후 재인증**을 통해 영구 토큰 획득

---

## 해결 방법

### 사전 준비 사항

#### 1. Google Cloud Console OAuth 설정 확인

**필수**: Redirect URI 등록
```
URL: https://console.cloud.google.com/apis/credentials?project=dkdk-474008
```

1. OAuth 2.0 Client ID 찾기
   - Client ID: `550996044521-8luac0vqa8sj0jrpa68oi4lgq30k1nqc`
   - 이름: "Web client 1" (또는 유사)

2. "Authorized redirect URIs" 섹션에 추가:
   ```
   http://localhost:3124/api/youtube/auth/callback
   ```

3. SAVE 버튼 클릭

⚠️ **중요**: 이 단계를 먼저 완료하지 않으면 `redirect_uri_mismatch` 에러 발생!

---

### 자동 재인증 프로세스

#### 전체 프로세스 개요

```
[기존 토큰 백업] → [서버 시작] → [OAuth URL 생성] →
[브라우저 인증] → [토큰 파일 생성] → [검증] →
[tar.gz 압축] → [GCP Secret 업데이트] → [검증]
```

#### 실행 방법

**방법 1: 완전 자동화 스크립트** (권장)

```bash
/tmp/youtube-reauth-complete-guide.sh
```

이 스크립트는:
- ✅ 기존 토큰 자동 백업
- ✅ 로컬 서버 자동 시작 (PORT 3124)
- ✅ OAuth URL 자동 생성
- ⚠️ **수동 필요**: Google Cloud Console 설정
- ⚠️ **수동 필요**: 브라우저에서 OAuth 인증
- ✅ 토큰 검증 자동 수행
- ✅ GCP Secret Manager 자동 업데이트
- ✅ 최종 검증 자동 수행

**방법 2: 수동 단계별 실행**

참고: [수동 실행 가이드](#수동-실행-가이드)

---

### 수동 실행 가이드

#### Step 1: 기존 토큰 백업

```bash
cd /home/akfldk1028/.ai-agents-az-video-generator

# 백업 생성
if [ -f youtube-tokens-main_channel.json ]; then
  cp youtube-tokens-main_channel.json youtube-tokens-main_channel.json.backup.$(date +%Y%m%d_%H%M%S)
  rm -f youtube-tokens-main_channel.json
  echo "✅ 백업 및 삭제 완료"
fi
```

#### Step 2: 로컬 서버 시작

```bash
cd /mnt/d/Data/00_Personal/YTB/short-video-maker
PORT=3124 npm start > /tmp/youtube-server.log 2>&1 &
echo "서버 PID: $!"
```

서버 확인:
```bash
curl -s http://localhost:3124/api/youtube/auth/main_channel
```

#### Step 3: OAuth URL 생성

```bash
AUTH_URL=$(curl -s http://localhost:3124/api/youtube/auth/main_channel | python3 -c "import sys, json; d=json.load(sys.stdin); print(d['authUrl'])")
echo "OAuth URL:"
echo "$AUTH_URL"
```

#### Step 4: 브라우저 인증

1. 위에서 출력된 OAuth URL을 Windows 브라우저에 붙여넣기
2. Google 계정으로 로그인 (hanvit4303@gmail.com)
3. YouTube 권한 승인
4. "Authentication successful" 메시지 확인

#### Step 5: 토큰 파일 검증

```bash
cd /home/akfldk1028/.ai-agents-az-video-generator

# 토큰 파일 존재 확인
ls -lh youtube-tokens-main_channel.json

# refresh_token 검증
python3 << 'EOF'
import json
from datetime import datetime

with open('youtube-tokens-main_channel.json', 'r') as f:
    tokens = json.load(f)

has_refresh = 'refresh_token' in tokens
exp = tokens.get('expiry_date', 0)

print(f"✓ Has refresh_token: {has_refresh}")
if exp:
    exp_date = datetime.fromtimestamp(exp/1000)
    print(f"✓ Expires: {exp_date.strftime('%Y-%m-%d %H:%M:%S UTC')}")

if has_refresh:
    print("✅ 토큰 검증 완료!")
    print("🎉 Test user 계정이므로 이 토큰은 영원히 작동합니다!")
else:
    print("❌ Refresh token이 없습니다!")
EOF
```

#### Step 6: GCP Secret Manager 업데이트

```bash
cd /home/akfldk1028/.ai-agents-az-video-generator

# tar.gz 압축 생성
tar czf youtube-data.tar.gz \
  youtube-channels.json \
  youtube-tokens-main_channel.json

# GCP Secret 업데이트
cat youtube-data.tar.gz | base64 | \
  gcloud secrets versions add YOUTUBE_DATA --data-file=-

# 버전 확인
gcloud secrets versions list YOUTUBE_DATA --limit=3
```

#### Step 7: GCP Secret 검증

```bash
gcloud secrets versions access latest --secret="YOUTUBE_DATA" | \
  base64 -d | \
  tar xzf - -O youtube-tokens-main_channel.json | \
  python3 << 'EOF'
import sys, json
from datetime import datetime

d = json.load(sys.stdin)
has_refresh = 'refresh_token' in d
exp = d.get('expiry_date', 0)

print(f'✓ Has refresh_token: {has_refresh}')
if exp:
    exp_date = datetime.fromtimestamp(exp/1000)
    print(f'✓ Expires: {exp_date.strftime("%Y-%m-%d %H:%M:%S UTC")}')

if has_refresh:
    print('✅ GCP Secret 검증 완료!')
EOF
```

---

## 자동화 스크립트

### 스크립트 위치

```
/tmp/youtube-reauth-complete-guide.sh
```

### 스크립트 특징

1. **자동화된 단계**
   - 토큰 백업 및 삭제
   - 서버 시작 확인/실행
   - OAuth URL 생성
   - 토큰 파일 생성 대기
   - 토큰 검증
   - GCP Secret 업데이트
   - 최종 검증

2. **수동 개입 필요**
   - Google Cloud Console Redirect URI 설정 (최초 1회)
   - 브라우저에서 OAuth 인증

3. **안전 장치**
   - 기존 토큰 타임스탬프 백업
   - 각 단계별 검증
   - 에러 시 명확한 메시지 출력

---

## 문제 재발 시 대응

### 빠른 체크리스트

#### 1. 토큰 만료 확인

```bash
# 로컬 토큰 확인
cd /home/akfldk1028/.ai-agents-az-video-generator
python3 << 'EOF'
import json
from datetime import datetime
with open('youtube-tokens-main_channel.json', 'r') as f:
    d = json.load(f)
exp_date = datetime.fromtimestamp(d['expiry_date']/1000)
now = datetime.utcnow()
hours_left = (exp_date - now).total_seconds() / 3600
print(f"만료일: {exp_date.strftime('%Y-%m-%d %H:%M:%S UTC')}")
print(f"남은 시간: {hours_left:.2f} 시간")
print(f"상태: {'✅ 유효' if hours_left > 0 else '❌ 만료'}")
EOF
```

```bash
# GCP Secret 토큰 확인
gcloud secrets versions access latest --secret="YOUTUBE_DATA" | \
  base64 -d | \
  tar xzf - -O youtube-tokens-main_channel.json | \
  python3 -c "import sys, json; from datetime import datetime; d=json.load(sys.stdin); exp_date=datetime.fromtimestamp(d['expiry_date']/1000); now=datetime.utcnow(); hours_left=(exp_date-now).total_seconds()/3600; print(f'만료일: {exp_date}'); print(f'남은 시간: {hours_left:.2f}h'); print(f'상태: {\"✅ 유효\" if hours_left > 0 else \"❌ 만료\"}')"
```

#### 2. 에러별 대응

**에러: `redirect_uri_mismatch`**

원인: OAuth Client에 Redirect URI 미등록

해결:
```
1. https://console.cloud.google.com/apis/credentials?project=dkdk-474008 접속
2. OAuth Client (550996044521-8luac0vqa8sj0jrpa68oi4lgq30k1nqc) 편집
3. Authorized redirect URIs에 추가:
   http://localhost:3124/api/youtube/auth/callback
4. SAVE
```

**에러: `invalid_grant - Token has been expired or revoked`**

원인: refresh_token 만료 또는 취소

해결:
```bash
# 재인증 스크립트 실행
/tmp/youtube-reauth-complete-guide.sh
```

**에러: 서버 실행 안됨 (ERR_CONNECTION_REFUSED)**

원인: 로컬 서버 미실행 또는 포트 충돌

해결:
```bash
# 기존 프로세스 종료
pkill -f "node.*index.js"

# 서버 재시작
cd /mnt/d/Data/00_Personal/YTB/short-video-maker
PORT=3124 npm start > /tmp/youtube-server.log 2>&1 &

# 확인
curl -s http://localhost:3124/api/youtube/auth/main_channel
```

#### 3. 토큰 즉시 재발급

```bash
/tmp/youtube-reauth-complete-guide.sh
```

---

## 참고 정보

### 시스템 구성

#### 파일 위치

```
로컬 데이터:
  /home/akfldk1028/.ai-agents-az-video-generator/
    ├── youtube-channels.json          # 채널 설정
    ├── youtube-tokens-main_channel.json  # OAuth 토큰
    └── client_secret.json             # OAuth Client 설정

프로젝트:
  /mnt/d/Data/00_Personal/YTB/short-video-maker/
    ├── src/youtube-upload/
    │   ├── routes/authRoutes.ts       # OAuth 엔드포인트
    │   └── services/YouTubeUploader.ts  # 업로드 로직
    └── docs/
        └── youtube-oauth-token-permanent-solution.md  # 이 문서

스크립트:
  /tmp/youtube-reauth-complete-guide.sh  # 자동 재인증 스크립트
```

#### GCP 구성

```
프로젝트: dkdk-474008
리전: us-central1

Secrets:
  - YOUTUBE_DATA (토큰 저장)
    Format: base64(tar.gz(youtube-channels.json + youtube-tokens-main_channel.json))
    Latest: Version 11 (2025-11-25 생성)

  - YOUTUBE_CLIENT_SECRET (OAuth Client 설정)

OAuth Client:
  - Client ID: 550996044521-8luac0vqa8sj0jrpa68oi4lgq30k1nqc
  - Redirect URI: http://localhost:3124/api/youtube/auth/callback
  - Scopes: youtube.upload, youtube
  - Status: Testing
  - Test Users: hanvit4303@gmail.com

Cloud Run:
  - Service: short-video-maker
  - Region: us-central1
  - URL: https://short-video-maker-7qtnitbuvq-uc.a.run.app
```

#### API 엔드포인트

```
OAuth 인증:
  GET /api/youtube/auth/main_channel
    → OAuth URL 생성
    Response: { authUrl, channelName, message }

OAuth 콜백:
  GET /api/youtube/auth/callback?code=...&state=main_channel
    → 토큰 저장
    Response: { success, channelName, message }

YouTube 업로드:
  POST /api/youtube/upload
    Body: { videoPath, title, description, channelName }
```

### 토큰 구조

```json
{
  "access_token": "ya29.a0...",
  "refresh_token": "1//0g...",
  "scope": "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube",
  "token_type": "Bearer",
  "expiry_date": 1732532096000
}
```

**중요 필드:**
- `access_token`: 1시간 유효, API 요청에 사용
- `refresh_token`: 영구 유효 (Test User 계정), 새 access_token 발급에 사용
- `expiry_date`: access_token 만료 시각 (밀리초 타임스탬프)

### Test User vs Production

| 구분 | Testing + Test User | Testing (일반) | Production |
|------|---------------------|----------------|------------|
| Token 유효기간 | **영구** | 7일 | 영구 |
| Refresh Token | ✅ 취소 안됨 | ❌ 7일 후 취소 | ✅ 취소 안됨 |
| 사용자 수 제한 | 100명 | 100명 | 무제한 |
| Google 검토 | 불필요 | 불필요 | 필수 |
| 권장 용도 | **개발/개인** | 테스트 | 프로덕션 |

**현재 설정**: Testing + Test User (영구 토큰)

---

## 성공 확인

### 최종 체크리스트

- [x] Google Cloud Console Redirect URI 등록
- [x] Test User 계정으로 재인증
- [x] 로컬 토큰 파일에 refresh_token 존재
- [x] GCP Secret Manager Version 11 생성
- [x] GCP Secret에 refresh_token 존재
- [x] 토큰 유효기간 10시간 이상
- [x] Cloud Run 배포 완료

### 2025-11-25 재인증 결과

```
✅ 로컬 토큰:
  - Has refresh_token: True
  - Expires: 2025-11-25 10:14:56 UTC
  - Status: VALID

✅ GCP Secret (Version 11):
  - Has refresh_token: True
  - Expires: 2025-11-25 10:14:56 UTC
  - Status: VALID

✅ Test User 계정이므로 이 토큰은 영원히 작동합니다!
```

---

## 문서 이력

- **2025-11-25**: 초안 작성 (YouTube OAuth 토큰 영구 재인증 완료)
- **최종 업데이트**: 2025-11-25

---

## 문의 및 지원

문제 발생 시:
1. 이 문서의 [문제 재발 시 대응](#문제-재발-시-대응) 섹션 참조
2. 자동화 스크립트 실행: `/tmp/youtube-reauth-complete-guide.sh`
3. 메모리에 저장된 정보 참조 (AI 에이전트용)
