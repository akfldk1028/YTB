# Neo4j 설정 가이드 - YTB Books Project

## 현재 설정 (2026-01-20)

**GCP VM + Neo4j Community Edition 사용 중**

```
VM Name: neo4j-server
Zone: asia-northeast3-a (서울)
Machine Type: e2-small (2GB RAM)
External IP: 34.47.112.49
Neo4j Version: 2025.12.1
월 비용: ~$15
```

### 연결 정보

```env
NEO4J_URI=bolt://34.47.112.49:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=ytbbooks2026
NEO4J_DATABASE=neo4j
```

### 🤖 AI용 빠른 명령어 (복사해서 바로 사용)

```bash
# VM 상태 확인
gcloud compute instances describe neo4j-server --zone=asia-northeast3-a --format="get(status)"

# VM 시작 (TERMINATED 상태일 때)
gcloud compute instances start neo4j-server --zone=asia-northeast3-a

# VM 중지 (비용 절약)
gcloud compute instances stop neo4j-server --zone=asia-northeast3-a

# VM 재시작
gcloud compute instances reset neo4j-server --zone=asia-northeast3-a

# Neo4j 연결 테스트 (Python)
python -c "from neo4j import GraphDatabase; d=GraphDatabase.driver('bolt://34.47.112.49:7687', auth=('neo4j','ytbbooks2026')); d.verify_connectivity(); print('OK')"

# Neo4j 연결 테스트 (curl)
curl -s -u neo4j:ytbbooks2026 http://34.47.112.49:7474/db/neo4j/tx/commit -H "Content-Type: application/json" -d "{\"statements\":[{\"statement\":\"RETURN 1\"}]}"

# APOC 확인
curl -s -u neo4j:ytbbooks2026 -H "Content-Type: application/json" -d "{\"statements\":[{\"statement\":\"SHOW PROCEDURES YIELD name WHERE name STARTS WITH 'apoc' RETURN count(*) as apoc_count\"}]}" http://34.47.112.49:7474/db/neo4j/tx/commit

# SSH via IAP (Windows에서 더 안정적)
echo y | gcloud compute ssh neo4j-server --zone=asia-northeast3-a --tunnel-through-iap --command="sudo systemctl status neo4j"

# Neo4j 재시작 (SSH)
echo y | gcloud compute ssh neo4j-server --zone=asia-northeast3-a --tunnel-through-iap --command="sudo systemctl restart neo4j"
```

### 관리 명령어

```bash
# SSH 접속 (일반)
gcloud compute ssh neo4j-server --zone=asia-northeast3-a

# SSH 접속 (IAP 터널 - 더 안정적)
gcloud compute ssh neo4j-server --zone=asia-northeast3-a --tunnel-through-iap

# Neo4j 상태 확인
sudo systemctl status neo4j

# Neo4j 로그 확인
sudo journalctl -u neo4j -f

# Neo4j 재시작
sudo systemctl restart neo4j

# Neo4j Browser 접속
# http://34.47.112.49:7474
```

---

## 가격 비교

| 옵션 | 월 비용 | 장점 | 단점 |
|------|---------|------|------|
| **AuraDB Free** | $0 | 무료, 즉시 시작 | 200K 노드 제한 |
| **GCP VM + Neo4j** | ~$15 | 저렴, 제한 없음 | 직접 관리 필요 |
| **AuraDB Pro** | $65 | 관리형, 편함 | 비용 |
| **AuraDB Pro (Marketplace)** | $65 | GCP 크레딧 사용 가능 | 비용 |

---

## Cloud Run vs VM

| 항목 | Cloud Run | GCP VM |
|------|-----------|--------|
| Neo4j 실행 | ❌ 불가능 | ✅ 가능 |
| 이유 | Stateless (데이터 저장 안됨) | Stateful (디스크 있음) |
| 비용 | 사용량 기반 | 고정 비용 |

**결론**: Neo4j는 **VM 필수**

---

## 추천 설정

### Phase 1: 개발/테스트 (무료)

**AuraDB Free Tier 사용**

```
URL: https://console.neo4j.io/
Plan: Free
Limit: 200K nodes, 1 database
```

#### Step-by-Step 설정

1. **Neo4j Aura 콘솔 접속**
   ```
   https://console.neo4j.io/
   ```

2. **계정 생성/로그인**
   - Google 또는 이메일로 가입

3. **Free Instance 생성**
   - "New Instance" 클릭
   - "AuraDB Free" 선택
   - Instance Name: `ytb-books-dev`
   - Region: 아시아 (가까운 곳)
   - "Create" 클릭

4. **연결 정보 저장 (중요!)**
   ```
   ⚠️ 비밀번호는 생성 시 한 번만 표시됨!

   Connection URI: neo4j+s://xxxxxx.databases.neo4j.io
   Username: neo4j
   Password: (자동생성된 비밀번호)
   ```

5. **연결 테스트**
   ```bash
   cd D:\Data\00_Personal\YTB\short-video-maker\src\YTB-books-project\scripts

   # .env 파일 생성
   cp ..\.env.example .env
   # .env 파일 편집하여 연결 정보 입력

   # 테스트 실행
   python test_neo4j_connection.py
   ```

#### AuraDB Free 제한사항

| 항목 | 제한 |
|------|------|
| 노드 수 | 200,000개 |
| 관계 수 | 400,000개 |
| 데이터베이스 | 1개 |
| 저장공간 | ~500MB |
| 자동 일시중지 | 3일 미사용 시 |
| 삭제 | 30일 미사용 시 |

> **팁**: Free tier는 비활성 시 자동 일시중지됩니다.
> 연결하면 자동으로 다시 시작됩니다 (약 1분 소요)

### Phase 2: 프로덕션 (저렴한 방법) - 현재 사용 중

**GCP VM + Neo4j Community Edition**

#### Step 1: VM 생성

```bash
# VM 생성 (e2-small: ~$15/월)
gcloud compute instances create neo4j-server --zone=asia-northeast3-a --machine-type=e2-small --image-family=ubuntu-2204-lts --image-project=ubuntu-os-cloud --boot-disk-size=20GB --tags=neo4j
```

#### Step 2: 방화벽 규칙

```bash
# Neo4j 포트 열기 (7474: HTTP, 7687: Bolt)
gcloud compute firewall-rules create allow-neo4j --allow=tcp:7474,tcp:7687 --target-tags=neo4j
```

#### Step 3: SSH 접속 및 Java 설치

```bash
# SSH 접속
gcloud compute ssh neo4j-server --zone=asia-northeast3-a

# Java 17 설치
sudo apt update
sudo apt install -y openjdk-17-jre-headless
java -version  # 확인
```

#### Step 4: Neo4j 설치

```bash
# GPG 키 추가 (신규 방식)
curl -fsSL https://debian.neo4j.com/neotechnology.gpg.key | sudo gpg --dearmor -o /usr/share/keyrings/neo4j.gpg

# 저장소 추가
echo "deb [signed-by=/usr/share/keyrings/neo4j.gpg] https://debian.neo4j.com stable latest" | sudo tee /etc/apt/sources.list.d/neo4j.list

# Neo4j 설치
sudo apt update
sudo apt install -y neo4j
```

#### Step 5: 외부 접속 설정

```bash
# neo4j.conf 수정
sudo sed -i 's/#server.default_listen_address=0.0.0.0/server.default_listen_address=0.0.0.0/' /etc/neo4j/neo4j.conf
```

#### Step 6: 비밀번호 설정 (중요!)

```bash
# 방법 1: 첫 시작 전에 설정
sudo neo4j-admin dbms set-initial-password "your-password"

# 방법 2: 이미 시작된 경우 (DB 리셋 필요)
sudo systemctl stop neo4j
sudo rm -rf /var/lib/neo4j/data/databases/*
sudo rm -rf /var/lib/neo4j/data/transactions/*
sudo neo4j-admin dbms set-initial-password "your-password"
sudo systemctl start neo4j
```

#### Step 7: Neo4j 시작

```bash
sudo systemctl enable neo4j
sudo systemctl start neo4j
sudo systemctl status neo4j  # 확인
```

#### Step 8: 연결 테스트

```bash
# VM External IP 확인
gcloud compute instances describe neo4j-server --zone=asia-northeast3-a --format="get(networkInterfaces[0].accessConfigs[0].natIP)"

# 로컬에서 테스트
python -c "from neo4j import GraphDatabase; d=GraphDatabase.driver('bolt://34.47.112.49:7687', auth=('neo4j','ytbbooks2026')); d.verify_connectivity(); print('OK')"
```

#### Step 9: APOC 플러그인 설치 (llm-graph-builder 필수)

```bash
# SSH 접속
gcloud compute ssh neo4j-server --zone=asia-northeast3-a

# APOC Core 다운로드
cd /var/lib/neo4j/plugins
sudo wget https://github.com/neo4j/apoc/releases/download/2025.12.1/apoc-2025.12.1-core.jar

# APOC Extended 다운로드
sudo wget https://github.com/neo4j-contrib/neo4j-apoc-procedures/releases/download/2025.12.0/apoc-2025.12.0-extended.jar

# neo4j.conf 설정 추가
echo 'dbms.security.procedures.allowlist=apoc.*' | sudo tee -a /etc/neo4j/neo4j.conf
echo 'dbms.security.procedures.unrestricted=apoc.*' | sudo tee -a /etc/neo4j/neo4j.conf

# Neo4j 재시작
sudo systemctl restart neo4j

# APOC 확인
cypher-shell -u neo4j -p ytbbooks2026 "RETURN apoc.version()"
```

### Phase 3: 프로덕션 (편한 방법)

**GCP Marketplace - AuraDB Pro**

```
URL: https://console.cloud.google.com/marketplace/product/endpoints/prod.n4gcp.neo4j.io
Cost: $65/월 (GCP 크레딧 사용 가능)
```

---

## VM 스펙 추천

| 용도 | Machine Type | RAM | 월 비용 |
|------|--------------|-----|---------|
| 개발/소규모 | e2-small | 2GB | ~$15 |
| 중규모 | e2-medium | 4GB | ~$30 |
| 대규모 | e2-standard-2 | 8GB | ~$60 |

---

## 연결 정보

### AuraDB
```env
NEO4J_URI=neo4j+s://xxxxx.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your-password
NEO4J_DATABASE=neo4j
```

### Self-hosted VM
```env
NEO4J_URI=bolt://[VM_EXTERNAL_IP]:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your-password
NEO4J_DATABASE=neo4j
```

---

## llm-graph-builder 연동

### 환경 변수 (.env)

```env
# Neo4j 연결
NEO4J_URI=neo4j+s://xxxxx.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=xxxxx
NEO4J_DATABASE=neo4j

# LLM 설정 (최소 1개)
LLM_MODEL_CONFIG_gemini_2_0_flash="gemini-2.0-flash"
# 또는
LLM_MODEL_CONFIG_openai_gpt_4o="gpt-4o,sk-xxxxx"

# Embedding
EMBEDDING_MODEL=vertexai  # 또는 openai
```

### 테스트 실행

```bash
cd D:\Data\00_Personal\YTB\NEB\backend

# 의존성 설치
pip install -r requirements.txt

# 서버 실행
uvicorn score:app --reload --port 8000

# API 테스트
curl http://localhost:8000/health
```

---

## 비용 요약

| 구성 | 월 비용 |
|------|---------|
| **개발**: AuraDB Free | $0 |
| **프로덕션 저렴**: VM (e2-small) + Neo4j Community | ~$15 |
| **프로덕션 편함**: AuraDB Pro (Marketplace) | $65 |

---

## 🤖 llm-graph-builder 빠른 시작 (AI용)

### 서버 시작

```bash
# 1. 가상환경 활성화 및 서버 시작
cd D:\Data\00_Personal\YTB\NEB\backend
.\venv\Scripts\activate
uvicorn score:app --host 0.0.0.0 --port 8000

# 2. 헬스체크
curl -s http://localhost:8000/health
# {"healthy":true}

# 3. Neo4j 연결 테스트
curl -s -X POST http://localhost:8000/connect -H "Content-Type: application/x-www-form-urlencoded" -d "uri=bolt://34.47.112.49:7687" -d "userName=neo4j" -d "password=ytbbooks2026" -d "database=neo4j"
```

### GCP ADC 인증 (Gemini 사용 시 필요)

```bash
# Application Default Credentials 설정
gcloud auth application-default login

# 인증 상태 확인
gcloud auth application-default print-access-token
```

### Wikipedia 그래프 생성

```bash
# 1. 소스 생성 (URL scan)
curl -s -X POST http://localhost:8000/url/scan -H "Content-Type: application/x-www-form-urlencoded" -d "uri=bolt://34.47.112.49:7687" -d "userName=neo4j" -d "password=ytbbooks2026" -d "database=neo4j" -d "wiki_query=https://en.wikipedia.org/wiki/Hayao_Miyazaki" -d "source_type=Wikipedia" -d "model=gemini_2_0_flash"

# 2. 그래프 추출
curl -s -X POST http://localhost:8000/extract -H "Content-Type: application/x-www-form-urlencoded" -d "uri=bolt://34.47.112.49:7687" -d "userName=neo4j" -d "password=ytbbooks2026" -d "database=neo4j" -d "wiki_query=Hayao_Miyazaki" -d "source_type=Wikipedia" -d "model=gemini_2_0_flash" -d "file_name=Hayao_Miyazaki" -d "language=en" -d "token_chunk_size=10000" -d "chunk_overlap=200"
```

### 주요 API 엔드포인트

| Endpoint | Method | 설명 |
|----------|--------|------|
| `/health` | GET | 헬스체크 |
| `/connect` | POST | Neo4j 연결 |
| `/url/scan` | POST | URL 소스 스캔 (YouTube, Wikipedia) |
| `/upload` | POST | 파일 업로드 (PDF, 텍스트) |
| `/extract` | POST | 그래프 추출 |
| `/chat_bot` | POST | GraphRAG QA |
| `/docs` | GET | Swagger API 문서 |

---

**Last Updated**: 2026-01-20
**Version**: 1.2 (AI용 빠른 명령어 추가)
