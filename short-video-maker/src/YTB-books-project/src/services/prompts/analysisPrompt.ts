/**
 * Analysis Prompt Builder
 * ContentPlannerService.buildAnalysisPrompt() 분리 (v7.0 리팩토링)
 */

import type { ContentPlannerConfig, AudienceLevel } from '../ContentPlannerService';
import { getAudienceGuide, getELI5Rules, getContentTypeGuide } from './contentGuides';

type ConfigSlice = Pick<
  Required<Omit<ContentPlannerConfig, 'apiKey' | 'visualPromptStyleGuide'>>,
  'style' | 'maxShortsPerBook' | 'maxScenesPerShort' | 'targetShortDuration' | 'audienceLevel' | 'useELI5Style' | 'contentType'
> & { visualPromptStyleGuide?: string };

export function buildAnalysisPrompt(
  config: ConfigSlice,
  bookTitle: string,
  content: string,
  characterDescription?: string
): string {
  const style = config.style;
  const maxShorts = config.maxShortsPerBook;
  const maxScenes = config.maxScenesPerShort;
  const targetDuration = config.targetShortDuration;
  const audienceLevel = config.audienceLevel;
  const useELI5 = config.useELI5Style;

  const audienceGuide = getAudienceGuide(audienceLevel);
  const eli5Rules = useELI5 ? getELI5Rules() : '';
  const contentGuide = getContentTypeGuide(content, config.contentType);

  return `당신은 YouTube Shorts 콘텐츠 플래너이자 **복잡한 개념을 쉽게 설명하는 전문가**입니다.

## 입력 문서
제목: ${bookTitle}
내용:
${content.substring(0, 15000)}
${content.length > 15000 ? '\n... (내용 생략)' : ''}

## 작업
이 문서를 기반으로 YouTube Shorts 시리즈를 계획해주세요.
**중요: 어려운 내용을 쉽고 재미있게 설명하는 것이 핵심입니다.**

## 제약조건
- 최대 ${maxShorts}개의 Shorts
- 각 Short는 최대 ${maxScenes}개의 Scene
- 각 Short 목표 길이: ${targetDuration}초
- 각 Scene: 5-8초
- 스타일: ${style}
- 캐릭터: ${characterDescription || `${style} 스타일의 친근한 해설자 캐릭터`}

${audienceGuide}

${eli5Rules}

${contentGuide}

## Scene Types (sceneType 값으로 사용)
- hook: 시선을 끄는 질문/놀라운 사실 (첫 Scene)
- intro: 주제 소개
- problem: 문제 제기
- solution: 해결책 제시
- explanation: 핵심 개념 설명
- example: 구체적 예시
- data: 통계/데이터 제시
- comparison: 비교/대조
- conclusion: 결론/요약
- cta: Call to Action (마지막 Scene)

## visualPrompt 작성 가이드 (핵심)

${config.visualPromptStyleGuide || `### 프롬프트 구조
모든 visualPrompt는 다음 3요소를 순서대로:
1. Content (핵심 내용): 무엇을 보여주는지 구체적으로 서술
2. Style (스타일): ${style} style, portrait 9:16
3. 구성요소를 색상/아이콘으로 구분

### 분야별 예시
- 수학: "Diagram showing F=ma with Force as a hand pushing, Mass as a heavy ball, Acceleration as speed lines, connected by arrows, ${style} style"
- 기술: "Flowchart: Input → Process → Output, color-coded boxes with icons, ${style} style"
- 역사: "Timeline: era1 → era2 → era3, each with symbolic icon, ${style} style"`}

### 공통 금지 사항
- "Mathematical concept", "Educational concept" 등 추상적 시작 금지 — 직접 장면 묘사
- 오직 시각적 요소(색상, 아이콘, 화살표, 도형)로만 표현 — 글자 대신 색상 코딩 사용
- 캐릭터만 있고 내용 없는 이미지 금지
- 한 이미지에 5개 이하 구성요소 권장

## 출력 형식 (JSON)
반드시 아래 형식의 유효한 JSON만 출력하세요. 다른 텍스트는 포함하지 마세요.

{
  "shorts": [
    {
      "shortIndex": 0,
      "title": "Shorts 제목 (한국어, 50자 이내)",
      "hook": "시작 훅 문장 (한국어)",
      "theme": "주제 키워드",
      "scenes": [
        {
          "sceneIndex": 0,
          "sceneType": "hook",
          "narrationText": "나레이션 텍스트 (한국어, 자연스러운 말투, 쉬운 설명)",
          "visualPrompt": "Describe the scene in ${style} style, portrait 9:16, focusing on the actual topic content",
          "durationHint": 5,
          "sourceChunkIds": ["chunk_0"]
        }
      ],
      "tags": ["태그1", "태그2", "태그3"]
    }
  ],
  "character": {
    "description": "${characterDescription || `A friendly narrator character, ${style} style`}",
    "style": "${style}"
  }
}

## 주의사항
1. narrationText는 자연스럽고 **쉬운** 한국어 구어체로 작성
2. visualPrompt는 영어로 작성, 구체적인 시각 묘사 포함
3. 각 Short는 hook으로 시작하고 cta 또는 conclusion으로 끝낼 것
4. sourceChunkIds는 해당 Scene이 참조하는 청크 번호 (chunk_0, chunk_1, ...)
5. **어려운 개념은 반드시 비유나 예시로 풀어서 설명**
6. JSON만 출력 - 설명이나 주석 없음`;
}
