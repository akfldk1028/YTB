# WSL2 Remotion 문제 해결 가이드

## 🚨 문제 상황

WSL2 환경에서 n8n 워크플로우를 통해 영상 생성 시 다음과 같은 에러가 발생:

```
A delayRender() "Waiting for root component to load" was called but not cleared after 28000ms
```

### 근본 원인
- **Remotion이 Chrome headless browser에 의존**
- **WSL2에서 Chrome 실행 환경 제약**
- **GUI 환경 없이 브라우저 렌더링 시도 시 타임아웃**

---

## 🔧 해결 방법들

### ✅ 방법 1: FFmpeg 모드 (권장)

Remotion을 완전히 우회하고 FFmpeg로 직접 처리:

```bash
# .env 파일
VIDEO_SOURCE=ffmpeg
```

**장점:**
- Chrome 의존성 제거
- 빠른 처리 속도  
- WSL2에서 100% 안정적
- 리소스 사용량 적음

**단점:**
- 복잡한 시각 효과 제한
- 단일 씬 최적화

### ✅ 방법 2: API 기반 영상 생성

AI 영상 생성 API 활용:

```bash
# Google Veo 사용
VIDEO_SOURCE=veo
GOOGLE_VEO_API_KEY=your_key
GOOGLE_CLOUD_PROJECT_ID=your_project

# Leonardo AI 사용  
VIDEO_SOURCE=leonardo
LEONARDO_API_KEY=your_key

# 둘 다 사용 (랜덤)
VIDEO_SOURCE=both
```

**장점:**
- AI 생성 고품질 영상
- Remotion 완전 우회
- 유니크한 콘텐츠 생성

**단점:**
- API 비용 발생
- 생성 시간 더 길 수 있음

### ❌ 시도했지만 실패한 방법들

1. **Chrome 설치 시도**
   ```bash
   # 실패 - WSL2에서 GUI 의존성 문제
   wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
   ```

2. **Xvfb 가상 디스플레이**
   ```bash
   # 복잡하고 불안정
   sudo apt-get install xvfb
   ```

3. **Docker 내부 실행**
   ```bash
   # 네트워킹 복잡성 증가
   docker run --privileged
   ```

---

## 📁 구현된 코드 변경사항

### 1. Config.ts 업데이트
```typescript
// FFmpeg 모드 추가
public videoSource: "pexels" | "veo" | "leonardo" | "both" | "ffmpeg" = "pexels";
```

### 2. ShortCreator.ts 로직 분기
```typescript
// Remotion 우회 조건
const isFFmpegMode = this.config.videoSource === "ffmpeg";
const isApiVideo = this.config.videoSource === "veo" || this.config.videoSource === "leonardo";

if ((isApiVideo && scenes.length === 1) || isFFmpegMode) {
    // FFmpeg 직접 처리
    await this.ffmpeg.combineVideoWithAudioAndCaptions(/*...*/);
} else {
    // 기존 Remotion 처리
    await this.remotion.render(/*...*/);
}
```

### 3. FFmpeg.ts 확장
```typescript
// 비디오+오디오+자막 결합 메서드 추가
async combineVideoWithAudioAndCaptions(
    videoPath: string,
    audioPath: string, 
    captions: any[],
    outputPath: string,
    durationSeconds: number,
    orientation: OrientationEnum,
    config: RenderConfig
): Promise<string>
```

---

## 🧪 테스트 결과

### 성공적인 테스트
```bash
curl -X POST http://localhost:3123/api/short-video \
  -H "Content-Type: application/json" \
  -d '{
    "scenes": [{"text": "Test with FFmpeg mode!", "searchTerms": ["nature"]}],
    "config": {"voice": "af_heart", "orientation": "portrait"}
  }'
```

**결과:**
- ✅ 영상 ID: `cmfqn5exz0000m5dleyj04jsa`
- ✅ 파일 크기: 2.3MB
- ✅ 해상도: 1080×1920
- ✅ 길이: 5.88초
- ✅ 처리 시간: ~15초

### 실패한 원본 테스트  
```
Error: A delayRender() was called but not cleared after 28000ms
```

---

## 🔄 프로세스 플로우

### FFmpeg 모드 플로우
```
Text Input → Kokoro (TTS) → Whisper (자막) → Pexels (비디오) → FFmpeg (결합) → MP4 출력
```

### 기존 Remotion 플로우 (WSL2에서 실패)
```  
Text Input → Kokoro (TTS) → Whisper (자막) → Pexels (비디오) → Remotion (Chrome 렌더링) → MP4 출력
                                                                    ↑
                                                               🚨 WSL2 실패 지점
```

---

## 📋 체크리스트

다음에 비슷한 문제 발생 시 확인 순서:

1. **[ ] 환경 확인**
   - WSL2 vs Native Linux vs Docker
   - Chrome/Chromium 설치 상태
   - GUI 지원 여부

2. **[ ] 에러 패턴 확인**  
   - `delayRender` 타임아웃
   - `Waiting for root component to load`
   - Puppeteer/Chrome 관련 에러

3. **[ ] 빠른 해결책 시도**
   - `VIDEO_SOURCE=ffmpeg` 설정
   - 서버 재시작
   - 단일 씬 테스트

4. **[ ] 대안 구현 검토**
   - API 영상 생성 활용
   - FFmpeg 처리 개선
   - Docker 환경 고려

---

## 📚 참고 자료

- [Remotion Troubleshooting](https://remotion.dev/docs/troubleshooting/loading-root-component)
- [WSL2 GUI Apps](https://docs.microsoft.com/en-us/windows/wsl/tutorials/gui-apps)
- [FFmpeg Video Processing](https://ffmpeg.org/documentation.html)
- [Google Veo API](https://cloud.google.com/vertex-ai/generative-ai/docs/video/overview)
- [Leonardo AI API](https://docs.leonardo.ai/)

---

## ⚡ Quick Fix Commands

```bash
# 1. FFmpeg 모드로 전환
echo "VIDEO_SOURCE=ffmpeg" >> .env

# 2. 빌드 및 재시작
npm run build && npm start

# 3. 테스트 API 호출
curl -X POST http://localhost:3123/api/short-video \
  -H "Content-Type: application/json" \
  -d '{"scenes":[{"text":"Test","searchTerms":["test"]}],"config":{"voice":"af_heart"}}'
```

**결론: WSL2 환경에서는 FFmpeg 모드를 사용하여 Remotion을 우회하는 것이 가장 안정적인 해결책입니다.**