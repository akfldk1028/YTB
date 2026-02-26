/**
 * GhibliStyleProfile
 * 기존 Ghibli watercolor 스타일 — 값은 현재 코드와 100% 동일
 */

import type { VideoStyleProfile } from './VideoStyleProfile';

export const GHIBLI_STYLE_PROFILE: VideoStyleProfile = {
  id: 'ghibli',
  displayName: 'Ghibli Watercolor',

  // ── ImageGenerator ──

  narrativeStylePrefix: `In Ghibli-style hand-painted watercolor with soft textures, warm nostalgic lighting, and a whimsical dreamlike atmosphere. Detailed natural environments with expressive character design.`,

  educationalStylePrefix: `In soft watercolor style, create a clean educational diagram using warm pastel colors and visual metaphors. Portrait 9:16 composition using only shapes, icons, and color-coded elements.`,

  formulaConceptPrefix: `In soft watercolor style, illustrate the mathematical concept as a visual metaphor with warm pastel colors. Portrait 9:16 composition using only shapes, lines, and color gradients.`,

  diagramStylePrefix: `In soft pastel watercolor style, draw a clean infographic diagram on a light background. Use icons, arrows, and color-coded shapes to show relationships. Portrait 9:16 composition, purely visual elements.`,

  imagePromptSuffix: 'Render in soft watercolor style using only visual elements — icons, arrows, shapes, and colors.',

  moods: {
    nostalgic: 'warm nostalgic atmosphere, memories of childhood',
    whimsical: 'magical and whimsical, playful fantasy elements',
    peaceful: 'serene and peaceful, gentle nature harmony',
    adventurous: 'exciting adventure spirit, vast open world',
  },

  compositions: [
    'slightly zoomed in perspective',
    'wide establishing shot',
    'close-up detail view',
    'bird\'s eye view from above',
    'three-quarter angle view',
    'soft bokeh background',
    'atmospheric layered depth',
    'centered symmetrical composition',
    'rule of thirds off-center',
    'dramatic low angle perspective',
  ],

  // ── MathRenderer ──

  mathSvgFillColor: 'white',
  useColorCodedVariables: false,
  defaultFormulaPosition: 'top',

  // ── ContentPlanner ──

  contentPlannerStyleHint: 'children book illustration, soft watercolor, whimsical storybook',
  visualPromptGuide: `Ghibli watercolor style:
- Warm pastel colors, soft hand-painted textures
- Whimsical storybook atmosphere
- Nature environments, gentle lighting
- Characters in narrative scenes only (hook/conclusion)
- Educational scenes: diagrams and visual metaphors using shapes and icons only`,

  // ── TTS ──

  ttsVoice: 'Leda',
  ttsGender: 'female',
  ttsStylePrompt: '친구에게 설명하듯 따뜻하고 또박또박, 자연스럽게 이어서 읽어주세요',
};
