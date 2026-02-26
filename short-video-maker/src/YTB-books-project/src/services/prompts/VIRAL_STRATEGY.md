# Viral Engagement Strategy (v8.0)

## Overview

ContentPlanner AI가 에피소드를 생성할 때 자동으로 바이럴 최적화된 Hook/Title/CTA를 만들도록 프롬프트 시스템에 주입.

**n8n 패턴**: `getViralEngagementGuide()` 1개 함수 = 1개 노드. 모든 프롬프트 빌더가 이 함수를 import. 수정 시 `contentGuides.ts` 1곳만 변경하면 3개 프롬프트에 자동 전파.

---

## Architecture

```
contentGuides.ts
  └── getViralEngagementGuide(topic)  ← 바이럴 가이드 (단일 소스)
        ↓ import
  ┌─────────────────────────────────────────┐
  │ detailedEpisodePrompt.ts    (일반 에피소드)│
  │ formulaCentricPrompts.ts    (수식 에피소드)│
  │ entityEpisodePrompt.ts      (엔티티 에피소드)│
  └─────────────────────────────────────────┘
```

---

## 3 Core Changes

### 1. Hook (첫 3초)

| Before | After |
|--------|-------|
| "시청자 호기심 자극하는 질문" | 5가지 공식 중 택1 강제 |
| 교과서형 허용 | "오늘은 ~에 대해" 금지 |
| 길이 제한 없음 | 20자 이내 |

**5가지 Hook 공식**:
1. 반직관적 질문: "이게 없으면 GPS가 안 된다면?"
2. 충격 통계: "99%가 모르는 사실"
3. 일상 연결: "매일 쓰는 OO, 이것 덕분"
4. 도발: "학교에서 안 가르치는 이유"
5. 스토리: "OO년 전, 한 과학자가..."

### 2. Title (검색+클릭)

| Before | After |
|--------|-------|
| "에피소드 제목 (호기심 유발)" | [일상 키워드]+[핵심]+[감정 유발어] |
| 50자 이내 | 30자 이내 |
| "적분의 정의" 허용 | "커피 한 잔에 숨은 적분" 강제 |

### 3. Conclusion CTA (댓글 유도)

| Before | After |
|--------|-------|
| "오늘 배운 것 + 다음 예고" | 댓글 유도 질문 필수 포함 |
| "구독/좋아요" 허용 | 구독 멘트 금지 |
| 요약 중심 | 개방형 질문 + 다음 예고 |

---

## Modified Files

| File | Change |
|------|--------|
| `contentGuides.ts` | `getViralEngagementGuide()` 함수 추가 |
| `index.ts` | export 추가 |
| `detailedEpisodePrompt.ts` | viralGuide import + Hook/Title/Conclusion 교체 |
| `formulaCentricPrompts.ts` | viralGuide import + Hook/Title/Conclusion 교체 |
| `entityEpisodePrompt.ts` | viralGuide import + Hook/Title/Conclusion 교체 |

---

## How to Customize

바이럴 전략 변경 시 **`contentGuides.ts`의 `getViralEngagementGuide()` 함수만 수정**하면 됨.

```typescript
// contentGuides.ts
export function getViralEngagementGuide(topic: string): string {
  // 이 함수 내용만 바꾸면 모든 프롬프트에 자동 반영
  return `...`;
}
```

---

## Expected Impact

| Metric | Before | Expected |
|--------|--------|----------|
| Hook retention (3초) | ~40% | 70%+ |
| CTR (제목 클릭률) | ~2% | 4.5%+ |
| Comment rate | ~0.1% | 1%+ |
| Watch time | 15-20초 | 35-45초 |

Based on YouTube Shorts algorithm research (2026):
- 질문형 hook: CTR 2.3x vs 서술형
- 일상 연결 제목: 검색 노출 + 추천 알고리즘 부스트
- 댓글 유도: YouTube가 "핫 콘텐츠"로 판단 → 더 많은 노출
