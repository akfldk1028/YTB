/**
 * ViralCatStyleProfile
 * 바이럴 고양이 캐릭터 — 따뜻한 지브리 수채화 + 직장인 공감 콘텐츠
 *
 * 핵심 차이 (vs math_character):
 * - 이미지: 따뜻한 수채화/파스텔 (어두운 네이비 X)
 * - 캐릭터: 둥근 고양이 (올빼미 X)
 * - TTS: Fenrir (깊고 중후한 남성) — Charon(교육형)과 다른 톤
 * - 콘텐츠: 직장인 공감 + 자기계발 (수학/과학 X)
 * - CTA: "나만 이런 거 아니죠?" (교육형 퀴즈 X)
 *
 * @version 10.0
 */

import type { VideoStyleProfile } from './VideoStyleProfile';
import { getEmpathyViralGuide } from '../services/prompts/empathyContentGuide';

export const VIRAL_CAT_STYLE_PROFILE: VideoStyleProfile = {
  id: 'viral_cat',
  displayName: 'Viral Cat (공감 수채화)',

  // ── ImageGenerator Node input ──

  narrativeStylePrefix: 'In warm Ghibli-style watercolor with soft textures and cozy atmosphere. A cute round cat character with big expressive eyes in a relatable everyday scene.',
  educationalStylePrefix: 'In warm watercolor style, a cozy illustration using soft pastel colors and relatable everyday visual metaphors. Portrait 9:16, warm lighting.',
  formulaConceptPrefix: 'In warm watercolor style, illustrate the concept using relatable everyday objects as metaphors. Soft pastel colors, cozy atmosphere. Portrait 9:16.',
  diagramStylePrefix: 'In soft watercolor style, a friendly infographic on warm cream background with cute icons, soft arrows, pastel color-coded shapes. Portrait 9:16.',
  imagePromptSuffix: 'Warm watercolor style, cozy atmosphere, soft pastel tones. Purely visual elements only.',

  moods: {
    empathy: 'warm understanding, shared experience, "I feel you" mood',
    cozy: 'comfortable home, warm lamp lighting, relaxed feeling',
    motivational: 'gentle encouragement, sunrise energy, hopeful warmth',
    humorous: 'light-hearted, relatable comedy, everyday absurdity',
  },

  compositions: [
    'cozy room interior, warm lamp lighting',
    'cafe window seat, soft afternoon light',
    'commuter train, city lights outside',
    'desk workspace, scattered papers and coffee',
    'park bench, golden hour sunlight',
    'kitchen counter, homey atmosphere',
    'bed with blanket, late night phone glow',
    'rainy window, contemplative mood',
    'sunrise balcony, fresh morning air',
    'living room couch, weekend relaxation',
  ],

  // ── MathRenderer Node input ──

  mathSvgFillColor: '#4A4A4A',
  useColorCodedVariables: false,
  defaultFormulaPosition: 'center',

  // ── ContentPlanner Node input ──

  contentPlannerStyleHint: 'warm empathy illustration, ghibli watercolor, emotional storytelling, relatable everyday scenes',
  visualPromptGuide: `Viral Cat warm watercolor style:
- Warm pastel colors, soft hand-painted textures, cozy atmosphere
- Cute round cat character in narrative scenes (hook/conclusion only)
- Relatable everyday settings: office, home, cafe, commute
- Educational scenes: warm illustrations with everyday metaphors
- Emotional resonance: "I feel the same" visual storytelling
- Color palette: warm cream, soft orange, gentle teal, muted pink
- NO dark navy backgrounds, NO neon glowing elements
- NO mathematical diagrams, NO vector line style`,

  // ── VideoAssembler Node input (TTS) ──

  ttsVoice: 'Fenrir',
  ttsGender: 'male',
  ttsStylePrompt: '친구에게 진심으로 공감하며 이야기하듯, 깊고 따뜻한 목소리로 천천히 읽어주세요. 위로하는 느낌으로.',

  // ── Engagement (v10.0) ──

  engagementGuide: getEmpathyViralGuide('직장인 공감'),

  // ── VEO 3.1 (v11.0) ──
  veoMotionHint: 'Warm, cozy movements. Gentle parallax with soft focus transitions. Cat character subtle animation.',
};
