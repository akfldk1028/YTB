Veo 기반 자동 프롬프트 최적화(밴딧+SSPO/PPO) — 운영 요약서

AI CLI에서 바로 질의할 수 있게, 설계/인터페이스/지표를 한 장에 정리한 MD입니다.
목표: Veo 프롬프트를 선택·편집해 즉시/단기 지표로 강화학습을 돌리고, 한 달 내 실질 개선.

TL;DR

무엇: Veo 프롬프트를 컨텍스추얼 밴딧(템플릿 선택) + SSPO/PPO(테스트타임 편집)로 자동 최적화.

보상: 느린 7일 지표 대신 오프플랫폼 자동평가(즉시) + ≤6h 온플랫폼 지표로 합성한 R_fast.

파이프라인: n8n 스케줄 → RL-Policy(선택/편집 제안) → GPT 프롬프트 → nanobanan → Veo3 호출 → 자동평가 → YouTube 업로드 & ≤6h ETL → 보상 집계 → 정책 업데이트.

완료 기준: Var(R_proxy | 동일 프롬프트 반복)<=0.1, ETL 지연<30분, 3일 이동평균 R_fast 베이스라인 대비 ≥ +5%.

1) 시스템 구조(요약)
n8n(CRON) -> ContextBuilder -> RL-Policy(select/edit) -> GPT Prompt
-> nanobanan payload -> Veo3 -> Video
-> Auto-Eval(Align/Consistency/Flicker/Aesthetic/Safety) -> R_proxy
-> (Upload) YouTube -> Analytics ETL(<=6h: CTR/Hold10/30/Replay)
-> Reward Aggregator(R_fast) -> Bandit/PPO Update -> DB/Grafana/Alert

2) 핵심 목표

정량 목표: 3일 이동평균 R_fast +5% 이상, 2주 내 ≤6h CTR +3%p(썸네일/제목 통제).

품질 목표: Align↑, Consistency↑, Flicker↓ (자동평가 기준 일관 개선).

3) 보상 정의
3.1 즉시 보상(업로드 전) — R_proxy
𝑅
proxy
=
𝑤
_
𝑎
⋅
Align
+
𝑤
_
𝑐
⋅
Consistency
−
𝑤
_
𝑓
⋅
Flicker
+
𝑤
_
𝑒
⋅
Aesthetic
−
𝑤
_
𝑠
⋅
SafetyPenalty
R
proxy
	​

=w_a⋅Align+w_c⋅Consistency−w_f⋅Flicker+w_e⋅Aesthetic−w_s⋅SafetyPenalty
3.2 단기 보상(≤6h) — R_fast
𝑅
fast
=
0.40
 
𝑅
proxy
+
0.35
 
CTR
≤
6
ℎ
+
0.20
 
Hold
30
𝑠
+
0.05
 
Replay
−
𝜆
$
 
Cost
R
fast
	​

=0.40R
proxy
	​

+0.35CTR
≤6h
	​

+0.20Hold
30s
	​

+0.05Replay−λ
$
	​

Cost

참고: 7일 지표는 리포트/검증용. 학습은 R_fast로 업데이트.
3.2 단기 보상(≤6h) — R_fast
𝑅
fast
=
0.40
 
𝑅
proxy
+
0.35
 
CTR
≤
6
ℎ
+
0.20
 
Hold
30
𝑠
+
0.05
 
Replay
−
𝜆
$
 
Cost
R
fast
	​

=0.40R
proxy
	​

+0.35CTR
≤6h
	​

+0.20Hold
30s
	​

+0.05Replay−λ
$
	​

Cost

참고: 7일 지표는 리포트/검증용. 학습은 R_fast로 업데이트.

4) n8n 워크플로우(권장 단계)

Cron Trigger (30–60분)

ContextBuilder(Function): 요일/시간/길이/주제/채널 히스토리 → context_json

RL-Policy(HTTP)

POST /bandit/select → {template_id, slots}

(옵션) POST /editor/suggest → edit_actions(SSPO 휴리스틱 or PPO)

GPT Prompt(OpenAI): 템플릿+슬롯+편집안을 텍스트 프롬프트로 조립

nanobanan(Function): veo_payload 빌드

Veo3(HTTP): 비디오 생성

Auto-Eval(Sub-Workflow): Align/Consistency/Flicker/Aesthetic/Safety → R_proxy

YouTube Upload(HTTP): 제목/태그/썸네일(표지 A/B는 별도 노드)

Analytics ETL(Loop ≤6h): impressions, ctr, hold10/30, replay

Reward Aggregator(Function): R_fast 산출

RL Update(HTTP): bandit.update, editor.update

DB Upsert & Grafana/Alert

5) 내부 RL API (AI CLI에서 호출 가능)
5.1 선택 정책(Bandit)
POST /bandit/select
Content-Type: application/json
{
  "context": {
    "weekday": 3, "hour": 21, "length_s": 45,
    "topic": "tech-news", "channel_age_days": 120
  }
}


Response

{ "template_id": "t_vid_012", "slots": { "style":"documentary", "camera":"dolly", "sound":"lofi" } }

POST /bandit/update
Content-Type: application/json
{
  "context": { ... },
  "template_id": "t_vid_012",
  "r_fast": 0.73
}


알고리즘: LinUCB 또는 Thompson

탐색 하한: epsilon_min = 0.07

5.2 편집 정책(Editor)
POST /editor/suggest
Content-Type: application/json
{
  "prompt_text": "A cinematic ...",
  "context": { ... },
  "history": [{ "action":"INSERT","slot":"shot","phrase":"close-up of hands"}],
  "k_steps": 3
}


Response

{ "edit_actions": [
  {"op":"REPLACE","slot":"style","span":"cinematic","phrase":"documentary"},
  {"op":"INSERT","slot":"camera","phrase":"slow dolly-in"},
  {"op":"TUNE","slot":"motion","strength":0.6}
]}

POST /editor/update
Content-Type: application/json
{
  "trajectory":[
    {"s":"...","a":{"op":"REPLACE","slot":"style"}, "r_step":0.15},
    {"s":"...","a":{"op":"INSERT","slot":"camera"}, "r_step":0.22}
  ],
  "r_fast": 0.71
}


기본: SSPO 휴리스틱

과제용: PPO-Editor(clip loss + KL + entropy, 액션 마스킹)

6) Auto-Eval 규격(오프플랫폼 즉시)

Align: 텍스트–비디오 정합(LLM-VL/CLIP) — 0~1

Consistency: 키포인트/광류 워핑 오차의 역수 — 0~1

Flicker: 프레임 밝기/특징 변동 분산 — 0~1(작을수록 좋음 → 보상에서 음수 가중)

Aesthetic: 프레임별 미학 점수 평균 — 0~1

Safety: 저작권/민감·정책 필터 위반 시 패널티

7) Analytics ETL(≤6h)

필드: impressions, ctr, hold10, hold30, replay_rate

빈도: 15분 주기 폴링, 지연 < 30분

테이블: yt_6h(video_id, impr, ctr, hold10, hold30, replay, collected_at)

8) 데이터 스키마(최소)
-- 프롬프트/영상/평가
prompts(id, template_id, slots_json, prompt_text, created_at)
videos(id, prompt_id, seed, length_s, veo_cost, render_time_s, upload_ts, yt_video_id, url)
auto_eval(video_id, align, consistency, flicker, aesthetic, safety, r_proxy, eval_ts)
yt_6h(video_id, impressions, ctr, hold10, hold30, replay, collected_at)

-- RL 로그
bandit_log(id, context_json, template_id, r_fast, ts)
editor_traj(run_id, step, action, before_text, after_text, r_step, r_fast, ts)

9) 완료 기준(자동 체크)

재현성: 동일 프롬프트 3회 생성의 Var(R_proxy) < 0.1

ETL: lag_minutes(≤6h metrics) < 30

롤백 룰(24h): ΔCTR < -5% AND ΔHold30 < 0 → 탐색률↓, 베이스라인 고정

10) 썸네일/제목 분리(A/B)

본문 프롬프트 효과와 교란 분리를 위해 별도 실험 슬롯 유지

리포트 시 본문 효과(이 문서의 RL 효과)만 분리 추정

11) 4주 타임라인(마감 맞춤)

1주차: Veo→Auto-Eval→R_proxy / ETL(≤6h) 파이프 고정

2주차: Bandit(선택) + SSPO(편집) → R_fast +5% 목표

3주차: 베이지안 가중/리포트(옵션: 6h→7d 예측기)

4주차: PPO-Editor(과제용) 실험 & 어블레이션

12) AI CLI용 샘플 명령
# 템플릿 선택
curl -X POST $RL_API/bandit/select -H 'Content-Type: application/json' \
  -d '{"context":{"weekday":3,"hour":21,"length_s":45,"topic":"tech-news","channel_age_days":120}}'

# 편집 제안(SSPO/PPO)
curl -X POST $RL_API/editor/suggest -H 'Content-Type: application/json' \
  -d '{"prompt_text":"A cinematic ...","context":{"weekday":3,"hour":21},"k_steps":3}'

# 보상 집계 후 업데이트
curl -X POST $RL_API/bandit/update -H 'Content-Type: application/json' \
  -d '{"context":{"weekday":3,"hour":21},"template_id":"t_vid_012","r_fast":0.73}'

curl -X POST $RL_API/editor/update -H 'Content-Type: application/json' \
  -d '{"trajectory":[{"s":"...","a":{"op":"REPLACE","slot":"style"},"r_step":0.15}],"r_fast":0.71}'

13) 운영 수칙(요약)

탐색률 하한: epsilon_min = 0.07

업로드 캡: 하루 N개(예: 10–20), 총 길이 L분

비용 패널티: Cost = c_gen*#calls + c_len*length

안전 필터: 금칙어·저작권·민감 토픽 프리/포스트 필터

로그 가시화: Grafana 대시(보상 추이, CTR/Hold 분해, 템플릿 리더보드)

부록: 이공계적 요소 / 인문학적 요소 / ASCII

이공계적 요소: MDP(상태=프롬프트/컨텍스트/히스토리, 행동=템플릿 선택+편집, 보상=R_fast), 알고리즘(밴딧+SSPO/PPO), 안정화(KL·액션마스킹·롤백).

인문학적 요소: “시사회 평(자동평가) + **개봉 첫 6시간 관객 반응(CTR/Hold)**을 평론 패널처럼 가중합해 **다음 회차 대본(프롬프트)**을 즉시 고치는 극단.”

ASCII: 문서 상단/섹션 1 참조.

필요하면 이 MD를 그대로 README.md로 저장해서 AI CLI에 붙이면 돼.
원하면 RL API 스켈레톤(FastAPI) + n8n HTTP 노드 페이로드 예시도 바로 덧붙여줄게.
