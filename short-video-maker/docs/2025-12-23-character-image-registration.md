# 캐릭터 이미지 등록 기능 (2025-12-23)

## 개요

캐릭터 이미지를 Base64 외에 **imageUrl**과 **gcsPath**로도 등록할 수 있도록 구현.

---

## Quick Reference (AI용)

### 이미지 등록 우선순위

| 순위 | 필드 | 설명 |
|------|------|------|
| 1 | `gcsPath` | GCS 경로 (이미 업로드된 이미지) |
| 2 | `imageUrl` | 외부 URL (서버가 다운로드) |
| 3 | `referenceImageBase64` | Base64 인코딩 (기존 방식) |

### API 엔드포인트

```
POST /api/characters/profiles/:profileId/characters     # 캐릭터 추가
PUT  /api/characters/profiles/:profileId/characters/:id # 캐릭터 수정
```

---

## 구현 상세

### 수정된 파일

1. **`src/character-store/types.ts`**
   - `CreateCharacterRequest`에 `imageUrl`, `gcsPath` 필드 추가
   - `UpdateCharacterRequest`에도 동일 필드 추가

2. **`src/character-store/CharacterStorageService.ts`**
   - `downloadAndSaveImage()`: 외부 URL에서 이미지 다운로드 → GCS 저장
   - `registerGcsImage()`: GCS 경로에서 표준 위치로 복사
   - `processCharacter()`, `updateCharacter()` 업데이트

---

## 사용 예시

### 방법 1: imageUrl (외부 URL)

```bash
curl -X POST ".../api/characters/profiles/cat-couple/characters" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "nabi",
    "name": "나비",
    "description": "Gray persian cat, 3D Pixar style",
    "imageUrl": "https://example.com/cat-image.png"
  }'
```

### 방법 2: gcsPath (GCS 경로)

```bash
# 1. 먼저 이미지를 GCS에 업로드
gcloud storage cp my-cat.png gs://dkdk-474008-short-videos/temp/

# 2. API로 등록 (상대 경로)
curl -X POST ".../api/characters/profiles/cat-couple/characters" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "nabi",
    "name": "나비",
    "description": "Gray persian cat...",
    "gcsPath": "temp/my-cat.png"
  }'

# 또는 전체 경로
# "gcsPath": "gs://dkdk-474008-short-videos/temp/my-cat.png"
```

### 방법 3: referenceImageBase64 (기존 방식)

```bash
curl -X POST ".../api/characters/profiles/cat-couple/characters" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "nabi",
    "name": "나비",
    "description": "Gray persian cat...",
    "referenceImageBase64": "data:image/png;base64,iVBORw0KGgo..."
  }'
```

---

## 내부 동작

### downloadAndSaveImage() 흐름

```
1. fetch(imageUrl) - 외부 URL에서 다운로드
2. Content-Type 확인 → 확장자 결정 (png/jpg/webp)
3. GCS에 저장: characters/{profileId}/images/{characterId}.{ext}
4. 저장된 GCS URL 반환
```

### registerGcsImage() 흐름

```
1. gcsPath 파싱 (gs:// 또는 상대 경로)
2. 소스 파일 존재 확인
3. 표준 위치로 복사: characters/{profileId}/images/{characterId}.{ext}
4. 저장된 GCS URL 반환
```

---

## GCS 저장 구조

```
gs://dkdk-474008-short-videos/
└── characters/
    ├── cat-couple/
    │   ├── profile.json
    │   └── images/
    │       ├── kami.png
    │       └── dalgi.png
    └── otter-couple/
        ├── profile.json
        └── images/
            ├── husband.png
            └── wife.png
```

---

## 배포 정보

- **Revision**: short-video-maker-00107-ff8
- **배포일**: 2025-12-23

---

## 관련 문서

- [[CHARACTER-MANAGEMENT-GUIDE]] - 전체 캐릭터 관리 가이드
- [[CLAUDE]] - 프로젝트 AI 컨텍스트
