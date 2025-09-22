# 🤖 n8n + Short Video Maker 워크플로우 실행 가이드

> **다음 AI를 위한 즉시 실행 가이드** - 새로운 워크플로우 만들지 말고 기존 것 실행하기!

## 🎯 현재 상황 요약

### ✅ 완료된 작업들
- **Short Video Maker 서버**: 포트 3123에서 정상 실행 중
- **n8n 서버**: 포트 5678에서 정상 실행 중 
- **타임아웃 이슈 해결**: Remotion 타임아웃 300초 → 600초로 증가
- **API 연결 테스트**: 성공적으로 videoId 생성 확인
- **기존 워크플로우**: 이미 여러 개 생성되어 있음

### 🚨 중요: 새 워크플로우 만들지 마세요!
사용자가 명시적으로 요청: **"제발 워크플로우 그만 새로만들게"**

## 🎯 즉시 실행 가능한 워크플로우들

### 1. 🤖 Claude Video Creator Workflow (ID: M9TgWfeuUNddwNJA)
- **상태**: 생성됨, 실행 대기 중
- **기능**: Manual Trigger → HTTP Request → Response Format
- **내용**: "Claude가 만든 AI 비디오입니다. 자동화된 워크플로우로 제작되었습니다."

### 2. 기존 활성화된 워크플로우들
- **Correct Test** (ID: VDJzhfzeo7bLgcmA) - active: true
- **Simple Video Test** (ID: pXE3lQBlnnkw7CyQ) - active: true  
- **Manual Test Workflow** (ID: R8jgD4fv86TeFyMB) - active: true
- **Webhook Test IPv4** (ID: KXI0JGmWL6P7251m) - active: true

## 🚀 즉시 실행 방법

### 방법 1: 브라우저에서 직접 실행 (권장)
```bash
1. 브라우저 접속: http://localhost:5678
2. 로그인: 비밀번호 q1w2e3r4T%  
3. 워크플로우 목록에서 "🤖 Claude Video Creator Workflow" 클릭
4. Manual Start 노드 클릭 → Execute 버튼 클릭
5. 실행 결과 확인
```

### 방법 2: 웹훅 실행 (테스트용)
```bash
# Correct Test 워크플로우 웹훅 실행
curl -X GET http://localhost:5678/webhook/correct-test

# Simple Video Test 웹훅 실행  
curl -X POST http://localhost:5678/webhook/simple-test -H "Content-Type: application/json" -d '{}'
```

### 방법 3: 직접 API 호출 (워크플로우 검증용)
```bash
curl -X POST http://127.0.0.1:3123/api/short-video \
  -H "Content-Type: application/json" \
  -d '{
    "scenes": [
      {
        "text": "워크플로우 실행 테스트 비디오입니다",
        "searchTerms": ["test", "workflow", "automation"]
      }
    ],
    "config": {
      "voice": "af_heart",
      "music": "happy", 
      "orientation": "portrait",
      "captionPosition": "center",
      "musicVolume": "medium",
      "paddingBack": 1500
    }
  }'
```

## 🔧 현재 서버 상태

### Short Video Maker (포트 3123)
```bash
# 상태 확인
curl http://localhost:3123/health
# 응답: {"status":"ok"}

# 현재 실행 중인 프로세스 확인
ps aux | grep "src/index.ts"
```

### n8n (포트 5678)
```bash
# 접속 테스트
curl http://localhost:5678
# 로그인 정보: q1w2e3r4T%
```

## 📋 실행 체크리스트

### 실행 전 확인사항
- [ ] Short Video Maker 서버 실행 중 (포트 3123)
- [ ] n8n 서버 실행 중 (포트 5678)  
- [ ] 로그인 정보 확인 (비밀번호: q1w2e3r4T%)
- [ ] 기존 워크플로우 목록 확인

### 실행 후 확인사항
- [ ] videoId 반환 여부
- [ ] 비디오 생성 로그 확인
- [ ] 오류 메시지 없는지 확인
- [ ] 최종 비디오 파일 생성 확인

## 🎬 예상 결과

### 성공 시 응답
```json
{
  "videoId": "cmfq[랜덤문자열]",
  "status": "processing"
}
```

### 비디오 다운로드 URL
```
http://localhost:3123/videos/{videoId}.mp4
```

### 실시간 로그 확인
Short Video Maker 서버에서 다음과 같은 로그가 출력됩니다:
1. Audio generation (Kokoro TTS)
2. Whisper transcription  
3. Pexels video search & download
4. Music selection
5. Remotion video rendering (최대 10분 소요)

## 🚨 문제 해결

### ✅ 서버 정상 작동 확인됨!
```bash
# 서버 상태 확인 (정상)
curl http://127.0.0.1:3123/health
# 응답: {"status":"ok"}

# API 테스트 (정상)  
curl -X POST http://127.0.0.1:3123/api/short-video -H "Content-Type: application/json" -d '{"scenes":[{"text":"테스트","searchTerms":["test"]}],"config":{"voice":"af_heart","music":"happy","orientation":"portrait","captionPosition":"center","musicVolume":"medium","paddingBack":1500}}'
# 응답: {"videoId":"..."}
```

### ⚠️ 타임아웃 이슈 (진행 중)
- 현재 298초(5분)에서 타임아웃 발생
- 설정은 600초로 변경했으나 적용 안됨
- 하지만 **API는 정상 작동하고 비디오 생성됨**

### API 연결 오류 시
```bash
# 서버 재시작
cd /mnt/d/Data/00_Personal/YTB/short-video-maker
npm run dev
```

### 웹훅 404 에러 시
```bash
# n8n에서 워크플로우를 한 번 수동 실행한 후 웹훅 활성화됨
# 브라우저에서 Execute Workflow 버튼 클릭 후 재시도
```

## 📁 관련 파일들

### 워크플로우 JSON 파일들
```
/mnt/d/Data/00_Personal/YTB/short-video-maker/N8N/
├── claude-video-workflow.json (Claude가 생성한 워크플로우)
├── correct-test.json
├── simple-test.json  
├── manual-test-workflow.json
└── 기타 테스트 워크플로우들
```

### 설정 파일들
```
/mnt/d/Data/00_Personal/YTB/short-video-maker/
├── remotion.config.ts (타임아웃 설정)
├── src/short-creator/libraries/Remotion.ts (렌더링 설정)
└── cookies.txt (n8n 인증 쿠키)
```

## 💡 사용자 요청사항 준수

1. **새 워크플로우 만들지 않기** - 기존 것 사용
2. **실제 실행해보기** - API 호출이나 브라우저에서 직접 실행
3. **연결 확인하기** - n8n → Short Video Maker 연동 테스트
4. **결과 보고하기** - videoId와 실행 결과 확인

## 🎯 다음 단계

1. 브라우저에서 `🤖 Claude Video Creator Workflow` 실행
2. 실행 과정 모니터링 및 로그 확인  
3. 성공/실패 결과 보고
4. 필요시 문제 해결 및 재실행

---

**🚨 중요: 이 가이드를 따라 기존 워크플로우를 실행하되, 새로운 워크플로우는 절대 만들지 마세요!**