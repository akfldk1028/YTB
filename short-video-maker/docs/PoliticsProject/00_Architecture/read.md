# youtube-to-shorts (README.md 기반) — AI 실행/구현용 요약 스펙

## 0) 한 줄 요약
- 유튜브 URL 1개를 입력받아, 세로(9:16) 쇼츠 3개(각 30~60초)를 자동 생성하고 자막을 입혀 `shorts_final/`에 저장한다.

---

## 1) 입출력 계약(Interface)

### 입력(Input)
- YouTube URL (예: https://youtube.com/watch?v=VIDEO_ID)
- 실행 커맨드(스킬 형태): `/shorts <YouTube_URL>`

### 출력(Output)
- 최종 쇼츠 파일 3개:
  - 경로: `shorts_final/`
  - 형식: mp4 (일반적으로)
- 중간 산출물:
  - `output/` : 다운로드된 원본 영상 및 중간 결과(레포에선 git 제외 대상)

---

## 2) 파이프라인(Workflow) — 단계별 요구사항

### Step 1) 영상 다운로드
- 목적: 원본 영상 파일 확보
- 도구: `yt-dlp`
- 산출물: `output/original.*` (확장자는 상황에 따라)

### Step 2) 자막 확보(다운로드 또는 생성)
- 목적: 하이라이트 분석 및 자막 오버레이에 사용할 텍스트/타임라인 확보
- 입력: 원본 영상
- 출력: 자막 파일(예: .srt/.vtt 등) 또는 자막 데이터 구조

### Step 3) 하이라이트 분석(핵심 로직)
- 목적: 쇼츠로 만들 “좋은 구간” 3개 선택
- 입력: (가능하면) 자막/대본 + 원본 영상 메타정보
- 출력: 3개의 타임 구간 리스트
  - 예시 포맷(권장):
    - segments = [
        { "start_sec": 123.4, "end_sec": 167.8, "title": "...", "reason": "..." },
        { "start_sec": 456.0, "end_sec": 498.2, "title": "...", "reason": "..." },
        { "start_sec": 789.1, "end_sec": 835.0, "title": "...", "reason": "..." }
      ]

#### 선택 제약(Constraints)
- 클립 개수: 정확히 3개
- 각 클립 길이: 30~60초 범위 (초 단위 기준)
- (권장) 구간 간 중복 최소화 / 내용 다양성 확보

### Step 4) 9:16 세로 클립 추출
- 목적: 선택된 각 구간을 세로형 쇼츠로 변환
- 도구: `ffmpeg`
- 요구사항:
  - 9:16 비율로 크롭/스케일/리프레임
  - “중요한 피사체가 잘리지 않게 자동 조정”을 목표로 함
- 산출물(예):
  - `output/clip_01.mp4`
  - `output/clip_02.mp4`
  - `output/clip_03.mp4`

### Step 5) 자막 오버레이(최종 합성)
- 목적: 세로 클립 위에 자막을 “burn-in”(영상에 영구 합성)
- 도구: `ffmpeg`
- 자막 스타일 규칙(README 명시)
  - 제목(상단): 노란색, 100pt, 굵게
  - 본문(하단): 흰색, 74pt
- 산출물:
  - `shorts_final/short_01.mp4`
  - `shorts_final/short_02.mp4`
  - `shorts_final/short_03.mp4`

---

## 3) 폴더/파일 구조(Repository Layout)
- 레포 루트 기준(README에 언급된 구성):
  - `SKILL.md`           : 스킬 정의(Claude Code에서 /shorts 같은 커맨드 제공)
  - `video_analyzer.md`  : 하이라이트 분석 에이전트(구간 선택 로직/지침)
  - `guide.md`           : 사용/운영 가이드
  - `output/`            : 다운로드 및 중간 산출물(보통 git 제외)
  - `shorts_final/`      : 최종 쇼츠 결과물(보통 git 제외)

---

## 4) 실행 전제(Prerequisites)
- 시스템에 다음 CLI가 설치되어 PATH에서 실행 가능해야 함:
  - `yt-dlp`
  - `ffmpeg`

---

## 5) 실패/예외 처리(권장 구현 규칙)
- URL이 유효하지 않거나 다운로드 실패:
  - “다운로드 실패 원인(네트워크/권한/지역 제한)” 로그를 출력하고 종료
- 자막이 없고 생성도 불가능:
  - (대안) 오디오 기반 자동 전사(가능한 환경이면) 시도
  - 실패 시: “자막 생성 불가 → 하이라이트 정확도 저하” 경고 후, 영상 기반 후보 구간 탐색(가능한 경우) 또는 종료
- 구간 선택이 30~60초 조건을 못 맞춤:
  - end_sec 조정(늘이기/줄이기) 또는 인접 구간 병합/분할
- ffmpeg 합성 실패:
  - 입력 파일 경로/코덱/자막 필터 문자열을 로그로 남기고 재현 가능하게 함

---

## 6) 이공계적 요소(모델/알고리즘 관점)
- 목표는 “흥미도 점수”를 최대화하는 3개 구간 선택 문제로 볼 수 있음:
  - 각 후보 구간 s_i에 대해 Score(s_i)를 계산
  - 제약: duration(s_i) ∈ [30, 60], 선택 개수 3
  - 출력: top-3 segments
- 이후는 미디어 변환 파이프라인:
  - (cut) → (reframe to 9:16) → (subtitle burn-in)

---

## 7) 인문학적 요소(직관/비유)
- 긴 영상은 “한 편의 영화”
- AI 분석은 “편집장”: 관객이 집중할 장면 3개를 골라냄
- ffmpeg는 “편집 기사”: 장면을 세로 무대에 맞게 다시 프레이밍하고 자막이라는 ‘대사’를 얹어 완성함

---

## 8) ASCII 예시(전체 흐름)
YouTube URL
   |
   v
[yt-dlp 다운로드] -> output/original.mp4
   |
   v
[자막 확보/생성] -> captions.srt
   |
   v
[AI 하이라이트 선택] -> (start,end)*3
   |
   v
[ffmpeg 세로 클립] -> output/clip_01.mp4 ... clip_03.mp4
   |
   v
[ffmpeg 자막 합성] -> shorts_final/short_01.mp4 ... short_03.mp4
