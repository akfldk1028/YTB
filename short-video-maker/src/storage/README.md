# Storage

> Google Cloud Storage (GCS) 관리 모듈
> 파일 업로드/다운로드, 로컬 파일 정리

---

## 폴더 구조

```
storage/
├── GoogleCloudStorageService.ts  # GCS 업로드/다운로드/URL 생성
├── LocalFileCleanupService.ts    # 로컬 임시 파일 정리
├── routes/                       # API 라우트
└── ARCHITECTURE.md               # 상세 아키텍처
```

---

## GCS 버킷

```
gs://dkdk-474008-short-videos
```

### 디렉토리 구조

```
dkdk-474008-short-videos/
├── characters/          # 캐릭터 레퍼런스 이미지
│   └── cat-couple/
│       ├── kami.png
│       └── dalgi.png
├── videos/              # 생성된 비디오
│   └── {videoId}/
│       └── final.mp4
├── temp/                # 임시 파일
└── shorts/              # Shorts 결과물
```

---

## 핵심 서비스

### GoogleCloudStorageService

```typescript
// 파일 업로드
await gcsService.uploadFile(localPath, gcsPath);

// 파일 다운로드
await gcsService.downloadFile(gcsPath, localPath);

// Signed URL 생성 (1시간 유효)
const url = await gcsService.getSignedUrl(gcsPath);

// 파일 존재 확인
const exists = await gcsService.fileExists(gcsPath);

// 파일 삭제
await gcsService.deleteFile(gcsPath);
```

### LocalFileCleanupService

```typescript
// 24시간 이상 된 임시 파일 정리
await cleanupService.cleanOldTempFiles();

// 특정 디렉토리 정리
await cleanupService.cleanDirectory('/path/to/temp');
```

---

## API 엔드포인트

| Method | Endpoint | 설명 |
|--------|----------|------|
| `POST` | `/api/storage/upload` | 파일 업로드 |
| `GET` | `/api/storage/download/:path` | 파일 다운로드 |
| `DELETE` | `/api/storage/delete/:path` | 파일 삭제 |

---

## 환경 변수

```bash
GOOGLE_CLOUD_PROJECT=dkdk-474008
GCS_BUCKET=dkdk-474008-short-videos
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

---

## 관련 문서

- [ARCHITECTURE.md](./ARCHITECTURE.md) - 상세 아키텍처
