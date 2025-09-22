import { PromptCard, registerPromptCards } from './index';

/**
 * Character Prompt Cards
 * Human and fictional character templates for consistent generation
 */

export const CHARACTER_CARDS: PromptCard[] = [
  {
    id: 'fantasy-warrior',
    name: 'Fantasy Warrior',
    description: 'Epic fantasy warrior characters with armor and weapons',
    category: 'characters',
    basePrompt: 'fantasy warrior character with detailed armor, weapon, and heroic stance',
    variations: {
      angles: ['front view', '45 degree angle', 'side profile', 'three-quarter view'],
      expressions: ['determined', 'fierce', 'noble', 'battle-ready'],
      compositions: ['upper body portrait', 'full body stance', 'action pose', 'close-up detail'],
      lighting: ['dramatic lighting', 'heroic backlighting', 'soft portrait light', 'battle scene lighting'],
      styles: ['medieval knight', 'barbarian warrior', 'elven fighter', 'samurai warrior']
    },
    tags: ['fantasy', 'warrior', 'armor', 'weapon', 'heroic', 'battle'],
    examples: [
      'medieval knight in full armor with sword, determined expression, dramatic lighting',
      'elven warrior with bow and leather armor, noble stance, soft forest lighting'
    ]
  },
  {
    id: 'modern-professional',
    name: 'Modern Professional',
    description: 'Contemporary business and professional character types',
    category: 'characters',
    basePrompt: 'modern professional person in business attire with confident demeanor',
    variations: {
      angles: ['front facing', 'slight angle', 'side profile', 'three-quarter turn'],
      expressions: ['confident smile', 'focused concentration', 'friendly approachable', 'serious professional'],
      compositions: ['headshot portrait', 'upper body', 'full business attire', 'office environment'],
      lighting: ['corporate lighting', 'natural office light', 'professional headshot lighting', 'meeting room ambiance'],
      styles: ['business executive', 'creative professional', 'tech worker', 'consultant']
    },
    tags: ['professional', 'business', 'modern', 'corporate', 'confident', 'workplace'],
    examples: [
      'business executive in suit with confident smile, professional headshot lighting',
      'creative professional in casual business attire, friendly expression, natural office light'
    ]
  },
  {
    id: 'mystical-mage',
    name: 'Mystical Mage',
    description: 'Magical practitioners with robes, staffs, and arcane elements',
    category: 'characters',
    basePrompt: 'mystical mage character with flowing robes, magical staff, and arcane aura',
    variations: {
      angles: ['frontal pose', 'casting angle', 'side profile', 'dramatic angle'],
      expressions: ['wise concentration', 'mystical smile', 'intense focus', 'serene knowledge'],
      compositions: ['portrait with staff', 'full magical pose', 'spellcasting action', 'robed figure'],
      lighting: ['magical glow', 'mystical backlighting', 'arcane energy effects', 'candlelight ambiance'],
      styles: ['wizard scholar', 'battle mage', 'nature druid', 'elemental sorcerer']
    },
    tags: ['mage', 'magical', 'wizard', 'mystical', 'arcane', 'spellcaster'],
    examples: [
      'wise wizard with long beard and staff, magical glow effects, mystical concentration',
      'nature druid with wooden staff and earth tones, serene forest lighting'
    ]
  },
  {
    id: 'sci-fi-explorer',
    name: 'Sci-Fi Explorer',
    description: 'Futuristic characters with advanced technology and space gear',
    category: 'characters',
    basePrompt: 'futuristic explorer character with advanced technology, space suit, and sci-fi equipment',
    variations: {
      angles: ['heroic front view', 'exploration pose', 'side equipment view', 'action angle'],
      expressions: ['determined explorer', 'curious scientist', 'alert vigilance', 'confident pioneer'],
      compositions: ['space suit portrait', 'full gear display', 'exploration action', 'technology interaction'],
      lighting: ['sci-fi blue glow', 'space lighting', 'technology highlights', 'alien world ambiance'],
      styles: ['space marine', 'scientist explorer', 'alien world scout', 'cyberpunk operative']
    },
    tags: ['sci-fi', 'futuristic', 'space', 'technology', 'explorer', 'advanced'],
    examples: [
      'space marine in powered armor with plasma rifle, determined expression, blue tech glow',
      'scientist explorer with scanning equipment, curious expression, alien world lighting'
    ]
  },
  {
    id: 'historical-figure',
    name: 'Historical Figure',
    description: 'Period-accurate characters from various historical eras',
    category: 'characters',
    basePrompt: 'historical character in period-accurate clothing with authentic cultural details',
    variations: {
      angles: ['formal portrait', 'period pose', 'side profile', 'cultural stance'],
      expressions: ['dignified composure', 'period appropriate', 'cultural pride', 'historical gravitas'],
      compositions: ['formal portrait', 'period costume detail', 'cultural context', 'historical setting'],
      lighting: ['classical portrait lighting', 'period ambiance', 'historical mood', 'cultural atmosphere'],
      styles: ['renaissance noble', 'victorian gentleman', 'ancient warrior', 'medieval scholar']
    },
    tags: ['historical', 'period', 'authentic', 'cultural', 'traditional', 'heritage'],
    examples: [
      'renaissance noble in elaborate clothing with dignified expression, classical portrait lighting',
      'medieval scholar with manuscripts and robes, historical gravitas, period ambiance'
    ]
  },
  {
    id: 'everyday-person',
    name: 'Everyday Person',
    description: 'Regular people in casual, relatable situations and attire',
    category: 'characters',
    basePrompt: 'everyday person in casual clothing with natural, relatable appearance',
    variations: {
      angles: ['natural front view', 'casual angle', 'relaxed side view', 'friendly three-quarter'],
      expressions: ['genuine smile', 'relaxed contentment', 'friendly warmth', 'natural ease'],
      compositions: ['casual portrait', 'everyday activity', 'lifestyle shot', 'candid moment'],
      lighting: ['natural daylight', 'warm indoor light', 'casual photography', 'lifestyle lighting'],
      styles: ['student casual', 'parent figure', 'active lifestyle', 'work from home']
    },
    tags: ['everyday', 'casual', 'relatable', 'natural', 'lifestyle', 'authentic'],
    examples: [
      'student in casual clothes with genuine smile, natural daylight, relaxed pose',
      'parent figure in comfortable attire with warm expression, lifestyle lighting'
    ]
  }
];

// Register character cards
registerPromptCards('characters', CHARACTER_CARDS);

// Export convenience functions for character-specific operations
export function getCharacterCards(): PromptCard[] {
  return CHARACTER_CARDS;
}

export function getCharacterCardById(id: string): PromptCard | undefined {
  return CHARACTER_CARDS.find(card => card.id === id);
}

export function getCharacterCardsByStyle(style: string): PromptCard[] {
  return CHARACTER_CARDS.filter(card => 
    card.variations.styles?.some(cardStyle => cardStyle.toLowerCase().includes(style.toLowerCase()))
  );
}