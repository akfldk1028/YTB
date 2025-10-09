# N8N 다중 채널 배포 전략

## 🎯 **채널별 워크플로우 운영 방식**

### **방법 1: 워크플로우 복사 방식 (추천)**

각 채널마다 독립된 워크플로우 파일:

```
📁 N8N/
├── Upload2_Korean_Business.json      // 한국어 비즈니스
├── Upload2_English_Global.json       // 영어 글로벌  
├── Upload2_Japanese_Premium.json     // 일본어 프리미엄
├── Upload2_Chinese_Volume.json       // 중국어 대용량
└── Upload2_Spanish_Latino.json       // 스페인어 라틴
```

**장점**:
- 채널별 독립 실행
- 서로 다른 스케줄 가능
- 채널별 맞춤 로직
- 에러 격리

## 📊 **채널별 최적화 설정**

### **1️⃣ 한국어 비즈니스 채널**
```json
{
  "channel_name": "성공마인드 코리아",
  "channel_language": "korean",
  "voice_preference": "pNInz6obpgDQGcFmaJgB",
  "content_style": "professional",
  "target_categories": ["Business Success", "Productivity Tips", "Wellness"],
  "peak_hours": [7, 8, 9, 18, 19, 20],
  "veo3_priority": true,
  "schedule": "0 7,19 * * *"
}
```

### **2️⃣ 영어 글로벌 채널**
```json
{
  "channel_name": "Global Success Hub",
  "channel_language": "english", 
  "voice_preference": "21m00Tcm4TlvDq8ikWAM",
  "content_style": "engaging",
  "target_categories": ["Science Facts", "Learning Methods", "Tech Tips"],
  "peak_hours": [14, 15, 16, 22, 23, 0],
  "veo3_priority": false,
  "schedule": "0 14,22 * * *"
}
```

### **3️⃣ 일본어 프리미엄 채널**
```json
{
  "channel_name": "成功への道",
  "channel_language": "japanese",
  "voice_preference": "japanese_premium_voice",
  "content_style": "respectful",
  "target_categories": ["Health Tips", "Relationships", "Life Hacks"],
  "peak_hours": [20, 21, 22],
  "veo3_priority": true,
  "schedule": "0 20 * * *"
}
```

### **4️⃣ 중국어 대용량 채널**
```json
{
  "channel_name": "成功智慧",
  "channel_language": "chinese",
  "voice_preference": "chinese_mandarin_voice",
  "content_style": "inspirational",
  "target_categories": ["Motivational", "Learning Methods", "Business Success"],
  "peak_hours": [19, 20, 21],
  "veo3_priority": false,
  "schedule": "0 */4 * * *"
}
```

### **5️⃣ 스페인어 라틴 채널**
```json
{
  "channel_name": "Éxito Latino",
  "channel_language": "spanish",
  "voice_preference": "spanish_latino_voice",
  "content_style": "passionate",
  "target_categories": ["Life Hacks", "Health Tips", "Relationships"],
  "peak_hours": [21, 22, 23],
  "veo3_priority": false,
  "schedule": "0 21 * * *"
}
```

## ⚙️ **채널별 로직 차이점**

### **VEO3 vs PEXELS 선택 로직**

```javascript
// 한국어/일본어 = 고CPM → VEO3 우선
if (channelConfig.channel_language === "korean" || channelConfig.channel_language === "japanese") {
  useVeo3 = true;
}

// 중국어/스페인어 = 대용량 → PEXELS 우선
if (channelConfig.channel_language === "chinese" || channelConfig.channel_language === "spanish") {
  useVeo3 = false;
}

// 영어 = 혼합 전략
if (channelConfig.channel_language === "english") {
  useVeo3 = targetData.time_slot === "morning" || targetData.time_slot === "evening";
}
```

### **시간대별 카테고리 조정**

```javascript
// 채널별 맞춤 카테고리
const channelCategories = {
  "korean": {
    "morning": ["Business Success (비즈니스 성공)", "Productivity Tips (생산성 팁)"],
    "evening": ["Wellness (웰빙)", "Relationships (인간관계)"]
  },
  "english": {
    "afternoon": ["Science Facts", "Tech Tips"],
    "night": ["Learning Methods", "Psychology"]
  },
  "japanese": {
    "evening": ["Health Tips (健康)", "Life Balance (生活)"]
  }
};
```

## 🚀 **배포 및 관리 방법**

### **1️⃣ 워크플로우 배포**
```bash
# 각 채널별 N8N 워크플로우 임포트
n8n import Upload2_Korean_Business.json
n8n import Upload2_English_Global.json
n8n import Upload2_Japanese_Premium.json
```

### **2️⃣ 스케줄링**
- **한국어**: 오전 7시, 저녁 7시 (한국 프라임타임)
- **영어**: 오후 2시, 밤 10시 (글로벌 타임존)
- **일본어**: 저녁 8시 (일본 프라임타임)
- **중국어**: 4시간마다 (대용량 생산)
- **스페인어**: 밤 9시 (라틴 아메리카 시간)

### **3️⃣ 모니터링**
각 채널별 성과 추적:
- CPM/RPM
- 조회수
- 참여율
- 수익

## 💡 **확장 전략**

### **새 채널 추가 시**:
1. Upload2.json 복사
2. Channel Config 수정
3. 언어별 로직 추가
4. 스케줄 설정
5. 테스트 실행

### **A/B 테스트**:
같은 언어로 2개 채널 운영:
- Upload2_Korean_Business_A.json (VEO3 전용)
- Upload2_Korean_Business_B.json (PEXELS 전용)

이렇게 하면 **채널별 최적화된 콘텐츠**를 자동 생성할 수 있습니다! 🎯