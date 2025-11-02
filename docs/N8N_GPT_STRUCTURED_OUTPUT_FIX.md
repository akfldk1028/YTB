# N8N GPT Structured Output 오류 수정 완료

## 문제점 분석

### 증상
- **Storyboard 형식**: 정상 작동 ✅
- **Timeline 형식**: "Model output doesn't fit required format" 오류 발생 ❌

### 근본 원인

#### 1. **parameter.json (JSON Schema) 문제**
```json
// ❌ 이전 (잘못된 구조)
{
  "properties": {
    "format_type": {...},
    "timeline": {...},
    "storyboard": {...}
  },
  "required": ["format_type", "title", ...]
  // timeline도 storyboard도 required가 아님!
}
```

**문제점:**
- `timeline`과 `storyboard` 둘 다 optional로 정의됨
- `format_type`에 따라 어느 필드가 필요한지 명시되지 않음
- GPT가 어떤 구조를 생성해야 하는지 혼란스러움

#### 2. **prompt.json 문제**
- Timeline 형식에 대한 구체적인 JSON 구조 예시 부족
- "Rich text field"라는 모호한 설명만 있음

#### 3. **systemmessage.json 문제**
- Timeline 형식의 정확한 필드 구조 설명 부족

---

## 해결 방법

### ✅ 1. parameter.json - `oneOf` 사용

```json
{
  "type": "object",
  "oneOf": [
    {
      // Timeline 형식일 때
      "properties": {
        "format_type": {"const": "timeline"},
        "timeline": {
          "type": "object",
          "properties": {
            "scenes": {
              "type": "array",
              "items": {...}
            }
          },
          "required": ["scenes"]
        },
        ...
      },
      "required": ["format_type", "timeline", "title", ...],
      "additionalProperties": false
    },
    {
      // Storyboard 형식일 때
      "properties": {
        "format_type": {"const": "storyboard"},
        "storyboard": {
          "type": "array",
          "items": {...}
        },
        ...
      },
      "required": ["format_type", "storyboard", "title", ...],
      "additionalProperties": false
    }
  ]
}
```

**개선점:**
- ✅ `format_type="timeline"` → `timeline` 필드 **필수**
- ✅ `format_type="storyboard"` → `storyboard` 필드 **필수**
- ✅ `additionalProperties: false` → 불필요한 필드 차단

---

### ✅ 2. prompt.json - 명확한 구조 예시 추가

```json
FOR TIMELINE FORMAT:
CRITICAL: Must include "timeline" object with "scenes" array
Structure:
{
  "format_type": "timeline",
  "timeline": {
    "scenes": [
      {
        "id": "scene_1",
        "duration": 4,
        "text": "...",
        "search_keywords": [...],
        "visual_style": "...",
        "mood": "...",
        "image_prompt": "..."
      }
    ]
  },
  "title": "Video Title Here",
  ...
}
```

---

### ✅ 3. systemmessage.json - 필수 필드 명시

```
**Timeline Format:**
- CRITICAL: Output must have "timeline" object containing "scenes" array
- Each scene in timeline.scenes[] must have:
  * id (string): "scene_1", "scene_2", etc.
  * duration (number): exact duration in seconds
  * text (string): Rich narration...
  * search_keywords (array): 2+ ENGLISH keywords
  * visual_style (string): Complete cinematography
  * mood (string): Lighting and tone
  * image_prompt (string): Full VEO3 prompt
```

---

## N8N 노드 설정 방법

### 1. Structured Output 노드 설정

```
┌─────────────────────────────────────┐
│  Structured Output (OpenAI)         │
├─────────────────────────────────────┤
│ System Message:                     │
│ → systemmessage.json 내용 붙여넣기 │
│                                     │
│ Prompt:                             │
│ → prompt.json 내용 붙여넣기         │
│ (n8n 변수 사용: {{ $json.field }}) │
│                                     │
│ JSON Schema (Parameters):           │
│ → parameter.json 내용 붙여넣기      │
│                                     │
│ On Error:                           │
│ → Continue (또는 Stop and Return)   │
└─────────────────────────────────────┘
```

---

## 테스트 방법

### Timeline 형식 테스트
```json
// Input
{
  "format_type": "timeline",
  "selected_category": "Business Success",
  "target_language": "english",
  "target_scenes_count": 6,
  "individual_scene_durations": [4, 6, 6, 6, 6, 6]
}

// Expected Output
{
  "format_type": "timeline",
  "timeline": {
    "scenes": [
      {
        "id": "scene_1",
        "duration": 4,
        "text": "...",
        "search_keywords": ["keyword1", "keyword2"],
        "visual_style": "...",
        "mood": "...",
        "image_prompt": "..."
      },
      // ... 5 more scenes
    ]
  },
  "title": "Video Title",
  "target_language": "english",
  "topic_category": "Business Success",
  "video_config": {...},
  "elevenlabs_config": {...}
}
```

---

## 주요 변경 사항 요약

| 파일 | 변경 내용 | 목적 |
|------|----------|------|
| **parameter.json** | `oneOf` 구조로 변경, `timeline`/`storyboard` required 명시 | GPT가 정확한 구조를 생성하도록 강제 |
| **prompt.json** | Timeline/Storyboard 구조 예시 추가 | 명확한 JSON 형식 제공 |
| **systemmessage.json** | 각 형식의 필수 필드 상세 설명 추가 | LLM이 올바른 필드를 생성하도록 지침 제공 |

---

## 결과

이제 **Timeline과 Storyboard 둘 다 정상 작동**합니다! 🎉

- ✅ Timeline: `timeline.scenes[]` 구조 명확히 정의됨
- ✅ Storyboard: `storyboard[]` 구조 명확히 정의됨
- ✅ JSON Schema validation 통과
- ✅ "Model output doesn't fit required format" 오류 해결

---

## 추가 팁

### On Error 설정
```
n8n 노드 설정 → On Error
- Continue: 오류 발생 시 다음 노드로 계속 진행
- Stop and Return: 오류 발생 시 워크플로우 중단
```

### 디버깅 방법
1. n8n 노드 실행 후 "Output" 탭 확인
2. JSON Schema validation 오류 메시지 확인
3. 필요시 `additionalProperties: true`로 임시 변경하여 GPT가 어떤 구조를 생성하는지 확인

---

**작성일**: 2025-10-27
**테스트 완료**: ✅
