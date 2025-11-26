# N8N + GPT 비디오 스토리보드 자동 생성 가이드

> 참고: N8N 템플릿 #4846 "Generate AI Videos with Google Veo3" 패턴 기반

---

## 1. 워크플로우 개요

```
[Trigger] → [Google Sheets] → [OpenAI GPT] → [Code: JSON 파싱] → [HTTP Request] → [Wait/Poll] → [결과 기록]
```

### 핵심 노드 구성

| 순서 | 노드 | 역할 |
|------|------|------|
| 1 | Manual/Schedule Trigger | 워크플로우 시작 |
| 2 | Google Sheets | 주제/입력 데이터 읽기 |
| 3 | OpenAI | GPT로 스토리보드 JSON 생성 |
| 4 | Code | JSON 파싱 (마크다운 제거) |
| 5 | HTTP Request | Short Video Maker API 호출 |
| 6 | Wait + HTTP Request | 상태 폴링 (선택) |
| 7 | Google Sheets | 결과 기록 |

---

## 2. OpenAI 노드 설정

### 2.1 기본 설정

| 필드 | 값 |
|------|-----|
| **Resource** | Chat |
| **Operation** | Complete |
| **Model** | gpt-4o (권장) 또는 gpt-4 |

### 2.2 Options 설정

| 옵션 | 값 | 설명 |
|------|-----|------|
| **Maximum Number of Tokens** | 2000 | JSON 전체 출력 가능하도록 |
| **Sampling Temperature** | 0.7 | 창의성과 일관성 균형 |
| **Frequency Penalty** | 0 | 기본값 |
| **Presence Penalty** | 0 | 기본값 |

### 2.3 Messages 설정

**Message 1 (System)**
- Role: `system`
- Content: 아래 System Prompt 복사

**Message 2 (User)**
- Role: `user`
- Content: `주제: {{ $json.topic }}`

---

## 3. System Prompt (복사용)

### 3.1 Consistent Shorts용 (캐릭터 일관성 + VEO3)

```text
당신은 YouTube Shorts 비디오 스토리보드 전문가입니다.
사용자의 주제를 받아서 Short Video Maker API에 전송할 JSON을 생성합니다.

## 출력 규칙

1. 반드시 유효한 JSON만 출력하세요. 설명이나 마크다운 코드블록 없이 순수 JSON만 출력합니다.
2. scenes 배열에 3-5개의 장면을 포함하세요.
3. 각 장면의 text는 나레이션으로, 한국어 15-30자가 적당합니다.
4. scenePrompt는 영어로 작성하며, 시각적으로 흥미로운 장면을 묘사합니다.
5. character.description은 영어로 상세히 작성하여 모든 장면에서 캐릭터 일관성을 유지합니다.

## 출력 JSON 형식 (이 형식을 정확히 따르세요)

{
  "scenes": [
    {
      "text": "한국어 나레이션 텍스트",
      "scenePrompt": "English visual description for this scene"
    }
  ],
  "config": {
    "orientation": "portrait",
    "voice": "af_heart",
    "generateVideos": true
  },
  "character": {
    "description": "Detailed character description in English - include colors, size, features, clothing, distinctive traits",
    "style": "cinematic",
    "mood": "friendly"
  },
  "youtubeUpload": {
    "enabled": true,
    "channelName": "ATT",
    "title": "매력적인 영상 제목",
    "description": "영상에 대한 설명",
    "tags": ["shorts", "AI", "관련태그"],
    "privacyStatus": "public"
  }
}

## 중요 사항 (반드시 지키세요!)

- generateVideos: 반드시 true로 설정 (VEO3 비디오 생성)
- privacyStatus: 반드시 "public"으로 설정 (YouTube 공개 업로드)
- character.description: 캐릭터의 색상, 크기, 특징, 의상을 영어로 상세히 작성
- scenePrompt: 각 장면에서 "the same [character]" 표현 사용하여 일관성 유지
- title: 호기심을 유발하는 매력적인 제목 작성
```

### 3.2 PEXELS용 (스톡 비디오)

```text
당신은 YouTube Shorts 비디오 스토리보드 전문가입니다.
PEXELS 스톡 비디오 검색용 JSON을 생성합니다.

## 출력 규칙

1. 반드시 유효한 JSON만 출력하세요. 마크다운 코드블록 없이 순수 JSON만.
2. scenes 배열에 3-5개의 장면을 포함하세요.
3. searchTerms는 영어로 3-5개 키워드를 배열로 작성합니다.
4. PEXELS에서 검색 가능한 구체적인 키워드를 사용하세요.

## 출력 JSON 형식

{
  "scenes": [
    {
      "text": "한국어 나레이션 텍스트",
      "searchTerms": ["keyword1", "keyword2", "keyword3"]
    }
  ],
  "config": {
    "orientation": "portrait",
    "voice": "am_adam"
  },
  "youtubeUpload": {
    "enabled": true,
    "channelName": "ATT",
    "title": "영상 제목",
    "description": "영상 설명",
    "tags": ["shorts", "태그"],
    "privacyStatus": "public"
  }
}

## 중요 사항

- privacyStatus: 반드시 "public"
- searchTerms: 추상적 개념 대신 구체적인 사물/장면 키워드 사용
  - 좋은 예: ["sunset", "ocean", "beach", "waves"]
  - 나쁜 예: ["happiness", "emotion", "feeling"]
```

### 3.3 VEO3용 (캐릭터 일관성 없음)

```text
당신은 YouTube Shorts 비디오 스토리보드 전문가입니다.
VEO3 비디오 생성용 JSON을 생성합니다.

## 출력 규칙

1. 반드시 유효한 JSON만 출력하세요.
2. scenes 배열에 3-5개의 장면을 포함하세요.
3. imageData.prompt는 영어로 상세한 시각적 묘사를 작성합니다.

## 출력 JSON 형식

{
  "scenes": [
    {
      "text": "한국어 나레이션 텍스트",
      "videoPrompt": "Motion description (optional)",
      "imageData": {
        "prompt": "Detailed visual description in English",
        "style": "cinematic",
        "mood": "dynamic"
      }
    }
  ],
  "config": {
    "orientation": "portrait",
    "voice": "am_adam"
  },
  "youtubeUpload": {
    "enabled": true,
    "channelName": "ATT",
    "title": "영상 제목",
    "description": "영상 설명",
    "tags": ["shorts", "태그"],
    "privacyStatus": "public"
  }
}

## 중요 사항

- privacyStatus: 반드시 "public"
- 각 장면은 독립적 (캐릭터 일관성 없음)
- imageData.prompt: 조명, 분위기, 카메라 앵글 포함
```

---

## 4. Code 노드 (JSON 파싱)

GPT가 가끔 마크다운 코드블록으로 감싸서 출력할 수 있습니다.
OpenAI 노드 다음에 Code 노드를 추가하세요:

```javascript
// Code 노드 - JavaScript
const content = $input.first().json.message.content;

// 마크다운 코드블록 제거
let jsonString = content
  .replace(/```json\n?/g, '')
  .replace(/```\n?/g, '')
  .trim();

// JSON 파싱
try {
  const parsed = JSON.parse(jsonString);
  return { json: parsed };
} catch (error) {
  // 파싱 실패 시 원본 반환
  return { json: { error: 'JSON 파싱 실패', raw: content } };
}
```

---

## 5. HTTP Request 노드 설정

### 5.1 API 호출

| 필드 | 값 |
|------|-----|
| **Method** | POST |
| **URL** | `https://short-video-maker-550996044521.us-central1.run.app/api/video/consistent-shorts` |
| **Authentication** | None |
| **Send Headers** | Off |
| **Send Body** | On |
| **Body Content Type** | JSON |
| **Specify Body** | Using JSON |
| **JSON** | `={{ $json }}` |

### 5.2 상태 폴링 (선택)

API 응답에서 `videoId`를 받은 후 상태 확인:

| 필드 | 값 |
|------|-----|
| **Method** | GET |
| **URL** | `https://short-video-maker-550996044521.us-central1.run.app/api/video/consistent-shorts/{{ $json.videoId }}/status` |

---

## 6. 전체 워크플로우 JSON

```json
{
  "name": "Short Video Maker - GPT Storyboard Generator",
  "nodes": [
    {
      "parameters": {},
      "name": "Manual Trigger",
      "type": "n8n-nodes-base.manualTrigger",
      "position": [240, 300]
    },
    {
      "parameters": {
        "values": {
          "string": [
            {
              "name": "topic",
              "value": "우주에서 피자 배달하는 외계인"
            }
          ]
        }
      },
      "name": "Set Topic",
      "type": "n8n-nodes-base.set",
      "position": [440, 300]
    },
    {
      "parameters": {
        "resource": "chat",
        "model": "gpt-4o",
        "prompt": {
          "messages": [
            {
              "role": "system",
              "content": "당신은 YouTube Shorts 비디오 스토리보드 전문가입니다.\n사용자의 주제를 받아서 Short Video Maker API에 전송할 JSON을 생성합니다.\n\n## 출력 규칙\n\n1. 반드시 유효한 JSON만 출력하세요. 마크다운 코드블록 없이 순수 JSON만.\n2. scenes 배열에 3-5개의 장면을 포함하세요.\n3. text는 한국어 나레이션, scenePrompt는 영어 시각 묘사.\n4. character.description은 영어로 상세히.\n\n## JSON 형식\n\n{\n  \"scenes\": [{\"text\": \"나레이션\", \"scenePrompt\": \"English description\"}],\n  \"config\": {\"orientation\": \"portrait\", \"voice\": \"af_heart\", \"generateVideos\": true},\n  \"character\": {\"description\": \"Detailed English description\", \"style\": \"cinematic\", \"mood\": \"friendly\"},\n  \"youtubeUpload\": {\"enabled\": true, \"channelName\": \"ATT\", \"title\": \"제목\", \"description\": \"설명\", \"tags\": [\"shorts\"], \"privacyStatus\": \"public\"}\n}\n\n## 중요: generateVideos=true, privacyStatus=\"public\" 필수!"
            },
            {
              "role": "user",
              "content": "주제: {{ $json.topic }}"
            }
          ]
        },
        "options": {
          "maxTokens": 2000,
          "temperature": 0.7
        }
      },
      "name": "OpenAI GPT",
      "type": "n8n-nodes-base.openAi",
      "position": [640, 300],
      "credentials": {
        "openAiApi": {
          "id": "YOUR_CREDENTIAL_ID",
          "name": "OpenAI account"
        }
      }
    },
    {
      "parameters": {
        "jsCode": "const content = $input.first().json.message.content;\nlet jsonString = content.replace(/```json\\n?/g, '').replace(/```\\n?/g, '').trim();\nreturn { json: JSON.parse(jsonString) };"
      },
      "name": "Parse JSON",
      "type": "n8n-nodes-base.code",
      "position": [840, 300]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://short-video-maker-550996044521.us-central1.run.app/api/video/consistent-shorts",
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ $json }}"
      },
      "name": "Call Video API",
      "type": "n8n-nodes-base.httpRequest",
      "position": [1040, 300]
    }
  ],
  "connections": {
    "Manual Trigger": {
      "main": [[{"node": "Set Topic", "type": "main", "index": 0}]]
    },
    "Set Topic": {
      "main": [[{"node": "OpenAI GPT", "type": "main", "index": 0}]]
    },
    "OpenAI GPT": {
      "main": [[{"node": "Parse JSON", "type": "main", "index": 0}]]
    },
    "Parse JSON": {
      "main": [[{"node": "Call Video API", "type": "main", "index": 0}]]
    }
  }
}
```

---

## 7. Google Sheets 연동

### 7.1 입력 시트 구조

| TOPIC | STYLE | STATUS | VIDEO_ID | YOUTUBE_URL |
|-------|-------|--------|----------|-------------|
| 고양이 로봇 카페 | cheerful | | | |
| 우주 피자 배달 | dramatic | | | |

### 7.2 Google Sheets 노드 설정

**읽기 (Get Rows)**
- Operation: Get Many
- Filter: STATUS = empty

**쓰기 (Update Row)**
- Operation: Update
- Column: VIDEO_ID, YOUTUBE_URL, STATUS

---

## 8. Voice 옵션

| Voice ID | 특징 | 추천 용도 |
|----------|------|----------|
| `am_adam` | 남성, 차분한 | 설명, 정보 전달 |
| `af_heart` | 여성, 따뜻한 | 감성, 스토리텔링 |
| `am_michael` | 남성, 에너지틱 | 엔터테인먼트, 홍보 |

---

## 9. 트러블슈팅

### 문제: JSON 파싱 에러
```
SyntaxError: Unexpected token
```
**원인**: GPT가 마크다운 코드블록이나 설명 텍스트 포함
**해결**: Code 노드로 정리 + System Prompt에서 "순수 JSON만" 강조

### 문제: VEO3 비디오 생성 안됨
**원인**: `generateVideos: false` (기본값)
**해결**: System Prompt에서 `generateVideos: true` 반복 강조

### 문제: YouTube 비공개로 업로드됨
**원인**: `privacyStatus` 누락 또는 기본값 `private`
**해결**: System Prompt에서 `"privacyStatus": "public"` 명시

### 문제: 캐릭터 일관성 떨어짐
**원인**: `character.description`이 너무 간단함
**해결**: 색상, 크기, 의상, 특징을 구체적으로 영어로 작성
```
Bad:  "A robot"
Good: "A small blue robot with round body, large expressive LED eyes, silver metallic arms, wearing a red bow tie"
```

---

## 10. API 엔드포인트별 URL

| 엔드포인트 | URL |
|-----------|-----|
| Consistent Shorts (추천) | `/api/video/consistent-shorts` |
| PEXELS | `/api/video/pexels` |
| VEO3 | `/api/video/veo3` |
| Nano Banana | `/api/video/nano-banana` |

Base URL: `https://short-video-maker-550996044521.us-central1.run.app`

---

## 요약 체크리스트

- [ ] OpenAI 노드: gpt-4o, maxTokens=2000
- [ ] System Prompt: JSON만 출력하도록 명시
- [ ] Code 노드: 마크다운 제거 및 JSON 파싱
- [ ] **generateVideos: true** (VEO3 사용)
- [ ] **privacyStatus: "public"** (공개 업로드)
- [ ] character.description: 영어로 상세히
- [ ] HTTP Request: POST, JSON body
