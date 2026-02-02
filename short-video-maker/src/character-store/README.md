# Character Store

> 캐릭터/프로필 관리 모듈
> 채널별 캐릭터 저장 및 일관된 캐릭터 이미지 생성을 위한 레퍼런스 관리

---

## 핵심 파일

| 파일 | 설명 |
|------|------|
| `CharacterStorageService.ts` | GCS 기반 캐릭터 프로필 CRUD |
| `types.ts` | Character, CharacterProfile 타입 정의 |
| `index.ts` | Export 모듈 |

---

## 주요 타입

### Character
```typescript
interface Character {
  id: string;              // "kami", "dalgi"
  name: string;            // "까미", "딸기"
  description: string;     // NanoBanana 프롬프트용
  style?: string;          // "pixar", "anime", "ghibli"
  referenceImageUrl?: string;  // GCS URL
  gcsPath?: string;        // GCS 경로
}
```

### CharacterProfile
```typescript
interface CharacterProfile {
  profileId: string;       // "cat-couple"
  name: string;            // "고양이 커플"
  channelName?: string;    // "why_cat"
  characters: Character[]; // 캐릭터 배열
  defaultStyle?: string;   // 기본 스타일
}
```

---

## 이미지 등록 우선순위

```
gcsPath > imageUrl > referenceImageBase64
```

1. **gcsPath**: 이미 GCS에 업로드된 경로
2. **imageUrl**: 외부 URL → 서버가 다운로드 → GCS 저장
3. **referenceImageBase64**: Base64 → GCS 저장

---

## API 엔드포인트

| Method | Endpoint | 설명 |
|--------|----------|------|
| `GET` | `/api/characters/profiles` | 전체 프로필 목록 |
| `GET` | `/api/characters/profiles/:profileId` | 프로필 상세 |
| `POST` | `/api/characters/profiles` | 프로필 생성 |
| `POST` | `/api/characters/profiles/:profileId/characters` | 캐릭터 추가 |
| `PUT` | `/api/characters/profiles/:profileId/characters/:characterId` | 캐릭터 수정 |
| `DELETE` | `/api/characters/profiles/:profileId/characters/:characterId` | 캐릭터 삭제 |

---

## 현재 등록된 프로필

| profileId | channelName | characters |
|-----------|-------------|------------|
| `cat-couple` | `why_cat` | `kami`, `dalgi` |

---

## 사용 예시

```bash
# 프로필 목록 조회
curl https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/characters/profiles

# 캐릭터 추가 (GCS 경로)
curl -X POST ".../api/characters/profiles/cat-couple/characters" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "nabi",
    "name": "나비",
    "description": "A fluffy white Persian cat",
    "gcsPath": "characters/cat-couple/nabi.png"
  }'

# 캐릭터 추가 (외부 URL)
curl -X POST ".../api/characters/profiles/cat-couple/characters" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "maru",
    "name": "마루",
    "description": "A tabby cat with stripes",
    "imageUrl": "https://example.com/maru.png"
  }'
```

---

## 관련 문서

- [CHARACTER-MANAGEMENT-GUIDE.md](../../docs/CHARACTER-MANAGEMENT-GUIDE.md)
- [Consistent-Shorts-API-Guide.md](../../docs/CatProject/Consistent-Shorts-API-Guide.md)
