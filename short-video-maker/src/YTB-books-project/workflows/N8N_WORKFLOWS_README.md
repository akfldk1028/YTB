# Books-to-Shorts n8n Workflows

PDF 문서를 자동으로 YouTube Shorts로 변환하는 n8n 워크플로우입니다.

## 워크플로우 구성

### 1. PDF Upload Pipeline (`IMPORT_THIS_pdf-upload-v1.json`)

**목적**: 새 PDF 업로드 → NEB 처리 → Neo4j 그래프 변환 → 커리큘럼 생성

```
[Form Trigger] → [NEB Upload] → [NEB Extract] → [Status Polling] → [Curriculum Generation]
```

#### 프로세스
1. **A1. Form Trigger**: PDF 파일 업로드 폼 (Model 선택, 커리큘럼 생성 여부)
2. **A2-A3. NEB Upload**: NEB API `/upload`로 PDF 전송
3. **A4. NEB Extract**: Neo4j 그래프 변환 트리거
4. **A5-A7. Status Polling**: 30초 간격으로 처리 상태 확인 (최대 20회)
5. **A8-A9. Curriculum Generation**: YTB API로 커리큘럼 자동 생성

#### 설정
- NEB API: `https://neb-550996044521.asia-northeast3.run.app`
- Neo4j: `bolt://34.47.112.49:7687`

---

### 2. Daily Video Pipeline (`IMPORT_THIS_daily-video-v4.json`)

**목적**: 매일 09:00에 1개 에피소드 영상 생성 + YouTube 업로드

```
[Schedule 09:00] → [Get Stats] → [Generate Episode] → [YouTube Upload] → [Status Update]
```

#### 프로세스
1. **B1. Schedule**: 매일 09:00 자동 실행 (Manual Trigger도 가능)
2. **B2. Get Stats**: 에피소드 통계 확인 (draft/pending 개수)
3. **B3. If Check**: 처리할 에피소드 있는지 확인
4. **B4. Generate**: `POST /generate-next-episode` (documentId 없이 → 전체 문서에서 자동 선택)
5. **B6-B7. YouTube Upload**: `POST /api/youtube/upload`
6. **B8. Status Update**: `PUT /episodes/{id}/status` → "uploaded"

#### 핵심 기능
- **documentId 없이 호출**: 전체 문서에서 다음 pending 에피소드 자동 선택
- **문서 간 자동 전환**: 문서 A 완료 → 문서 B로 자동 이동

---

## n8n에서 Import 방법

1. n8n 대시보드 → **Workflows** → **Import from File**
2. 파일 선택: `IMPORT_THIS_pdf-upload-v1.json` 또는 `IMPORT_THIS_daily-video-v4.json`
3. **Import** 클릭
4. 워크플로우 활성화 (Schedule Trigger 사용 시)

---

## API 엔드포인트 참조

### YTB API (https://short-video-maker-550996044521.us-central1.run.app)

| Method | Endpoint | 설명 |
|--------|----------|------|
| `GET` | `/api/books` | 문서 목록 |
| `GET` | `/api/books/episodes/stats` | 에피소드 통계 |
| `GET` | `/api/books/episodes/pending` | 다음 처리할 에피소드 |
| `POST` | `/api/books/:bookId/curriculum` | 커리큘럼 생성 |
| `POST` | `/api/books/generate-next-episode` | 다음 에피소드 영상 생성 |
| `PUT` | `/api/books/episodes/:id/status` | 에피소드 상태 업데이트 |
| `POST` | `/api/youtube/upload` | YouTube 업로드 |

### NEB API (https://neb-550996044521.asia-northeast3.run.app)

| Method | Endpoint | 설명 |
|--------|----------|------|
| `POST` | `/upload` | PDF 파일 업로드 |
| `POST` | `/extract` | 그래프 변환 트리거 |
| `GET` | `/document_status/{file_name}` | 처리 상태 확인 |

---

## 테스트 명령어

```bash
# 문서 목록 확인
curl https://short-video-maker-550996044521.us-central1.run.app/api/books

# 에피소드 통계
curl https://short-video-maker-550996044521.us-central1.run.app/api/books/episodes/stats

# 다음 에피소드 생성 (수동 테스트)
curl -X POST https://short-video-maker-550996044521.us-central1.run.app/api/books/generate-next-episode \
  -H "Content-Type: application/json" \
  -d '{}'

# 특정 문서의 다음 에피소드
curl -X POST https://short-video-maker-550996044521.us-central1.run.app/api/books/generate-next-episode \
  -H "Content-Type: application/json" \
  -d '{"documentId": "MY_DOCUMENT.pdf"}'
```

---

## 워크플로우 비교

| 기능 | 기존 v3 | 새 v4 (A+B) |
|------|---------|-------------|
| PDF 업로드 | 수동 (NEB Frontend) | **n8n Form에서 직접** |
| 커리큘럼 생성 | 수동 | **업로드 시 자동** |
| 실행 주기 | 매시간 | **매일 09:00 (1개)** |
| 문서 간 전환 | X | **자동** |
| 에피소드 완료 후 | 대기 | **다음 문서로** |

---

## 트러블슈팅

### NEB 처리 시간 초과
- 기본 20회 × 30초 = 10분 대기
- 큰 PDF는 `A5b. Init Counter`에서 `maxChecks` 값 증가

### YouTube 업로드 실패
- 토큰 만료 확인: `/api/youtube/auth/health-check`
- `youtube-tokens-*.json` 갱신 필요

### 커리큘럼 생성 실패
- Neo4j 연결 확인: `bolt://34.47.112.49:7687`
- Document 노드 존재 확인

---

## 파일 목록

```
N8N/books/
├── IMPORT_THIS_pdf-upload-v1.json    # PDF 업로드 파이프라인
├── IMPORT_THIS_daily-video-v4.json   # 매일 영상 생성 파이프라인
└── README.md                         # 이 파일
```
