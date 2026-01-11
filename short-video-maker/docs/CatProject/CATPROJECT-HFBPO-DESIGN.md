# CatProject HFBPO Integration Design

## Overview

CatProject (InkMilk/why_cat 채널)에 HFBPO 강화학습을 적용하여 바이럴 가능성이 높은 고양이 커플 영상을 자동 생성하는 시스템.

```
┌─────────────────────────────────────────────────────────────────┐
│                     N8N (CatProject 워크플로우)                   │
│  - 매일 자동 에피소드 생성                                         │
│  - YouTube Analytics 피드백 수집                                  │
└─────────────┬───────────────────────────────┬───────────────────┘
              │                               │
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────────────┐
│   CatProject-HFBPO      │     │  ShortVideoMaker                │
│                         │     │                                 │
│  - Thompson Sampling    │     │  - VEO 3.1 영상 생성            │
│  - GPT 에피소드 생성     │     │  - YouTube 업로드               │
│  - 조합 최적화          │     │  - Google Sheets 기록           │
│                         │     │                                 │
│  combination_key:       │     │  characterReference:            │
│  hook|conflict|ending   │     │  cat-couple (kami, dalgi)       │
└─────────────────────────┘     └─────────────────────────────────┘
```

---

## YouTube Shorts Algorithm Insights (2024-2025)

### 핵심 성공 요인 (리서치 기반)

| 요인 | 중요도 | 설명 | HFBPO 적용 |
|------|--------|------|-----------|
| **Retention** | ⭐⭐⭐⭐⭐ | 90-100% 완료율 목표 (20초 이하) | ending_type |
| **Hook** | ⭐⭐⭐⭐⭐ | 첫 2-3초에 관심 끌기 | hook_type |
| **Rewatchability** | ⭐⭐⭐⭐ | 루프 가능한 콘텐츠 | ending_type |
| **Share** | ⭐⭐⭐⭐ | 공유 = 바이럴 신호 | conflict_type |
| **Engagement** | ⭐⭐⭐ | 좋아요, 댓글 | 전체 조합 |

### 고양이 영상 특화 요인

- **"funny cats" 제목** = 평균 24,000 뷰 (일반 펫 영상 4배)
- **calm → chaos 전환** = 알고리즘 최적화
- **유머 + 감동 동시 제공** = 공유율 증가
- **7-15초 최적** = 높은 completion rate

**Sources:**
- [YouTube Shorts Algorithm 2025 - VidIQ](https://vidiq.com/blog/post/youtube-shorts-algorithm/)
- [How to Create Viral Pet Content - Miracamp](https://www.miracamp.com/learn/content-creation/how-to-create-viral-pet-content-on-tiktok-instagram)
- [YouTube Shorts Algorithm Secrets 2025 - Boss Wallah](https://bosswallah.com/blog/creator-hub/youtube-shorts-algorithm-secrets-what-actually-works-in-2025/)

---

## CatProject HFBPO Modifiers

### Modifier 1: hook_type (첫 씬 훅)

**목표**: CTR 향상 + 첫 3초 retention

| Key | Description | 예시 장면 | 예상 효과 |
|-----|-------------|----------|----------|
| `shock_reveal` | 충격적 표정/상황 시작 | Kami 눈이 휘둥그레 | 높은 CTR |
| `curiosity_gap` | "이게 뭐야?" 궁금증 유발 | 이상한 물건 발견 | 재생 유지 |
| `action_mid` | 액션 중간부터 시작 | 도망치는 중 | 즉각 몰입 |
| `cute_trap` | 귀여움으로 낚시 | 졸린 고양이 | 공유 증가 |
| `dramatic_zoom` | 드라마틱 클로즈업 | 표정 확대 | 감정 연결 |

### Modifier 2: conflict_type (갈등 패턴)

**목표**: Engagement 향상 + 스토리 공감

| Key | Description | Kami 역할 | Dalgi 역할 | 예상 효과 |
|-----|-------------|----------|----------|----------|
| `kami_forgets` | Kami 깜빡함 | 실수 주인공 | 한숨 | 공감 |
| `dalgi_revenge` | Dalgi 복수 | 피해자 | 복수 주인공 | 카타르시스 |
| `couple_battle` | 커플 대결 | 고집 | 고집 | 갈등 재미 |
| `prank_backfire` | 장난 역풍 | 장난꾸러기 | 피해자 | 반전 |
| `jealousy_spiral` | 질투 전개 | 질투 | 당황 | 드라마 |
| `misunderstanding` | 오해 상황 | 오해 받음 | 오해 함 | 관계 공감 |

### Modifier 3: ending_type (결말 트리거)

**목표**: Rewatchability + Share 향상

| Key | Description | 분위기 | 예상 효과 |
|-----|-------------|--------|----------|
| `both_dumb` | 둘 다 바보됨 | 코미디 | 공감 + 웃음 |
| `twist_win` | 예상 못한 반전 | 서프라이즈 | 재시청 |
| `wholesome` | 따뜻한 화해 | 감동 | 공유 |
| `chaos_loop` | 혼돈 반복 | 카오스 | 루프 재생 |
| `revenge_sweet` | 복수 성공 | 카타르시스 | 만족감 |
| `cliffhanger` | 다음에 계속? | 궁금 | 구독 유도 |

---

## Combination Key Format

```
hook_type|conflict_type|ending_type
```

### 예시 조합

| Combination Key | 설명 | 예상 성과 |
|-----------------|------|----------|
| `shock_reveal\|kami_forgets\|both_dumb` | 깜빡한 Kami → 둘 다 바보됨 | 높은 공감 |
| `curiosity_gap\|prank_backfire\|twist_win` | 장난 역풍 → 반전 | 재시청 유도 |
| `cute_trap\|jealousy_spiral\|wholesome` | 질투 → 화해 | 공유율 증가 |
| `action_mid\|couple_battle\|chaos_loop` | 대결 → 혼돈 | 루프 재생 |

### 총 조합 수

- hook_type: 5개
- conflict_type: 6개
- ending_type: 6개
- **총 조합: 5 × 6 × 6 = 180개**

---

## Thompson Sampling 적용

### Beta Distribution 초기값

모든 조합 시작값:
```python
{
  "combination_key": {
    "alpha": 1,  # 성공 횟수
    "beta": 1    # 실패 횟수
  }
}
```

### Reward 계산 공식 (CatProject 최적화)

⚠️ **Critical: 정규화(Normalization) 필수!**

각 메트릭의 실제 범위가 다르므로 정규화 없이는 retention이 항상 지배적:
- retention: 0.3~0.9 (자연 범위)
- ctr: 0.02~0.15 (2%~15%)
- engagement: 0.03~0.15 (3%~15%)
- share_rate: 0.001~0.02 (0.1%~2%)
- subscribers: 0~50 (절대값)

```python
def normalize(value, min_val, max_val):
    """0~1 범위로 정규화"""
    return max(0, min(1, (value - min_val) / (max_val - min_val)))

# 정규화된 Reward 계산
reward = (
    0.30 * normalize(retention_rate, 0.30, 0.90) +     # 30%~90% → 0~1
    0.25 * normalize(ctr, 0.02, 0.15) +                # 2%~15% → 0~1
    0.20 * normalize(engagement_rate, 0.03, 0.15) +    # 3%~15% → 0~1
    0.15 * normalize(share_rate, 0.001, 0.02) +        # 0.1%~2% → 0~1
    0.10 * normalize(subscribers_gained, 0, 50)        # 0~50명 → 0~1
)
```

### 다중 시점 보상 (Multi-horizon Reward)

⚠️ **Critical: 6시간 단일 수집은 바이럴 잠재력 무시!**

YouTube Shorts 바이럴 패턴:
- 0-6시간: 초기 테스트 (15%)
- 6-24시간: 알고리즘 판단 (25%)
- 1-3일: 확산 or 침체 결정 (35%)

```python
# 다중 시점 보상 (권장)
final_reward = (
    0.20 * reward_at_6h +    # 초기 반응 (hook 효과 측정)
    0.40 * reward_at_24h +   # 중기 반응 (retention 효과)
    0.40 * reward_at_72h     # 바이럴 판단 (share/growth 효과)
)
```

**vs 기존 HFBPO:**
- retention 비중 ↑ (0.40 → 0.30 but CTR 추가)
- share 비중 신규 추가 (바이럴 중요)
- 정규화 추가 (공정한 가중치 적용)

### 탐색-활용 (Explore-Exploit)

⚠️ **Critical: 계층적 탐색의 상호작용 문제**

계층적 Thompson Sampling의 위험:
- Phase 1에서 hook_type "cute_trap" 탈락 시
- "cute_trap + kami_forgets + both_dumb" 최고 조합을 영원히 놓칠 수 있음
- hook|conflict|ending 사이에 **상호작용 효과**가 있기 때문

**해결책: 하이브리드 탐색 전략**

```python
# 처음 30회: 완전 랜덤 탐색 (모든 조합 최소 1회 기회)
if total_trials < 30:
    combination = random.choice(all_180_combinations)

# 31-60회: 각 modifier별 독립 탐색
elif total_trials < 60:
    hook = thompson_sample(hook_bandits)
    conflict = thompson_sample(conflict_bandits)
    ending = thompson_sample(ending_bandits)
    combination = f"{hook}|{conflict}|{ending}"

# 61회 이후: 검증된 조합 중심 Thompson Sampling
else:
    # 상위 20% 조합 집중 + 10% 탐색 유지
    if random.random() < 0.1:
        combination = random.choice(all_180_combinations)  # 탐색
    else:
        combination = thompson_sample(top_combinations)    # 활용
```

**GPT 출력 분산 제어:**
```python
# 같은 조합 = 같은 시드 → 비교 가능한 에피소드
response = openai.chat.completions.create(
    model="gpt-4o",
    temperature=0.4,  # 낮은 창의성 (일관성 ↑)
    seed=hash(combination_key) % 2147483647  # 조합별 고정 시드
)
```

---

## API Design

### POST /generate-cat

**Request:**
```json
{
  "series": "daily_life",
  "theme": "커플 일상"
}
```

**Response:**
```json
{
  "combination_key": "shock_reveal|kami_forgets|both_dumb",
  "hook_type": "shock_reveal",
  "conflict_type": "kami_forgets",
  "ending_type": "both_dumb",
  "estimated_reward": 0.78,
  "episode": {
    "titleText": {
      "ko": "아... 또 깜빡했다",
      "en": "Oops... Forgot again"
    },
    "scenes": [
      {
        "characterIds": ["kami"],
        "text": "Something's not right...",
        "textEnglish": "Something's not right...",
        "scenePrompt": "Adorable black cat wearing light blue t-shirt with wide shocked eyes...",
        "duration": 8
      }
    ],
    "soundEffects": [
      { "type": "preset", "value": "GASP", "startTime": 0.5, "volume": 0.35 }
    ],
    "youtubeTitle": "Forgot Again... #shorts #cat #funny",
    "youtubeDescription": "Kami forgets something important..."
  }
}
```

### POST /reward-cat

**Request:**
```json
{
  "combination_key": "shock_reveal|kami_forgets|both_dumb",
  "reward": 0.85,
  "metrics": {
    "views": 15000,
    "retention_rate": 0.72,
    "likes": 1200,
    "comments": 85,
    "shares": 45,
    "subscribers_gained": 12
  }
}
```

---

## N8N Workflow Integration

### Workflow 1: 에피소드 생성 (10:00)

```
Schedule Trigger (10:00)
    ↓
HTTP Request → CatProject-HFBPO /generate-cat
    ↓
Extract episode JSON
    ↓
Transform to consistent-shorts format
    ↓
HTTP Request → ShortVideoMaker /api/video/consistent-shorts
    { hfbpo: { combinationKey: "..." } }
    ↓
Slack/Discord 알림
```

### Workflow 2: 보상 업데이트 (18:00)

```
Schedule Trigger (18:00)
    ↓
HTTP Request → ShortVideoMaker /api/sheet/videos?rewardSent=false&minAge=6h
    ↓
Loop each video with combinationKey
    ↓
HTTP Request → YouTube Analytics
    ↓
Calculate reward (retention + CTR + engagement + share + growth)
    ↓
HTTP Request → CatProject-HFBPO /reward-cat
    ↓
HTTP Request → ShortVideoMaker /api/sheet/videos/:id/reward-sent
```

---

## File Structure

```
HFBPO/
├── data/
│   ├── graph_output/           # 기존 여행 영상용
│   └── catproject/             # 🆕 CatProject용
│       ├── hook_type_to_idx.json
│       ├── conflict_type_to_idx.json
│       ├── ending_type_to_idx.json
│       ├── rapo_bandit_state_cat.json
│       └── gpt_prompts/
│           ├── system_message.md
│           └── user_message_template.md
│
├── src/
│   ├── api/DK/
│   │   └── main.py            # /generate-cat, /reward-cat 추가
│   │
│   ├── generators/
│   │   └── cat_episode_generator.py  # 🆕 GPT 에피소드 생성
│   │
│   └── core/
│       └── rl_agent.py        # CatProjectBandit 클래스 추가
```

---

## Implementation Phases

### Phase 1: 데이터 구조 (1일)
- [ ] `catproject/` 폴더 생성
- [ ] modifier JSON 파일 생성
- [ ] 초기 bandit state 파일 생성

### Phase 2: API 개발 (2일)
- [ ] `/generate-cat` 엔드포인트
- [ ] `/reward-cat` 엔드포인트
- [ ] GPT 에피소드 생성 로직

### Phase 3: N8N 연동 (1일)
- [ ] 에피소드 생성 워크플로우
- [ ] 보상 업데이트 워크플로우
- [ ] short-video-maker 연동 테스트

### Phase 4: 모니터링 (지속)
- [ ] 조합별 성과 대시보드
- [ ] A/B 테스트 결과 분석
- [ ] modifier 추가/제거

---

## Expected Outcomes

### 단기 (1개월)
- 180개 조합 중 상위 20개 발견
- 평균 조회수 20% 향상

### 중기 (3개월)
- 최적 조합 패턴 확립
- 바이럴 영상 재현 가능성 ↑

### 장기 (6개월)
- 자동화된 콘텐츠 최적화 시스템
- 채널 성장률 안정화

---

## 🚀 Business Optimization Strategy

### 문제점: 180개 조합 수렴 시간

```
기존 방식:
- 180개 조합 × 최소 5회 시도 = 900회
- 하루 1개 영상 = 900일 (2.5년)
- 하루 3개 영상 = 300일 (10개월)
→ 너무 느림! 채널 성장 기회 놓침
```

---

### 해결책 1: 계층적 Thompson Sampling

**3단계 계층적 탐색으로 2-3개월 내 최적화:**

```
┌─────────────────────────────────────────────────────────────┐
│  Phase 1 (1-2주): hook_type 5개만 테스트                      │
│  - 매일 1-2개씩 → 각 hook 2-3회 시도                          │
│  - CTR 기준 상위 2-3개 선별                                   │
│  - 결과: shock_reveal, curiosity_gap, cute_trap 승자         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Phase 2 (3-4주): 상위 hook × conflict_type 테스트            │
│  - 3 hooks × 6 conflicts = 18개 조합                         │
│  - 2주 → 각 조합 1-2회 시도                                   │
│  - 결과: 상위 6-9개 조합 발견                                  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Phase 3 (5-8주): 상위 조합 × ending_type 본격 테스트          │
│  - 9 조합 × 6 endings = 54개 (vs flat 180개)                 │
│  - Thompson Sampling 본격 가동                               │
│  - 결과: 최적 10-15개 조합 확정                               │
└─────────────────────────────────────────────────────────────┘

✅ 기대 효과: 2-3개월 만에 최적 조합 발견 (기존 2.5년 → 90% 단축)
```

---

### 해결책 2: 채널 성장 단계별 Reward 가중치

**YouTube 수익화 조건 기반 전략적 가중치 조정:**

| 단계 | 구독자 기준 | retention | ctr | engagement | share | growth |
|------|------------|-----------|-----|------------|-------|--------|
| **Phase A (초기)** | < 1,000 | 20% | 5% | 15% | 25% | **35%** |
| **Phase B (성장)** | 1,000 ~ 100,000 | 30% | 10% | 20% | **25%** | 15% |
| **Phase C (안정)** | > 100,000 | **35%** | 25% | 20% | 15% | 5% |

```python
# 채널 상태 자동 감지 후 가중치 전환
def get_reward_weights(subscriber_count: int):
    if subscriber_count < 1000:
        # 초기: 구독자 1000명 돌파 집중
        return {"growth": 0.35, "share": 0.25, "retention": 0.20, "engagement": 0.15, "ctr": 0.05}
    elif subscriber_count < 100000:
        # 성장기: 바이럴 + 조회수 집중 (수익화 조건 충족)
        return {"retention": 0.30, "share": 0.25, "engagement": 0.20, "growth": 0.15, "ctr": 0.10}
    else:
        # 안정기: 시청 시간 + 광고 수익 최적화
        return {"retention": 0.35, "ctr": 0.25, "engagement": 0.20, "share": 0.15, "growth": 0.05}
```

---

### 해결책 3: 주간 배치 생산 전략

**API 비용 절감 + 학습 효율 극대화:**

```
┌─────────────────────────────────────────────────────────────┐
│  월요일 (생성일)                                              │
│  ├─ 09:00  N8N → HFBPO에서 7개 조합 배치 샘플링              │
│  ├─ 09:05  GPT 배치 호출로 7개 에피소드 한번에 생성            │
│  ├─ 09:30  ShortVideoMaker 배치 렌더링 시작                  │
│  └─ 12:00  7개 영상 완료 → GCS 저장                          │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  화~일 (업로드 스케줄링)                                       │
│  ├─ 12:00 점심시간 업로드 (회사원 타겟)                        │
│  ├─ 18:00 퇴근시간 업로드 (직장인 타겟)                        │
│  └─ 하루 1개씩 최적 시간대 분산 업로드                         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  다음 월요일 (보상 수집)                                       │
│  ├─ 08:00  7개 영상 6일치 Analytics 배치 수집                 │
│  ├─ 08:10  HFBPO /batch-reward 배치 업데이트                 │
│  └─ 08:15  Thompson Sampling 상태 갱신 완료                  │
└─────────────────────────────────────────────────────────────┘

✅ 비용 절감: GPT API 배치 호출로 약 20% 비용 감소
✅ 학습 속도: 주 7개 → 월 28개 → 180개 조합 6-7개월
```

---

### 해결책 4: 시리즈 다각화 (콘텐츠 피로도 방지)

**같은 캐릭터 반복 → 구독자 피로도 문제 해결:**

```
┌─────────────────────────────────────────────────────────────┐
│  시리즈 A: "커플 일상" (메인)                                  │
│  ├─ 현재 HFBPO 180개 조합 적용                               │
│  ├─ 주 4-5회 업로드                                          │
│  └─ Kami + Dalgi 함께 등장                                   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  시리즈 B: "까미 혼자" (스핀오프)                               │
│  ├─ Kami 솔로 에피소드 (바보 행동 집중)                        │
│  ├─ 주 1회 업로드 (variety)                                  │
│  └─ HFBPO 별도 조합: solo_hook|solo_situation|solo_ending    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  시리즈 C: "특별 에피소드" (이벤트)                             │
│  ├─ 시즌/명절 테마 (크리스마스, 설날, 발렌타인 등)              │
│  ├─ 월 1-2회 업로드                                          │
│  └─ 트렌드 기반 훅 (알고리즘 fresh signal)                    │
└─────────────────────────────────────────────────────────────┘

✅ 콘텐츠 다양성: 구독자 피로도 방지
✅ 알고리즘 최적화: 채널 컨셉 확장 + fresh signal
✅ 데이터 수집: 시리즈별 최적 조합 분리 학습
```

**API 확장: series 파라미터 추가**

```json
{
  "series": "daily_life",     // daily_life | kami_solo | special
  "theme": "커플 일상"
}
```

---

### 비즈니스 최적화 후 예상 타임라인

| 기간 | 기존 예상 | 최적화 후 | 개선율 |
|------|----------|----------|--------|
| 최적 조합 발견 | 2.5년 | 2-3개월 | **90% 단축** |
| 구독자 1000명 | 6개월 | 2개월 | **66% 단축** |
| 수익화 조건 충족 | 1년+ | 4-5개월 | **60% 단축** |
| 월 평균 조회수 | 10만 | 50만+ | **5배 증가** |

---

### 빠른 검증 A/B 테스트 (첫 2주)

**HFBPO 본격 적용 전 빠른 가설 검증:**

```
Week 1: hook_type 검증
├─ Day 1-2: shock_reveal vs curiosity_gap (2개씩)
├─ Day 3-4: cute_trap vs action_mid (2개씩)
├─ Day 5-7: dramatic_zoom + 혼합 테스트
└─ 결과: CTR 기준 상위 3개 선별

Week 2: 상위 hook × conflict 검증
├─ 상위 3 hooks × 6 conflicts = 18개 조합 테스트
├─ 하루 2-3개씩 배치 업로드
└─ 결과: Engagement 기준 상위 6개 조합 확정

Week 3~: HFBPO 본격 적용
├─ 검증된 54개 조합 중심 Thompson Sampling
├─ 계층적 탐색으로 빠른 수렴
└─ 2개월 내 최적 10-15개 조합 확정
```

---

## ⚠️ Critical Issues Summary (검토 결과)

### 반드시 수정해야 할 문제 (Critical)

| # | 문제 | 영향 | 해결책 | 상태 |
|---|------|------|--------|------|
| 1 | **Reward 정규화 누락** | Thompson Sampling 편향 학습 | min-max 정규화 필수 | ✅ 문서 반영 |
| 2 | **6시간 단일 보상 수집** | 바이럴 잠재력 무시 | 다중 시점 보상 (6h/24h/72h) | ✅ 문서 반영 |
| 3 | **계층적 탐색 상호작용 무시** | 최적 조합 놓칠 위험 | 하이브리드 탐색 전략 | ✅ 문서 반영 |
| 4 | **GPT 출력 분산** | 학습 신호 노이즈 | temperature↓ + seed 고정 | ✅ 문서 반영 |

### 권장 수정사항 (Important)

| # | 문제 | 해결책 | 상태 |
|---|------|--------|------|
| 5 | 조합 호환성 문제 (action_mid + kami_forgets 등) | 호환성 매트릭스 사전 필터링 | 📋 구현 필요 |
| 6 | Cold Start 문제 | 사전 확률 주입 (Informative Prior) | 📋 구현 필요 |
| 7 | 외부 변수 혼란 (업로드 시간/요일) | 실험 설계 통제 | 📋 N8N 설정 |
| 8 | ending_type "cliffhanger" 부적합 | 시리즈 전용으로 분리 또는 제거 | 📋 검토 필요 |

### 조합 호환성 매트릭스 (참고)

```
180개 중 어색한 조합 약 20-30%:

hook_type        conflict_type     호환성
─────────────────────────────────────────
action_mid    ×  kami_forgets      △ (정적 갈등과 액션 훅 불일치)
action_mid    ×  misunderstanding  △ (오해 상황에 액션 시작 어색)
cute_trap     ×  dalgi_revenge     △ (귀여움 훅과 복수 톤 불일치)
cute_trap     ×  couple_battle     △ (귀여움 훅과 대결 톤 불일치)

권장: GPT에게 조합 거부 권한 부여 또는 사전 필터링
```

### 검토 후 수정된 예상 타임라인

| 지표 | 초기 예상 | 1차 최적화 | **2차 검토 후** |
|------|----------|-----------|----------------|
| 최적 조합 발견 | 2.5년 | 2-3개월 | **3-4개월** (더 보수적) |
| 첫 바이럴 영상 | 6개월 | 1개월 | **2개월** (다중 시점 보상 필요) |
| 안정적 성과 | 1년 | 4-5개월 | **5-6개월** (GPT 분산 고려) |

**핵심 인사이트:**
> 빠른 수렴보다 **정확한 학습**이 더 중요. 잘못된 신호로 학습하면 오히려 채널 성장에 해가 됨.

---

Last Updated: 2026-01-08 (v2 - Critical Review 반영)
