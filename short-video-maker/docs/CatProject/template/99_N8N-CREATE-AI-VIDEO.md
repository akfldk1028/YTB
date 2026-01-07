# n8n Create AI Video Node Configuration

## API Endpoint

```
POST https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/video/consistent-shorts
```

Alternative (newer Cloud Run format):
```
POST https://short-video-maker-550996044521.us-central1.run.app/api/video/consistent-shorts
```

---

## n8n HTTP Request Node Settings

| Setting | Value |
|---------|-------|
| Method | `POST` |
| URL | `https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/video/consistent-shorts` |
| Authentication | `None` |
| Send Body | `ON` |
| Body Content Type | `JSON` |
| Specify Body | `Using JSON` |
| JSON | `{{ $json }}` |

---

## Workflow Structure

```
[Category Selector] → [GPT] → [Merge] → [Transform] → [Create AI Video]
```

1. **Category Selector**: 시리즈/채널 설정 출력
2. **GPT**: titleText, scenes, soundEffects, youtubeTitle, youtubeDescription 생성
3. **Merge**: Config + GPT 결과 병합
4. **Transform**: API 포맷으로 변환 (05_01_Transform_Node.js)
5. **Create AI Video**: HTTP POST 요청

---

## Transform Code (Code Node)

```javascript
// n8n Code Node: Merged Data → API Request 변환
const merged = $input.item.json;

const apiRequest = {
  // 1. Character Reference
  characterReference: {
    profileId: merged.profileId,
    characterIds: merged.characterIds
  },

  // 2. Title Text (GPT + Config 스타일 병합)
  titleText: {
    ko: merged.titleText.ko,
    en: merged.titleText.en,
    style: merged.titleText_config?.style || "highlight",
    position: merged.titleText_config?.position || "top",
    duration: merged.titleText_config?.duration || "full"
  },

  // 3. Scenes (그대로)
  scenes: merged.scenes,

  // 4. Config (video_config + skipTTS)
  config: {
    orientation: merged.video_config.orientation,
    generateVideos: merged.video_config.generateVideos,
    useFrameInterpolation: merged.video_config.useFrameInterpolation,
    useSceneTransitions: merged.video_config.useSceneTransitions,
    sceneTransitionType: merged.video_config.sceneTransitionType,
    sceneTransitionDuration: merged.video_config.sceneTransitionDuration,
    skipTTS: merged.audio_config.skipTTS,
    useStoredImageForVeo: merged.video_config.useStoredImageForVeo
  },

  // 5. Audio Config
  audio_config: {
    backgroundMusic: {
      source: merged.audio_config.bgm.source,
      volume: merged.audio_config.bgm.volume,
      loop: merged.audio_config.bgm.loop,
      seekStart: merged.audio_config.bgm.seekStart || 0
    },
    soundEffects: merged.soundEffects || []
  },

  // 6. YouTube Upload
  youtubeUpload: {
    enabled: merged.youtube_config?.enabled || false,
    channelName: merged.youtube_config?.channelName || merged.channel_name,
    title: merged.youtubeTitle,
    description: merged.youtubeDescription,
    tags: merged.youtube_config?.defaultTags || [],
    privacyStatus: merged.youtube_config?.defaultPrivacy || "unlisted"
  }
};

return { json: apiRequest };
```

---

## Example API Request Body

```json
{
  "characterReference": {
    "profileId": "cat-couple",
    "characterIds": ["kami", "dalgi"]
  },
  "titleText": {
    "ko": "유령 사냥 대소동",
    "en": "Tiny Ghost Hunt 👻",
    "style": "highlight",
    "position": "top",
    "duration": "full"
  },
  "scenes": [
    {
      "characterIds": ["kami"],
      "text": "Did you hear that?",
      "textEnglish": "Did you hear that?",
      "scenePrompt": "Black cat wearing light blue t-shirt...",
      "duration": 8
    }
  ],
  "config": {
    "orientation": "portrait",
    "generateVideos": true,
    "useFrameInterpolation": true,
    "useSceneTransitions": true,
    "sceneTransitionType": "fade",
    "sceneTransitionDuration": 0.3,
    "skipTTS": true,
    "useStoredImageForVeo": true,
    "language": "english"
  },
  "audio_config": {
    "backgroundMusic": {
      "source": "https://archive.org/download/.../Les%20Champs-Elysees.mp3",
      "volume": 0.25,
      "loop": true,
      "seekStart": 2
    },
    "soundEffects": [
      { "type": "preset", "value": "CLOCK", "startTime": 2, "volume": 0.25 },
      { "type": "preset", "value": "FOOTSTEPS", "startTime": 10, "volume": 0.3 }
    ]
  },
  "youtubeUpload": {
    "enabled": true,
    "channelName": "why_cat",
    "title": "Tiny Ghost Hunt Gone Wrong #shorts",
    "description": "Brave cats face a spooky mystery...",
    "tags": ["cat", "shorts", "funny", "cute"],
    "privacyStatus": "unlisted"
  }
}
```

---

## API Response

### Success
```json
{
  "success": true,
  "videoId": "cmjtxxyxh00000es67w0cbtoz",
  "message": "Video generation started"
}
```

### Check Status
```
GET /api/video/consistent-shorts/{videoId}/status
```

---

## Critical Settings

| Setting | Value | Reason |
|---------|-------|--------|
| `useFrameInterpolation` | `true` | VEO 3.1 캐릭터 일관성 |
| `useStoredImageForVeo` | `true` | GCS 저장된 캐릭터 이미지 사용 |
| `skipTTS` | `true` | BGM + SFX만 사용 |
| `duration` | `8` | VEO 3.1 Frame Interpolation 필수 |
| `seekStart` | `2` | BGM 인트로 스킵 |
| `language` | `english` / `korean` | 타이틀 텍스트 언어 선택 (en/ko) |

---

## Related Files

- Transform Code: `template/05_01_Transform_Node.js`
- Merge Output: `template/04_01_Merge_Node.js`
- API Format Example: `template/COFFEE-BATTLE-7SFX.json`
- GPT System Prompt: `template/prompt_SystemMessage.md`
- GPT User Message: `template/prompt_userMsssage.md`
