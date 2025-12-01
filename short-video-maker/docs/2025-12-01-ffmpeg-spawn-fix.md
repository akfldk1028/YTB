# 2025-12-01 FFmpeg Spawn Fix (Cloud Run Compatibility)

## 개요

이 문서는 Cloud Run에서 FFmpeg 비디오 결합 시 hang되는 문제 해결 과정을 기록합니다.

**문제**: `fluent-ffmpeg`의 `mergeToFile` 메서드가 Cloud Run에서 무한 hang
**해결**: Node.js `spawn`을 직접 사용하여 timeout 처리

---

## 1. 문제 상황

### 1.1 증상

영상 생성이 "Combining trimmed VEO3 video clips" 단계에서 멈춤:

```
01:28:38 🎬 Combining trimmed VEO3 video clips
... (10분 이상 대기, 추가 로그 없음)
```

### 1.2 원인 분석

`fluent-ffmpeg`의 `mergeToFile` 메서드가 Cloud Run 환경에서 silent hang:

```typescript
// 이전 코드 (문제 발생)
ffmpeg()
  .input(inputPaths[0])
  .mergeToFile(outputPath, tempDir)
  .on('end', () => resolve(outputPath))
  .on('error', reject);  // ❌ 에러도 발생하지 않고 그냥 hang
```

**Whisper timeout 문제와 동일한 패턴:**
- `spawnSync`/`fluent-ffmpeg` → Cloud Run에서 hang
- 해결책: 직접 `spawn` 사용 + timeout 처리

---

## 2. 해결 방안

### 2.1 핵심 변경사항

1. `spawn` import 추가
2. `concatVideos` 함수 재작성 (concat demuxer 사용)
3. `runFFmpegSpawn` 헬퍼 메서드 추가

### 2.2 코드 변경

#### `src/short-creator/libraries/FFmpeg.ts`

**Import 추가:**

```typescript
import { spawn } from "child_process";
```

**새로운 `concatVideos` 함수:**

```typescript
/**
 * 무손실 결합을 위해 concat demuxer 사용 (재인코딩 없음)
 * Cloud Run 호환성을 위해 spawn 사용 (fluent-ffmpeg mergeToFile이 hang됨)
 */
async concatVideos(inputPaths: string[], outputPath: string): Promise<string> {
  logger.info({ inputPaths, outputPath }, "Concatenating videos with FFmpeg spawn");

  if (inputPaths.length === 0) {
    throw new Error("No input paths provided");
  }

  if (inputPaths.length === 1) {
    // 단일 파일인 경우 복사만 수행
    fs.copyFileSync(inputPaths[0], outputPath);
    return outputPath;
  }

  // concat demuxer용 파일 리스트 생성
  const concatListPath = path.join(path.dirname(outputPath), `concat_list_${Date.now()}.txt`);
  const concatListContent = inputPaths.map(p => `file '${p}'`).join('\n');
  fs.writeFileSync(concatListPath, concatListContent);

  try {
    // FFmpeg concat demuxer로 비디오 결합 (재인코딩 없음)
    await this.runFFmpegSpawn([
      '-f', 'concat',
      '-safe', '0',
      '-i', concatListPath,
      '-c', 'copy',
      '-y',
      outputPath
    ], 300000); // 5분 타임아웃

    logger.info({ outputPath }, "Video merge complete via spawn");
    return outputPath;
  } finally {
    // concat 리스트 파일 정리
    try {
      fs.unlinkSync(concatListPath);
    } catch (cleanupError) {
      logger.warn({ cleanupError }, "Could not clean up concat list file");
    }
  }
}
```

**새로운 `runFFmpegSpawn` 헬퍼 메서드:**

```typescript
/**
 * FFmpeg 명령을 spawn으로 실행 (Cloud Run 호환)
 * fluent-ffmpeg가 hang되는 문제 해결을 위해 직접 spawn 사용
 */
private runFFmpegSpawn(args: string[], timeoutMs: number): Promise<string> {
  return new Promise(async (resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let killed = false;

    // FFmpeg 경로 가져오기
    const ffmpegInstaller = await import("@ffmpeg-installer/ffmpeg");
    const ffmpegPath = ffmpegInstaller.path;

    logger.debug({ ffmpegPath, args, timeoutMs }, "Starting FFmpeg spawn process");

    const process = spawn(ffmpegPath, args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const timer = setTimeout(() => {
      killed = true;
      process.kill('SIGKILL');
      reject(new Error(`FFmpeg process timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    process.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr?.on('data', (data) => {
      stderr += data.toString();
      // FFmpeg는 진행 상황을 stderr로 출력
      if (stderr.includes('frame=') || stderr.includes('time=')) {
        logger.debug({ progress: stderr.slice(-200) }, "FFmpeg progress");
      }
    });

    process.on('close', (code) => {
      clearTimeout(timer);
      if (killed) return;

      if (code === 0) {
        resolve(stdout);
      } else {
        logger.error({ code, stderr: stderr.slice(-500), stdout }, "FFmpeg process failed");
        reject(new Error(`FFmpeg process exited with code ${code}: ${stderr.slice(-500)}`));
      }
    });

    process.on('error', (error) => {
      clearTimeout(timer);
      logger.error({ error }, "FFmpeg spawn error");
      reject(new Error(`Failed to spawn FFmpeg process: ${error.message}`));
    });
  });
}
```

---

## 3. 기술적 세부사항

### 3.1 FFmpeg Concat Demuxer

`-f concat` 옵션을 사용하면 재인코딩 없이 비디오 결합 가능:

```bash
# concat_list.txt 파일 형식
file '/path/to/video1.mp4'
file '/path/to/video2.mp4'

# FFmpeg 명령
ffmpeg -f concat -safe 0 -i concat_list.txt -c copy output.mp4
```

| 옵션 | 설명 |
|------|------|
| `-f concat` | concat demuxer 사용 |
| `-safe 0` | 절대 경로 허용 |
| `-c copy` | 재인코딩 없이 스트림 복사 |
| `-y` | 출력 파일 덮어쓰기 |

### 3.2 Timeout 처리

```typescript
const timer = setTimeout(() => {
  killed = true;
  process.kill('SIGKILL');  // 강제 종료
  reject(new Error(`FFmpeg process timed out after ${timeoutMs}ms`));
}, timeoutMs);  // 5분 = 300000ms
```

### 3.3 처리 흐름

```
concatVideos 호출
    ↓
concat_list.txt 생성
    ↓
runFFmpegSpawn 호출 (5분 timeout)
    ↓
FFmpeg concat demuxer 실행
    ↓
비디오 결합 완료
    ↓
concat_list.txt 정리
```

---

## 4. 테스트 결과

### 4.1 배포 정보

- **Build ID:** `0275c5d7-5cb7-41c4-9d6e-83b6af2e90cc`
- **Revision:** `short-video-maker-00018-ndd`
- **Region:** `asia-northeast3`

### 4.2 테스트 영상

| 항목 | 값 |
|------|-----|
| **JobId** | `cmimhl9o100040es6btic1ije` |
| **YouTube Video ID** | `GFDi9dY82ac` |
| **YouTube URL** | https://www.youtube.com/watch?v=GFDi9dY82ac |
| **Channel** | ATT |

### 4.3 처리 시간 비교

| 단계 | 이전 (fluent-ffmpeg) | 이후 (spawn) |
|------|---------------------|--------------|
| Video Concat | **∞ (hang)** | **8초** |
| 전체 처리 | 실패 | 성공 |

### 4.4 성공 로그

```
01:51:02 🎬 Combining trimmed VEO3 video clips
01:51:02 Concatenating videos with FFmpeg spawn
01:51:10 Video merge complete via spawn
01:51:10 ✅ Video clips combined successfully
```

---

## 5. 관련 수정 이력

### 5.1 유사한 Cloud Run 호환성 수정

| 날짜 | 문제 | 해결 |
|------|------|------|
| 2025-11-30 | Whisper ETIMEDOUT | async spawn 사용 |
| 2025-12-01 | FFmpeg mergeToFile hang | spawn + timeout |

### 5.2 영향받는 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/short-creator/libraries/FFmpeg.ts` | spawn 기반 concatVideos 구현 |

---

## 6. 다음 AI를 위한 참고사항

### 6.1 Cloud Run에서 외부 프로세스 실행 시 주의사항

1. **fluent-ffmpeg 사용 금지** (concat/merge 관련)
2. **spawnSync 사용 금지** (timeout 불가)
3. **spawn + timeout 패턴** 권장

### 6.2 문제 해결 체크리스트

1. **영상 결합 hang** → `concatVideos`가 spawn 기반인지 확인
2. **Timeout 발생** → 300000ms (5분) 타임아웃 조정 필요시 수정
3. **concat 실패** → concat_list.txt 경로 및 파일 존재 확인

### 6.3 로그 확인 명령어

```bash
# FFmpeg 관련 로그
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="short-video-maker" AND (jsonPayload.msg:"FFmpeg" OR jsonPayload.msg:"concat" OR jsonPayload.msg:"merge")' \
  --project=dkdk-474008 \
  --limit=30 \
  --format='value(timestamp,jsonPayload.msg)'

# 영상 결합 단계 로그
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="short-video-maker" AND jsonPayload.msg:"Combining"' \
  --project=dkdk-474008 \
  --limit=10 \
  --format='value(timestamp,jsonPayload.msg)'
```

---

## 7. 커밋 정보

### 변경된 파일:

```
src/short-creator/libraries/FFmpeg.ts
docs/2025-12-01-ffmpeg-spawn-fix.md (이 문서)
```

### 관련 커밋:

```bash
# 최근 커밋 확인
git log --oneline -5

# FFmpeg.ts 변경 내용
git diff HEAD~1 src/short-creator/libraries/FFmpeg.ts
```

---

*문서 작성: 2025-12-01*
