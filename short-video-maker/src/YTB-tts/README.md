# YTB-TTS Module

> TTS, Sound Effects, BGM, STT 통합 오디오 모듈
> Last Updated: 2026-01-23
> Status: **v2.0 - 다국어 지원 (한국어/영어)**

---

## 모듈 구조

```
YTB-tts/
├── index.ts              # 메인 export
├── README.md             # 이 파일
│
├── interfaces/           # 인터페이스 정의
│   ├── ITTSProvider.ts   # TTS 제공자 인터페이스
│   ├── ISTTProvider.ts   # STT 제공자 인터페이스
│   ├── ISoundEffects.ts  # 효과음 인터페이스
│   └── IBGMProvider.ts   # BGM 제공자 인터페이스
│
├── providers/
│   ├── tts/
│   │   ├── GeminiTTS.ts      # ✅ Gemini TTS (한국어/영어)
│   │   ├── GoogleTTS.ts      # Google Cloud TTS
│   │   └── ElevenLabsTTS.ts  # ElevenLabs TTS
│   │
│   ├── stt/
│   │   └── WhisperSTT.ts     # OpenAI Whisper STT
│   │
│   ├── sound-effects/
│   │   ├── ElevenLabsSoundEffects.ts
│   │   └── FreesoundSoundEffects.ts
│   │
│   └── bgm/
│       └── LoudlyBGM.ts
│
├── factories/
│   └── AudioProviderFactory.ts  # 제공자 팩토리
│
├── presets/
│   └── soundPresets.ts         # 프리셋 정의
│
└── types/
    └── index.ts               # 공통 타입
```

---

## 사용 방법

### 기본 Import

```typescript
// 전체 import
import { GeminiTTS, ElevenLabsTTS, GoogleTTS } from './YTB-tts';

// Factory 사용
import { AudioProviderFactory } from './YTB-tts';
```

### GeminiTTS (권장)

```typescript
import { GeminiTTS } from './YTB-tts';

// 초기화
const tts = new GeminiTTS({
  apiKey: process.env.GOOGLE_GEMINI_API_KEY,
  model: 'gemini-2.5-flash-preview-tts',  // 빠른 응답
  // model: 'gemini-2.5-pro-preview-tts', // 고품질
  defaultGender: 'female',
});

// 한국어 TTS
const koreanResult = await tts.generate(
  '안녕하세요, 반갑습니다.',
  undefined,  // voice 자동 선택
  { language: 'ko' }
);

// 영어 TTS
const englishResult = await tts.generate(
  'Hello, nice to meet you.',
  undefined,
  { language: 'en' }
);

// 특정 voice 지정
const customResult = await tts.generate(
  '특정 목소리로 말합니다.',
  'Kore',  // voice 이름
  { language: 'ko', gender: 'female' }
);
```

---

## GeminiTTS Voice 목록

### 한국어 (ko)

| Voice | Gender | Style | 설명 |
|-------|--------|-------|------|
| **Kore** | female | clear | 또렷하고 명확한 목소리 (기본값) |
| Leda | female | warm | 따뜻하고 친근한 목소리 |
| Zephyr | female | gentle | 부드럽고 편안한 목소리 |
| Aoede | female | bright | 밝고 생동감 있는 목소리 |
| Puck | male | upbeat | 활기차고 경쾌한 목소리 |
| **Charon** | male | firm | 단단하고 힘 있는 목소리 (기본값) |
| Fenrir | male | deep | 깊고 중후한 목소리 |
| Enceladus | male | calm | 차분하고 안정적인 목소리 |

### 영어 (en)

| Voice | Gender | Style | Description |
|-------|--------|-------|-------------|
| **Aoede** | female | bright | Bright and lively voice (default) |
| Leda | female | warm | Warm and friendly voice |
| Zephyr | female | gentle | Soft and soothing voice |
| Achernar | female | smooth | Smooth and elegant voice |
| **Puck** | male | upbeat | Upbeat and energetic voice (default) |
| Charon | male | firm | Strong and authoritative voice |
| Algenib | male | confident | Confident and clear voice |
| Alnilam | male | deep | Deep and resonant voice |

### 뉴스 숏츠 추천 Voice

| 용도 | 여성 | 남성 |
|------|------|------|
| 뉴스/안내 | Kore, Aoede | Charon, Puck |

---

## 언어별 기본 Voice

```typescript
// 자동 선택 규칙
const DEFAULT_VOICE_BY_LANGUAGE = {
  ko: { female: 'Kore', male: 'Charon' },
  en: { female: 'Aoede', male: 'Puck' },
};
```

---

## 프로젝트별 사용 현황

| 프로젝트 | TTS Provider | 용도 |
|---------|--------------|------|
| YTB-books-project | GeminiTTS | 책/논문 → Shorts 나레이션 |
| YTB-news-project | GeminiTTS + ElevenLabs | 뉴스 숏츠 나레이션 |
| short-creator | ElevenLabs → Gemini (fallback) | 일반 숏츠 |

---

## Config 옵션

### BooksVideoService 예시

```typescript
// 한국어 콘텐츠 (기본값)
await booksVideoService.createShortVideo({
  bookId: 'AR_TALK.pdf',
  shortPlan: plan,
  imagePaths: images,
  config: {
    language: 'ko',      // 한국어 → Kore voice
    orientation: 'portrait',
  }
});

// 영어 콘텐츠
await booksVideoService.createShortVideo({
  bookId: 'ENGLISH_PAPER.pdf',
  shortPlan: plan,
  imagePaths: images,
  config: {
    language: 'en',      // 영어 → Aoede voice
    orientation: 'portrait',
  }
});

// 특정 voice 지정
await booksVideoService.createShortVideo({
  bookId: 'AR_TALK.pdf',
  shortPlan: plan,
  imagePaths: images,
  config: {
    language: 'ko',
    ttsVoice: 'Charon',  // 남성 목소리 직접 지정
    ttsGender: 'male',
  }
});
```

---

## API Reference

### GeminiTTS

```typescript
class GeminiTTS {
  constructor(config?: GeminiTTSConfig);

  // 텍스트 → 음성 변환
  generate(
    text: string,
    voice?: string,
    options?: {
      language?: 'ko' | 'en';
      gender?: 'female' | 'male' | 'random';
      useNewsVoice?: boolean;
      stylePrompt?: string;
    }
  ): Promise<GeminiTTSResult>;

  // Voice 선택 헬퍼
  getDefaultVoice(language?: 'ko' | 'en', gender?: GeminiVoiceGender);
  getRandomVoice(gender?: GeminiVoiceGender);
  getRandomVoiceByLanguage(language?: 'ko' | 'en', gender?: GeminiVoiceGender);
  getNewsVoice(gender?: GeminiVoiceGender);
  getVoiceGender(voiceName: string): 'female' | 'male';

  // Voice 목록
  listVoices(gender?: GeminiVoiceGender);
  listNewsVoices();
  listAvailableVoices(): string[];
}
```

### GeminiTTSResult

```typescript
interface GeminiTTSResult {
  audio: ArrayBuffer;      // PCM 오디오 데이터 (24kHz, 16-bit, mono)
  audioLength: number;     // 추정 길이 (초)
  voice: string;           // 사용된 voice 이름
  gender: string;          // 사용된 voice 성별
}
```

---

## 환경변수

```env
# Gemini TTS (필수)
GOOGLE_GEMINI_API_KEY=your-gemini-api-key

# ElevenLabs (선택)
ELEVENLABS_API_KEY=your-elevenlabs-api-key

# Google Cloud TTS (선택 - credentials 파일 필요)
GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json
```

---

## 관련 문서

- [../YTB-books-project/README.md](../YTB-books-project/README.md) - Books 프로젝트
- [../YTB-news-project/README.md](../YTB-news-project/README.md) - News 프로젝트
- [../short-creator/libraries/TTSProvider.ts](../short-creator/libraries/TTSProvider.ts) - TTSProvider 래퍼

---

**Version History:**
- v2.0 (2026-01-23): 다국어 지원 추가 (한국어/영어 voice 분리)
- v1.0: 초기 버전 (한국어 전용)
