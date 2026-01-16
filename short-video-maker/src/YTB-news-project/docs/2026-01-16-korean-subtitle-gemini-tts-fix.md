# Korean Subtitle & Gemini TTS Fix

**Date:** 2026-01-16
**Status:** Completed
**Author:** Claude Code

---

## Summary

NewsProject 한글 자막 렌더링 및 Gemini TTS 통합 문제 해결.

### 해결된 문제들

1. **한글 자막 ☒☒☒ 박스 문제**
   - 원인: FFmpeg drawtext 필터에서 한글 텍스트 인코딩 문제
   - 해결: NFC 정규화 + UTF-8 locale 설정

2. **Gemini TTS Voice Validation 오류**
   - 원인: ElevenLabs voice ID가 Gemini TTS로 전달되어 "Voice not supported" 오류
   - 해결: GeminiTTS.generate()에서 voice ID 유효성 검사 추가

3. **Gemini TTS Voice Names 오류**
   - 원인: 코드에 잘못된 voice name 사용 (Achernar, Despina 등)
   - 해결: 공식 API voice name으로 업데이트 (Kore, Puck, Charon 등)

4. **Raw PCM Audio 처리 오류**
   - 원인: Gemini TTS는 raw PCM (24kHz, 16-bit, mono) 반환, FFmpeg 자동 감지 실패
   - 해결: AudioProcessor에서 포맷 감지 후 적절한 입력 옵션 적용

---

## 수정된 파일들

### 1. `src/YTB-tts/providers/tts/GeminiTTS.ts`

```typescript
// Voice validation 추가
if (voice) {
  const isFemale = GEMINI_KOREAN_VOICES.female.some(v => v.name === voice);
  const isMale = GEMINI_KOREAN_VOICES.male.some(v => v.name === voice);

  if (isFemale || isMale) {
    selectedVoice = { name: voice, gender: isFemale ? 'female' : 'male' };
  } else {
    // 유효하지 않은 voice → 랜덤 voice 사용
    selectedVoice = this.getRandomVoice(options?.gender);
  }
}

// 공식 API Voice Names
export const GEMINI_KOREAN_VOICES = {
  female: [
    { name: 'Kore', style: 'clear', description: '또렷하고 명확한 목소리' },
    { name: 'Leda', style: 'warm', description: '따뜻하고 친근한 목소리' },
    { name: 'Zephyr', style: 'gentle', description: '부드럽고 편안한 목소리' },
    { name: 'Aoede', style: 'bright', description: '밝고 생동감 있는 목소리' },
  ],
  male: [
    { name: 'Puck', style: 'upbeat', description: '활기차고 경쾌한 목소리' },
    { name: 'Charon', style: 'firm', description: '단단하고 힘 있는 목소리' },
    { name: 'Fenrir', style: 'deep', description: '깊고 중후한 목소리' },
    { name: 'Enceladus', style: 'calm', description: '차분하고 안정적인 목소리' },
  ],
};
```

### 2. `src/YTB-ffmpeg/AudioProcessor.ts`

```typescript
// Raw PCM 포맷 감지 및 처리
async saveNormalizedAudio(audio: ArrayBuffer, outputPath: string): Promise<string> {
  const buffer = Buffer.from(audio);
  const isMP3 = buffer[0] === 0xFF && (buffer[1] === 0xFB || buffer[1] === 0xFA);
  const isWAV = buffer.toString('ascii', 0, 4) === 'RIFF';
  const isOGG = buffer.toString('ascii', 0, 4) === 'OggS';
  const hasHeader = isMP3 || isWAV || isOGG;

  if (hasHeader) {
    return this.normalizeStandardAudio(audio, outputPath);
  } else {
    // Raw PCM (Gemini TTS: 24kHz, 16-bit, mono)
    return this.normalizePcmAudio(audio, outputPath);
  }
}

private async normalizePcmAudio(audio: ArrayBuffer, outputPath: string): Promise<string> {
  // FFmpeg에 명시적 입력 포맷 지정
  ffmpeg()
    .input(inputStream)
    .inputFormat('s16le')
    .inputOptions(['-ar 24000', '-ac 1'])
    .audioFrequency(16000)  // Whisper용 16kHz
    .toFormat('wav')
    .save(outputPath);
}
```

### 3. `src/YTB-ffmpeg/SubtitleFilter.ts`

```typescript
// 한글 NFC 정규화
import { normalize } from 'path';

private normalizeKorean(text: string): string {
  // NFD → NFC 변환 (한글 자모 분리 방지)
  return text.normalize('NFC');
}
```

### 4. `gcp.Dockerfile`

```dockerfile
# UTF-8 locale 설정 (한글 자막 필수)
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8

# 한글 폰트 설치
RUN apt install -y fonts-nanum fontconfig && fc-cache -fv
```

### 5. Cloud Run 환경변수

```bash
# TTS Provider를 Gemini로 변경
gcloud run services update short-video-maker \
  --region=us-central1 \
  --update-env-vars="TTS_PROVIDER=gemini"
```

---

## Gemini TTS 공식 Voice 목록

| Voice | Gender | Style | 설명 |
|-------|--------|-------|------|
| Kore | Female | Clear | 또렷하고 명확 (뉴스/안내 추천) |
| Leda | Female | Warm | 따뜻하고 친근 |
| Zephyr | Female | Gentle | 부드럽고 편안 |
| Aoede | Female | Bright | 밝고 생동감 |
| Puck | Male | Upbeat | 활기차고 경쾌 |
| Charon | Male | Firm | 단단하고 힘 있음 (뉴스 추천) |
| Fenrir | Male | Deep | 깊고 중후 |
| Enceladus | Male | Calm | 차분하고 안정적 |

---

## 테스트

### API 호출

```bash
curl -X POST "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/news/create" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_version": "1.0.0",
    "channel": { "name": "test", "display_name": "테스트" },
    "global_config": {
      "audio": { "voice": "Kore", "tts_provider": "gemini" },
      "video": { "orientation": "portrait" }
    },
    "videos": [{
      "video_id": "test-01",
      "title": "한글 테스트",
      "scenes": [{
        "scene_id": 1,
        "narration": "안녕하세요, 한글 자막 테스트입니다.",
        "image_prompt": "news studio",
        "duration": 3
      }]
    }]
  }'
```

### 결과

- **Video ID:** `news_korean-subtitle-test-01_cmkgh4u2500020ps6a8hh7efm`
- **Status:** completed
- **한글 자막:** 정상 렌더링 (☒☒☒ 박스 문제 해결)

---

## 관련 이슈

- ElevenLabs Free Tier 비활성화 → Gemini TTS로 전환
- Gemini TTS API는 raw PCM (headerless) 반환 → AudioProcessor 수정 필요
- 한글 텍스트는 반드시 NFC 정규화 필요

---

## 참고 문서

- [Gemini TTS API 공식 문서](https://ai.google.dev/gemini-api/docs/speech-generation)
- [FFmpeg drawtext 필터](https://ffmpeg.org/ffmpeg-filters.html#drawtext)
