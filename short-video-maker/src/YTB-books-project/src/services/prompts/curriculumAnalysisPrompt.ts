/**
 * Curriculum Analysis Prompt Builder
 * ContentPlannerService.buildCurriculumAnalysisPrompt() 분리 (v7.0 리팩토링)
 */

export function buildCurriculumAnalysisPrompt(
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
