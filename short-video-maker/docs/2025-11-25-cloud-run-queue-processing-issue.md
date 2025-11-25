# Cloud Run Queue Processing Issue - Sequential Analysis
Date: 2025-11-25

## 문제 요약 (Problem Summary)

Cloud Run API는 요청을 정상적으로 받지만 (HTTP 201), **VideoQueue가 전혀 처리하지 않음**.
- ✅ Local 환경: 완벽하게 작동
- ❌ Cloud Run 환경: 큐 처리 로그 전혀 없음, 파일 생성 안됨

---

## 1단계: 문제 발견 (Problem Discovery)

### 증상 (Symptoms)
```
테스트 요청: cmie85zfk00000es684n6e7t5
- API 응답: HTTP 201 ✅
- GCS 버킷: 폴더 생성 안됨 ❌
- Cloud Run 로그: 처리 로그 없음 ❌
- 에러 로그: 없음 ❌
```

### 이전 작동 여부
사용자 확인: **"원래 돌아가긴 했었는데"** - 이전에는 작동했음

---

## 2단계: 근본 원인 발견 (Root Cause Identified)

### 발견된 버그: Unhandled Promise Rejection

**위치**: `src/short-creator/queue/VideoQueue.ts:32-34`

**문제 코드**:
```typescript
if (!this.isProcessing) {
  this.processQueue(); // ❌ No await, no .catch()
}
```

**문제점**:
1. `processQueue()`는 async 함수
2. await 없이 호출 (fire-and-forget)
3. .catch() 없어서 에러가 발생해도 silent failure
4. Cloud Run에서는 unhandled rejection이 컨테이너를 죽이거나 프로세스를 멈출 수 있음

---

## 3단계: 수정 적용 (Fix Applied)

### 수정된 코드
```typescript
if (!this.isProcessing) {
  this.processQueue().catch(error => {
    logger.error(error, "Unhandled error in processQueue - queue may have stopped");
  });
}
```

**커밋**: `31b7d2f`
**배포**: revision `short-video-maker-00047-l75`

---

## 4단계: Local 테스트 - 성공 ✅

### 테스트 결과
```
Video ID: cmie76jvy0000wfdl7dn989aj
YouTube URL: https://www.youtube.com/watch?v=T3aScmnQcAQ
Status: ✅ 완전 성공

로그:
- "Item added to queue" ✅
- "Processing video item in the queue" ✅
- VEO3 image generation 완료 ✅
- VEO3 video generation 완료 ✅
- TTS audio generation 완료 ✅
- FFmpeg composition 완료 ✅
- GCS upload 완료 ✅
- YouTube upload 완료 ✅
```

### 결론
**Local 환경에서는 수정이 완벽하게 작동함**

---

## 5단계: Cloud Run 배포 및 테스트 - 실패 ❌

### 배포 과정
```bash
Commit: 31b7d2f
Build: 성공
Deploy: 성공
Revision: short-video-maker-00047-l75
```

### 테스트 요청
```bash
Video ID: cmie85zfk00000es684n6e7t5
API Response: HTTP 201 ✅
```

### 문제: 큐 처리가 전혀 일어나지 않음
```
GCS 버킷 확인:
❌ gs://dkdk-474008-short-videos/cmie85zfk00000es684n6e7t5/ 폴더 없음

Cloud Run 로그 확인:
❌ "Item added to queue" 로그 없음
❌ "Processing video item in the queue" 로그 없음
❌ "Unhandled error in processQueue" 로그 없음
❌ 어떤 에러 로그도 없음

15분 모니터링 결과:
- Check 1-15: 모두 파일 없음
- 로그에 처리 흔적 전혀 없음
```

---

## 6단계: 현재 상태 분석 (Current State Analysis)

### 문제의 본질

#### Local vs Cloud Run 비교

| 항목 | Local | Cloud Run |
|------|-------|-----------|
| API 응답 | HTTP 201 ✅ | HTTP 201 ✅ |
| Queue 초기화 | 성공 ✅ | ❓ 알 수 없음 |
| addToQueue 호출 | 로그 있음 ✅ | 로그 없음 ❌ |
| processQueue 호출 | 작동 ✅ | 작동 안함 ❌ |
| 파일 생성 | GCS 업로드 ✅ | 아무것도 없음 ❌ |

### 가능한 원인들

1. **Queue 초기화 실패**
   - VideoQueue 생성자가 Cloud Run에서 실패?
   - ShortCreatorRefactored 초기화 문제?

2. **코드가 실제로 배포되지 않음**
   - Build 과정에서 이전 코드가 사용됨?
   - Docker image에 수정사항 포함 안됨?

3. **환경 차이로 인한 실패**
   - Cloud Run 환경에서만 발생하는 다른 에러
   - 메모리 부족?
   - Timeout?
   - 권한 문제?

4. **더 일찍 발생하는 에러**
   - VideoQueue.addToQueue()가 호출조차 안됨
   - API endpoint에서 shortCreator.addToQueue() 호출 실패?

---

## 7단계: 다음 조사 단계 (Next Investigation Steps)

### 필요한 디버깅

**VideoQueue.ts에 추가 로깅 필요**:

```typescript
constructor(
  private processVideoCallback: (item: QueueItem) => Promise<void>
) {
  logger.info("VideoQueue initialized"); // 추가
}

public addToQueue(
  sceneInput: SceneInput[],
  config: RenderConfig,
  callbackUrl?: string,
  metadata?: any
): string {
  logger.info("addToQueue called - ENTRY POINT"); // 추가
  const id = cuid();
  const item: QueueItem = {
    sceneInput,
    config,
    id,
    callbackUrl,
    metadata,
  };

  this.queue.push(item);
  logger.debug({ id, queueLength: this.queue.length }, "Item added to queue");

  if (!this.isProcessing) {
    logger.info("About to start processQueue"); // 추가
    this.processQueue().catch(error => {
      logger.error(error, "Unhandled error in processQueue - queue may have stopped");
    });
  }

  return id;
}

private async processQueue(): Promise<void> {
  logger.info("processQueue ENTERED"); // 추가
  if (this.queue.length === 0 || this.isProcessing) {
    logger.info("processQueue early return", {
      queueLength: this.queue.length,
      isProcessing: this.isProcessing
    }); // 추가
    return;
  }
  // ... rest
}
```

**ShortCreatorRefactored.ts에 로깅 필요**:

```typescript
constructor(...) {
  // ... 초기화 ...
  this.videoQueue = new VideoQueue(this.processVideo.bind(this));
  logger.info("ShortCreatorRefactored - VideoQueue initialized"); // 추가
}

public addToQueue(
  sceneInput: SceneInput[],
  config: RenderConfig,
  callbackUrl?: string,
  metadata?: any
): string {
  logger.info("ShortCreatorRefactored.addToQueue called"); // 추가
  return this.videoQueue.addToQueue(sceneInput, config, callbackUrl, metadata);
}
```

**consistent-shorts.ts API endpoint에 로깅 필요**:

```typescript
// Line ~141
logger.info("About to call shortCreator.addToQueue", {
  scenesCount: input.scenes.length,
  characterDescription: character.description
}); // 추가

const videoId = this.shortCreator.addToQueue(
  input.scenes,
  input.config,
  callbackUrl,
  { /* metadata */ }
);

logger.info("addToQueue returned", { videoId }); // 추가
```

---

## 8단계: 핵심 질문들 (Key Questions)

### 해결해야 할 의문점들

1. **VideoQueue가 초기화되는가?**
   - Constructor 로그가 있어야 함
   - 없으면 → ShortCreatorRefactored 초기화 문제

2. **addToQueue가 호출되는가?**
   - API endpoint에서 호출 로그가 있어야 함
   - 없으면 → API endpoint 문제
   - 있는데 VideoQueue.addToQueue 로그 없으면 → 함수 호출 실패

3. **processQueue가 실행되는가?**
   - "About to start processQueue" 로그가 있어야 함
   - 있는데 "processQueue ENTERED" 없으면 → .catch() 전에 에러
   - 둘 다 없으면 → isProcessing이 true거나 다른 조건 문제

4. **배포된 코드가 실제로 수정본인가?**
   - Build logs 확인 필요
   - Docker image 확인 필요

---

## 9단계: 타임라인 (Timeline)

### 작동했던 시점
- 사용자: "원래 돌아가긴 했었는데"
- 이전 커밋들이 정상 작동했음을 시사

### 최근 변경사항 (Recent Changes)
```
2ffc1b9 - ConsistentShortsWorkflow validation override
4e612ee - Skip video generation, TTS only
3612108 - VEO3 I2V diagnostic logging
5badc1d - VEO3 clip combining logging
c3117b0 - Copy final video to standard location
31b7d2f - Fix VideoQueue unhandled promise rejection (최신)
```

### 어느 시점에 깨졌는가?
- 명확하지 않음
- 여러 수정사항이 있었고 Cloud Run 테스트가 충분하지 않았을 가능성

---

## 10단계: 결론 및 액션 플랜 (Conclusion & Action Plan)

### 현재 상태
```
❌ Cloud Run queue processing 완전히 작동 안함
✅ Local 환경은 완벽하게 작동
❓ 근본 원인 아직 불명확
```

### 즉시 필요한 조치

1. **상세 로깅 추가**
   - VideoQueue 전체 lifecycle 로깅
   - ShortCreatorRefactored 로깅
   - API endpoint 로깅

2. **새 버전 배포 및 테스트**
   - 로깅 추가된 버전 배포
   - 테스트 요청 전송
   - 로그 분석하여 정확한 실패 지점 파악

3. **배포 검증**
   - Build logs 확인
   - 실제 배포된 코드가 최신인지 확인

### 예상 결과

로깅 추가 후 다음 중 하나를 발견할 것:
1. VideoQueue 초기화가 안되고 있음
2. addToQueue가 호출 안되고 있음
3. processQueue 실행이 막히고 있음
4. 다른 unhandled rejection이 존재함

---

## 부록: 테스트 데이터 (Appendix: Test Data)

### 성공한 Local 테스트
```json
{
  "videoId": "cmie76jvy0000wfdl7dn989aj",
  "youtubeUrl": "https://www.youtube.com/watch?v=T3aScmnQcAQ",
  "status": "완전 성공",
  "scenes": [
    {
      "text": "안녕하세요! YouTube 영구 토큰 테스트입니다.",
      "image": "/home/akfldk1028/.ai-agents-az-video-generator/temp/cmie76jvy0000wfdl7dn989aj/consistent_scene_1_cmie76jvy0000wfdl7dn989aj.png"
    },
    {
      "text": "새로운 Test User 토큰으로 자동 업로드가 정상 작동합니다!",
      "image": "/home/akfldk1028/.ai-agents-az-video-generator/temp/cmie76jvy0000wfdl7dn989aj/consistent_scene_2_cmie76jvy0000wfdl7dn989aj.png"
    }
  ]
}
```

### 실패한 Cloud Run 테스트들
```
cmie85zfk00000es684n6e7t5 - API 응답만, 처리 없음
cmie6rco000000es67o0l4f8s - API 응답만, 처리 없음
cmidzvxva00000es62hgyhrtt - API 응답만, 처리 없음
```

---

## 핵심 메시지 (Key Takeaway)

**문제의 본질**: Local과 Cloud Run의 동일한 코드베이스가 다르게 작동함

**추측**: VideoQueue 초기화 또는 addToQueue 호출 자체가 Cloud Run에서 실패하고 있으나, 에러가 로깅되지 않아 silent failure 발생

**해결책**: 상세 로깅을 추가하여 정확한 실패 지점을 찾아내야 함
