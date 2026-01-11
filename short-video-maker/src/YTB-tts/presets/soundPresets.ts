/**
 * Sound Effect Presets
 *
 * 자주 사용하는 효과음 프리셋 정의
 */

import { SoundEffectPreset } from '../interfaces';

// 고양이 관련
export const CAT_PRESETS: SoundEffectPreset[] = [
  { id: 'CAT_MEOW', name: '야옹', query: 'cat meow cute', duration: 1.5 },
  { id: 'CAT_PURR', name: '골골송', query: 'cat purring relaxing', duration: 3.0 },
  { id: 'CAT_PAW', name: '발자국', query: 'cat footsteps soft', duration: 1.0 },
  { id: 'CAT_HISS', name: '하악', query: 'cat hiss angry', duration: 1.0 },
  { id: 'CAT_YAWN', name: '하품', query: 'cat yawn sleepy', duration: 2.0 },
];

// 전환 효과
export const TRANSITION_PRESETS: SoundEffectPreset[] = [
  { id: 'WHOOSH', name: '휙', query: 'whoosh transition fast', duration: 0.5 },
  { id: 'POP', name: '팝', query: 'pop bubble cute', duration: 0.3 },
  { id: 'DING', name: '딩', query: 'ding notification bell', duration: 0.5 },
  { id: 'SWIPE', name: '스와이프', query: 'swipe swoosh', duration: 0.4 },
  { id: 'CLICK', name: '클릭', query: 'click button ui', duration: 0.2 },
];

// 환경/분위기
export const AMBIENT_PRESETS: SoundEffectPreset[] = [
  { id: 'RAIN', name: '빗소리', query: 'rain ambient soft', duration: 5.0 },
  { id: 'WIND', name: '바람', query: 'wind gentle breeze', duration: 3.0 },
  { id: 'BIRDS', name: '새소리', query: 'birds chirping morning', duration: 3.0 },
  { id: 'FIRE', name: '불꽃', query: 'fireplace crackling cozy', duration: 4.0 },
];

// 감정/반응
export const EMOTION_PRESETS: SoundEffectPreset[] = [
  { id: 'LAUGH', name: '웃음', query: 'laugh happy cute', duration: 1.5 },
  { id: 'GASP', name: '헉', query: 'gasp surprised', duration: 0.5 },
  { id: 'AWW', name: '아~', query: 'aww cute adorable', duration: 1.0 },
  { id: 'CHEER', name: '환호', query: 'cheer celebration', duration: 2.0 },
];

// 모든 프리셋 통합
export const ALL_PRESETS: SoundEffectPreset[] = [
  ...CAT_PRESETS,
  ...TRANSITION_PRESETS,
  ...AMBIENT_PRESETS,
  ...EMOTION_PRESETS,
];

// ID로 프리셋 찾기
export function getPresetById(id: string): SoundEffectPreset | undefined {
  return ALL_PRESETS.find(p => p.id === id);
}

// 프리셋 맵
export const PRESET_MAP: Record<string, SoundEffectPreset> = ALL_PRESETS.reduce(
  (acc, preset) => ({ ...acc, [preset.id]: preset }),
  {}
);
