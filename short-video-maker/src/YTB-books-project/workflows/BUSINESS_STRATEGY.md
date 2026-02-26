# YTB Business Strategy: Shorts First → Long-Form Revenue

> **확정일**: 2026-02-09
> **목표**: 작지만 무조건 수익이 자동으로 나게 하는 것
> **Graphiti**: group_id `ytb-project`에 기록됨

---

## Phase 1: Shorts 성장 엔진 (현재 → 3개월)

### 목표
- 구독자 1,000명 + 조회수 누적 확보
- YouTube 알고리즘에 채널 각인
- 콘텐츠 품질 검증 + 피드백 루프

### 전략
- **빈도**: 주 3-5개 Shorts 업로드
- **콘텐츠**: 책/논문 기반 교육 Shorts (현재 파이프라인)
- **바이럴 최적화**: v8.0 적용됨 (반직관적 hook, 일상 연결 제목, 댓글 유도 CTA)
- **핵심 지표**: Shorts는 74%가 비구독자에게 노출됨 (디스커버리 엔진)

### 현재 파이프라인 (그대로 사용)
```
Neo4j (책/논문 데이터)
  → ContentPlannerService (에피소드 기획 + 바이럴 hook/CTA)
  → SceneImageService + NanoBanana (이미지 생성)
  → BooksVideoService + FFmpeg (영상 합성 + 자막)
  → YouTube Upload (Shorts)
```

### AI 슬롭 회피 전략
| 위험 요소 | 현재 상태 | 완화 조치 |
|-----------|----------|----------|
| TTS 음성 | Gemini TTS (고품질) | 자연스러운 한국어, 캐릭터 음성 |
| AI 이미지 | NanoBanana (교육 일러스트) | 교육적 가치 명확, 슬라이드쇼 아님 |
| 자동 생성 | 100% 자동 | 에피소드 기획은 수동 선별 (approved 상태) |
| 포맷 반복 | 동일 템플릿 | 씬 타입별 다른 전략 (hook/formula/education) |
| 공시 의무 | 미적용 | YouTube AI 라벨 필수 설정 |

### Shorts 수익 다각화 (광고 외)

> **핵심**: Shorts 광고 RPM은 전체 수익의 10-20%에 불과. 나머지 80%는 다른 수익원에서 발생.

| 수익원 | 1M 조회당 수익 | 필요 조건 | 타임라인 |
|--------|--------------|----------|---------|
| **광고 수익** | $25-45 | YPP 가입 | Phase 1 이후 |
| **Super Thanks** | $50-200 | 구독자 500 | 1-2개월 |
| **Shopping Affiliate** | $200-800 (광고의 4-8x) | 구독자 10K | Phase 2 |
| **멤버십** | 월 $100-500 | 구독자 500 | 2-3개월 |
| **브랜드 딜** | 총 수익의 60-80% | 니치 권위 | Phase 3 |

#### 볼륨 플레이 모델 (우리 파이프라인의 핵심 강점)

```
자동화 = 볼륨 우위
  수동 채널: 주 3-5개 (한계)
  우리 파이프라인: 주 15-20개 (자동)

월 100개 Shorts × 평균 5만 조회 = 월 500만 조회
  → 광고: $125-225
  → Super Thanks: $250-1,000
  → 향후 Shopping: $1,000-4,000
  → 합산: ~$2,000/월 (보수적)
```

#### 교육 니치 프리미엄

- 교육 채널 RPM은 일반 대비 **2-3x 높음** (광고주 프리미엄)
- 수학/과학 니치: 월 $6,000-$6,500 달성 사례 존재
- AI 슬롭 면제 가능성: 교육적 가치 명확 + 책/논문 원본 기반 = 독창성 인정

#### 수익화 타임라인

| 시점 | 전략 | 예상 월수익 |
|------|------|-----------|
| 1-3개월 | Shorts 볼륨 + Super Thanks 활성화 | $50-200 |
| 3-6개월 | 볼륨 확대 + 멤버십 + 롱폼 시작 | $300-800 |
| 6-12개월 | 전 수익원 활성화 + 브랜드 딜 | $2,000-5,000 |
| 12개월+ | 니치 권위 확보 + Shopping Affiliate | $5,000-7,000 |

---

## Phase 2: 롱폼 컴필레이션 (3개월 후~)

### 핵심 아이디어
**관련 숏츠 N개를 합쳐서 8-15분 롱폼 영상 자동 생성**

### 왜 이게 돈이 되는가

| 항목 | Shorts | Long-form |
|------|--------|-----------|
| RPM | $0.01-$0.06 | **$2-$11** |
| 배수 차이 | 1x | **50-200x** |
| 광고 삽입 | 숏츠 풀 공유 | **8분+ = 미드롤 광고** |
| 시청 시간 | 카운트 안 됨 | **YPP 4000시간에 기여** |

### 롱폼 구조

```
[인트로 - 5초]
  "이 시리즈에서는 {주제}를 처음부터 끝까지 알아봅니다"

[에피소드 1 - Shorts 원본 40-60초]
  (그대로 또는 약간 편집)

[트랜지션 - 2초]
  xfade 또는 간단한 화면 전환

[에피소드 2 - Shorts 원본 40-60초]

[트랜지션 - 2초]

... (8-12개 에피소드)

[아웃트로 - 10초]
  "다음 시리즈 예고 + 구독 유도"
```

**예상 길이**: 에피소드 10개 x 50초 = ~8분 30초 (미드롤 광고 가능)

### 기술 구현

#### 이미 있는 것 (코드 변경 불필요)
- `VideoConcat.concatVideos()` — 비디오 N개 합치기 (re-encoding)
- `VideoConcat.concatVideosWithXfade()` — xfade 트랜지션 포함 합치기
- `AudioProcessor.concatAudiosWithCrossfade()` — 오디오 크로스페이드
- Neo4j에 에피소드 순서/시리즈 정보 저장됨

#### 새로 만들어야 하는 것

| 컴포넌트 | 위치 | 역할 |
|---------|------|------|
| `LongFormCompiler` | `src/YTB-books-project/src/services/` | Shorts MP4 N개 → 롱폼 MP4 |
| `/api/books/compile-longform` | `BooksRouter.ts` | API 엔드포인트 |
| 인트로/아웃트로 생성 | `LongFormCompiler` | TTS + 이미지로 인트로/아웃트로 |
| YouTube 설명 생성 | `LongFormCompiler` | 타임스탬프 + 에피소드별 챕터 |

#### LongFormCompiler 설계 (n8n 패턴)

```typescript
// Input
interface LongFormInput {
  documentId: string;           // 문서 ID
  episodeIds: string[];         // 합칠 에피소드 ID 목록
  title: string;                // 롱폼 제목
  introText?: string;           // 인트로 나레이션
  outroText?: string;           // 아웃트로 나레이션
  transitionType?: 'xfade' | 'cut';  // 트랜지션 타입
}

// Output
interface LongFormOutput {
  videoPath: string;            // 최종 롱폼 MP4
  duration: number;             // 총 길이 (초)
  chapters: {                   // YouTube 챕터 (설명란용)
    timestamp: string;          // "00:00", "00:52", ...
    title: string;              // 에피소드 제목
  }[];
  description: string;          // YouTube 설명 (자동 생성)
}
```

#### FFmpeg 파이프라인

```bash
# Step 1: 인트로 생성 (이미지 + TTS)
ffmpeg -loop 1 -i intro.png -i intro_tts.mp3 -shortest intro.mp4

# Step 2: 에피소드 MP4 목록 (이미 존재)
# ep1.mp4, ep2.mp4, ..., ep10.mp4

# Step 3: 아웃트로 생성
ffmpeg -loop 1 -i outro.png -i outro_tts.mp3 -shortest outro.mp4

# Step 4: 전체 합치기 (xfade 트랜지션)
VideoConcat.concatVideosWithXfade(
  [intro.mp4, ep1.mp4, ep2.mp4, ..., ep10.mp4, outro.mp4],
  longform_output.mp4,
  0.5,  // 0.5초 트랜지션
  'fade'
)
```

---

## Phase 3: 수익 구조 (6개월 후~)

### 수익 경로

```
Phase 1: Shorts 성장
  → 구독자 1000 달성
  → YPP 신청 (4000시간 or 10M Shorts 뷰)

Phase 2: 롱폼 수익
  → 롱폼 RPM $2-$11 / 1000뷰
  → 10만 뷰/월 = 월 $200-$1,100 (28만~154만원)
  → 미드롤 광고 (8분+) = RPM 추가 상승

Phase 3: 확장 (채널 성장 후)
  → 제휴 마케팅 (교재/강의 링크)
  → 멤버십
  → 브랜드 딜
```

### 수익 예측 (다각화 반영)

| 시점 | 구독자 | 월 조회수 | Shorts (광고+Thanks+멤버십) | 롱폼 수익 | 합계 |
|------|--------|----------|---------------------------|----------|------|
| 3개월 | 500 | 50만 | $50-$200 | $0 | **~$100** |
| 6개월 | 2,000 | 200만 | $200-$800 | $100-$500 | **~$600** |
| 12개월 | 10,000 | 500만 | $1,000-$3,000 | $500-$2,000 | **~$2,500** |

*교육 니치 기준, 한국어 콘텐츠, 볼륨 플레이 (월 60-100개 Shorts)*

---

## 당장 해야 할 것 (Action Items)

### 즉시 (이번 주)
- [x] 바이럴 프롬프트 v8.0 적용 (완료)
- [ ] 대기 중 에피소드 5개 생성 실행
- [ ] YouTube AI 콘텐츠 라벨 설정 확인
- [ ] 첫 업로드 → 알고리즘 반응 확인

### 1개월 내
- [x] `LongFormCompilerService` 서비스 구현 (v8.2, `services/LongFormCompilerService.ts`)
- [x] `/api/books/longform/compile`, `/longform/:documentId`, `/longform/compile-and-upload` 엔드포인트 추가
- [x] 자동 YouTube 챕터 생성 (타임스탬프 + `chaptersDescription` 복붙용)
- [ ] 롱폼 인트로/아웃트로 템플릿

### 3개월 내
- [ ] 첫 롱폼 컴필레이션 업로드
- [ ] YPP 자격 달성 목표
- [ ] 수익화 시작

---

## 참고 자료

- [YouTube Shorts RPM 2026](https://mediacube.io/en-US/blog/youtube-shorts-rpm) — $0.01-$0.06
- [YouTube Monetization Strategy 2026](https://www.vozo.ai/blogs/youtube/youtube-monetization-strategy-revenue-streams) — Shorts→Long-form 퍼널
- [Shorts+Long-form 41% 성장](https://www.techwyse.com/blog/video-marketing/youtube-shorts-for-business-2026/)
- [YouTube AI Demonetization Policy](https://shortvids.co/youtube-ai-content-demonetization-policy/) — 준수 필수
- [AI YouTube Monetization Rules 2026](https://thefinancespire.com/2026/01/12/can-you-monetize-an-ai-generated-youtube-channel-in-2026-a-policy-and-profitability-analysis/)
- [YouTube AI Slop 16 Channels Deleted](https://www.xda-developers.com/youtube-just-deleted-over-4-7-billion-views-worth-ofai-slop-videos/)
