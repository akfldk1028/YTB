# 캐릭터 이미지 등록 기능 개선

**날짜:** 2025-12-23
**상태:** 구현 완료 및 배포됨
**Revision:** short-video-maker-00107-ff8

---

## 개요

기존에는 캐릭터 이미지를 등록할 때 반드시 **Base64 인코딩**된 데이터를 API에 전달해야 했습니다.
이번 업데이트로 더 편리한 2가지 방법이 추가되었습니다:

1. **imageUrl** - 외부 이미지 URL을 제공하면 서버가 자동으로 다운로드
2. **gcsPath** - 이미 GCS에 업로드된 이미지 경로를 직접 지정

---

## 이미지 등록 방법 (3가지)

### 방법 1: 외부 URL (imageUrl) ⭐ 추천

서버가 URL에서 이미지를 다운로드하여 GCS에 저장합니다.

```bash
curl -X POST "https://short-video-maker-xxx.run.app/api/characters/profiles/cat-couple/characters" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "new-cat",
    "name": "새 고양이",
    "description": "A cute orange cat, 3D Pixar style",
    "style": "pixar",
    "imageUrl": "https://example.com/cat-image.png"
  }'
```

**지원 형식:** PNG, JPG, JPEG, WebP, GIF

### 방법 2: GCS 경로 (gcsPath)

이미 Google Cloud Storage에 업로드된 이미지를 등록합니다.

```bash
curl -X POST "https://short-video-maker-xxx.run.app/api/characters/profiles/cat-couple/characters" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "new-cat",
    "name": "새 고양이",
    "description": "A cute orange cat, 3D Pixar style",
    "gcsPath": "gs://dkdk-474008-short-videos/temp/my-cat.png"
  }'
```

**GCS 경로 형식:**
- 전체 경로: `gs://bucket-name/path/to/image.png`
- 상대 경로: `path/to/image.png` (현재 버킷 내)

### 방법 3: Base64 (기존 방식)

```bash
curl -X POST "https://short-video-maker-xxx.run.app/api/characters/profiles/cat-couple/characters" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "new-cat",
    "name": "새 고양이",
    "description": "A cute orange cat, 3D Pixar style",
    "referenceImageBase64": "data:image/png;base64,iVBORw0KGgo..."
  }'
```

---

## 우선순위

여러 필드가 동시에 제공된 경우 다음 순서로 처리됩니다:

```
gcsPath > imageUrl > referenceImageBase64
```

---

## 수정된 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/character-store/types.ts` | `imageUrl`, `gcsPath` 필드 추가 (CreateCharacterRequest, UpdateCharacterRequest) |
| `src/character-store/CharacterStorageService.ts` | `downloadAndSaveImage()`, `registerGcsImage()` 메서드 추가 |

---

## 핵심 코드

### types.ts
```typescript
export interface CreateCharacterRequest {
  id: string;
  name: string;
  description: string;
  style?: string;
  distinguishingFeatures?: string;
  referenceImageBase64?: string;  // 기존 방식
  imageUrl?: string;              // ⭐ NEW: 외부 URL
  gcsPath?: string;               // ⭐ NEW: GCS 경로
}
```

### CharacterStorageService.ts - processCharacter()
```typescript
private async processCharacter(profileId: string, request: AddCharacterRequest): Promise<Character> {
  // 우선순위: gcsPath > imageUrl > referenceImageBase64
  if (request.gcsPath) {
    const imageUrl = await this.registerGcsImage(profileId, request.id, request.gcsPath);
    character.referenceImageUrl = imageUrl;
  } else if (request.imageUrl) {
    const imageUrl = await this.downloadAndSaveImage(profileId, request.id, request.imageUrl);
    character.referenceImageUrl = imageUrl;
  } else if (request.referenceImageBase64) {
    const imageUrl = await this.saveImage(profileId, request.id, request.referenceImageBase64);
    character.referenceImageUrl = imageUrl;
  }
  return character;
}
```

---

## 테스트 결과

### imageUrl 테스트
```bash
# 요청
curl -X POST ".../api/characters/profiles/cat-couple/characters" \
  -d '{"id":"test","name":"Test","description":"Test","imageUrl":"https://upload.wikimedia.org/..."}'

# 응답
{"success":true,"data":{"id":"test","referenceImageUrl":"gs://bucket/characters/cat-couple/images/test.jpg"}}
```

### gcsPath 테스트
```bash
# 요청
curl -X POST ".../api/characters/profiles/cat-couple/characters" \
  -d '{"id":"test2","name":"Test2","description":"Test2","gcsPath":"characters/cat-couple/images/test.jpg"}'

# 응답
{"success":true,"data":{"id":"test2","referenceImageUrl":"gs://bucket/characters/cat-couple/images/test2.png"}}
```

---

## GCS에 이미지 직접 업로드하는 방법

```bash
# 1. gcloud CLI로 업로드
gcloud storage cp my-cat.png gs://dkdk-474008-short-videos/temp/

# 2. API로 캐릭터 등록 (gcsPath 사용)
curl -X POST ".../api/characters/profiles/cat-couple/characters" \
  -d '{"id":"new-cat","name":"새 고양이","description":"...","gcsPath":"temp/my-cat.png"}'
```

---

## 관련 문서

- [[2025-12-22-scene-character-and-frame-interpolation]] - Scene별 캐릭터 지정
- [[Consistent-Shorts-API-Guide]] - Consistent Shorts API 전체 가이드
