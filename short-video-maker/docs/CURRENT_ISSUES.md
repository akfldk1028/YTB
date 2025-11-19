# 현재 이슈 정리 (2025-11-19)

## 🔴 긴급 이슈: NANO BANANA inputScenes 비어있음

### 문제 설명
NANO BANANA 워크플로우가 시작은 되지만 **`inputScenes` 배열이 비어있어서** 이미지 생성 루프가 실행되지 않음

### 증거 (Cloud Run 로그 - videoId: cmi5cuwsy00000es61akk7wuq)
```
02:00:31 - "🎬 Processing NANO BANANA static video workflow"
02:00:31 - "🎬 Starting NANO BANANA image generation for all scenes"
02:00:31 - "✅ Created video-specific temp directory"
02:00:44 - "Starting GCS upload" ❌ (13초 후, 이미지 생성 없이 바로 GCS 업로드!)
```

### 누락된 로그
```typescript
// NanoBananaStaticWorkflow.ts:54
for (let i = 0; i < inputScenes.length; i++) {
  logger.info({ sceneIndex: i + 1 }, "📸 Generating image for scene"); // ← 이 로그가 절대 나타나지 않음
}
```

**→ `inputScenes.length === 0` 이므로 for 루프가 실행 안됨**

### 원인 추정
1. `/api/video/nano-banana` 엔드포인트에서 `RawDataParser.parseRawData()` 호출
2. `validateCreateShortInput()` 검증 통과
3. `ShortCreatorRefactored.addToQueue()` 호출 시 scenes는 있지만 inputScenes는 비어있을 가능성
4. `NanoBananaStaticWorkflow.process(scenes, inputScenes, context)` 호출 시 inputScenes가 빈 배열

### 이전에 작동했던 증거
- User: "나노바나나는 저번에 되엇어슨데" (NANO BANANA worked in previous tests)
- 이전 성공 테스트: `cmi471qrc00000es6ep685dyi`
  - ✅ NANO BANANA 이미지 생성 성공
  - ✅ VEO3 I2V 변환 성공
  - ✅ 302 redirect 처리 성공
  - ❌ GCS 업로드만 파일 경로 문제로 실패

### 해결 방법
**데이터 흐름 추적이 필요:**
1. `nano-banana.ts` 엔드포인트 → `RawDataParser.parseRawData()` 결과 로깅
2. `validateCreateShortInput()` 결과 로깅
3. `addToQueue()` 호출 시 파라미터 로깅
4. `processQueueItem()` 시작 시 파라미터 로깅
5. `workflow.process()` 호출 시 파라미터 로깅

어느 지점에서 scenes → inputScenes 변환이 깨지는지 확인 필요

---

## 🟡 검증 필요: 파일 경로 수정 (SHA c3117b0)

### 문제 설명
VEO3 워크플로우에서 최종 비디오 파일을 temp 디렉토리(`/tmp/video-xxx/final_xxx.mp4`)에 저장하지만,
GCS 업로드는 standard 디렉토리(`/app/data/videos/xxx.mp4`)에서 파일을 찾음

### 해결 방법 (구현됨, 미검증)
```typescript
// VideoProcessor.ts
const standardPath = path.join(this.config.outputDir, `${videoId}.mp4`);
await fs.copy(finalVideoPath, standardPath);
logger.info({ from: finalVideoPath, to: standardPath },
  "✅ Final video copied from temp to standard directory");
```

### 검증 상태
❌ 아직 검증 안됨 - NANO BANANA inputScenes 이슈 때문에 워크플로우가 완료되지 않음

### 검증 계획
NANO BANANA 이슈 해결 후:
1. 전체 워크플로우 실행
2. temp 디렉토리에 파일 생성 확인
3. standard 디렉토리로 복사 확인
4. GCS 업로드 성공 확인

---

## ✅ 해결됨: VEO3 302 Redirect (SHA aa95c50)

### 문제
VEO3 API가 비디오 다운로드 URL로 302 redirect 응답을 반환했지만, 코드가 이를 처리하지 못함

### 해결
```typescript
if (response.status === 302) {
  const redirectUrl = response.headers.get('location');
  const actualResponse = await fetch(redirectUrl);
  // 실제 비디오 데이터 다운로드
}
```

### 검증
✅ 이전 테스트 `cmi471qrc00000es6ep685dyi`에서 302 redirect 처리 성공 확인

---

## 🔵 시도했지만 해결 안됨

### TIER2 API 키 변경
- **시도**: Google AI API key를 TIER2로 변경
- **결과**: 여전히 같은 문제 발생 (inputScenes 비어있음)
- **결론**: API 키 문제가 아니라 코드 로직 문제

### 테스트 요청 형식 수정
- **시도 1**: `characterDescription` 문자열 → `character` 객체로 변경
- **시도 2**: 직접 `/api/video/nano-banana` 엔드포인트 사용
- **결과**: 요청은 성공하지만 inputScenes 여전히 비어있음

---

## 📋 테스트 이력

### 실패한 테스트들
1. **cmi4k1krj00000es6gb7qfzsp** - 로그 6개만 존재, 워크플로우 미실행
2. **cmi4m58v900000es64yf2bwzm** - 로그 6개만 존재, 워크플로우 미실행
3. **cmi5c0qlz00000es6f4xd6kjy** - TIER2 API key, inputScenes 비어있음
4. **cmi5cuwsy00000es61akk7wuq** - NANO BANANA 직접 엔드포인트, inputScenes 비어있음

### 성공한 테스트 (이전)
1. **cmi471qrc00000es6ep685dyi** - 모든 단계 성공 (GCS 업로드만 파일 경로 이슈로 실패)
   - ✅ NANO BANANA 이미지 생성
   - ✅ VEO3 I2V 변환
   - ✅ 302 redirect 처리
   - ❌ GCS 업로드 (파일 경로 문제)

---

## 🎯 다음 단계

### 1단계: inputScenes 비어있는 문제 해결 (최우선)
- [ ] 디버그 로깅 추가
  - `nano-banana.ts` 엔드포인트에서 scenes 로깅
  - `RawDataParser.parseRawData()` 결과 로깅
  - `validateCreateShortInput()` 결과 로깅
  - `addToQueue()` 파라미터 로깅
  - `workflow.process()` 파라미터 로깅
- [ ] 어디서 scenes가 inputScenes로 변환되는지 확인
- [ ] QueueItem 구조 확인 (inputScenes 저장/복원 로직)
- [ ] 수정 및 배포

### 2단계: 파일 경로 수정 검증
- [ ] NANO BANANA 이슈 해결 후 전체 워크플로우 테스트
- [ ] temp → standard 디렉토리 복사 확인
- [ ] GCS 업로드 성공 확인

### 3단계: 종합 테스트
- [ ] NANO BANANA only 워크플로우
- [ ] NANO BANANA → VEO3 I2V 워크플로우
- [ ] 파일 경로 수정 작동 확인
- [ ] GCS 업로드 성공 확인
- [ ] YouTube 업로드 (선택사항)

---

## 📝 관련 파일

### 코어 파일
- `/mnt/d/Data/00_Personal/YTB/short-video-maker/src/server/api/nano-banana.ts` - NANO BANANA 엔드포인트
- `/mnt/d/Data/00_Personal/YTB/short-video-maker/src/short-creator/workflows/NanoBananaStaticWorkflow.ts` - 워크플로우 구현
- `/mnt/d/Data/00_Personal/YTB/short-video-maker/src/short-creator/ShortCreatorRefactored.ts` - addToQueue 로직
- `/mnt/d/Data/00_Personal/YTB/short-video-maker/src/server/parsers/N8NDataParser.ts` - parseRawData 구현
- `/mnt/d/Data/00_Personal/YTB/short-video-maker/src/server/validator.ts` - 검증 로직

### 수정된 파일 (파일 경로 fix)
- `/mnt/d/Data/00_Personal/YTB/short-video-maker/src/short-creator/processors/VideoProcessor.ts`

---

## 🔍 핵심 코드 스니펫

### NanoBananaStaticWorkflow.ts - 문제 지점
```typescript
// Line 48-54
logger.info({
  videoId: context.videoId,
  sceneCount: inputScenes.length  // ← 이게 0으로 나옴
}, "🎬 Starting NANO BANANA image generation for all scenes");

for (let i = 0; i < inputScenes.length; i++) {
  logger.info({ sceneIndex: i + 1 }, "📸 Generating image for scene"); // ← 절대 실행 안됨
}
```

### nano-banana.ts - 엔드포인트
```typescript
// Line 35-83
const processedData = RawDataParser.parseRawData(req.body);
const validationInput = {
  scenes: processedData.scenes.map((scene: any) => ({
    ...scene,
    needsImageGeneration: true,
    imageData: { /* ... */ }
  })),
  config: { /* ... */ }
};

const input = validateCreateShortInput(validationInput);
const videoId = this.shortCreator.addToQueue(
  input.scenes,  // ← scenes는 있음
  input.config,
  callbackUrl,
  { mode: "nano-banana", /* ... */ }
);
```

---

## 💡 User의 핵심 피드백

1. **"나노바나나 엔드포인트는 잘됫엇잖아"** - NANO BANANA는 이전에 잘 작동했음
2. **"순차적으로생각해봐"** - 차근차근 단계별로 생각하라
3. **"나노바나나는 저번에 되엇어슨데"** - 이전 테스트에서 NANO BANANA 성공했음 (regression)
4. **"처음부터 /NANOBABANA 엔드포인트로 테스해보면됮나"** - 직접 NANO BANANA 엔드포인트 사용하라

---

## 📊 배포 이력

- **SHA aa95c50**: VEO3 302 redirect 수정 ✅
- **SHA c3117b0**: 파일 경로 수정 (temp → standard) ⏳ 미검증
- **SHA 520701a**: Debug logging (미완성)
- **Current**: inputScenes 비어있는 문제 디버깅 중 🔴

---

## 🚨 긴급도

1. 🔴 **최고 우선순위**: inputScenes 비어있는 문제 해결
2. 🟡 **중간 우선순위**: 파일 경로 수정 검증
3. 🟢 **낮은 우선순위**: 전체 워크플로우 통합 테스트
