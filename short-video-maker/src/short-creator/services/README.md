# Short Creator Services - 모듈화 문서

> **AI Context**: 이 문서는 ConsistentShortsWorkflow.ts의 모듈화 진행 상황을 기록합니다.
> AI가 코드 구조를 이해하고 추가 모듈화를 진행할 때 참조하세요.

## 📊 모듈화 현황

### 원본 파일
- **ConsistentShortsWorkflow.ts**: ~1400줄 → 목표: ~800줄 이하
- **위치**: `src/short-creator/workflows/ConsistentShortsWorkflow.ts`

### 분리된 서비스

| 서비스 | 파일 | 책임 | 상태 |
|--------|------|------|------|
| CaptionService | `CaptionService.ts` | 자막 생성/수집 | ✅ 완료 |
| AudioService | `AudioService.ts` | 오디오 생성/믹싱 | ✅ 완료 |
| CharacterHelper | `CharacterHelper.ts` | 캐릭터 이미지 처리 | ✅ 완료 |
| VideoFinalizerService | `VideoFinalizerService.ts` | 비디오 최종 처리 | ✅ 완료 |
| VEO3ProcessorService | `VEO3ProcessorService.ts` | VEO3 캡션 xfade 처리 | ✅ 완료 |

---

## 🔧 서비스 상세

### 1. CaptionService (`CaptionService.ts`)

**책임**: 자막/캡션 생성 및 시간 동기화

**주요 메서드**:
```typescript
// 영어 자막 생성 (TTS 싱크 / skipTTS 청크 분할)
generateSyncedEnglishCaptions(
  englishText: string,
  koreanCaptions: Caption[],
  totalDuration: number,
  skipTTS: boolean
): Caption[]

// 🔥 씬별 자막 수집 (4곳 중복 코드 통합)
collectSceneCaptions(
  sceneData: { captions?: any[] },
  textEnglish: string | undefined,
  sceneDuration: number,
  cumulativeDuration: number,
  skipTTS: boolean,
  sceneIndex: number
): CollectCaptionsResult
```

**중복 제거**: ConsistentShortsWorkflow.ts에서 4곳 → 1곳

**사용처**:
- VEO3 성공 모드 (line ~738)
- Static mode (line ~905)
- Mixed mode (line ~958)
- No VEO3 static mode (line ~1241)

---

### 2. AudioService (`AudioService.ts`)

**책임**: 오디오 생성, 사운드 이펙트, BGM, 믹싱

**주요 메서드**:
```typescript
// Freesound API로 사운드 이펙트 생성
generateSoundEffects(
  audioConfig: AudioConfig,
  tempDirPath: string,
  sceneDurations: number[],
  apiKey: string
): Promise<AudioOverlay[]>

// Loudly API로 BGM 생성
generateBackgroundMusic(
  audioConfig: AudioConfig,
  tempDirPath: string,
  totalDuration: number,
  videoId: string
): Promise<AudioOverlay | null>

// 오디오 파일 믹싱 (TTS + SFX + BGM)
mixAudioWithSoundEffects(params: {
  audioFiles: string[];
  sceneDurations: number[];
  audioConfig: AudioConfig;
  apiKey: string;
  tempDirPath: string;
  videoId: string;
  skipTTS?: boolean;
  ffmpeg: FFMpeg;
}): Promise<string | undefined>
```

**중복 제거**: 오디오 믹싱 로직 통합

---

### 3. VideoFinalizerService (`VideoFinalizerService.ts`)

**책임**: 비디오 최종 처리 (오디오 적용, 자막/타이틀 적용)

**주요 메서드**:
```typescript
// 🔥 오디오를 비디오에 적용 (2곳 중복 코드 통합)
applyAudioToVideo(params: {
  videoPath: string;
  outputPath: string;
  finalAudioPath?: string;
  audioFiles: string[];
  videoId: string;
  ffmpeg: FFMpeg;
  videoProcessorCombine: Function;
}): Promise<void>

// 🔥 자막을 비디오에 적용 (2곳 중복 코드 통합)
applySubtitlesToVideo(params: {
  inputPath: string;
  outputPath: string;
  titleText: { ko?: string; en?: string } | null;
  allKoreanCaptions: any[];
  allEnglishCaptions: any[];
  language: 'english' | 'korean';
  orientation: string;
  totalDuration: number;
  skipTTS: boolean;
  videoId: string;
  addSubtitlesFunction: Function;
}): Promise<void>

// 자막 설정 준비 (내부 사용)
prepareSubtitleConfig(params: {
  language: 'english' | 'korean';
  allKoreanCaptions: any[];
  allEnglishCaptions: any[];
  skipTTS: boolean;
}): SubtitleConfig
```

**중복 제거**: ConsistentShortsWorkflow.ts에서 4곳 → 2곳 (오디오 2곳 + 자막 2곳)

**사용처**:
- VEO 모드 applyAudioToVideo (line ~1119)
- VEO 모드 applySubtitlesToVideo (line ~1145)
- non-VEO 모드 applyAudioToVideo (line ~1252)
- non-VEO 모드 applySubtitlesToVideo (line ~1270)

---

### 4. CharacterHelper (`CharacterHelper.ts`)

**책임**: 캐릭터 프로필/이미지 로딩

**주요 메서드**:
```typescript
// 캐릭터 이미지 Base64 로드
loadCharacterImagesBase64(
  characterStorage: CharacterStorageService,
  profileId: string,
  characterIds: string[]
): Promise<Map<string, string>>
```

---

### 5. VEO3ProcessorService (`VEO3ProcessorService.ts`)

**책임**: VEO3 비디오 xfade 전환 시 캡션 타이밍 조정

**주요 메서드**:
```typescript
// 🔥 xfade 전환 시 캡션 타이밍 전체 조정 (2곳 중복 코드 통합)
adjustCaptionsForXfade(params: {
  koreanCaptions: Caption[];        // 한국어 캡션 배열 (in-place 수정)
  englishCaptions: Caption[];       // 영어 캡션 배열 (in-place 수정)
  sceneDurations: number[];         // 각 씬 길이 배열 (초)
  transitionDuration: number;       // xfade 전환 시간 (초)
  minSceneDuration: number;         // 최소 씬 길이 (초)
}): void
```

**내부 처리 순서**:
1. 한국어 캡션 xfade 오프셋 조정 (앞 씬들의 전환으로 인한 시간 단축)
2. 한국어 캡션 전환 구간 겹침 방지 (씬 경계 캡션 종료 시간 조정)
3. 영어 캡션 xfade 오프셋 조정 (start/end 초 단위 필드도 함께 조정)

**중복 제거**: ConsistentShortsWorkflow.ts에서 2곳 → 1곳

**사용처**:
- VEO3 성공 모드 xfade 처리 (line ~758)
- Mixed 모드 xfade 처리 (line ~886)

---

## 📈 코드 감소 현황

| 영역 | Before | After | 감소 |
|------|--------|-------|------|
| Caption Collection (4곳) | ~172줄 | ~64줄 | **~108줄** |
| Audio Application (2곳) | ~40줄 | ~20줄 | **~20줄** |
| Subtitle Application (2곳) | ~70줄 | ~30줄 | **~40줄** |
| xfade Caption Adjustment (2곳) | ~176줄 | ~26줄 | **~150줄** |
| **총계** | ~1400줄 | ~1154줄 | **~246줄** |

---

## 🔮 추가 모듈화 대상 (TODO)

### 높은 우선순위
1. ~~**SubtitleApplicationService**~~: ✅ VideoFinalizerService에 통합 완료
2. ~~**VEO3ProcessorService**~~: ✅ xfade 캡션 타이밍 조정 완료

### 중간 우선순위
3. **ImageGenerationService 연동**: 이미지 생성 로직 분리
4. **SceneProcessorService**: 씬별 처리 로직
5. **VEO3I2VService**: VEO3 I2V 변환 루프 로직 분리 (선택적)

---

## 🔄 데이터 흐름

```
ConsistentShortsWorkflow.process()
    │
    ├─→ Step 1: Image Generation
    │
    ├─→ Step 2: Audio Duration Update
    │
    ├─→ Step 3: Video Generation (VEO3 or Static)
    │       │
    │       ├─→ captionService.collectSceneCaptions() [4곳]
    │       │
    │       └─→ veo3ProcessorService.adjustCaptionsForXfade() [2곳]  ← 🆕
    │
    ├─→ Step 4: Audio Application
    │       │
    │       ├─→ audioService.mixAudioWithSoundEffects()
    │       │
    │       └─→ videoFinalizerService.applyAudioToVideo() [2곳]
    │
    └─→ Step 5: Subtitle Application
            │
            └─→ videoFinalizerService.applySubtitlesToVideo() [2곳]
                    │
                    └─→ videoProcessor.addTitleAndSubtitlesToVideo()
```

---

## 🛠 사용 예시

### CaptionService 사용
```typescript
import { captionService } from "../services/CaptionService";

const captionResult = captionService.collectSceneCaptions(
  sceneData,
  inputScene.textEnglish,
  sceneDuration,
  cumulativeDuration,
  skipTTS,
  sceneIndex
);
allCaptions.push(...captionResult.koreanCaptions);
allEnglishCaptions.push(...captionResult.englishCaptions);
```

### VideoFinalizerService 사용
```typescript
import { videoFinalizerService } from "../services/VideoFinalizerService";

// 오디오 적용
await videoFinalizerService.applyAudioToVideo({
  videoPath: tempVideoPath,
  outputPath: tempFinalPath,
  finalAudioPath,
  audioFiles,
  videoId: context.videoId,
  ffmpeg: this.videoProcessor.getFFmpeg(),
  videoProcessorCombine: this.videoProcessor.combineVideoWithAudio.bind(this.videoProcessor)
});

// 자막/타이틀 적용
const titleLanguage = (context.metadata?.language as 'english' | 'korean') || 'korean';
await videoFinalizerService.applySubtitlesToVideo({
  inputPath: tempFinalPath,
  outputPath: standardVideoPath,
  titleText: titleText || null,
  allKoreanCaptions: allCaptions,
  allEnglishCaptions,
  language: titleLanguage,
  orientation: context.orientation,
  totalDuration: cumulativeDuration,
  skipTTS: skipTTSMode,
  videoId: context.videoId,
  addSubtitlesFunction: this.videoProcessor.addTitleAndSubtitlesToVideo.bind(this.videoProcessor)
});
```

### VEO3ProcessorService 사용
```typescript
import { veo3ProcessorService } from "../services/VEO3ProcessorService";

// xfade 전환 시 캡션 타이밍 조정
if (useSceneTransitions && trimmedVideoPaths.length > 1) {
  const xfadeSceneDurations = scenes.map(s =>
    Math.max(s?.audio?.duration || MIN_SCENE_DURATION, MIN_SCENE_DURATION)
  );

  veo3ProcessorService.adjustCaptionsForXfade({
    koreanCaptions: allCaptions,           // in-place 수정됨
    englishCaptions: allEnglishCaptions,   // in-place 수정됨
    sceneDurations: xfadeSceneDurations,
    transitionDuration: sceneTransitionDuration,
    minSceneDuration: MIN_SCENE_DURATION
  });
}
```

---

## 📝 변경 이력

| 날짜 | 작업 | 감소량 |
|------|------|--------|
| 2026-01-19 | CaptionService.collectSceneCaptions 추가 | ~108줄 |
| 2026-01-19 | CaptionService 영어자막 이중오프셋 버그 수정 | - |
| 2026-01-20 | VideoFinalizerService.applyAudioToVideo 추가 | ~20줄 |
| 2026-01-20 | VideoFinalizerService.applySubtitlesToVideo 추가 | ~40줄 |
| 2026-01-20 | VEO3ProcessorService.adjustCaptionsForXfade 추가 | ~150줄 |

---

## ⚠️ 주의사항

1. **싱글톤 패턴**: 모든 서비스는 싱글톤 인스턴스로 export
   ```typescript
   export const captionService = new CaptionService();
   ```

2. **의존성 주입**: FFMpeg, VideoProcessor 등은 메서드 파라미터로 전달
   - 서비스가 직접 인스턴스를 생성하지 않음
   - 테스트 용이성 확보

3. **타입 안전성**: 모든 인터페이스 명시적 정의
   - `CollectCaptionsResult`, `ApplyAudioToVideoParams` 등
