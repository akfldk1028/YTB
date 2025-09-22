import { PromptCard, registerPromptCards } from './index';

/**
 * Abstract Prompt Cards
 * Non-representational art, patterns, and conceptual designs
 */

export const ABSTRACT_CARDS: PromptCard[] = [
  {
    id: 'geometric-patterns',
    name: 'Geometric Patterns',
    description: 'Mathematical precision in abstract geometric compositions',
    category: 'abstract',
    basePrompt: 'abstract geometric pattern with precise shapes, mathematical relationships, and visual harmony',
    variations: {
      styles: ['minimalist geometry', 'complex tessellation', 'islamic patterns', 'modern geometric'],
      compositions: ['radial symmetry', 'linear progression', 'scattered elements', 'grid formation'],
      lighting: ['flat design', 'dimensional shadows', 'gradient effects', 'high contrast'],
      moods: ['mathematical', 'meditative', 'dynamic', 'balanced'],
      angles: ['frontal pattern', 'perspective depth', 'close-up detail', 'infinite repeat']
    },
    tags: ['geometric', 'pattern', 'mathematical', 'symmetry', 'abstract', 'design'],
    examples: [
      'minimalist geometric pattern with triangular elements in harmonious color progression',
      'islamic-inspired tessellation with intricate mathematical precision and radial symmetry'
    ]
  },
  {
    id: 'fluid-dynamics',
    name: 'Fluid Dynamics',
    description: 'Organic flowing forms inspired by liquid motion and natural flow',
    category: 'abstract',
    basePrompt: 'abstract fluid dynamics with flowing organic forms, smooth transitions, and liquid-like movement',
    variations: {
      styles: ['liquid metal', 'watercolor flow', 'smoke patterns', 'digital fluid'],
      compositions: ['spiral motion', 'wave formation', 'droplet interaction', 'stream convergence'],
      lighting: ['translucent glow', 'metallic reflection', 'soft diffusion', 'chromatic refraction'],
      moods: ['flowing', 'ethereal', 'dynamic', 'organic'],
      times: ['frozen motion', 'mid-flow', 'impact moment', 'settling calm']
    },
    tags: ['fluid', 'organic', 'flow', 'liquid', 'motion', 'smooth'],
    examples: [
      'liquid metal abstract with flowing forms and metallic reflections in spiral motion',
      'watercolor flow pattern with soft diffusion and translucent color interactions'
    ]
  },
  {
    id: 'energy-fields',
    name: 'Energy Fields',
    description: 'Invisible forces made visible through abstract energy representations',
    category: 'abstract',
    basePrompt: 'abstract energy field visualization with electromagnetic patterns, force lines, and dynamic intensity',
    variations: {
      styles: ['electromagnetic waves', 'particle physics', 'aura visualization', 'force field mapping'],
      compositions: ['radial emanation', 'field interaction', 'wave interference', 'particle streams'],
      lighting: ['neon glow', 'plasma effects', 'electric discharge', 'quantum luminescence'],
      moods: ['energetic', 'scientific', 'mystical', 'powerful'],
      intensities: ['subtle field', 'moderate energy', 'high intensity', 'peak discharge']
    },
    tags: ['energy', 'electromagnetic', 'field', 'force', 'scientific', 'glow'],
    examples: [
      'electromagnetic field visualization with neon glow and radial wave patterns',
      'particle physics abstract showing energy interactions with plasma effects'
    ]
  },
  {
    id: 'color-symphony',
    name: 'Color Symphony',
    description: 'Pure color relationships and chromatic harmonies in abstract form',
    category: 'abstract',
    basePrompt: 'abstract color symphony with pure chromatic relationships, tonal harmonies, and color theory principles',
    variations: {
      styles: ['color field painting', 'chromatic gradient', 'complementary contrast', 'monochromatic study'],
      compositions: ['color blocking', 'gradient transition', 'scattered chromatics', 'layered transparency'],
      lighting: ['pure color', 'color mixing', 'chromatic saturation', 'tonal variation'],
      moods: ['harmonious', 'vibrant', 'contemplative', 'energizing'],
      palettes: ['warm spectrum', 'cool palette', 'earth tones', 'neon brights']
    },
    tags: ['color', 'chromatic', 'harmony', 'spectrum', 'pure', 'tonal'],
    examples: [
      'color field abstract with pure chromatic relationships and gradient transitions',
      'complementary color contrast study with vibrant saturation and harmonic balance'
    ]
  },
  {
    id: 'texture-exploration',
    name: 'Texture Exploration',
    description: 'Abstract compositions focusing on surface qualities and tactile patterns',
    category: 'abstract',
    basePrompt: 'abstract texture exploration with varied surface qualities, tactile patterns, and material suggestions',
    variations: {
      styles: ['organic textures', 'industrial surfaces', 'natural patterns', 'digital noise'],
      compositions: ['layered textures', 'texture collision', 'surface variation', 'pattern repetition'],
      lighting: ['texture highlighting', 'surface shadows', 'material reflection', 'tactile definition'],
      moods: ['tactile', 'material', 'sensory', 'dimensional'],
      scales: ['macro detail', 'medium texture', 'pattern overview', 'infinite field']
    },
    tags: ['texture', 'surface', 'tactile', 'material', 'pattern', 'dimensional'],
    examples: [
      'organic texture abstract with layered surface qualities and tactile definition',
      'industrial texture exploration showing material collision and surface variation'
    ]
  },
  {
    id: 'dimensional-space',
    name: 'Dimensional Space',
    description: 'Exploration of depth, perspective, and spatial relationships in abstract form',
    category: 'abstract',
    basePrompt: 'abstract dimensional space with perspective illusions, depth perception, and spatial relationships',
    variations: {
      styles: ['impossible geometry', 'perspective play', 'dimensional portal', 'space warping'],
      compositions: ['depth illusion', 'spatial tunnel', 'dimensional layers', 'perspective shift'],
      lighting: ['dimensional glow', 'depth shadows', 'perspective lighting', 'spatial highlights'],
      moods: ['mysterious', 'infinite', 'architectural', 'mind-bending'],
      perspectives: ['linear perspective', 'curved space', 'multiple viewpoints', 'dimensional portal']
    },
    tags: ['dimensional', 'space', 'perspective', 'depth', 'illusion', 'geometry'],
    examples: [
      'impossible geometry abstract with perspective illusions and dimensional glow effects',
      'spatial tunnel visualization with depth shadows and infinite perspective recession'
    ]
  }
];

// Register abstract cards
registerPromptCards('abstract', ABSTRACT_CARDS);

// Export convenience functions for abstract-specific operations
export function getAbstractCards(): PromptCard[] {
  return ABSTRACT_CARDS;
}

export function getAbstractCardById(id: string): PromptCard | undefined {
  return ABSTRACT_CARDS.find(card => card.id === id);
}

export function getAbstractCardsByMood(mood: string): PromptCard[] {
  return ABSTRACT_CARDS.filter(card => 
    card.variations.moods?.some(cardMood => cardMood.toLowerCase().includes(mood.toLowerCase()))
  );
}