# 이중 자막 (Dual Subtitle) 기능

**날짜:** 2025-12-23
**기능:** 한글/영어 이중 자막 + 상단 제목(titleText) 지원
**상태:** ✅ 전체 기능 구현됨

---

## 목표: 숏츠 어그로용 레이아웃

스크린샷 예시 분석:
```
┌─────────────────────────────────────┐
│  호텔 조식에 진심인                 │  ← 상단 제목 (Hook)
│  부부 커플 특징                     │     노란 하이라이트
├─────────────────────────────────────┤
│                                     │
│         [영상 콘텐츠]               │
│                                     │
├─────────────────────────────────────┤
│      (일어날 생각 없음)             │  ← 자막 (TTS 싱크)
├─────────────────────────────────────┤
│           수달부부                  │  ← 채널명
└─────────────────────────────────────┘
```

---

## 현재 구현 상태 (✅ 사용 가능)

### 1. API 필드

```typescript
// src/types/shorts.ts - sceneInput
{
  text: string,           // 한국어 (TTS + 자막)
  textEnglish?: string,   // 영어 (자막만, TTS 없음)
}
```

### 2. 처리 흐름

```
scenes[].text → TTS 생성 → 한국어 자막 타이밍 계산
                    ↓
scenes[].textEnglish → 영어 자막 생성 (한국어 타이밍에 싱크)
                    ↓
FFmpeg → 이중 자막 렌더링
```

### 3. 현재 자막 위치

| 언어 | Portrait | Landscape |
|------|----------|-----------|
| 한국어 (Primary) | h*0.68 (중앙하단) | h*0.72 |
| 영어 (Secondary) | h*0.76 (하단) | h*0.82 |

### 4. 현재 스타일

- **한국어**: 흰색 (#FFFFFF), 폰트 48px
- **영어**: 연한 파란색 (#B3E5FC), 폰트 36px
- **테두리**: 검정색, 4px
- **그림자**: 검정 70%

---

## 현재 API 사용법

### 요청 예시

```json
{
  "characterReference": {
    "profileId": "otter-couple",
    "characterIds": ["husband", "wife"]
  },
  "scenes": [
    {
      "text": "일어날 생각 없음",
      "textEnglish": "No intention to wake up",
      "scenePrompt": "Cute otter sleeping in bathrobe",
      "characterIds": ["husband"]
    },
    {
      "text": "조식 뷔페가 기다린다",
      "textEnglish": "Breakfast buffet awaits",
      "scenePrompt": "Otter looking at breakfast spread",
      "characterIds": ["husband", "wife"]
    }
  ],
  "config": {
    "orientation": "portrait",
    "generateVideos": true,
    "useStoredImageForVeo": true
  }
}
```

### 결과

- TTS: 한국어만 음성 생성
- 자막: 한국어 + 영어 동시 표시
- 위치: 한국어 위, 영어 아래

---

## 관련 코드 위치

| 파일 | 함수/기능 |
|------|----------|
| `src/types/shorts.ts` | `textEnglish` 필드 정의 |
| `src/server/api/consistent-shorts.ts` | API에서 `textEnglish` 파싱 |
| `src/short-creator/workflows/ConsistentShortsWorkflow.ts` | `generateSyncedEnglishCaptions()` |
| `src/short-creator/libraries/FFmpeg.ts` | `createDualLanguageSubtitleFilter()` |

---

## ✅ 구현된 기능

### Phase 2: 상단 제목 (titleText) - ✅ 구현됨

```json
{
  "titleText": {
    "ko": "호텔 조식에 진심인 부부 커플 특징",
    "en": "Couple's hotel breakfast enthusiasm",  // 선택
    "position": "top",           // top | center (기본: top)
    "style": "highlight",        // highlight (노란배경) | default (흰텍스트)
    "duration": "full",          // "full" | 초 단위 숫자
    "fontSize": 42,              // 폰트 크기 (기본: 42)
    "backgroundColor": "#FFEB3B" // 배경색 (기본: 노란색)
  },
  "scenes": [...]
}
```

**구현 파일:**
| 파일 | 기능 |
|------|------|
| `src/types/shorts.ts` | `TitleTextConfig` 타입 정의 |
| `src/short-creator/libraries/FFmpeg.ts` | `createTitleTextFilter()`, `addTitleAndSubtitlesToVideo()` |
| `src/short-creator/processors/VideoProcessor.ts` | `addTitleAndSubtitlesToVideo()` 래퍼 |
| `src/server/api/consistent-shorts.ts` | API에서 `titleText` 파싱 |
| `src/short-creator/workflows/ConsistentShortsWorkflow.ts` | 메타데이터에서 titleText 처리 |

---

## 🚧 향후 개선 방향

### Phase 1: 위치 커스터마이징

```json
{
  "config": {
    "subtitleConfig": {
      "primaryLanguage": "ko",           // "ko" | "en"
      "primaryPosition": "bottom",       // "top" | "center" | "bottom"
      "secondaryPosition": "center",     // "top" | "center" | "bottom" | null
      "primaryStyle": {
        "color": "#FFEB3B",              // 노란색
        "fontSize": 48,
        "background": true               // 배경색 있음
      },
      "secondaryStyle": {
        "color": "#FFFFFF",
        "fontSize": 36,
        "background": false
      }
    }
  }
}
```

### Phase 2: 자막 스타일 옵션

```json
{
  "scenes": [
    {
      "text": "일어날 생각 없음",
      "captionStyle": "parenthesis"      // "(일어날 생각 없음)" 형태로 표시
    }
  ]
}
```

**captionStyle 옵션:**
- `default`: 일반 텍스트
- `parenthesis`: 괄호로 감싸기 "(텍스트)"
- `highlight`: 노란색 하이라이트
- `quote`: 인용 스타일 "텍스트"

---

## 숏츠 어그로 레이아웃 가이드

### 효과적인 구성

1. **상단 제목 (Hook)**
   - 시청자 주목 끄는 문구
   - 노란색 하이라이트 배경
   - 영상 전체에 고정 표시

2. **중앙 영상**
   - 캐릭터 중심
   - 움직임 있는 콘텐츠

3. **하단 자막**
   - TTS와 싱크
   - 상황 설명 스타일 (괄호)

4. **최하단 채널명**
   - 브랜딩

### 예시 콘텐츠 구조

```
제목: "호텔 조식에 진심인 부부 커플 특징"

씬 1: (잠에서 안 깨는 남편)
  - text: "일어날 생각 없음"
  - textEnglish: "No intention to wake up"

씬 2: (아내가 흔드는 장면)
  - text: "조식 뷔페 9시까지래"
  - textEnglish: "Breakfast buffet closes at 9"

씬 3: (갑자기 눈 뜨는 남편)
  - text: "벌떡"
  - textEnglish: "Springs up"
```

---

## 테스트 체크리스트

- [ ] `textEnglish` 없이 요청 → 한국어 자막만 표시
- [ ] `textEnglish` 포함 요청 → 이중 자막 표시
- [ ] Portrait 방향 테스트
- [ ] Landscape 방향 테스트
- [ ] 긴 텍스트 줄바꿈 테스트
- [ ] 특수문자 이스케이프 테스트

---

## 변경 이력

| 날짜 | 변경 내용 |
|------|----------|
| 2025-12-23 | 기본 이중 자막 기능 문서화 |
| 2025-12-23 | 상단 제목(titleText) 기능 완전 구현 |
| - | 향후 개선 방향 정의 |
