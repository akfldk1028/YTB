/**
 * Entity Episode Prompt Builder
 * ContentPlannerService.buildEntityEpisodePrompt() 분리 (v7.0 리팩토링)
 */

import type { ContentPlannerConfig } from '../ContentPlannerService';
import { getAudienceGuide, getELI5Rules, getContentTypeGuide, getViralEngagementGuide, getYouTubeMetadataGuide } from './contentGuides';

type ConfigSlice = Pick<
  Required<Omit<ContentPlannerConfig, 'apiKey' | 'visualPromptStyleGuide' | 'engagementGuideOverride'>>,
  'style' | 'maxScenesPerShort' | 'audienceLevel' | 'useELI5Style' | 'contentType'
> & { engagementGuideOverride?: string };

export function buildEntityEpisodePrompt(
  config: ConfigSlice,
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
  const style = config.style;
  const maxScenes = config.maxScenesPerShort;
  const audienceLevel = config.audienceLevel;

  const audienceGuide = getAudienceGuide(audienceLevel);
  const eli5Rules = config.useELI5Style ? getELI5Rules() : '';
  const contentGuide = getContentTypeGuide(content, config.contentType);
  const viralGuide = config.engagementGuideOverride || getViralEngagementGuide(cluster.mainEntity);
  const youtubeMetadataGuide = getYouTubeMetadataGuide(cluster.mainEntity, fileName);

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

${viralGuide}

${youtubeMetadataGuide}

## 이번 에피소드에서 설명할 것
1. ${cluster.mainEntity}이(가) 무엇인지
2. 왜 중요한지 (문제 해결)
3. 어떻게 작동하는지 (비유 사용)
4. 관련 개념과의 연결: ${cluster.relatedEntities.slice(0, 2).join(', ')}

## 출력 형식 (JSON)
{
  "title": "일상 연결형 클릭 유도 제목 (30자 이내)",
  "hook": "반직관적 질문 또는 충격 통계 (20자 이내)",
  "summary": "에피소드 요약 (100자)",
  "description": "YouTube 설명문 (500-1500자)",
  "scenes": [
    {
      "sceneIndex": 0,
      "sceneType": "hook",
      "narrationText": "쉬운 한국어 나레이션 (비유와 예시 포함)",
      "visualPrompt": "Describe the scene about ${cluster.mainEntity} in ${style} style, portrait 9:16",
      "durationHint": 5
    }
  ]
}

## 주의사항
1. 첫 Scene은 반드시 hook — 반직관적 질문/충격 통계/일상 연결 (교과서형 시작 금지!)
2. 마지막 Scene은 댓글 유도 CTA (바이럴 가이드 참조) + 다음 에피소드 유도
3. "${cluster.mainEntity}" 개념을 비유로 설명 필수
4. 전문 용어는 반드시 쉬운 설명 추가
5. JSON만 출력`;
}
