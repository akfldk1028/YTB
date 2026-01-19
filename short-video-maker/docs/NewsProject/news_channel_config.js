/**
 * 📰 News Channel Config
 *
 * 기존 Channel Mapper의 channelSettings에 추가할 뉴스 채널 설정
 *
 * 사용법: channelSettings 객체에 spread 연산자로 병합
 * const channelSettings = { ...기존설정, ...NEWS_CHANNEL_SETTINGS };
 */

// ============================================
// 🎵 뉴스용 BGM Pool (기존 BGM_POOL에 추가하거나 별도 사용)
// ============================================
const NEWS_BGM_POOL = [
  "https://archive.org/download/kevin-mac-leod-at-rest/Kevin%20MacLeod%20_%20Carefree.mp3",
  "https://archive.org/download/kevin.macleod-fad/Kevin%20MacLeod%20-%20Fluffing%20a%20Duck.mp3",
  "https://archive.org/download/kevin-mac-leod-at-rest/Kevin%20Macleod%20-%20%20Monkeys%20Spinning%20Monkeys%20%20%28Re%20uploaded%29.mp3",
];

const getRandomNewsBGM = () => NEWS_BGM_POOL[Math.floor(Math.random() * NEWS_BGM_POOL.length)];

// ============================================
// 🎤 톤 옵션 (뉴스 전용)
// ============================================
const TONE_OPTIONS = {
  // 🔴 보수 톤
  conservative_fun: {
    id: "conservative_fun",
    name: "보수 + 재밌게",
    description: "보수 성향 + 천박하고 재밌는 말투"
  },
  conservative_serious: {
    id: "conservative_serious",
    name: "보수 + 진지",
    description: "보수 성향 + 진지한 해설 톤"
  },
  conservative_aggressive: {
    id: "conservative_aggressive",
    name: "보수 + 강하게",
    description: "보수 성향 + 강한 비판"
  },
  // 🔵 진보 톤
  progressive_fun: {
    id: "progressive_fun",
    name: "진보 + 재밌게",
    description: "진보 성향 + 친근하고 재밌는 말투"
  },
  progressive_serious: {
    id: "progressive_serious",
    name: "진보 + 진지",
    description: "진보 성향 + 진지한 해설 톤"
  },
  progressive_aggressive: {
    id: "progressive_aggressive",
    name: "진보 + 강하게",
    description: "진보 성향 + 강한 비판"
  },
  // ⚪ 중립 톤
  neutral_fun: {
    id: "neutral_fun",
    name: "중립 + 재밌게",
    description: "중립적 시각 + 재밌는 말투"
  },
  neutral_serious: {
    id: "neutral_serious",
    name: "중립 + 진지",
    description: "중립적 시각 + 진지한 해설"
  }
};

// ============================================
// 👥 타겟 옵션 (뉴스 전용)
// ============================================
const TARGET_OPTIONS = {
  ajae: {
    id: "ajae",
    name: "아재 (30-50대)",
    ageRange: "30-50",
    speechStyle: "친근한 반말"
  },
  mz: {
    id: "mz",
    name: "MZ (20-30대)",
    ageRange: "20-35",
    speechStyle: "밈/신조어"
  },
  senior: {
    id: "senior",
    name: "시니어 (50-70대)",
    ageRange: "50-70",
    speechStyle: "존댓말"
  }
};

// ============================================
// 📰 뉴스 채널 설정 (기존 구조 호환)
// ============================================
const NEWS_CHANNEL_SETTINGS = {
  "news_politics": {
    // 기존 구조 필드
    name: "news_politics",
    displayName: "정치 뉴스",
    description: "정치 뉴스 숏폼 (보수 관점)",
    language: "korean",

    profileId: null,  // 뉴스는 캐릭터 없음
    characterIds: [],
    characterDescriptions: {},

    style: "news",
    veo3Priority: false,

    audio: {
      skipTTS: false,
      voice: "Kore",  // Gemini TTS voice
      tts_provider: "gemini",  // 🔥 뉴스 전용 필드
      bgm: {
        source: null,  // 나중에 랜덤 주입
        volume: 0.12,
        loop: true,
        seekStart: 0
      },
      sfxPresets: [],
      sfxVolume: 0
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
      style: "news_lower_third",
      position: "bottom",
      duration: "full",
      font: "Pretendard",
      fontSize: 48,
      backgroundColor: "rgba(0, 51, 102, 0.85)"
    },

    youtube: {
      enabled: true,
      channelName: "clickaround",
      subChannel: "news_politics",
      defaultPrivacy: "unlisted",
      defaultTags: ["뉴스", "정치", "국회", "시사", "shorts"],
      hashtagTemplate: "#shorts #뉴스 #정치"
    },

    // 🔥 뉴스 전용 필드
    news: {
      rssFeeds: [
        { name: "조선일보 정치", url: "https://www.chosun.com/arc/outboundfeeds/rss/category/politics/?outputType=xml" },
        { name: "동아일보 정치", url: "https://rss.donga.com/politics.xml" },
        { name: "세계일보 정치", url: "https://www.segye.com/Articles/RSSList/segye_politic.xml" }
      ],
      curation: {
        maxNews: 4,
        jaccardThreshold: 0.4,
        timeWindowHours: 24
      },
      defaultTone: "conservative_fun",
      defaultTarget: "ajae",
      imageGeneration: "hybrid",
      nanoBanana: {
        defaultStyle: "news_infographic",
        defaultAspectRatio: "9:16",
        defaultNegativePrompt: "realistic human faces, political party logos, low quality"
      }
    }
  },

  "news_economy": {
    name: "news_economy",
    displayName: "경제 뉴스",
    description: "경제 뉴스 숏폼",
    language: "korean",

    profileId: null,
    characterIds: [],
    characterDescriptions: {},

    style: "news",
    veo3Priority: false,

    audio: {
      skipTTS: false,
      voice: "Kore",
      tts_provider: "gemini",
      bgm: { source: null, volume: 0.12, loop: true, seekStart: 0 },
      sfxPresets: [],
      sfxVolume: 0
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
      style: "news_lower_third",
      position: "bottom",
      duration: "full",
      backgroundColor: "rgba(0, 102, 51, 0.85)"  // 녹색
    },

    youtube: {
      enabled: true,
      channelName: "clickaround",
      subChannel: "news_economy",
      defaultPrivacy: "unlisted",
      defaultTags: ["뉴스", "경제", "주식", "부동산", "shorts"],
      hashtagTemplate: "#shorts #경제 #돈"
    },

    news: {
      rssFeeds: [
        { name: "매일경제", url: "https://www.mk.co.kr/rss/30100041/" },
        { name: "한국경제", url: "https://www.hankyung.com/feed/economy" },
        { name: "조선비즈", url: "https://biz.chosun.com/arc/outboundfeeds/rss/?outputType=xml" }
      ],
      curation: { maxNews: 4, jaccardThreshold: 0.4, timeWindowHours: 24 },
      defaultTone: "conservative_fun",
      defaultTarget: "ajae",
      imageGeneration: "hybrid",
      nanoBanana: { defaultStyle: "news_infographic", defaultAspectRatio: "9:16" }
    }
  },

  "news_social": {
    name: "news_social",
    displayName: "사회 뉴스",
    description: "사회 뉴스 숏폼",
    language: "korean",

    profileId: null,
    characterIds: [],
    characterDescriptions: {},

    style: "news",
    veo3Priority: false,

    audio: {
      skipTTS: false,
      voice: "Kore",
      tts_provider: "gemini",
      bgm: { source: null, volume: 0.12, loop: true, seekStart: 0 },
      sfxPresets: [],
      sfxVolume: 0
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
      style: "news_lower_third",
      position: "bottom",
      duration: "full",
      backgroundColor: "rgba(102, 0, 0, 0.85)"
    },

    youtube: {
      enabled: true,
      channelName: "clickaround",
      subChannel: "news_social",
      defaultPrivacy: "unlisted",
      defaultTags: ["뉴스", "사회", "사건", "사고", "shorts"],
      hashtagTemplate: "#shorts #사회 #사건"
    },

    news: {
      rssFeeds: [
        { name: "조선일보 사회", url: "https://www.chosun.com/arc/outboundfeeds/rss/category/national/?outputType=xml" },
        { name: "동아일보 사회", url: "https://rss.donga.com/national.xml" },
        { name: "세계일보 사회", url: "https://www.segye.com/Articles/RSSList/segye_society.xml" }
      ],
      curation: { maxNews: 4, jaccardThreshold: 0.4, timeWindowHours: 24 },
      defaultTone: "conservative_fun",
      defaultTarget: "ajae",
      imageGeneration: "hybrid",
      nanoBanana: { defaultStyle: "news_infographic", defaultAspectRatio: "9:16" }
    }
  },

  // ============================================
  // 🔴 빨강나라 보수공주 (전용 채널)
  // ============================================
  "red_news": {
    name: "red_news",
    displayName: "빨강나라 보수공주",
    description: "보수 관점 뉴스 숏폼 (전용 채널)",
    language: "korean",

    profileId: null,
    characterIds: [],
    characterDescriptions: {},

    style: "news",
    veo3Priority: false,

    audio: {
      skipTTS: false,
      voice: "Kore",
      tts_provider: "gemini",
      bgm: { source: null, volume: 0.12, loop: true, seekStart: 0 },
      sfxPresets: [],
      sfxVolume: 0
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
      style: "news_lower_third",
      position: "bottom",
      duration: "full",
      font: "Pretendard",
      fontSize: 48,
      backgroundColor: "rgba(180, 0, 0, 0.9)"  // 빨강
    },

    youtube: {
      enabled: true,
      channelName: "red_news",  // 🔥 전용 채널
      channelId: "UC8wQlyHC7iYjzZYBoOAYaKw",
      defaultPrivacy: "unlisted",
      defaultTags: ["뉴스", "정치", "보수", "시사", "shorts"],
      hashtagTemplate: "#shorts #보수 #뉴스 #빨강나라"
    },

    news: {
      rssFeeds: [
        { name: "조선일보 정치", url: "https://www.chosun.com/arc/outboundfeeds/rss/category/politics/?outputType=xml" },
        { name: "동아일보 정치", url: "https://rss.donga.com/politics.xml" },
        { name: "세계일보 정치", url: "https://www.segye.com/Articles/RSSList/segye_politic.xml" }
      ],
      curation: { maxNews: 4, jaccardThreshold: 0.4, timeWindowHours: 24 },
      defaultTone: "conservative_fun",  // 보수 + 재밌게
      defaultTarget: "ajae",
      imageGeneration: "hybrid",
      nanoBanana: { defaultStyle: "news_infographic", defaultAspectRatio: "9:16" }
    }
  },

  // ============================================
  // 🔵 파랑나라 진보왕자 (전용 채널)
  // ============================================
  "blue_news": {
    name: "blue_news",
    displayName: "파랑나라 진보왕자",
    description: "진보 관점 뉴스 숏폼 (전용 채널)",
    language: "korean",

    profileId: null,
    characterIds: [],
    characterDescriptions: {},

    style: "news",
    veo3Priority: false,

    audio: {
      skipTTS: false,
      voice: "Kore",
      tts_provider: "gemini",
      bgm: { source: null, volume: 0.12, loop: true, seekStart: 0 },
      sfxPresets: [],
      sfxVolume: 0
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
      style: "news_lower_third",
      position: "bottom",
      duration: "full",
      font: "Pretendard",
      fontSize: 48,
      backgroundColor: "rgba(0, 51, 153, 0.9)"  // 파랑
    },

    youtube: {
      enabled: true,
      channelName: "blue_news",  // 🔥 전용 채널
      channelId: "UC7Pj-MJOYkYgONLsk3uejSA",
      defaultPrivacy: "unlisted",
      defaultTags: ["뉴스", "정치", "진보", "시사", "shorts"],
      hashtagTemplate: "#shorts #진보 #뉴스 #파랑나라"
    },

    news: {
      rssFeeds: [
        { name: "한겨레 정치", url: "https://www.hani.co.kr/rss/politics/" },
        { name: "경향신문 정치", url: "https://www.khan.co.kr/rss/rssdata/politic_news.xml" },
        { name: "오마이뉴스", url: "http://rss.ohmynews.com/rss/ohmynews.xml" }
      ],
      curation: { maxNews: 4, jaccardThreshold: 0.4, timeWindowHours: 24 },
      defaultTone: "progressive_fun",  // 진보 + 재밌게
      defaultTarget: "mz",
      imageGeneration: "hybrid",
      nanoBanana: { defaultStyle: "news_infographic", defaultAspectRatio: "9:16" }
    }
  }
};

// ============================================
// 📤 Export (n8n에서 복붙용)
// ============================================
module.exports = {
  NEWS_BGM_POOL,
  TONE_OPTIONS,
  TARGET_OPTIONS,
  NEWS_CHANNEL_SETTINGS,
  getRandomNewsBGM
};
