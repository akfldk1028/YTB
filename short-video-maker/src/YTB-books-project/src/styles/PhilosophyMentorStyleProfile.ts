/**
 * PhilosophyMentorStyleProfile
 * 멘탈훈련소 스타일 — 따뜻한 만화풍 + 깊은 남성 목소리 + 철학/마인드셋
 *
 * 핵심 차이 (vs math_character):
 * - 이미지: 따뜻한 한국 만화풍 (교육 다이어그램 X)
 * - 캐릭터: 없음 — 일상 인물 (올빼미/고양이 X)
 * - TTS: Enceladus (차분하고 안정적 멘토) — Charon(교육형)과 다른 톤
 * - 콘텐츠: 철학/마인드셋/자기계발 (수학/과학 X)
 * - CTA: "여러분은 어떻게 생각하세요?" (교육형 퀴즈 X)
 * - 후크 텍스트: 굵은 한국어 오버레이 (v12.0)
 *
 * @version 12.0
 */

import type { VideoStyleProfile } from './VideoStyleProfile';
import { getPhilosophyMentorGuide } from '../services/prompts/philosophyMentorGuide';

export const PHILOSOPHY_MENTOR_STYLE_PROFILE: VideoStyleProfile = {
  id: 'philosophy_mentor',
  displayName: 'Philosophy Mentor (멘탈훈련소)',

  // ── ImageGenerator Node input ──

  narrativeStylePrefix: 'Warm Korean manhwa-style illustration with clean linework and semi-realistic proportions. A contemplative figure in a relatable daily-life setting. Rich amber and warm sepia tones, emotional depth, dramatic warm lighting. Portrait 9:16.',
  educationalStylePrefix: 'Warm Korean manhwa illustration showing the concept through everyday visual metaphors — books, scales, mirrors, paths. Semi-realistic, amber/warm brown palette, clean composition. Portrait 9:16.',
  formulaConceptPrefix: 'Warm illustration with semi-realistic style, showing the formula concept as a visual metaphor in everyday life. Amber tones, warm lighting. Portrait 9:16.',
  diagramStylePrefix: 'Warm-toned infographic with clean manhwa style, amber/brown palette, clear icons. Portrait 9:16.',
  imagePromptSuffix: 'Warm manhwa art style, amber/sepia color palette, semi-realistic proportions, emotional depth. Purely visual, no text.',

  moods: {
    contemplative: 'quiet office late at night, single warm desk lamp',
    motivational: 'sunrise through cafe window, fresh morning atmosphere',
    introspective: 'rainy window view, cozy warm interior',
    determined: 'crowded subway commute, focused determined expression',
  },

  compositions: [
    'person at desk late night, warm lamp casting amber glow',
    'two people talking at restaurant, warm ambient lighting',
    'solitary figure looking out rainy window',
    'crowded street with one focused person walking',
    'cafe counter, steam rising from coffee cup',
    'bookshelves in warm library, afternoon light',
    'person on subway reading, golden hour through window',
    'rooftop view, city lights at dusk',
    'home study, stack of books, warm lamp',
    'park bench under autumn tree, scattered leaves',
  ],

  // ── MathRenderer Node input ──

  mathSvgFillColor: '#4A4A4A',
  useColorCodedVariables: false,
  defaultFormulaPosition: 'center',

  // ── ContentPlanner Node input ──

  contentPlannerStyleHint: 'warm manhwa illustration, philosophical depth, daily-life scenes, emotional storytelling',
  visualPromptGuide: `Philosophy Mentor warm manhwa style:
- Semi-realistic Korean manhwa/webtoon proportions (NOT chibi, NOT cartoonish)
- Warm amber/sepia color palette, dramatic warm lighting
- Daily-life scenes: office, cafe, restaurant, subway, home study
- Characters: Korean young adults (20-30s), relatable expressions
- Emotional depth: contemplation, determination, quiet resilience
- NO watercolor textures, NO neon/glowing elements, NO cute animals
- NO dark navy backgrounds, NO mathematical diagrams`,

  // ── VideoAssembler Node input (TTS) ──

  ttsVoice: 'Enceladus',
  ttsGender: 'male',
  ttsStylePrompt: '철학 멘토가 후배에게 진심 어린 조언을 하듯, 차분하고 깊은 목소리로 천천히 읽어주세요. 권위 있되 따뜻하게.',

  // ── Engagement ──

  engagementGuide: getPhilosophyMentorGuide(),

  // ── VEO ──
  veoMotionHint: 'Slow, deliberate camera movements. Gentle zoom on contemplative expressions. Warm ambient parallax.',

  // ── v12.0: Hook Text Overlay Config ──
  hookTextOverlay: {
    enabled: true,
    position: 'top-center',
    fontSize: 64,
    fontColor: 'white',
    strokeColor: 'black',
    strokeWidth: 3,
    backgroundColor: 'black@0.3',
    paddingX: 24,
    paddingY: 16,
  },
};
