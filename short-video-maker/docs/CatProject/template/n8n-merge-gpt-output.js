/**
 * N8N Merge Node - GPT 출력 + Config 병합
 *
 * 이전 노드:
 * - Category Selector (config 데이터)
 * - GPT (창작 데이터)
 */

// ============================================
// 📥 데이터 받기
// ============================================
const config = $('Category Selector').first().json;
const gptOutput = $('GPT').first().json;

// GPT 출력이 문자열인 경우 파싱
let creative;
if (typeof gptOutput.message?.content === 'string') {
  // OpenAI 노드 출력 형식
  creative = JSON.parse(gptOutput.message.content);
} else if (typeof gptOutput === 'string') {
  creative = JSON.parse(gptOutput);
} else {
  creative = gptOutput;
}

console.log('Config from Category Selector:', config.series_name);
console.log('Creative from GPT:', creative.titleText?.en);

// ============================================
// 🔧 Video API 요청 형식으로 병합
// ============================================
const videoRequest = {
  // 캐릭터 레퍼런스 (config에서)
  characterReference: {
    profileId: config.profileId,
    characterIds: config.characterIds
  },

  // 타이틀 (GPT 창작 + config 스타일)
  titleText: {
    ko: creative.titleText.ko,
    en: creative.titleText.en,
    style: config.titleText_config.style,
    position: config.titleText_config.position,
    duration: config.titleText_config.duration
  },

  // 씬 (GPT 창작)
  scenes: creative.scenes,

  // 비디오 설정 (config에서 그대로)
  config: {
    orientation: config.video_config.orientation,
    generateVideos: config.video_config.generateVideos,
    useFrameInterpolation: config.video_config.useFrameInterpolation,
    useSceneTransitions: config.video_config.useSceneTransitions,
    sceneTransitionType: config.video_config.sceneTransitionType,
    sceneTransitionDuration: config.video_config.sceneTransitionDuration,
    skipTTS: config.audio_config.skipTTS,
    useStoredImageForVeo: config.video_config.useStoredImageForVeo
  },

  // 오디오 설정 (BGM은 config, SFX는 GPT)
  audio_config: {
    backgroundMusic: {
      source: config.audio_config.bgm.source,
      volume: config.audio_config.bgm.volume,
      loop: config.audio_config.bgm.loop,
      seekStart: config.audio_config.bgm.seekStart
    },
    soundEffects: creative.soundEffects || []
  },

  // YouTube 업로드 (config + GPT 제목/설명)
  youtubeUpload: {
    enabled: config.youtube_config.enabled,
    channelName: config.youtube_config.channelName,
    title: creative.youtubeTitle,
    description: creative.youtubeDescription,
    tags: config.youtube_config.defaultTags,
    privacyStatus: config.youtube_config.defaultPrivacy
  }
};

console.log('✅ Merged video request ready');
console.log('   - Scenes:', videoRequest.scenes.length);
console.log('   - SFX:', videoRequest.audio_config.soundEffects.length);
console.log('   - Title:', videoRequest.titleText.en);

// ============================================
// 📤 Output
// ============================================
return [{
  json: videoRequest
}];
