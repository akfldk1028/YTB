# YTB-FFmpeg Module

FFmpeg 비디오/오디오 처리를 위한 모듈화된 라이브러리.

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
| `createSubtitleFilter()` | 단일 자막 필터 생성 |
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
| `combineVideoWithAudioAndCaptions()` | 비디오 + 오디오 + 자막 합성 |
| `trimVideo()` | 비디오 트림 |
| `trimAndResizeVideo()` | 트림 + 리사이즈 (오디오 제거) |
| `addSubtitlesToVideo()` | 자막 추가 |
| `createStaticVideoFromImage()` | 이미지로 정적 비디오 생성 |
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
