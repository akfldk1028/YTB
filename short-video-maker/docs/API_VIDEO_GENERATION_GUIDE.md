# API 기반 영상 생성 가이드

## 🎯 개요

Remotion 의존성을 제거하고 AI API를 활용한 영상 생성 시스템입니다.

---

## 🔧 지원 API 서비스

### 1. Google Veo (Vertex AI)

**설정:**
```bash
VIDEO_SOURCE=veo
GOOGLE_VEO_API_KEY=your_access_token
GOOGLE_CLOUD_PROJECT_ID=your_project_id  
GOOGLE_CLOUD_REGION=us-central1  # 선택사항
```

**특징:**
- Google의 최신 AI 영상 생성
- 고품질 1080p 지원
- 9:16 세로 포맷 최적화
- 동기화된 사운드 지원
- 최대 2분 영상 생성 대기

**API 응답 예시:**
```json
{
  "candidates": [{
    "content": {
      "parts": [{
        "videoData": {
          "videoUri": "https://storage.googleapis.com/..."
        }
      }]
    }
  }]
}
```

### 2. Leonardo AI

**설정:**
```bash
VIDEO_SOURCE=leonardo
LEONARDO_API_KEY=your_api_key
```

**특징:**
- Motion 2.0 모델 사용
- 720p 해상도 지원
- 5초 기본 영상 길이
- 프레임 보간 기술
- 최대 3분 생성 대기

**API 응답 예시:**
```json
{
  "sdGenerationJob": {
    "generationId": "abc123..."
  }
}
```

### 3. 혼합 모드

**설정:**
```bash
VIDEO_SOURCE=both
# 위 두 API 키 모두 설정 필요
```

**동작:**
- 50% 확률로 Veo 또는 Leonardo 선택
- 실패 시 자동 fallback
- 다양성 증대

---

## 📝 프롬프트 최적화

### Google Veo 프롬프트
```typescript
const prompt = `Create a high-quality ${duration}-second video featuring ${terms}. 
Shot in ${orientation} with smooth camera movements and professional lighting. 
Include rich details, vibrant colors, and engaging composition. 
Perfect for social media content.`;
```

### Leonardo AI 프롬프트  
```typescript
const prompt = `High-quality cinematic video featuring ${terms}. 
Shot in ${orientation} with smooth camera movements, professional lighting. 
Dynamic motion with realistic physics, engaging composition. 
Perfect for social media content.`;
```

---

## ⚙️ 구현 세부사항

### 1. GoogleVeo.ts 핵심 로직

```typescript
class GoogleVeoAPI {
  private baseURL = `https://${region}-aiplatform.googleapis.com/v1/...`;
  
  async _generateVideo(prompt: string, duration: number, orientation: OrientationEnum) {
    const requestBody = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        aspectRatio: orientation === "portrait" ? "9:16" : "16:9",
        resolution: "1080p",
        duration: `${duration}s`,
        enableSynchronizedSound: true
      }
    };
    
    const response = await fetch(this.baseURL, {
      method: "POST", 
      headers: { "Authorization": `Bearer ${this.API_KEY}` },
      body: JSON.stringify(requestBody)
    });
    
    return this.extractVideoUrl(response);
  }
}
```

### 2. LeonardoAI.ts 핵심 로직

```typescript  
class LeonardoAI {
  async _generateVideo(prompt: string, orientation: OrientationEnum) {
    const { width, height } = getOrientationConfig(orientation);
    
    const requestBody = {
      prompt,
      height, width,
      resolution: "RESOLUTION_720",
      frameInterpolation: true,
      promptEnhance: true
    };
    
    const response = await fetch(`${this.baseURL}/generations-text-to-video`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${this.API_KEY}` },
      body: JSON.stringify(requestBody)
    });
    
    const result = await response.json();
    return this.pollForCompletion(result.sdGenerationJob.generationId);
  }
  
  private async pollForCompletion(generationId: string) {
    // 5초마다 상태 체크, 최대 3분 대기
    while (Date.now() - startTime < maxWaitTime) {
      const status = await this.checkGenerationStatus(generationId);
      if (status === "COMPLETE") return videoUrl;
      await sleep(5000);
    }
  }
}
```

### 3. ShortCreator.ts 통합

```typescript
// API 영상 생성 분기 로직
if (this.config.videoSource === "veo" && this.googleVeoApi) {
  video = await this.googleVeoApi.findVideo(searchTerms, duration, excludeIds, orientation);
} else if (this.config.videoSource === "leonardo" && this.leonardoApi) {
  video = await this.leonardoApi.findVideo(searchTerms, duration, excludeIds, orientation);  
} else if (this.config.videoSource === "both") {
  // 랜덤 선택 로직
  const useVeo = Math.random() > 0.5;
  video = useVeo ? await this.googleVeoApi.findVideo(...) : await this.leonardoApi.findVideo(...);
}

// API 영상인 경우 Remotion 스킵
if (isApiVideo && scenes.length === 1) {
  await this.ffmpeg.combineVideoWithAudioAndCaptions(...);
}
```

---

## 🚨 에러 핸들링

### 일반적인 에러들

1. **401 Unauthorized**
```
Invalid API key - check your authentication
```
**해결:** API 키 재확인 및 갱신

2. **402 Payment Required** (Leonardo)
```  
Insufficient API credits - please top up your account
```
**해결:** 크레딧 충전

3. **429 Rate Limit**
```
Rate limit exceeded - please wait and try again  
```
**해결:** 재시도 로직 (3회, 지수 백오프)

4. **Generation Timeout**
```
Video generation timed out after 180s
```
**해결:** 더 짧은 프롬프트 또는 재시도

### 에러 핸들링 코드

```typescript
try {
  return await this._generateVideo(...);
} catch (error) {
  if (error.message.includes("timeout")) {
    if (retryCounter < retryTimes) {
      return await this.findVideo(..., retryCounter + 1);
    }
  }
  
  logger.error(error, "Video generation failed");
  throw new Error(`Failed to generate video: ${error.message}`);
}
```

---

## 📊 성능 비교

| 항목 | Remotion | Google Veo | Leonardo AI | FFmpeg |
|------|----------|------------|-------------|---------|
| 해상도 | 커스텀 | 1080p | 720p | Pexels 원본 |
| 처리 시간 | 30-60초 | 60-120초 | 60-180초 | 10-20초 |
| 안정성 | WSL2 ❌ | ✅ | ✅ | ✅ |
| 비용 | 무료 | 유료 | 유료 | 무료 |
| 커스터마이징 | ✅ | 제한적 | 제한적 | 제한적 |

---

## 🧪 테스트 시나리오

### API 키 없이 테스트
```bash
# FFmpeg 모드로 우선 테스트  
VIDEO_SOURCE=ffmpeg npm start
```

### Google Veo 테스트
```bash
export GOOGLE_VEO_API_KEY="ya29.xxx"
export GOOGLE_CLOUD_PROJECT_ID="my-project"
export VIDEO_SOURCE="veo"

curl -X POST http://localhost:3123/api/short-video \
  -d '{"scenes":[{"text":"A beautiful sunset","searchTerms":["sunset","nature"]}],"config":{}}'
```

### Leonardo AI 테스트  
```bash
export LEONARDO_API_KEY="leonardo_xxx"
export VIDEO_SOURCE="leonardo"

curl -X POST http://localhost:3123/api/short-video \
  -d '{"scenes":[{"text":"City at night","searchTerms":["city","lights"]}],"config":{}}'
```

---

## 💡 최적화 팁

### 1. 프롬프트 작성
- 구체적이고 시각적인 묘사
- 카메라 움직임 포함 ("smooth pan", "close-up")
- 조명 조건 명시 ("golden hour", "studio lighting")

### 2. API 사용량 최적화
- 캐싱 시스템 구현
- 실패 시 Pexels로 fallback
- 배치 처리 고려

### 3. 에러 복구
```typescript
// 계단식 fallback
video = await this.tryVeoGeneration()
  .catch(() => this.tryLeonardoGeneration())  
  .catch(() => this.tryPexelsSearch())
  .catch(() => this.useDefaultVideo());
```

---

## 📋 체크리스트

API 영상 생성 구현 시:

- [ ] API 키 환경변수 설정
- [ ] 요청 형식 확인 (각 API마다 다름)
- [ ] 폴링 로직 구현 (비동기 생성)
- [ ] 에러 핸들링 및 재시도
- [ ] 타임아웃 설정 (2-3분)
- [ ] fallback 메커니즘
- [ ] 로깅 및 모니터링
- [ ] 비용 추적

---

**결론: API 기반 영상 생성은 Remotion 의존성 없이 고품질 영상을 생성할 수 있는 강력한 대안입니다.**