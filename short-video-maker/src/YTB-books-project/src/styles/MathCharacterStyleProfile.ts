/**
 * MathCharacterStyleProfile
 * 3Blue1Brown 영감 — 어두운 배경, 네온 하이라이트, 귀여운 올빼미 캐릭터 (지혜의 상징)
 */

import type { VideoStyleProfile } from './VideoStyleProfile';

export const MATH_CHARACTER_STYLE_PROFILE: VideoStyleProfile = {
  id: 'math_character',
  displayName: '3B1B Math Character',

  // ── ImageGenerator ── (v6.0: 서술형 prompt — Google 공식 "describe the scene" 원칙)

  narrativeStylePrefix: `On a dark navy background, a cute wise owl character with round glasses sits among glowing mathematical symbols and geometric shapes. The owl is small and adorable with big curious eyes, rendered as a clean minimalist vector illustration with neon teal and blue edge highlights. Portrait 9:16 composition. Only the owl character appears — no human characters.`,

  educationalStylePrefix: `On a dark navy background, create a clean educational diagram using glowing teal and yellow vector lines. Show the concept through geometric shapes, coordinate planes, or graph overlays. Portrait 9:16 composition, purely visual with shapes and color coding.`,

  formulaConceptPrefix: `On a dark background, visualize the mathematical concept as glowing geometric shapes that morph and transform. Use neon teal highlights and abstract vector animations in 3Blue1Brown style. Portrait 9:16, minimalist composition using only shapes, lines, and color gradients.`,

  diagramStylePrefix: `On a dark navy background, draw a clean technical diagram using neon color-coded vector lines in teal, yellow, and coral. Use arrows, shapes, and icons to show relationships and flow. Portrait 9:16 composition, purely visual elements.`,

  imagePromptSuffix: 'Render everything on a dark background using only geometric shapes, glowing lines, and color-coded visual elements.',

  moods: {
    nostalgic: 'deep space atmosphere, distant stars, contemplative geometry',
    whimsical: 'playful math symbols floating, gentle particle effects',
    peaceful: 'calm dark void, slowly rotating geometric shapes, ambient glow',
    adventurous: 'dynamic transformations, expanding fractals, energetic motion lines',
  },

  compositions: [
    'centered mathematical object with subtle glow',
    'wide view of coordinate plane with highlights',
    'close-up on a single symbol character',
    'isometric 3D geometric view',
    'split screen comparison (left vs right)',
    'radial symmetry emanating from center',
    'layered depth with parallax elements',
    'diagonal flow from top-left to bottom-right',
    'floating elements in dark void',
    'zoomed out fractal or recursive pattern',
  ],

  // ── MathRenderer ──

  mathSvgFillColor: '#4ecdc4',  // teal
  useColorCodedVariables: true,
  variableColors: {
    x: '#4ecdc4',   // teal
    y: '#ffe66d',   // yellow
    z: '#ff6b6b',   // coral red
    t: '#c084fc',   // purple
    n: '#4ecdc4',   // teal
    m: '#ffe66d',   // yellow
    k: '#ff6b6b',   // coral
    a: '#60a5fa',   // blue
    b: '#34d399',   // green
    c: '#fbbf24',   // amber
    // Greek letters
    alpha: '#4ecdc4',
    beta: '#ffe66d',
    gamma: '#ff6b6b',
    theta: '#c084fc',
    lambda: '#60a5fa',
    sigma: '#34d399',
    pi: '#fbbf24',
  },
  defaultFormulaPosition: 'top',

  // ── ContentPlanner ──

  contentPlannerStyleHint: '3Blue1Brown dark background, mathematical animation, geometric visualization',
  visualPromptGuide: `Write each visualPrompt as a descriptive sentence about what to draw, not a keyword list.
Always specify the dark navy/black background explicitly. Describe the SPECIFIC concept from the source material.
- Narrative scenes: "A cute owl with round glasses [doing action related to topic] on a dark background with glowing [topic-related] elements"
- Educational scenes: "On a dark background, a diagram showing [specific concept] using glowing teal lines and geometric shapes"
- Formula scenes: "Glowing geometric shapes on dark background representing [specific formula concept], with neon teal highlights"
Color coding: teal for primary, yellow for secondary, coral for emphasis.
IMPORTANT: Always describe the ACTUAL topic content, never use generic descriptions like "educational illustration".`,

  // ── TTS ──

  ttsVoice: 'Charon',
  ttsGender: 'male',
  ttsStylePrompt: '수학 교수처럼 차분하고 명확하게, 핵심을 짚어서 설명해주세요',

  // ── VEO 3.1 (v11.0) ──
  veoMotionHint: 'Slow, deliberate camera movements. Subtle zoom on key concepts. Clean mathematical transitions.',
};
