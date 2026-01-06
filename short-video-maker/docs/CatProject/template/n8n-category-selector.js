/**
 * N8N Category Selector - WHY_CAT 전용
 *
 * 시리즈만 정의 → GPT가 에피소드 생성
 * 게스트 캐릭터: 등록된 캐릭터만 사용
 *
 * 이전 노드: Channel Mapper
 */

// ============================================
// 📥 Channel Mapper에서 설정 받기
// ============================================
const channelData = $('Channel Mapper').first().json;

// ============================================
// 📅 날짜 기반 순차 인덱스
// ============================================
function getDayOfYear() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now - start;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

const dayOfYear = getDayOfYear();

// ============================================
// 🎭 게스트 캐릭터 정의
// ============================================
// 등록 완료된 캐릭터만 true로 변경
const registeredGuests = {
  nabi: false,   // 나노바나나 이미지 + API 등록 후 true로 변경
  momo: false,
  choco: false,
  boss: false
};

const guestCharacters = {
  nabi: {
    id: "nabi",
    name: "Nabi",
    description: "Orange tabby cat, neighbor, flirty and confident personality"
  },
  momo: {
    id: "momo",
    name: "Momo",
    description: "Tiny white kitten, innocent and curious, big round eyes"
  },
  choco: {
    id: "choco",
    name: "Choco",
    description: "Golden retriever puppy, friendly but clumsy"
  },
  boss: {
    id: "boss",
    name: "Boss",
    description: "Big grey cat, neighborhood alpha, intimidating presence"
  }
};

// ============================================
// 📺 시리즈 정의 (GPT가 에피소드 생성)
// ============================================
const allSeries = [
  {
    id: "daily_life",
    name: "Couple Daily Life",
    description: "Relatable everyday conflicts of cat couple - chores, decisions, habits. Must include small disagreement that resolves in funny way.",
    themes: ["blanket stealing", "who does dishes", "what to eat fight", "remote control war", "bathroom hogging", "snoring complaint", "grocery shopping argument", "laundry disaster"],
    guests: [],
    mood: "funny, relatable, realistic conflict"
  },
  {
    id: "drama",
    name: "Dramatic Moments",
    description: "Relationship drama and misunderstandings - jealousy, forgetting important dates, miscommunication. Always ends with funny resolution.",
    themes: ["jealousy", "forgot anniversary", "suspicious phone notification", "silent treatment", "dramatic apology fail", "misread text message", "overreaction"],
    guests: [],
    mood: "dramatic, funny, relatable"
  },
  {
    id: "nabi_arc",
    name: "Neighbor Nabi Arc",
    description: "Story arc with neighbor cat Nabi - jealousy, rivalry, eventually becoming friends",
    themes: ["new neighbor", "flirting", "confrontation", "misunderstanding", "friendship"],
    guests: ["nabi"],
    mood: "dramatic, jealous, resolution"
  },
  {
    id: "choco_arc",
    name: "Puppy Choco Arc",
    description: "A puppy joins the household - chaos, adjustment, protection, bonding",
    themes: ["dog arrives", "chaos", "training", "protection", "bonding"],
    guests: ["choco"],
    mood: "chaotic, funny, heartwarming"
  },
  {
    id: "momo_arc",
    name: "Baby Kitten Momo Arc",
    description: "Babysitting a tiny kitten - parenting chaos, teaching, emotional goodbye",
    themes: ["kitten arrives", "babysitting", "teaching", "goodbye"],
    guests: ["momo"],
    mood: "cute, chaotic, emotional"
  },
  {
    id: "parody",
    name: "Parody & Satire",
    description: "Cat versions of TV shows and situations - news, court, cooking show, interview, reality TV",
    themes: ["cat news", "cat court", "cooking show", "job interview", "reality TV", "fitness channel"],
    guests: [],
    mood: "funny, satirical, clever"
  },
  {
    id: "seasonal",
    name: "Seasonal Events",
    description: "Holiday chaos and seasonal disasters - Christmas gift panic, Valentine expectations vs reality, birthday surprise fails, weather-related conflicts",
    themes: ["christmas gift panic", "new year resolution fail", "valentine expectations vs reality", "summer heat fight over AC", "rainy day stuck together", "first snow slipping", "birthday forgot"],
    guests: [],
    mood: "festive chaos, relatable, funny"
  },
  {
    id: "mystery",
    name: "Mystery & Scary",
    description: "Spooky and mysterious moments - cucumber scare, vacuum monster, 3AM noises, ghost hunting",
    themes: ["cucumber scare", "vacuum monster", "strange noise", "ghost hunt", "shadows"],
    guests: [],
    mood: "spooky, funny, brave"
  },
  {
    id: "romance",
    name: "Romance Moments",
    description: "Romantic moments gone wrong - failed surprises, awkward proposals, anniversary disasters that end up sweet anyway",
    themes: ["surprise gone wrong", "proposal disaster", "anniversary forgot then panic", "love letter typo", "gift backfire", "romantic dinner fail"],
    guests: [],
    mood: "romantic chaos, funny, heartwarming ending"
  }
];

// ============================================
// 🎯 사용 가능한 시리즈만 필터링
// ============================================
// 게스트가 필요 없거나, 필요한 게스트가 모두 등록된 시리즈만 선택
const availableSeries = allSeries.filter(s => {
  if (s.guests.length === 0) return true;
  return s.guests.every(guestId => registeredGuests[guestId] === true);
});

console.log('Available series: ' + availableSeries.length + '/' + allSeries.length);

// ============================================
// 🎯 순차 선택
// ============================================
const index = dayOfYear % availableSeries.length;
const selected = availableSeries[index];
const nextIndex = (index + 1) % availableSeries.length;

// 게스트 캐릭터 정보 조합
const selectedGuests = selected.guests.map(guestId => guestCharacters[guestId]).filter(Boolean);

console.log('Day ' + dayOfYear + ' → Series: ' + selected.name);

// ============================================
// 📤 Output
// ============================================
return [{
  json: {
    // 시리즈 정보 (GPT가 이걸 보고 에피소드 생성)
    series_id: selected.id,
    series_name: selected.name,
    series_description: selected.description,
    series_themes: selected.themes,
    series_mood: selected.mood,

    // 캐릭터 정보
    main_characters: ["kami", "dalgi"],
    guest_characters: selectedGuests,
    registered_guests: registeredGuests,

    // 스케줄 정보
    day_of_year: dayOfYear,
    series_index: index,
    total_series: allSeries.length,
    available_series: availableSeries.length,
    next_series: availableSeries[nextIndex].name,

    // Channel Mapper 설정 전달
    channel_type: channelData.channel_type,
    channel_name: channelData.channel_name,
    profileId: channelData.profileId,
    characterIds: channelData.characterIds,
    characterDescriptions: channelData.characterDescriptions,
    audio_config: channelData.audio_config,
    video_config: channelData.video_config,
    titleText_config: channelData.titleText_config,
    youtube_config: channelData.youtube_config,
    sfx_presets: channelData.sfx_presets,

    // GPT 지시사항
    gpt_instruction: "Based on the series info above, generate a specific episode. CRITICAL: Every story MUST have a small conflict or disagreement that resolves in a funny way. NO perfect happy stories - make it relatable with realistic couple dynamics. Kami = lazy/forgetful husband, Dalgi = nagging but loving wife. Only use main_characters (kami, dalgi) unless guest_characters are provided.",

    timestamp: new Date().toISOString()
  }
}];
