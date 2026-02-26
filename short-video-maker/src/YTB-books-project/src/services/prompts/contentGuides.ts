/**
 * Content Guides
 * 대상 청중/분야별 AI 프롬프트 가이드 함수들
 * ContentPlannerService에서 분리 (v7.0 리팩토링)
 */

import type { ContentPlannerConfig, AudienceLevel, ContentType } from '../ContentPlannerService';
import { getEmpathyLifestyleGuide } from './empathyContentGuide';

type ConfigSlice = Pick<Required<Omit<ContentPlannerConfig, 'apiKey' | 'visualPromptStyleGuide'>>, 'audienceLevel' | 'useELI5Style' | 'contentType'>;

/**
 * 대상 청중별 설명 가이드라인 생성
 */
export function getAudienceGuide(level: AudienceLevel): string {
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
export function getELI5Rules(): string {
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
export function getMathContentGuide(): string {
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

### 변수↔컬러 시맨틱 매핑 (v12.2, 자동 적용)
수식 PNG 렌더링 시 변수별 색상이 자동 적용됩니다. visualPrompt에서도 같은 컬러 의미를 사용하세요:
| 역할 | 변수 | 컬러 | visualPrompt 키워드 |
|------|------|------|---------------------|
| 주변수/입력 | x, n, alpha | teal (#4ecdc4) | "glowing teal ..." |
| 부변수/출력 | y, m, beta | yellow (#ffe66d) | "golden/yellow ..." |
| 강조/오차 | z, k, gamma | coral (#ff6b6b) | "bright red/coral ..." |
| 매개변수/시간 | t, theta | purple (#c084fc) | "purple glow ..." |
| 보조 상수 | a, lambda | blue (#60a5fa) | "blue highlight ..." |
| 보조 상수 | b, sigma | green (#34d399) | "green accent ..." |

### visualPrompt 작성법 (수식 Scene 전용)
수학/기술 Scene에서는 어두운 네이비 배경에 빛나는 선과 도형으로 개념을 시각화합니다.
LaTeX 수식은 별도 PNG 오버레이로 상단에 자동 추가되므로, 배경 이미지는 개념의 비유적 시각화에 집중하세요.

프롬프트 구조: "On dark navy background, [개념의 비유적 시각화 with glowing teal/yellow elements], clean vector line style, portrait 9:16"

#### 수식 유형별 템플릿:
- 손실/오차 함수 (Loss): "On dark navy background, two geometric face outlines side by side — one in glowing teal for original and one in yellow for reconstruction, magnifying glass icon highlighting differences with bright lines, clean vector line style, portrait 9:16"
- 공식/방정식: "On dark navy background, glowing teal arrows showing [입력] transforming into [출력] through a series of illuminated steps, geometric shapes floating along the path, clean vector line style, portrait 9:16"
- 모델 구조: "On dark navy background, a schematic diagram with [N] glowing compartments for [Component1], [Component2], teal and yellow connection lines between them, clean vector line style, portrait 9:16"
- 벡터/행렬: "On dark navy background, glowing grid of teal and yellow cells arranged in rows and columns, bright arrows showing transformation direction, clean vector line style, portrait 9:16"
- 비교: "On dark navy background, two glowing diagrams [A] and [B] side by side connected by comparison arrows, key differences highlighted in yellow, similarities in teal, clean vector line style, portrait 9:16"
- 파이프라인/프로세스: "On dark navy background, a flowing pipeline of glowing teal nodes for [Step1], [Step2], [Step3] connected by yellow arrows, data particles moving along the path, clean vector line style, portrait 9:16"

### 예시

입력: "$L_{recon} = ||\\hat{M} - M||_1 + w_{lips}||V_{lips} - \\hat{V}_{lips}||^2$" (얼굴 복원 손실)
narrationText: "이 공식은 컴퓨터가 만든 얼굴이 진짜 얼굴과 얼마나 비슷한지 점수를 매기는 거예요. 특히 입술 부분은 배점이 더 높아요!"
visualPrompt: "On dark navy background, two geometric face outlines side by side — one glowing teal for the real face and one yellow for the generated face, a bright magnifying glass icon zooming into the lip area, score bar glowing at the bottom, clean vector line style, portrait 9:16"

입력: "$E = mc^2$" (질량-에너지 등가)
narrationText: "아주 작은 물질도 엄청난 에너지로 바뀔 수 있대요!"
visualPrompt: "On dark navy background, a small glowing teal sphere transforming into a massive radiating yellow energy burst, geometric light rays expanding outward, clean vector line style, portrait 9:16"

입력: "$\\sum_{i=1}^{n} x_i$" (합계)
narrationText: "여러 숫자를 장바구니에 하나씩 담아서 총합을 계산하는 거예요!"
visualPrompt: "On dark navy background, glowing teal numbered circles flowing one by one into a bright yellow collection container, running total displayed as a growing bar, clean vector line style, portrait 9:16"

### 금지 사항
- 밝은 배경, 파스텔 톤, 수채화 스타일 → 어두운 네이비 배경 + 빛나는 선 스타일 필수
- 수식의 본질과 무관한 비유 → 비유의 행위가 수식의 행위와 일치해야 함
- 추상적 묘사만 있는 visualPrompt ("Mathematical concept") → 구체적 비유 장면 필수
- 구분 안 되는 도형 나열 → 비유적 오브젝트를 teal/yellow 색상으로 구분`;
}

/**
 * 인문학 콘텐츠 가이드 (문학, 철학, 역사, 언어학 등)
 */
export function getHumanitiesContentGuide(): string {
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
- 역사적 사건: "Warm-toned cinematic scene, [시대 배경의 극적인 장면], atmospheric lighting with golden highlights, portrait 9:16"
- 철학/사상: "Warm-toned cinematic scene, [추상 개념을 의인화한 인물이 행동하는 장면], dramatic chiaroscuro lighting, portrait 9:16"
- 문학 장면: "Warm-toned cinematic scene, [작품 속 핵심 장면을 영화적으로 재해석], atmospheric depth and mood lighting, portrait 9:16"
- 인물 소개: "Warm-toned cinematic scene, a dramatic portrait of [인물 특징], holding [상징적 물건], atmospheric background with warm light, portrait 9:16"
- 시대 비교: "Warm-toned cinematic scene, split composition showing [시대A 장면] on left and [시대B 장면] on right, contrasting lighting tones, portrait 9:16"

### 예시

입력: "소크라테스의 '너 자신을 알라'"
narrationText: "소크라테스라는 할아버지가 있었는데요, 이 분이 사람들한테 맨날 이런 질문을 했대요. '너는 진짜 네가 뭘 좋아하는지 알아?' 우리도 가끔 뭘 먹을지도 못 정하잖아요?"
visualPrompt: "Warm-toned cinematic scene, a wise old man sitting under an olive tree in golden afternoon light, gesturing thoughtfully to a curious listener, thought bubbles floating above, atmospheric depth, portrait 9:16"

입력: "프랑스 혁명의 발단"
narrationText: "옛날 프랑스에서요, 왕이랑 귀족들은 매일 케이크를 먹었는데 일반 사람들은 빵도 못 먹었대요. 그래서 사람들이 화가 나서 '이건 아니잖아!' 하고 들고 일어난 거예요."
visualPrompt: "Warm-toned cinematic scene, a grand palace lit by chandeliers on one side contrasted with dark streets and empty tables on the other, dramatic lighting emphasizing the divide, portrait 9:16"

### 금지 사항
- 교과서 같은 딱딱한 설명 → 이야기 형식 필수
- 연도/이름 나열 → 맥락과 감정 중심
- 추상적 개념만 나열 → 구체적 상황/비유 필수`;
}

/**
 * 사회과학 콘텐츠 가이드 (경제학, 사회학, 정치학, 심리학 등)
 */
export function getSocialScienceContentGuide(): string {
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
- 경제 흐름: "Clean infographic style on dark background, a marketplace diagram with color-coded icons for [물건A] and [물건B], arrows and coin symbols showing economic flow, bright accent colors on dark surface, portrait 9:16"
- 사회 구조: "Clean infographic style on dark background, a layered diagram with color-coded sections for [그룹1], [그룹2], connecting pathways between them, clear visual hierarchy, portrait 9:16"
- 심리 현상: "Clean infographic style on dark background, a silhouette figure with [감정 표현], thought bubble diagram showing [내면 상태], color-coded emotional indicators, portrait 9:16"
- 통계/데이터: "Clean infographic style on dark background, [N] icon figures in a grid, [M] of them highlighted in a contrasting accent color to show proportion, clear data visualization, portrait 9:16"
- 제도/시스템: "Clean infographic style on dark background, a flowchart diagram showing institutional structure with color-coded roles, decision nodes and arrows, clear organizational hierarchy, portrait 9:16"

### 예시

입력: "인플레이션의 원리"
narrationText: "작년에 천 원이면 살 수 있던 과자가 올해는 천이백 원이 됐어요. 왜냐하면 돈이 너무 많아지면 돈의 가치가 떨어지거든요. 마치 반에서 스티커를 너무 많이 나눠주면 스티커가 별로 안 귀해지는 것처럼요!"
visualPrompt: "Clean infographic style on dark background, rising price tag icons with upward arrows, a coin symbol shrinking in size alongside growing money supply icons, contrasting red and green accent colors, portrait 9:16"

입력: "사회적 딜레마 (죄수의 딜레마)"
narrationText: "두 친구가 있는데요, 서로 도와주면 둘 다 좋은데, 한 명만 욕심 부리면 그 사람만 이득이에요. 그런데 둘 다 욕심 부리면? 둘 다 손해! 이게 바로 사회에서 일어나는 딜레마예요."
visualPrompt: "Clean infographic style on dark background, a 2x2 game theory matrix diagram with two silhouette figures at a fork, one path colored green for cooperation and another red for betrayal, outcome scores in each cell, portrait 9:16"

### 금지 사항
- 학술 용어만 나열 → 일상 비유 필수
- 숫자/통계 그대로 나열 → 비유적 표현으로 변환
- 현상만 설명 → "왜?"의 인과관계 설명 필수
- 가치판단/정치적 편향 → 중립적 설명 유지`;
}

/**
 * 바이럴 인게이지먼트 가이드 (v8.0)
 * Hook, Title, CTA를 자동으로 클릭/댓글 유도형으로 변환
 */
export function getViralEngagementGuide(topic: string): string {
  return `## 바이럴 인게이지먼트 전략 (필수 적용!)

### 1. Hook (첫 3초가 전부!) — 반드시 아래 5가지 중 하나로 시작
1. **반직관적 질문**: "이게 없으면 OO이 불가능하다면?" / "${topic}이 사실 OO이었다면?"
2. **충격 통계**: "99%가 모르는 사실" / "이것 하나가 OO을 바꿨다"
3. **일상 연결**: "당신이 매일 쓰는 OO, 사실 이것 덕분입니다"
4. **도발**: "이거 모르면 진짜 손해입니다" / "학교에서 안 가르치는 이유"
5. **스토리**: "OO년 전, 한 과학자가..." / "이 발견 뒤에 숨겨진 이야기"

**금지**: "오늘은 ○○에 대해 알아보겠습니다" / "안녕하세요" / "여러분" 같은 교과서형 시작
**첫 문장**: 20자 이내 (짧을수록 좋음)

### 2. Title (검색+클릭 최적화)
- **공식**: [일상 키워드] + [핵심 개념] + [감정 유발어]
- 좋은 예: "커피 한 잔에 숨은 적분" / "게임 캐릭터가 점프하는 공식" / "넷플릭스가 취향 아는 수학"
- 나쁜 예: "적분의 정의" / "행렬의 기초" / "확률론 입문" / "${topic} 설명"
- 30자 이내 필수
- **핵심**: 검색하지 않을 사람도 클릭하게 만드는 제목

### 3. Conclusion (댓글 유도 CTA — 필수!)
마지막 씬의 narrationText에 반드시 **댓글 유도 질문** 1개 포함:
- "이거 직접 계산해보셨나요? 댓글로 알려주세요!"
- "다음에 뭘 풀어볼까요?"
- "여기서 숨겨진 패턴 찾은 사람?"
- "이거 진짜야? 직접 확인해보세요!"
- "더 쉬운 설명 방법 아는 사람?"

**금지**: "구독과 좋아요 부탁드립니다" (이건 오히려 이탈 유발)
**핵심**: 시청자가 댓글을 **쓰고 싶게** 만드는 질문 (정답이 없는 개방형)`;
}

/**
 * v8.1: YouTube SEO 설명문 + 요약 생성 가이드
 * ContentPlanner가 에피소드 생성 시 description/summary 필드도 함께 생성하도록 지시
 */
export function getYouTubeMetadataGuide(topic: string, documentTitle: string): string {
  return `## YouTube 메타데이터 생성 (필수!)

### description (YouTube 설명문, 500-1500자)
에피소드 업로드 시 YouTube 설명란에 들어갈 SEO 최적화된 설명문을 생성하세요.

**구조 (반드시 이 순서로)**:
1. **첫 줄**: 이 영상이 무엇을 알려주는지 한 문장 (검색 결과에 노출)
2. **배운 내용**: 핵심 개념 3-5개를 이모지 불릿으로 나열
3. **시리즈 정보**: "${documentTitle}" 시리즈
4. **해시태그**: 관련 해시태그 3-5개

**좋은 예**:
"GPS가 정확한 이유? 바로 상대성이론 덕분입니다!

이 영상에서 배우는 것:
- 시간 지연이 GPS에 미치는 영향
- 아인슈타인이 예측한 현상이 일상에 작동하는 원리
- 나노초 오차가 만드는 수 킬로미터 차이

${documentTitle} 시리즈

#상대성이론 #GPS #물리학 #교육 #Shorts"

### summary (에피소드 요약, 100자)
다음 에피소드의 "이전 에피소드 요약"으로 사용됩니다.
이 에피소드에서 설명한 핵심 내용을 100자 이내로 요약하세요.

**출력 JSON에 추가 필드**:
- "description": "YouTube 설명문 (500-1500자)",
- "summary": "에피소드 요약 (100자)"`;
}

/**
 * 주된 콘텐츠 분야의 가이드 1개만 반환
 */
export function getContentTypeGuide(content: string, contentType: ContentType): string {
  const primaryType = detectPrimaryContentType(content, contentType);

  switch (primaryType) {
    case 'math_science': return getMathContentGuide();
    case 'humanities': return getHumanitiesContentGuide();
    case 'social_science': return getSocialScienceContentGuide();
    case 'empathy_lifestyle': return getEmpathyLifestyleGuide();
    default: return '';
  }
}

/**
 * 콘텐츠의 주된 분야 1개를 점수 기반으로 감지 (키워드 fallback)
 * contentType이 'auto'가 아니면 명시된 값을 그대로 반환
 */
export function detectPrimaryContentType(content: string, contentType: ContentType): ContentType | null {
  if (contentType !== 'auto') {
    return contentType;
  }

  const scores: Record<string, number> = { math_science: 0, humanities: 0, social_science: 0, empathy_lifestyle: 0 };

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

  const empathyKeywords = [
    '직장', '퇴근', '연봉', '이직', '상사', '야근', '번아웃',
    '습관', '루틴', '마인드셋', '목표', '자기계발', '동기부여',
    'burnout', 'work-life balance', 'self-improvement', 'habit',
    'mindset', 'productivity', 'motivation', 'career'
  ];
  for (const kw of empathyKeywords) {
    if (content.toLowerCase().includes(kw.toLowerCase())) scores.empathy_lifestyle++;
  }

  const maxScore = Math.max(scores.math_science, scores.humanities, scores.social_science, scores.empathy_lifestyle);
  if (maxScore < 2) return null;

  if (scores.math_science === maxScore) return 'math_science';
  if (scores.humanities === maxScore) return 'humanities';
  if (scores.empathy_lifestyle === maxScore) return 'empathy_lifestyle';
  return 'social_science';
}
