# Cat Project 빠른 실행 가이드

## 1. API 호출 (Consistent Shorts)

```bash
curl -X POST "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/video/consistent-shorts" \
  -H "Content-Type: application/json" \
  -d '{
    "profile": "cat-couple",
    "theme": "둘이 창가에서 낮잠자다가 깨서 서로 바라보기",
    "style": "3D Pixar animation style, soft warm lighting",
    "mood": "peaceful, cozy, affectionate",
    "backgroundMusicStyle": "calm piano",
    "aspectRatio": "9:16",
    "youtubeUpload": true
  }'
```

## 2. 상태 확인

```bash
curl "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/video/consistent-shorts/{videoId}/status"
```

## 3. VEO 3.1 핵심 규칙

| 항목 | 값 | 비고 |
|------|-----|------|
| Duration | **8초** | interpolation 모드 필수! |
| Model | veo-3.1-generate-preview | |
| lastFrame | camelCase | JavaScript SDK |

## 4. 프롬프트 작성 팁

### 카메라
- `Slow dolly in` - 감정적 순간
- `Static` - 대화/관찰
- `Arc shot` - 360도 회전

### 분위기
- peaceful, serene, cozy
- playful, energetic
- curious, attentive
- affectionate, tender

### 고양이 동작
- nose-to-nose greeting (코인사)
- head bunting (머리부비기)
- slow blinking (천천히 눈깜빡)
- curling up together (함께 웅크리기)

## 5. 캐릭터 Identity Lock

**까미 (Kkam-i)**
```
3D rendered black cat wearing light blue t-shirt.
Big round brown eyes. Chubby cute body. Pink nose.
Pixar animation style. MAINTAIN EXACT same appearance.
```

**딸기 (Ddal-gi)**
```
3D rendered white/cream cat wearing pink strawberry blouse.
Pink bow on right ear. Big round brown eyes. Pink nose.
Pixar animation style. MAINTAIN EXACT same appearance.
```

## 6. 테스트 성공 기록

- **날짜**: 2025-12-22
- **수정**: duration=8 강제 (interpolation 모드)
- **결과**: https://www.youtube.com/watch?v=jLkbNBs9ERo
- **채널**: 왜저러냥 (why_cat)

## 7. 로그 확인

```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=short-video-maker" --limit=30 --format="json" | grep -E "(VEO|interpolation|duration)"
```

---

## 8. 관련 문서

### CatProject 폴더
| 문서 | 설명 |
|------|------|
| [COMMAND_REFERENCE.md](./COMMAND_REFERENCE.md) | 모든 curl 명령어 |
| [Consistent-Shorts-API-Guide.md](./Consistent-Shorts-API-Guide.md) | API 상세 가이드 |
| [SOUND-EFFECTS-GUIDE.md](./SOUND-EFFECTS-GUIDE.md) | 효과음 (Freesound) |
| [N8N-CAT-COUPLE-AUTOMATION.md](./N8N-CAT-COUPLE-AUTOMATION.md) | N8N 자동화 |
| [N8N-WORKFLOW-MODIFICATION-GUIDE.md](./N8N-WORKFLOW-MODIFICATION-GUIDE.md) | N8N 워크플로우 수정 |

### 상위 docs 폴더
| 문서 | 설명 |
|------|------|
| [../YOUTUBE_NEW_CHANNEL_GUIDE.md](../YOUTUBE_NEW_CHANNEL_GUIDE.md) | 새 YouTube 채널 추가 |
| [../environment-variables-guide.md](../environment-variables-guide.md) | 환경변수 설정 |
| [../CHARACTER-MANAGEMENT-GUIDE.md](../CHARACTER-MANAGEMENT-GUIDE.md) | 캐릭터 관리 |
