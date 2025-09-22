/**
 * Prompt Card Management System
 * Organized prompt templates for different themes and use cases
 */

export interface PromptCard {
  id: string;
  name: string;
  description: string;
  category: string;
  basePrompt: string;
  variations: {
    angles?: string[];
    styles?: string[];
    moods?: string[];
    compositions?: string[];
    lighting?: string[];
    seasons?: string[];
    times?: string[];
    weather?: string[];
    expressions?: string[];
    intensities?: string[];
    palettes?: string[];
    scales?: string[];
    perspectives?: string[];
  };
  tags: string[];
  examples?: string[];
}

export interface PromptVariationSet {
  angles: string[];
  expressions: string[];
  compositions: string[];
  lighting: string[];
}

// Re-export all card categories
export * from './characters';
export * from './landscapes';
export * from './architecture';
export * from './objects';
export * from './abstract';

// Central registry of all prompt cards
export const PROMPT_CARD_REGISTRY: Record<string, PromptCard[]> = {};

// Helper function to register cards
export function registerPromptCards(category: string, cards: PromptCard[]) {
  PROMPT_CARD_REGISTRY[category] = cards;
}

// Helper function to get all cards by category
export function getCardsByCategory(category: string): PromptCard[] {
  return PROMPT_CARD_REGISTRY[category] || [];
}

// Helper function to get card by ID
export function getCardById(id: string): PromptCard | undefined {
  for (const category of Object.values(PROMPT_CARD_REGISTRY)) {
    const card = category.find(c => c.id === id);
    if (card) return card;
  }
  return undefined;
}

// Helper function to search cards
export function searchCards(query: string): PromptCard[] {
  const results: PromptCard[] = [];
  const searchTerm = query.toLowerCase();
  
  for (const category of Object.values(PROMPT_CARD_REGISTRY)) {
    for (const card of category) {
      if (
        card.name.toLowerCase().includes(searchTerm) ||
        card.description.toLowerCase().includes(searchTerm) ||
        card.tags.some(tag => tag.toLowerCase().includes(searchTerm)) ||
        card.basePrompt.toLowerCase().includes(searchTerm)
      ) {
        results.push(card);
      }
    }
  }
  
  return results;
}