/**
 * ContentPlannerService
 * AI를 사용하여 책/문서 청크를 분석하고 Shorts 계획을 생성
 *
 * 기능:
 * - 청크 분석하여 Shorts 개수 결정
 * - 각 Short당 Scene 분할
 * - 나레이션 텍스트 및 이미지 프롬프트 생성
 */

import { logger } from '../../../config';
import type { BookChunk } from '../types';
import { Neo4jService } from './Neo4jService';

// ============================================
// Types
// ============================================

export interface ScenePlan {
  sceneIndex: number;
  sceneType: 'hook' | 'intro' | 'problem' | 'solution' | 'explanation' | 'example' | 'data' | 'comparison' | 'conclusion' | 'cta';
  narrationText: string;           // 나레이션 (한국어)
  visualPrompt: string;            // 이미지 생성 프롬프트 (영어)
  durationHint: number;            // 예상 길이 (초)
  sourceChunkIds: string[];        // 참조된 청크 ID들
  /** v2.7.0: 청크에서 추출된 LaTeX 수식 배열 (직접 렌더링용) */
  latexFormulas?: string[];
}

export interface ShortPlan {
  shortIndex: number;
  title: string;                   // Short 제목
  hook: string;                    // 시작 훅 (첫 3초)
  theme: string;                   // 주제/테마
  scenes: ScenePlan[];
  totalDuration: number;           // 총 예상 길이 (초)
  tags: string[];                  // YouTube 태그
}

export interface ShortsPlan {
  bookId: string;
  bookTitle: string;
  totalShorts: number;
  character: {
    description: string;           // 캐릭터 설명 (프롬프트용)
    style: string;                 // 스타일 (ghibli, anime, realistic 등)
  };
  shorts: ShortPlan[];
  metadata: {
    analyzedAt: string;
    totalChunks: number;
    totalScenes: number;
    estimatedTotalDuration: number;
  };
}

/**
 * 대상 청중 난이도 레벨
 * - elementary: 초등학생도 이해 가능 (ELI5 스타일)
 * - general: 일반 성인 (기본값)
 * - professional: 전문가/학술 수준
 */
export type AudienceLevel = 'elementary' | 'general' | 'professional';

/**
 * 콘텐츠 분야 유형
 * - math_science: 수학, 과학, 공학, AI/ML 논문
 * - humanities: 철학, 역사, 문학, 언어학, 미학
 * - social_science: 경제학, 사회학, 정치학, 심리학
 * - auto: 콘텐츠에서 자동 감지 (기본값)
 */
export type ContentType = 'math_science' | 'humanities' | 'social_science' | 'auto';

export interface ContentPlannerConfig {
  apiKey: string;
  model?: string;                  // default: gemini-2.0-flash
  maxShortsPerBook?: number;       // default: 10
  maxScenesPerShort?: number;      // default: 8
  targetShortDuration?: number;    // default: 60 (seconds)
  language?: 'ko' | 'en';          // default: ko
  style?: string;                  // default: ghibli
  audienceLevel?: AudienceLevel;   // default: general (NEW: 설명 난이도)
  useELI5Style?: boolean;          // default: true (NEW: 쉬운 설명 모드)
  contentType?: ContentType;       // default: auto (콘텐츠 분야 자동 감지)
}

// ============================================
// Service
// ============================================

export class ContentPlannerService {
  private apiKey: string;
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  private model: string;
  private config: Required<Omit<ContentPlannerConfig, 'apiKey'>>;

  constructor(config: ContentPlannerConfig) {
    if (!config.apiKey) {
      throw new Error('Google Gemini API key is required');
    }

    this.apiKey = config.apiKey;
    this.model = config.model || 'gemini-2.0-flash';
    this.config = {
      model: this.model,
      maxShortsPerBook: config.maxShortsPerBook || 10,
      maxScenesPerShort: config.maxScenesPerShort || 8,
      targetShortDuration: config.targetShortDuration || 60,
      language: config.language || 'ko',
      style: config.style || 'children book illustration, soft watercolor, whimsical storybook',
      audienceLevel: config.audienceLevel || 'general',
      useELI5Style: config.useELI5Style ?? true,  // 기본값: 쉬운 설명 활성화
      contentType: config.contentType || 'auto'    // 기본값: 자동 감지
    };

    logger.info({ model: this.model, config: this.config }, 'ContentPlannerService initialized');
  }

  /**
   * 청크들을 분석하여 Shorts 계획 생성
   */
  async analyzeAndPlan(
    bookId: string,
    bookTitle: string,
    chunks: BookChunk[],
    characterDescription?: string
  ): Promise<ShortsPlan> {
    logger.info({ bookId, bookTitle, chunkCount: chunks.length }, 'Starting content analysis');

    // 청크 텍스트 결합
    const combinedText = chunks.map((c, i) =>
      `[청크 ${i + 1}] ${c.text}`
    ).join('\n\n');

    // AI 분석 요청
    const analysisPrompt = this.buildAnalysisPrompt(bookTitle, combinedText, characterDescription);
    const response = await this.callGeminiAPI(analysisPrompt);

    // JSON 파싱
    const plan = this.parseAIResponse(response, bookId, bookTitle, chunks);

    logger.info({
      bookId,
      totalShorts: plan.totalShorts,
      totalScenes: plan.metadata.totalScenes
    }, 'Content analysis completed');

    return plan;
  }

  /**
   * 분석 프롬프트 생성
   */
  private buildAnalysisPrompt(
    bookTitle: string,
    content: string,
    characterDescription?: string
  ): string {
    const style = this.config.style;
    const maxShorts = this.config.maxShortsPerBook;
    const maxScenes = this.config.maxScenesPerShort;
    const targetDuration = this.config.targetShortDuration;
    const audienceLevel = this.config.audienceLevel;
    const useELI5 = this.config.useELI5Style;

    // 대상 청중별 설명 가이드라인
    const audienceGuide = this.getAudienceGuide(audienceLevel);
    const eli5Rules = useELI5 ? this.getELI5Rules() : '';

    // 콘텐츠 유형별 가이드 자동 감지
    const contentGuide = this.getContentTypeGuide(content);

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

### 프롬프트 구조 (ICS 프레임워크)
모든 visualPrompt는 다음 3요소를 순서대로 포함하세요:
1. Image Type (이미지 유형): infographic, diagram, flowchart, comparison chart, whiteboard, illustration
2. Content (핵심 내용): 무엇을 보여주는지 구체적으로. 각 구성요소를 색상과 아이콘으로 구분
3. Style (스타일): ${style} style, color palette, layout (portrait 9:16)

### 핵심 원칙
- 모든 추상적 개념은 시각적 비유 + 시각적 다이어그램으로 표현
- 구성요소를 하나하나 색상/아이콘으로 구분하여 나열 (color-coded components)
- 흐름이 있으면 방향 명시: "from X to Y", "Step 1 -> Step 2 -> Step 3"
- 수학/기술 Scene에서는 캐릭터보다 다이어그램/인포그래픽이 주인공

### 분야별 템플릿

#### 수학/공식
- "Educational infographic showing [공식명]: left side displays the equation [수식], right side shows a visual metaphor of [의미] using [일상 비유], directional arrows connecting each variable to its meaning, clean white background, ${style} style"
- "A whiteboard diagram with [수식] written large at top, below it a step-by-step visual breakdown: [변수1] shown as [의미], [변수2] shown as [의미], connected by [관계], ${style} style"

#### 과학/물리
- "Cause-and-effect diagram: [원인] on the left with directional arrow leading to [결과] on the right, each stage color-coded, magnified detail inset showing [미시적 현상], ${style} style"
- "Forces diagram with colorful arrows: [힘1] pushing from left, [힘2] pulling from right, resultant force shown as bold arrow, each color-coded, clean educational layout"

#### 기술/알고리즘/AI
- "Technical flowchart diagram: [Input] box on left -> [Process1] box -> [Process2] box -> [Output] box on right, each box color-coded with unique icons, data flow shown with directional arrows, clean infographic layout, ${style} style"
- "Architecture diagram showing [시스템명] with [N] connected blocks: [Component1], [Component2], [Component3], data flow arrows between them, each component has a small icon, flat vector infographic style"
- "Comparison chart: [A] vs [B], two columns with distinct rows for [Feature1], [Feature2], [Feature3], checkmarks and icons, clean infographic, ${style} colors"

#### 역사/인문학
- "Historical timeline infographic: [시대1] on left -> [시대2] center -> [시대3] right, each era marked with a symbolic icon and distinct color, key figures shown as small portraits, horizontal layout, ${style} style"
- "Split-screen comparison: [시대A] on left vs [시대B] on right, each side showing [핵심 차이], visual cues at bottom, period-accurate details"

#### 철학/추상 개념
- "Concept diagram: [추상 개념] visualized as [구체적 비유 물체], with color-coded branches showing [하위 개념1], [하위 개념2], mind-map layout, ${style} style"

#### 사회/경제
- "Economic flow diagram: [주체1] and [주체2] exchanging [자원], arrows showing direction of flow, balance scale in center representing [균형 개념], color-coded infographic, ${style} style"

### 좋은 visualPrompt 예시
- "Educational infographic: a clean whiteboard showing F=ma, with three distinct sections - Force (a hand pushing), Mass (a heavy ball), Acceleration (speed lines), arrows connecting them, ${style} style, portrait 9:16 layout"
- "Architecture diagram of FLAME model: three color-coded control panels for Shape, Expression, Pose, each with a slider icon, all connected to a central 3D face wireframe with directional arrows, flat vector infographic, ${style} colors"
- "Step-by-step flowchart: Raw Data box -> Preprocessing box -> Model Training box -> Prediction box, each step has a small descriptive icon inside, gradient arrows between steps, clean educational poster style"

### 금지 사항
- 추상적 묘사만 ("Mathematical concept", "Scientific diagram") -> 구체적 구성요소를 명시해야 함
- 캐릭터만 있고 개념 시각화 없는 이미지 ("A cute child thinking about math") -> 다이어그램/인포그래픽 필수
- 구분 안 되는 모호한 도형들 -> 모든 요소를 색상, 모양, 아이콘으로 구분
- 한 이미지에 너무 많은 요소 (5개 이하 구성요소 권장)
- IMPORTANT: visualPrompt에 text, label, word, letter 등 텍스트 관련 지시를 절대 포함하지 마세요. AI 이미지 생성기는 텍스트를 렌더링할 수 없습니다. 색상, 모양, 화살표, 아이콘으로 표현하세요.

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
          "visualPrompt": "Image prompt in English, ${style} style, detailed visual description",
          "durationHint": 5,
          "sourceChunkIds": ["chunk_0"]
        }
      ],
      "tags": ["태그1", "태그2", "태그3"]
    }
  ],
  "character": {
    "description": "${characterDescription || `A friendly narrator character, ${style} anime style, expressive face, warm colors`}",
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

  /**
   * 대상 청중별 설명 가이드라인 생성
   */
  private getAudienceGuide(level: AudienceLevel): string {
    const guides: Record<AudienceLevel, string> = {
      elementary: `## 대상 청중: 초등학생 수준
- 10살 어린이도 이해할 수 있게 설명
- 전문 용어는 절대 사용하지 않음
- 짧고 간단한 문장만 사용
- 일상생활 예시 필수
- 재미있고 흥미로운 표현 사용`,

      general: `## 대상 청중: 일반 성인
- 전문 지식 없는 일반인이 이해할 수 있게 설명
- 전문 용어 사용 시 반드시 쉬운 설명 추가
- 친근하고 자연스러운 말투
- 적절한 비유와 예시 포함`,

      professional: `## 대상 청중: 전문가/학술
- 핵심 개념과 용어 정확히 전달
- 깊이 있는 설명 가능
- 전문 용어 사용 가능 (단, 핵심 정의는 포함)
- 데이터와 근거 중심 설명`
    };

    return guides[level];
  }

  /**
   * ELI5 (Explain Like I'm 5) 스타일 규칙 생성
   */
  private getELI5Rules(): string {
    return `## 쉬운 설명 규칙 (ELI5 스타일) - 필수 적용!

### 1. 전문 용어 처리
- 반드시 괄호 안에 쉬운 설명 추가
- 예: "엔트로피(쉽게 말해 방이 어질러지는 정도)"
- 예: "양자역학(아주아주 작은 세계의 물리법칙)"
- 예: "알고리즘(컴퓨터가 따라하는 요리 레시피 같은 것)"

### 2. 비유와 예시 필수
- 추상적 개념은 반드시 일상 비유로 설명
- 예: "블랙홀은 마치 우주의 배수구와 같아요"
- 예: "DNA는 우리 몸을 만드는 설계도예요"
- 예: "인플레이션은 같은 돈으로 살 수 있는 게 줄어드는 거예요"

### 3. 수학/과학 공식 설명
- 공식의 **의미**를 추상적 비유로 쉽게 설명하되, 정확해야 함
- 변수 기호를 직접 언급 가능 (예: "M은 실제 얼굴이에요")
- 수식이 "무엇을 하는 건지" + 각 변수의 역할을 비유로 풀어서 설명
- **비유의 행위가 수식의 행위와 일치**해야 함
- 예: "L_recon은 진짜 얼굴 M과 만든 얼굴 M-hat이 얼마나 다른지 점수를 매기는 거예요. 거울 앞에서 립싱크 연습할 때 입 모양 확인하는 것처럼요!"
- 예: "E=mc2는 아주 작은 물질도 엄청난 에너지로 바뀔 수 있다는 뜻이에요!"
- **금지**: 수식 본질과 무관한 비유 (비교 수식에 "그림 그리기", 복원 수식에 "점묘화" 등)

### 4. 철학/인문학 개념 설명
- 일상 상황으로 풀어서 설명
- 예: "실존주의는 '나는 누구인가?'를 스스로 정하는 거예요"
- 예: "자본주의는 물건을 사고파는 자유로운 시장이에요"

### 5. 문장 구조
- 한 문장에 하나의 핵심 아이디어만
- "왜?", "어떻게?"로 시작하는 질문 형식 활용
- "첫 번째로..., 두 번째로..." 단계별 설명
- 짧은 문장 선호 (20자 이내 권장)

### 6. 톤 앤 매너
- 친구에게 설명하듯 친근하게
- 어려운 내용도 재미있게
- 시청자의 호기심 자극`;
  }

  /**
   * 수학/과학 콘텐츠 가이드 (LaTeX 감지 시)
   * v2.8.0: 수식의 본질적 의미를 추상적 비유로 설명 + 의미 정합성
   */
  private getMathContentGuide(): string {
    return `## 수학/과학 콘텐츠 가이드 (LaTeX 수식 포함 문서)

### 핵심 원칙: 추상적이되 본질에 맞는 비유
수식을 쉽게 설명하되, 비유가 수식의 **본질적 의미**를 담아야 합니다.
수식이 "무엇을 하는 공식인지" 먼저 파악하고, 그 본질에 맞는 추상적 비유를 사용하세요.

**비유 선택 3단계**:
1. 이 수식이 본질적으로 무엇을 하는가? (비교? 합산? 변환? 최적화?)
2. 수식이 다루는 대상은 무엇인가? (얼굴? 소리? 에너지? 확률?)
3. 1+2를 결합한 일상 비유 만들기 (대상의 본질적 행위를 일상으로 치환)

### narrationText 작성법
- 수식의 **의미**를 추상적이고 쉬운 비유로 설명 (중학생 수준)
- 변수 기호를 직접 언급하고 각 변수의 의미를 설명 (예: "M은 실제 얼굴, M̂은 AI가 만든 얼굴이에요")
- "이 공식은 ~하는 거예요", "마치 ~와 같아요" 형식 활용
- **중요**: 비유가 수식의 본질과 맞아야 함 (수식이 하는 일과 비유가 하는 일이 일치)

#### 좋은 비유 (본질 일치):
- 두 것을 비교하는 Loss 함수 → "시험 답안을 정답지와 대조해서 틀린 곳을 찾는 것"
- 얼굴 복원 Loss → "거울 앞에서 립싱크할 때 입 모양이 맞는지 확인하는 것"
- 가중치가 있는 Loss → "국어보다 수학 배점이 높은 시험처럼, 더 중요한 부분에 점수를 더 주는 것"
- 합산 (Sigma) → "장바구니에 물건을 하나씩 담아서 총 가격을 계산하는 것"
- 변환 행렬 → "사진 필터처럼 입력을 다른 모습으로 바꿔주는 것"
- 최적화 → "미로에서 가장 빠른 출구를 찾는 것"

#### 나쁜 비유 (본질 불일치 - 금지!):
- 얼굴/입술 복원 수식에 "점묘화처럼 표현" → 미술 기법과 얼굴 복원은 관계없음
- 음성 합성 수식에 "그림을 색칠하듯" → 시각 미술과 소리 합성은 관계없음
- Loss 함수에 "레고를 조립하듯" → Loss는 비교/측정이지 조립이 아님
- **왜 나쁜가**: 비유의 행위(그리기, 조립)가 수식의 행위(비교, 복원)와 다름

### visualPrompt 작성법 (수식 Scene 전용)
수학/기술 Scene에서는 동화책 일러스트 스타일의 개념 시각화를 사용합니다.
LaTeX 수식은 별도 PNG 오버레이로 상단에 자동 추가되므로, 배경 이미지는 개념의 비유적 시각화에 집중하세요.

프롬프트 구조: "Children's book illustration, soft watercolor, [개념의 비유적 시각화], whimsical storybook style, warm pastel colors, hand-painted texture, portrait 9:16"

#### 수식 유형별 템플릿:
- 손실/오차 함수 (Loss): "Children's book illustration, soft watercolor, a cute character comparing two drawings side by side - one in blue tones for original and one in pink tones for copy, magnifying glass highlighting differences, warm pastel colors, whimsical storybook style, portrait 9:16"
- 공식/방정식: "Children's book illustration, soft watercolor, a friendly wizard transforming [입력] into [출력] with a magic wand, visual steps floating in the air, warm pastel colors, whimsical storybook style, portrait 9:16"
- 모델 구조: "Children's book illustration, soft watercolor, a whimsical factory with [N] colorful rooms for [Component1], [Component2], conveyor belts connecting them, cute workers inside each room, warm pastel colors, storybook style, portrait 9:16"
- 벡터/행렬: "Children's book illustration, soft watercolor, colorful toy blocks arranged in a grid, arrows showing movement direction, each block uniquely colored, warm pastel background, storybook style, portrait 9:16"
- 비교: "Children's book illustration, soft watercolor, two friendly characters [A] and [B] standing side by side with speech bubbles showing their differences, warm pastel colors, storybook style, portrait 9:16"
- 파이프라인/프로세스: "Children's book illustration, soft watercolor, a whimsical path through a garden with color-coded stepping stones for [Step1], [Step2], [Step3], a cute character walking along, warm pastel colors, storybook style, portrait 9:16"

### 예시

입력: "$L_{recon} = ||\\hat{M} - M||_1 + w_{lips}||V_{lips} - \\hat{V}_{lips}||^2$" (얼굴 복원 손실)
narrationText: "이 공식은 컴퓨터가 만든 얼굴이 진짜 얼굴과 얼마나 비슷한지 점수를 매기는 거예요. 특히 입술 부분은 배점이 더 높아요!"
visualPrompt: "Children's book illustration, soft watercolor, two cute faces side by side - one real and one drawn, a magnifying glass comparing the lip area, score meter with stars at bottom, warm pastel colors, whimsical storybook style, portrait 9:16"

입력: "$E = mc^2$" (질량-에너지 등가)
narrationText: "아주 작은 물질도 엄청난 에너지로 바뀔 수 있대요!"
visualPrompt: "Children's book illustration, soft watercolor, a tiny glowing marble transforming into a brilliant sun with rays of light, magical sparkles around it, warm pastel colors, whimsical storybook style, portrait 9:16"

입력: "$\\sum_{i=1}^{n} x_i$" (합계)
narrationText: "여러 숫자를 장바구니에 하나씩 담아서 총합을 계산하는 거예요!"
visualPrompt: "Children's book illustration, soft watercolor, cute numbered apples being collected one by one into a woven basket by a friendly squirrel, warm pastel colors, whimsical storybook style, portrait 9:16"

### 금지 사항
- 옛날 AI 스타일 이미지 (딱딱한 벡터, 차가운 색감) → 동화책 일러스트 스타일 필수
- 수식의 본질과 무관한 비유 → 비유의 행위가 수식의 행위와 일치해야 함
- 추상적 묘사만 있는 visualPrompt ("Mathematical concept") → 구체적 비유 장면 필수
- 구분 안 되는 도형 나열 → 비유적 오브젝트를 색상/아이콘으로 구분`;
  }

  /**
   * 인문학 콘텐츠 가이드 (문학, 철학, 역사, 언어학 등)
   */
  private getHumanitiesContentGuide(): string {
    return `## 인문학 콘텐츠 가이드

### 핵심 원칙: 이야기로 설명하기
인문학 개념은 **스토리텔링**과 **일상 상황**으로 풀어서 설명합니다.
추상적인 사상이나 이론도 "누가, 왜, 어떤 상황에서" 형식으로 전달하세요.

### narrationText 작성법
- 역사적 사건 → "그때 무슨 일이 있었냐면요..."로 이야기 형식
- 철학 개념 → "여러분도 이런 고민 해본 적 있죠?" 일상 상황 연결
- 문학 작품 → 핵심 장면/메시지를 현대 상황에 비유
- 인물 → "이 사람은 한마디로 ~한 사람이에요"
- **대화체**: "~했대요", "~라고 했어요", "~거든요" 자연스러운 말투
- **감정 전달**: "슬프게도", "놀랍게도", "재밌는 건" 등 감정 연결어

### visualPrompt 템플릿
- 역사적 사건: "Children's book illustration, soft watercolor, [시대 배경의 동화 장면], warm pastel colors, whimsical storybook style, portrait 9:16"
- 철학/사상: "Children's book illustration, soft watercolor, [추상 개념을 의인화한 캐릭터가 행동하는 장면], warm pastel colors, whimsical storybook style, portrait 9:16"
- 문학 장면: "Children's book illustration, soft watercolor, [작품 속 핵심 장면을 동화풍으로 재해석], warm pastel colors, whimsical storybook style, portrait 9:16"
- 인물 소개: "Children's book illustration, soft watercolor, a warm portrait of [인물 특징], holding [상징적 물건], cozy background, whimsical storybook style, portrait 9:16"
- 시대 비교: "Children's book illustration, soft watercolor, split scene showing [시대A 장면] on left and [시대B 장면] on right, warm pastel colors, storybook style, portrait 9:16"

### 예시

입력: "소크라테스의 '너 자신을 알라'"
narrationText: "소크라테스라는 할아버지가 있었는데요, 이 분이 사람들한테 맨날 이런 질문을 했대요. '너는 진짜 네가 뭘 좋아하는지 알아?' 우리도 가끔 뭘 먹을지도 못 정하잖아요?"
visualPrompt: "Children's book illustration, soft watercolor, a wise old man with a kind smile sitting under an olive tree, asking a curious child 'who are you?', thought bubbles floating above, warm pastel colors, whimsical storybook style, portrait 9:16"

입력: "프랑스 혁명의 발단"
narrationText: "옛날 프랑스에서요, 왕이랑 귀족들은 매일 케이크를 먹었는데 일반 사람들은 빵도 못 먹었대요. 그래서 사람들이 화가 나서 '이건 아니잖아!' 하고 들고 일어난 거예요."
visualPrompt: "Children's book illustration, soft watercolor, a grand castle with tiny people below looking up angrily, one side showing feast and the other showing empty plates, warm pastel colors, whimsical storybook style, portrait 9:16"

### 금지 사항
- 교과서 같은 딱딱한 설명 → 이야기 형식 필수
- 연도/이름 나열 → 맥락과 감정 중심
- 추상적 개념만 나열 → 구체적 상황/비유 필수`;
  }

  /**
   * 사회과학 콘텐츠 가이드 (경제학, 사회학, 정치학, 심리학 등)
   */
  private getSocialScienceContentGuide(): string {
    return `## 사회과학 콘텐츠 가이드

### 핵심 원칙: 우리 생활 속 이야기
사회과학 개념은 **일상생활**에서 바로 경험하는 현상으로 설명합니다.
"이거 우리 일상에서도 일어나는 일이에요!"가 핵심 톤입니다.

### narrationText 작성법
- 경제 개념 → "여러분 편의점에서 과자 살 때..."처럼 일상 소비 상황
- 사회 현상 → "학교에서 이런 경험 있죠?"처럼 공감할 수 있는 상황
- 심리학 → "왜 우리는 ~할까요?"라는 질문으로 호기심 유발
- 정치/제도 → "만약 우리 반에서 반장을 뽑는다면..."처럼 축소 비유
- **통계/데이터**: 숫자를 비유로 변환 ("10명 중 7명이", "100원 중 30원은")
- **인과관계 명확히**: "~하면 ~가 되거든요", "그래서 ~가 생긴 거예요"

### visualPrompt 템플릿
- 경제 흐름: "Children's book illustration, soft watercolor, a cheerful marketplace with cute characters trading [물건A] for [물건B], coins and arrows showing flow, warm pastel colors, whimsical storybook style, portrait 9:16"
- 사회 구조: "Children's book illustration, soft watercolor, a cozy village with different color-coded houses for [그룹1], [그룹2], pathways connecting them, warm pastel colors, storybook style, portrait 9:16"
- 심리 현상: "Children's book illustration, soft watercolor, a cute character with [감정 표현], thought bubble showing [내면 상태], warm cozy background, whimsical storybook style, portrait 9:16"
- 통계/데이터: "Children's book illustration, soft watercolor, [N] cute characters in a row, [M] of them colored differently to show proportion, warm pastel colors, storybook style, portrait 9:16"
- 제도/시스템: "Children's book illustration, soft watercolor, a tiny town hall where cute animal characters are voting/discussing, color-coded roles, warm pastel colors, storybook style, portrait 9:16"

### 예시

입력: "인플레이션의 원리"
narrationText: "작년에 천 원이면 살 수 있던 과자가 올해는 천이백 원이 됐어요. 왜냐하면 돈이 너무 많아지면 돈의 가치가 떨어지거든요. 마치 반에서 스티커를 너무 많이 나눠주면 스티커가 별로 안 귀해지는 것처럼요!"
visualPrompt: "Children's book illustration, soft watercolor, a candy shop where price tags are growing bigger, a cute character looking surprised at the changing numbers, sticker collection comparison on the side, warm pastel colors, whimsical storybook style, portrait 9:16"

입력: "사회적 딜레마 (죄수의 딜레마)"
narrationText: "두 친구가 있는데요, 서로 도와주면 둘 다 좋은데, 한 명만 욕심 부리면 그 사람만 이득이에요. 그런데 둘 다 욕심 부리면? 둘 다 손해! 이게 바로 사회에서 일어나는 딜레마예요."
visualPrompt: "Children's book illustration, soft watercolor, two cute animal friends at a crossroads, one sunny path with hearts leading to cooperation, another dark path with a treasure chest leading to betrayal, warm pastel colors, whimsical storybook style, portrait 9:16"

### 금지 사항
- 학술 용어만 나열 → 일상 비유 필수
- 숫자/통계 그대로 나열 → 비유적 표현으로 변환
- 현상만 설명 → "왜?"의 인과관계 설명 필수
- 가치판단/정치적 편향 → 중립적 설명 유지`;
  }

  /**
   * AI 기반 문서 분야 판별 (Gemini Flash)
   * 문서의 처음+중간 청크 샘플을 보고 분야를 판별
   * 1회 호출 후 결과를 Neo4j에 저장하여 캐시
   */
  async detectDocumentContentType(chunks: { text: string }[]): Promise<ContentType> {
    // 샘플: 첫 2개 + 중간 1개 청크 (최대 3000자씩)
    const sampleChunks: string[] = [];
    if (chunks.length > 0) sampleChunks.push(chunks[0].text.substring(0, 3000));
    if (chunks.length > 2) sampleChunks.push(chunks[Math.floor(chunks.length / 2)].text.substring(0, 3000));
    if (chunks.length > 1) sampleChunks.push(chunks[chunks.length - 1].text.substring(0, 2000));

    const sampleText = sampleChunks.join('\n\n---\n\n');

    const prompt = `다음 문서의 학문 분야를 판별하세요.

## 문서 샘플
${sampleText}

## 분류 기준
반드시 아래 중 하나만 선택하세요:
- math_science: 수학, 물리학, 화학, 생물학, 컴퓨터과학, AI/ML, 공학, 의학
- humanities: 철학, 역사, 문학, 언어학, 미학, 종교학, 고고학, 예술
- social_science: 경제학, 사회학, 정치학, 심리학, 법학, 교육학, 인류학, 경영학

## 출력 (JSON만)
{"contentType": "math_science", "reason": "판별 이유 한 줄"}`;

    try {
      const response = await this.callGeminiAPI(prompt);
      const parsed = JSON.parse(response.trim());
      const detected = parsed.contentType as ContentType;

      if (['math_science', 'humanities', 'social_science'].includes(detected)) {
        logger.info({ detected, reason: parsed.reason }, 'Document content type detected by AI');
        return detected;
      }
    } catch (error) {
      logger.error({ error }, 'AI content type detection failed, using keyword fallback');
    }

    // fallback: 키워드 기반
    const fallback = this.detectPrimaryContentType(sampleText);
    return fallback === null ? 'math_science' : fallback;
  }

  /**
   * 콘텐츠의 주된 분야 1개를 점수 기반으로 감지 (키워드 fallback)
   * config.contentType이 'auto'가 아니면 명시된 값을 그대로 반환
   */
  private detectPrimaryContentType(content: string): ContentType | null {
    // 명시적 지정이 있으면 그대로 사용
    if (this.config.contentType !== 'auto') {
      return this.config.contentType;
    }

    // 점수 기반 감지 (키워드 매칭 횟수)
    const scores = { math_science: 0, humanities: 0, social_science: 0 };

    // 수학/과학: LaTeX 마커는 강한 시그널 (+5)
    if (content.includes('$$') || content.includes('\\frac') ||
        content.includes('\\sum') || content.includes('\\int') ||
        /\$[^$]+\$/.test(content)) {
      scores.math_science += 5;
    }
    const mathKeywords = [
      'algorithm', 'neural network', 'encoder', 'decoder', 'transformer',
      'loss function', 'gradient', 'backpropagation', 'convolution',
      'attention mechanism', 'embedding', 'latent space', 'GAN', 'VAE',
      'regression', 'optimization', 'eigenvalue', 'matrix', 'vector',
      'derivative', 'integral', 'probability', 'theorem', 'proof'
    ];
    for (const kw of mathKeywords) {
      if (content.toLowerCase().includes(kw.toLowerCase())) scores.math_science++;
    }

    // 인문학: 분야 특화 용어만 (일반적인 "역사", "문화" 제외)
    const humanitiesKeywords = [
      '실존주의', '형이상학', '존재론', '인식론', '해석학', '현상학',
      '수사학', '서사구조', '비평이론', '미학적', '윤리학',
      '고전문학', '근대문학', '문예사조', '르네상스', '계몽주의',
      'hermeneutics', 'phenomenology', 'existentialism', 'epistemology',
      'ontology', 'aesthetics', 'literary criticism', 'rhetoric',
      'romanticism', 'enlightenment', 'postmodernism', 'deconstruction'
    ];
    for (const kw of humanitiesKeywords) {
      if (content.toLowerCase().includes(kw.toLowerCase())) scores.humanities++;
    }

    // 사회과학: 분야 특화 용어만 (일반적인 "사회", "경제" 제외)
    const socialScienceKeywords = [
      '인플레이션', 'GDP', '수요곡선', '공급곡선', '한계효용',
      '민주주의', '권력구조', '계급투쟁', '사회계층', '복지국가',
      '인지편향', '행동경제학', '사회심리', '집단역학',
      'macroeconomics', 'microeconomics', 'fiscal policy', 'monetary policy',
      'behavioral economics', 'cognitive bias', 'social stratification',
      'game theory', 'public choice', 'institutional economics',
      'prisoner dilemma', 'nash equilibrium', 'welfare economics'
    ];
    for (const kw of socialScienceKeywords) {
      if (content.toLowerCase().includes(kw.toLowerCase())) scores.social_science++;
    }

    // 최고 점수 분야 선택 (최소 2점 이상이어야 유효)
    const maxScore = Math.max(scores.math_science, scores.humanities, scores.social_science);
    if (maxScore < 2) return null;

    if (scores.math_science === maxScore) return 'math_science';
    if (scores.humanities === maxScore) return 'humanities';
    return 'social_science';
  }

  /**
   * 주된 콘텐츠 분야의 가이드 1개만 반환
   */
  private getContentTypeGuide(content: string): string {
    const primaryType = this.detectPrimaryContentType(content);

    switch (primaryType) {
      case 'math_science': return this.getMathContentGuide();
      case 'humanities': return this.getHumanitiesContentGuide();
      case 'social_science': return this.getSocialScienceContentGuide();
      default: return '';
    }
  }

  /**
   * Gemini API 호출
   */
  private async callGeminiAPI(prompt: string): Promise<string> {
    const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json'
      }
    };

    logger.debug({ model: this.model, promptLength: prompt.length }, 'Calling Gemini API');

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error({ status: response.status, error: errorText }, 'Gemini API error');
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
      logger.error({ response: data }, 'No text in Gemini response');
      throw new Error('No text in Gemini API response');
    }

    return data.candidates[0].content.parts[0].text;
  }

  /**
   * AI 응답 파싱
   */
  private parseAIResponse(
    responseText: string,
    bookId: string,
    bookTitle: string,
    chunks: BookChunk[]
  ): ShortsPlan {
    let parsed: any;

    try {
      // JSON 추출 (마크다운 코드 블록 제거)
      let jsonStr = responseText.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.slice(7);
      }
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.slice(3);
      }
      if (jsonStr.endsWith('```')) {
        jsonStr = jsonStr.slice(0, -3);
      }

      parsed = JSON.parse(jsonStr.trim());
    } catch (error) {
      logger.error({ error, responseText: responseText.substring(0, 500) }, 'Failed to parse AI response');
      throw new Error('Failed to parse AI response as JSON');
    }

    // 계획 구성
    const shorts: ShortPlan[] = (parsed.shorts || []).map((s: any, idx: number) => {
      const scenes: ScenePlan[] = (s.scenes || []).map((sc: any, scIdx: number) => ({
        sceneIndex: sc.sceneIndex ?? scIdx,
        sceneType: sc.sceneType || 'explanation',
        narrationText: sc.narrationText || '',
        visualPrompt: sc.visualPrompt || '',
        durationHint: sc.durationHint || 5,
        sourceChunkIds: sc.sourceChunkIds || [`chunk_${scIdx}`]
      }));

      return {
        shortIndex: s.shortIndex ?? idx,
        title: s.title || `Short ${idx + 1}`,
        hook: s.hook || '',
        theme: s.theme || '',
        scenes,
        totalDuration: scenes.reduce((sum, sc) => sum + sc.durationHint, 0),
        tags: s.tags || []
      };
    });

    const totalScenes = shorts.reduce((sum, s) => sum + s.scenes.length, 0);
    const totalDuration = shorts.reduce((sum, s) => sum + s.totalDuration, 0);

    return {
      bookId,
      bookTitle,
      totalShorts: shorts.length,
      character: {
        description: parsed.character?.description || `A friendly narrator character, ${this.config.style} style`,
        style: parsed.character?.style || this.config.style
      },
      shorts,
      metadata: {
        analyzedAt: new Date().toISOString(),
        totalChunks: chunks.length,
        totalScenes,
        estimatedTotalDuration: totalDuration
      }
    };
  }

  /**
   * 단일 청크에서 Scene 생성 (간단한 케이스)
   */
  async createSceneFromChunk(
    chunk: BookChunk,
    sceneIndex: number,
    style?: string
  ): Promise<ScenePlan> {
    const prompt = `다음 텍스트를 기반으로 YouTube Shorts의 한 Scene을 생성해주세요.

텍스트:
${chunk.text}

## 출력 (JSON)
{
  "sceneIndex": ${sceneIndex},
  "sceneType": "explanation",
  "narrationText": "한국어 나레이션 (자연스러운 구어체)",
  "visualPrompt": "English image prompt, ${style || this.config.style} style, detailed visual",
  "durationHint": 5
}`;

    const response = await this.callGeminiAPI(prompt);
    const parsed = JSON.parse(response);

    return {
      sceneIndex: parsed.sceneIndex ?? sceneIndex,
      sceneType: parsed.sceneType || 'explanation',
      narrationText: parsed.narrationText || chunk.text.substring(0, 200),
      visualPrompt: parsed.visualPrompt || `${chunk.text.substring(0, 100)}, ${style || this.config.style} style`,
      durationHint: parsed.durationHint || 5,
      sourceChunkIds: [chunk.id]
    };
  }

  // ============================================
  // Entity-Based Multi-Episode Planning (NEB Integration)
  // ============================================

  /**
   * NEB 엔티티 클러스터 기반 다중 에피소드 계획 생성
   * 각 핵심 엔티티(기술/개념)마다 독립적인 에피소드 생성
   */
  async analyzeAndPlanByEntityClusters(
    neo4jService: Neo4jService,
    fileName: string,
    characterDescription?: string
  ): Promise<ShortsPlan> {
    logger.info({ fileName }, 'Starting entity-based multi-episode planning');

    // 1. NEB에서 엔티티 클러스터 조회
    const clusters = await neo4jService.getEntityClusters(fileName);

    if (clusters.length === 0) {
      logger.warn({ fileName }, 'No entity clusters found, falling back to simple planning');
      const chunks = await neo4jService.getChunks(fileName);
      return this.analyzeAndPlan(fileName, fileName, chunks, characterDescription);
    }

    logger.info({ fileName, clusterCount: clusters.length }, 'Entity clusters retrieved');

    // 2. 각 클러스터별로 에피소드 생성
    const shorts: ShortPlan[] = [];

    for (let i = 0; i < clusters.length; i++) {
      const cluster = clusters[i];

      // 클러스터의 청크 텍스트 조회
      const chunkTexts = await neo4jService.getClusterChunkTexts(cluster.chunkIds);
      const combinedText = chunkTexts.join('\n\n');

      logger.info({
        cluster: cluster.clusterName,
        mainEntity: cluster.mainEntity,
        chunkCount: cluster.chunkIds.length
      }, `Planning episode ${i + 1}`);

      // 클러스터별 에피소드 프롬프트 생성
      const episodePrompt = this.buildEntityEpisodePrompt(
        fileName,
        cluster,
        combinedText,
        i,
        clusters.length,
        characterDescription
      );

      try {
        const response = await this.callGeminiAPI(episodePrompt);
        const parsed = JSON.parse(response.trim());

        const scenes: ScenePlan[] = (parsed.scenes || []).map((sc: any, scIdx: number) => ({
          sceneIndex: sc.sceneIndex ?? scIdx,
          sceneType: sc.sceneType || 'explanation',
          narrationText: sc.narrationText || '',
          visualPrompt: sc.visualPrompt || '',
          durationHint: sc.durationHint || 7,
          sourceChunkIds: cluster.chunkIds.slice(0, 3)  // 클러스터 청크 참조
        }));

        shorts.push({
          shortIndex: i,
          title: parsed.title || cluster.clusterName,
          hook: parsed.hook || `${cluster.mainEntity}에 대해 알아볼까요?`,
          theme: cluster.mainEntity,
          scenes,
          totalDuration: scenes.reduce((sum, sc) => sum + sc.durationHint, 0),
          tags: [cluster.mainEntity, ...cluster.relatedEntities.slice(0, 3)]
        });
      } catch (error) {
        logger.error({ error, cluster: cluster.clusterName }, 'Failed to generate episode');
      }
    }

    const totalScenes = shorts.reduce((sum, s) => sum + s.scenes.length, 0);
    const totalDuration = shorts.reduce((sum, s) => sum + s.totalDuration, 0);

    const plan: ShortsPlan = {
      bookId: fileName,
      bookTitle: fileName.replace('.pdf', ''),
      totalShorts: shorts.length,
      character: {
        description: characterDescription || `A friendly narrator character, ${this.config.style} style`,
        style: this.config.style
      },
      shorts,
      metadata: {
        analyzedAt: new Date().toISOString(),
        totalChunks: clusters.reduce((sum, c) => sum + c.chunkIds.length, 0),
        totalScenes,
        estimatedTotalDuration: totalDuration
      }
    };

    logger.info({
      fileName,
      totalShorts: plan.totalShorts,
      totalScenes,
      clusters: clusters.map(c => c.mainEntity)
    }, 'Entity-based multi-episode planning completed');

    return plan;
  }

  /**
   * 엔티티 클러스터별 에피소드 프롬프트 생성
   */
  private buildEntityEpisodePrompt(
    fileName: string,
    cluster: {
      clusterId: string;
      clusterName: string;
      mainEntity: string;
      relatedEntities: string[];
      chunkIds: string[];
    },
    content: string,
    episodeIndex: number,
    totalEpisodes: number,
    characterDescription?: string
  ): string {
    const style = this.config.style;
    const maxScenes = this.config.maxScenesPerShort;
    const audienceLevel = this.config.audienceLevel;

    const audienceGuide = this.getAudienceGuide(audienceLevel);
    const eli5Rules = this.config.useELI5Style ? this.getELI5Rules() : '';
    const contentGuide = this.getContentTypeGuide(content);

    return `당신은 복잡한 학술 논문을 쉽게 설명하는 YouTube Shorts 크리에이터입니다.

## 문서 정보
파일: ${fileName}
에피소드: ${episodeIndex + 1}/${totalEpisodes}

## 이번 에피소드 주제
핵심 엔티티: ${cluster.mainEntity}
관련 개념: ${cluster.relatedEntities.join(', ')}

## 참조 내용
${content.substring(0, 8000)}
${content.length > 8000 ? '\n... (내용 생략)' : ''}

## 작업
"${cluster.mainEntity}"에 대해 **깊이 있게 설명**하는 YouTube Shorts를 만들어주세요.
이것은 ${totalEpisodes}개 시리즈 중 ${episodeIndex + 1}번째 에피소드입니다.

## 제약조건
- 최대 ${maxScenes}개의 Scene
- 각 Scene: 5-10초
- 목표 길이: 60초
- 스타일: ${style}
- 캐릭터: ${characterDescription || `${style} 스타일의 친근한 해설자`}

${audienceGuide}

${eli5Rules}

${contentGuide}

## 이번 에피소드에서 설명할 것
1. ${cluster.mainEntity}이(가) 무엇인지
2. 왜 중요한지 (문제 해결)
3. 어떻게 작동하는지 (비유 사용)
4. 관련 개념과의 연결: ${cluster.relatedEntities.slice(0, 2).join(', ')}

## 출력 형식 (JSON)
{
  "title": "에피소드 제목 (한국어, 50자 이내)",
  "hook": "시선을 끄는 질문/놀라운 사실 (한국어)",
  "scenes": [
    {
      "sceneIndex": 0,
      "sceneType": "hook",
      "narrationText": "쉬운 한국어 나레이션 (비유와 예시 포함)",
      "visualPrompt": "English visual description, ${style} style, colorful and engaging",
      "durationHint": 5
    }
  ]
}

## 주의사항
1. 첫 Scene은 반드시 hook (질문 또는 놀라운 사실)
2. 마지막 Scene은 cta (다음 에피소드 유도)
3. "${cluster.mainEntity}" 개념을 비유로 설명 필수
4. 전문 용어는 반드시 쉬운 설명 추가
5. JSON만 출력`;
  }

  // ============================================
  // Sequential Curriculum Planning (v2.5.0)
  // 에피소드 연결성 + 상세 설명 + 수학/기술 커버
  // ============================================

  /**
   * 순차적 커리큘럼 기반 다중 에피소드 계획 생성
   * - 전체 문서를 학습 순서대로 분할
   * - 에피소드 간 연결성 보장
   * - 모든 내용을 상세히 설명
   * - 수학/기술 내용 필수 포함
   */
  async analyzeAndPlanSequentialCurriculum(
    bookId: string,
    bookTitle: string,
    chunks: BookChunk[],
    characterDescription?: string
  ): Promise<ShortsPlan> {
    logger.info({ bookId, bookTitle, chunkCount: chunks.length }, 'Starting SEQUENTIAL CURRICULUM planning');

    // 1단계: 전체 문서 분석하여 커리큘럼 구조 생성 (v3.1.0: 수식 포함)
    const combinedText = chunks.map((c, i) => {
      let text = `[청크 ${i + 1}/${chunks.length}]${c.sectionTitle ? ` (${c.sectionTitle})` : ''}\n${c.text}`;
      if (c.latexFormulas && c.latexFormulas.length > 0) {
        text += `\n\n[이 청크의 주요 수식]\n${c.latexFormulas.map((f, j) => `${j+1}. $$${f}$$`).join('\n')}`;
      }
      return text;
    }).join('\n\n---\n\n');

    const curriculumPrompt = this.buildCurriculumAnalysisPrompt(bookTitle, combinedText, characterDescription);
    const curriculumResponse = await this.callGeminiAPI(curriculumPrompt);

    let curriculum: any;
    try {
      curriculum = JSON.parse(curriculumResponse.trim());
    } catch (e) {
      logger.error({ error: e }, 'Failed to parse curriculum JSON');
      throw new Error('Curriculum analysis failed');
    }

    logger.info({
      totalEpisodes: curriculum.episodes?.length,
      topics: curriculum.episodes?.map((e: any) => e.topic)
    }, 'Curriculum structure generated');

    // 2단계: 각 에피소드를 순차적으로 상세 생성 (이전 에피소드 컨텍스트 포함)
    const shorts: ShortPlan[] = [];
    let previousEpisodeSummary = '';

    for (let i = 0; i < (curriculum.episodes || []).length; i++) {
      const episodeOutline = curriculum.episodes[i];

      logger.info({
        episodeNumber: i + 1,
        topic: episodeOutline.topic,
        chunkRange: episodeOutline.chunkRange
      }, `Generating detailed episode ${i + 1}`);

      // 해당 에피소드에 필요한 청크 텍스트 추출
      const startChunk = episodeOutline.chunkRange?.[0] || 0;
      const endChunk = episodeOutline.chunkRange?.[1] || chunks.length - 1;
      const relevantChunks = chunks.slice(startChunk, endChunk + 1);
      const episodeContent = relevantChunks.map(c => c.text).join('\n\n');

      const episodePrompt = this.buildDetailedEpisodePrompt(
        bookTitle,
        episodeOutline,
        episodeContent,
        i,
        curriculum.episodes.length,
        previousEpisodeSummary,
        characterDescription,
        relevantChunks
      );

      try {
        const episodeResponse = await this.callGeminiAPI(episodePrompt);
        const parsed = JSON.parse(episodeResponse.trim());

        const scenes: ScenePlan[] = (parsed.scenes || []).map((sc: any, scIdx: number) => ({
          sceneIndex: sc.sceneIndex ?? scIdx,
          sceneType: sc.sceneType || 'explanation',
          narrationText: sc.narrationText || '',
          visualPrompt: sc.visualPrompt || '',
          durationHint: sc.durationHint || 7,
          sourceChunkIds: relevantChunks.map(c => c.id)
        }));

        const short: ShortPlan = {
          shortIndex: i,
          title: parsed.title || episodeOutline.topic,
          hook: parsed.hook || '',
          theme: episodeOutline.topic,
          scenes,
          totalDuration: scenes.reduce((sum, sc) => sum + sc.durationHint, 0),
          tags: parsed.tags || [episodeOutline.topic]
        };

        shorts.push(short);

        // 다음 에피소드를 위해 이번 에피소드 요약 저장
        previousEpisodeSummary = parsed.summary || `Episode ${i + 1}: ${episodeOutline.topic} - ${scenes.map(s => s.narrationText.substring(0, 50)).join(' / ')}`;

      } catch (error) {
        logger.error({ error, episode: i + 1 }, 'Failed to generate episode');
      }
    }

    const totalScenes = shorts.reduce((sum, s) => sum + s.scenes.length, 0);
    const totalDuration = shorts.reduce((sum, s) => sum + s.totalDuration, 0);

    const plan: ShortsPlan = {
      bookId,
      bookTitle,
      totalShorts: shorts.length,
      character: {
        description: characterDescription || `A friendly narrator character, ${this.config.style} style`,
        style: this.config.style
      },
      shorts,
      metadata: {
        analyzedAt: new Date().toISOString(),
        totalChunks: chunks.length,
        totalScenes,
        estimatedTotalDuration: totalDuration
      }
    };

    logger.info({
      bookId,
      totalShorts: plan.totalShorts,
      totalScenes,
      totalDuration
    }, 'Sequential curriculum planning completed');

    return plan;
  }

  /**
   * 커리큘럼 구조 분석 프롬프트
   */
  private buildCurriculumAnalysisPrompt(
    bookTitle: string,
    content: string,
    characterDescription?: string
  ): string {
    return `당신은 복잡한 학술 논문/책을 **체계적인 학습 커리큘럼**으로 변환하는 전문가입니다.

## 문서
제목: ${bookTitle}
내용:
${content.substring(0, 20000)}
${content.length > 20000 ? '\n... (이하 생략)' : ''}

## 목표
이 문서를 YouTube Shorts 시리즈로 만들기 위한 **학습 커리큘럼**을 설계하세요.

## 핵심 원칙
1. **순차적 학습**: 기초 → 심화 순서로 배열
2. **완전한 커버**: 문서의 모든 핵심 내용을 빠짐없이 포함
3. **연결성**: 각 에피소드가 이전 내용을 기반으로 확장
4. **수학/기술 필수**: 공식, 알고리즘, 기술적 내용을 반드시 포함
5. **적절한 분량**: 복잡한 개념은 여러 에피소드로 나눔

## 에피소드 분할 기준
- 새로운 핵심 개념이 등장할 때
- 수학 공식이나 알고리즘 설명이 필요할 때
- 기존 개념의 심화 설명이 필요할 때
- 비교/대조가 필요할 때
- 실제 적용 사례를 설명할 때

## 출력 형식 (JSON)
{
  "documentSummary": "문서 전체 요약 (2-3문장)",
  "totalEpisodes": 숫자,
  "learningObjectives": ["학습목표1", "학습목표2", ...],
  "episodes": [
    {
      "episodeNumber": 1,
      "topic": "에피소드 주제 (한국어)",
      "chunkRange": [시작청크번호, 끝청크번호],
      "keyConceptsToExplain": ["개념1", "개념2", ...],
      "mathOrTechnical": [{"name": "이름", "latex": "실제 LaTeX 수식", "whatItDoes": "수식이 하는 일 1줄 설명"}],
      "prerequisite": null 또는 "이전 에피소드에서 배운 것",
      "connectionToPrevious": "이전 에피소드와의 연결점",
      "connectionToNext": "다음 에피소드로의 연결점"
    }
  ]
}

## 주의사항
1. 에피소드 수를 아끼지 마세요 - 내용을 충분히 설명하는 것이 중요
2. 수학 공식이 있으면 반드시 별도 에피소드로 설명
3. 추상적 개념은 여러 에피소드에 걸쳐 반복 설명 가능
4. JSON만 출력`;
  }

  /**
   * v3.1.0: 청크 텍스트에서 수식과 컨텍스트 추출 (커리큘럼 프롬프트용)
   */
  private extractFormulasFromChunks(chunks: BookChunk[]): {latex: string, context: string}[] {
    const results: {latex: string, context: string}[] = [];
    for (const chunk of chunks) {
      // latexFormulas 필드에서 추출
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

      // 텍스트에서 $$...$$ 패턴 추가 추출
      const inlineMatches = chunk.text.match(/\$\$([^$]+)\$\$/g) || [];
      for (const match of inlineMatches) {
        const latex = match.replace(/^\$\$|\$\$$/g, '').trim();
        // 이미 추출된 것과 중복 확인
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

  /**
   * 상세 에피소드 생성 프롬프트 (이전 에피소드 컨텍스트 포함)
   */
  private buildDetailedEpisodePrompt(
    bookTitle: string,
    episodeOutline: any,
    content: string,
    episodeIndex: number,
    totalEpisodes: number,
    previousEpisodeSummary: string,
    characterDescription?: string,
    relevantChunks?: BookChunk[]
  ): string {
    const style = this.config.style;
    const maxScenes = this.config.maxScenesPerShort;
    const audienceLevel = this.config.audienceLevel;
    const audienceGuide = this.getAudienceGuide(audienceLevel);
    const eli5Rules = this.config.useELI5Style ? this.getELI5Rules() : '';

    // 콘텐츠 유형별 가이드 자동 감지
    const contentGuide = this.getContentTypeGuide(content);

    // v3.1.0: 청크에서 실제 LaTeX 수식 + 컨텍스트 추출
    const formulasFromChunks = relevantChunks ? this.extractFormulasFromChunks(relevantChunks) : [];

    // 수학/기술 내용 감지 (에피소드별 수식 설명 가이드)
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

    // contentGuide already includes the primary content type guide based on score-based detection

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

## visualPrompt 작성 가이드 (핵심) - 씬 타입별 차별화!

### 씬 타입별 이미지 스타일 (반드시 구분!)

#### 🎭 서사 씬 (hook, intro, cta, conclusion): 동화책 스타일
"Children's book illustration, soft watercolor, [장면 묘사], whimsical storybook style, warm pastel colors, portrait 9:16"
- 캐릭터, 감정, 스토리 전달이 목적
- 따뜻한 파스텔 톤, 수채화 질감

#### 📊 설명 씬 (explanation, example, data, comparison): 교육 인포그래픽 스타일
"Clean educational infographic on soft cream background, [개념의 시각화: 다이어그램/플로우차트/비교표], directional arrows and visual cues, consistent flat illustration style with warm muted colors, organized layout, portrait 9:16"
- **다이어그램, 플로우차트, 비교 차트, 색상으로 구분된 구조도**가 주인공
- 캐릭터는 보조 역할 (작은 아이콘 수준) 또는 없어도 됨
- 각 구성요소에 **고유한 색상/아이콘** 필수
- **같은 에피소드 내 설명 씬끼리 일관된 레이아웃/색상 톤 유지**

### 설명 씬 템플릿 (explanation/example/data/comparison)
- 수학/공식: "Clean educational infographic on soft cream background, left side shows the equation concept as visual diagram [구성요소 나열], right side shows real-world analogy [비유 장면], connecting arrows between them, warm muted colors, portrait 9:16"
- 프로세스/파이프라인: "Clean educational infographic on soft cream background, step-by-step flowchart: [Step1] → [Step2] → [Step3], each step in a rounded box with icon and label, directional arrows, warm muted colors, portrait 9:16"
- 비교: "Clean educational infographic on soft cream background, side-by-side comparison: [A] vs [B], two columns with distinct rows showing [차이점1], [차이점2], [차이점3], warm muted colors, portrait 9:16"
- 구조/아키텍처: "Clean educational infographic on soft cream background, architecture diagram with [N] color-coded connected blocks for [Component1], [Component2], data flow arrows between them, warm muted colors, portrait 9:16"
- 데이터: "Clean educational infographic on soft cream background, visual data representation showing [비유적 시각화: 예) 10개 사과 중 7개 빨간색], color-coded proportions, warm muted colors, portrait 9:16"

### 설명 이미지 일관성 규칙
1. 같은 에피소드 내 설명 씬은 동일한 배경색/레이아웃 사용
2. 색상 스타일 통일 (같은 색상 팔레트, 같은 화살표 스타일)
3. 연속되는 수식 설명은 같은 시각 프레임워크 유지 (예: 항상 왼쪽=수식, 오른쪽=비유)

### 금지 사항
- 설명 씬에서 캐릭터가 주인공인 이미지 ("a cute character explaining...") → **다이어그램/차트가 주인공** 필수
- 추상적 묘사만 ("concept illustration") → 구체적 구성요소 나열 필수
- 설명 씬마다 완전히 다른 시각 스타일 → 에피소드 내 일관성 유지

${contentGuide}

## Scene 구조 (반드시 따르세요)

### Scene 1: Hook (5초)
- 시청자 호기심 자극하는 질문 또는 놀라운 사실
- "${episodeOutline.topic}"에 대한 흥미 유발

### Scene 2-3: 이전 내용 연결 + 개념 소개 (10-15초)
${previousEpisodeSummary ? '- "지난 시간에 ~를 배웠죠? 오늘은..."' : '- 주제 소개'}
- 새로운 개념이 왜 필요한지

### Scene 4-6: 핵심 설명 (20-30초) -- 가장 중요
- 개념을 **비유**로 설명
- 수학/기술 내용을 **단계별**로 풀어서 설명
- "마치 ~와 같아요" 형식 필수

### Scene 7: 예시/적용 (8-10초)
- 실제 사례 또는 일상 예시

### Scene 8: 요약 + 다음 예고 (5-7초)
- "오늘 배운 것: ~"
- "다음 시간에는 ~를 알아볼게요!"

## 출력 형식 (JSON)
{
  "title": "에피소드 제목 (한국어, 호기심 유발)",
  "hook": "첫 문장 (질문 또는 놀라운 사실)",
  "summary": "이 에피소드 요약 (다음 에피소드 컨텍스트용, 100자)",
  "tags": ["태그1", "태그2", ...],
  "scenes": [
    {
      "sceneIndex": 0,
      "sceneType": "hook",
      "narrationText": "쉬운 한국어. 비유 필수. 한 문장씩 끊어서.",
      "visualPrompt": "Children's book illustration, soft watercolor, [비유적 시각화 장면], whimsical storybook style, warm pastel colors, hand-painted texture, portrait 9:16",
      "durationHint": 5
    }
  ]
}

## 절대 규칙
1. 전문 용어 사용 시 반드시 "(쉽게 말해 ~)" 추가
2. 수학 공식은 추상적 비유로 설명, 변수 기호 언급 가능하되 쉬운 설명 추가
3. 모든 추상 개념에 비유 필수
4. visualPrompt는 동화책 일러스트 스타일 필수 ("Children's book illustration, soft watercolor, ..."). 딱딱한 다이어그램 금지, 비유적 동화 장면으로 시각화. 텍스트/라벨/문자 일체 금지 - 색상, 아이콘, 화살표로만 표현
5. 이전 에피소드 내용을 자연스럽게 언급
6. **비유의 행위 = 수식의 행위**: 비교하는 수식 → 비교하는 비유, 합산 수식 → 모으는 비유. 수식의 본질과 무관한 비유 금지 (예: 얼굴 비교 수식에 "점묘화" 비유는 금지)
7. JSON만 출력`;
  }

  /**
   * 기존 계획 수정 (Scene 추가/제거)
   */
  async refinePlan(
    plan: ShortsPlan,
    feedback: string
  ): Promise<ShortsPlan> {
    const prompt = `현재 YouTube Shorts 계획을 피드백을 반영하여 수정해주세요.

## 현재 계획
${JSON.stringify(plan, null, 2)}

## 피드백
${feedback}

## 출력
수정된 계획을 동일한 JSON 형식으로 출력하세요.`;

    const response = await this.callGeminiAPI(prompt);
    const parsed = JSON.parse(response);

    // 기존 메타데이터 유지하면서 수정된 내용 반영
    return {
      ...plan,
      ...parsed,
      metadata: {
        ...plan.metadata,
        analyzedAt: new Date().toISOString()
      }
    };
  }
}

// ============================================
// Factory
// ============================================

export function createContentPlannerService(config?: Partial<ContentPlannerConfig>): ContentPlannerService {
  // API 키 우선순위: 직접 전달 > GOOGLE_GEMINI_API_KEY > GEMINI_API_KEY > GOOGLE_API_KEY
  const apiKey = config?.apiKey
    || process.env.GOOGLE_GEMINI_API_KEY
    || process.env.GEMINI_API_KEY
    || process.env.GOOGLE_API_KEY
    || '';

  if (!apiKey) {
    logger.warn('No Gemini API key found. Set GOOGLE_GEMINI_API_KEY environment variable.');
  }

  return new ContentPlannerService({
    apiKey,
    model: config?.model || 'gemini-2.0-flash',
    maxShortsPerBook: config?.maxShortsPerBook,
    maxScenesPerShort: config?.maxScenesPerShort,
    targetShortDuration: config?.targetShortDuration,
    language: config?.language,
    style: config?.style,
    audienceLevel: config?.audienceLevel,    // NEW: 대상 청중 레벨
    useELI5Style: config?.useELI5Style,      // NEW: ELI5 쉬운 설명 모드
    contentType: config?.contentType          // NEW: 콘텐츠 분야 (auto/math_science/humanities/social_science)
  });
}
