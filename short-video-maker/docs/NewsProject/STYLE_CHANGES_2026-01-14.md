# NewsProject 스타일 변경 사항 (2026-01-14)

## 1. 폰트 설정

### 제목 (Title)
- **폰트**: Black Han Sans (`font/BlackHanSans-Regular.ttf`)
- **크기**: 130px (portrait), 100px (landscape)
- **두 줄 스타일**:
  - 첫 번째 줄: 흰색 (`#FFFFFF`)
  - 두 번째 줄: 노란색 (`#FFEB3B`)
- **테두리**: 검은색, 5px

### 자막 (Subtitle)
- **폰트**: Gmarket Sans Bold (`font/GmarketSansTTFBold.ttf`)
- **크기**: 90px (portrait), 72px (landscape)
- **색상**: 흰색 (`#FFFFFF`)
- **테두리**: 검은색, 6px
- **위치**: 화면 중앙 (h*0.50)

## 2. TTS 설정

### Provider
- **변경**: `google` → `gemini`
- **환경변수**: `TTS_PROVIDER=gemini`

### Gemini TTS 설정
- **모델**: `gemini-2.5-pro-preview-tts` (Pro가 더 자연스러움)
- **기본 성별**: `female`
- **추천 여성 음성**:
  - `Aoede` - 밝고 생동감 있는 목소리
  - `Despina` - 또렷하고 명확한 목소리
  - `Autonoe` - 따뜻하고 친근한 목소리
- **추천 남성 음성**:
  - `Alnilam` - 단단하고 힘 있는 목소리
  - `Algenib` - 깊고 신뢰감 있는 목소리

## 3. 수정된 파일

### SubtitleFilter.ts
- `createSubtitleFilter()`: 자막 크기 90px, 위치 h*0.50
- `createSimplifiedSubtitleFilter()`: 동일
- `createDualLanguageSubtitleFilter()`: 한글 85px, 영어 50px
- `createTitleTextFilter()`: 제목 크기 130px
- `createTwoLineTitleFilter()`: 새로 추가 (두 줄 제목 지원)

### TTSProvider.ts
- `GeminiTTS` 지원 추가
- `gemini` 옵션 추가 (`createWithFallback`)

### GeminiTTS.ts
- 기본 모델: `gemini-2.5-pro-preview-tts`
- 기본 성별: `female`
- `listAvailableVoices()` 메서드 추가

### utils.ts
- `findTitleFontPath()`: Black Han Sans
- `findSubtitleFontPath()`: Gmarket Sans Bold

### .env
```
TTS_PROVIDER=gemini
```

## 4. 테스트 파일

- `test_font_output.mp4` - 폰트/색상 테스트 (두 줄 제목)
- `test_gemini_pro.wav` - Gemini Pro TTS 테스트 (8.13초)

## 5. JSON 설정 예시 (finalNode.json)

```json
{
  "audio": {
    "tts_provider": "gemini",
    "voice": "Aoede",  // Gemini 여성 음성
    "voiceSettings": {
      "gender": "female",
      "useNewsVoice": true
    }
  },
  "titleText": {
    "style": "twoLine",  // 두 줄 스타일
    "ko": "첫 번째 줄\n두 번째 줄"
  }
}
```

## 6. 주의사항

- `voice` 설정이 ElevenLabs ID (예: `pNInz6obpgDQGcFmaJgB`)로 되어있으면 Gemini에서 무시됨
- Gemini 사용 시 voice를 Gemini 음성 이름으로 변경 필요
- 두 줄 제목은 `\n`으로 구분
