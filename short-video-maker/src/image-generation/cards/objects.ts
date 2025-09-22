import { PromptCard, registerPromptCards } from './index';

/**
 * Objects Prompt Cards
 * Individual items, products, and decorative objects
 */

export const OBJECT_CARDS: PromptCard[] = [
  {
    id: 'vintage-camera',
    name: 'Vintage Camera',
    description: 'Classic analog cameras with retro charm and mechanical details',
    category: 'objects',
    basePrompt: 'vintage analog camera with metal body, leather details, and classic lens design',
    variations: {
      styles: ['35mm SLR', 'medium format', 'rangefinder', 'instant camera'],
      angles: ['front view', 'side profile', 'top down', 'detail close-up'],
      lighting: ['studio lighting', 'natural window light', 'dramatic shadows', 'soft diffused'],
      compositions: ['isolated on white', 'vintage desk setup', 'camera collection', 'lifestyle arrangement'],
      moods: ['nostalgic', 'professional', 'artistic', 'collectible']
    },
    tags: ['camera', 'vintage', 'photography', 'retro', 'mechanical', 'classic'],
    examples: [
      'vintage 35mm SLR camera with leather grip under soft studio lighting',
      'collection of classic cameras arranged on wooden desk with dramatic shadows'
    ]
  },
  {
    id: 'artisan-pottery',
    name: 'Artisan Pottery',
    description: 'Handcrafted ceramic vessels and decorative pottery pieces',
    category: 'objects',
    basePrompt: 'handcrafted ceramic pottery with organic shapes, glazed finish, and artisan craftsmanship',
    variations: {
      styles: ['rustic earthenware', 'modern ceramic', 'japanese raku', 'mediterranean pottery'],
      angles: ['front elevation', 'three-quarter view', 'top down', 'detail texture'],
      lighting: ['natural light', 'rim lighting', 'textural shadows', 'glaze highlights'],
      compositions: ['single piece focus', 'pottery collection', 'studio workspace', 'lifestyle setting'],
      moods: ['earthy', 'elegant', 'rustic', 'contemporary']
    },
    tags: ['pottery', 'ceramic', 'handcrafted', 'artisan', 'vessel', 'decorative'],
    examples: [
      'rustic earthenware vase with organic shape and natural lighting highlighting texture',
      'collection of glazed ceramic bowls arranged with soft shadows and rim lighting'
    ]
  },
  {
    id: 'luxury-watch',
    name: 'Luxury Watch',
    description: 'Precision timepieces with intricate mechanical details and premium materials',
    category: 'objects',
    basePrompt: 'luxury mechanical watch with detailed dial, premium metal case, and precise craftsmanship',
    variations: {
      styles: ['dress watch', 'sports chronograph', 'diving watch', 'skeleton movement'],
      angles: ['face view', 'side profile', 'crown detail', 'movement close-up'],
      lighting: ['jewelry lighting', 'metal reflections', 'dramatic contrast', 'soft highlights'],
      compositions: ['isolated luxury', 'lifestyle arrangement', 'technical detail', 'brand presentation'],
      moods: ['prestigious', 'technical', 'elegant', 'sophisticated']
    },
    tags: ['watch', 'luxury', 'timepiece', 'mechanical', 'precision', 'premium'],
    examples: [
      'luxury dress watch with mother-of-pearl dial under jewelry lighting with metal reflections',
      'chronograph sports watch showing detailed movement through skeleton case back'
    ]
  },
  {
    id: 'fresh-flowers',
    name: 'Fresh Flowers',
    description: 'Natural floral arrangements and botanical subjects',
    category: 'objects',
    basePrompt: 'fresh flower arrangement with vibrant petals, natural stems, and organic beauty',
    variations: {
      styles: ['rose bouquet', 'wildflower mix', 'minimalist single stem', 'elaborate arrangement'],
      angles: ['bouquet view', 'single flower detail', 'overhead arrangement', 'side profile'],
      lighting: ['natural window light', 'soft diffused', 'backlighting petals', 'dramatic shadows'],
      compositions: ['vase arrangement', 'scattered petals', 'garden fresh', 'studio setup'],
      seasons: ['spring bloom', 'summer abundance', 'autumn warmth', 'winter elegance']
    },
    tags: ['flowers', 'botanical', 'natural', 'fresh', 'petals', 'arrangement'],
    examples: [
      'fresh rose bouquet in glass vase with natural window light highlighting petal texture',
      'single stem flower with water droplets backlit to show translucent petals'
    ]
  },
  {
    id: 'gourmet-food',
    name: 'Gourmet Food',
    description: 'Artfully prepared dishes and culinary presentations',
    category: 'objects',
    basePrompt: 'gourmet food presentation with artistic plating, fresh ingredients, and culinary excellence',
    variations: {
      styles: ['fine dining', 'rustic artisan', 'modern molecular', 'traditional comfort'],
      angles: ['overhead plating', 'side dish view', 'ingredient detail', 'table setting'],
      lighting: ['natural food lighting', 'restaurant ambiance', 'ingredient highlights', 'steam and warmth'],
      compositions: ['single dish focus', 'table spread', 'ingredient arrangement', 'chef preparation'],
      moods: ['appetizing', 'elegant', 'comfort', 'artistic']
    },
    tags: ['food', 'gourmet', 'culinary', 'plating', 'ingredients', 'dining'],
    examples: [
      'fine dining plate with artistic presentation under restaurant lighting with garnish details',
      'rustic bread and cheese arrangement with natural lighting highlighting textures'
    ]
  },
  {
    id: 'musical-instrument',
    name: 'Musical Instrument',
    description: 'Classical and modern instruments showcasing craftsmanship and musical heritage',
    category: 'objects',
    basePrompt: 'musical instrument with detailed craftsmanship, wood grain, and artistic design elements',
    variations: {
      styles: ['acoustic guitar', 'violin family', 'grand piano', 'brass instrument'],
      angles: ['front detail', 'side profile', 'close-up craftsmanship', 'playing position'],
      lighting: ['warm studio light', 'stage lighting', 'natural wood highlights', 'dramatic shadows'],
      compositions: ['isolated instrument', 'music room setting', 'performance context', 'craftsmanship detail'],
      moods: ['musical', 'artistic', 'crafted', 'performance']
    },
    tags: ['instrument', 'music', 'wooden', 'craftsmanship', 'artistic', 'sound'],
    examples: [
      'acoustic guitar with detailed wood grain under warm studio lighting showing craftsmanship',
      'violin with bow in performance lighting highlighting varnish and string details'
    ]
  }
];

// Register object cards
registerPromptCards('objects', OBJECT_CARDS);

// Export convenience functions for object-specific operations
export function getObjectCards(): PromptCard[] {
  return OBJECT_CARDS;
}

export function getObjectCardById(id: string): PromptCard | undefined {
  return OBJECT_CARDS.find(card => card.id === id);
}

export function getObjectCardsByMood(mood: string): PromptCard[] {
  return OBJECT_CARDS.filter(card => 
    card.variations.moods?.some(cardMood => cardMood.toLowerCase().includes(mood.toLowerCase()))
  );
}