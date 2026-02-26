/**
 * Formula-Centric Prompt Builders
 * ContentPlannerService formula-centric methods 분리 (v7.0 리팩토링)
 */

import type { ContentPlannerConfig } from '../ContentPlannerService';
import { getViralEngagementGuide, getYouTubeMetadataGuide } from './contentGuides';

type ConfigSlice = Pick<
  Required<Omit<ContentPlannerConfig, 'apiKey' | 'visualPromptStyleGuide' | 'engagementGuideOverride' | 'useVeoInterpolation'>>,
  'style' | 'maxScenesPerShort'
> & { engagementGuideOverride?: string; useVeoInterpolation?: boolean };

/**
 * v3.3.0: 수식 중심 커리큘럼 구조 분석 프롬프트
 */
export function buildFormulaCentricCurriculumPrompt(
  bookTitle: string,
  content: string
): string {
  return `당신은 수학/과학 논문을 **수식 중심의 학습 커리큘럼**으로 변환하는 전문가입니다.

## 문서
제목: ${bookTitle}
내용:
${content.substring(0, 20000)}
${content.length > 20000 ? '\n... (이하 생략)' : ''}

## 목표
이 문서의 **모든 수식을 추출**하고, **수식을 중심으로** YouTube Shorts 시리즈 커리큘럼을 설계하세요.

## 핵심 원칙 (기존과 다름!)
1. **수식이 주인공**: 각 에피소드는 2-3개 수식을 깊이 있게 설명하는 것이 목적
2. **수식 그룹화**: 관련 수식끼리 같은 에피소드에 배치 (예: 같은 Loss 계열, 같은 모듈)
3. **기초→심화**: 단순 수식 → 복합 수식 순서
4. **모든 수식 커버**: 문서에 나온 수식을 빠짐없이 포함
5. **각 수식에 비유**: 고등학생이 이해할 비유와 시각적 개념 포함

## 수식 분석 방법
1. 문서의 모든 LaTeX 수식 ($$...$$ 또는 \\begin{equation} 등) 추출
2. 각 수식의 이름, 변수, 역할 파악
3. 주제별/모듈별로 그룹화
4. 학습 순서 결정 (독립 개념 → 의존 개념)

## 출력 형식 (JSON)
{
  "documentSummary": "문서 전체 요약 (2-3문장)",
  "totalFormulas": 숫자,
  "formulaGroups": [
    {
      "groupName": "그룹명 (예: Reconstruction Losses)",
      "formulas": [
        {
          "latex": "실제 LaTeX 수식",
          "name": "수식 이름 (한국어)",
          "variables": ["M", "M̂", "V_lips"],
          "whatItDoes": "이 수식이 하는 일 1줄",
          "highSchoolMetaphor": "고등학생 수준 비유 (예: '시험 답안지와 정답지를 대조하는 것')",
          "visualConcept": "이미지로 표현할 비유 장면 (영어, 예: 'two papers side by side with magnifying glass comparing them')"
        }
      ]
    }
  ],
  "totalEpisodes": 숫자,
  "episodes": [
    {
      "episodeNumber": 1,
      "topic": "에피소드 주제 (한국어)",
      "chunkRange": [시작청크번호, 끝청크번호],
      "formulas": [
        {"latex": "수식", "name": "이름", "highSchoolMetaphor": "비유", "visualConcept": "시각화"}
      ],
      "keyConceptsToExplain": ["개념1", "개념2"],
      "connectionToPrevious": "이전 에피소드와의 연결점",
      "connectionToNext": "다음 에피소드로의 연결점"
    }
  ]
}

## 주의사항
1. 에피소드당 수식 2-3개가 적절 (너무 많으면 분할)
2. hook/conclusion 씬에는 수식 없음 — 수식 씬은 explanation 타입
3. 수식이 없는 개념 설명도 별도 에피소드로 가능
4. JSON만 출력`;
}

/**
 * v3.3.0: 수식 중심 에피소드 상세 생성 프롬프트
 */
export function buildFormulaCentricEpisodePrompt(
  config: ConfigSlice,
  bookTitle: string,
  episodeOutline: any,
  content: string,
  episodeIndex: number,
  totalEpisodes: number,
  previousEpisodeSummary: string,
  characterDescription?: string
): string {
  const style = config.style;
  const maxScenes = config.maxScenesPerShort;

  const formulaList = (episodeOutline.formulas || []).map((f: any, i: number) =>
    `수식 ${i + 1}: $$${f.latex}$$\n이름: ${f.name}\n비유: ${f.highSchoolMetaphor || '없음'}\n시각화: ${f.visualConcept || '없음'}`
  ).join('\n\n');

  const useVeo = config.useVeoInterpolation === true;
  const viralGuide = config.engagementGuideOverride || getViralEngagementGuide(episodeOutline.topic);
  const youtubeMetadataGuide = getYouTubeMetadataGuide(episodeOutline.topic, bookTitle);

  return `당신은 수학/과학 수식을 고등학생이 이해하도록 설명하는 YouTube Shorts 크리에이터입니다.

## 문서 정보
제목: ${bookTitle}
에피소드: ${episodeIndex + 1}/${totalEpisodes} (시리즈물)

## 이번 에피소드 주제
${episodeOutline.topic}

## ★ 이번 에피소드에서 설명할 수식 (핵심!) ★
${formulaList || '(수식 없음 — 개념 설명 에피소드)'}

## 이전 에피소드 요약
${previousEpisodeSummary || '(첫 번째 에피소드입니다)'}

## 연결
이전: ${episodeOutline.connectionToPrevious || '(첫 에피소드)'}
다음: ${episodeOutline.connectionToNext || '(마지막 에피소드)'}

## 참조 내용
${content.substring(0, 8000)}
${content.length > 8000 ? '\n... (생략)' : ''}

${viralGuide}

${youtubeMetadataGuide}

## ★★★ 씬 구조 (반드시 따르세요!) ★★★

### Scene 1: Hook (3-5초) — 조회수를 결정하는 첫 문장!
- sceneType: "hook"
- 반직관적 질문/충격 통계/일상 연결로 시작 (바이럴 가이드 참조)
- "오늘 배울 수식은..." 같은 교과서형 시작 절대 금지!
- assignedFormula: 없음

### Scene 2~N: 수식 설명 (각 8-12초) — 핵심!
- sceneType: "explanation"
- **각 씬 = 수식 1개 설명** (같은 수식을 여러 씬에 반복 배정 금지!)
- assignedFormula: 해당 수식의 LaTeX (필수!)
- formulaName: 수식 이름 (필수!)
- formulaMetaphor: 고등학생 비유 (필수!)
- narrationText: 40-60자, 수식의 변수별 의미 + 전체 역할 설명
  예: "Reconstruction Loss는 원본 얼굴 M과 AI가 만든 M̂의 차이를 측정해요. 차이가 크면 점수가 높아지죠."
- visualPrompt: 수식 개념을 구체적 비유 장면으로 직접 묘사하는 서술형 문장 (캐릭터/사람 금지, 비유적 오브젝트만!)
  예: "Two faces side by side being compared with a magnifying glass, with measurement arrows showing the difference between them"

## 수식 변수 컬러 코딩 (자동 적용, v12.2)
수식의 각 변수는 렌더링 시 자동으로 고유 색상이 지정됩니다.
visualPrompt에서 이 컬러와 매칭되는 비주얼 요소를 사용하면 직관적인 연결이 됩니다:
- 주변수(x, n, alpha): teal (#4ecdc4) → 물, 얼음, 민트빛 오브젝트
- 부변수(y, m, beta): yellow (#ffe66d) → 빛, 별, 금빛 오브젝트
- 강조(z, k, gamma): coral (#ff6b6b) → 불, 하트, 위험 신호
- 매개변수(t, theta): purple (#c084fc) → 보라빛 연결선, 시간 흐름
예: x+y 수식 → "glowing teal sphere (x) merging with golden light (y)"

### 수식 설명 후 비유 씬 (각 5-7초) — 보충 설명
- sceneType: "example"
- 수식의 비유를 구체적 사례로 보여주는 씬 (assignedFormula 없음)
- 수식 씬 다음에 1개씩 배치하여 이해를 돕기

### 마지막 Scene: 마무리 + 댓글 유도 (5-7초) — 인게이지먼트 부스터!
- sceneType: "conclusion"
- 핵심 한 줄 정리 + 다음 예고 + **반드시 댓글 유도 질문 1개** (바이럴 가이드 참조)
- "구독/좋아요" 금지 — 시청자가 답하고 싶은 질문으로!
- assignedFormula: 없음

## 제약조건
- Scene 개수: 최소 7개, 최대 ${maxScenes}개 (짧으면 비유/예시 씬 추가)
- 목표 총 길이: 50-65초 (반드시 50초 이상!)
- 스타일: ${style}
- 캐릭터: ${characterDescription || `${style} 스타일의 친근한 해설자`}
- narrationText: 한국어, 고등학생 수준, "~거예요/~이죠/~해요" 말투

## 출력 형식 (JSON)
{
  "title": "일상 연결형 클릭 유도 제목 (30자 이내, 예: 'GPS가 작동하는 진짜 수학')",
  "hook": "반직관적 질문 또는 충격 통계 (20자 이내)",
  "summary": "이 에피소드 요약 (100자)",
  "description": "YouTube 설명문 (500-1500자, 메타데이터 가이드 참조)",
  "tags": ["태그1", "태그2"],
  "scenes": [
    {
      "sceneIndex": 0,
      "sceneType": "hook",
      "narrationText": "오늘은 Loss 함수에 대해 알아볼까요?",
      "visualPrompt": "On dark navy background, glowing teal introduction scene...",
      "durationHint": 5${useVeo ? `,
      "firstFramePrompt": "Starting state of the scene",
      "lastFramePrompt": "Ending state of the scene"` : ''}
    },
    {
      "sceneIndex": 1,
      "sceneType": "explanation",
      "narrationText": "Reconstruction Loss는 원본과 AI 결과의 차이를 측정해요. (45자)",
      "visualPrompt": "Two answer sheets being compared side by side with a magnifying glass showing differences",
      "durationHint": 10,
      "assignedFormula": "L_{recon} = ||\\hat{M} - M||_1",
      "formulaName": "Reconstruction Loss",
      "formulaMetaphor": "시험 답안지와 정답지를 대조하는 것"${useVeo ? `,
      "firstFramePrompt": "Two blank answer sheets placed side by side on a desk",
      "lastFramePrompt": "Same two sheets now covered in marks, magnifying glass highlighting the differences between them"` : ''}
    }
  ]
}
${useVeo ? `
## VEO 3.1 키프레임 프롬프트 (v11.0)
각 씬마다 "firstFramePrompt" (시작 상태)와 "lastFramePrompt" (종료 상태)를 추가하세요.
- 두 프롬프트는 같은 세팅/스타일, 의미 있는 시각적 변화
- 수식 씬: first=수식 등장 전 상태, last=수식 강조/완성 상태
- 자연스러운 전환이 가능한 수준의 변화
` : ''}

## 절대 규칙
1. 수식 씬의 assignedFormula는 반드시 에피소드의 수식 목록에 있는 LaTeX를 그대로 사용
2. narrationText에 LaTeX 코드 금지, 영어 용어명은 OK
3. visualPrompt에 텍스트/숫자/수식 금지 — 비유적 시각 장면만
4. 수식의 각 변수 의미를 narrationText에 반드시 포함
5. **explanation/example 씬의 visualPrompt에 캐릭터/사람 절대 금지!** ("character", "person", "narrator", "teacher" 금지) — 비유적 오브젝트/시각화만 사용. hook/conclusion만 캐릭터 가능
6. JSON만 출력`;
}
