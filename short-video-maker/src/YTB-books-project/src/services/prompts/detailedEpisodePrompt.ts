/**
 * Detailed Episode Prompt Builder
 * ContentPlannerService.buildDetailedEpisodePrompt() 분리 (v7.0 리팩토링)
 */

import type { ContentPlannerConfig } from '../ContentPlannerService';
import type { BookChunk } from '../../types';
import { getAudienceGuide, getELI5Rules, getContentTypeGuide, getViralEngagementGuide, getYouTubeMetadataGuide } from './contentGuides';

type ConfigSlice = Pick<
  Required<Omit<ContentPlannerConfig, 'apiKey' | 'visualPromptStyleGuide' | 'engagementGuideOverride' | 'useVeoInterpolation'>>,
  'style' | 'maxScenesPerShort' | 'audienceLevel' | 'useELI5Style' | 'contentType'
> & { visualPromptStyleGuide?: string; engagementGuideOverride?: string; useVeoInterpolation?: boolean };

/**
 * 청크 텍스트에서 수식과 컨텍스트 추출 (커리큘럼 프롬프트용)
 */
export function extractFormulasFromChunks(chunks: BookChunk[]): {latex: string, context: string}[] {
  const results: {latex: string, context: string}[] = [];
  for (const chunk of chunks) {
    if (chunk.latexFormulas && chunk.latexFormulas.length > 0) {
      const sentences = chunk.text.split(/(?<=[.!?])\s+/);
      for (const formula of chunk.latexFormulas) {
        const idx = sentences.findIndex(s => s.includes(formula.substring(0, 20)));
        const start = Math.max(0, idx - 1);
        const end = Math.min(sentences.length, idx + 2);
        const context = idx >= 0
          ? sentences.slice(start, end).join(' ')
          : (chunk.sectionTitle || '');
        results.push({ latex: formula, context });
      }
    }

    const inlineMatches = chunk.text.match(/\$\$([^$]+)\$\$/g) || [];
    for (const match of inlineMatches) {
      const latex = match.replace(/^\$\$|\$\$$/g, '').trim();
      if (results.some(r => r.latex === latex)) continue;
      const sentences = chunk.text.split(/(?<=[.!?])\s+/);
      const idx = sentences.findIndex(s => s.includes(latex.substring(0, 20)));
      const start = Math.max(0, idx - 1);
      const end = Math.min(sentences.length, idx + 2);
      const context = idx >= 0
        ? sentences.slice(start, end).join(' ')
        : (chunk.sectionTitle || '');
      results.push({ latex, context });
    }
  }
  return results;
}

export function buildDetailedEpisodePrompt(
  config: ConfigSlice,
  bookTitle: string,
  episodeOutline: any,
  content: string,
  episodeIndex: number,
  totalEpisodes: number,
  previousEpisodeSummary: string,
  characterDescription?: string,
  relevantChunks?: BookChunk[]
): string {
  const style = config.style;
  const maxScenes = config.maxScenesPerShort;
  const audienceLevel = config.audienceLevel;
  const audienceGuide = getAudienceGuide(audienceLevel);
  const eli5Rules = config.useELI5Style ? getELI5Rules() : '';
  const contentGuide = getContentTypeGuide(content, config.contentType);
  const viralGuide = config.engagementGuideOverride || getViralEngagementGuide(episodeOutline.topic);
  const youtubeMetadataGuide = getYouTubeMetadataGuide(episodeOutline.topic, bookTitle);

  const useVeo = config.useVeoInterpolation === true;
  const formulasFromChunks = relevantChunks ? extractFormulasFromChunks(relevantChunks) : [];

  const hasMathContent = episodeOutline.mathOrTechnical?.length > 0;

  const mathTechnicalGuide = (hasMathContent || formulasFromChunks.length > 0)
    ? `
## 이 에피소드에서 설명할 수학/기술 내용

### 개념 목록
${(episodeOutline.mathOrTechnical || []).map((m: any) =>
  typeof m === 'string' ? `- ${m}` : `- ${m.name}: ${m.latex || ''} (${m.whatItDoes || ''})`
).join('\n')}

### 실제 LaTeX 수식 (반드시 각각 설명!)
${formulasFromChunks.map((f, i) => `
수식 ${i+1}: $$${f.latex}$$
원문 설명: ${f.context}
`).join('\n')}

### 수식 설명 필수 규칙
1. 각 수식의 **이름**을 한국어로 소개 (예: "복원 손실 함수")
2. 주요 **변수 각각의 의미** 설명 (예: "M̂은 AI가 만든 얼굴, M은 원래 진짜 얼굴")
3. 수식 전체가 **하는 일**을 중학생도 이해할 비유로 설명
4. **visualPrompt에 수식의 핵심 개념을 비유적으로 시각화**
5. 대상: **중학생** (5살 아이 X, 전문가 X)
`
    : '';

  return `당신은 복잡한 내용을 **아주 쉽고 재미있게** 설명하는 YouTube Shorts 크리에이터입니다.

## 문서 정보
제목: ${bookTitle}
에피소드: ${episodeIndex + 1}/${totalEpisodes} (시리즈물)

## 이번 에피소드 주제
${episodeOutline.topic}

## 설명해야 할 핵심 개념들
${(episodeOutline.keyConceptsToExplain || []).map((c: string) => `- ${c}`).join('\n')}

${mathTechnicalGuide}

## 이전 에피소드 요약 (시청자가 이미 알고 있는 것)
${previousEpisodeSummary || '(첫 번째 에피소드입니다)'}

## 이전 에피소드와의 연결
${episodeOutline.connectionToPrevious || '(첫 에피소드)'}

## 다음 에피소드 예고
${episodeOutline.connectionToNext || '(마지막 에피소드)'}

## 참조 내용 (이 에피소드에서 다룰 원본 텍스트)
${content.substring(0, 10000)}
${content.length > 10000 ? '\n... (생략)' : ''}

## 제약조건
- Scene 개수: ${maxScenes}개 (충분히 사용하세요)
- 각 Scene: 5-10초
- 목표 총 길이: 50-70초
- 스타일: ${style}

${audienceGuide}

${eli5Rules}

## visualPrompt 작성 가이드 (핵심)

${config.visualPromptStyleGuide || `### 씬 타입별 이미지 완전 분리!
- 서사 씬 (hook/intro/conclusion) → 캐릭터가 등장하는 교육 일러스트
- 교육 씬 (explanation/example/data/comparison) → 캐릭터 완전 금지! 내용 기반 교육 시각화만
- 수식 씬 (assignedFormula 있는 씬) → 캐릭터 완전 금지! 수식의 비유적 시각화만

서사 씬: "On dark navy background, [캐릭터가 있는 장면 묘사], glowing teal elements, clean vector style, portrait 9:16"
교육 씬: "[내용의 비유적 시각화를 직접 묘사하는 서술형 문장]. On dark navy background, with glowing teal and yellow elements, portrait 9:16"
수식 씬: "[수식 개념을 구체적 비유 오브젝트로 묘사]. Dark background, glowing geometric shapes, portrait 9:16"
- 같은 에피소드 내 교육 씬끼리 일관된 스타일 유지
- 예: 인코더 → "A funnel transforming a detailed landscape into a tiny glowing marble, then expanding back"
- 예: Loss 함수 → "Two objects side by side being compared with a magnifying glass showing differences"`}

### 공통 금지 사항 (모든 스타일 적용)
- 교육/수식 씬에서 "character", "person", "narrator", "teacher", "student", "child" 금지 — 비유적 시각화만
- "Educational concept illustration", "Mathematical concept" 등 추상적 시작 금지 — 직접 장면 묘사
- visualPrompt에 text, label, word, letter 등 텍스트 지시 금지 — 색상, 아이콘, 화살표로만 표현
- 각 visualPrompt는 **이번 에피소드의 실제 주제(${episodeOutline.topic})** 를 반드시 반영해야 합니다

${contentGuide}

${viralGuide}

${youtubeMetadataGuide}

## Scene 구조 (반드시 따르세요)

### Scene 1: Hook (3-5초) — 조회수를 결정하는 첫 문장!
- 반직관적 질문 또는 충격 통계 또는 일상 연결로 시작 (바이럴 가이드 참조)
- "${episodeOutline.topic}"을 누구나 궁금해할 형태로 변환
- "오늘은 ~에 대해 알아보겠습니다" 같은 교과서형 시작 절대 금지!

### Scene 2-3: 이전 내용 연결 + 개념 소개 (10-15초)
${previousEpisodeSummary ? '- "지난 시간에 ~를 배웠죠? 오늘은..."' : '- 주제 소개'}
- 새로운 개념이 왜 필요한지

### Scene 4-6: 핵심 설명 (20-30초) -- 가장 중요
- 개념을 **비유**로 설명
- 수학/기술 내용을 **단계별**로 풀어서 설명
- "마치 ~와 같아요" 형식 필수

### Scene 7: 예시/적용 (8-10초)
- 실제 사례 또는 일상 예시

### Scene 8: 마무리 + 댓글 유도 (5-7초) — 인게이지먼트 부스터!
- 핵심 한 줄 요약 + 다음 예고
- **반드시 댓글 유도 질문 1개 포함** (바이럴 가이드 참조)
- "구독/좋아요" 언급 금지 — 대신 시청자가 답하고 싶은 질문

## 출력 형식 (JSON)
{
  "title": "일상 연결형 클릭 유도 제목 (30자 이내, 예: '커피 한 잔에 숨은 적분')",
  "hook": "반직관적 질문 또는 충격 통계 (20자 이내, 교과서형 금지)",
  "summary": "이 에피소드 요약 (다음 에피소드 컨텍스트용, 100자)",
  "description": "YouTube 설명문 (500-1500자, 메타데이터 가이드 참조)",
  "tags": ["태그1", "태그2", ...],
  "scenes": [
    {
      "sceneIndex": 0,
      "sceneType": "hook",
      "narrationText": "쉬운 한국어. 비유 필수. 한 문장씩 끊어서.",
      "visualPrompt": "Describe the scene directly in ${style} style, portrait 9:16. Focus on the actual topic: ${episodeOutline.topic}",
      "durationHint": 5${useVeo ? `,
      "firstFramePrompt": "Starting state of the scene (English, same style as visualPrompt)",
      "lastFramePrompt": "Ending state of the scene (English, same style as visualPrompt)"` : ''}
    }
  ]
}
${useVeo ? `
## VEO 3.1 키프레임 프롬프트 가이드 (v11.0)
각 씬에 "firstFramePrompt" (시작 상태)와 "lastFramePrompt" (종료 상태) 두 개의 이미지 프롬프트를 추가로 생성하세요.

### 규칙
1. 두 프롬프트는 **같은 세팅과 스타일**을 유지하되, **의미 있는 시각적 변화**를 표현
2. 변화 유형 (최소 1개 적용):
   - 카메라 앵글 변화 (wide → close-up)
   - 피사체 움직임 (entering → positioned)
   - 상태 변화 (calm → dramatic)
   - 조명 전환 (dim → bright)
3. 두 프롬프트 모두 visualPrompt와 동일한 ${style} 스타일로 작성
4. 변화가 너무 크면 보간이 어색해짐 — **자연스러운 전환**을 만들 수 있는 수준의 변화
5. 예시:
   - hook: first="Wide shot of empty dark classroom" → last="Close-up of glowing mathematical formula on blackboard"
   - explanation: first="Funnel diagram, data flowing in from top" → last="Same funnel, compressed marble emerging at bottom, glowing"
` : ''}

## 절대 규칙
1. 전문 용어 사용 시 반드시 "(쉽게 말해 ~)" 추가
2. 수학 공식은 추상적 비유로 설명, 변수 기호 언급 가능하되 쉬운 설명 추가
3. 모든 추상 개념에 비유 필수
4. visualPrompt는 ${style} 스타일 필수. 오직 시각적 요소(색상, 아이콘, 화살표, 도형)로만 표현 — 글자/라벨 대신 색상 코딩으로 구분
5. 이전 에피소드 내용을 자연스럽게 언급
6. **비유의 행위 = 수식의 행위**: 비교하는 수식 → 비교하는 비유, 합산 수식 → 모으는 비유. 수식의 본질과 무관한 비유 금지
7. **교육/수식 씬의 visualPrompt에 캐릭터/사람 절대 금지!** hook/intro/conclusion만 캐릭터 가능
8. **visualPrompt는 반드시 이 에피소드의 주제("${episodeOutline.topic}")와 직접 관련된 장면을 묘사해야 함** — 주제와 무관한 일반적 다이어그램 금지
9. JSON만 출력`;
}
