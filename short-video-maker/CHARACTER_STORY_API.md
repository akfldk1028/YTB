# Character Story API Documentation

## 개요

Character Story API는 **NANO BANANA (Gemini 2.5 Flash Image)**와 **VEO3 (Google Video Generation)**를 결합하여 일관성 있는 캐릭터로 여러 개의 비디오를 생성하는 종합 워크플로우입니다.

### 주요 기능

- ✅ **캐릭터 일관성 유지**: NANO BANANA의 참조 이미지 기능으로 동일한 캐릭터 생성
- ✅ **자동 워크플로우**: 캐릭터 생성 → 씬 이미지 → VEO3 비디오 자동화
- ✅ **캐릭터 라이브러리**: 생성된 캐릭터를 저장하고 재사용
- ✅ **다중 씬 스토리**: 한 캐릭터로 여러 씬의 비디오 생성
- ✅ **유연한 설정**: 참조 이미지 개수, 일관성 강도 조절 가능

---

## 워크플로우 개요

```
1. 캐릭터 설명 입력
   ↓
2. NANO BANANA가 참조 이미지 세트 생성 (3-12장)
   - 다양한 각도, 표정, 구도, 조명
   ↓
3. 캐릭터 라이브러리에 저장
   ↓
4. 각 씬에 대해:
   a) 참조 이미지를 사용하여 씬 이미지 생성
   b) VEO3로 씬 이미지를 비디오로 변환
   ↓
5. 결과: 동일한 캐릭터가 등장하는 여러 비디오
```

---

## API 엔드포인트

### 1. 캐릭터 스토리 생성

**POST** `/api/character-story/generate`

새로운 캐릭터를 생성하거나 기존 캐릭터를 사용하여 스토리 비디오를 생성합니다.

#### Request Body

```json
{
  "characterDescription": "A brave knight with silver armor, red cape, brown beard, determined expression, medieval setting, detailed character design",
  "characterName": "Sir Galahad",
  "scenes": [
    {
      "sceneNumber": 1,
      "prompt": "The knight standing at a castle gate during sunset, dramatic lighting, cinematic composition",
      "duration": 6,
      "motionDescription": "Slow camera push in, wind blowing the cape, sunset rays filtering through"
    },
    {
      "sceneNumber": 2,
      "prompt": "The knight fighting a dragon in a rocky landscape, fire and smoke, action scene",
      "duration": 8,
      "motionDescription": "Dynamic camera movement following the action, flames and particle effects"
    },
    {
      "sceneNumber": 3,
      "prompt": "The knight kneeling before the king in a grand throne room, golden light from windows",
      "duration": 6,
      "motionDescription": "Gentle camera dolly around the scene, dust particles in light beams"
    }
  ],
  "generateReferenceSet": true,
  "referenceSetSize": 4,
  "videoOrientation": "portrait",
  "styleStrength": "strong"
}
```

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `characterDescription` | string | Yes (if no characterId) | - | 캐릭터 상세 설명 (NANO BANANA 프롬프트) |
| `characterName` | string | No | "Unnamed Character" | 캐릭터 이름 |
| `characterId` | string | No | - | 기존 캐릭터 ID 사용 |
| `scenes` | array | Yes | - | 씬 배열 (최소 1개) |
| `generateReferenceSet` | boolean | No | true | 참조 이미지 세트 생성 여부 |
| `referenceSetSize` | number | No | 4 | 참조 이미지 개수 (3-12) |
| `videoOrientation` | string | No | "portrait" | "portrait" 또는 "landscape" |
| `styleStrength` | string | No | "strong" | "subtle", "moderate", "strong" |

#### Scene Object

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `sceneNumber` | number | Yes | - | 씬 번호 |
| `prompt` | string | Yes | - | 씬 설명 (배경, 상황, 분위기 등) |
| `duration` | number | No | 6 | 비디오 길이 (5-8초, VEO3 제한) |
| `motionDescription` | string | No | auto | 카메라 움직임 및 모션 설명 |

#### Response

```json
{
  "success": true,
  "characterId": "char-1735151234567-abc123",
  "character": {
    "id": "char-1735151234567-abc123",
    "name": "Sir Galahad",
    "description": "A brave knight with silver armor...",
    "createdAt": "2025-10-25T14:30:00.000Z",
    "referenceImages": [
      {
        "filename": "ref-1-nano-banana-1735151234567-1.png",
        "path": "/home/user/.ai-agents-az-video-generator/characters/char-1735151234567-abc123/ref-1-nano-banana-1735151234567-1.png",
        "variations": {
          "angle": "front view",
          "expression": "neutral expression",
          "composition": "upper body shot",
          "lighting": "soft natural lighting"
        },
        "prompt": "A brave knight..., front view, neutral expression..."
      }
    ],
    "metadata": {
      "tags": ["generated"],
      "notes": "Auto-generated from story request"
    }
  },
  "scenes": [
    {
      "sceneNumber": 1,
      "prompt": "The knight standing at a castle gate during sunset...",
      "imageFilename": "nano-banana-1735151240000-1.png",
      "imagePath": "/temp/nano-banana-1735151240000-1.png",
      "videoUrl": "https://generativelanguage.googleapis.com/...",
      "videoId": "veo-1735151250000",
      "duration": 6,
      "generatedAt": "2025-10-25T14:31:00.000Z"
    },
    {
      "sceneNumber": 2,
      "prompt": "The knight fighting a dragon...",
      "imageFilename": "nano-banana-1735151260000-1.png",
      "imagePath": "/temp/nano-banana-1735151260000-1.png",
      "videoUrl": "https://generativelanguage.googleapis.com/...",
      "videoId": "veo-1735151270000",
      "duration": 8,
      "generatedAt": "2025-10-25T14:32:00.000Z"
    }
  ],
  "totalScenes": 3,
  "totalGenerationTimeMs": 180000
}
```

---

### 2. 기존 캐릭터에 씬 추가

**POST** `/api/character-story/add-scenes/:characterId`

기존 캐릭터를 사용하여 추가 씬을 생성합니다.

#### Request Body

```json
{
  "scenes": [
    {
      "sceneNumber": 4,
      "prompt": "The knight resting by a campfire in the forest at night, stars visible through trees",
      "duration": 6,
      "motionDescription": "Gentle camera pan across the scene, flickering firelight"
    }
  ],
  "videoOrientation": "portrait",
  "styleStrength": "strong"
}
```

#### Response

동일한 구조의 `CharacterStoryResult` 반환

---

### 3. 모든 캐릭터 조회

**GET** `/api/character-story/characters`

캐릭터 라이브러리의 모든 캐릭터 목록을 반환합니다.

#### Response

```json
{
  "success": true,
  "characters": [
    {
      "id": "char-1735151234567-abc123",
      "name": "Sir Galahad",
      "description": "A brave knight...",
      "createdAt": "2025-10-25T14:30:00.000Z",
      "referenceImages": [...],
      "metadata": {...}
    }
  ],
  "total": 5
}
```

---

### 4. 특정 캐릭터 조회

**GET** `/api/character-story/characters/:characterId`

특정 캐릭터의 상세 정보를 반환합니다.

#### Response

```json
{
  "success": true,
  "character": {
    "id": "char-1735151234567-abc123",
    "name": "Sir Galahad",
    "description": "A brave knight...",
    "createdAt": "2025-10-25T14:30:00.000Z",
    "referenceImages": [...],
    "metadata": {...}
  }
}
```

---

### 5. 캐릭터 검색

**GET** `/api/character-story/characters/search/:query`

이름 또는 태그로 캐릭터를 검색합니다.

#### Example

```bash
GET /api/character-story/characters/search/knight
```

#### Response

```json
{
  "success": true,
  "characters": [
    {
      "id": "char-1735151234567-abc123",
      "name": "Sir Galahad",
      "description": "A brave knight...",
      ...
    }
  ],
  "total": 2,
  "query": "knight"
}
```

---

### 6. 캐릭터 업데이트

**PATCH** `/api/character-story/characters/:characterId`

캐릭터 메타데이터를 업데이트합니다.

#### Request Body

```json
{
  "name": "Sir Galahad the Brave",
  "metadata": {
    "tags": ["knight", "medieval", "hero"],
    "style": "fantasy realistic",
    "notes": "Main character for medieval series"
  }
}
```

#### Response

```json
{
  "success": true,
  "character": {
    "id": "char-1735151234567-abc123",
    "name": "Sir Galahad the Brave",
    ...
  }
}
```

---

### 7. 캐릭터 삭제

**DELETE** `/api/character-story/characters/:characterId`

캐릭터와 모든 참조 이미지를 삭제합니다.

#### Response

```json
{
  "success": true,
  "message": "Character deleted successfully"
}
```

---

### 8. 라이브러리 통계

**GET** `/api/character-story/stats`

캐릭터 라이브러리 통계를 반환합니다.

#### Response

```json
{
  "success": true,
  "totalCharacters": 12,
  "totalReferenceImages": 48,
  "storageDir": "/home/user/.ai-agents-az-video-generator/characters"
}
```

---

## 사용 예제

### Example 1: 새 캐릭터로 짧은 스토리 생성

```bash
curl -X POST http://localhost:3124/api/character-story/generate \
  -H "Content-Type: application/json" \
  -d '{
    "characterDescription": "A cute anime girl with blue twin-tail hair, large green eyes, school uniform with red ribbon, cheerful smile, detailed anime style",
    "characterName": "Miku",
    "scenes": [
      {
        "sceneNumber": 1,
        "prompt": "The girl walking to school on a sunny morning, cherry blossoms falling, cheerful atmosphere",
        "duration": 6
      },
      {
        "sceneNumber": 2,
        "prompt": "The girl studying in a bright classroom, sunlight through windows, peaceful mood",
        "duration": 6
      },
      {
        "sceneNumber": 3,
        "prompt": "The girl eating lunch with friends on the school rooftop, blue sky background",
        "duration": 6
      }
    ],
    "generateReferenceSet": true,
    "referenceSetSize": 5,
    "videoOrientation": "portrait",
    "styleStrength": "strong"
  }'
```

### Example 2: 기존 캐릭터로 추가 씬 생성

```bash
# 1. 캐릭터 목록 조회
curl http://localhost:3124/api/character-story/characters

# 2. 특정 캐릭터로 씬 추가
curl -X POST http://localhost:3124/api/character-story/add-scenes/char-1735151234567-abc123 \
  -H "Content-Type: application/json" \
  -d '{
    "scenes": [
      {
        "sceneNumber": 4,
        "prompt": "The girl running through a summer festival at night, lanterns and fireworks, magical atmosphere",
        "duration": 8,
        "motionDescription": "Dynamic camera following the running character, bokeh lights in background"
      }
    ],
    "videoOrientation": "portrait",
    "styleStrength": "strong"
  }'
```

### Example 3: 참조 이미지 없이 빠른 생성

```bash
curl -X POST http://localhost:3124/api/character-story/generate \
  -H "Content-Type: application/json" \
  -d '{
    "characterDescription": "A cyberpunk hacker with neon pink hair, cybernetic eye implant, black leather jacket",
    "characterName": "Neo",
    "scenes": [
      {
        "sceneNumber": 1,
        "prompt": "The hacker typing on holographic keyboards, blue neon lighting, futuristic tech",
        "duration": 6
      }
    ],
    "generateReferenceSet": false,
    "videoOrientation": "landscape"
  }'
```

---

## 프롬프트 작성 가이드

### 캐릭터 설명 (characterDescription)

**좋은 예:**
```
"A young wizard with messy brown hair, round glasses, blue magical robes with star patterns,
wooden wand in hand, kind expression, book-smart appearance, Hogwarts student style,
detailed fantasy character design, consistent features, 4k quality"
```

**포함해야 할 요소:**
- 외모 특징 (머리카락, 눈, 피부 등)
- 의상 및 액세서리
- 표정 및 성격
- 스타일 (realistic, anime, fantasy 등)
- 일관성 키워드 ("consistent features", "same character")

### 씬 프롬프트 (scene.prompt)

**좋은 예:**
```
"The wizard practicing spells in a library filled with floating books,
golden magical particles in the air, warm candlelight, dust motes visible,
mysterious atmosphere, detailed environment"
```

**포함해야 할 요소:**
- 캐릭터의 행동/포즈
- 배경 및 환경
- 조명 상태
- 분위기 및 감정
- 카메라 구도 (optional)

**피해야 할 것:**
- 캐릭터 외모 재정의 (참조 이미지에서 자동으로 유지됨)
- 모호한 표현 ("something interesting")
- 지나치게 짧은 프롬프트

---

## 참조 이미지 세트 크기 권장사항

| 용도 | referenceSetSize | 설명 |
|------|------------------|------|
| 빠른 테스트 | 1-2 | 참조 이미지 생성 건너뛰거나 최소화 |
| 일반 스토리 | 3-5 | 적당한 일관성과 생성 속도 균형 |
| 고품질 시리즈 | 6-8 | 높은 캐릭터 일관성 |
| 전문 프로젝트 | 9-12 | 최대 일관성, 다양한 각도/표정 확보 |

---

## 일관성 강도 (styleStrength)

| 값 | 설명 | 사용 사례 |
|----|------|-----------|
| `subtle` | 약한 일관성, 창의적 자유도 높음 | 같은 "스타일"의 다양한 캐릭터 |
| `moderate` | 중간 일관성 (기본값) | 일반적인 스토리 생성 |
| `strong` | 강한 일관성, 캐릭터 외모 엄격히 유지 | 시리즈, 브랜드 캐릭터 |

---

## 비용 및 시간 예상

### 예상 비용 (1 캐릭터 + 3씬 스토리 기준)

| 항목 | 개수 | 단가 | 비용 |
|------|------|------|------|
| 참조 이미지 생성 | 4장 | $0.039/장 | $0.156 |
| 씬 이미지 생성 | 3장 | $0.039/장 | $0.117 |
| VEO3 비디오 생성 | 3개 | ~$0.30/영상 | $0.90 |
| **합계** | | | **~$1.17** |

### 예상 소요 시간

| 단계 | 시간 |
|------|------|
| 참조 이미지 생성 (4장) | ~10-15초 |
| 씬 이미지 생성 (3장) | ~10-15초 |
| VEO3 비디오 생성 (3개) | ~3-5분 |
| **총 소요 시간** | **~4-6분** |

---

## 트러블슈팅

### 1. "Character Story API disabled" 메시지

**원인**: GOOGLE_GEMINI_API_KEY가 설정되지 않음

**해결**:
```bash
# .env 파일에 추가
GOOGLE_GEMINI_API_KEY=your-gemini-api-key
```

### 2. 캐릭터 일관성이 낮음

**원인**: 참조 이미지가 부족하거나 styleStrength가 약함

**해결**:
- `referenceSetSize`를 5-8로 증가
- `styleStrength`를 "strong"으로 설정
- 캐릭터 설명을 더 상세하게 작성

### 3. VEO3 비디오가 생성되지 않음

**원인**: VEO API가 초기화되지 않음 또는 타임아웃

**확인사항**:
```bash
# 환경 변수 확인
VIDEO_SOURCE=veo  # 또는 "both"
GOOGLE_GEMINI_API_KEY=your-key

# 서버 로그 확인
grep "VEO" server.log
```

### 4. 참조 이미지 생성 실패

**원인**: Rate limiting 또는 API 오류

**해결**:
- 요청 간 지연 시간 확인 (기본 1.5초)
- API 키 할당량 확인
- 서버 로그에서 상세 오류 확인

---

## 고급 사용법

### 1. 캐릭터 라이브러리 관리

```bash
# 모든 캐릭터 조회
curl http://localhost:3124/api/character-story/characters

# 특정 캐릭터 상세 정보
curl http://localhost:3124/api/character-story/characters/char-123

# 캐릭터 검색
curl http://localhost:3124/api/character-story/characters/search/wizard

# 캐릭터 메타데이터 업데이트
curl -X PATCH http://localhost:3124/api/character-story/characters/char-123 \
  -H "Content-Type: application/json" \
  -d '{"metadata": {"tags": ["hero", "magic"]}}'

# 캐릭터 삭제
curl -X DELETE http://localhost:3124/api/character-story/characters/char-123
```

### 2. 워크플로우 최적화

```javascript
// Node.js 예제: 병렬 씬 생성 후 순차 비디오 생성
async function generateStoryOptimized(characterId, scenes) {
  // 1. 모든 씬 이미지를 병렬로 생성 (NANO BANANA는 순차)
  const storyResult = await fetch('http://localhost:3124/api/character-story/add-scenes/' + characterId, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenes })
  }).then(r => r.json());

  console.log(`Generated ${storyResult.scenes.length} scenes`);
  console.log(`Videos created: ${storyResult.scenes.filter(s => s.videoUrl).length}`);

  return storyResult;
}
```

---

## 참고 자료

- [NANO BANANA (Gemini 2.5 Flash Image) 문서](https://ai.google.dev/gemini-api/docs/image-generation)
- [VEO3 비디오 생성 가이드](https://ai.google.dev/api/generate-video)
- [프롬프트 작성 모범 사례](https://developers.googleblog.com/en/how-to-prompt-gemini-2-5-flash-image-generation-for-the-best-results/)
- [캐릭터 일관성 가이드](./docs/2025-09-26_NANO_BANANA_COMPREHENSIVE_PROMPT_GUIDE.md)

---

## 다음 단계

1. **테스트 요청 보내기**: 위의 예제를 사용하여 첫 캐릭터 스토리 생성
2. **캐릭터 라이브러리 구축**: 자주 사용할 캐릭터를 미리 생성하고 저장
3. **프롬프트 최적화**: 여러 테스트를 통해 최적의 프롬프트 패턴 발견
4. **워크플로우 자동화**: N8N 또는 다른 자동화 도구와 통합

---

**생성일**: 2025-10-25
**버전**: 1.0.0
**API 경로**: `/api/character-story`
