# 🎭 Consistent Shorts API 완전 가이드

## 📋 목차
1. [개요](#-개요)
2. [핵심 기능](#-핵심-기능)
3. [API 엔드포인트](#-api-엔드포인트)
4. [사용 예시](#-사용-예시)
5. [n8n 워크플로우](#-n8n-워크플로우)
6. [기술 상세](#-기술-상세)

---

## 🎯 개요

**Consistent Shorts API**는 **Image_out.ipynb의 Chat Mode**에서 영감을 받아 만든 새로운 엔드포인트입니다.

### 기존 문제점 ❌

기존 Nano Banana 엔드포인트:
```
Scene 1: 금발 여자 우주비행사 생성
Scene 2: 갈색머리 남자 우주비행사 생성 (다른 사람!)
Scene 3: 로봇 우주비행사 생성 (또 다른 캐릭터!)
```
→ **캐릭터가 매번 바뀜!** 😱

### 새로운 해결책 ✅

Consistent Shorts API:
```
Scene 1: 금발 여자 우주비행사 생성
Scene 2: 같은 금발 여자 우주비행사 + 우주선 안 (Scene 1 참조)
Scene 3: 같은 금발 여자 우주비행사 + 지구 배경 (Scene 1, 2 참조)
```
→ **캐릭터 일관성 완벽 유지!** 🎉

---

## ⭐ 핵심 기능

### 1. **캐릭터 일관성 (Character Consistency)**
- ipynb의 Chat Mode처럼 동작
- 이전 이미지들을 자동 참조 (최대 3개)
- 같은 캐릭터가 모든 Scene에 등장

### 2. **Reference Images 자동 관리**
```typescript
Scene 1: referenceImages = [] (첫 생성)
Scene 2: referenceImages = [Scene1] (1개 참조)
Scene 3: referenceImages = [Scene1, Scene2] (2개 참조)
Scene 4: referenceImages = [Scene2, Scene3, Scene4] (최대 3개)
```

### 3. **VEO3 I2V 옵션**
- `generateVideos: true` → VEO3로 각 이미지를 비디오로 변환
- `generateVideos: false` → 정적 이미지로 비디오 생성

### 4. **Reference Set 생성**
- 캐릭터의 여러 각도/표정 이미지 세트 생성
- VEO3 I2V에서 더 나은 일관성 보장

---

## 🌐 API 엔드포인트

### **1️⃣ 일관성 있는 숏츠 생성**

```http
POST /api/video/consistent-shorts
```

#### 요청 예시

```json
{
  "character": {
    "description": "A young female astronaut with blonde hair, blue eyes, wearing a white NASA space suit with American flag patch",
    "style": "cinematic",
    "mood": "adventurous"
  },
  "scenes": [
    {
      "text": "우주에서 떠다니는 외로운 우주비행사",
      "scenePrompt": "Floating alone in deep space with Earth visible in the background, looking contemplative",
      "duration": 3
    },
    {
      "text": "별들 사이를 천천히 이동하는 우주비행사",
      "scenePrompt": "Moving slowly between stars, reaching out to touch a colorful nebula",
      "duration": 4
    },
    {
      "text": "우주 정거장으로 돌아오는 우주비행사",
      "scenePrompt": "Approaching the International Space Station, waving at the camera with a smile",
      "duration": 3
    }
  ],
  "config": {
    "orientation": "landscape",
    "voice": "am_adam",
    "musicVolume": "low",
    "subtitlePosition": "bottom",
    "generateVideos": true
  },
  "webhook_url": "https://your-n8n-webhook.com/callback"
}
```

#### 응답 예시

```json
{
  "videoId": "cmg0xyz123456789",
  "mode": "consistent-shorts",
  "sceneCount": 3,
  "characterDescription": "A young female astronaut with blonde hair...",
  "generateVideos": true,
  "message": "Consistent character video generation started. All scenes will feature the same character."
}
```

---

### **2️⃣ 상태 확인**

```http
GET /api/video/consistent-shorts/:videoId/status
```

#### 응답 예시

```json
{
  "status": "processing",
  "mode": "consistent-shorts",
  "progress": {
    "currentStep": "Generating consistent character images",
    "completedScenes": 2,
    "totalScenes": 3,
    "percentage": 67
  }
}
```

---

### **3️⃣ Reference Set 생성 (고급 기능)**

```http
POST /api/video/consistent-shorts/reference-set
```

#### 요청 예시

```json
{
  "character": {
    "description": "A young female astronaut with blonde hair, blue eyes, wearing a white NASA space suit",
    "style": "cinematic"
  },
  "variations": {
    "angles": ["front view", "45 degree angle", "side profile", "three-quarter view"],
    "expressions": ["neutral expression", "gentle smile", "focused expression", "determined look"],
    "compositions": ["upper body shot", "full body shot", "close-up portrait"],
    "lighting": ["soft lighting", "dramatic lighting", "natural lighting"]
  },
  "count": 12
}
```

#### 응답 예시

```json
{
  "success": true,
  "characterDescription": "A young female astronaut...",
  "totalImages": 12,
  "requestedCount": 12,
  "images": [
    {
      "filename": "ref-1-nano-banana-1234567890-1.png",
      "url": "/api/images/image/ref-1-nano-banana-1234567890-1.png",
      "prompt": "A young female astronaut..., front view, neutral expression, upper body shot, soft lighting",
      "variations": {
        "angle": "front view",
        "expression": "neutral expression",
        "composition": "upper body shot",
        "lighting": "soft lighting"
      },
      "size": 1405955
    }
  ],
  "usage": "Use these reference images to maintain consistency in Veo 3 I2V generation"
}
```

---

## 💡 사용 예시

### **예시 1: 정적 이미지 비디오 (VEO3 없음)**

```bash
curl -X POST http://localhost:3124/api/video/consistent-shorts \
  -H "Content-Type: application/json" \
  -d '{
    "character": {
      "description": "A cute orange tabby cat wearing a tiny blue astronaut helmet",
      "style": "whimsical",
      "mood": "playful"
    },
    "scenes": [
      {
        "text": "고양이가 우주복을 입고 있습니다",
        "scenePrompt": "Cat sitting proudly in astronaut suit"
      },
      {
        "text": "고양이가 우주선 안에 있습니다",
        "scenePrompt": "Same cat inside a spaceship cockpit"
      },
      {
        "text": "고양이가 달 위를 걷습니다",
        "scenePrompt": "Same cat walking on the moon surface"
      }
    ],
    "config": {
      "orientation": "portrait",
      "generateVideos": false
    }
  }'
```

**결과**: 같은 고양이가 3개 장면에 등장하는 정적 이미지 비디오

---

### **예시 2: VEO3 I2V 변환 (고품질)**

```bash
curl -X POST http://localhost:3124/api/video/consistent-shorts \
  -H "Content-Type: application/json" \
  -d '{
    "character": {
      "description": "A young male scientist with messy brown hair and round glasses, wearing a white lab coat",
      "style": "realistic",
      "mood": "curious"
    },
    "scenes": [
      {
        "text": "과학자가 실험실에서 실험을 합니다",
        "scenePrompt": "Scientist mixing colorful chemicals in test tubes",
        "duration": 5
      },
      {
        "text": "과학자가 놀라운 발견을 합니다",
        "scenePrompt": "Same scientist looking amazed at a glowing reaction",
        "duration": 4
      },
      {
        "text": "과학자가 성공을 축하합니다",
        "scenePrompt": "Same scientist celebrating with fist pump and big smile",
        "duration": 3
      }
    ],
    "config": {
      "orientation": "landscape",
      "voice": "am_adam",
      "generateVideos": true
    },
    "webhook_url": "https://your-webhook.com/callback"
  }'
```

**결과**: 같은 과학자가 움직이는 고품질 VEO3 비디오

---

## 🔄 n8n 워크플로우

### **워크플로우 예시: 자동 스토리 생성**

```json
{
  "name": "Consistent Character Story Generator",
  "nodes": [
    {
      "name": "Schedule Trigger",
      "type": "n8n-nodes-base.scheduleTrigger",
      "parameters": {
        "rule": {
          "interval": [{ "field": "hours", "hoursInterval": 6 }]
        }
      }
    },
    {
      "name": "Generate Story Idea",
      "type": "n8n-nodes-base.code",
      "parameters": {
        "jsCode": "const characters = [\n  'A brave young knight with silver armor',\n  'A wise old wizard with a long white beard',\n  'A curious space explorer'\n];\n\nconst character = characters[Math.floor(Math.random() * characters.length)];\n\nreturn [{\n  json: {\n    character: {\n      description: character,\n      style: 'cinematic',\n      mood: 'epic'\n    }\n  }\n}];"
      }
    },
    {
      "name": "Create Consistent Short",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "method": "POST",
        "url": "http://localhost:3124/api/video/consistent-shorts",
        "sendBody": true,
        "bodyParameters": {
          "character": "={{ $json.character }}",
          "scenes": [
            {
              "text": "캐릭터가 등장합니다",
              "scenePrompt": "Character introduction, full body shot"
            },
            {
              "text": "캐릭터가 모험을 시작합니다",
              "scenePrompt": "Character embarking on an adventure"
            },
            {
              "text": "캐릭터가 승리합니다",
              "scenePrompt": "Character celebrating victory"
            }
          ],
          "config": {
            "orientation": "portrait",
            "generateVideos": true
          },
          "webhook_url": "={{ $node.Webhook.webhookUrl }}"
        }
      }
    },
    {
      "name": "Wait for Completion",
      "type": "n8n-nodes-base.wait",
      "parameters": {
        "resume": "webhook",
        "amount": 10,
        "unit": "minutes"
      }
    },
    {
      "name": "Upload to YouTube",
      "type": "n8n-nodes-base.youtube",
      "parameters": {
        "operation": "upload",
        "title": "Consistent Character Story - {{ $now }}",
        "videoFile": "={{ $binary.data }}"
      }
    }
  ]
}
```

---

## 🔬 기술 상세

### **동작 원리**

#### **1. Reference Images 자동 관리**

```typescript
const previousImages: Array<{ data: Buffer; mimeType: string }> = [];

for (let i = 0; i < scenes.length; i++) {
  // ⭐ 이전 이미지들을 참조로 전달 (최대 3개)
  const referenceImages = i > 0
    ? previousImages.slice(-3).map(img => ({
        data: img.data,
        mimeType: img.mimeType
      }))
    : undefined;

  const result = await generateImages({
    prompt: enhancedPrompt,
    referenceImages: referenceImages // ⭐ Chat Mode!
  });

  // 생성된 이미지를 다음 Scene 참조용으로 저장
  previousImages.push({
    data: result.images[0].data,
    mimeType: "image/png"
  });
}
```

#### **2. Nano Banana API 호출**

```typescript
// Gemini API 요청 구조
const request = {
  contents: [
    {
      parts: [
        { text: prompt }, // 텍스트 프롬프트
        // ⭐ 참조 이미지들 (최대 3개)
        { inlineData: { mimeType: "image/png", data: ref1Base64 } },
        { inlineData: { mimeType: "image/png", data: ref2Base64 } },
        { inlineData: { mimeType: "image/png", data: ref3Base64 } }
      ]
    }
  ],
  generationConfig: {
    temperature: 0.7,
    topK: 40,
    topP: 0.95
  }
};
```

#### **3. VEO3 I2V 변환 (선택)**

```typescript
if (generateVideos) {
  for (const imageData of imageDataList) {
    // 이미지 → 비디오 변환
    const video = await veoAPI.findVideo(
      [videoPrompt],
      duration,
      [],
      orientation,
      {
        data: imageData.imageBuffer.toString('base64'),
        mimeType: "image/png"
      } // ⭐ I2V input
    );
  }
}
```

---

## 📊 비교표

| 기능 | 기존 Nano Banana | **Consistent Shorts** ⭐ |
|------|------------------|--------------------------|
| 캐릭터 일관성 | ❌ 매번 다른 캐릭터 | ✅ 같은 캐릭터 유지 |
| Reference Images | ❌ 사용 안 함 | ✅ 자동 참조 (최대 3개) |
| Chat Mode 방식 | ❌ 독립 생성 | ✅ ipynb처럼 동작 |
| VEO3 I2V | ✅ 지원 | ✅ 지원 |
| 스토리텔링 적합성 | ⚠️ 부적합 | ✅ 완벽 |
| n8n 연동 | ✅ 지원 | ✅ 지원 |

---

## 🎓 Best Practices

### ✅ **DO**

1. **명확한 캐릭터 설명**:
   ```json
   {
     "description": "A young female astronaut with blonde hair, blue eyes, wearing a white NASA space suit with American flag patch, about 25 years old"
   }
   ```

2. **일관된 스타일 유지**:
   ```json
   {
     "style": "cinematic",
     "mood": "adventurous"
   }
   ```

3. **Scene 프롬프트에 캐릭터 언급 자제**:
   ```json
   // ❌ 나쁜 예
   { "scenePrompt": "blonde female astronaut floating in space" }

   // ✅ 좋은 예
   { "scenePrompt": "floating in deep space with Earth in background" }
   ```
   → 캐릭터 정보는 자동으로 포함됨!

### ❌ **DON'T**

1. **Scene마다 다른 캐릭터 설명 추가**:
   ```json
   // ❌ 이러면 캐릭터가 바뀔 수 있음
   { "scenePrompt": "a different person with red hair..." }
   ```

2. **Reference Set 없이 VEO3 I2V만 사용**:
   → Reference Set을 먼저 생성하면 VEO3에서도 일관성 향상

---

## 🚀 다음 단계

1. **Reference Set 생성** → 더 나은 일관성
2. **VEO3 I2V 활성화** → 고품질 움직이는 비디오
3. **n8n 자동화** → 스케줄링된 콘텐츠 생성
4. **YouTube 자동 업로드** → 완전 자동화 파이프라인

---

## 📞 문제 해결

### Q: 캐릭터가 약간 바뀌어요
A: Reference Set을 먼저 생성하세요. `/reference-set` 엔드포인트 사용.

### Q: VEO3가 너무 느려요
A: `generateVideos: false`로 설정하면 정적 이미지로 빠르게 생성됩니다.

### Q: Scene이 몇 개까지 가능한가요?
A: 제한 없지만, 3-5개가 최적입니다 (Reference Images 최대 3개).

---

**완성! 이제 ipynb의 Chat Mode처럼 캐릭터 일관성을 유지하는 숏츠를 만들 수 있습니다! 🎉**
