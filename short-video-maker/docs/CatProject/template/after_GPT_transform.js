// n8n Code Node: Merged Data → API Request 변환
//
// Input: Merge 노드 결과 (Config + GPT 합친 것)
// Output: consistent-shorts API 포맷 (COFFEE-BATTLE-7SFX.json 형식)

const merged = $input.item.json;

// API 포맷으로 변환
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

  // 4. Config (video_config + skipTTS + language)
  config: {
    orientation: merged.video_config.orientation,
    generateVideos: merged.video_config.generateVideos,
    useFrameInterpolation: merged.video_config.useFrameInterpolation,
    useSceneTransitions: merged.video_config.useSceneTransitions,
    sceneTransitionType: merged.video_config.sceneTransitionType,
    sceneTransitionDuration: merged.video_config.sceneTransitionDuration,
    skipTTS: merged.audio_config.skipTTS,
    useStoredImageForVeo: merged.video_config.useStoredImageForVeo,
    // 🔥 타이틀 언어 선택 (english: titleText.en 표시, korean: titleText.ko 표시)
    language: merged.target_language || merged.channel_config?.language || 'korean'
  },

  // 5. Audio Config (⚠️ 키 이름 변경!)
  //    - bgm → backgroundMusic
  //    - soundEffects: 루트에서 여기로 이동
  audio_config: {
    backgroundMusic: {
      source: merged.audio_config.bgm.source,
      volume: merged.audio_config.bgm.volume,
      loop: merged.audio_config.bgm.loop,
      seekStart: merged.audio_config.bgm.seekStart || 0
    },
    soundEffects: merged.soundEffects || []
  },

  // 6. YouTube Upload (Config + GPT 병합)
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
