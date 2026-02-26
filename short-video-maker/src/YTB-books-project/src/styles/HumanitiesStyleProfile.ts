/**
 * HumanitiesStyleProfile
 * 인문학/역사/철학/문학 — 따뜻한 일러스트레이션, 스토리텔링 비주얼
 *
 * 핵심: 주제를 정확히 반영하는 장면 묘사. Ghibli처럼 "whimsical dreamlike"이 아니라
 * 역사/전쟁/사상 등 실제 내용에 맞는 구체적인 시각 표현.
 */

import type { VideoStyleProfile } from './VideoStyleProfile';

export const HUMANITIES_STYLE_PROFILE: VideoStyleProfile = {
  id: 'humanities',
  displayName: 'Humanities Storytelling',

  // ── ImageGenerator ──

  narrativeStylePrefix: `A warm, expressive illustration in children's book style with soft colors and clean composition. The scene depicts the SPECIFIC historical/philosophical content described. Portrait 9:16 composition with clear focal subject.`,

  educationalStylePrefix: `A clean, warm-toned educational illustration showing the SPECIFIC concept described. Use visual metaphors, icons, and simple diagrams to explain the idea. Soft pastel background, portrait 9:16 composition, purely visual elements.`,

  formulaConceptPrefix: `A conceptual illustration showing the relationship or structure described, using warm-toned icons, arrows, and visual metaphors. Portrait 9:16 composition with clear visual hierarchy.`,

  diagramStylePrefix: `A clean infographic-style illustration with warm pastel tones showing relationships, timelines, or comparisons. Use icons, arrows, and color-coded shapes. Portrait 9:16 composition.`,

  imagePromptSuffix: 'Illustrate the ACTUAL topic content with relevant visual elements. Use warm colors, clean composition, and visual storytelling.',

  moods: {
    nostalgic: 'warm sepia-tinted atmosphere, ancient scrolls, historical setting',
    whimsical: 'playful educational scene, curious characters discovering knowledge',
    peaceful: 'serene scholarly study, gentle candlelight, open books',
    adventurous: 'epic historical journey, vast landscapes, dramatic skies',
  },

  compositions: [
    'character centered in historical setting',
    'wide panoramic historical scene',
    'close-up on symbolic object',
    'split scene comparing two eras or concepts',
    'bird\'s eye view of a battlefield or city',
    'intimate conversation between two figures',
    'dramatic silhouette against landscape',
    'scroll or book unrolling to reveal content',
    'timeline flowing left to right',
    'symbolic objects arranged to tell a story',
  ],

  // ── MathRenderer ──

  mathSvgFillColor: '#2d3748',  // dark warm gray
  useColorCodedVariables: false,
  defaultFormulaPosition: 'top',

  // ── ContentPlanner ──

  contentPlannerStyleHint: 'warm educational illustration, historical storytelling, cultural visualization',
  visualPromptGuide: `Write each visualPrompt as a descriptive sentence about the ACTUAL topic content.
CRITICAL: Every visualPrompt MUST describe a scene DIRECTLY related to the episode's subject matter.
- Historical events: "An illustration of [specific historical scene with people, places, and actions]"
- Philosophy: "A visual metaphor showing [specific philosophical concept through concrete imagery]"
- Literature: "A scene from [specific literary moment with characters and setting]"
- Culture: "An illustration showing [specific cultural practice or artifact]"
- War/Strategy: "A tactical scene showing [specific military concept with soldiers, terrain, formations]"
IMPORTANT: NEVER use generic images. Every image must clearly relate to the narration content.
Bad: "A colorful educational illustration" (too generic)
Good: "Ancient Chinese general studying a bamboo scroll map with miniature army figures on a table" (specific to Sun Tzu)`,

  // ── TTS ──

  ttsVoice: 'Charon',
  ttsGender: 'male',
  ttsStylePrompt: '흥미진진하게 이야기를 들려주듯, 역사 다큐멘터리 나레이터처럼 설명해주세요',
};
