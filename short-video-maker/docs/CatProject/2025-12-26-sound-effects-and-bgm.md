# 효과음 (Freesound) + BGM API (Loudly) 구현 완료

**날짜**: 2025-12-26 ~ 2025-12-27

---

## 📋 Quick Summary (다음 AI를 위한 요약)

### 완료된 작업
1. **skipTTS 기능 구현 완료** - TTS 없이 효과음/BGM만으로 영상 생성 가능
2. **버그 수정 (v5~v7)**: sceneDurations 빈 배열, FFmpeg input 순서, Freesound 검색어
3. **🎵 Loudly BGM API 구현 완료** - 로컬 BGM fallback 포함

### 핵심 API 사용법

#### 효과음 + BGM 함께 사용
```json
{
  "config": { "skipTTS": true },
  "audio_config": {
    "backgroundMusic": {
      "source": "happy",
      "volume": 0.3,
      "loop": true
    },
    "soundEffects": [
      { "type": "preset", "value": "CAT_MEOW", "sceneIndex": 0, "offset": 0.5 }
    ]
  }
}
```

#### BGM 소스 옵션
| 소스 타입 | 예시 | 설명 |
|-----------|------|------|
| MusicMoodEnum | `"happy"`, `"chill"` | 무드 기반 자동 선택 |
| Loudly Preset | `"preset:CAT_CUTE"` | 사전 정의된 프리셋 사용 |
| Text Prompt | `"upbeat cat video music"` | 텍스트 프롬프트 (Loudly API 필요) |

### 완료된 작업 ✅
- [x] BGM API 구현 (Loudly + 로컬 fallback)
- [x] 다중 효과음 + BGM 믹싱 지원
- [ ] 다중 효과음 테스트 (테스트 필요)

---

## 1. 효과음 테스트 결과 (Freesound API)

### 테스트 영상 (TTS 포함)
- **Video ID**: `cmjm5mfoo00000es60m5x0cs8`
- **YouTube**: https://www.youtube.com/watch?v=LB-Fhz2Mod0 (unlisted)
- **상태**: 완료

### skipTTS 테스트 영상 (TTS 없이 효과음만)
- **Video ID**: `cmjmc2b0a00000es6ci9faiae`
- **상태**: ✅ 성공! (20251226v7)
- **결과**: 무음 오디오 + CAT_MEOW 효과음 믹싱 성공

### 씬 기반 싱크 동작 확인

| 효과음 | sceneIndex | offset | 씬 시작시간 | 계산된 재생시간 |
|--------|------------|--------|-------------|-----------------|
| CAT_MEOW | 0 | 0.5초 | 0초 | **0.5초** |
| CAT_PURR | 2 | 1.0초 | 6.16초 | **7.16초** |

```
🎯 Sound effect synced to scene
   sceneIndex: 0, offset: 0.5, calculatedStartTime: 0.5

🎯 Sound effect synced to scene
   sceneIndex: 2, offset: 1, calculatedStartTime: 7.158
```

### Freesound API 정보
- **무료 한도**: 60 req/분, 500 다운로드/일
- **사용 중인 키**: GCP Secret Manager에 저장됨
- **프리셋**: CAT_MEOW, CAT_PURR, CAT_PAW, WHOOSH, POP 등

---

## 2. 무료 BGM API 조사 결과

### 현재 상태: 로컬 BGM 31개 보유

`static/music/` 폴더에 이미 31개 무료 BGM 있음:
- Hopeful, Baby Animals Playing, Cafe 등
- YouTube Audio Library에서 가져온 무료 음악

### API 옵션 비교 (2025-12-26 업데이트)

| 서비스 | 무료 한도 | 상업적 사용 | API 지원 | 비고 |
|--------|-----------|-------------|----------|------|
| **Loudly** | Free allowance | ✅ 영구 라이선스 | ✅ | Text-to-Music, 3500+ 트랙 |
| **Mubert AI** | 100 calls/월 | ✅ (Pro $99/월) | ✅ | AI 생성 음악, 무료는 워터마크 |
| **Beatoven.ai** | 1 gen/월 | ❌ 유료 필요 | ✅ | $100/년부터 상업 라이선스 |
| **Jamendo** | 35,000 req/월 | 유료 필요 | ✅ | 50만+ 트랙 |
| **Pixabay** | 무제한 | ✅ | ❌ 음악 미지원 | 이미지/비디오만 |
| **Freesound** | 500 다운/일 | ✅ (CC 라이선스) | ✅ | 효과음 특화 |
| **Replicate (MusicGen)** | 무료 크레딧 | ✅ | ✅ | ~$0.08/gen, 오픈소스 모델 |

### 추천 방안

1. **1순위**: Loudly API (🌟 BEST)
   - 무료 tier로 시작 가능
   - Text-to-Music으로 맞춤 BGM 생성
   - 영구 상업 라이선스 포함
   - 3,500+ 기존 트랙 + AI 생성

2. **2순위**: Replicate (MusicGen)
   - 오픈소스 모델, 상업 사용 OK
   - ~$0.08/generation 저렴
   - mood/genre 프롬프트로 생성

3. **3순위**: 로컬 BGM (`static/music/`)
   - 이미 31개 무료 BGM 보유
   - 추가 비용 없음
   - mood 태그로 자동 선택

4. **4순위**: Freesound (ambient 검색)
   - 이미 효과음으로 사용 중
   - "ambient lofi" 등 검색으로 BGM 대용 가능

---

## 3. 발견된 문제: TTS 음성이 이상함

### 증상
- 영상에 TTS가 "이상하게" 들어감
- 한국어 발음이 어색함

### 원인 (로그 분석)
```
❌ ElevenLabs 실패:
   voice: "Axl" (baRq1qg6PxLsnSQ04d8c)
   error: "This voice is not available for free users."

✅ Fallback 성공:
   fallbackProvider: "Google TTS"
```

**결론**: ElevenLabs 무료 계정에서 "Axl" 음성 사용 불가 → Google TTS로 대체됨 → 한국어 음성이 덜 자연스러움

### 해결 방안

#### 1. ElevenLabs 무료 음성 사용 (권장)
```json
{
  "config": {
    "voice": "el_rachel"  // 또는 el_adam, el_sam
  }
}
```

**무료 사용 가능한 음성:**
| 음성 ID | 이름 | 특징 |
|---------|------|------|
| `el_rachel` | Rachel | Female, American (기본값) |
| `el_adam` | Adam | Male, American |
| `el_sam` | Sam | Male, American |

#### 2. TTS 없이 효과음만 (skipTTS 옵션) ✅ 구현 완료

```json
{
  "config": {
    "skipTTS": true
  },
  "audio_config": {
    "soundEffects": [
      { "type": "preset", "value": "CAT_MEOW", "sceneIndex": 0, "offset": 0.5 }
    ]
  }
}
```

**동작 방식:**
1. TTS 생성 건너뛰기
2. 무음(silent) 오디오 트랙 생성
3. 효과음만 오버레이
4. BGM과 함께 최종 믹싱

**수정된 파일:**
- `src/types/shorts.ts` - skipTTS 옵션 추가
- `src/short-creator/ShortCreatorRefactored.ts` - TTS 스킵 로직
- `src/short-creator/workflows/ConsistentShortsWorkflow.ts` - 무음 트랙 처리
- `src/short-creator/libraries/FFmpeg.ts` - generateSilentAudio 함수

**버그 수정 (20251226v5~v7):**
- `sceneDurations` 배열이 skipTTS 모드에서 비어있던 문제 수정 (v5)
  - 원인: `scene.audio?.url` 체크가 빈 문자열 `''`을 falsy로 처리
  - 해결: duration 수집 로직과 audio URL 수집 로직 분리
- FFmpeg `generateSilentAudio` "No input specified" 에러 수정 (v6)
  - 원인: fluent-ffmpeg에서 `.inputOptions()` → `.input()` 순서 문제
  - 해결: `.input()` → `.inputFormat('lavfi')` → `.duration()` 순서로 변경
- Freesound `CAT_PAW` 검색어 수정 (v7)
  - 원인: "footsteps soft gentle" 쿼리가 0개 결과 반환
  - 해결: "cat footsteps"로 변경

---

## 4. Loudly BGM API 구현 (2025-12-27)

### 구현 파일

| 파일 | 역할 |
|------|------|
| `src/short-creator/libraries/loudly/types.ts` | Loudly API 타입 정의 |
| `src/short-creator/libraries/loudly/LoudlyBGM.ts` | Loudly API 클라이언트 |
| `src/short-creator/libraries/loudly/index.ts` | 모듈 exports |

### 기능

1. **Loudly API 연동** (LOUDLY_API_KEY 환경변수 필요)
   - Text-to-Music 생성
   - 무드/장르 기반 검색
   - 영구 상업 라이선스

2. **로컬 BGM Fallback** (API 키 없을 때)
   - `static/music/` 폴더의 31개 MP3 파일 사용
   - 무드 키워드 매칭으로 적합한 음악 선택
   - YouTube Audio Library (무료)

### 사전 정의 프리셋

```typescript
// 고양이 영상용
CAT_CUTE: 'cute playful music for cat video'
CAT_CHILL: 'relaxing lofi music for cat sleeping'
CAT_HAPPY: 'happy upbeat music for cat playing'

// 일반 Shorts용
SHORTS_UPBEAT: 'energetic upbeat music for short video'
SHORTS_CHILL: 'chill lofi beats for short content'
SHORTS_DRAMATIC: 'dramatic cinematic music for storytelling'

// 감정별
EMOTIONAL_SAD: 'emotional sad piano music'
EMOTIONAL_ROMANTIC: 'romantic love music'
EMOTIONAL_EPIC: 'epic orchestral music'
```

### 무드 매핑

```typescript
MusicMoodEnum → LoudlyMood 변환:
  happy → happy
  sad → sad
  melancholic → sad
  euphoric → energetic
  excited → energetic
  chill → calm
  uneasy → mysterious
  angry → dramatic
  dark → dark
  hopeful → uplifting
  contemplative → calm
  funny → playful
```

### API 사용 예시

#### 1. 무드 기반 BGM
```json
{
  "audio_config": {
    "backgroundMusic": {
      "source": "happy",
      "volume": 0.3,
      "loop": true
    }
  }
}
```

#### 2. 프리셋 사용
```json
{
  "audio_config": {
    "backgroundMusic": {
      "source": "preset:CAT_CUTE",
      "volume": 0.25,
      "loop": true
    }
  }
}
```

#### 3. TTS + 효과음 + BGM 조합
```json
{
  "scenes": [
    { "text": "안녕하세요" }
  ],
  "audio_config": {
    "backgroundMusic": {
      "source": "chill",
      "volume": 0.2,
      "loop": true
    },
    "soundEffects": [
      { "type": "preset", "value": "CAT_MEOW", "sceneIndex": 0, "offset": 0.5 }
    ],
    "transitionSound": {
      "type": "whoosh",
      "volume": 0.5
    }
  }
}
```

### 환경 변수

```bash
# Loudly API (선택사항 - 없으면 로컬 BGM fallback)
LOUDLY_API_KEY=your_api_key_here

# Freesound API (효과음용)
FREESOUND_API_KEY=your_api_key_here
```

---

## 5. 관련 파일

| 파일 | 역할 |
|------|------|
| `src/short-creator/libraries/freesound/FreesoundSoundEffects.ts` | Freesound API 클라이언트 |
| `src/short-creator/libraries/loudly/LoudlyBGM.ts` | Loudly BGM 클라이언트 |
| `src/types/shorts.ts` | SoundEffectConfig, AudioConfig 타입 |
| `src/short-creator/workflows/ConsistentShortsWorkflow.ts` | 효과음 + BGM 믹싱 로직 |
| `src/short-creator/libraries/ffmpeg-core/AudioProcessor.ts` | FFmpeg 오디오 처리 |
| `static/music/*.mp3` | 로컬 BGM 31개 |

---

## 6. 참고 링크

### AI Music APIs (추천)
- [Loudly Music API](https://www.loudly.com/music-api) - Text-to-Music, 영구 상업 라이선스
- [Replicate MusicGen](https://replicate.com/meta/musicgen) - 오픈소스 AI 음악 생성
- [Beatoven.ai](https://www.beatoven.ai/) - Video-to-Music, API 제공

### 기타 음악 APIs
- [Freesound API](https://freesound.org/docs/api/) - 효과음/ambient
- [Jamendo API](https://developer.jamendo.com/v3.0) - 50만+ 트랙
- [Mubert AI](https://mubert.com/) - AI 생성 음악

---

Last Updated: 2025-12-26
