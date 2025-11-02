# Google Cloud Storage (GCS) Setup Guide

## 개요

이 프로젝트는 YouTube 업로드 후 비디오 파일을 Google Cloud Storage에 자동으로 업로드하고 로컬 파일을 삭제하는 기능을 지원합니다.

## 주요 기능

- ✅ YouTube 업로드 성공 후 자동으로 GCS에 업로드
- ✅ **로컬 파일 관리 3가지 옵션**:
  - **옵션 1**: 로컬 파일 영구 보관 + GCS 백업 (`GCS_AUTO_DELETE_LOCAL_AFTER_DAYS=0`)
  - **옵션 2**: 로컬 7일 보관 + GCS 장기 백업 (`GCS_AUTO_DELETE_LOCAL_AFTER_DAYS=7`)
  - **옵션 3**: 사용자 정의 (14일, 30일 등)
- ✅ Lifecycle 정책으로 30일 후 GCS에서 자동 삭제
- ✅ Signed URL 생성으로 임시 다운로드 링크 제공
- ✅ 진행률 추적 및 오류 처리

---

## 1단계: GCS 버킷 생성

### Option A: gcloud CLI 사용 (추천)

```bash
# 버킷 생성
gcloud storage buckets create gs://YOUR_BUCKET_NAME \
  --location=us-central1 \
  --storage-class=STANDARD \
  --uniform-bucket-level-access

# 예시
gcloud storage buckets create gs://short-video-maker-uploads \
  --location=us-central1 \
  --storage-class=STANDARD \
  --uniform-bucket-level-access
```

### Option B: Google Cloud Console 사용

1. https://console.cloud.google.com/storage 접속
2. "버킷 만들기" 클릭
3. 버킷 설정:
   - **이름**: `short-video-maker-uploads` (고유한 이름 사용)
   - **위치 유형**: Region
   - **위치**: `us-central1`
   - **스토리지 클래스**: Standard
   - **액세스 제어**: 균일 (Uniform bucket-level access)
4. "만들기" 클릭

---

## 2단계: Service Account 권한 설정

현재 사용 중인 Service Account에 GCS 권한을 추가합니다.

### gcloud CLI로 권한 추가

```bash
# Service Account 이메일 확인
gcloud iam service-accounts list

# Storage Object Admin 역할 부여
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:YOUR_SERVICE_ACCOUNT@YOUR_PROJECT.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"

# 예시
gcloud projects add-iam-policy-binding dkdk-474008 \
  --member="serviceAccount:dkdk-474008@dkdk-474008.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"
```

### Google Cloud Console에서 권한 추가

1. https://console.cloud.google.com/iam-admin/iam 접속
2. Service Account 찾기
3. "수정" (연필 아이콘) 클릭
4. "다른 역할 추가" 클릭
5. "Storage Object Admin" 역할 선택
6. "저장" 클릭

---

## 3단계: 환경 변수 설정

`.env` 파일에 다음 환경 변수를 추가하세요:

```bash
# Google Cloud Storage Configuration
GCS_BUCKET_NAME=short-video-maker-uploads
GCS_SERVICE_ACCOUNT_PATH=/mnt/d/Data/00_Personal/YTB/short-video-maker/dkdk-474008-15f270f73348.json
GCS_REGION=us-central1
GCS_STORAGE_CLASS=STANDARD

# 자동 삭제 설정
GCS_AUTO_DELETE_LOCAL_AFTER_DAYS=0  # 로컬 파일 삭제: 0=삭제 안 함(기본값), 7=7일 후 삭제
GCS_AUTO_DELETE_DAYS=30             # GCS에서 30일 후 자동 삭제
GCS_SIGNED_URL_EXPIRY_HOURS=24      # Signed URL 유효 기간 (24시간)
```

---

## 4단계: Lifecycle 정책 설정 (선택사항)

GCS 버킷에 자동 삭제 정책을 설정합니다.

### lifecycle-policy.json 파일 생성

```json
{
  "lifecycle": {
    "rule": [
      {
        "action": {
          "type": "Delete"
        },
        "condition": {
          "age": 30,
          "matchesPrefix": ["videos/"]
        }
      },
      {
        "action": {
          "type": "SetStorageClass",
          "storageClass": "NEARLINE"
        },
        "condition": {
          "age": 7,
          "matchesPrefix": ["videos/"],
          "matchesStorageClass": ["STANDARD"]
        }
      }
    ]
  }
}
```

### 정책 적용

```bash
gcloud storage buckets update gs://YOUR_BUCKET_NAME \
  --lifecycle-file=lifecycle-policy.json

# 예시
gcloud storage buckets update gs://short-video-maker-uploads \
  --lifecycle-file=lifecycle-policy.json
```

**Lifecycle 정책 설명:**
1. **7일 후**: STANDARD → NEARLINE로 이동 (비용 50% 절감)
2. **30일 후**: 완전 삭제 (비디오는 이미 YouTube에 있으므로)

---

## 5단계: API 활성화

```bash
gcloud services enable storage-api.googleapis.com
gcloud services enable storage-component.googleapis.com
```

---

## 6단계: 서버 빌드 및 재시작

```bash
# 빌드
npm run build

# 서버 재시작
PORT=3124 npm start
```

---

## 7단계: 테스트

### 1. GCS 연결 테스트

```bash
curl http://localhost:3124/api/storage/test
```

**성공 응답:**
```json
{
  "success": true
}
```

### 2. 비디오 업로드 테스트 (YouTube → GCS 자동 업로드)

```bash
curl -X POST http://localhost:3124/api/youtube/upload \
  -H "Content-Type: application/json" \
  -d '{
    "videoId": "cmh663m470006sidldrli0om3",
    "videoPath": "/home/akfldk1028/.ai-agents-az-video-generator/videos/cmh663m470006sidldrli0om3.mp4",
    "metadata": {
      "title": "Test Video #shorts",
      "description": "Testing GCS integration",
      "tags": ["test"],
      "categoryId": "22"
    },
    "channelName": "main_channel"
  }'
```

**예상 동작:**
1. YouTube에 업로드 완료
2. GCS에 자동 업로드 (`gs://YOUR_BUCKET_NAME/videos/cmh663m470006sidldrli0om3.mp4`)
3. **로컬 파일 유지** (다운로드 및 확인 가능)
4. 설정된 기간 후 자동 삭제 (예: `GCS_AUTO_DELETE_LOCAL_AFTER_DAYS=7`)

### 3. 수동 GCS 업로드 테스트

```bash
curl -X POST http://localhost:3124/api/storage/upload/cmh663m470006sidldrli0om3
```

### 4. Signed URL 생성 테스트

```bash
curl http://localhost:3124/api/storage/cmh663m470006sidldrli0om3/signed-url?expiresInHours=24
```

**응답 예시:**
```json
{
  "success": true,
  "videoId": "cmh663m470006sidldrli0om3",
  "signedUrl": "https://storage.googleapis.com/...",
  "expiresIn": "24 hours"
}
```

---

## API 엔드포인트

### GCS Storage API

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/storage/test` | GCS 연결 테스트 |
| POST | `/api/storage/upload/:videoId` | 수동 GCS 업로드 |
| DELETE | `/api/storage/:videoId` | GCS에서 비디오 삭제 |
| GET | `/api/storage/:videoId/signed-url` | Signed URL 생성 |
| GET | `/api/storage/:videoId/exists` | 비디오 존재 여부 확인 |

---

## 비용 최적화

### 예상 비용 (월 100개 비디오, 각 500MB)

| 항목 | 계산 | 월 비용 |
|------|------|---------|
| Storage (30일) | 50GB × $0.020/GB | $1.00 |
| Upload (Class A) | 100 ops × $0.05/1000 | $0.005 |
| Egress (최소) | ~1GB × $0.12/GB | $0.12 |
| **합계** | | **~$1.13/월** |

### Lifecycle 정책 적용 시 (7일 STANDARD → NEARLINE)

- Days 1-7: 50GB × $0.020 × (7/30) = $0.23
- Days 8-30: 50GB × $0.010 × (23/30) = $0.38
- **합계: ~$0.61/월** (46% 절감)

---

## 트러블슈팅

### 1. "Bucket does not exist" 오류

```bash
# 버킷 목록 확인
gcloud storage buckets list

# 버킷 생성
gcloud storage buckets create gs://YOUR_BUCKET_NAME --location=us-central1
```

### 2. "Permission denied" 오류

```bash
# Service Account 권한 확인
gcloud projects get-iam-policy YOUR_PROJECT_ID

# Storage Object Admin 권한 추가
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:YOUR_SERVICE_ACCOUNT@YOUR_PROJECT.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"
```

### 3. "Service account file not found" 오류

```bash
# 파일 경로 확인
ls -l /mnt/d/Data/00_Personal/YTB/short-video-maker/dkdk-474008-15f270f73348.json

# .env 파일의 GCS_SERVICE_ACCOUNT_PATH 경로 확인
cat .env | grep GCS_SERVICE_ACCOUNT_PATH
```

### 4. 로컬 파일 자동 삭제가 작동하지 않음

`.env` 파일 확인:
```bash
# 0보다 큰 값으로 설정되어 있는지 확인
GCS_AUTO_DELETE_LOCAL_AFTER_DAYS=7  # 0이면 삭제 안 함, 7이면 7일 후 삭제

# 서버 로그에서 cleanup 서비스 시작 확인
# "Starting local file cleanup worker" 메시지가 있어야 함
```

**참고**: `GCS_AUTO_DELETE_LOCAL_AFTER_DAYS=0`이면 자동 삭제가 비활성화됩니다 (기본값).

---

## 자주 묻는 질문 (FAQ)

### Q1. YouTube 업로드 실패 시 GCS에 업로드되나요?
아니요. YouTube 업로드가 성공한 경우에만 GCS에 업로드됩니다.

### Q2. GCS 업로드 실패 시 로컬 파일은 어떻게 되나요?
로컬 파일은 유지됩니다. 로그에 오류가 기록됩니다.

### Q3. GCS 설정 없이 YouTube 업로드만 사용할 수 있나요?
네. GCS 환경 변수를 설정하지 않으면 GCS 업로드를 건너뜁니다.

### Q4. 이미 업로드된 비디오를 GCS에 수동으로 업로드할 수 있나요?
네. `POST /api/storage/upload/:videoId` 엔드포인트를 사용하세요.

### Q5. Lifecycle 정책을 설정하지 않으면 어떻게 되나요?
파일이 영구적으로 GCS에 남아 비용이 계속 발생합니다. 30일 자동 삭제 정책 설정을 권장합니다.

### Q6. 로컬 파일 관리 설정은 어떻게 하나요?

**3가지 옵션:**

1. **영구 보관 (기본값, 추천)**:
   ```bash
   GCS_AUTO_DELETE_LOCAL_AFTER_DAYS=0
   ```
   - 로컬 파일을 절대 삭제하지 않음
   - 언제든 다운로드 및 확인 가능
   - GCS는 백업 용도로만 사용
   - 저장 공간 관리 필요

2. **7일 보관**:
   ```bash
   GCS_AUTO_DELETE_LOCAL_AFTER_DAYS=7
   ```
   - 7일이 지난 파일만 자동 삭제
   - 최근 파일은 로컬에서 빠르게 접근 가능
   - 오래된 파일은 GCS Signed URL로 다운로드
   - 저장 공간 절약

3. **사용자 정의**:
   ```bash
   GCS_AUTO_DELETE_LOCAL_AFTER_DAYS=14  # 14일 후 삭제
   GCS_AUTO_DELETE_LOCAL_AFTER_DAYS=30  # 30일 후 삭제
   ```

**작동 방식:**
- 서버가 1시간마다 자동으로 오래된 파일 검사
- 설정된 기간(예: 7일)이 지난 파일만 삭제
- 삭제된 파일은 GCS에서 Signed URL로 다운로드 가능 (30일간)

---

## 구현 완료 체크리스트

- [x] @google-cloud/storage 패키지 설치
- [x] GoogleCloudStorageService.ts 생성
- [x] config.ts에 GCS 설정 추가
- [x] storageRoutes.ts 생성
- [x] YouTubeUploader.ts에 GCS 업로드 통합
- [x] server.ts에 storage routes 등록
- [ ] GCS 버킷 생성
- [ ] Service Account 권한 설정
- [ ] 환경 변수 설정
- [ ] Lifecycle 정책 적용
- [ ] 연결 테스트 완료
- [ ] YouTube → GCS 자동 업로드 테스트

---

## 다음 단계

1. **GCS 버킷 생성**: 위 가이드의 1단계 참조
2. **환경 변수 설정**: `.env` 파일 업데이트
3. **서버 재시작**: `PORT=3124 npm start`
4. **테스트**: `/api/storage/test` 엔드포인트로 연결 확인

---

## 참고 자료

- [Google Cloud Storage 문서](https://cloud.google.com/storage/docs)
- [@google-cloud/storage NPM](https://www.npmjs.com/package/@google-cloud/storage)
- [Lifecycle Management](https://cloud.google.com/storage/docs/lifecycle)
- [Storage Pricing](https://cloud.google.com/storage/pricing)
