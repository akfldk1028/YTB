# 🚀 n8n 소셜 미디어 자동화 워크플로우

**완전 자동화된 비디오 제작 → 인스타그램/유튜브 업로드 파이프라인**

```
컨텐츠 생성 → 비디오 제작 → 다운로드 → Instagram + YouTube 업로드 → 알림
```

## 🎯 워크플로우 파일

### 1. `basic-social-workflow.json` ⭐ **추천**
- **기능**: 간단한 비디오 → 소셜미디어 업로드
- **완벽한 시작점**: 설정이 쉽고 테스트하기 좋음
- **포함 기능**:
  - 비디오 자동 생성
  - Instagram 자동 업로드
  - YouTube Shorts 자동 업로드
  - 결과 링크 제공

### 2. `social-media-automation.json` 🔥 **고급**
- **기능**: 완전 자동화된 컨텐츠 팩토리
- **자동 스케줄링**: 매일 3회 자동 실행 (9AM, 3PM, 9PM)
- **고급 기능**:
  - 트렌딩 토픽 자동 생성 (Tech, Lifestyle, Business, Health)
  - 랜덤 음성/음악/스타일 선택
  - 해시태그 자동 최적화
  - Telegram 성공/실패 알림
  - 업로드 통계 및 분석

### 3. `simple-test-workflow.json` 🧪 **테스트용**
- **기능**: 비디오 생성만 테스트
- **용도**: 연결 테스트 및 디버깅

## 사용 방법

### 1. 워크플로우 가져오기

1. n8n 웹 인터페이스 접속 (http://localhost:5678)
2. 왼쪽 메뉴에서 "Workflows" 클릭
3. "Import from File" 선택
4. JSON 파일 선택하여 업로드

### 2. 서버 실행 확인

```bash
# Short Video Maker 서버가 실행 중인지 확인
curl http://localhost:3123/health
# 응답: {"status":"ok"}
```

### 3. 워크플로우 실행

1. 가져온 워크플로우 열기
2. 우측 상단 "Execute Workflow" 클릭
3. 실행 과정 모니터링

## API 엔드포인트

### 비디오 생성
```
POST http://localhost:3123/api/short-video
Body: {
  "scenes": [...],
  "config": {...}
}
```

### 상태 확인
```
GET http://localhost:3123/api/short-video/{videoId}/status
Response: {
  "status": "processing|ready|failed"
}
```

### 옵션 조회
```
GET http://localhost:3123/api/voices
GET http://localhost:3123/api/music-tags
```

## 워크플로우 커스터마이징

### 씬 수정하기
`Create Video` 노드의 JSON body에서 scenes 배열 수정:
```json
"scenes": [
  {
    "text": "원하는 텍스트",
    "searchTerms": ["검색어1", "검색어2"]
  }
]
```

### 설정 변경하기
config 객체에서 다음 옵션들 수정 가능:
- `voice`: 음성 선택 (af_heart, am_adam 등)
- `music`: 음악 분위기 (happy, sad, chill 등)
- `orientation`: portrait 또는 landscape
- `captionPosition`: top, center, bottom
- `musicVolume`: low, medium, high

## 트러블슈팅

### 비디오 생성 실패
- Short Video Maker 서버 실행 확인
- Pexels API 키 설정 확인
- 로그 확인: `docker logs n8n`

### 타임아웃
- Wait 노드의 대기 시간 늘리기
- 비디오 길이에 따라 처리 시간 조정

### 연결 오류
- 포트 3123 사용 가능 확인
- 방화벽 설정 확인
- Docker 네트워크 설정 확인

## 팁

1. **배치 처리**: Loop Over Items 노드로 여러 비디오 동시 생성
2. **스케줄링**: Cron 노드 추가로 정기 실행
3. **웹훅**: Webhook 노드로 외부 트리거 연동
4. **데이터베이스**: MongoDB/MySQL 노드로 비디오 메타데이터 저장

## 고급 활용

### AI 연동
- OpenAI 노드로 자동 스크립트 생성
- Claude/ChatGPT로 씬 텍스트 생성

### 소셜 미디어 연동
- 완성된 비디오 자동 업로드
- Twitter, Instagram, YouTube 연동

### 모니터링
- Grafana/Prometheus로 생성 통계 추적
- 에러 알림 설정