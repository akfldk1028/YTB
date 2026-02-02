# Image Generation

> AI 이미지 생성 모듈
> GPT-4o, NanoBanana(Gemini Imagen), 기타 이미지 생성 서비스 통합

---

## 폴더 구조

```
image-generation/
├── services/           # 이미지 생성 서비스
│   ├── GPTImageService.ts       # OpenAI GPT-4o 이미지 생성
│   ├── NanoBananaService.ts     # Gemini Imagen (동일성 유지)
│   ├── ImageGenerationService.ts # 통합 서비스
│   ├── ImagenService.ts         # Google Imagen 직접 호출
│   └── GeminiBatchService.ts    # Gemini 배치 처리
├── generators/         # 이미지 생성기
├── models/             # 모델 정의
├── types/              # 타입 정의
├── interfaces/         # 인터페이스
├── routes/             # API 라우트
├── factories/          # 팩토리 패턴
├── cards/              # 카드 이미지 생성
├── tests/              # 테스트
└── utils/              # 유틸리티
```

---

## 핵심 서비스

### 1. GPTImageService
OpenAI GPT-4o 기반 이미지 생성

```typescript
// 지브리 스타일 첫 이미지 생성 (~45초)
const result = await gptImageService.generateImage({
  prompt: "A cute orange cat in magical forest, ghibli style",
  aspectRatio: "9:16"
});
```

**주의**: OpenAI 모더레이션 정책으로 아래 키워드 차단됨
| 차단됨 ❌ | 허용됨 ✅ |
|----------|----------|
| "Studio Ghibli" | "Ghibli-style" |
| "Hayao Miyazaki" | "hand-painted aesthetic" |

### 2. NanoBananaService
Gemini Imagen 기반 동일성 유지 이미지 생성

```typescript
// GPT 이미지를 레퍼런스로 동일성 유지 (~10초/장)
const result = await nanoBananaService.generateWithReference({
  prompt: "Cat by a riverbank at sunset",
  referenceImage: gptImageBase64,
  aspectRatio: "9:16"
});
```

---

## GPT-to-NanoBanana 워크플로우

캐릭터 일관성을 위한 하이브리드 이미지 생성 전략:

```
Scene 1 → GPT-4o (마스터 이미지, ~45초)
    ↓
Scene 2~N → NanoBanana + referenceImage (~10초/장)
```

### API 사용

```bash
curl -X POST ".../api/gpt-to-nanobanana/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "character": {
      "description": "A cute orange tabby cat, anime style"
    },
    "scenes": [
      {"text": "Cat in a magical forest"},
      {"text": "Cat by a river"},
      {"text": "Cat sleeping on clouds"}
    ],
    "config": {
      "aspectRatio": "9:16"
    }
  }'
```

### 응답

```json
{
  "success": true,
  "testId": "gpt2nano_1768972263931",
  "outputDir": ".../gpt-to-nanobanana/gpt2nano_xxx",
  "images": [
    { "scene": 0, "method": "gpt", "timeMs": 47589 },
    { "scene": 1, "method": "nanoBanana", "timeMs": 10377 },
    { "scene": 2, "method": "nanoBanana", "timeMs": 9845 }
  ],
  "summary": { "total": 3, "success": 3 },
  "totalTimeMs": 67811
}
```

---

## API 엔드포인트

| Method | Endpoint | 설명 |
|--------|----------|------|
| `POST` | `/api/gpt-to-nanobanana/generate` | 하이브리드 이미지 생성 |
| `GET` | `/api/gpt-to-nanobanana/:testId` | 결과 조회 |
| `POST` | `/api/nano-banana/generate` | NanoBanana 단독 생성 |

---

## 환경 변수

```bash
OPENAI_API_KEY=sk-xxx          # GPT-4o
GOOGLE_GEMINI_API_KEY=xxx      # NanoBanana (Gemini Imagen)
```

---

## 관련 문서

- [AI_IMAGE_STYLES_2025.md](../../docs/Update/AI_IMAGE_STYLES_2025.md)
- [GPT Image API 참고](https://docs.aihubmix.com/en/api/GPT-Image-1)
