# Google Veo 3 Setup Guide

## 🎯 개요

Google Veo 3는 Google의 최신 AI 비디오 생성 모델로, Short Video Maker에 통합되어 고품질 맞춤 비디오를 생성할 수 있습니다.

**특징:**
- 최고 품질 (1080p HD + 동기화된 오디오)
- 세로/가로 비디오 지원 (9:16, 16:9)
- 5-120초 길이 조절 가능
- 비용: $0.75/초 (10초 비디오 = $7.50)

---

## 🚀 Google Cloud 설정

### 1. Google Cloud 프로젝트 생성

1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. 새 프로젝트 생성 또는 기존 프로젝트 선택
3. **프로젝트 ID 기록** (나중에 필요)

### 2. Vertex AI API 활성화

```bash
# Google Cloud CLI를 통한 활성화
gcloud services enable aiplatform.googleapis.com

# 또는 웹 콘솔에서:
# APIs & Services → Library → "Vertex AI API" 검색 → Enable
```

### 3. 결제 계정 설정

- Google Cloud Console → Billing
- 신규 계정: $300 무료 크레딧 (약 40개 비디오 제작 가능)
- Veo 3 사용 시 크레딧 소모

---

## 🔐 인증 설정

### Option 1: Service Account (권장)

**1단계: Service Account 생성**
```bash
# CLI를 통한 생성
gcloud iam service-accounts create veo-service-account \
    --display-name="Veo Service Account"

# 키 생성
gcloud iam service-accounts keys create ~/veo-key.json \
    --iam-account=veo-service-account@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

**2단계: 권한 부여**
```bash
# Vertex AI User 권한 부여
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:veo-service-account@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/aiplatform.user"
```

**3단계: 환경변수 설정**
```bash
export GOOGLE_APPLICATION_CREDENTIALS=~/veo-key.json
export GOOGLE_CLOUD_PROJECT_ID=YOUR_PROJECT_ID
```

### Option 2: gcloud CLI 인증

```bash
# 1. gcloud CLI 설치 (이미 설치된 경우 생략)
# https://cloud.google.com/sdk/docs/install

# 2. 로그인
gcloud auth application-default login

# 3. 프로젝트 설정
gcloud config set project YOUR_PROJECT_ID

# 4. 권한 확인
gcloud auth application-default print-access-token
```

---

## ⚙️ Short Video Maker 설정

### 환경변수 설정 (.env)

```bash
# Google Veo 3 설정
VIDEO_SOURCE=veo                    # veo 사용
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_CLOUD_REGION=us-central1     # 선택사항 (기본값)

# 하이브리드 모드 (Leonardo.AI → Veo → Pexels 순서)
VIDEO_SOURCE=both
LEONARDO_API_KEY=your-leonardo-key  # 선택사항
```

### 인증 파일 설정

```bash
# Service Account 키 파일 위치
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/your/service-account-key.json

# 또는 프로젝트 root에 key.json 파일 배치 후
GOOGLE_APPLICATION_CREDENTIALS=./key.json
```

---

## 🔧 코드 설정 확인

현재 `GoogleVeo.ts`는 Bearer Token 방식을 사용하고 있습니다:

```typescript
// 현재 코드 (수정 필요할 수 있음)
headers.append("Authorization", `Bearer ${this.API_KEY}`);
```

**실제 Google Cloud 인증의 경우:**
1. Service Account 키로 Access Token 생성
2. 또는 Application Default Credentials 사용

---

## 🧪 테스트

### 1. 인증 테스트
```bash
# Access Token 확인
gcloud auth application-default print-access-token

# Vertex AI API 접근 테스트
curl -H "Authorization: Bearer $(gcloud auth print-access-token)" \
     "https://us-central1-aiplatform.googleapis.com/v1/projects/YOUR_PROJECT_ID/locations/us-central1/models"
```

### 2. Short Video Maker 테스트
```bash
# 서버 시작
npm start

# 웹 UI에서 비디오 생성 테스트
# http://localhost:3123
```

---

## 💰 비용 관리

### Veo 3 요금

| 기능 | 가격 |
|------|------|
| 비디오 생성 | $0.75/초 |
| 5초 비디오 | $3.75 |
| 10초 비디오 | $7.50 |
| 30초 비디오 | $22.50 |

### 무료 크레딧 활용

- **신규 계정**: $300 무료 크레딧
- **예상 사용량**: 40개의 10초 비디오 제작 가능
- **모니터링**: Google Cloud Console → Billing

### 비용 절약 팁

1. **하이브리드 모드 사용**:
   ```bash
   VIDEO_SOURCE=both  # Leonardo → Veo → Pexels 순서
   ```

2. **짧은 비디오 제작**: 5-10초 권장

3. **배치 작업**: 한 번에 여러 비디오 계획

---

## 🚨 문제 해결

### 1. 인증 오류

**오류**: `401 Unauthorized`
```bash
# 해결책
gcloud auth application-default login
export GOOGLE_APPLICATION_CREDENTIALS=path/to/key.json
```

**오류**: `403 Forbidden`
```bash
# Vertex AI API 활성화 확인
gcloud services list --enabled | grep aiplatform

# 권한 확인
gcloud projects get-iam-policy YOUR_PROJECT_ID
```

### 2. API 오류

**오류**: `Model not found`
- Veo 3 모델이 해당 지역에서 사용 불가능
- `us-central1` 지역 사용 권장

**오류**: `Quota exceeded`
- 일일/월간 한도 초과
- Google Cloud Console → Quotas 확인

### 3. 애플리케이션 오류

**오류**: `No video URL found in Veo API response`
- API 응답 형식 변경 가능성
- 로그에서 실제 응답 구조 확인

```bash
# 디버그 모드로 실행
LOG_LEVEL=debug npm start
```

---

## 📋 체크리스트

### 필수 설정

- [ ] Google Cloud 프로젝트 생성
- [ ] Vertex AI API 활성화
- [ ] 결제 계정 설정
- [ ] Service Account 생성 및 키 다운로드
- [ ] 환경변수 설정 (PROJECT_ID, CREDENTIALS)
- [ ] VIDEO_SOURCE=veo 설정

### 테스트

- [ ] gcloud 인증 확인
- [ ] Access Token 생성 테스트
- [ ] Short Video Maker 서버 시작
- [ ] 첫 번째 비디오 생성 테스트

---

## 🔗 유용한 링크

- [Google Cloud Console](https://console.cloud.google.com/)
- [Vertex AI Documentation](https://cloud.google.com/vertex-ai/docs)
- [Veo API Reference](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/veo)
- [Google Cloud CLI 설치](https://cloud.google.com/sdk/docs/install)
- [Service Account 관리](https://cloud.google.com/iam/docs/service-accounts)

---

## ⚡ 빠른 시작

```bash
# 1. 프로젝트 설정
export PROJECT_ID="your-project-id"

# 2. API 활성화
gcloud services enable aiplatform.googleapis.com

# 3. 인증
gcloud auth application-default login

# 4. 환경변수
echo "VIDEO_SOURCE=veo" >> .env
echo "GOOGLE_CLOUD_PROJECT_ID=$PROJECT_ID" >> .env

# 5. 서버 시작
npm start
```

이제 Google Veo 3로 고품질 AI 비디오를 생성할 수 있습니다! 🎬