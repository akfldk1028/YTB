# Subtitle Timing Improvements - September 25, 2025

## 🎯 Problem Identified
사용자가 "자막이 타이밍이 아주 쪼금 안맞는데" 라고 보고했습니다. 로그 분석 결과, 다음과 같은 타이밍 불일치가 발견되었습니다.

## 📊 Current Timing Analysis

### Scene Duration vs Audio Length Mismatch
```
Scene 1:
- Google TTS Audio Length: 4.673375초
- Whisper Recognition: [00:00:00.000 --> 00:00:04.520] (4.52초)  
- 차이: +0.153초 (Google TTS가 더 김)

Scene 2:
- Google TTS Audio Length: 6.378875초
- Whisper Recognition: [00:00:00.000 --> 00:00:05.840] (5.84초)
- 차이: +0.539초 (Google TTS가 더 김)

Scene 3:
- Google TTS Audio Length: 5.594125초  
- Whisper Recognition: [00:00:00.000 --> 00:00:06.940] (6.94초)
- 차이: -1.346초 (Whisper가 더 김)
```

## 🔍 Root Cause Analysis

### 1. **TTS vs Whisper 시간 계산 방식 차이**
- **Google TTS**: MP3 파일 크기 기반 길이 추정 (`audioBuffer.byteLength / (16000 * 2)`)
- **Whisper**: 실제 음성 인식 기반 정확한 타임스탬프
- **문제**: 계산 방식이 달라서 미세한 차이 발생

### 2. **Multi-scene Cumulative Timing Error**  
```typescript
// 현재 코드 (ShortCreator.ts:741)
cumulativeDuration += sceneDuration;  // sceneDuration = TTS 추정값 사용
```
- TTS 추정값을 누적하여 사용 → 오차 누적
- Whisper의 실제 타임스탬프와 점점 벌어짐

## 💡 Solution Implementation

### 1. **Whisper 기반 정확한 타이밍 사용**
TTS 추정값 대신 Whisper 실제 인식 결과의 endTime 사용:

```typescript
// BEFORE (부정확):
cumulativeDuration += sceneDuration;  // TTS 추정값

// AFTER (정확):
const lastCaption = scene.captions[scene.captions.length - 1];
cumulativeDuration = lastCaption.endMs / 1000;  // Whisper 실제값
```

### 2. **Caption Time Offset Correction**
```typescript
// 개선된 자막 시간 보정
const adjustedCaptions = scene.captions.map((caption: any) => ({
  ...caption,
  startMs: caption.startMs + (accurateCumulativeTime * 1000),
  endMs: caption.endMs + (accurateCumulativeTime * 1000),
}));
```

### 3. **실시간 타이밍 검증**
```typescript
// 디버그 로그 추가로 타이밍 정확도 모니터링
logger.debug({
  sceneIndex: i,
  ttsEstimated: sceneDuration,
  whisperActual: lastCaption.endMs / 1000,
  difference: Math.abs(sceneDuration - (lastCaption.endMs / 1000)),
  cumulativeTime: cumulativeDuration
}, "Scene timing analysis");
```

## 🛠️ Technical Implementation

### File: `src/short-creator/ShortCreator.ts:735-742`

**BEFORE:**
```typescript
cumulativeDuration += sceneDuration;
```

**AFTER:**
```typescript
// Use Whisper's actual audio end time instead of TTS estimation
if (scene.captions && scene.captions.length > 0) {
  const lastCaption = scene.captions[scene.captions.length - 1];
  const actualSceneDuration = lastCaption.endMs / 1000;
  cumulativeDuration += actualSceneDuration;
  
  logger.debug({
    sceneIndex: i,
    ttsEstimated: sceneDuration,
    whisperActual: actualSceneDuration,
    timingDifference: Math.abs(sceneDuration - actualSceneDuration).toFixed(3) + 's',
    cumulativeAccuracy: cumulativeDuration.toFixed(3) + 's'
  }, "Using Whisper-based accurate scene timing");
} else {
  cumulativeDuration += sceneDuration;  // Fallback to TTS estimation
}
```

## 📈 Expected Improvements

### Before Fix:
- Scene 1: 0초 시작 (정확)
- Scene 2: 4.67초 시작 (TTS 추정값) → 실제와 0.15초 차이
- Scene 3: 11.05초 시작 (누적 오차) → 실제와 0.69초 차이

### After Fix:
- Scene 1: 0초 시작 (정확)
- Scene 2: 4.52초 시작 (Whisper 실제값) → 정확
- Scene 3: 10.36초 시작 (Whisper 누적값) → 정확

## ✅ Benefits

1. **🎯 정확한 동기화**: Whisper 실제 인식 결과 기반
2. **📊 누적 오차 제거**: 각 씬의 정확한 끝 시간 사용  
3. **🔍 디버깅 개선**: 타이밍 차이 실시간 모니터링
4. **⚡ 성능 유지**: 추가 계산 없이 기존 데이터 활용

## 🧪 Testing

### Test Case 1: 3-Scene Video
```json
{
  "scenes": [
    {"text": "첫 번째 씬 테스트입니다.", "searchTerms": ["test"]},
    {"text": "두 번째 씬으로 정확히 연결됩니다.", "searchTerms": ["connection"]},  
    {"text": "세 번째 씬까지 완벽한 타이밍입니다.", "searchTerms": ["perfect"]}
  ]
}
```

### Expected Result:
```
Scene 1: 00:00:00.000 → 00:00:03.500 (3.5초)
Scene 2: 00:00:03.500 → 00:00:08.200 (4.7초, 정확한 연결)  
Scene 3: 00:00:08.200 → 00:00:13.800 (5.6초, 정확한 연결)
```

## 🚀 Implementation Status

- ✅ **Problem Analysis**: 타이밍 불일치 원인 파악 완료
- ✅ **Code Fix**: Whisper 기반 정확한 타이밍 구현 완료 (ShortCreator.ts:744-760)
- ⏳ **Testing**: 개선된 동기화 테스트 예정
- ⏳ **Documentation**: 사용자 가이드 업데이트 예정

이 개선으로 자막과 음성의 완벽한 동기화가 달성될 것입니다! 🎯