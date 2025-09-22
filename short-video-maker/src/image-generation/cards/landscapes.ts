import { PromptCard, registerPromptCards } from './index';

/**
 * Natural Landscape Prompt Cards
 * Organized templates for scenic and natural environment generation
 */

export const LANDSCAPE_CARDS: PromptCard[] = [
  {
    id: 'mountain-vista',
    name: 'Mountain Vista',
    description: 'Majestic mountain landscapes with dramatic peaks and valleys',
    category: 'landscapes',
    basePrompt: 'breathtaking mountain landscape with towering peaks, deep valleys, and pristine wilderness',
    variations: {
      seasons: ['spring bloom', 'summer green', 'autumn colors', 'winter snow'],
      times: ['golden hour sunrise', 'bright midday', 'golden sunset', 'blue hour twilight'],
      weather: ['clear skies', 'dramatic clouds', 'misty fog', 'gentle rain'],
      compositions: ['wide panoramic view', 'close-up rocky details', 'aerial perspective', 'valley floor looking up'],
      lighting: ['warm golden light', 'cool blue shadows', 'dramatic side lighting', 'soft diffused light']
    },
    tags: ['mountains', 'peaks', 'wilderness', 'nature', 'landscape', 'scenic'],
    examples: [
      'snow-capped mountain peaks during golden hour sunrise with dramatic clouds',
      'misty mountain valley in autumn colors with soft morning light'
    ]
  },
  {
    id: 'ocean-coastline',
    name: 'Ocean Coastline',
    description: 'Dynamic coastal scenes with waves, cliffs, and shorelines',
    category: 'landscapes',
    basePrompt: 'stunning ocean coastline with crystal clear waters, dramatic cliffs, and pristine beaches',
    variations: {
      seasons: ['spring calm', 'summer warmth', 'autumn storms', 'winter power'],
      times: ['dawn break', 'morning light', 'noon brightness', 'sunset glow', 'night stars'],
      weather: ['calm waters', 'gentle waves', 'stormy seas', 'misty spray'],
      compositions: ['wide beach panorama', 'cliff top view', 'wave close-up', 'underwater perspective'],
      lighting: ['reflected sunlight', 'deep blue shadows', 'golden beach light', 'moonlight reflection']
    },
    tags: ['ocean', 'coastline', 'waves', 'beach', 'cliffs', 'water', 'seascape'],
    examples: [
      'dramatic cliff coastline with crashing waves during golden hour',
      'calm tropical beach with turquoise waters under bright midday sun'
    ]
  },
  {
    id: 'forest-woodland',
    name: 'Forest Woodland',
    description: 'Lush forest environments with ancient trees and dappled light',
    category: 'landscapes',
    basePrompt: 'enchanting forest woodland with towering ancient trees, lush undergrowth, and magical atmosphere',
    variations: {
      seasons: ['spring growth', 'summer fullness', 'autumn transformation', 'winter dormancy'],
      times: ['early morning', 'filtered daylight', 'late afternoon', 'twilight hour'],
      weather: ['clear forest air', 'gentle mist', 'light rain', 'sun rays'],
      compositions: ['forest path view', 'canopy looking up', 'ground level detail', 'clearing vista'],
      lighting: ['dappled sunlight', 'deep forest shadows', 'golden rays', 'cool green light']
    },
    tags: ['forest', 'trees', 'woodland', 'nature', 'green', 'mystical'],
    examples: [
      'ancient forest path with dappled sunlight filtering through autumn leaves',
      'misty morning woodland with towering trees and soft green light'
    ]
  },
  {
    id: 'desert-landscape',
    name: 'Desert Landscape',
    description: 'Vast desert scenes with sand dunes, rock formations, and dramatic skies',
    category: 'landscapes',
    basePrompt: 'expansive desert landscape with rolling sand dunes, unique rock formations, and endless horizons',
    variations: {
      seasons: ['spring blooms', 'summer heat', 'autumn clarity', 'winter cool'],
      times: ['pre-dawn blue', 'sunrise gold', 'harsh midday', 'sunset fire', 'starry night'],
      weather: ['clear dry air', 'heat shimmer', 'sandstorm approach', 'rare rain'],
      compositions: ['endless dune vista', 'rock formation detail', 'oasis perspective', 'sky dominant view'],
      lighting: ['harsh direct sun', 'warm sand reflection', 'cool shadow contrast', 'dramatic silhouettes']
    },
    tags: ['desert', 'sand', 'dunes', 'arid', 'vast', 'minimal'],
    examples: [
      'rolling sand dunes at sunrise with warm golden light and cool shadows',
      'dramatic desert rock formations under stormy sky with harsh lighting'
    ]
  },
  {
    id: 'lake-reflection',
    name: 'Lake Reflection',
    description: 'Serene lake scenes with perfect reflections and surrounding nature',
    category: 'landscapes',
    basePrompt: 'peaceful lake with mirror-like reflections, surrounded by natural beauty and tranquil atmosphere',
    variations: {
      seasons: ['spring awakening', 'summer warmth', 'autumn mirror', 'winter ice'],
      times: ['misty dawn', 'bright morning', 'calm afternoon', 'golden evening'],
      weather: ['perfectly still', 'gentle breeze', 'light ripples', 'morning mist'],
      compositions: ['perfect reflection', 'lakeside view', 'across water vista', 'shoreline detail'],
      lighting: ['soft diffused', 'bright reflection', 'warm golden', 'cool blue tones']
    },
    tags: ['lake', 'water', 'reflection', 'serene', 'peaceful', 'mirror'],
    examples: [
      'mountain lake with perfect reflections during golden hour calm',
      'misty morning lake surrounded by autumn forest colors'
    ]
  },
  {
    id: 'valley-meadow',
    name: 'Valley Meadow',
    description: 'Lush meadows and valleys with wildflowers and rolling hills',
    category: 'landscapes',
    basePrompt: 'vibrant valley meadow filled with wildflowers, rolling green hills, and pastoral beauty',
    variations: {
      seasons: ['spring wildflowers', 'summer lushness', 'autumn grasses', 'winter simplicity'],
      times: ['morning dew', 'bright daylight', 'afternoon warmth', 'evening glow'],
      weather: ['clear sunny', 'partly cloudy', 'light breeze', 'after rain fresh'],
      compositions: ['wide valley view', 'flower field close-up', 'hill crest perspective', 'stream through meadow'],
      lighting: ['warm sunlight', 'soft cloud shadows', 'backlighting flowers', 'even natural light']
    },
    tags: ['meadow', 'valley', 'flowers', 'pastoral', 'green', 'peaceful'],
    examples: [
      'wildflower meadow in full spring bloom with rolling hills background',
      'golden evening light across valley grassland with scattered wildflowers'
    ]
  }
];

// Register landscape cards
registerPromptCards('landscapes', LANDSCAPE_CARDS);

// Export convenience functions for landscape-specific operations
export function getLandscapeCards(): PromptCard[] {
  return LANDSCAPE_CARDS;
}

export function getLandscapeCardById(id: string): PromptCard | undefined {
  return LANDSCAPE_CARDS.find(card => card.id === id);
}

export function getLandscapeCardsByTag(tag: string): PromptCard[] {
  return LANDSCAPE_CARDS.filter(card => 
    card.tags.some(cardTag => cardTag.toLowerCase().includes(tag.toLowerCase()))
  );
}