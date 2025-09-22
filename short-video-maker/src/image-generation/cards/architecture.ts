import { PromptCard, registerPromptCards } from './index';

/**
 * Architecture Prompt Cards
 * Building and structural design templates
 */

export const ARCHITECTURE_CARDS: PromptCard[] = [
  {
    id: 'modern-skyscraper',
    name: 'Modern Skyscraper',
    description: 'Contemporary high-rise buildings with sleek glass and steel design',
    category: 'architecture',
    basePrompt: 'modern skyscraper with glass facade, steel frame construction, contemporary urban architecture',
    variations: {
      styles: ['minimalist', 'futuristic', 'neo-classical', 'postmodern'],
      times: ['dawn reflection', 'bright daylight', 'golden hour', 'night illumination'],
      angles: ['ground level looking up', 'aerial view', 'street perspective', 'architectural detail'],
      lighting: ['natural lighting', 'dramatic shadows', 'interior lighting', 'sunset reflection'],
      weather: ['clear sky', 'cloudy backdrop', 'storm approaching', 'misty atmosphere']
    },
    tags: ['skyscraper', 'modern', 'urban', 'glass', 'steel', 'contemporary'],
    examples: [
      'sleek glass skyscraper reflecting golden hour sunlight with dramatic shadows',
      'futuristic high-rise building at night with interior lighting visible through glass facade'
    ]
  },
  {
    id: 'historic-cathedral',
    name: 'Historic Cathedral',
    description: 'Ancient gothic and classical religious architecture',
    category: 'architecture',
    basePrompt: 'majestic gothic cathedral with stone masonry, flying buttresses, and ornate details',
    variations: {
      styles: ['gothic', 'romanesque', 'baroque', 'neo-gothic'],
      times: ['morning light', 'afternoon sun', 'golden hour', 'twilight blue'],
      angles: ['facade view', 'interior nave', 'tower detail', 'rose window close-up'],
      lighting: ['stained glass light', 'stone texture shadows', 'interior candlelight', 'external uplighting'],
      weather: ['clear skies', 'dramatic clouds', 'misty morning', 'storm clouds']
    },
    tags: ['cathedral', 'gothic', 'historic', 'stone', 'religious', 'ornate'],
    examples: [
      'gothic cathedral facade with intricate stone carvings during golden hour',
      'cathedral interior with colorful stained glass light filtering through nave'
    ]
  },
  {
    id: 'traditional-house',
    name: 'Traditional House',
    description: 'Classic residential architecture from various cultural traditions',
    category: 'architecture',
    basePrompt: 'traditional house with authentic cultural design elements and natural materials',
    variations: {
      styles: ['japanese traditional', 'european cottage', 'american colonial', 'mediterranean villa'],
      times: ['morning warmth', 'midday clarity', 'evening glow', 'night comfort'],
      angles: ['front elevation', 'garden view', 'interior glimpse', 'architectural detail'],
      lighting: ['warm interior light', 'natural daylight', 'lantern lighting', 'fireplace glow'],
      seasons: ['spring garden', 'summer fullness', 'autumn colors', 'winter snow']
    },
    tags: ['traditional', 'residential', 'cultural', 'cozy', 'authentic', 'heritage'],
    examples: [
      'japanese traditional house with wooden structure and paper screens in autumn setting',
      'european cottage with stone walls and flowering garden during spring morning'
    ]
  },
  {
    id: 'industrial-structure',
    name: 'Industrial Structure',
    description: 'Functional industrial and infrastructure architecture',
    category: 'architecture',
    basePrompt: 'industrial structure with exposed steel, concrete, and functional design elements',
    variations: {
      styles: ['brutalist', 'industrial modern', 'steampunk', 'post-industrial'],
      times: ['industrial dawn', 'working hours', 'shift change', 'night operations'],
      angles: ['structural detail', 'wide industrial view', 'machinery close-up', 'worker perspective'],
      lighting: ['harsh industrial lighting', 'steam and shadows', 'neon accents', 'spotlight drama'],
      weather: ['clear working day', 'industrial haze', 'storm approaching', 'foggy morning']
    },
    tags: ['industrial', 'functional', 'steel', 'concrete', 'mechanical', 'urban'],
    examples: [
      'brutalist concrete structure with exposed steel beams under dramatic lighting',
      'industrial facility with steam and machinery during early morning shift'
    ]
  },
  {
    id: 'bridge-engineering',
    name: 'Bridge Engineering',
    description: 'Architectural marvels of bridge design and engineering',
    category: 'architecture',
    basePrompt: 'impressive bridge structure spanning across water or valley with engineering excellence',
    variations: {
      styles: ['suspension bridge', 'cable-stayed', 'arch bridge', 'cantilever design'],
      times: ['sunrise span', 'midday crossing', 'sunset silhouette', 'night illumination'],
      angles: ['side elevation', 'underneath view', 'deck perspective', 'tower detail'],
      lighting: ['natural sunlight', 'structural shadows', 'LED illumination', 'traffic lights'],
      weather: ['clear visibility', 'misty morning', 'storm drama', 'rainbow after rain']
    },
    tags: ['bridge', 'engineering', 'span', 'structural', 'transportation', 'landmark'],
    examples: [
      'suspension bridge silhouetted against sunset with cable details visible',
      'arch bridge spanning misty valley with morning light highlighting stone structure'
    ]
  },
  {
    id: 'museum-gallery',
    name: 'Museum Gallery',
    description: 'Cultural architecture designed for art and exhibition spaces',
    category: 'architecture',
    basePrompt: 'museum gallery space with clean lines, natural lighting, and exhibition-focused design',
    variations: {
      styles: ['contemporary museum', 'classical gallery', 'avant-garde space', 'minimalist design'],
      times: ['opening hours', 'exhibition viewing', 'closing time', 'private viewing'],
      angles: ['gallery interior', 'facade entrance', 'skylight detail', 'exhibition space'],
      lighting: ['natural skylight', 'gallery spotlighting', 'architectural lighting', 'artwork illumination'],
      moods: ['contemplative', 'inspiring', 'educational', 'cultural']
    },
    tags: ['museum', 'gallery', 'cultural', 'exhibition', 'art', 'educational'],
    examples: [
      'contemporary museum interior with natural skylight illuminating white gallery walls',
      'classical gallery facade with columns and entrance steps during golden hour'
    ]
  }
];

// Register architecture cards
registerPromptCards('architecture', ARCHITECTURE_CARDS);

// Export convenience functions for architecture-specific operations
export function getArchitectureCards(): PromptCard[] {
  return ARCHITECTURE_CARDS;
}

export function getArchitectureCardById(id: string): PromptCard | undefined {
  return ARCHITECTURE_CARDS.find(card => card.id === id);
}

export function getArchitectureCardsByStyle(style: string): PromptCard[] {
  return ARCHITECTURE_CARDS.filter(card => 
    card.variations.styles?.some(cardStyle => cardStyle.toLowerCase().includes(style.toLowerCase()))
  );
}