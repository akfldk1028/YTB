# 환경변수 설정 가이드

## 개요
Short Video Maker의 모든 환경변수 설정 방법을 설명합니다.

---

## 1. TTS (Text-to-Speech) 설정

### TTS Provider 선택
```bash
# 옵션: kokoro, google, elevenlabs
TTS_PROVIDER=google
```

| Provider | 비용 | 품질 | 한국어 | 설정 필요 |
|----------|-----|------|--------|----------|
| kokoro | 무료 | ⭐⭐ | ❌ | 없음 |
| google | 유료 | ⭐⭐⭐ | ✅ | GOOGLE_TTS_* |
| elevenlabs | 유료 | ⭐⭐⭐⭐⭐ | ✅ | ELEVENLABS_API_KEY |

### Google TTS
```bash
TTS_PROVIDER=google
GOOGLE_TTS_PROJECT_ID=your-project-id
GOOGLE_TTS_API_KEY=/path/to/service-account.json
```

### ElevenLabs TTS
```bash
TTS_PROVIDER=elevenlabs
ELEVENLABS_API_KEY=sk_your_api_key
```

---

## 2. 비디오 소스 설정

### Video Source 선택
```bash
# 옵션: pexels, veo, leonardo, both, ffmpeg
VIDEO_SOURCE=pexels
```

| Source | 설명 | 필요 API |
|--------|------|---------|
| pexels | 스톡 비디오 검색 | PEXELS_API_KEY |
| veo | Google VEO3 AI 비디오 | GOOGLE_GEMINI_API_KEY |
| ffmpeg | 정적 이미지 → 비디오 | 이미지 생성 API |
| both | pexels + veo 혼합 | 둘 다 |

### PEXELS API
```bash
PEXELS_API_KEY=your_pexels_api_key
```

### Google Gemini (VEO3 + Imagen)
```bash
GOOGLE_GEMINI_API_KEY=AIzaSy...
GOOGLE_CLOUD_PROJECT_ID=your-project-id
```

---

## 3. YouTube 업로드 설정

### OAuth 클라이언트
```bash
YOUTUBE_CLIENT_SECRET_PATH=/path/to/client_secret.json
```

### 채널 데이터 (Cloud Run용 - base64 인코딩)
```bash
YOUTUBE_DATA=base64_encoded_tar_gz_data
```

### 채널 데이터 생성 방법
```bash
# 1. 로컬에서 인증 후 tar.gz 생성
cd ~/.ai-agents-az-video-generator
tar czf youtube-data.tar.gz youtube-channels.json youtube-tokens-*.json

# 2. base64 인코딩
cat youtube-data.tar.gz | base64 > /tmp/youtube-data.txt

# 3. GCP Secret에 저장
gcloud secrets versions add YOUTUBE_DATA --data-file=/tmp/youtube-data.txt
```

---

## 4. Google Cloud Storage 설정

```bash
GCS_BUCKET_NAME=your-bucket-name
GCS_SERVICE_ACCOUNT_PATH=/path/to/service-account.json
GCS_REGION=us-central1
GCS_STORAGE_CLASS=STANDARD  # STANDARD, NEARLINE, COLDLINE, ARCHIVE
GCS_AUTO_DELETE_LOCAL_AFTER_DAYS=0  # 0 = 삭제 안함
GCS_AUTO_DELETE_DAYS=30  # GCS에서 30일 후 삭제
GCS_SIGNED_URL_EXPIRY_HOURS=24
```

---

## 5. 서버 설정

```bash
PORT=3123
LOG_LEVEL=info  # trace, debug, info, warn, error, fatal
DATA_DIR_PATH=/path/to/data  # 기본: ~/.ai-agents-az-video-generator
```

---

## 6. Cloud Run 환경변수 업데이트

### 단일 변수 업데이트
```bash
gcloud run services update short-video-maker \
  --region=us-central1 \
  --set-env-vars="TTS_PROVIDER=elevenlabs"
```

### 여러 변수 업데이트
```bash
gcloud run services update short-video-maker \
  --region=us-central1 \
  --set-env-vars="TTS_PROVIDER=elevenlabs,ELEVENLABS_API_KEY=sk_xxx"
```

### Secret Manager 사용
```bash
# Secret 생성
echo -n "your_api_key" | gcloud secrets create MY_SECRET --data-file=-

# Cloud Run에 연결
gcloud run services update short-video-maker \
  --region=us-central1 \
  --set-secrets="MY_API_KEY=MY_SECRET:latest"
```

---

## 7. 전체 .env 예시

```bash
# === 서버 ===
PORT=3123
LOG_LEVEL=info

# === TTS ===
TTS_PROVIDER=google
GOOGLE_TTS_PROJECT_ID=dkdk-474008
GOOGLE_TTS_API_KEY=/path/to/tts-service-account.json
ELEVENLABS_API_KEY=sk_xxx  # ElevenLabs 사용 시

# === 비디오 소스 ===
PEXELS_API_KEY=xxx
GOOGLE_GEMINI_API_KEY=AIzaSy...
GOOGLE_CLOUD_PROJECT_ID=dkdk-474008

# === YouTube ===
YOUTUBE_CLIENT_SECRET_PATH=/path/to/client_secret.json

# === GCS ===
GCS_BUCKET_NAME=dkdk-474008-short-videos
GCS_REGION=us-central1
```

---

## 8. 현재 설정 확인

### 로컬 설정
```bash
cat .env | grep -E "^[A-Z]"
```

### Cloud Run 설정
```bash
gcloud run services describe short-video-maker \
  --region=us-central1 \
  --format='yaml(spec.template.spec.containers[0].env)'
```

---

## 변경 이력
- 2025-11-26: 최초 작성
