# YTB-FFmpeg Module

FFmpeg 비디오/오디오 처리를 위한 모듈화된 라이브러리.

> Last Updated: 2026-02-01 | v3.1.2 adaptive formula sizing + drop shadow

## Architecture

```
YTB-ffmpeg/
├── index.ts           # Facade Pattern - 통합 인터페이스
├── utils.ts           # 공통 유틸리티 (FFmpeg 초기화, spawn 실행)
├── AudioProcessor.ts  # 오디오 처리 모듈
├── SubtitleFilter.ts  # 자막 필터 생성 모듈
├── VideoConcat.ts     # 비디오 연결 모듈
└── VideoEditor.ts     # 비디오 편집 모듈
```

## Modules

### 1. AudioProcessor
오디오 처리 및 믹싱 담당.

| Method | Description |
|--------|-------------|
| `saveNormalizedAudio()` | 오디오 정규화 후 저장 |
| `createMp3DataUri()` | MP3 Data URI 생성 |
| `generateSilentAudio()` | 무음 오디오 생성 |
| `createAudioFromSoundEffects()` | 효과음으로 오디오 트랙 생성 |
| `mixAudioTracks()` | 여러 오디오 트랙 믹싱 |
| `concatAudios()` | 오디오 파일 연결 |

### 2. SubtitleFilter
FFmpeg drawtext 필터 생성.

| Method | Description |
|--------|-------------|
| `createSubtitleFilter()` | 단일 자막 필터 (30+개 시 simplified 자동 전환) |
| `createSimplifiedSubtitleFilter()` | 90px 2/3줄 자막 (Books/News용) |
| `createSceneOverlayFilter()` | 씬별 제목 오버레이 (상단) |
| `createDualLanguageSubtitleFilter()` | 이중 언어 자막 필터 |
| `createTitleTextFilter()` | 타이틀 텍스트 필터 |

### 3. VideoConcat
비디오 연결 처리.

| Method | Description |
|--------|-------------|
| `concatVideos()` | 비디오 연결 (stream copy 우선) |
| `concatVideosWithXfade()` | xfade 트랜지션으로 연결 |

**Concat 전략 (우선순위):**
```
1. concat demuxer + stream copy (가장 빠름, re-encoding 없음)
2. filter_complex + ultrafast preset (fallback)
```

### 4. VideoEditor
비디오 편집 및 합성.

| Method | Description |
|--------|-------------|
| `combineVideoWithAudioAndCaptions()` | 비디오 + 오디오 + 자막 합성 (filter_complex_script 지원) |
| `trimVideo()` | 비디오 트림 |
| `trimAndResizeVideo()` | 트림 + 리사이즈 (오디오 제거) |
| `addSubtitlesToVideo()` | 자막 추가 |
| `createStaticVideoFromImage()` | 이미지로 정적 비디오 생성 |
| `createStaticVideoWithFormulaOverlay()` | 이미지 + LaTeX 수식 오버레이 비디오 |
| `extractAudioFromVideo()` | 비디오에서 오디오 추출 |
| `replaceVideoAudio()` | 비디오 오디오 교체 |

## Usage

### Basic Usage (Facade)
```typescript
import { FFMpeg } from './YTB-ffmpeg';

const ffmpeg = await FFMpeg.init();

// 비디오 연결
await ffmpeg.concatVideos(['clip1.mp4', 'clip2.mp4'], 'output.mp4');

// 오디오 믹싱
await ffmpeg.mixAudioTracks(mainAudio, overlays, output, duration);

// 비디오 + 오디오 + 자막 합성
await ffmpeg.combineVideoWithAudioAndCaptions(
  videoPath, audioPath, captions, outputPath,
  duration, orientation, config
);
```

### Direct Module Access
```typescript
import { VideoConcat, AudioProcessor } from './YTB-ffmpeg';

const concat = new VideoConcat();
await concat.concatVideosWithXfade(videos, output, 0.5, 'fade');

const audio = new AudioProcessor();
await audio.mixAudioTracks(main, overlays, output, duration);
```

## Key Features

### Stream Copy Optimization
`concatVideos()`는 **concat demuxer + stream copy**를 우선 사용:

```typescript
// 1단계: stream copy (가장 빠름)
ffmpeg -f concat -safe 0 -i list.txt -c copy output.mp4

// 2단계: fallback (ultrafast)
ffmpeg -filter_complex "[0:v][1:v]concat" -preset ultrafast output.mp4
```

**장점:**
- Re-encoding 없이 초고속 처리
- 10분+ → 수 초로 단축
- CPU 부하 최소화

### Video Normalization
`trimAndResizeVideo()`는 모든 클립을 동일 형식으로 정규화:

```typescript
ffmpeg(input)
  .setDuration(duration)
  .videoCodec('libx264')
  .noAudio()  // 오디오 제거 (나중에 TTS와 합성)
  .size(`${width}x${height}`)
  .autopad(true, 'black')
  .outputOptions(['-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p'])
```

### 🔄 Short Video Loop (2026-01-17)

**문제**: Pexels 비디오가 필요한 duration보다 짧으면 영상이 멈추는 현상 발생

**해결**: `trimAndResizeVideo()`에서 자동 loop 적용

```typescript
// 1. 먼저 소스 비디오 길이 확인
const sourceDuration = await this.getVideoDuration(inputPath);
const needsLoop = sourceDuration < duration;

// 2. 짧으면 무한 루프 적용
if (needsLoop) {
  command
    .inputOptions(['-stream_loop', '-1'])  // 무한 루프
    .setDuration(duration);  // 정확한 duration에서 자르기
}
```

**동작 원리**:
- `-stream_loop -1`: FFmpeg 입력 옵션으로 무한 반복
- `setDuration(duration)`: 정확한 길이에서 자르기
- 로그: `🔄 Source video shorter than required - applying loop`

### xfade Transitions
`concatVideosWithXfade()`는 부드러운 장면 전환 지원:

```typescript
// 지원 트랜지션
fade, dissolve, wipeleft, wiperight, slideup, slidedown,
circleopen, circleclose, radial, pixelize, fadeblack, fadewhite, ...
```

## Dependencies

- `fluent-ffmpeg`: FFmpeg wrapper
- `@ffmpeg-installer/ffmpeg`: FFmpeg 바이너리 (Windows/Mac)
- System FFmpeg: `/usr/bin/ffmpeg` (Linux/Docker)

## Environment

| Platform | FFmpeg Source |
|----------|---------------|
| Linux/Docker | `/usr/bin/ffmpeg` (시스템) |
| Windows/Mac | `@ffmpeg-installer/ffmpeg` (npm) |

## Error Handling

모든 모듈은 단계별 fallback 전략 사용:

```
Stream Copy → Ultrafast Encoding → Error
Audio+Video → Video-only → Error
```

### Adaptive Formula Sizing (v3.1.2)
`createStaticVideoWithFormulaOverlay()`에서 LaTeX 길이 기반 동적 크기 조절:
- 짧은 수식 (≤20자, 예: `L_cb`): 화면 40% (432px)
- 중간 수식 (≤50자): 화면 55% (594px)
- 긴 수식 (50자+): 화면 70% (756px)

투명 배경 수식 가독성을 위해 드롭쉐도우 효과 자동 적용 (boxblur + alpha).

### ENAMETOOLONG 방지 (v3.1.1)
`combineVideoWithAudioAndCaptions()`에서 자막 필터가 8KB 이상이면 파일로 저장:
```typescript
// Windows 32KB 명령줄 제한 초과 방지
if (fullFilter.length > 8000 && tempDir) {
  fs.writeFileSync(filterScriptPath, fullFilter);
  ffmpegCommand.outputOptions(['-filter_complex_script', filterScriptPath, ...]);
}
```
**적용 조건**: 캡션 50개+ (84캡션 × 3줄 = 230 drawtext 필터 → ~30KB)

## Performance Tips

1. **Pexels 비디오 사용 시**: `trimAndResizeVideo()`로 먼저 정규화
2. **많은 클립 연결 시**: stream copy 자동 적용
3. **트랜지션 필요 시**: `concatVideosWithXfade()` 사용
4. **오디오 없는 클립**: `.noAudio()` 옵션으로 일관성 유지

## Testing

```bash
# VideoConcat 테스트 실행
npx vitest run src/YTB-ffmpeg/VideoConcat.test.ts

# 전체 테스트 실행
npx vitest run
```

### Test Coverage

| Test | Description | Status |
|------|-------------|--------|
| single video copy | 단일 비디오 복사 | ✅ |
| concat two videos | 2개 비디오 stream copy 연결 | ✅ |
| concat three videos | 3개 비디오 연결 | ✅ |
| empty input error | 빈 입력 에러 처리 | ✅ |
| xfade single video | xfade 단일 비디오 처리 | ✅ |
| xfade empty error | xfade 빈 입력 에러 | ✅ |
