/**
 * Empathy Content Guide
 * viral_cat 스타일 전용 — 직장인 공감 + 자기계발 콘텐츠 가이드
 * (v10.0)
 */

/**
 * 공감형 바이럴 인게이지먼트 가이드
 * 기존 getViralEngagementGuide()의 공감/감성 버전
 */
export function getEmpathyViralGuide(topic: string): string {
  return `## 공감형 바이럴 인게이지먼트 전략 (필수 적용!)

### 1. Hook (첫 3초가 전부!) — 반드시 아래 5가지 중 하나로 시작
1. **공감 질문**: "퇴근하고 나면 아무것도 하기 싫죠?" / "월요일 아침, 알람 3번째에 겨우 일어났죠?"
2. **반전 통계**: "직장인 78%가 이걸 모릅니다" / "이것 하나로 연봉이 달라졌다는 사람들"
3. **일상 불만**: "${topic}... 솔직히 짜증나지 않나요?" / "또 야근이라고요?"
4. **자기계발 도발**: "습관 하나 바꿨을 뿐인데요" / "매일 10분이면 됩니다, 진짜로"
5. **위로 시작**: "오늘도 고생 많았어요" / "혼자만 힘든 거 아니에요"

**금지**: "안녕하세요" / "오늘은 ~에 대해" / "여러분" 같은 교과서형 시작
**첫 문장**: 20자 이내

### 2. Title (검색+클릭 최적화)
- **공식**: [직장인 키워드] + [핵심] + [감정 유발어]
- 좋은 예: "퇴근 후 루틴 하나로 인생 바뀜" / "월급 250이면 이건 꼭 알아야 해" / "야근 줄이는 진짜 방법"
- 나쁜 예: "시간관리법" / "자기계발 팁" / "직장생활 조언"
- 30자 이내 필수
- **핵심**: 공감이 먼저, 정보는 그 다음

### 3. Conclusion (댓글 유도 CTA — 필수!)
마지막 씬의 narrationText에 반드시 **댓글 유도 질문** 1개 포함:
- "나만 이런 거 아니죠? 댓글로 알려주세요"
- "어떻게 극복했는지 공유해주세요"
- "이거 진짜 효과 있었던 사람?"
- "여러분은 어떤 루틴이 도움 됐나요?"
- "퇴근 후에 보통 뭐 하세요?"

**금지**: "구독과 좋아요 부탁드립니다" (이건 오히려 이탈 유발)
**핵심**: "나도 할 말 있어!" 싶게 만드는 개방형 질문`;
}

/**
 * 직장인 공감 + 자기계발 콘텐츠 가이드
 * empathy_lifestyle contentType 전용
 */
export function getEmpathyLifestyleGuide(): string {
  return `## 직장인 공감 + 자기계발 콘텐츠 가이드

### 핵심 패턴: 공감 → 인사이트 → 실천
1. **공감**: "이런 경험 있으시죠?" — 시청자가 "맞아!" 하게 만들기
2. **인사이트**: "사실 이건 ~때문이에요" — 새로운 시각 제공
3. **실천**: "오늘부터 이것만 해보세요" — 바로 할 수 있는 1가지

### 말투 (필수)
- "~한 적 있으시죠?"
- "솔직히"
- "저도 그랬거든요"
- "근데 이거 알고 나서 달라졌어요"
- "한번 해보세요, 진짜로"
- "어차피 오늘도 퇴근은 해야 하잖아요"

### 카테고리별 접근

**직장생활**:
- 상사/동료 관계, 회의, 야근, 번아웃
- "상사가 또 이러면 이렇게 해보세요"
- 공감 + 실용적 대처법

**자기계발**:
- 습관, 루틴, 마인드셋, 목표 설정
- "하루 10분만 투자하면 되는 일"
- 작은 변화의 복리 효과 강조

**관계**:
- 연인, 친구, 가족, 직장 인간관계
- "사실 상대방은 이렇게 느끼고 있었어요"
- 심리학 인사이트 + 실천 팁

**돈**:
- 월급 관리, 소비 습관, 재테크 기초
- "월급 250만원으로도 할 수 있는 것"
- 현실적이고 즉시 적용 가능한 팁

### 톤 앤 매너
- 친구에게 진심으로 조언하듯
- 훈계 X, 강의 X → 경험 공유
- 유머 섞되 가볍지 않게
- "잘 될 거예요" 보다 "한번 해봐요, 저도 됐으니까"

### narrationText 작성법
- 한 문장에 하나의 메시지
- 20자 이내 짧은 문장 선호
- 감정 → 논리 → 행동 순서
- "왜?"보다 "어떻게?"에 집중

### visualPrompt 작성법
- 따뜻한 수채화 톤, 일상 장면
- 사무실, 카페, 지하철, 자취방, 공원
- 캐릭터(고양이)는 hook/conclusion만
- 교육 씬: 아이콘+인포그래픽 스타일 (따뜻한 톤)

### 금지 사항
- 교과서 같은 딱딱한 설명
- "~해야 합니다" 같은 명령형
- 비현실적인 조언 ("새벽 4시에 일어나세요")
- 자기계발 클리셰 ("성공한 사람들의 비밀")`;
}

/**
 * 고양이 캐릭터 + 일상 장면 visual prompt 예시
 * (getMathCharacterDomainExamples 패턴 대응)
 */
export function getViralCatDomainExamples(): string {
  return `
[VIRAL CAT STYLE - DOMAIN-SPECIFIC VISUAL EXAMPLES]

Work & Office:
- "In warm watercolor style, a cozy office desk with scattered papers, warm lamp light, coffee cup steaming, soft afternoon glow through window. Portrait 9:16."
- "In warm watercolor style, a subway train interior with city lights passing outside, warm reflections on glass, tired but peaceful atmosphere. Portrait 9:16."
- "In warm watercolor style, a meeting room scene with sticky notes on glass wall, soft fluorescent lighting, organized chaos feeling. Portrait 9:16."

Self-improvement & Habits:
- "In warm watercolor style, a cozy morning scene with sunrise through curtains, journal and pen on bedside table, warm golden light. Portrait 9:16."
- "In warm watercolor style, a home workout corner with yoga mat, motivational feeling, soft morning light, warm pastel tones. Portrait 9:16."
- "In warm watercolor style, a bookshelf in warm lamp light, cozy reading nook, blanket draped over chair, inviting atmosphere. Portrait 9:16."

Relationships & Emotions:
- "In warm watercolor style, two coffee cups across a cafe table, warm afternoon light, intimate conversation mood. Portrait 9:16."
- "In warm watercolor style, a phone screen with unread messages, late night room with soft lamp glow, contemplative atmosphere. Portrait 9:16."

Money & Finance:
- "In warm watercolor style, a piggy bank on desk next to calculator and notebook, warm home setting, hopeful feeling. Portrait 9:16."
- "In warm watercolor style, a grocery store scene with price tags, warm interior lighting, everyday budgeting visual. Portrait 9:16."

Cat Character Scenes (hook/conclusion only):
- "In warm Ghibli-style watercolor, a cute round cat with big eyes sitting at an office desk, looking tired but determined, warm lamp lighting, cozy atmosphere. Portrait 9:16."
- "In warm Ghibli-style watercolor, a cute round cat waving goodbye with a warm smile, sunset light through window, cozy room setting. Portrait 9:16."
- "In warm Ghibli-style watercolor, a cute round cat in a cafe, holding a tiny coffee cup, rainy day outside window, warm interior glow. Portrait 9:16."
`.trim();
}
