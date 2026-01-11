# YTB-TTS Migration Guide

> 기존 TTS/Audio 코드를 새 YTB-tts 모듈로 점진적 마이그레이션하는 가이드

## 현재 상태 (2026-01-08 업데이트)

### ✅ 완료된 작업
- **Phase 1 Step 1.1 완료:** TTSProvider.ts가 YTB-tts 모듈로 마이그레이션됨
- **호환 메서드 추가:** ElevenLabsTTS, GoogleTTS에 `generate()`, `listAvailableVoices()`, `init()` 메서드 추가
- **Phase 2 완료:** ShortCreatorRefactored.ts, index.ts 마이그레이션됨
- **Phase 3 Step 3.1 완료:** ConsistentShortsWorkflow.ts 마이그레이션됨 ✅ (2026-01-08)
  - FreesoundSoundEffects: `generate({ text, duration_seconds })` 호환 메서드 추가
  - FreesoundSoundEffects: `generateTransition(type)` outputPath 옵션화
  - LoudlyBGM: `generateFromPreset()`, `generateForMood()` 시그니처 감지 방식
  - FREESOUND_PRESETS에 CatProject 프리셋 추가 (LAUGH, SUCCESS, MAGIC, GASP, AWW, CHEER)
- **Phase 3 Step 3.2 완료:** AudioProcessor.ts (Whisper) 마이그레이션됨 ✅ (2026-01-08)
  - WhisperSTT: `init(config)` 정적 팩토리 메서드 추가
  - WhisperSTT: `CreateCaption(audioPath)` 호환 메서드 추가
  - index.ts, ShortCreatorRefactored.ts Whisper import 변경
- **빌드 검증:** 모든 단계에서 타입 오류 없이 빌드 성공

### ✅ Phase 4 완료 (2026-01-08)
- 기존 파일들 deprecated 폴더로 이동:
  - `Whisper.ts`
  - `elevenlabs-tts/`
  - `google-tts/`
  - `freesound/`
  - `loudly/`
- `scripts/install.ts` Whisper import 변경
- `libraries/index.ts` re-export 설정

### 🐛 버그 수정 (2026-01-08)
- **WhisperSTT.init() 설치 로직 누락 수정:**
  - 코드 리뷰에서 발견: `WhisperSTT.init()`에 whisper.cpp 설치 로직 누락
  - 기존 `Whisper.init()`에서 `installWhisperCpp()`, `downloadWhisperModel()` 호출 필요
  - 로컬 환경 (non-Docker)에서 whisper.cpp 자동 설치 지원
  - 기본값 처리: `version || '1.5.4'`, `model || 'base'`

### 📋 남은 작업
- 없음! 🎉 마이그레이션 완료

---

## 원래 상태

### 기존 코드 위치 (현재 사용 중)
```
src/short-creator/libraries/
├── elevenlabs-tts/
│   ├── ElevenLabsTTS.ts        # TTS 생성
│   └── ElevenLabsSoundEffects.ts  # 효과음 생성
├── google-tts/
│   └── GoogleTTS.ts            # Google TTS
├── freesound/
│   └── FreesoundSoundEffects.ts  # Freesound 효과음
├── loudly/
│   ├── LoudlyBGM.ts            # BGM 생성
│   └── types.ts
├── Whisper.ts                  # STT (음성→텍스트)
└── TTSProvider.ts              # TTS wrapper
```

### 새 YTB-tts 모듈 (마이그레이션 대상)
```
src/YTB-tts/
├── index.ts                    # 메인 export
├── interfaces/                 # 인터페이스 정의
│   ├── ITTSProvider.ts
│   ├── ISoundEffects.ts
│   ├── IBGMProvider.ts
│   └── ISTTProvider.ts
├── providers/
│   ├── tts/                    # TTS 프로바이더
│   │   ├── ElevenLabsTTS.ts
│   │   └── GoogleTTS.ts
│   ├── sound-effects/          # 효과음 프로바이더
│   │   ├── ElevenLabsSoundEffects.ts
│   │   └── FreesoundSoundEffects.ts
│   ├── bgm/                    # BGM 프로바이더
│   │   └── LoudlyBGM.ts
│   └── stt/                    # STT 프로바이더
│       └── WhisperSTT.ts
├── presets/                    # 효과음 프리셋
│   └── soundPresets.ts
└── factories/                  # 팩토리 패턴
    └── AudioProviderFactory.ts
```

---

## 파일별 매핑 테이블

| 기존 파일 | YTB-tts 대응 파일 | 사용처 |
|----------|------------------|--------|
| `libraries/elevenlabs-tts/ElevenLabsTTS.ts` | `YTB-tts/providers/tts/ElevenLabsTTS.ts` | index.ts, ShortCreatorRefactored.ts |
| `libraries/google-tts/GoogleTTS.ts` | `YTB-tts/providers/tts/GoogleTTS.ts` | index.ts, ShortCreatorRefactored.ts, TTSProvider.ts |
| `libraries/freesound/FreesoundSoundEffects.ts` | `YTB-tts/providers/sound-effects/FreesoundSoundEffects.ts` | ConsistentShortsWorkflow.ts |
| `libraries/elevenlabs-tts/ElevenLabsSoundEffects.ts` | `YTB-tts/providers/sound-effects/ElevenLabsSoundEffects.ts` | (미사용) |
| `libraries/loudly/LoudlyBGM.ts` | `YTB-tts/providers/bgm/LoudlyBGM.ts` | ConsistentShortsWorkflow.ts |
| `libraries/Whisper.ts` | `YTB-tts/providers/stt/WhisperSTT.ts` | index.ts, AudioProcessor.ts |

---

## 마이그레이션 단계

### Phase 1: 낮은 위험도 파일 (테스트용)

#### Step 1.1: TTSProvider.ts 교체

**파일:** `src/short-creator/libraries/TTSProvider.ts`

**변경 전:**
```typescript
import { GoogleTTS } from "./google-tts";
import { ElevenLabsTTS } from "./elevenlabs-tts";
```

**변경 후:**
```typescript
// Phase 1 Migration: YTB-tts 모듈로 전환
import { GoogleTTS, ElevenLabsTTS } from "../../YTB-tts";
```

**상태:** ✅ 완료 (2026-01-07)

**테스트 결과:**
```bash
pnpm run build  # ✅ 성공
```

#### Step 1.2: deprecated/ShortCreator.ts 교체

**파일:** `src/short-creator/deprecated/ShortCreator.ts`

이미 deprecated 폴더에 있으므로 위험도 낮음.

---

### Phase 2: 중간 위험도 파일

#### Step 2.1: index.ts 교체

**파일:** `src/index.ts`

**변경 전:**
```typescript
import { GoogleTTS } from "./short-creator/libraries/google-tts";
import { ElevenLabsTTS } from "./short-creator/libraries/elevenlabs-tts";
import { Whisper } from "./short-creator/libraries/Whisper";
```

**변경 후:**
```typescript
import { GoogleTTS, ElevenLabsTTS } from "./YTB-tts";
// Whisper는 인터페이스가 다르므로 별도 처리 필요
import { Whisper } from "./short-creator/libraries/Whisper"; // 유지
```

**주의:** Whisper와 WhisperSTT는 인터페이스가 다름
- 기존 Whisper: `CreateCaption(audioPath)` → `Caption[]`
- 새 WhisperSTT: `transcribe(audioPath, options)` → `STTResult`

#### Step 2.2: ShortCreatorRefactored.ts 교체

**파일:** `src/short-creator/ShortCreatorRefactored.ts`

동일한 패턴으로 import 변경.

---

### Phase 3: 높은 위험도 파일 (핵심 워크플로우)

#### Step 3.1: ConsistentShortsWorkflow.ts 교체

**파일:** `src/short-creator/workflows/ConsistentShortsWorkflow.ts`

**변경 전:**
```typescript
import { FreesoundSoundEffects, FreesoundPresets } from "../libraries/freesound";
import { LoudlyBGM } from "../libraries/loudly";
```

**변경 후:**
```typescript
import { FreesoundSoundEffects, LoudlyBGM } from "../../YTB-tts";
import { FREESOUND_PRESETS as FreesoundPresets } from "../../YTB-tts";
```

**주의사항:**
- `FreesoundPresets`는 `FREESOUND_PRESETS`로 이름 변경됨
- 또는 기존 presets를 YTB-tts에서 re-export 추가 필요

#### Step 3.2: AudioProcessor.ts 교체

**파일:** `src/short-creator/processors/AudioProcessor.ts`

Whisper 인터페이스 차이로 인해 추가 작업 필요.

---

### Phase 4: 기존 파일 Deprecated 이동

모든 마이그레이션 완료 후:

```bash
# deprecated 폴더로 이동
mv src/short-creator/libraries/elevenlabs-tts src/short-creator/deprecated/
mv src/short-creator/libraries/google-tts src/short-creator/deprecated/
mv src/short-creator/libraries/freesound src/short-creator/deprecated/
mv src/short-creator/libraries/loudly src/short-creator/deprecated/
mv src/short-creator/libraries/Whisper.ts src/short-creator/deprecated/
mv src/short-creator/libraries/TTSProvider.ts src/short-creator/deprecated/
```

---

## 테스트 체크리스트

### 각 Phase 완료 후 필수 테스트:

- [ ] `pnpm run build` 성공
- [ ] TypeScript 타입 에러 없음
- [ ] CatProject JSON 테스트 (COFFEE-BATTLE-7SFX.json)

### CatProject 테스트 명령:
```bash
# API 서버 실행
pnpm run dev

# 테스트 요청 (별도 터미널)
curl -X POST http://localhost:3000/api/video/consistent-shorts \
  -H "Content-Type: application/json" \
  -d @docs/CatProject/template/video/COFFEE-BATTLE-7SFX.json
```

### 확인 항목:
- [ ] TTS 음성 생성 정상
- [ ] 효과음 (CAT_PURR, WHOOSH, LAUGH 등) 정상
- [ ] BGM 로딩 정상
- [ ] 최종 비디오 생성 정상

---

## 롤백 계획

문제 발생시:

1. **Git으로 되돌리기:**
```bash
git checkout -- src/short-creator/libraries/
git checkout -- src/index.ts
# 등등 변경된 파일
```

2. **YTB-tts 모듈 삭제 (필요시):**
```bash
rm -rf src/YTB-tts/
```

기존 코드는 그대로 유지되므로 롤백 쉬움.

---

## 인터페이스 차이점 및 호환성 해결

### ElevenLabsTTS (✅ 호환 메서드 추가됨)

| 항목 | 기존 | YTB-tts 새 인터페이스 | YTB-tts 호환 메서드 |
|-----|-----|--------|---------|
| 메서드 | `generate(text, voice)` | `synthesize(text, outputPath, options)` | ✅ `generate()` 추가됨 |
| 반환값 | `{ audio, audioLength, alignment }` | `{ path, duration, text, voiceId }` | ✅ 기존 형태 지원 |
| 팩토리 | `ElevenLabsTTS.init(config)` | `new ElevenLabsTTS(options)` | ✅ `init()` 추가됨 |
| 음성목록 | `listAvailableVoices(): Voices[]` | `getVoices(): TTSVoice[]` | ✅ `listAvailableVoices()` 추가됨 |

### GoogleTTS (✅ 호환 메서드 추가됨)

| 항목 | 기존 | YTB-tts 새 인터페이스 | YTB-tts 호환 메서드 |
|-----|-----|--------|---------|
| 메서드 | `generate(text, voice)` | `synthesize(text, outputPath, options)` | ✅ `generate()` 추가됨 |
| 반환값 | `{ audio, audioLength }` | `{ path, duration, text, voiceId }` | ✅ 기존 형태 지원 |
| 팩토리 | `GoogleTTS.init(config)` | `new GoogleTTS(options)` | ✅ `init()` 추가됨 |
| 음성목록 | `listAvailableVoices(): Voices[]` | `getVoices(): TTSVoice[]` | ✅ `listAvailableVoices()` 추가됨 |

### Whisper vs WhisperSTT (✅ 호환 메서드 추가됨)

| 항목 | 기존 Whisper | YTB-tts 새 인터페이스 | YTB-tts 호환 메서드 |
|-----|-------------|-------------------|---------|
| 팩토리 | `Whisper.init(config)` | `new WhisperSTT(options)` | ✅ `init()` 추가됨 |
| 메서드 | `CreateCaption(audioPath)` | `transcribe(audioPath, options)` | ✅ `CreateCaption()` 추가됨 |
| 반환값 | `Caption[]` | `STTResult { text, segments, language, duration }` | ✅ 기존 형태 지원 |

**호환 메서드 위치:** `src/YTB-tts/providers/stt/WhisperSTT.ts` 하단 "Backward Compatibility Methods" 섹션

### 호환 메서드 위치

- `src/YTB-tts/providers/tts/ElevenLabsTTS.ts` - 하단에 "Backward Compatibility Methods" 섹션
- `src/YTB-tts/providers/tts/GoogleTTS.ts` - 하단에 "Backward Compatibility Methods" 섹션
- `src/YTB-tts/providers/sound-effects/FreesoundSoundEffects.ts` - `generate()`, `generateTransition()` 호환 메서드
- `src/YTB-tts/providers/bgm/LoudlyBGM.ts` - `generateFromPreset()`, `generateForMood()` 시그니처 감지 방식
- `src/YTB-tts/providers/stt/WhisperSTT.ts` - `init()`, `CreateCaption()` 호환 메서드

---

## 다음 단계 (AI 참고용)

### ✅ 완료된 단계
1. **Phase 1 Step 1.1:** TTSProvider.ts 교체 완료
2. **호환 메서드 추가:** generate(), listAvailableVoices(), init()
3. **Phase 2:** ShortCreatorRefactored.ts, index.ts 교체 완료
4. **Phase 3 Step 3.1:** ConsistentShortsWorkflow.ts (Freesound, Loudly BGM) 교체 완료 ✅
   - FreesoundSoundEffects: `generate({ text, duration_seconds })` → `{ audio: ArrayBuffer }` 호환 메서드 추가
   - FreesoundSoundEffects: `generateTransition(type)` 단일 인자 호환 지원
   - LoudlyBGM: `generateFromPreset(id, duration?)` → `{ audio: ArrayBuffer }` 시그니처 감지 방식
5. **Phase 3 Step 3.2:** AudioProcessor.ts (Whisper) 교체 완료 ✅
   - WhisperSTT: `init(config)` 정적 팩토리 메서드 추가
   - WhisperSTT: `CreateCaption(audioPath)` 호환 메서드 추가
   - Whisper alias export 추가

6. **Phase 4:** deprecated 이동 완료 ✅
   - Whisper.ts, elevenlabs-tts/, google-tts/, freesound/, loudly/ 폴더 이동
   - scripts/install.ts Whisper import 변경
   - libraries/index.ts re-export 설정

### 📋 남은 단계
- 없음! 🎉 **마이그레이션 100% 완료**

**참고:** deprecated/ShortCreator.ts는 건너뜀 (사용되지 않음)

### 🚀 배포 준비 완료
모든 마이그레이션이 완료되어 Cloud Run 배포 가능 상태입니다.
```bash
gcloud builds submit --config=cloudbuild.yaml
```

---

## FreesoundSoundEffects 호환성 (✅ 완료)

| 항목 | 기존 | YTB-tts 새 인터페이스 | YTB-tts 호환 메서드 |
|-----|-----|--------|---------|
| 메서드 | `generate({ text, duration_seconds })` | `generateFromText(text, outputPath, options)` | ✅ `generate()` 추가됨 |
| 반환값 | `{ audio: ArrayBuffer, duration, prompt, ... }` | `{ path: string, duration, description, ... }` | ✅ 기존 형태 지원 |
| Transition | `generateTransition(type)` | `generateTransition(type, outputPath)` | ✅ outputPath 옵션화 |

### LoudlyBGM 호환성 (✅ 완료)

| 항목 | 기존 | YTB-tts 새 인터페이스 | YTB-tts 호환 |
|-----|-----|--------|---------|
| 메서드 | `generateFromPreset(id, duration?)` | `generateFromPreset(id, outputPath, duration?)` | ✅ 시그니처 감지 |
| 반환값 | `{ audio: ArrayBuffer, duration, ... }` | `{ path: string, duration, ... }` | ✅ 기존 형태 지원 |
| Mood | `generateForMood(mood, duration?)` | `generateForMood(mood, outputPath, options?)` | ✅ 시그니처 감지 |

---

## 관련 파일

- `src/YTB-tts/index.ts` - 새 모듈 진입점
- `docs/CatProject/template/video/COFFEE-BATTLE-7SFX.json` - 테스트용 JSON
- `src/short-creator/workflows/ConsistentShortsWorkflow.ts` - 핵심 워크플로우

---

*최종 업데이트: 2026-01-08*
