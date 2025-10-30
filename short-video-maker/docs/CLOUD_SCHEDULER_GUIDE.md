# GCP Cloud Scheduler Integration Guide

정해진 시간에 자동으로 숏츠를 생성하고 업로드하는 방법

## Overview

Cloud Scheduler를 사용하면 Cron 표현식으로 정해진 시간에 API를 호출할 수 있습니다.

**사용 사례:**
- 매일 오전 9시, 12시, 오후 6시에 숏츠 업로드
- 정기적인 컨텐츠 발행
- 스케줄 기반 자동화

**장점:**
- ✅ 서버 불필요 (Cloud Run은 요청 시에만 실행)
- ✅ 비용 효율적 (사용한 만큼만 과금)
- ✅ 관리 불필요 (완전 자동화)

---

## Prerequisites

1. Cloud Run에 서비스 배포 완료
2. Cloud Scheduler API 활성화

```bash
gcloud services enable cloudscheduler.googleapis.com
```

---

## Step 1: Service Account 생성 (권장)

Scheduler가 Cloud Run을 호출할 수 있도록 권한 부여

```bash
# Service Account 생성
gcloud iam service-accounts create scheduler-invoker \
  --display-name="Cloud Scheduler Invoker"

# Cloud Run 호출 권한 부여
gcloud run services add-iam-policy-binding short-video-maker \
  --member="serviceAccount:scheduler-invoker@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.invoker" \
  --region=us-central1
```

---

## Step 2: Cloud Scheduler Job 생성

### 예제 1: 매일 오전 9시 숏츠 생성

```bash
gcloud scheduler jobs create http shorts-morning \
  --location=us-central1 \
  --schedule="0 9 * * *" \
  --time-zone="Asia/Seoul" \
  --uri="https://YOUR_SERVICE_URL/api/video/consistent-shorts" \
  --http-method=POST \
  --headers="Content-Type=application/json" \
  --message-body='{
    "character": {
      "description": "A young female astronaut with blonde hair, wearing a white space suit",
      "style": "cinematic",
      "mood": "adventurous"
    },
    "scenes": [
      {
        "text": "우주를 탐험하는 우주비행사",
        "scenePrompt": "Floating gracefully in deep space with Earth in the background",
        "duration": 3
      },
      {
        "text": "미지의 행성을 발견하다",
        "scenePrompt": "Approaching a mysterious colorful planet",
        "duration": 3
      },
      {
        "text": "새로운 세계로의 여행",
        "scenePrompt": "Landing on an alien landscape with purple sky",
        "duration": 3
      }
    ],
    "config": {
      "orientation": "portrait",
      "voice": "af_sarah",
      "generateVideos": true,
      "musicVolume": "low"
    },
    "webhook_url": "https://your-n8n-webhook.com/youtube-upload"
  }' \
  --oidc-service-account-email="scheduler-invoker@YOUR_PROJECT_ID.iam.gserviceaccount.com"
```

### 예제 2: 여러 시간대 설정 (오전 9시, 12시, 오후 6시)

```bash
# 오전 9시
gcloud scheduler jobs create http shorts-morning \
  --location=us-central1 \
  --schedule="0 9 * * *" \
  --time-zone="Asia/Seoul" \
  --uri="https://YOUR_SERVICE_URL/api/video/consistent-shorts" \
  --http-method=POST \
  --headers="Content-Type=application/json" \
  --message-body-from-file=morning-config.json \
  --oidc-service-account-email="scheduler-invoker@YOUR_PROJECT_ID.iam.gserviceaccount.com"

# 오후 12시
gcloud scheduler jobs create http shorts-noon \
  --location=us-central1 \
  --schedule="0 12 * * *" \
  --time-zone="Asia/Seoul" \
  --uri="https://YOUR_SERVICE_URL/api/video/consistent-shorts" \
  --http-method=POST \
  --headers="Content-Type=application/json" \
  --message-body-from-file=noon-config.json \
  --oidc-service-account-email="scheduler-invoker@YOUR_PROJECT_ID.iam.gserviceaccount.com"

# 오후 6시
gcloud scheduler jobs create http shorts-evening \
  --location=us-central1 \
  --schedule="0 18 * * *" \
  --time-zone="Asia/Seoul" \
  --uri="https://YOUR_SERVICE_URL/api/video/consistent-shorts" \
  --http-method=POST \
  --headers="Content-Type=application/json" \
  --message-body-from-file=evening-config.json \
  --oidc-service-account-email="scheduler-invoker@YOUR_PROJECT_ID.iam.gserviceaccount.com"
```

---

## Cron 표현식 예제

Cloud Scheduler는 Unix cron 형식을 사용합니다:

```
* * * * *
│ │ │ │ │
│ │ │ │ └─── 요일 (0-6, 0=일요일)
│ │ │ └───── 월 (1-12)
│ │ └─────── 일 (1-31)
│ └───────── 시 (0-23)
└─────────── 분 (0-59)
```

**일반적인 스케줄:**

| 스케줄 | Cron 표현식 | 설명 |
|--------|-------------|------|
| 매일 오전 9시 | `0 9 * * *` | 매일 오전 9:00 |
| 매일 오전 9시, 오후 6시 | `0 9,18 * * *` | 하루 2번 |
| 2시간마다 | `0 */2 * * *` | 0시, 2시, 4시... |
| 평일 오전 9시 | `0 9 * * 1-5` | 월-금 오전 9시 |
| 매주 월요일 오전 9시 | `0 9 * * 1` | 주 1회 |
| 매월 1일 오전 9시 | `0 9 1 * *` | 월 1회 |

---

## Step 3: Config 파일 준비 (권장)

각 시간대별로 다른 컨텐츠 설정:

### `morning-config.json` (아침 컨텐츠)
```json
{
  "character": {
    "description": "A cheerful young woman in workout clothes",
    "style": "bright and energetic",
    "mood": "motivational"
  },
  "scenes": [
    {
      "text": "좋은 아침입니다! 활기찬 하루를 시작해요!",
      "scenePrompt": "Stretching with sunrise in background"
    },
    {
      "text": "오늘의 운동 루틴을 소개합니다",
      "scenePrompt": "Demonstrating morning exercises"
    }
  ],
  "config": {
    "orientation": "portrait",
    "voice": "af_sarah",
    "generateVideos": true
  }
}
```

### `evening-config.json` (저녁 컨텐츠)
```json
{
  "character": {
    "description": "A calm person in cozy home setting",
    "style": "warm and relaxing",
    "mood": "peaceful"
  },
  "scenes": [
    {
      "text": "하루를 마무리하는 시간입니다",
      "scenePrompt": "Reading a book by warm lamp light"
    },
    {
      "text": "내일을 위한 준비를 해봐요",
      "scenePrompt": "Planning tomorrow with a journal"
    }
  ],
  "config": {
    "orientation": "portrait",
    "voice": "af_sarah",
    "generateVideos": true
  }
}
```

---

## Step 4: 테스트

수동으로 즉시 실행하여 테스트:

```bash
gcloud scheduler jobs run shorts-morning --location=us-central1
```

로그 확인:
```bash
gcloud scheduler jobs describe shorts-morning --location=us-central1
```

Cloud Run 로그 확인:
```bash
gcloud run services logs read short-video-maker --region=us-central1 --limit=50
```

---

## Step 5: YouTube 자동 업로드 연동

### n8n Webhook과 연동

1. **n8n에서 Webhook 생성**
   - Trigger: Webhook
   - Method: POST

2. **YouTube Upload 노드 추가**
   - 비디오 URL: `{{ $json.videoUrl }}`
   - Title: `{{ $json.title }}`
   - Description: 자동 생성

3. **Webhook URL을 Scheduler config에 추가**
   ```json
   {
     "webhook_url": "https://your-n8n.com/webhook/youtube-upload",
     ...
   }
   ```

### 직접 YouTube API 사용

환경 변수 설정:
```bash
gcloud run services update short-video-maker \
  --set-env-vars "YOUTUBE_CLIENT_SECRET_PATH=/app/youtube-secret.json" \
  --region=us-central1
```

---

## 관리 명령어

### Job 목록 보기
```bash
gcloud scheduler jobs list --location=us-central1
```

### Job 일시 중지
```bash
gcloud scheduler jobs pause shorts-morning --location=us-central1
```

### Job 재개
```bash
gcloud scheduler jobs resume shorts-morning --location=us-central1
```

### Job 삭제
```bash
gcloud scheduler jobs delete shorts-morning --location=us-central1
```

### Job 업데이트 (스케줄 변경)
```bash
gcloud scheduler jobs update http shorts-morning \
  --schedule="0 10 * * *" \
  --location=us-central1
```

### Job 업데이트 (내용 변경)
```bash
gcloud scheduler jobs update http shorts-morning \
  --message-body-from-file=new-config.json \
  --location=us-central1
```

---

## 비용 최적화

### Cloud Scheduler 비용
- 무료 할당: 월 3개 job
- 추가 job: $0.10/job/월

**예: 하루 3번 업로드 (3개 job)**
```
Cloud Scheduler: 무료 (3개 이내)
Cloud Run: $5-10/월 (실행 시간 기반)
────────────────────────────
Total: $5-10/월
```

### Cloud Run 최적화

**최소 인스턴스 0으로 설정** (스케줄 작업에 최적):
```bash
gcloud run services update short-video-maker \
  --min-instances=0 \
  --region=us-central1
```

**타임아웃 충분히 설정** (비디오 생성 시간 고려):
```bash
gcloud run services update short-video-maker \
  --timeout=3600 \
  --region=us-central1
```

---

## 모니터링

### Cloud Console에서 확인
1. Cloud Scheduler: https://console.cloud.google.com/cloudscheduler
2. Cloud Run Logs: https://console.cloud.google.com/run
3. Error Reporting: https://console.cloud.google.com/errors

### Slack/Discord 알림 설정

Cloud Logging과 연동하여 실패 시 알림:

```bash
# Pub/Sub topic 생성
gcloud pubsub topics create scheduler-alerts

# Log sink 생성 (에러만 필터링)
gcloud logging sinks create scheduler-errors \
  pubsub.googleapis.com/projects/YOUR_PROJECT_ID/topics/scheduler-alerts \
  --log-filter='resource.type="cloud_scheduler_job" AND severity>=ERROR'

# Cloud Function으로 Slack/Discord 알림 전송
# (별도 구현 필요)
```

---

## 고급 사용 예제

### 1. 동적 컨텐츠 생성 (날씨 기반)

```bash
# Weather API 호출 후 결과를 Scheduler에 전달하는 Cloud Function 사용
gcloud functions deploy generate-weather-shorts \
  --runtime=nodejs20 \
  --trigger-http \
  --entry-point=generateWeatherShorts
```

### 2. A/B 테스팅

```bash
# 같은 시간에 2개의 다른 스타일로 생성
gcloud scheduler jobs create http shorts-style-a \
  --schedule="0 9 * * *" \
  --message-body-from-file=style-a.json

gcloud scheduler jobs create http shorts-style-b \
  --schedule="0 9 * * *" \
  --message-body-from-file=style-b.json
```

### 3. 주말/평일 다른 컨텐츠

```bash
# 평일 (월-금)
gcloud scheduler jobs create http shorts-weekday \
  --schedule="0 9 * * 1-5" \
  --message-body-from-file=weekday-config.json

# 주말 (토-일)
gcloud scheduler jobs create http shorts-weekend \
  --schedule="0 10 * * 0,6" \
  --message-body-from-file=weekend-config.json
```

---

## Troubleshooting

### 문제 1: Scheduler가 실행되지 않음

**확인 사항:**
```bash
# Job 상태 확인
gcloud scheduler jobs describe shorts-morning --location=us-central1

# 마지막 실행 기록
gcloud logging read "resource.type=cloud_scheduler_job" --limit=10
```

### 문제 2: Permission Denied

**해결:**
```bash
# Service Account 권한 재설정
gcloud run services add-iam-policy-binding short-video-maker \
  --member="serviceAccount:scheduler-invoker@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.invoker" \
  --region=us-central1
```

### 문제 3: 타임아웃

**해결:**
```bash
# Cloud Run 타임아웃 증가
gcloud run services update short-video-maker \
  --timeout=3600 \
  --region=us-central1

# Scheduler 타임아웃 증가
gcloud scheduler jobs update http shorts-morning \
  --attempt-deadline=1800s \
  --location=us-central1
```

---

## Summary

✅ **Cloud Scheduler로 완전 자동화**
- 정해진 시간에 자동 실행
- 서버 관리 불필요
- 비용 효율적

✅ **설정 간단**
```bash
1. Cloud Run 배포: ./deploy-gcp.sh
2. Scheduler Job 생성: gcloud scheduler jobs create...
3. 끝!
```

✅ **유연한 스케줄링**
- Cron 표현식으로 자유롭게 설정
- 여러 시간대, 요일별 다른 컨텐츠
- n8n/YouTube 자동 연동

**이제 정해진 시간에 자동으로 숏츠가 업로드됩니다! 🎉**
