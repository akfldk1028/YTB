/**
 * Style Registry
 * getStyleProfile() 팩토리 — 스타일 ID로 프로파일 조회
 *
 * 새 스타일 추가: 프로파일 파일 1개 생성 + 여기 STYLE_REGISTRY에 등록 → 끝
 */

export type { VideoStyleProfile } from './VideoStyleProfile';
export { GHIBLI_STYLE_PROFILE } from './GhibliStyleProfile';
export { MATH_CHARACTER_STYLE_PROFILE } from './MathCharacterStyleProfile';
export { HUMANITIES_STYLE_PROFILE } from './HumanitiesStyleProfile';
export { VIRAL_CAT_STYLE_PROFILE } from './ViralCatStyleProfile';
export { PHILOSOPHY_MENTOR_STYLE_PROFILE } from './PhilosophyMentorStyleProfile';
export { getContentPlannerStyleGuide, getMathCharacterDomainExamples, getViralCatDomainExamples } from './ContentPlannerStyleGuide';

import type { VideoStyleProfile } from './VideoStyleProfile';
import { GHIBLI_STYLE_PROFILE } from './GhibliStyleProfile';
import { MATH_CHARACTER_STYLE_PROFILE } from './MathCharacterStyleProfile';
import { HUMANITIES_STYLE_PROFILE } from './HumanitiesStyleProfile';
import { VIRAL_CAT_STYLE_PROFILE } from './ViralCatStyleProfile';
import { PHILOSOPHY_MENTOR_STYLE_PROFILE } from './PhilosophyMentorStyleProfile';

const STYLE_REGISTRY: Record<string, VideoStyleProfile> = {
  ghibli: GHIBLI_STYLE_PROFILE,
  math_character: MATH_CHARACTER_STYLE_PROFILE,
  humanities: HUMANITIES_STYLE_PROFILE,
  viral_cat: VIRAL_CAT_STYLE_PROFILE,
  philosophy_mentor: PHILOSOPHY_MENTOR_STYLE_PROFILE,
};

/**
 * 스타일 프로파일 조회 (팩토리)
 * @param id 스타일 ID (default: 'math_character' — PRIMARY)
 * @returns VideoStyleProfile — unknown ID일 때 math_character fallback
 */
export function getStyleProfile(id?: string): VideoStyleProfile {
  if (!id) return MATH_CHARACTER_STYLE_PROFILE;
  const profile = STYLE_REGISTRY[id];
  if (!profile) {
    console.warn(`[StyleRegistry] Unknown style '${id}', falling back to 'math_character'. Available: ${Object.keys(STYLE_REGISTRY).join(', ')}`);
    return MATH_CHARACTER_STYLE_PROFILE;
  }
  return profile;
}

/** 등록된 모든 스타일 ID 목록 */
export function getAvailableStyleIds(): string[] {
  return Object.keys(STYLE_REGISTRY);
}
