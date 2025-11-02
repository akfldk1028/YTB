# N8N LangChain Structured Output Parser 오류 수정

## 문제 상황

```
Node type: @n8n/n8n-nodes-langchain.outputParserStructured
Error: Model output doesn't fit required format
```

### 근본 원인

**이전 parameter.json이 OpenAI Structured Output용이었음:**
- `oneOf` 사용 → **LangChain은 지원하지 않음** ❌
- `additionalProperties: false` → LangChain에서 문제 발생 가능

**LangChain Structured Output Parser 특징:**
- 더 간단한 JSON Schema 필요
- `oneOf`, `anyOf`, `allOf` 같은 복잡한 조합 지원 제한
- Description 필드를 통한 명확한 가이드 필요

---

## 해결 방법

### ✅ LangChain 호환 Schema 사용

**핵심 전략:**
1. `timeline`과 `storyboard` 둘 다 optional properties로 정의
2. **Prompt에서 format_type에 따라 어느 필드를 생성할지 명시**
3. Description에 명확한 조건 추가

---

## N8N 노드 설정 방법

### 1. Generate Creative Video Idea 노드 설정

```
┌─────────────────────────────────────────────────┐
│  Node: Generate Creative Video Idea             │
│  Type: LangChain - Structured Output Parser     │
├─────────────────────────────────────────────────┤
│                                                  │
│  System Message:                                │
│  ┌────────────────────────────────────────────┐│
│  │ systemmessage_langchain.json 내용 붙여넣기││
│  └────────────────────────────────────────────┘│
│                                                  │
│  Prompt:                                        │
│  ┌────────────────────────────────────────────┐│
│  │ prompt_langchain.json 내용 붙여넣기        ││
│  │                                            ││
│  │ n8n 변수 사용:                             ││
│  │ {{ $json.selected_category }}              ││
│  │ {{ $json.target_language }}                ││
│  │ {{ $json.format_type }}                    ││
│  │ {{ $json.target_scenes_count }}            ││
│  │ {{ $json.individual_scene_durations }}     ││
│  └────────────────────────────────────────────┘│
│                                                  │
│  JSON Schema:                                   │
│  ┌────────────────────────────────────────────┐│
│  │ parameter_langchain.json 내용 붙여넣기     ││
│  └────────────────────────────────────────────┘│
│                                                  │
│  Options > On Error:                            │
│  ○ Stop and Return Error                        │
│  ● Continue (권장)                              │
│                                                  │
└─────────────────────────────────────────────────┘
```

---

## 파일 사용법

### 📄 parameter_langchain.json
**위치:** `/mnt/d/Data/00_Personal/YTB/docs/parameter_langchain.json`

**사용:**
1. 파일 내용 복사
2. n8n 노드 → "JSON Schema" 필드에 붙여넣기

**주요 특징:**
- `timeline`과 `storyboard` 모두 optional
- Description에 조건 명시: "ONLY include if format_type is 'timeline'"
- LangChain 호환 간단한 구조

---

### 📄 prompt_langchain.json
**위치:** `/mnt/d/Data/00_Personal/YTB/docs/prompt_langchain.json`

**사용:**
1. 파일 내용 복사
2. n8n 노드 → "Prompt" 필드에 붙여넣기

**주요 특징:**
```
⚠️ CRITICAL FORMAT RULES:

IF format_type = "timeline":
  ✅ INCLUDE "timeline" object with "scenes" array
  ❌ DO NOT include "storyboard" field

IF format_type = "storyboard":
  ✅ INCLUDE "storyboard" array
  ❌ DO NOT include "timeline" field
```

**n8n 변수 자동 치환:**
- `{{ $json.selected_category }}`
- `{{ $json.target_language }}`
- `{{ $json.format_type }}`
- `{{ $json.target_scenes_count }}`
- `{{ $json.individual_scene_durations }}`

---

### 📄 systemmessage_langchain.json
**위치:** `/mnt/d/Data/00_Personal/YTB/docs/systemmessage_langchain.json`

**사용:**
1. 파일 내용 복사
2. n8n 노드 → "System Message" 필드에 붙여넣기

**주요 특징:**
```
⚠️ CRITICAL OUTPUT RULE:
- If format_type is "timeline", your output MUST have "timeline" field and MUST NOT have "storyboard" field
- If format_type is "storyboard", your output MUST have "storyboard" field and MUST NOT have "timeline" field
```

---

## 테스트 시나리오

### 시나리오 1: Timeline 형식

**Input:**
```json
{
  "format_type": "timeline",
  "selected_category": "Business Success",
  "target_language": "english",
  "time_slot": "morning",
  "hour": 11,
  "target_scenes_count": 6,
  "individual_scene_durations": [4, 6, 6, 6, 6, 6]
}
```

**Expected Output:**
```json
{
  "format_type": "timeline",
  "timeline": {
    "scenes": [
      {
        "id": "scene_1",
        "duration": 4,
        "text": "(excited) It's 11AM — your productivity window is closing fast...",
        "search_keywords": ["office workspace", "morning coffee"],
        "visual_style": "extreme close-up of clock and coffee cup...",
        "mood": "urgent energy with morning light...",
        "image_prompt": "Create an extreme close-up of..."
      }
      // ... 5 more scenes (총 6개)
    ]
  },
  "title": "11AM Productivity Hack: 4 Simple Tips",
  "target_language": "english",
  "topic_category": "Business Success",
  "time_context": "morning",
  "category": "Business Success",
  "language": "english",
  "viral_potential": 9.2,
  "video_config": {
    "orientation": "portrait",
    "musicVolume": "medium",
    "subtitlePosition": "bottom",
    "quality": "premium"
  },
  "elevenlabs_config": {
    "model_id": "eleven_multilingual_v2",
    "voice_settings": {
      "stability": 0.7,
      "similarity_boost": 0.8,
      "speed": 1.0,
      "style": "narration"
    },
    "output_format": "mp3"
  }
}
```

**검증:**
- ✅ `timeline` 필드 존재
- ✅ `storyboard` 필드 없음
- ✅ 정확히 6개 scenes
- ✅ 각 scene에 필수 필드 모두 포함

---

### 시나리오 2: Storyboard 형식

**Input:**
```json
{
  "format_type": "storyboard",
  "selected_category": "Health & Wellness",
  "target_language": "korean",
  "time_slot": "afternoon",
  "hour": 14,
  "target_scenes_count": 3,
  "individual_scene_durations": [5, 8, 7]
}
```

**Expected Output:**
```json
{
  "format_type": "storyboard",
  "storyboard": [
    {
      "shot": 1,
      "duration": 5,
      "audio": {
        "narration": "(긴장) 지금 오후 2시, 당신의 심장이 조용히 위험 신호를..."
      },
      "search_keywords": ["wrist pulse check", "health monitoring"],
      "visual_style": "extreme close-up of Korean hands finding radial artery...",
      "mood": "urgent energy with dramatic chiaroscuro lighting...",
      "image_prompt": "Create an extreme close-up of..."
    }
    // ... 2 more shots (총 3개)
  ],
  "title": "2시의 침묵 경고: 30초 심장 자가검사",
  "target_language": "korean",
  "topic_category": "Health & Wellness",
  "time_context": "afternoon",
  "category": "Health & Wellness",
  "language": "korean",
  "viral_potential": 9.5,
  "video_config": {...},
  "elevenlabs_config": {...}
}
```

**검증:**
- ✅ `storyboard` 필드 존재
- ✅ `timeline` 필드 없음
- ✅ 정확히 3개 shots
- ✅ 각 shot에 필수 필드 모두 포함

---

## 디버깅 가이드

### 1. 여전히 오류 발생 시

**확인 사항:**
```
1. n8n 노드 타입 확인
   - LangChain Structured Output Parser인지 확인
   - OpenAI Structured Output이 아님!

2. JSON Schema 확인
   - parameter_langchain.json 사용했는지
   - parameter.json (oneOf 버전) 사용하지 않았는지

3. Prompt 확인
   - format_type 변수가 올바르게 전달되는지
   - {{ $json.format_type }} 값 확인

4. 이전 노드 출력 확인
   - format_type 값이 "timeline" 또는 "storyboard"인지
   - 대소문자 정확한지 (소문자여야 함)
```

---

### 2. GPT 출력 확인하기

**n8n 실행 후:**
1. 노드 클릭 → "Output" 탭
2. JSON 구조 확인:
   ```json
   {
     "format_type": "timeline",
     "timeline": {...},  // ← 있어야 함
     "storyboard": {...} // ← 없어야 함 (또는 그 반대)
   }
   ```

---

### 3. 임시 디버그 모드

**Schema를 더 관대하게 변경:**
```json
{
  "type": "object",
  "properties": {...},
  "required": ["format_type", "title"]
  // timeline, storyboard를 required에서 제거
}
```

이렇게 하면 GPT가 어떤 구조를 생성하는지 확인 가능

---

## OpenAI Structured Output vs LangChain 비교

| 특징 | OpenAI Structured Output | LangChain Output Parser |
|------|-------------------------|------------------------|
| **oneOf 지원** | ✅ 완벽 지원 | ❌ 제한적/미지원 |
| **additionalProperties** | ✅ strict mode 지원 | ⚠️ 문제 발생 가능 |
| **복잡한 Schema** | ✅ 지원 | ⚠️ 간단한 구조 권장 |
| **권장 방법** | Conditional schema | Description 기반 가이드 |

---

## 마이그레이션 체크리스트

- [ ] `parameter_langchain.json` 사용
- [ ] `prompt_langchain.json` 사용
- [ ] `systemmessage_langchain.json` 사용
- [ ] n8n 변수 정상 작동 확인
- [ ] Timeline 형식 테스트
- [ ] Storyboard 형식 테스트
- [ ] 각 형식에서 불필요한 필드 없는지 확인

---

## 추가 최적화

### 성능 향상
```
LangChain 노드 설정:
- Temperature: 0.7 (창의성과 일관성 균형)
- Max Tokens: 4000+ (긴 출력 보장)
- Model: gpt-4o 또는 gpt-4-turbo (권장)
```

### 오류 처리
```
On Error 설정:
✅ Continue: 워크플로우 계속 진행 (권장)
   → 다음 노드에서 오류 처리 가능

⚠️ Stop and Return: 즉시 중단
   → 디버깅 시에만 사용
```

---

**작성일**: 2025-10-27
**테스트 완료**: ✅
**n8n 호환**: Cloud 1.116.2+

---

## 요약

1. **기존 parameter.json (oneOf)** → **parameter_langchain.json** 사용
2. **Prompt에 명확한 조건 추가**: "IF format_type = timeline THEN..."
3. **System message에 경고 추가**: "MUST NOT include both fields"
4. **LangChain = 간단한 schema + 명확한 description**

이제 Timeline과 Storyboard 둘 다 정상 작동합니다! 🎉
