# 2025-09-26 Batch Image-to-Video API Reference (N8N Integration)

## 개요
여러 이미지를 한 번에 비디오로 변환하는 통합 API입니다. Veo 2.0/3.0과 Pexels 폴백을 지원하며, TTS, 자막, FFmpeg 합성까지 한 번에 처리합니다.

## API 엔드포인트

### 📡 `/api/create-video-from-images`
**Method:** `POST`  
**Content-Type:** `application/json`

## 🔧 필수 파라미터

### 1. **images** (Required)
```json
{
  "images": [
    {
      "imageBase64": "base64_encoded_image_data",
      "mimeType": "image/png|image/jpeg",
      "prompt": "Video generation prompt for this image"
    }
  ]
}
```

**설명:**
- `imageBase64`: Base64로 인코딩된 이미지 데이터 (필수)
- `mimeType`: 이미지 MIME 타입 (기본값: "image/png")
- `prompt`: 이 이미지용 Veo 비디오 생성 프롬프트 (필수)

### 2. **narrativeTexts** (Required)
```json
{
  "narrativeTexts": [
    "First scene narration text for TTS",
    "Second scene narration text for TTS",
    "Third scene narration text for TTS"
  ]
}
```

**설명:**
- TTS로 변환될 각 씬의 내레이션 텍스트
- `images` 배열과 길이가 같아야 함

### 3. **config** (Optional)
```json
{
  "config": {
    "orientation": "landscape|portrait",
    "voice": "voice_id",
    "musicVolume": "low|medium|high|muted",
    "subtitlePosition": "top|center|bottom",
    "webhook_url": "https://your-webhook-url.com"
  }
}
```

## 🎯 Veo 2.0/3.0 파라미터

### **Image-to-Video 생성 파라미터:**
- **Model**: `veo-2.0-generate-001` (자동 설정)
- **Duration**: TTS 오디오 길이에 자동 맞춤 (5-10초)
- **Aspect Ratio**: config.orientation 기반 자동 설정
  - `landscape`: `16:9`
  - `portrait`: `9:16`
- **Image Input**: Base64 이미지 데이터 자동 전달
- **Prompt Template**: 자동 생성
  ```
  "Create a high-quality {duration}-second video featuring {user_prompt}. 
   The video should be in cinematic {orientation} format, with smooth 
   camera movements and professional lighting. Include rich details, 
   vibrant colors, and engaging composition. Make it suitable for 
   social media content."
  ```

### **Veo API 호출 시퀀스:**
1. **이미지 업로드**: Base64 → Gemini API
2. **비디오 생성**: 프롬프트 + 이미지 → Veo 2.0
3. **폴백 처리**: Veo 실패 시 → Pexels API

## 📺 Pexels 폴백 파라미터

### **검색 전략:**
```javascript
searchTerms = image.prompt.split(" ").slice(0, 5)  // 첫 5단어 추출
```

### **Pexels API 파라미터:**
- **Search Terms**: 프롬프트에서 추출한 키워드들
- **Orientation**: `landscape|portrait` (config 기반)
- **Min Duration**: TTS 오디오 길이 + 여유분
- **Resolution**: HD (1920x1080) 우선
- **Fallback Order**: 키워드별 순차 검색

### **폴백 시퀀스:**
1. 첫 번째 키워드로 검색
2. 실패 시 두 번째 키워드로 검색
3. 모든 키워드 시도 후 실패 시 에러

## 🎵 Voice & TTS 파라미터

### **지원되는 음성 (VoiceEnum):**
```javascript
// Female Voices
"af_heart", "af_alloy", "af_aoede", "af_bella", "af_jessica", 
"af_kore", "af_nicole", "af_nova", "af_river", "af_sarah", "af_sky",
"bf_emma", "bf_isabella", "bf_alice", "bf_lily",

// Male Voices  
"am_adam", "am_echo", "am_eric", "am_fenrir", "am_liam", 
"am_michael", "am_onyx", "am_puck", "am_santa",
"bm_george", "bm_lewis", "bm_daniel", "bm_fable"
```

### **TTS Provider 순서:**
1. **ElevenLabs** (Primary)
2. **Google TTS** (Fallback)
3. **Kokoro** (Secondary Fallback)

## 📋 설정 옵션

### **Orientation:**
- `"landscape"`: 16:9 가로형 (기본값)
- `"portrait"`: 9:16 세로형

### **Music Volume:**
- `"muted"`: 음악 없음
- `"low"`: 낮은 볼륨 (기본값)
- `"medium"`: 중간 볼륨
- `"high"`: 높은 볼륨

### **Subtitle Position:**
- `"top"`: 상단 자막
- `"center"`: 중앙 자막
- `"bottom"`: 하단 자막 (기본값)

## 📤 N8N 요청 예시

```json
{
  "images": [
    {
      "imageBase64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAGA7AhkiAAAAABJRU5ErkJggg==",
      "mimeType": "image/png",
      "prompt": "A peaceful forest at dawn with morning light filtering through trees"
    },
    {
      "imageBase64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAGA7AhkiAAAAABJRU5ErkJggg==",
      "mimeType": "image/png", 
      "prompt": "A vibrant forest at noon with bright sunlight and shadows"
    },
    {
      "imageBase64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAGA7AhkiAAAAABJRU5ErkJggg==",
      "mimeType": "image/png",
      "prompt": "A serene forest at dusk with golden hour lighting"
    }
  ],
  "narrativeTexts": [
    "The forest awakens as the first rays of sunlight pierce through the canopy, creating a magical morning atmosphere.",
    "At midday, the forest is alive with activity as bright sunlight illuminates the green leaves and creates dancing shadows.",
    "As evening approaches, the forest takes on a warm golden glow, creating a peaceful and contemplative mood."
  ],
  "config": {
    "orientation": "landscape",
    "voice": "am_adam",
    "musicVolume": "low",
    "subtitlePosition": "bottom"
  },
  "webhook_url": "https://your-n8n-webhook-url.com/webhook/video-complete"
}
```

## 📨 응답 형태

### **성공 응답:**
```json
{
  "videoId": "cmg0tb5th0000qidl48lyd7k4"
}
```

### **에러 응답:**
```json
{
  "error": "images array is required and must not be empty"
}
```

## 📊 상태 확인

### **상태 조회 API:**
```
GET /api/short-video/{videoId}/status
```

### **상태 응답:**
```json
{
  "status": "processing|ready|failed",
  "videoId": "cmg0tb5th0000qidl48lyd7k4",
  "videoPath": "/path/to/video.mp4",
  "timestamp": "2025-09-26T12:29:52.950Z",
  "processing": false,
  "fileSize": 10112057,
  "createdAt": "2025-09-26T12:24:03.534Z",
  "modifiedAt": "2025-09-26T12:24:07.537Z"
}
```

## 📥 비디오 다운로드

### **다운로드 URL:**
```
GET /api/short-video/{videoId}
```

## 🔄 처리 워크플로우

1. **이미지 검증** → 모든 필수 파라미터 확인
2. **TTS 생성** → 각 씬별 음성 생성 (ElevenLabs → Google → Kokoro)
3. **자막 생성** → Whisper로 타이밍 정확한 자막 생성
4. **비디오 생성** → Veo 2.0 시도 → 실패시 Pexels 폴백
5. **개별 합성** → 각 씬별 비디오+오디오 합성
6. **최종 합성** → FFmpeg로 모든 씬 연결
7. **자막 동기화** → 전체 비디오에 타이밍 맞춘 자막 적용

## ⚠️ 주의사항

### **환경변수:**
```bash
VIDEO_SOURCE=ffmpeg  # FFmpeg 모드 필수
```

### **처리 시간:**
- 씬당 약 2-3분 (TTS + Whisper + 비디오 생성)
- 3씬 기준 총 10분 내외

### **파일 크기 제한:**
- 이미지: Base64로 인코딩된 크기 고려
- 최종 비디오: 약 5-15MB (길이에 따라)

### **Veo API 제한:**
- 503 Service Unavailable 시 자동 Pexels 폴백
- 일일 사용량 제한 가능성

## 🔗 관련 API

- **단일 이미지**: `POST /api/create-video-from-image`
- **텍스트만**: `POST /api/short-video`
- **N8N 호환**: `POST /api/create-video`