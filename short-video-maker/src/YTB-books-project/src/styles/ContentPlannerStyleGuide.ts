/**
 * ContentPlannerStyleGuide
 * 스타일별 AI 프롬프트 가이드 — ContentPlanner 노드의 visualPromptGuide input
 *
 * ContentPlannerService가 AI에게 씬별 visualPrompt를 생성하도록 요청할 때,
 * 이 가이드를 시스템 프롬프트에 주입하여 스타일에 맞는 이미지 설명을 유도한다.
 */

import type { VideoStyleProfile } from './VideoStyleProfile';
export { getViralCatDomainExamples } from '../services/prompts/empathyContentGuide';

/**
 * 스타일 프로파일에서 ContentPlanner용 가이드 텍스트 생성
 */
export function getContentPlannerStyleGuide(profile: VideoStyleProfile): string {
  return `
[VISUAL STYLE GUIDE: ${profile.displayName}]

${profile.visualPromptGuide}

When writing visualPrompt for each scene, follow these rules:
- hook/intro/conclusion scenes: Use "${profile.displayName}" narrative style
- explanation/example/data scenes: Use educational diagram style (shapes, icons, and color coding only)
- formula scenes: Use abstract visual metaphor style (geometric shapes and glowing elements only)
- ALL scenes: ${profile.imagePromptSuffix}

Composition variety (cycle through these):
${profile.compositions.map((c, i) => `  ${i + 1}. ${c}`).join('\n')}
`.trim();
}

/**
 * 3B1B 스타일 전용 분야별 예시 가이드
 * math_character 스타일에서 ContentPlanner가 더 풍부한 visualPrompt를 생성하도록 돕는다
 */
export function getMathCharacterDomainExamples(): string {
  return `
[3B1B STYLE - DOMAIN-SPECIFIC VISUAL EXAMPLES]

Mathematics:
- "Glowing coordinate plane on dark background, teal function curve transforming smoothly, yellow tangent line appearing at key point"
- "Pi character with eyes floating in void, surrounded by concentric circle ripples in neon blue"
- "Matrix grid of neon dots rearranging themselves, eigenvalue highlighted in coral glow"

Physics:
- "Dark background with glowing force vectors (teal arrows), object in center with yellow velocity trail"
- "Wave function visualization: neon sine wave on dark navy, probability cloud in purple gradient"

Computer Science / Algorithms:
- "Binary tree on dark background, nodes as glowing teal circles, highlighted path in yellow"
- "Sorting visualization: vertical bars in gradient colors rearranging on dark background"
- "Neural network layers: glowing nodes connected by thin neon lines, active path highlighted"

General:
- "Abstract concept cloud: key idea as large glowing shape, supporting concepts as smaller orbiting elements"
- "Comparison split-screen: left side teal, right side coral, geometric shapes showing contrast"
`.trim();
}
