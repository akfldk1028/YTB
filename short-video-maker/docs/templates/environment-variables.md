# Environment Variables 완전 가이드

Short Video Maker의 모든 환경변수 설정 가이드. 이 문서 하나로 모든 설정 완료!

## Quick Start - 복사해서 바로 사용

### 로컬 개발 (.env 파일)
```bash
# .env 파일에 복사
PEXELS_API_KEY=YOUR_PEXELS_KEY
GOOGLE_GEMINI_API_KEY=YOUR_GEMINI_KEY
GOOGLE_CLOUD_PROJECT_ID=dkdk-474008
LOG_LEVEL=info
PORT=3123
TTS_PROVIDER=google
VIDEO_SOURCE=veo
VEO_MODEL=veo-3.0-fast-generate-001
VEO3_USE_NATIVE_AUDIO=false
WHISPER_MODEL=base.en
GCS_BUCKET_NAME=dkdk-474008-short-videos
GCS_REGION=us-central1
GOOGLE_SHEETS_SPREADSHEET_ID=1mjCpZ-yzolphxY82Ccu4WWtoIiANJTMjUZFuleJQf5o
```

### Cloud Run 배포 시 (cloudbuild yaml 또는 deploy-gcp.sh)
```bash
# 현재 Cloud Run에 설정된 환경변수 (2025-12-01 기준)
--set-env-vars "DOCKER=true,LOG_LEVEL=info,CONCURRENCY=1,VIDEO_CACHE_SIZE_IN_BYTES=2097152000,WHISPER_MODEL=base.en,TTS_PROVIDER=elevenlabs,VIDEO_SOURCE=veo,VEO3_USE_NATIVE_AUDIO=false,VEO_MODEL=veo-3.0-fast-generate-001,GCS_BUCKET_NAME=dkdk-474008-short-videos,GCS_REGION=us-central1,GCS_SIGNED_URL_EXPIRY_HOURS=24,GCS_AUTO_DELETE_DAYS=30,GOOGLE_SHEETS_SPREADSHEET_ID=1mjCpZ-yzolphxY82Ccu4WWtoIiANJTMjUZFuleJQf5o,GOOGLE_SHEETS_NAME=Videos"
```

---

## 1. 필수 환경변수

| 변수명 | 값 | 설명 | 어디서 얻나? |
|--------|---|------|-------------|
| `PEXELS_API_KEY` | Secret | Pexels 비디오 API | https://www.pexels.com/api/ |
| `GOOGLE_GEMINI_API_KEY` | Secret | VEO3/이미지 생성 | https://ai.google.dev/ |
| `GOOGLE_CLOUD_PROJECT_ID` | `dkdk-474008` | GCP 프로젝트 ID | GCP Console |

## 2. 서비스 설정 환경변수

### 2.1 기본 설정
| 변수명 | 기본값 | 설명 |
|--------|-------|------|
| `DOCKER` | `true` | Docker/Cloud Run 환경 여부 |
| `LOG_LEVEL` | `info` | 로그 레벨 (trace, debug, info, warn, error) |
| `PORT` | `3123` | 서버 포트 |
| `CONCURRENCY` | `1` | 동시 렌더링 수 |
| `VIDEO_CACHE_SIZE_IN_BYTES` | `2097152000` | 비디오 캐시 (2GB) |

### 2.2 비디오/이미지 생성
| 변수명 | 기본값 | 설명 |
|--------|-------|------|
| `VIDEO_SOURCE` | `veo` | 비디오 소스 (pexels, veo, leonardo, both) |
| `VEO_MODEL` | `veo-3.0-fast-generate-001` | VEO 모델 버전 |
| `VEO3_USE_NATIVE_AUDIO` | `false` | VEO3 네이티브 오디오 사용 |

### 2.3 TTS (Text-to-Speech)
| 변수명 | 기본값 | 설명 |
|--------|-------|------|
| `TTS_PROVIDER` | `elevenlabs` | TTS 제공자 (google, elevenlabs) - Kokoro 비활성화됨 |
| `WHISPER_MODEL` | `base.en` | Whisper 모델 (tiny.en, base.en, small.en) |
| `ELEVENLABS_API_KEY` | Secret | ElevenLabs API 키 (필수 - elevenlabs 사용 시) |

**참고**: ElevenLabs는 타임스탬프 alignment를 제공하므로 Whisper 없이도 자막 생성 가능 (Cloud Run 타임아웃 방지)

### 2.4 Google Cloud Storage
| 변수명 | 값 | 설명 |
|--------|---|------|
| `GCS_BUCKET_NAME` | `dkdk-474008-short-videos` | GCS 버킷 이름 |
| `GCS_REGION` | `us-central1` | GCS 리전 |
| `GCS_SIGNED_URL_EXPIRY_HOURS` | `24` | Signed URL 만료 시간 |
| `GCS_AUTO_DELETE_DAYS` | `30` | 자동 삭제 기간 (일) |

### 2.5 Google Sheets
| 변수명 | 값 | 설명 |
|--------|---|------|
| `GOOGLE_SHEETS_SPREADSHEET_ID` | `1mjCpZ-yzolphxY82Ccu4WWtoIiANJTMjUZFuleJQf5o` | 스프레드시트 ID |
| `GOOGLE_SHEETS_NAME` | `Videos` | 시트 이름 (기본: Videos) |

---

## 3. GCP Secret Manager 설정

### 3.1 Secret 생성 명령어 (한번만 실행)
```bash
# 1. PEXELS API Key
echo -n "YOUR_PEXELS_API_KEY" | gcloud secrets create PEXELS_API_KEY --data-file=-

# 2. Google Gemini API Key
echo -n "YOUR_GEMINI_API_KEY" | gcloud secrets create GOOGLE_GEMINI_API_KEY --data-file=-

# 3. GCP Project ID
echo -n "dkdk-474008" | gcloud secrets create GOOGLE_CLOUD_PROJECT_ID --data-file=-

# 4. YouTube Client Secret (JSON 파일)
gcloud secrets create YOUTUBE_CLIENT_SECRET --data-file=~/.ai-agents-az-video-generator/client_secret.json

# 5. YouTube Data (채널 + 토큰 아카이브)
cd ~/.ai-agents-az-video-generator/data
tar czf - youtube-channels.json tokens-*.json | base64 -w0 > /tmp/youtube-data.b64
gcloud secrets create YOUTUBE_DATA --data-file=/tmp/youtube-data.b64
```

### 3.2 Secret 업데이트 명령어
```bash
# API Key 업데이트
echo -n "NEW_API_KEY" | gcloud secrets versions add SECRET_NAME --data-file=-

# YouTube Data 업데이트 (토큰 갱신 후)
cd ~/.ai-agents-az-video-generator/data
tar czf - youtube-channels.json tokens-*.json | base64 -w0 > /tmp/youtube-data.b64
gcloud secrets versions add YOUTUBE_DATA --data-file=/tmp/youtube-data.b64
```

### 3.3 Secret 확인 명령어
```bash
# Secret 목록 확인
gcloud secrets list

# 특정 Secret 값 확인
gcloud secrets versions access latest --secret=SECRET_NAME
```

---

## 4. 자주 사용하는 명령어

### 4.1 환경변수 수동 추가 (배포 후)
```bash
gcloud run services update short-video-maker \
  --region asia-northeast3 \
  --project dkdk-474008 \
  --update-env-vars="GOOGLE_SHEETS_SPREADSHEET_ID=1mjCpZ-yzolphxY82Ccu4WWtoIiANJTMjUZFuleJQf5o"
```

### 4.2 현재 환경변수 확인
```bash
gcloud run services describe short-video-maker \
  --region asia-northeast3 \
  --project dkdk-474008 \
  --format="yaml(spec.template.spec.containers[0].env)"
```

### 4.3 배포
```bash
./deploy-gcp.sh
```

---

## 5. 중요 경로들

| 항목 | 경로 |
|------|------|
| YouTube Client Secret | `~/.ai-agents-az-video-generator/client_secret.json` |
| YouTube Channels Config | `~/.ai-agents-az-video-generator/data/youtube-channels.json` |
| YouTube Tokens | `~/.ai-agents-az-video-generator/data/tokens-*.json` |
| Videos Output | `~/.ai-agents-az-video-generator/videos/` |
| Deploy Script | `./deploy-gcp.sh` |

---

## 6. Google Sheets 설정

### 6.1 스프레드시트 URL
```
https://docs.google.com/spreadsheets/d/1mjCpZ-yzolphxY82Ccu4WWtoIiANJTMjUZFuleJQf5o/edit
```

### 6.2 서비스 계정 권한 부여
1. Google Sheets 열기
2. 공유 클릭
3. 서비스 계정 이메일 추가: `550996044521-compute@developer.gserviceaccount.com`
4. "편집자" 권한 부여

### 6.3 Sheet 컬럼 구조 (31개)
| 컬럼 | 필드명 | 설명 |
|-----|-------|------|
| A | videoId | YouTube 비디오 ID |
| B | jobId | 내부 작업 ID |
| C | createdAt | 생성 시간 |
| D | channelName | 채널 이름 |
| E | title | 영상 제목 |
| F | description | 영상 설명 |
| G | tags | 태그 (JSON) |
| H | duration | 길이 (초) |
| I | mode | 생성 모드 |
| J | sceneCount | 씬 개수 |
| K | voice | TTS 음성 |
| L | orientation | 방향 |
| M | uploadStatus | 업로드 상태 |
| N | uploadedAt | 업로드 시간 |
| O | gcsUrl | GCS URL |
| P | youtubeUrl | YouTube URL |
| Q | views | 조회수 |
| R | likes | 좋아요 |
| S | comments | 댓글 |
| T | shares | 공유 |
| U | averageViewDuration | 평균 시청 시간 |
| V | averageViewPercentage | 평균 시청률 |
| W | estimatedMinutesWatched | 총 시청 시간 |
| X | subscribersGained | 구독자 증가 |
| Y | subscribersLost | 구독자 감소 |
| Z | retentionScore | 유지율 점수 |
| AA | engagementScore | 참여도 점수 |
| AB | growthScore | 성장 점수 |
| AC | viralScore | 바이럴 점수 |
| AD | totalReward | 총 보상 점수 |
| AE | analyticsLastUpdated | Analytics 업데이트 시간 |

---

## 7. API 엔드포인트

### 7.1 Google Sheets API
| 엔드포인트 | 메소드 | 설명 |
|-----------|-------|------|
| `/api/sheet/import-youtube-videos` | POST | YouTube 비디오 import (최초 1회) |
| `/api/sheet/batch-update-analytics` | POST | **모든 비디오 Analytics 일괄 업데이트** |
| `/api/sheet/video/:videoId/update-analytics` | POST | 개별 비디오 Analytics 업데이트 |
| `/api/sheet/videos` | GET | 비디오 목록 조회 |
| `/api/sheet/video/:videoId` | GET | 특정 비디오 상세 조회 |
| `/api/sheet/stats` | GET | 시트 통계 조회 |
| `/api/sheet/config` | GET | Sheet 설정 확인 |

### 7.2 YouTube Analytics API
| 엔드포인트 | 메소드 | 설명 |
|-----------|-------|------|
| `/api/analytics/video/:videoId` | GET | 비디오 Analytics 조회 |
| `/api/analytics/channel/:channelName/videos` | GET | 채널 비디오 목록 |

### 7.3 주기적 Analytics 업데이트 (중요!)

시트에 저장된 비디오들의 Analytics를 주기적으로 업데이트하려면:

```bash
# 모든 ATT 채널 비디오 Analytics 일괄 업데이트
curl -X POST "https://short-video-maker-550996044521.asia-northeast3.run.app/api/sheet/batch-update-analytics" \
  -H "Content-Type: application/json" \
  -d '{"channelName": "ATT"}'

# 24시간 이상 지난 것만 업데이트 (maxAgeHours 기본값: 24)
curl -X POST "https://short-video-maker-550996044521.asia-northeast3.run.app/api/sheet/batch-update-analytics" \
  -H "Content-Type: application/json" \
  -d '{"channelName": "ATT", "maxAgeHours": 24}'

# 특정 비디오만 업데이트
curl -X POST "https://short-video-maker-550996044521.asia-northeast3.run.app/api/sheet/batch-update-analytics" \
  -H "Content-Type: application/json" \
  -d '{"channelName": "ATT", "videoIds": ["5Tc19VhT6lQ", "KA0tBcO_5pc"]}'
```

**자동화 팁**: Cloud Scheduler나 cron job으로 매일 1회 호출하면 Analytics 자동 업데이트!

---

## 8. 문제 해결

### Q: 환경변수가 배포 후 사라졌어요
A: `deploy-gcp.sh`에 환경변수가 포함되어 있는지 확인하세요. 177번째 줄에 모든 환경변수가 있어야 합니다.

### Q: Google Sheets에 데이터가 안 들어가요
A:
1. `GOOGLE_SHEETS_SPREADSHEET_ID` 환경변수 확인
2. 서비스 계정에 시트 편집 권한 부여 확인
3. 시트 이름이 "Videos"인지 확인

### Q: YouTube 토큰이 만료됐어요 (invalid_grant 에러)
A: 상세 가이드: [YOUTUBE-TOKEN-TROUBLESHOOTING.md](./YOUTUBE-TOKEN-TROUBLESHOOTING.md)

**빠른 해결**:
```bash
# 1. 로컬 서버 시작 (포트 3124 필수!)
cd /mnt/d/Data/00_Personal/YTB/short-video-maker
PORT=3124 node dist/index.js

# 2. 브라우저에서 재인증
http://localhost:3124/api/youtube/auth/ATT

# 3. Secret Manager 업데이트
cd ~/.ai-agents-az-video-generator
tar czf /tmp/youtube-data.tar.gz youtube-channels.json youtube-tokens-*.json
base64 /tmp/youtube-data.tar.gz > /tmp/youtube-data-base64.txt
gcloud secrets versions add YOUTUBE_DATA --data-file=/tmp/youtube-data-base64.txt --project=dkdk-474008

# 4. Cloud Run 재시작
gcloud run services update short-video-maker --region=us-central1 --project=dkdk-474008 --update-env-vars="RESTART_TRIGGER=$(date +%s)"
```

---

Last Updated: 2025-12-04

---

## 9. 구글 아이디 변경 시 체크리스트

구글 아이디를 변경해야 할 경우 아래 항목들을 모두 업데이트해야 합니다:

### 9.1 Secret Manager 업데이트
```bash
# 1. GOOGLE_CLOUD_PROJECT_ID 변경
echo -n "NEW_PROJECT_ID" | gcloud secrets versions add GOOGLE_CLOUD_PROJECT_ID --data-file=-

# 2. GOOGLE_GEMINI_API_KEY 변경 (새 프로젝트에서 발급)
echo -n "NEW_GEMINI_KEY" | gcloud secrets versions add GOOGLE_GEMINI_API_KEY --data-file=-

# 3. YouTube 인증 재설정 (새 OAuth 클라이언트)
gcloud secrets versions add YOUTUBE_CLIENT_SECRET --data-file=NEW_client_secret.json

# 4. YouTube 토큰 재인증 필요
# 로컬에서: curl "http://localhost:3123/api/youtube/auth/start?channelName=ATT"
```

### 9.2 환경변수 업데이트
| 변수명 | 변경 필요 여부 |
|--------|--------------|
| `GOOGLE_CLOUD_PROJECT_ID` | 반드시 변경 |
| `GCS_BUCKET_NAME` | 새 버킷 생성 후 변경 |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | 새 시트 생성 후 변경 (또는 공유 설정) |
| `GOOGLE_GEMINI_API_KEY` | 새 프로젝트에서 발급 후 변경 |

### 9.3 Google Sheets 권한
새 서비스 계정에 시트 편집 권한 부여:
1. Google Sheets 열기
2. 공유 > 새 서비스 계정 이메일 추가
3. "편집자" 권한 부여

### 9.4 Cloud Run 재배포
```bash
# cloudbuild yaml에서 환경변수 업데이트 후
gcloud builds submit --config=/tmp/cloudbuild-min-scene.yaml --project=NEW_PROJECT_ID .
```

---

## 10. 현재 Cloud Run 서비스 정보 (2025-12-01)

| 항목 | 값 |
|------|---|
| **서비스명** | `short-video-maker` |
| **프로젝트** | `dkdk-474008` |
| **리전** | `asia-northeast3` (서울) |
| **현재 Revision** | `short-video-maker-00017-b9l` |
| **메모리** | 4Gi |
| **CPU** | 2 |
| **타임아웃** | 3600s (1시간) |
| **동시성** | 80 |
| **최소 인스턴스** | 0 |
| **최대 인스턴스** | 10 |

### 서비스 URL
```
https://short-video-maker-550996044521.asia-northeast3.run.app
```

### Secret Manager에 저장된 키들
| Secret 이름 | 설명 |
|------------|------|
| `PEXELS_API_KEY` | Pexels 비디오 검색 API |
| `GOOGLE_GEMINI_API_KEY` | Gemini/VEO API |
| `GOOGLE_CLOUD_PROJECT_ID` | GCP 프로젝트 ID |
| `YOUTUBE_CLIENT_SECRET` | YouTube OAuth 클라이언트 JSON |
| `YOUTUBE_DATA` | YouTube 채널/토큰 데이터 (Base64) |
| `ELEVENLABS_API_KEY` | ElevenLabs TTS API |
