# Character Storage System Implementation Summary

> AI Context Document - 2025-12-01
> 이 문서는 Character Storage System 구현 내용을 AI가 이해할 수 있도록 정리한 것입니다.

## 1. 목적 (Purpose)

**수달 부부 (Otter Couple) 같은 캐릭터를 여러 영상에서 일관되게 사용하기 위한 시스템**

- 채널별 캐릭터 프로필 저장 (GCS 기반)
- 레퍼런스 이미지 영구 저장
- Consistent Shorts Workflow에서 저장된 캐릭터 자동 로드

## 2. 구현된 파일 (Implemented Files)

### 2.1 새로 생성된 파일

| 파일 | 설명 |
|------|------|
| `src/character-store/types.ts` | Character, CharacterProfile, Request/Response 타입 정의 |
| `src/character-store/CharacterStorageService.ts` | GCS 기반 스토리지 서비스 (CRUD) |
| `src/character-store/index.ts` | 모듈 export |
| `src/server/api/characters.ts` | REST API 라우터 (/api/characters/*) |

### 2.2 수정된 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/server/server.ts` | CharacterAPIRouter 마운트 (/api/characters) |
| `src/server/api/consistent-shorts.ts` | `characterReference` 파라미터 추가 |
| `src/short-creator/ShortCreatorRefactored.ts` | CharacterStorageService 초기화 |
| `src/short-creator/workflows/ConsistentShortsWorkflow.ts` | 저장된 캐릭터 이미지 로드 로직 추가 |

## 3. GCS 스토리지 구조

```
gs://{GCS_BUCKET_NAME}/characters/
├── otter-couple/                    # profileId
│   ├── profile.json                 # 프로필 메타데이터
│   └── images/
│       ├── husband.png              # characterId.png
│       └── wife.png
└── another-profile/
    └── ...
```

## 4. 타입 정의 (Key Types)

```typescript
// 개별 캐릭터
interface Character {
  id: string;                        // "husband", "wife"
  name: string;                      // "남편 수달"
  description: string;               // Nano Banana 프롬프트
  style?: string;                    // "pixar", "anime"
  distinguishingFeatures?: string;   // "pink ribbon on head"
  referenceImageUrl?: string;        // GCS URL
  referenceImageBase64?: string;     // 임시 저장용
}

// 채널 캐릭터 프로필
interface CharacterProfile {
  profileId: string;                 // "otter-couple"
  name: string;                      // "수달 부부"
  characters: Character[];
  defaultStyle?: string;
  defaultMood?: string;
  createdAt: string;
  updatedAt: string;
}

// Consistent Shorts에서 사용
interface CharacterReference {
  profileId: string;
  characterIds?: string[];           // 특정 캐릭터만 사용
  sceneCharacterMap?: Record<number, string[]>;  // 씬별 캐릭터 지정
}
```

## 5. REST API 엔드포인트

### Profile CRUD
```
POST   /api/characters/profiles           - 프로필 생성
GET    /api/characters/profiles           - 모든 프로필 목록
GET    /api/characters/profiles/:id       - 프로필 조회
PUT    /api/characters/profiles/:id       - 프로필 업데이트
DELETE /api/characters/profiles/:id       - 프로필 삭제
```

### Character CRUD
```
POST   /api/characters/profiles/:id/characters        - 캐릭터 추가
PUT    /api/characters/profiles/:id/characters/:cid   - 캐릭터 수정
DELETE /api/characters/profiles/:id/characters/:cid   - 캐릭터 삭제
```

### Image Access
```
GET    /api/characters/profiles/:id/characters/:cid/image  - Signed URL
GET    /api/characters/profiles/:id/images                 - 모든 이미지 (Base64)
```

### Health
```
GET    /api/characters/health             - 상태 확인
```

## 6. Consistent Shorts API 통합

### 기존 방식 (character description)
```json
POST /api/video/consistent-shorts
{
  "character": {
    "description": "A cute otter couple...",
    "style": "pixar"
  },
  "scenes": [...]
}
```

### 새로운 방식 (stored character profile)
```json
POST /api/video/consistent-shorts
{
  "characterReference": {
    "profileId": "otter-couple",
    "characterIds": ["husband", "wife"]
  },
  "scenes": [...]
}
```

## 7. ConsistentShortsWorkflow 동작 방식

```typescript
// 1. 저장된 캐릭터 이미지 로드 (음수 인덱스로 구분)
const storedImages = await this.loadStoredCharacterImages(profileId, characterIds);
for (let idx = 0; idx < storedImages.length; idx++) {
  previousImages.push({
    data: storedImages[idx].data,
    mimeType: storedImages[idx].mimeType,
    sceneIndex: -(idx + 1)  // -1, -2, -3... (저장된 이미지)
  });
}

// 2. Scene 0부터 저장된 이미지를 레퍼런스로 사용
const referenceImages = previousImages.length > 0
  ? previousImages.slice(-3)  // 최대 3개
  : undefined;

// 3. Nano Banana에서 레퍼런스로 사용 → 캐릭터 일관성 유지!
await this.imageGenerationService.generateImages({
  prompt: enhancedPrompt,
  referenceImages: referenceImages  // Chat Mode 방식
}, videoId, sceneIndex);
```

## 8. 사용 예시

### 8.1 프로필 생성
```json
POST /api/characters/profiles
{
  "profileId": "otter-couple",
  "name": "수달 부부",
  "description": "귀여운 수달 커플 캐릭터",
  "channelName": "수달TV",
  "defaultStyle": "pixar",
  "characters": [
    {
      "id": "husband",
      "name": "남편 수달",
      "description": "A cute male otter with brown fur, wearing a tiny blue bowtie",
      "distinguishingFeatures": "blue bowtie, slightly bigger",
      "referenceImageBase64": "data:image/png;base64,..."
    },
    {
      "id": "wife",
      "name": "아내 수달",
      "description": "A cute female otter with lighter brown fur, wearing a pink ribbon",
      "distinguishingFeatures": "pink ribbon on head, slightly smaller",
      "referenceImageBase64": "data:image/png;base64,..."
    }
  ]
}
```

### 8.2 영상 생성
```json
POST /api/video/consistent-shorts
{
  "characterReference": {
    "profileId": "otter-couple"
  },
  "scenes": [
    { "text": "수달 부부가 강가에서 물놀이를 합니다" },
    { "text": "남편 수달이 물고기를 잡았어요" },
    { "text": "아내 수달이 박수를 칩니다" }
  ],
  "config": {
    "orientation": "portrait",
    "voice": "baRq1qg6PxLsnSQ04d8c"
  }
}
```

## 9. 수정된 버그

### listProfiles() GCS 폴더 탐지 로직
- **문제**: delimiter 사용 시 `files` 배열이 비어있을 수 있음
- **해결**: `apiResponse.prefixes`에서 폴더 목록 추출 + fallback으로 files 확인

```typescript
const [files, , apiResponse] = await this.bucket.getFiles({
  prefix: `${CHARACTERS_FOLDER}/`,
  delimiter: '/',
});

// apiResponse.prefixes에서 폴더 추출
const prefixes = (apiResponse as { prefixes?: string[] })?.prefixes;
if (prefixes && Array.isArray(prefixes)) {
  for (const prefix of prefixes) {
    const parts = prefix.split('/');
    if (parts.length >= 2 && parts[1]) {
      profileIds.add(parts[1]);
    }
  }
}
```

## 10. 빌드 상태

```bash
npm run build  # ✅ 성공 (2025-12-01)
```

## 11. 다음 단계 (TODO)

1. **Git 커밋**: Character Storage System 구현 커밋
2. **Cloud Run 배포**: 테스트를 위한 배포
3. **수달 부부 프로필 생성**: 실제 테스트용 프로필 생성
4. **N8N 워크플로우 연동**: characterReference 사용 테스트

## 12. 환경 변수

Character Storage가 작동하려면 다음 환경 변수가 필요:

```env
GCS_BUCKET_NAME=your-bucket-name
GOOGLE_CLOUD_PROJECT_ID=your-project-id
```

`GCS_BUCKET_NAME`이 설정되지 않으면 Character Storage는 비활성화됨 (graceful degradation).

---

*Last updated: 2025-12-01 by Claude Code*
