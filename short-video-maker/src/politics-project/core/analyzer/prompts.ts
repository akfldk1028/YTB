/**
 * AI Prompt Templates
 *
 * 하이라이트 분석용 프롬프트 템플릿
 */

export const HIGHLIGHT_ANALYSIS_PROMPT = `
당신은 YouTube 영상에서 Shorts에 적합한 하이라이트 구간을 찾는 전문가입니다.

## 입력 정보
- 영상 제목: {{title}}
- 전체 길이: {{duration}}초
- 자막 내용:
{{subtitleText}}

## 분석 기준 (우선순위)
1. 핵심 발언/명언 - 인용할 만한 강한 발언, 결론
2. 긴장감/갈등 - 논쟁, 대립, 감정 고조 순간
3. 반전/놀라운 정보 - 시청자 호기심 유발
4. 실용적 팁 - 바로 적용 가능한 정보

## 필수 규칙 (반드시 준수)
- **반드시 {{maxHighlights}}개 이상의 하이라이트를 선정하세요**
- 각 하이라이트는 30-60초 길이
- 구간이 서로 겹치지 않아야 함
- 영상 전체에서 고르게 분포
- startSec, endSec은 자막의 실제 타임스탬프 [MM:SS] 기준으로 초 단위로 변환

## 출력 예시
{
  "highlights": [
    { "startSec": 120, "endSec": 165, "title": "핵심 발언", "reason": "주요 메시지", "score": 9 },
    { "startSec": 300, "endSec": 345, "title": "반전 포인트", "reason": "놀라운 정보", "score": 8 },
    { "startSec": 500, "endSec": 550, "title": "결론", "reason": "요약 및 결론", "score": 7 }
  ]
}
`;

export const TITLE_GENERATION_PROMPT = `
다음 영상 하이라이트에 어울리는 Shorts 제목을 만들어주세요.

## 하이라이트 정보
- 원본 제목: {{originalTitle}}
- 하이라이트 제목: {{highlightTitle}}
- 구간: {{startSec}}초 ~ {{endSec}}초
- 내용 요약: {{reason}}

## 규칙
- 30자 이내
- 호기심 유발
- 이모지 1-2개 포함 가능
- 클릭 유도 문구

## 출력 형식
{
  "title": "생성된 제목"
}
`;

/**
 * 프롬프트 템플릿에 변수 적용
 */
export function applyTemplate(
  template: string,
  variables: Record<string, string | number>
): string {
  let result = template;

  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(
      new RegExp(`{{${key}}}`, 'g'),
      String(value)
    );
  }

  return result;
}
