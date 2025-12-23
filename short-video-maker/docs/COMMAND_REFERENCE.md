# Short Video Maker 명령어 레퍼런스

> [!info] 문서 정보
> | 항목 | 내용 |
> |------|------|
> | **작성일** | 2025-12-21 |
> | **최종 수정** | 2025-12-22 |
> | **용도** | API 및 GCP 명령어 빠른 참조 |
> | **서비스 URL** | https://short-video-maker-550996044521.us-central1.run.app |

---

> [!danger] 중요: 채널별 별도 토큰!
> `channelName`은 해당 채널의 OAuth 토큰 파일명과 일치해야 합니다.
> Brand Account도 별도 `channelName` + 토큰 필요!

---

## API 엔드포인트

### Health Check

```bash
curl -s https://short-video-maker-550996044521.us-central1.run.app/health
```

### YouTube Auth Health Check

```bash
curl -s https://short-video-maker-550996044521.us-central1.run.app/api/youtube/auth/health-check
```

---

## 영상 생성

### Pexels 영상 생성 (유튜브 업로드 포함)

```bash
curl -s -X POST https://short-video-maker-550996044521.us-central1.run.app/api/video/pexels \
  -H "Content-Type: application/json" \
  -d '{
    "format_type": "timeline",
    "title": "영상 제목",
    "timeline": {
      "scenes": [
        {"id": "1", "duration": 3, "text": "내레이션", "search_keywords": ["keyword"]}
      ]
    },
    "video_config": {
      "orientation": "portrait",
      "musicVolume": "low",
      "subtitlePosition": "center",
      "quality": "high"
    },
    "elevenlabs_config": {
      "model_id": "eleven_multilingual_v2",
      "voice": "baRq1qg6PxLsnSQ04d8c",
      "voice_settings": {"stability": 0.7, "similarity_boost": 0.8, "speed": 1.0, "style": "narration"},
      "output_format": "mp3"
    },
    "youtube_upload": {
      "enabled": true,
      "channelName": "why_cat",
      "privacy": "unlisted"
    }
  }'
```

### 영상 상태 확인

```bash
curl -s https://short-video-maker-550996044521.us-central1.run.app/api/video/pexels/{videoId}/status
```

---

## YouTube 채널 관리

### 채널 목록 조회

```bash
curl -s https://short-video-maker-550996044521.us-central1.run.app/api/youtube/channels
```

### 수동 업로드

```bash
curl -s -X POST https://short-video-maker-550996044521.us-central1.run.app/api/youtube/upload \
  -H "Content-Type: application/json" \
  -d '{
    "videoId": "{videoId}",
    "channelName": "why_cat",
    "metadata": {
      "title": "영상 제목",
      "description": "설명",
      "privacyStatus": "unlisted"
    }
  }'
```

> [!warning] channelName 주의
> `channelName`은 해당 채널의 OAuth 토큰 파일명과 일치해야 합니다.
> - `segong` → ATT 채널
> - `cgxr` → CGXR 채널 (Brand Account)
> - `clickaround` → ClickAround 채널
> - `why_cat` → 왜저러냥 채널 (Brand Account)

---

## 채널별 빠른 설정

### ATT 채널

```json
"youtube_upload": {
  "enabled": true,
  "channelName": "segong",
  "privacy": "unlisted"
}
```

### CGXR 채널 (Brand Account)

```json
"youtube_upload": {
  "enabled": true,
  "channelName": "cgxr",
  "privacy": "private"
}
```

### ClickAround 채널

```json
"youtube_upload": {
  "enabled": true,
  "channelName": "clickaround",
  "privacy": "unlisted"
}
```

### 왜저러냥 채널 (Brand Account)

```json
"youtube_upload": {
  "enabled": true,
  "channelName": "why_cat",
  "privacy": "unlisted"
}
```

---

## GCP 명령어

### Cloud Build 실행

```bash
cd /mnt/d/Data/00_Personal/YTB/short-video-maker
pnpm build
gcloud builds submit --config=cloudbuild.yaml --project=dkdk-474008 --substitutions=SHORT_SHA=v{날짜}{버전}
```

### Cloud Run 상태 확인

```bash
gcloud run revisions list --service=short-video-maker --region=us-central1 --project=dkdk-474008 --limit=5
```

### Cloud Run 로그 확인

```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=short-video-maker" \
  --project=dkdk-474008 --limit=50 --format="table(timestamp,textPayload)"
```

---

## Secret Manager

### YouTube 데이터 업데이트

```bash
cd /home/akfldk1028/.ai-agents-az-video-generator
tar czf youtube-data.tar.gz youtube-channels.json youtube-tokens-*.json
cat youtube-data.tar.gz | base64 | gcloud secrets versions add YOUTUBE_DATA --data-file=- --project=dkdk-474008
```

### Secret 버전 확인

```bash
gcloud secrets versions list YOUTUBE_DATA --project=dkdk-474008
```

### Secret 내용 확인

```bash
gcloud secrets versions access latest --secret=YOUTUBE_DATA --project=dkdk-474008 | base64 -d | tar tzf -
```

---

## 파일 위치

| 파일 | 경로 |
|------|------|
| youtube-channels.json | `/home/akfldk1028/.ai-agents-az-video-generator/youtube-channels.json` |
| youtube-tokens-*.json | `/home/akfldk1028/.ai-agents-az-video-generator/` |
| 프로젝트 루트 | `/mnt/d/Data/00_Personal/YTB/short-video-maker` |

---

## 관련 문서

- [[YOUTUBE_CHANNEL_UPLOAD_GUIDE|채널별 업로드 가이드]]
- [[YOUTUBE_NEW_CHANNEL_GUIDE|새 채널 추가 가이드]]
- [[YOUTUBE-TOKEN-TROUBLESHOOTING|토큰 문제해결]]
- [[YOUTUBE_OAUTH_COMPLETE_FLOW|OAuth 재인증 완전 가이드]]

---

#commands #api #gcp #reference

**Last Updated**: 2025-12-22 13:00 KST
