/**
 * N8N Channel Mapper - Copy & Paste Ready
 *
 * N8N Code 노드에 그대로 복붙하세요
 *
 * 지원 기능:
 * - Google VEO 3.1 (First+Last Frame interpolation)
 * - BGM (archive.org URL, seekStart 지원)
 * - Sound Effects (Freesound API 프리셋)
 * - 이중 자막 (textEnglish 필드 있으면 자동 생성)
 * - YouTube 자동 업로드
 */

// ============================================
// 📥 Input 받기
// ============================================
const input = $input.first().json;
const channelType = input.channel_type || "why_cat";

console.log(`선택된 채널 타입: ${channelType}`);

// ============================================
// 🎬 채널별 설정
// ============================================
const channelSettings = {
  // ============================================
  // 🐱 WHY_CAT (InkMilk) - 영어권 고양이 채널
  // ============================================
  "why_cat": {
    name: "why_cat",
    displayName: "InkMilk",
    description: "Cat couple comedy shorts (English)",
    language: "english",

    profileId: "cat-couple",
    characterIds: ["kami", "dalgi"],
    characterDescriptions: {
      "kami": "Black cat wearing light blue t-shirt, round brown eyes, clumsy husband personality, often makes mistakes",
      "dalgi": "White cat wearing pink strawberry pattern dress with pink bow on right ear, loving but nagging wife personality, often sighs at Kami"
    },

    style: "cute",
    veo3Priority: true,

    audio: {
      skipTTS: true,
      voice: null,
      bgm: {
        source: "https://archive.org/download/10.-la-violette-africaine/03.%20Les%20Champs-Elysees.mp3",
        volume: 0.25,
        loop: true,
        seekStart: 2
      },
      sfxPresets: ["CAT_MEOW", "CAT_PURR", "WHOOSH", "POP", "SUCCESS", "MAGIC"],
      sfxVolume: 0.3
    },

    video: {
      orientation: "portrait",
      generateVideos: true,
      useFrameInterpolation: true,
      useSceneTransitions: true,
      sceneTransitionType: "fade",
      sceneTransitionDuration: 0.3,
      useStoredImageForVeo: true
    },

    titleText: {
      style: "highlight",
      position: "top",
      duration: "full"
    },

    youtube: {
      enabled: true,
      channelName: "why_cat",
      defaultPrivacy: "unlisted",
      defaultTags: ["cat", "shorts", "funny", "cute", "kami", "dalgi", "InkMilk"],
      hashtagTemplate: "#shorts #cat #funny #cute"
    }
  },

  // ============================================
  // 🎯 CLICKAROUND - 메인 채널 (한국어)
  // ============================================
  "clickaround": {
    name: "clickaround",
    displayName: "클릭어라운드",
    description: "메인 채널 - 다양한 콘텐츠",
    language: "korean",

    profileId: null,
    characterIds: [],
    characterDescriptions: {},

    style: "general",
    veo3Priority: false,

    audio: {
      skipTTS: false,
      voice: "pNInz6obpgDQGcFmaJgB",
      bgm: {
        source: "https://archive.org/download/10.-la-violette-africaine/03.%20Les%20Champs-Elysees.mp3",
        volume: 0.15,
        loop: true,
        seekStart: 0
      },
      sfxPresets: [],
      sfxVolume: 0.3
    },

    video: {
      orientation: "portrait",
      generateVideos: true,
      useFrameInterpolation: true,
      useSceneTransitions: true,
      sceneTransitionType: "fade",
      sceneTransitionDuration: 0.3,
      useStoredImageForVeo: false
    },

    titleText: {
      style: "highlight",
      position: "top",
      duration: "full"
    },

    youtube: {
      enabled: true,
      channelName: "clickaround",
      defaultPrivacy: "unlisted",
      defaultTags: ["shorts"],
      hashtagTemplate: "#shorts"
    }
  }
};

// ============================================
// 🎵 SFX 프리셋 목록 (참고용)
// ============================================
const SFX_PRESETS = {
  CAT_MEOW: "cat meow cute",
  CAT_PURR: "cat purring relaxed",
  CAT_HISS: "cat hissing angry",
  WHOOSH: "whoosh transition fast",
  POP: "pop bubble cartoon",
  MAGIC: "magic sparkle fairy",
  SUCCESS: "success achievement ding",
  FAIL: "fail buzzer wrong",
  LAUGH: "cartoon laugh funny",
  GASP: "surprised gasp",
  AWW: "cute aww sound",
  DOOR: "door opening creak",
  FOOTSTEPS: "footsteps walking",
  CLOCK: "clock ticking"
};

// ============================================
// 📤 Output
// ============================================
const selectedChannel = channelSettings[channelType];

if (!selectedChannel) {
  throw new Error(`Unknown channel type: ${channelType}`);
}

return [{
  json: {
    channel_type: channelType,
    channel_config: selectedChannel,
    target_language: selectedChannel.language,
    voice_preference: selectedChannel.audio.voice,
    content_style: selectedChannel.style,
    channel_name: selectedChannel.name,
    veo3_priority: selectedChannel.veo3Priority,
    description: selectedChannel.description,
    profileId: selectedChannel.profileId,
    characterIds: selectedChannel.characterIds,
    characterDescriptions: selectedChannel.characterDescriptions,
    audio_config: selectedChannel.audio,
    video_config: selectedChannel.video,
    titleText_config: selectedChannel.titleText,
    youtube_config: selectedChannel.youtube,
    sfx_presets: SFX_PRESETS,
    timestamp: new Date().toISOString()
  }
}];
