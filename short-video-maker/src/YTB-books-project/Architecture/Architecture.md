# YTB-Books-Project Architecture

## 책/논문 → Neo4j GraphRAG → 미야자키 스타일 숏츠 자동 생성

**Project**: dkdk-474008
**Created**: 2026-01-20
**Status**: Architecture Design Phase

---

## 1. 프로젝트 개요

### 1.1 목표
책이나 논문을 Neo4j 그래프 데이터베이스로 청킹하고, 청킹된 순서대로 **미야자키 하야오(지브리) 스타일**의 YouTube Shorts를 자동 생성한다.

### 1.2 핵심 아이디어
```
[책/논문 PDF]
    → [Neo4j 지식그래프 청킹]
    → [순서대로 씬 스크립트 생성]
    → [지브리 스타일 이미지 생성 (GPT-4o)]
    → [VEO3 I2V 비디오 변환]
    → [TTS + 자막 합성]
    → [YouTube Shorts 업로드]
```

### 1.3 관련 연구 및 레퍼런스

| 논문/프로젝트 | 핵심 내용 | 링크 |
|--------------|----------|------|
| **GraphRAG Survey** (arXiv 2501.00309) | 지식그래프 기반 RAG 아키텍처 | [arxiv.org](https://arxiv.org/abs/2501.00309) |
| **Long Story Generation via KG** (arXiv 2508.03137) | 지식그래프 + 문학이론 기반 장편 스토리 생성 | [arxiv.org](https://arxiv.org/abs/2508.03137) |
| **Guiding Generative Storytelling with KG** | 지식그래프로 LLM 스토리텔링 가이드 | [arxiv.org](https://arxiv.org/html/2505.24803v2) |
| **Animate-A-Story** (arXiv 2307.06940) | RAG 기반 비디오 스토리텔링 | [arxiv.org](https://ar5iv.labs.arxiv.org/html/2307.06940) |
| **Neo4j LLM Knowledge Graph Builder** | PDF → 지식그래프 자동 구축 | [neo4j.com](https://neo4j.com/blog/developer/knowledge-graph-extraction-challenges/) |
| **LightRAG** (EMNLP 2025) | 빠른 GraphRAG with Neo4j | [github.com](https://github.com/HKUDS/LightRAG) |
| **GPT-4o 지브리 스타일** (2025.03) | OpenAI 이미지 생성 바이럴 | [CNN](https://www.cnn.com/2025/03/27/style/chatgpt-studio-ghibli-ai-images-intl-hnk) |

---

## 2. 시스템 아키텍처

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         YTB-Books-Project                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────────┐   │
│  │   Data       │    │   Graph      │    │   Content Generation     │   │
│  │   Ingestion  │───▶│   Engine     │───▶│   Pipeline               │   │
│  │              │    │   (Neo4j)    │    │                          │   │
│  └──────────────┘    └──────────────┘    └──────────────────────────┘   │
│         │                   │                        │                   │
│         ▼                   ▼                        ▼                   │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────────┐   │
│  │ • PDF Parser │    │ • Chunking   │    │ • Scene Generator        │   │
│  │ • EPUB Parse │    │ • Entity     │    │ • Ghibli Image (GPT-4o)  │   │
│  │ • Metadata   │    │   Extraction │    │ • VEO3 I2V               │   │
│  │              │    │ • Embedding  │    │ • TTS + Subtitles        │   │
│  └──────────────┘    └──────────────┘    └──────────────────────────┘   │
│                                                     │                    │
│                                                     ▼                    │
│                              ┌──────────────────────────────────────┐   │
│                              │  Existing YTB Infrastructure         │   │
│                              │  • ConsistentShortsWorkflow          │   │
│                              │  • CharacterStorageService (GCS)     │   │
│                              │  • YouTubeUploader                   │   │
│                              └──────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 데이터 흐름

```
Step 1: 데이터 수집 (Ingestion)
┌─────────────┐
│   PDF/EPUB  │
│   Upload    │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────┐
│  DocumentProcessor              │
│  • 텍스트 추출                   │
│  • 메타데이터 (제목, 저자, 챕터)  │
└──────────────┬──────────────────┘
               │
               ▼
Step 2: 그래프 청킹 (Graph Chunking)
┌─────────────────────────────────┐
│  ChunkingService                │
│  • 토큰 기반 분할 (500-1000)     │
│  • 챕터/섹션 단위                │
│  • 의미 단위 청킹                │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│  EntityExtractor (LLM)          │
│  • 캐릭터 추출                   │
│  • 장소/배경 추출                │
│  • 이벤트/줄거리 추출            │
│  • 관계 추출                     │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│  Neo4j GraphBuilder             │
│  • 노드 생성 (Chunk, Character) │
│  • 관계 생성 (NEXT_CHUNK, ...)  │
│  • 벡터 임베딩 저장              │
└──────────────┬──────────────────┘
               │
               ▼
Step 3: 씬 생성 (Scene Generation)
┌─────────────────────────────────┐
│  SceneGenerator                 │
│  • 청크 순서대로 조회            │
│  • 내레이션 텍스트 생성          │
│  • 지브리 스타일 프롬프트 생성   │
│  • 캐릭터 일관성 추적            │
└──────────────┬──────────────────┘
               │
               ▼
Step 4: 이미지/비디오 생성
┌─────────────────────────────────┐
│  GhibliImageService             │
│  • GPT-4o 이미지 생성            │
│  • 캐릭터 레퍼런스 유지          │
│  • VEO3 I2V 변환 (선택)         │
└──────────────┬──────────────────┘
               │
               ▼
Step 5: 최종 합성
┌─────────────────────────────────┐
│  BookToShortsWorkflow           │
│  • TTS 음성 생성                 │
│  • 자막 오버레이                 │
│  • BGM 믹싱                      │
│  • 최종 MP4 출력                 │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│  YouTube Upload (Optional)      │
└─────────────────────────────────┘
```

### 2.3 청킹 파이프라인 상세 (v1.2 신규)

> **연구 기반 결정사항** (웹 검색 결과)
> - NVIDIA 벤치마크: 512 tokens 최적 (0.648 accuracy)
> - Semantic chunking: 9% recall 개선 효과
> - 오버랩: 10-20% (50-100 tokens)
> - RecursiveCharacterTextSplitter: 400-512 tokens 권장

#### 청킹 전략 비교

| 전략 | 토큰 수 | 오버랩 | 특징 | 용도 |
|-----|--------|--------|------|------|
| **Token (권장)** | 512 | 50-100 (10-20%) | 균일한 크기, 빠른 처리 | 일반 책/논문 |
| Recursive | 400-512 | 동적 | 문장/문단 경계 존중 | 구조화된 문서 |
| Semantic | 가변 | 없음 | 의미 단위 분할 | 학술 논문 |
| Page | 페이지당 | 없음 | 원본 구조 유지 | PDF 레이아웃 중요 |

#### TokenChunker 알고리즘

```typescript
// TokenChunker 핵심 로직
async chunk(text: string, config: ChunkingConfig): Promise<Chunk[]> {
  const tokens = this.tiktoken.encode(text);
  const chunks: Chunk[] = [];

  let position = 0;
  let order = 0;

  while (position < tokens.length) {
    // 1. 청크 범위: position → position + 512
    const endPos = Math.min(position + config.tokenLimit, tokens.length);

    // 2. 자연스러운 경계 찾기 (문장 끝 . ! ?)
    const adjustedEnd = this.findNaturalBreak(tokens, endPos);

    // 3. 청크 생성
    const chunkTokens = tokens.slice(position, adjustedEnd);
    chunks.push({
      id: uuid(),
      order: order++,
      text: this.tiktoken.decode(chunkTokens),
      tokenCount: chunkTokens.length,
      overlapWithPrev: order > 0 ? config.overlapTokens : 0,
    });

    // 4. 오버랩 적용 (다음 시작점)
    position = adjustedEnd - config.overlapTokens;
  }

  return chunks;
}
```

#### 한국어 처리 특수사항

```typescript
// 한국어 문장 끝 패턴
const KOREAN_SENTENCE_END = /[.!?。？！]|다\.|요\.|음\.|죠\.|네\./;

// 한국어 문단 구분
const KOREAN_PARAGRAPH = /\n\n|\r\n\r\n/;
```

### 2.4 2-Step Entity Extraction (v1.2 신규)

> **연구 기반**: 2단계 추출이 1단계보다 정확도 20% 향상
> - Step 1: 엔티티만 추출 (노이즈 감소)
> - Step 2: 추출된 엔티티 간 관계만 찾기 (컨텍스트 제공)

```
┌───────────────────────────────────────────────────────────┐
│                  2-Step Entity Extraction                 │
├───────────────────────────────────────────────────────────┤
│                                                           │
│  [Chunk 텍스트]                                           │
│       │                                                   │
│       ▼                                                   │
│  ┌─────────────────────────────────────┐                  │
│  │  Step 1: Entity Identification       │                  │
│  │  • 캐릭터, 장소, 이벤트 추출         │                  │
│  │  • 이름, 타입, 설명 추출             │                  │
│  │  • 중복 병합                         │                  │
│  └─────────────────┬───────────────────┘                  │
│                    │                                      │
│                    ▼                                      │
│         [추출된 엔티티 목록]                               │
│                    │                                      │
│                    ▼                                      │
│  ┌─────────────────────────────────────┐                  │
│  │  Step 2: Relationship Mapping        │                  │
│  │  • 청크 내 등장 엔티티 필터           │                  │
│  │  • 엔티티 쌍 간 관계 추출            │                  │
│  │  • 관계 타입, 강도, 컨텍스트         │                  │
│  └─────────────────┬───────────────────┘                  │
│                    │                                      │
│                    ▼                                      │
│         [엔티티 + 관계 그래프]                             │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

#### Entity Extraction 프롬프트

```typescript
// Step 1: Entity Identification
const ENTITY_EXTRACTION_PROMPT = (text: string) => `
다음 텍스트에서 중요한 엔티티를 추출하세요.

텍스트:
"""
${text}
"""

JSON 형식으로 응답:
{
  "entities": [
    {
      "name": "엔티티 이름",
      "type": "character|place|event|concept",
      "description": "간단한 설명",
      "importance": "main|supporting|minor"
    }
  ]
}
`;

// Step 2: Relationship Mapping
const RELATIONSHIP_EXTRACTION_PROMPT = (text: string, entities: string[]) => `
다음 텍스트에서 주어진 엔티티들 간의 관계를 찾으세요.

텍스트:
"""
${text}
"""

엔티티 목록: ${entities.join(', ')}

JSON 형식으로 응답:
{
  "relationships": [
    {
      "source": "소스 엔티티",
      "target": "타겟 엔티티",
      "type": "friend|enemy|family|located_in|causes",
      "description": "관계 설명",
      "confidence": 0.0-1.0
    }
  ]
}
`;
```

### 2.5 통합 그래프 구조 (v1.4 - 멀티북 설계)

> **llm-graph-builder 레퍼런스** (neo4j-labs)
> - Repository: `D:\Data\00_Personal\YTB\NEB\`
> - 핵심 패턴: **Book** → Document → Chunk → Entity → Community
> - **v1.4 신규**: 멀티북 지원 - 하나의 Neo4j에서 여러 책 관리

#### 멀티북 아키텍처

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Neo4j 멀티북 그래프 구조                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐                             │
│  │  Book A  │   │  Book B  │   │  Book C  │   ... (무제한)              │
│  │ (해리포터)│   │ (반지전쟁)│   │ (나르니아)│                             │
│  └────┬─────┘   └────┬─────┘   └────┬─────┘                             │
│       │              │              │                                    │
│       └──────────────┴──────────────┘                                    │
│                      │                                                   │
│              [:HAS_DOCUMENT]                                             │
│                      │                                                   │
│                      ▼                                                   │
│              ┌────────────┐                                              │
│              │  Document  │  ← 각 책은 1개 또는 여러 Document 가질 수 있음  │
│              └────────────┘                                              │
│                                                                          │
│  ** Book 노드 속성 **                                                    │
│  - id: "book-uuid"                                                      │
│  - title: "해리 포터와 마법사의 돌"                                        │
│  - author: "J.K. 롤링"                                                   │
│  - genre: "fantasy"                                                     │
│  - language: "ko"                                                       │
│  - created_at: datetime                                                 │
│  - status: "processing" | "completed" | "failed"                        │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

#### 상세 그래프 구조

```
┌─────────────────────────────────────────────────────────────────────────┐
│              Neo4j GraphRAG 통합 그래프 (llm-graph-builder 스타일)        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                    Lexical Graph (문서 구조)                        │  │
│  │                                                                    │  │
│  │  (Book)──[:HAS_DOCUMENT]→(Document)──[:PART_OF]←─(Chapter)         │  │
│  │       │                      │                                     │  │
│  │       │                 [:PART_OF]                                 │  │
│  │       │                      │                                     │  │
│  │       └──[:FIRST_CHUNK]→(Chunk)←[:PART_OF]────────────────┐        │  │
│  │                          │                                  │       │  │
│  │                    [:NEXT_CHUNK]──────────────────────────────────→│  │
│  │                          │                                         │  │
│  │                    [:SIMILAR] ←─ (벡터 유사도 기반)                 │  │
│  │                                                                    │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                             │                                            │
│                       [:HAS_ENTITY]                                      │
│                             │                                            │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                  Semantic Graph (의미 구조)                          │  │
│  │                                                                    │  │
│  │  (__Entity__)──[:RELATIONSHIP_TYPE]──▶(__Entity__)                 │  │
│  │       │                                    │                       │  │
│  │       │  Labels: Character, Place, Event, Concept                  │  │
│  │       │                                                            │  │
│  │       └──[:IN_COMMUNITY]──▶(__Community__)                         │  │
│  │                                   │                                │  │
│  │                          [:PARENT_COMMUNITY]                       │  │
│  │                                   │                                │  │
│  │                            (__Community__)  ← Level 1              │  │
│  │                                   │                                │  │
│  │                          [:PARENT_COMMUNITY]                       │  │
│  │                                   │                                │  │
│  │                            (__Community__)  ← Level 2              │  │
│  │                                                                    │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

#### 관계 타입 상세 (llm-graph-builder 기준)

| 관계 | 소스 | 타겟 | 설명 |
|-----|------|------|------|
| `HAS_DOCUMENT` | Book | Document | **v1.4**: 책 → 문서 연결 |
| `PART_OF` | Chunk, Chapter | Document, Chapter | 문서 구조 |
| `FIRST_CHUNK` | Document | Chunk | 첫 번째 청크 바로가기 |
| `NEXT_CHUNK` | Chunk | Chunk | 순차 연결 (순서 보장) |
| `SIMILAR` | Chunk | Chunk | 벡터 유사도 연결 |
| `HAS_ENTITY` | Chunk | __Entity__ | 청크 내 엔티티 |
| `IN_COMMUNITY` | __Entity__ | __Community__ | 커뮤니티 소속 (Level 0) |
| `PARENT_COMMUNITY` | __Community__ | __Community__ | 계층 커뮤니티 (Level 1, 2, 3) |

### 2.6 커뮤니티 감지 - Leiden Algorithm (v1.3 신규)

> **llm-graph-builder 분석 결과** (`backend/src/communities.py`)
> - 알고리즘: Leiden (Neo4j GDS)
> - 계층: 3 Level (Base → Level 1 → Level 2)
> - 요약: LLM으로 Community Summary 생성
> - 임베딩: Community Summary → Vector Embedding

```
┌───────────────────────────────────────────────────────────────┐
│                  Leiden Community Detection                    │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  Step 1: Graph Projection                                     │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  MATCH (source:__Entity__)-[]->(target:__Entity__)      │  │
│  │  → GDS Graph Projection (weighted, undirected)          │  │
│  └─────────────────────────────────────────────────────────┘  │
│                          │                                    │
│                          ▼                                    │
│  Step 2: Leiden Algorithm                                     │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  gds.leiden.write(                                      │  │
│  │    graph_project,                                       │  │
│  │    writeProperty="communities",                         │  │
│  │    includeIntermediateCommunities=True,                 │  │
│  │    maxLevels=3,               # ⭐ 3단계 계층           │  │
│  │    minCommunitySize=1                                   │  │
│  │  )                                                      │  │
│  └─────────────────────────────────────────────────────────┘  │
│                          │                                    │
│                          ▼                                    │
│  Step 3: Community Hierarchy                                  │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  Entity ─[:IN_COMMUNITY]→ Community (Level 0)           │  │
│  │                                │                        │  │
│  │                   [:PARENT_COMMUNITY]                   │  │
│  │                                │                        │  │
│  │                         Community (Level 1)             │  │
│  │                                │                        │  │
│  │                   [:PARENT_COMMUNITY]                   │  │
│  │                                │                        │  │
│  │                         Community (Level 2)             │  │
│  └─────────────────────────────────────────────────────────┘  │
│                          │                                    │
│                          ▼                                    │
│  Step 4: Community Summarization (LLM)                        │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  Input: Community 내 모든 Entity + Relationship          │  │
│  │  Output: title (4단어), summary (자연어)                 │  │
│  └─────────────────────────────────────────────────────────┘  │
│                          │                                    │
│                          ▼                                    │
│  Step 5: Community Embedding                                  │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  summary → text-embedding → community_vector 인덱스      │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

#### TypeScript 구현 참조

```typescript
// graph/community/CommunityService.ts
export class CommunityService {
  /**
   * Leiden 커뮤니티 감지 (Neo4j GDS 사용)
   */
  async detectCommunities(): Promise<void> {
    await this.neo4j.run(`
      CALL gds.leiden.write('entity_graph', {
        writeProperty: 'communities',
        includeIntermediateCommunities: true,
        maxLevels: 3,
        minCommunitySize: 1
      })
    `);
  }

  /**
   * 커뮤니티 요약 생성 (LLM)
   */
  async summarizeCommunities(): Promise<void> {
    const communities = await this.neo4j.run(`
      MATCH (c:__Community__)<-[:IN_COMMUNITY]-(e)
      WHERE c.level = 0
      RETURN c.id AS communityId,
             collect({id: e.id, description: e.description}) AS nodes
    `);

    for (const community of communities) {
      const summary = await this.llm.generateCommunitySummary(community.nodes);
      await this.neo4j.run(`
        MATCH (c:__Community__ {id: $id})
        SET c.title = $title, c.summary = $summary
      `, { id: community.communityId, ...summary });
    }
  }
}
```

---

## 3. Neo4j 그래프 스키마

### 3.1 노드 타입

```cypher
// 책/논문 메타데이터
CREATE (:Book {
  id: 'book-uuid',
  title: '책 제목',
  author: '저자',
  type: 'book',           // 'book' | 'paper' | 'article'
  totalChunks: 25,
  totalPages: 300,
  language: 'korean',
  createdAt: datetime()
})

// 청킹된 콘텐츠 (핵심 노드)
CREATE (:Chunk {
  id: 'chunk-uuid',
  bookId: 'book-uuid',
  order: 1,               // ⭐ 순서 (숏츠 생성 순서)
  text: '원본 텍스트...',
  summary: 'LLM이 생성한 요약',
  keywords: ['키워드1', '키워드2'],
  embedding: [0.1, 0.2, ...],  // 벡터 임베딩

  // 씬 생성용
  sceneNarration: '내레이션 텍스트',
  imagePrompt: 'Studio Ghibli style, ...',
  videoPrompt: 'gentle camera movement, ...',

  // 메타데이터
  chapter: '1장',
  pageStart: 1,
  pageEnd: 12,
  wordCount: 500
})

// 캐릭터/등장인물
CREATE (:Character {
  id: 'char-uuid',
  name: '주인공',
  nameEnglish: 'Protagonist',
  description: '키 작은 소년, 갈색 머리...',
  ghibliDescription: 'small boy with warm brown eyes, Ghibli style',
  referenceImagePath: 'gs://bucket/characters/char-uuid.png',
  firstAppearanceChunk: 'chunk-uuid',
  importance: 'main'      // 'main' | 'supporting' | 'minor'
})

// 장소/배경
CREATE (:Place {
  id: 'place-uuid',
  name: '숲속 마을',
  description: '울창한 숲에 둘러싸인 작은 마을',
  ghibliDescription: 'lush green forest village, Miyazaki aesthetic',
  atmosphere: 'peaceful, nostalgic'
})

// 이벤트/줄거리
CREATE (:Event {
  id: 'event-uuid',
  description: '주인공이 마법의 문을 발견한다',
  importance: 0.9,
  emotionalTone: 'wonder'
})

// 개념/주제 (논문용)
CREATE (:Concept {
  id: 'concept-uuid',
  name: 'GraphRAG',
  definition: '그래프 기반 검색 증강 생성',
  relatedTerms: ['Knowledge Graph', 'RAG', 'LLM']
})
```

### 3.2 관계 타입

```cypher
// ⭐ 청크 순서 (숏츠 생성 순서 결정)
(c1:Chunk)-[:NEXT_CHUNK {gap: 0}]->(c2:Chunk)

// 책-청크 소속
(b:Book)-[:HAS_CHUNK]->(c:Chunk)

// 캐릭터 언급
(c:Chunk)-[:MENTIONS {
  count: 3,
  firstMention: true
}]->(char:Character)

// 장소 등장
(c:Chunk)-[:OCCURS_IN {
  prominence: 'primary'   // 'primary' | 'background'
}]->(p:Place)

// 이벤트 발생
(c:Chunk)-[:DESCRIBES {
  detailLevel: 'detailed'
}]->(e:Event)

// 캐릭터 간 관계
(c1:Character)-[:RELATES_TO {
  type: 'friend',         // 'friend', 'enemy', 'family', 'mentor'
  description: '어린 시절 친구'
}]->(c2:Character)

// 개념 연결 (논문용)
(c:Chunk)-[:EXPLAINS]->(concept:Concept)
(concept1:Concept)-[:RELATED_TO]->(concept2:Concept)
```

### 3.3 인덱스 및 제약조건 (v1.4 업데이트: 멀티북 + llm-graph-builder 패턴)

> **Neo4j v6 Driver 사용** - native Vector type 지원
> **llm-graph-builder 참조**: entity_vector, community_vector (384 dim)

```cypher
// ===== 제약조건 =====
CREATE CONSTRAINT document_id IF NOT EXISTS
  FOR (d:Document) REQUIRE d.id IS UNIQUE;

CREATE CONSTRAINT chunk_id IF NOT EXISTS
  FOR (c:Chunk) REQUIRE c.id IS UNIQUE;

CREATE CONSTRAINT character_id IF NOT EXISTS
  FOR (char:Character) REQUIRE char.id IS UNIQUE;

CREATE CONSTRAINT place_id IF NOT EXISTS
  FOR (p:Place) REQUIRE p.id IS UNIQUE;

// v1.3 신규: Entity, Community 제약조건
CREATE CONSTRAINT entity_id IF NOT EXISTS
  FOR (e:__Entity__) REQUIRE e.id IS UNIQUE;

CREATE CONSTRAINT community_id IF NOT EXISTS
  FOR (c:__Community__) REQUIRE c.id IS UNIQUE;

// v1.4 신규: Book 제약조건 (멀티북 지원)
CREATE CONSTRAINT book_id IF NOT EXISTS
  FOR (b:Book) REQUIRE b.id IS UNIQUE;

// ===== 인덱스 =====

// 순서 기반 조회 최적화
CREATE INDEX chunk_order IF NOT EXISTS
  FOR (c:Chunk) ON (c.documentId, c.order);

// 캐릭터 이름 검색
CREATE INDEX character_name IF NOT EXISTS
  FOR (char:Character) ON (char.name);

// ⭐ Neo4j 6.x Vector Index (native)
CREATE VECTOR INDEX chunk_embedding IF NOT EXISTS
FOR (c:Chunk) ON c.embedding
OPTIONS {
  indexConfig: {
    `vector.dimensions`: 1536,
    `vector.similarity_function`: 'cosine'
  }
};

CREATE VECTOR INDEX character_embedding IF NOT EXISTS
FOR (char:Character) ON char.embedding
OPTIONS {
  indexConfig: {
    `vector.dimensions`: 1536,
    `vector.similarity_function`: 'cosine'
  }
};

// ⭐ v1.3 신규: llm-graph-builder 패턴 인덱스

// Entity 벡터 인덱스 (384 dim - all-MiniLM-L6-v2)
CREATE VECTOR INDEX entity_vector IF NOT EXISTS
FOR (e:__Entity__) ON e.embedding
OPTIONS {
  indexConfig: {
    `vector.dimensions`: 384,
    `vector.similarity_function`: 'cosine'
  }
};

// Community 벡터 인덱스 (384 dim - all-MiniLM-L6-v2)
CREATE VECTOR INDEX community_vector IF NOT EXISTS
FOR (c:__Community__) ON c.embedding
OPTIONS {
  indexConfig: {
    `vector.dimensions`: 384,
    `vector.similarity_function`: 'cosine'
  }
};

// 전문 검색 인덱스
CREATE FULLTEXT INDEX chunk_text IF NOT EXISTS
  FOR (c:Chunk) ON EACH [c.text, c.summary];

// v1.3 신규: Community 키워드 전문 검색
CREATE FULLTEXT INDEX community_keyword IF NOT EXISTS
  FOR (c:__Community__) ON EACH [c.summary];
```

### 3.4 주요 쿼리 패턴

```cypher
// 1. 청크 순서대로 조회 (숏츠 생성용)
MATCH (b:Book {id: $bookId})-[:HAS_CHUNK]->(c:Chunk)
RETURN c ORDER BY c.order

// 2. 특정 청크의 등장 캐릭터 조회
MATCH (c:Chunk {id: $chunkId})-[:MENTIONS]->(char:Character)
RETURN char

// 3. 캐릭터가 등장하는 모든 청크 조회
MATCH (char:Character {name: $name})<-[:MENTIONS]-(c:Chunk)
RETURN c ORDER BY c.order

// 4. 청크 체인 탐색 (연결된 스토리)
MATCH path = (start:Chunk {order: 1})-[:NEXT_CHUNK*]->(end:Chunk)
WHERE start.bookId = $bookId
RETURN path

// 5. 유사 청크 검색 (벡터 기반)
MATCH (c:Chunk)
WHERE c.bookId = $bookId
CALL db.index.vector.queryNodes('chunk_embedding', 5, $queryEmbedding)
YIELD node, score
RETURN node, score
```

---

## 4. 이미지 생성 전략

### 4.1 2025-2026 최신 이미지 생성 모델 비교

> **Last Updated**: 2026-01-20 (웹 검색 기반)

#### 주요 모델 비교

| 모델 | 출시일 | Character Consistency | Reference Images | 지브리 스타일 | 비용 |
|-----|--------|----------------------|------------------|-------------|------|
| **GPT Image 1.5** ⭐ | 2025.12 | ✅ 네이티브 지원 | ✅ 편집 모드 | ✅ 우수 | ~$0.03 |
| **Imagen 4** | 2025.05 | ⚠️ 시드 기반만 | ❌ | ⚠️ 보통 | $0.03 |
| **NANO BANANA** | 2024~ | ✅ referenceImages | ✅ 최대 3개 | ⚠️ 보통 | 저렴 |
| **HiDream-E1.1** | 2025.07 | ⚠️ 편집 모드 | ✅ 이미지 입력 | ✅ 직접 지원 | 무료 |
| **Midjourney V7** | 2025 | ✅ --cref | ✅ 0.6-0.8 | ✅ Niji 모드 | 구독 |
| **FLUX.2** | 2025.11 | ⚠️ LoRA 필요 | ⚠️ | ⚠️ | 다양 |

#### GPT Image 1.5 핵심 특징 (2025.12.16 출시)

> "첫 번째 일반 모델에서 LoRA나 커스텀 파이프라인 없이 캐릭터 일관성 달성 가능"
> — [OpenAI GPT Image 1.5](https://platform.openai.com/docs/models/gpt-image-1.5)

- **Character Consistency**: 네이티브 지원 (앵커 설명 + 레퍼런스 이미지)
- **정밀 편집**: 얼굴/로고 보존
- **속도**: GPT Image 1 대비 4배 빠름
- **비용**: GPT Image 1 대비 20% 저렴

#### HiDream-E1.1 (오픈소스 대안)

> "Convert the image into a Ghibli style" 명령어로 직접 변환 가능
> — [HiDream-E1 GitHub](https://github.com/HiDream-ai/HiDream-E1)

- **라이센스**: MIT (완전 무료)
- **파라미터**: 17B
- **제한**: GPU 요구사항 높음 (A100 40GB+)

**Sources:**
- [GPT Image 1.5 Released](https://datanorth.ai/news/openai-gpt-image-1-5-released)
- [Imagen 4 TechCrunch](https://techcrunch.com/2025/05/20/imagen-4-is-googles-newest-ai-image-generator/)
- [Best AI Image Generators 2026](https://beebom.com/best-ai-image-generator/)

### 4.2 지브리 스타일 프롬프트 템플릿

```typescript
const GHIBLI_STYLE_BASE = `
Studio Ghibli anime style, hand-drawn animation aesthetic,
soft watercolor palette with warm golden tones,
nostalgic and dreamlike atmosphere,
intricate nature details with flowing organic movement,
Hayao Miyazaki inspired visual storytelling
`;

const GHIBLI_SCENE_TEMPLATE = (scene: string, characters: string[]) => `
${GHIBLI_STYLE_BASE}

Scene: ${scene}

Characters present: ${characters.join(', ')}

Additional style notes:
- Soft diffused lighting, golden hour ambiance
- Rich environmental details (grass, clouds, trees)
- Expressive character faces with large emotive eyes
- Gentle color gradients, no harsh shadows
- 9:16 portrait aspect ratio for YouTube Shorts
`;
```

### 4.3 권장 전략: GPT Image 1.5 단일 파이프라인 ⭐⭐⭐

> **2026-01 업데이트**: GPT Image 1.5의 네이티브 Character Consistency로 하이브리드 불필요

```
[캐릭터 첫 등장]
┌─────────────────────────────────────┐
│ GPT Image 1.5로 기본 캐릭터 생성      │
│ - 지브리 스타일 프롬프트              │
│ - "앵커 설명" 저장 (freckles, hair...) │
│ - GCS에 레퍼런스 이미지 저장          │
└─────────────────────────────────────┘
          │
          ▼
[이후 모든 씬]
┌─────────────────────────────────────┐
│ GPT Image 1.5 편집 모드              │
│ - 이전 이미지 + 앵커 설명 입력        │
│ - "same character, new scene" 프롬프트│
│ - 얼굴/스타일 자동 보존               │
└─────────────────────────────────────┘
          │
          ▼
[비디오 생성]
┌─────────────────────────────────────┐
│ VEO3 I2V 또는 Static 비디오          │
└─────────────────────────────────────┘
```

**장점:**
- ✅ 네이티브 Character Consistency (검증됨)
- ✅ 단일 API로 유지보수 단순화
- ✅ 지브리 스타일 최고 품질
- ✅ LoRA/커스텀 파이프라인 불필요

**비용 비교 (10 씬 기준):**
| 전략 | 계산 | 비용 | 일관성 |
|-----|------|------|--------|
| GPT Image 1.5 | $0.03 × 10 | $0.30 | ⭐⭐⭐ |
| GPT-4o Only | $0.04 × 10 | $0.40 | ⭐ |
| 하이브리드 (구) | $0.12 + Gemini × 10 | ~$0.20 | ⭐⭐ |

### 4.3.1 대안 전략: 하이브리드 (비용 최적화)

GPT Image 1.5 비용이 부담될 경우:

```
Step 1: GPT Image 1.5 캐릭터 레퍼런스 (1-3개)
          │
          ▼
Step 2: NANO BANANA + referenceImages (씬별)
          │
          ├── styleStrength: "strong"
          └── 비용: Gemini 기본
```

| 전략 | 일관성 | 지브리 품질 | 비용 | 복잡도 |
|-----|--------|-----------|------|--------|
| **GPT 1.5 Only** | ⭐⭐⭐ | ⭐⭐⭐ | 중간 | 낮음 |
| GPT 1.5 + NANO | ⭐⭐⭐ | ⭐⭐⭐ | 낮음 | 중간 |
| NANO Only | ⭐⭐ | ⭐⭐ | 최저 | 낮음 |

### 4.4 캐릭터 일관성 핵심 메커니즘

#### 기존 시스템 분석 (ConsistentShortsWorkflow)

현재 일관성은 NANO BANANA의 `referenceImages` 기능으로 유지됨:

```typescript
// ConsistentShortsWorkflow.ts:343-360
const referenceImages = [{
  data: characterImage.data,
  mimeType: characterImage.mimeType
}];

const result = await this.imageGenerationService.generateImages({
  prompt: scenePrompt,
  numberOfImages: 1,
  aspectRatio: aspectRatio,
  referenceImages: referenceImages  // ⭐ 일관성의 핵심!
});
```

#### NanoBananaService의 referenceImages 처리

```typescript
// NanoBananaService.ts:147-161
if (query.referenceImages && query.referenceImages.length > 0) {
  const maxReferenceImages = Math.min(query.referenceImages.length, 3);

  for (let i = 0; i < maxReferenceImages; i++) {
    const refImage = query.referenceImages[i];
    parts.push({
      inlineData: {
        mimeType: refImage.mimeType,
        data: refImage.data.toString('base64')
      }
    });
  }
}
```

#### GPT-4o 일관성 문제

| 특성 | NANO BANANA | GPT-4o |
|-----|-------------|--------|
| **referenceImages** | ✅ 지원 (최대 3개) | ❌ 미지원 |
| **스타일 전달** | `styleStrength` 옵션 | 텍스트 프롬프트만 |
| **일관성 보장** | 높음 (이미지 참조) | 낮음 (텍스트 의존) |

#### 하이브리드 해결책

```typescript
// image/HybridImageService.ts (신규)
export class HybridImageService {

  /**
   * Step 1: GPT-4o로 캐릭터 레퍼런스 생성
   */
  async generateCharacterReferences(
    character: Character,
    options: { style: 'ghibli'; angles: string[] }
  ): Promise<ReferenceImageSet> {
    const references: Buffer[] = [];

    for (const angle of options.angles) {
      const prompt = `${GHIBLI_STYLE_BASE}
        Character: ${character.ghibliDescription}
        Angle: ${angle}
        Maintain exact character features`;

      const image = await this.gpt4oService.generateImage(prompt);
      references.push(image);
    }

    return { characterId: character.id, images: references };
  }

  /**
   * Step 2: NANO BANANA로 씬 이미지 생성 (referenceImages 사용)
   */
  async generateSceneImage(
    scenePrompt: string,
    characterRefs: ReferenceImageSet,
    options: { styleStrength: 'strong' }
  ): Promise<Buffer> {
    return await this.nanoBananaService.generateWithStyleTransfer(
      scenePrompt,
      characterRefs.images.map(img => ({ data: img, mimeType: 'image/png' })),
      { styleStrength: options.styleStrength }
    );
  }
}
```

### 4.5 GPT → NanoBanana 일관성 체인 (Hybrid Strategy) ⭐⭐⭐

> **2026-01-20 신규**: 기존 short-video-maker 코드 기반 하이브리드 전략
> GPT-4o의 지브리 품질 + NanoBanana의 referenceImages 일관성

#### 핵심 아이디어

```
┌─────────────────────────────────────────────────────────────────┐
│           GPT → NanoBanana Consistency Chain                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [Scene 0] GPT-4o 이미지 생성                                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Prompt: "Studio Ghibli style, [씬 설명]..."              │    │
│  │  Result: 고품질 Ghibli 이미지 (anchor)                    │    │
│  │          ↓                                                │    │
│  │  GCS 저장: gs://bucket/books/{bookId}/reference.png       │    │
│  └─────────────────────────────────────────────────────────┘    │
│                          │                                       │
│                          ▼ referenceImages                       │
│  [Scene 1~N] NanoBanana + referenceImages                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Input:                                                   │    │
│  │    - prompt: "[씬 설명]. Style: Ghibli. Mood: nostalgic"  │    │
│  │    - referenceImages: [Scene 0 이미지] (최대 3개)         │    │
│  │    - styleStrength: "strong"                             │    │
│  │                                                          │    │
│  │  Result: 스타일 일관성 유지된 씬 이미지                    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                          │                                       │
│                          ▼                                       │
│  [최종 합성] GPTImageStaticWorkflow                              │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  - 이미지들 → FFmpeg → 정적 비디오                        │    │
│  │  - TTS 오디오 + 자막 오버레이                             │    │
│  │  - 최종 MP4 출력                                         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### 기존 코드 활용

**NanoBananaVideoSource.ts** (line 74-106):
```typescript
// 일관성 있는 다중 이미지 생성
async generateMultipleImages(
  params: NanoBananaVideoParams,
  numberOfImages: number = 4
): Promise<Array<{ data: string; mimeType: string }>> {
  const enhancedPrompt = `${params.imageData.prompt}. Style: ${params.imageData.style}. Mood: ${params.imageData.mood}`;

  const result = await this.imageGenerationService.generateImages({
    prompt: enhancedPrompt,
    numberOfImages: numberOfImages,
    aspectRatio: aspectRatio,
    referenceImages: referenceImages  // ⭐ 핵심!
  }, params.videoId);

  return result.images.map(img => ({
    data: img.data.toString('base64'),
    mimeType: img.mimeType || 'image/png'
  }));
}
```

**NanoBananaService.ts** (line 147-161):
```typescript
// referenceImages 처리 - 최대 3개까지
if (query.referenceImages && query.referenceImages.length > 0) {
  const maxReferenceImages = Math.min(query.referenceImages.length, 3);

  for (let i = 0; i < maxReferenceImages; i++) {
    const refImage = query.referenceImages[i];
    parts.push({
      inlineData: {
        mimeType: refImage.mimeType,
        data: refImage.data.toString('base64')
      }
    });
  }
}
```

#### 구현 코드 (신규)

```typescript
// workflow/BookToGhibliShortsWorkflow.ts
import { GPTImageHelper } from "../utils/GPTImageHelper";
import { NanoBananaVideoSource } from "../video-sources/NanoBananaVideoSource";

export class BookToGhibliShortsWorkflow extends BaseWorkflow {

  async generateConsistentGhibliImages(
    chunks: Chunk[],
    context: WorkflowContext
  ): Promise<ImageData[]> {
    const images: ImageData[] = [];
    let referenceImage: Buffer | null = null;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      if (i === 0) {
        // ⭐ 첫 씬: GPT-4o로 고품질 Ghibli 이미지 생성
        const gptResult = await GPTImageHelper.generateImagesForAllScenes(
          [{ scenePrompt: `${GHIBLI_STYLE_BASE}\n${chunk.scenePrompt}` }],
          this.imageGenerationService,
          context.orientation,
          videoTempDir,
          context.videoId
        );

        referenceImage = gptResult[0].buffer;
        images.push(gptResult[0]);

        // GCS에 레퍼런스 저장
        await this.saveReferenceImage(referenceImage, context.bookId);

      } else {
        // ⭐ 이후 씬: NanoBanana + referenceImages
        const nanoBananaResult = await this.nanoBananaSource.generateMultipleImages({
          imageData: {
            prompt: chunk.scenePrompt,
            style: 'Studio Ghibli anime style, hand-drawn, soft watercolors',
            mood: 'nostalgic, dreamlike, Miyazaki aesthetic'
          },
          orientation: context.orientation,
          videoId: context.videoId,
          sceneIndex: i,
          referenceImages: [{
            data: referenceImage!,
            mimeType: 'image/png'
          }]
        }, 1);

        images.push({
          buffer: Buffer.from(nanoBananaResult[0].data, 'base64'),
          duration: chunk.duration || 5
        });
      }
    }

    return images;
  }
}
```

#### 장점

| 항목 | GPT Only | NanoBanana Only | **Hybrid (GPT→NanoBanana)** |
|-----|----------|-----------------|---------------------------|
| 지브리 품질 | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ (첫 씬 고정) |
| 일관성 | ⭐ (매번 다름) | ⭐⭐⭐ (referenceImages) | ⭐⭐⭐ |
| 비용 | 높음 | 낮음 | **중간** (첫 씬만 GPT) |
| 기존 코드 재사용 | ❌ 새로 작성 | ✅ NanoBananaVideoSource | ✅ 둘 다 활용 |

### 4.6 리스크 및 테스트 계획

| 리스크 | 영향 | 대응 |
|-------|------|------|
| NANO BANANA가 지브리 스타일 미따라감 | 높음 | styleStrength 조정, 프롬프트 강화 |
| 캐릭터 드리프트 (10씬 이상) | 중간 | 3개 레퍼런스 순환 사용 |
| GPT-4o 비용 증가 | 낮음 | 레퍼런스 캐싱, 재사용 |

**테스트 우선순위:**
1. [ ] GPT-4o 지브리 스타일 품질 테스트
2. [ ] NANO BANANA + GPT-4o 레퍼런스 일관성 테스트
3. [ ] 10씬 연속 생성 드리프트 테스트
4. [ ] 비용 측정 (실제 vs 예상)

### 4.7 NEB (Neo4j Cloud Run) 연동

> **기존 인프라 활용**: NEB (llm-graph-builder) 이미 Cloud Run에 배포됨
> URL: https://neb-550996044521.asia-northeast3.run.app

#### NEB 인프라 현황

| 항목 | 값 |
|-----|-----|
| **Cloud Run URL** | https://neb-550996044521.asia-northeast3.run.app |
| **Neo4j URI** | bolt://34.47.112.49:7687 |
| **Database** | neo4j |
| **Region** | asia-northeast3 (서울) |

#### PDF → Neo4j → Shorts 파이프라인

```
┌─────────────────────────────────────────────────────────────────────┐
│                    NEB 연동 파이프라인                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  [1. PDF 업로드]                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  POST /upload                                                  │  │
│  │  - model: GEMINI_2_0_FLASH                                     │  │
│  │  - token_chunk_size: 500                                       │  │
│  │  - chunk_overlap: 50                                           │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                            │                                         │
│                            ▼                                         │
│  [2. 그래프 추출]                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  POST /extract                                                 │  │
│  │  - source_type: local file                                     │  │
│  │  - allowedNodes: TECHNOLOGY,CONCEPT,PERSON,METHOD              │  │
│  │  - language: ko                                                │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                            │                                         │
│                            ▼                                         │
│  [3. 청크 순서 조회]                                                   │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Cypher Query:                                                 │  │
│  │  MATCH (d:Document {fileName: $fileName})                      │  │
│  │        -[:FIRST_CHUNK]->(first:Chunk)                          │  │
│  │  MATCH path = (first)-[:NEXT_CHUNK*]->(chunk:Chunk)            │  │
│  │  RETURN chunk ORDER BY chunk.position                          │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                            │                                         │
│                            ▼                                         │
│  [4. 숏츠 생성]                                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  short-video-maker 호출                                        │  │
│  │  - 청크별 Ghibli 이미지 생성 (GPT→NanoBanana)                  │  │
│  │  - TTS + 자막                                                  │  │
│  │  - FFmpeg 합성                                                 │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

#### API 호출 예시

```bash
# 1. PDF 업로드
curl -X POST "https://neb-550996044521.asia-northeast3.run.app/upload" \
  -F "file=@book.pdf" \
  -F "uri=bolt://34.47.112.49:7687" \
  -F "userName=neo4j" \
  -F "password=ytbbooks2026" \
  -F "database=neo4j" \
  -F "model=GEMINI_2_0_FLASH"

# 2. 그래프 추출
curl -X POST "https://neb-550996044521.asia-northeast3.run.app/extract" \
  -d "uri=bolt://34.47.112.49:7687" \
  -d "userName=neo4j" \
  -d "password=ytbbooks2026" \
  -d "database=neo4j" \
  -d "file_name=book.pdf" \
  -d "source_type=local file" \
  -d "model=GEMINI_2_0_FLASH" \
  -d "token_chunk_size=500" \
  -d "chunk_overlap=50" \
  -d "language=ko" \
  -d "allowedNodes=TECHNOLOGY,CONCEPT,PERSON,METHOD,ORGANIZATION"

# 3. 청크 순서 조회 (Neo4j HTTP API)
curl -X POST "http://34.47.112.49:7474/db/neo4j/tx/commit" \
  -u neo4j:ytbbooks2026 \
  -H "Content-Type: application/json" \
  -d '{
    "statements": [{
      "statement": "MATCH (d:Document {fileName: $fileName})-[:FIRST_CHUNK]->(first:Chunk) OPTIONAL MATCH path = (first)-[:NEXT_CHUNK*0..]->(chunk:Chunk) RETURN chunk.text AS text, chunk.position AS position ORDER BY chunk.position",
      "parameters": {"fileName": "book.pdf"}
    }]
  }'
```

#### TypeScript 통합 코드

```typescript
// services/NEBService.ts
import axios from 'axios';

const NEB_URL = 'https://neb-550996044521.asia-northeast3.run.app';
const NEO4J_CONFIG = {
  uri: 'bolt://34.47.112.49:7687',
  userName: 'neo4j',
  password: 'ytbbooks2026',
  database: 'neo4j'
};

export class NEBService {

  /**
   * PDF 업로드 및 그래프 추출
   */
  async processBook(filePath: string, fileName: string): Promise<{ chunks: number; entities: number }> {
    // 1. 업로드
    const uploadForm = new FormData();
    uploadForm.append('file', fs.createReadStream(filePath));
    uploadForm.append('uri', NEO4J_CONFIG.uri);
    uploadForm.append('userName', NEO4J_CONFIG.userName);
    uploadForm.append('password', NEO4J_CONFIG.password);
    uploadForm.append('database', NEO4J_CONFIG.database);
    uploadForm.append('model', 'GEMINI_2_0_FLASH');

    await axios.post(`${NEB_URL}/upload`, uploadForm);

    // 2. 추출
    const extractResult = await axios.post(`${NEB_URL}/extract`, {
      uri: NEO4J_CONFIG.uri,
      userName: NEO4J_CONFIG.userName,
      password: NEO4J_CONFIG.password,
      database: NEO4J_CONFIG.database,
      file_name: fileName,
      source_type: 'local file',
      model: 'GEMINI_2_0_FLASH',
      token_chunk_size: 500,
      chunk_overlap: 50,
      language: 'ko',
      allowedNodes: 'TECHNOLOGY,CONCEPT,PERSON,METHOD,ORGANIZATION'
    });

    return extractResult.data;
  }

  /**
   * 청크 순서대로 조회
   */
  async getChunksInOrder(fileName: string): Promise<Chunk[]> {
    const query = `
      MATCH (d:Document {fileName: $fileName})-[:FIRST_CHUNK]->(first:Chunk)
      OPTIONAL MATCH path = (first)-[:NEXT_CHUNK*0..]->(chunk:Chunk)
      RETURN chunk.text AS text,
             chunk.position AS position,
             chunk.id AS id
      ORDER BY chunk.position
    `;

    const result = await this.neo4jDriver.executeQuery(query, { fileName });
    return result.records.map(r => ({
      id: r.get('id'),
      text: r.get('text'),
      position: r.get('position')
    }));
  }
}
```

---

## 5. 프로젝트 구조

### 5.1 디렉토리 구조 (v1.2 상세화)

```
src/YTB-books-project/
├── index.ts                          # 모듈 진입점
├── BookProjectService.ts             # 메인 서비스 (Facade)
├── routes.ts                         # API 라우트 정의
├── types.ts                          # 공통 타입 정의
│
├── ingestion/                        # 📥 문서 수집
│   ├── index.ts
│   ├── types.ts
│   ├── parsers/
│   │   ├── BaseParser.ts                 # 추상 기본 클래스
│   │   ├── PDFParser.ts                  # pdf-parse 래퍼
│   │   ├── EPUBParser.ts                 # @gxl/epub-parser 래퍼
│   │   └── TextParser.ts                 # 일반 텍스트
│   ├── processors/
│   │   ├── DocumentProcessor.ts          # 메타데이터 추출
│   │   ├── StructureExtractor.ts         # 챕터/섹션 구조
│   │   └── CleaningPipeline.ts           # 텍스트 정리
│   └── storage/
│       └── RawDocumentStorage.ts         # GCS 원본 저장
│
├── chunking/                         # ✂️ 청킹 로직
│   ├── index.ts
│   ├── types.ts
│   ├── ChunkingService.ts                # Facade
│   ├── strategies/
│   │   ├── BaseChunker.ts                # 추상 기본 클래스
│   │   ├── TokenChunker.ts               # ⭐ 512 tokens, tiktoken
│   │   ├── RecursiveChunker.ts           # LangChain 스타일
│   │   ├── SemanticChunker.ts            # 의미 경계 감지
│   │   └── PageChunker.ts                # 페이지 기반
│   ├── utils/
│   │   ├── TokenCounter.ts               # tiktoken 래퍼
│   │   ├── OverlapCalculator.ts          # 오버랩 계산
│   │   └── ChunkValidator.ts             # 청크 품질 검증
│   └── config/
│       └── ChunkingConfig.ts             # 설정 관리
│
├── graph/                            # 🕸️ Neo4j GraphRAG
│   ├── index.ts
│   ├── types.ts
│   ├── neo4j/
│   │   ├── Neo4jService.ts               # v6 driver 연결/쿼리
│   │   ├── Neo4jConfig.ts                # AuraDB 설정
│   │   ├── ConnectionPool.ts             # 커넥션 풀
│   │   └── schema.cypher                 # 스키마 DDL
│   ├── builder/
│   │   ├── GraphBuilder.ts               # Facade
│   │   ├── LexicalGraphBuilder.ts        # 문서→챕터→청크
│   │   └── SemanticGraphBuilder.ts       # 엔티티/관계
│   ├── extraction/
│   │   ├── EntityExtractor.ts            # 2-step Facade
│   │   ├── EntityIdentifier.ts           # Step 1: 엔티티 추출
│   │   ├── RelationshipMapper.ts         # Step 2: 관계 추출
│   │   └── prompts/
│   │       ├── entity-extraction.ts
│   │       └── relationship-extraction.ts
│   ├── embedding/
│   │   ├── EmbeddingService.ts           # OpenAI text-embedding-3-small
│   │   ├── BatchEmbedder.ts              # 배치 처리
│   │   └── VectorIndexManager.ts         # Neo4j Vector Index 관리
│   └── queries/
│       ├── ChunkQueries.ts               # 청크 CRUD
│       ├── EntityQueries.ts              # 엔티티 CRUD
│       └── TraversalQueries.ts           # 그래프 탐색
│
├── scene/                            # 🎬 씬 생성
│   ├── index.ts
│   ├── types.ts
│   ├── SceneGenerator.ts                 # 청크→씬 변환 Facade
│   ├── generators/
│   │   ├── NarrationGenerator.ts         # 내레이션 텍스트 생성
│   │   ├── GhibliPromptBuilder.ts        # 지브리 스타일 프롬프트
│   │   └── VideoPromptBuilder.ts         # VEO3용 비디오 프롬프트
│   ├── trackers/
│   │   ├── CharacterTracker.ts           # 캐릭터 등장 추적
│   │   ├── PlaceTracker.ts               # 장소 전환 추적
│   │   └── MoodTracker.ts                # 분위기 일관성 추적
│   └── templates/
│       ├── ghibli-style.ts
│       ├── narration-korean.ts
│       └── narration-english.ts
│
├── image/                            # 🖼️ 이미지 생성 (Strategy Pattern)
│   ├── index.ts
│   ├── types.ts
│   ├── providers/
│   │   ├── BaseImageProvider.ts          # 추상 기본 클래스
│   │   ├── GPTImage15Provider.ts         # ⭐ GPT Image 1.5 (권장)
│   │   ├── NanoBananaProvider.ts         # 기존 NANO BANANA 래퍼
│   │   ├── HiDreamProvider.ts            # 오픈소스 대안
│   │   └── MidjourneyProvider.ts         # 향후 확장용
│   ├── services/
│   │   ├── GhibliImageService.ts         # Facade - 통합 인터페이스
│   │   ├── CharacterConsistencyService.ts # 일관성 관리
│   │   └── GhibliPromptBuilder.ts        # 프롬프트 생성
│   └── adapters/
│       └── LegacyImageServiceAdapter.ts  # 기존 ImageGenerationService 호환
│
├── workflow/                         # 🔄 워크플로우
│   ├── index.ts
│   ├── BookToShortsWorkflow.ts           # 메인 워크플로우
│   ├── phases/
│   │   ├── IngestionPhase.ts             # Phase 1: 문서 수집
│   │   ├── ChunkingPhase.ts              # Phase 2: 청킹
│   │   ├── GraphPhase.ts                 # Phase 3: 그래프 구축
│   │   ├── ScenePhase.ts                 # Phase 4: 씬 생성
│   │   └── RenderPhase.ts                # Phase 5: 렌더링
│   ├── coordinators/
│   │   ├── JobCoordinator.ts             # 작업 상태 관리
│   │   └── ProgressTracker.ts            # 진행률 추적
│   └── adapters/
│       └── ExistingModuleAdapter.ts      # 기존 모듈 통합
│
├── utils/                            # 🛠️ 유틸리티
│   ├── constants.ts
│   └── helpers.ts
│
└── Architecture/                     # 📚 문서
    └── Architecture.md               # 이 파일
```

### 5.2 핵심 타입 정의 (v1.2 업데이트)

```typescript
// types.ts

// ===== 문서 수집 (Ingestion) =====

export interface RawDocument {
  id: string;
  sourceType: 'pdf' | 'epub' | 'text';
  fileName: string;
  rawPath: string;           // GCS 경로

  // 추출 결과
  fullText: string;
  pages?: PageContent[];     // PDF용
  chapters: ChapterContent[];

  // 메타데이터
  metadata: DocumentMetadata;
  structure: DocumentStructure;
  extractedAt: Date;
}

export interface DocumentMetadata {
  title: string;
  author?: string;
  publisher?: string;
  publishedDate?: string;
  language: 'korean' | 'english' | 'japanese';
  totalPages?: number;
  isbn?: string;
}

export interface DocumentStructure {
  chapters: ChapterInfo[];
  sections: SectionInfo[];
  hierarchy: HierarchyNode[];
}

export interface ChapterContent {
  chapterNumber: number;
  title: string;
  startPage?: number;
  endPage?: number;
  text: string;
  wordCount: number;
}

// ===== 청킹 (Chunking) =====

export interface ChunkingConfig {
  strategy: 'token' | 'recursive' | 'semantic' | 'page';
  tokenLimit: number;        // 기본 512
  overlapTokens: number;     // 기본 50-100
  overlapPercent?: number;   // 10-20%

  // 경계 설정
  respectParagraphs: boolean;
  respectSentences: boolean;

  // 언어별 설정
  language: 'korean' | 'english';

  // 책/논문 특화
  splitByChapter: boolean;
  minChunkTokens: number;
}

export interface Chunk {
  id: string;
  documentId: string;
  order: number;             // ⭐ 순서 (핵심!)

  // 내용
  text: string;
  tokenCount: number;
  wordCount: number;

  // 오버랩 정보
  overlapWithPrev: number;
  overlapWithNext: number;

  // 위치 정보
  startPosition: number;
  endPosition: number;

  // 구조 정보
  chapterNumber?: number;
  sectionNumber?: string;
  pageStart?: number;
  pageEnd?: number;

  // LLM 생성 필드
  summary?: string;
  keywords?: string[];
  embedding?: number[];      // 1536 dim

  // 씬 생성용
  sceneNarration?: string;
  imagePrompt?: string;
  videoPrompt?: string;

  // 관계 (Neo4j에서 관리)
  characterIds?: string[];
  placeIds?: string[];
  eventIds?: string[];
  prevChunkId?: string;
  nextChunkId?: string;

  // 메타
  createdAt: Date;
  version: number;
}

export interface ChunkingStats {
  totalChunks: number;
  averageTokens: number;
  minTokens: number;
  maxTokens: number;
  totalOverlap: number;
  processingTimeMs: number;
}

// ===== 엔티티 추출 (Entity Extraction) =====

export interface ExtractedEntity {
  name: string;
  type: 'character' | 'place' | 'event' | 'concept' | 'theme';
  description: string;
  aliases?: string[];
  importance: 'main' | 'supporting' | 'minor';
  ghibliDescription?: string;  // 지브리 스타일용

  // 책/논문 특화
  firstMentionChunk: string;
  mentionCount: number;
}

export interface ExtractedRelationship {
  sourceEntity: string;
  targetEntity: string;
  relationType: string;
  description: string;
  confidence: number;        // 0-1
  chunkIds: string[];
}

// ===== 기존 타입 (호환) =====

export interface Book {
  id: string;
  title: string;
  author: string;
  type: 'book' | 'paper' | 'article';
  language: 'korean' | 'english';
  totalChunks: number;
  totalPages?: number;
  createdAt: Date;
}

export interface Character {
  id: string;
  name: string;
  nameEnglish?: string;
  description: string;
  ghibliDescription: string;  // 지브리 스타일 설명
  referenceImagePath?: string;
  firstAppearanceChunk: string;
  importance: 'main' | 'supporting' | 'minor';
}

export interface BookToShortsConfig {
  bookId: string;
  chunkIds?: string[];        // 특정 청크만 (없으면 전체)
  startChunk?: number;        // 시작 순서
  endChunk?: number;          // 끝 순서

  // 스타일 설정
  style: 'ghibli' | 'realistic' | 'anime' | 'watercolor';
  imageProvider: 'gpt4o' | 'nano_banana' | 'hybrid';
  videoProvider: 'veo3' | 'runway' | 'static';

  // 오디오 설정
  voice: VoiceEnum;
  language: 'korean' | 'english';
  backgroundMusic?: MusicMoodEnum;

  // 출력 설정
  orientation: 'portrait' | 'landscape';
  autoUpload?: boolean;
  channelName?: string;
}

export interface GeneratedScene {
  chunkId: string;
  order: number;

  // 텍스트
  narration: string;
  narrationEnglish?: string;

  // 이미지
  imagePrompt: string;
  imagePath?: string;

  // 비디오
  videoPrompt?: string;
  videoPath?: string;

  // 캐릭터
  characterIds: string[];

  // 타이밍
  duration: number;
}

// ⭐ 이미지 Provider 인터페이스 (Strategy Pattern)
export interface ImageGenerationOptions {
  prompt: string;
  style: 'ghibli' | 'anime' | 'realistic' | 'watercolor';
  aspectRatio: '9:16' | '16:9' | '1:1';
  referenceImages?: Buffer[];
  anchorDescription?: string;  // GPT Image 1.5용 앵커 설명
  characterId?: string;
}

export interface ImageGenerationResult {
  success: boolean;
  image?: Buffer;
  imagePath?: string;
  consistencyScore?: number;  // 0-1
  error?: string;
}

export interface ImageProviderConfig {
  provider: 'gpt-image-1.5' | 'nano-banana' | 'hidream' | 'midjourney';
  apiKey?: string;
  fallbackProvider?: string;
}

// Provider 추상 인터페이스
export interface IImageProvider {
  name: string;
  supportsConsistency: boolean;
  supportsReferenceImages: boolean;

  generateImage(options: ImageGenerationOptions): Promise<ImageGenerationResult>;
  generateWithConsistency(
    options: ImageGenerationOptions,
    previousImages: Buffer[]
  ): Promise<ImageGenerationResult>;
}
```

---

## 6. API 엔드포인트

### 6.1 책 관리

```
POST   /api/books/upload
       Body: multipart/form-data { file, title?, author?, type? }
       Response: { bookId, status: 'processing' }

GET    /api/books
       Response: { books: Book[] }

GET    /api/books/:bookId
       Response: { book: Book, chunks: Chunk[], characters: Character[] }

DELETE /api/books/:bookId
       Response: { success: true }
```

### 6.2 그래프 처리

```
POST   /api/books/:bookId/process
       Body: { chunkingStrategy: 'token' | 'semantic' | 'chapter', chunkSize?: 500 }
       Response: { status: 'processing', jobId }

GET    /api/books/:bookId/process/status
       Response: { status: 'pending' | 'processing' | 'completed', progress: 75 }

GET    /api/books/:bookId/graph
       Response: { nodes: [], edges: [], stats: {} }

GET    /api/books/:bookId/chunks
       Query: ?start=1&end=10
       Response: { chunks: Chunk[] }

GET    /api/books/:bookId/chunks/:chunkId
       Response: { chunk: Chunk, characters: Character[], context: { prev, next } }
```

### 6.3 캐릭터 관리

```
GET    /api/books/:bookId/characters
       Response: { characters: Character[] }

PUT    /api/books/:bookId/characters/:charId
       Body: { description?, ghibliDescription?, referenceImagePath? }
       Response: { character: Character }

POST   /api/books/:bookId/characters/:charId/generate-reference
       Body: { provider: 'gpt4o' | 'nano_banana' }
       Response: { imagePath, imageUrl }
```

### 6.4 숏츠 생성

```
POST   /api/books/:bookId/generate-shorts
       Body: BookToShortsConfig
       Response: { videoId, status: 'queued' }

GET    /api/books/:bookId/shorts/:videoId/status
       Response: { status, progress, currentChunk, outputPath? }

GET    /api/books/:bookId/shorts
       Response: { videos: [{ videoId, status, createdAt }] }
```

---

## 7. 기술 스택

### 7.1 신규 의존성 (v1.3 업데이트 - llm-graph-builder 통합)

> **라이브러리 선택 근거** (웹 검색 + llm-graph-builder 분석 결과)
> - **neo4j-driver v6**: native Vector type 지원
> - **graphdatascience (GDS)**: Leiden 커뮤니티 감지 알고리즘
> - **langchain/langchain_experimental**: LLMGraphTransformer 엔티티 추출
> - **pdf-parse**: 안정적, Node.js 호환 우수
> - **@gxl/epub-parser**: TypeScript 지원, 구조화된 출력
> - **tiktoken**: OpenAI 공식 토큰 카운터

```json
{
  "dependencies": {
    // ===== Neo4j (v6 - native Vector 지원) =====
    "neo4j-driver": "^6.0.0",

    // ===== 문서 파싱 =====
    "pdf-parse": "^1.1.1",           // PDF → 텍스트
    "@gxl/epub-parser": "^2.0.4",    // EPUB → 구조화된 텍스트

    // ===== OpenAI =====
    "openai": "^4.77.0",             // GPT Image 1.5 + Embeddings

    // ===== 토큰/텍스트 처리 =====
    "tiktoken": "^1.0.17",           // ⭐ OpenAI 토큰 카운팅

    // ===== 유틸리티 =====
    "uuid": "^9.0.0",                // UUID 생성
    "p-queue": "^8.0.1",             // 동시성 제어
    "p-retry": "^6.2.0"              // 재시도 로직
  },
  "devDependencies": {
    "@types/pdf-parse": "^1.1.4"
  }
}
```

#### v1.3 신규: Python 의존성 (llm-graph-builder 패턴)

> **참고**: Entity Extraction + Community Detection은 Python 기반 llm-graph-builder 패턴 활용

```python
# requirements.txt (Python 모듈용)

# ===== LangChain 엔티티 추출 =====
langchain>=0.3.0
langchain-experimental>=0.3.0      # LLMGraphTransformer
langchain-openai>=0.2.0            # ChatOpenAI
langchain-google-vertexai>=2.0.0   # ChatVertexAI (Gemini)
langchain-anthropic>=0.3.0         # ChatAnthropic

# ===== Neo4j =====
neo4j>=5.0.0                       # Python driver
graphdatascience>=1.8              # ⭐ GDS - Leiden Algorithm

# ===== Embeddings =====
sentence-transformers>=2.2.0       # all-MiniLM-L6-v2 (384 dim)

# ===== 토큰 처리 =====
tiktoken>=0.5.0                    # OpenAI 토큰 카운팅
```

### 7.1.1 라이브러리 비교 (연구 결과)

| 용도 | 선택 | 대안 | 선택 이유 |
|-----|------|------|----------|
| **PDF 파싱** | pdf-parse | unpdf, pdf-ts | 안정성, 간단한 API |
| **EPUB 파싱** | @gxl/epub-parser | epub, epub2 | TypeScript 지원 |
| **토큰 카운팅** | tiktoken | gpt-tokenizer | OpenAI 공식 |
| **Neo4j Driver** | v6.0.0 | v5.x | native Vector type |

### 7.2 환경 변수

```env
# Neo4j AuraDB (Google Cloud Marketplace)
NEO4J_URI=neo4j+s://xxxx.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your-password

# OpenAI (GPT Image 1.5) - 권장 Provider
OPENAI_API_KEY=sk-proj-xxxxx
# 모델: gpt-image-1.5 (2025.12 출시)
# API: /v1/images/generations, /v1/images/edits

# 기존 설정 재활용
GOOGLE_GEMINI_API_KEY=...     # NANO BANANA (대안), TTS
GOOGLE_CLOUD_PROJECT_ID=dkdk-474008
GCS_BUCKET_NAME=dkdk-474008-short-videos

# 이미지 Provider 설정
IMAGE_PROVIDER=gpt-image-1.5   # 'gpt-image-1.5' | 'nano-banana' | 'hidream'
IMAGE_FALLBACK_PROVIDER=nano-banana
```

### 7.3 기존 YTB 모듈 재활용

| 모듈 | 용도 | 파일 |
|-----|------|------|
| `ImageGenerationService` | NANO BANANA 이미지 | `image-generation/` |
| `ConsistentShortsWorkflow` | 캐릭터 일관성 | `short-creator/workflows/` |
| `CharacterStorageService` | GCS 캐릭터 저장 | `character-store/` |
| `TTSProvider` | Gemini Pro TTS | `short-creator/libraries/` |
| `VideoProcessor` | FFmpeg 처리 | `short-creator/processors/` |
| `YouTubeUploader` | 업로드 | `youtube-upload/` |

---

## 8. 기존 모듈 통합 패턴

### 8.1 발견된 패턴 및 재사용 전략

분석 결과, 기존 YTB 모듈들은 다음 패턴을 따르고 있음:

| 패턴 | 모듈 | 설명 |
|-----|------|------|
| **Facade** | `YTB-ffmpeg` | FFMpeg → AudioProcessor, SubtitleFilter, VideoConcat, VideoEditor |
| **Strategy** | `short-creator/video-sources` | VeoVideoSource, PexelsVideoSource, NanoBananaVideoSource |
| **Template Method** | `short-creator/workflows` | BaseWorkflow.process() |
| **Singleton Service** | `short-creator/services` | CharacterHelper, CaptionService |

### 8.2 BookToShortsWorkflow 통합

```typescript
// workflow/BookToShortsWorkflow.ts
import { BaseWorkflow, WorkflowContext, WorkflowResult } from "../../short-creator/workflows/BaseWorkflow";
import { characterHelper } from "../../short-creator/services/CharacterHelper";
import { captionService } from "../../short-creator/services/CaptionService";
import { VideoProcessor } from "../../short-creator/processors/VideoProcessor";

/**
 * ⭐ BaseWorkflow 확장 - 기존 패턴 준수
 */
export class BookToShortsWorkflow extends BaseWorkflow {
  constructor(
    private neo4jService: Neo4jService,
    private videoProcessor: VideoProcessor,
    private ghibliImageService: GhibliImageService,
    private ffmpeg: FFMpeg  // Facade 패턴
  ) {
    super();
  }

  async process(
    scenes: Scene[],
    inputScenes: SceneInput[],
    context: WorkflowContext
  ): Promise<WorkflowResult> {
    this.validateScenes(scenes);

    // 1. Neo4j에서 청크 순서대로 조회
    const chunks = await this.neo4jService.getChunksInOrder(context.metadata.bookId);

    // 2. 씬별 이미지 생성 (기존 CharacterHelper 패턴 재사용)
    for (const chunk of chunks) {
      const characterImages = characterHelper.getSceneCharacterImages(
        chunk.characterIds,
        this.characterImageMap
      );

      const ghibliPrompt = characterHelper.buildMultiCharacterPrompt(
        characterImages,
        chunk.scenePrompt,
        'ghibli',   // style
        'nostalgic' // mood
      );

      // 이미지 생성 (GPT-4o 또는 하이브리드)
      const imagePath = await this.ghibliImageService.generateImage(ghibliPrompt);
    }

    // 3. 캡션 수집 (기존 CaptionService 패턴 재사용)
    let cumulativeDuration = 0;
    const allKoreanCaptions: Caption[] = [];
    const allEnglishCaptions: Caption[] = [];

    for (const [index, scene] of scenes.entries()) {
      const result = captionService.collectSceneCaptions(
        scene,
        inputScenes[index].textEnglish,
        scene.audio?.duration || 0,
        cumulativeDuration,
        context.config.skipTTS || false,
        index
      );
      allKoreanCaptions.push(...result.koreanCaptions);
      allEnglishCaptions.push(...result.englishCaptions);
      cumulativeDuration += scene.audio?.duration || 0;
    }

    // 4. FFmpeg Facade로 최종 합성
    const outputPath = await this.ffmpeg.combineVideoWithAudioAndCaptions(
      videoPath,
      audioPath,
      allKoreanCaptions,
      context.videoId,
      totalDuration,
      context.orientation,
      context.config
    );

    return { outputPath, duration: totalDuration, scenes };
  }
}
```

### 8.3 FFMpeg Facade 통합

```typescript
// 기존 YTB-ffmpeg Facade 활용
import { FFMpeg } from "../../YTB-ffmpeg";

// 오디오 처리 (Gemini TTS PCM → MP3)
await ffmpeg.savePcmToMp3(ttsAudio, audioPath);

// 비디오 concat (xfade 트랜지션)
await ffmpeg.concatVideosWithXfade(
  videoPaths,
  outputPath,
  0.5,      // transitionDuration
  'fade',   // transitionType
  '1080x1920'
);

// 자막 합성 (한글 2/3줄 지원)
await ffmpeg.addTitleAndSubtitlesToVideo(
  videoPath,
  outputPath,
  titleConfig,
  koreanCaptions,
  englishCaptions,
  OrientationEnum.portrait,
  totalDuration
);
```

### 8.3.1 Gemini Pro TTS 설정 (NewsProject 패턴)

**모델**: `gemini-2.5-pro-preview-tts` (고품질 한국어 음성)
**출력 형식**: RAW PCM (L16, 24kHz, mono) → FFmpeg로 MP3 변환

```typescript
// GeminiTTS 초기화 (src/YTB-tts/GeminiTTS.ts 참조)
import { GeminiTTS } from "../YTB-tts";

this.geminiTTS = new GeminiTTS({
  apiKey: config.googleGeminiApiKey,
  model: 'gemini-2.5-pro-preview-tts',  // 🔥 Pro 모델 (고품질)
  defaultGender: 'female',
});

// Voice 옵션
const GEMINI_VOICES = {
  female: ['Kore', 'Leda', 'Zephyr', 'Aoede'],  // 한국어 추천: Kore, Leda
  male: ['Puck', 'Charon', 'Fenrir', 'Enceladus']
};
```

#### Director's Notes 패턴 (일관된 톤 유지)

```typescript
// TTS 생성 시 스타일 가이드 주입
const ttsStyle = '발랄하고 에너지 넘치는 뉴스 앵커처럼 말해주세요. ' +
  '핵심 단어에 강조를 넣고, 문장 끝에 약간의 여운을 남겨주세요.';

// Director's Notes 형식으로 텍스트 전달
const geminiTtsText = `### DIRECTOR'S NOTES
Style: ${ttsStyle}

${narrationText}`;

const ttsResult = await this.geminiTTS.generate(
  geminiTtsText,
  'Kore',  // voice name
  { useNewsVoice: false }
);

// 🔥 PCM → MP3 변환 (Gemini는 RAW PCM 반환)
await ffmpeg.savePcmToMp3(ttsResult.audio, audioPath);
```

#### 한글 자막 동기화

```typescript
// src/YTB-news-project의 Korean Caption Splitter 패턴
import { splitNarrationToCaptions } from "../YTB-news-project/utils/KoreanCaptionSplitter";

const captions = splitNarrationToCaptions(
  narrationText,
  audioDuration,
  {
    maxCharsPerLine: 15,       // 한글 기준 최대 글자 수
    maxLinesPerCaption: 2,    // 2줄 표시
    initialDelayMs: 500,      // 시작 딜레이 (TTS 버퍼링 보정)
    minDurationMs: 800        // 최소 표시 시간
  }
);

// NFC 정규화 (FFmpeg 한글 렌더링 필수)
const normalizedText = text.normalize('NFC');
```

#### TTS Fallback Chain

```typescript
// Provider 우선순위: Gemini → ElevenLabs → Google TTS
async function generateTTS(text: string): Promise<Buffer> {
  try {
    // 1순위: Gemini Pro TTS
    return await this.geminiTTS.generate(text, 'Kore');
  } catch (e1) {
    try {
      // 2순위: ElevenLabs (영어/다국어)
      return await this.elevenLabs.generate(text);
    } catch (e2) {
      // 3순위: Google Cloud TTS
      return await this.googleTTS.synthesize(text);
    }
  }
}
```

### 8.4 YouTube Analytics 통합 (향후)

```typescript
// youtube-analytics 모듈의 RL 리워드 활용
import { YouTubeAnalyticsService } from "../../youtube-analytics/services/YouTubeAnalyticsService";

// 업로드 후 성과 추적
const metrics = await analyticsService.getVideoMetrics(videoId);
const reward = analyticsService.calculateReward(metrics);

// 리워드 기반 스타일 최적화 (향후)
// - retentionScore: 시청 지속률
// - engagementScore: 좋아요/댓글
// - viralScore: 공유율
// 높은 리워드 씬의 프롬프트/스타일 학습
```

### 8.5 VideoSource Strategy 패턴 확장

```typescript
// video-sources/GhibliVideoSource.ts
import { BaseVideoSource, VideoGenerationResult } from "./BaseVideoSource";

/**
 * 지브리 스타일 특화 VideoSource
 * GPT-4o 이미지 → VEO3 I2V
 */
export class GhibliVideoSource extends BaseVideoSource {
  async generateVideo(
    prompt: string,
    referenceImage?: Buffer,
    options?: VideoGenerationOptions
  ): Promise<VideoGenerationResult> {
    // 1. GPT-4o로 지브리 스타일 이미지 생성
    const ghibliImage = await this.gpt4oService.generateImage(
      `${GHIBLI_STYLE_BASE}\n${prompt}`
    );

    // 2. VEO3 I2V 변환 (선택)
    if (options?.useVeo3) {
      return await this.veoApi.imageToVideo(
        ghibliImage,
        prompt,
        { duration: 5 }
      );
    }

    // 3. 정적 비디오로 변환
    return await this.ffmpeg.createStaticVideoFromImage(
      ghibliImage,
      options?.duration || 3
    );
  }
}
```

---

## 9. 구현 로드맵

### Phase 1: 기반 구축 (Week 1)
- [ ] Neo4j AuraDB 설정 (Google Cloud Marketplace)
- [ ] `Neo4jService.ts` - 연결 및 기본 CRUD
- [ ] 스키마 생성 (`schema.cypher`)
- [ ] 환경 변수 설정 및 테스트

### Phase 2: 데이터 수집 (Week 2)
- [ ] `PDFParser.ts` - PDF 텍스트 추출
- [ ] `EPUBParser.ts` - EPUB 파싱
- [ ] `DocumentProcessor.ts` - 메타데이터 추출
- [ ] API: `POST /api/books/upload`

### Phase 3: 그래프 청킹 (Week 3)
- [ ] `ChunkingService.ts` - 청킹 로직
- [ ] `EntityExtractor.ts` - LLM 엔티티 추출
- [ ] `EmbeddingService.ts` - 벡터 임베딩
- [ ] `GraphBuilder.ts` - Neo4j 그래프 구축
- [ ] API: `POST /api/books/:id/process`

### Phase 4: 씬 생성 (Week 4)
- [ ] `GhibliPromptBuilder.ts` - 지브리 스타일 프롬프트
- [ ] `SceneGenerator.ts` - 청크 → 씬 변환
- [ ] `CharacterTracker.ts` - 캐릭터 일관성
- [ ] `GPT4oImageService.ts` - OpenAI 연동
- [ ] `HybridImageService.ts` - 하이브리드 전략

### Phase 5: 워크플로우 통합 (Week 5)
- [ ] `BookToShortsWorkflow.ts` - 메인 워크플로우
- [ ] ConsistentShortsWorkflow 확장
- [ ] API: `POST /api/books/:id/generate-shorts`
- [ ] 테스트 및 최적화
- [ ] 문서화

---

## 9. 성공 지표

| 지표 | 목표 |
|-----|------|
| 청킹 정확도 | 챕터/씬 경계 90% 일치 |
| 캐릭터 일관성 | 연속 씬 간 90% 유사도 |
| 지브리 스타일 품질 | 사용자 평가 4/5 이상 |
| 파이프라인 속도 | 책 1권 (300p) → 10 숏츠 < 30분 |
| 비용 효율성 | 숏츠 1개당 < $0.50 |

---

## 10. 리스크 및 대응

| 리스크 | 영향 | 대응 |
|-------|------|------|
| GPT-4o 비용 증가 | 높음 | 하이브리드 전략, 캐시 활용 |
| 저작권 문제 (지브리) | 중간 | "Ghibli-inspired" 표현, 자체 스타일 개발 |
| Neo4j 성능 저하 | 중간 | 인덱스 최적화, 배치 처리, 커넥션 풀링 |
| 긴 책 처리 | 낮음 | 청크 수 제한, 페이지네이션, 비동기 처리 |
| 캐릭터 드리프트 | 중간 | 레퍼런스 이미지 고정, 프롬프트 강화 |

---

## 11. 참고 자료

### 논문
- [GraphRAG Survey](https://arxiv.org/abs/2501.00309) - Retrieval-Augmented Generation with Graphs
- [Long Story Generation](https://arxiv.org/abs/2508.03137) - Knowledge Graph + Literary Theory
- [Animate-A-Story](https://ar5iv.labs.arxiv.org/html/2307.06940) - RAG Video Storytelling

### 도구
- [Neo4j AuraDB](https://neo4j.com/cloud/platform/aura-graph-database/) - 관리형 그래프 DB
- [LightRAG](https://github.com/HKUDS/LightRAG) - 빠른 GraphRAG 구현
- [Neo4j LLM KB Builder](https://neo4j.com/labs/genai-ecosystem/llm-graph-builder/) - PDF → 지식그래프

### 스타일 가이드
- [GPT-4o Ghibli Style Guide](https://www.aegissofttech.com/insights/how-to-create-ghibli-style-ai-art-with-gpt-4o/)
- [Fotor Ghibli Generator](https://www.fotor.com/ai-video-generator/studio-ghibli/)

---

**Last Updated**: 2026-01-21
**Author**: Claude (Architecture Agent)
**Version**: 1.6.0 (Gemini Pro TTS 설정 추가)

### Changelog
- **v1.6.0** (2026-01-21):
  - ⭐ **Gemini Pro TTS 설정** 추가 (섹션 8.3.1)
    - 모델: `gemini-2.5-pro-preview-tts` (고품질 한국어)
    - Voice 옵션: Kore, Leda, Zephyr, Aoede (female), Puck, Charon 등 (male)
    - Director's Notes 패턴: 일관된 톤 유지를 위한 스타일 가이드 주입
    - PCM → MP3 변환: `ffmpeg.savePcmToMp3()` 활용
    - 한글 자막 동기화: `initialDelayMs=500ms`, NFC 정규화
    - Fallback Chain: Gemini → ElevenLabs → Google TTS
    - NewsProject 검증 패턴 적용

- **v1.5.0** (2026-01-20):
  - ⭐ **GPT → NanoBanana 일관성 체인** 추가 (섹션 4.5)
    - 첫 씬: GPT-4o로 고품질 Ghibli 이미지 생성
    - 이후 씬: NanoBanana + referenceImages로 스타일 일관성 유지
    - 기존 NanoBananaVideoSource.generateMultipleImages() 활용
  - ⭐ **NEB Cloud Run 연동** 추가 (섹션 4.7)
    - 기존 NEB 인프라 (https://neb-550996044521.asia-northeast3.run.app) 활용
    - PDF 업로드 → 그래프 추출 → 청크 순서 조회 파이프라인
    - TypeScript NEBService 통합 코드 예시
  - 기존 코드 활용 상세화:
    - GPTImageStaticWorkflow (short-creator/workflows)
    - NanoBananaVideoSource (short-creator/video-sources)
    - ConsistentShortsWorkflow 패턴
  - BookToGhibliShortsWorkflow 설계 추가
- **v1.4.0** (2026-01-20):
  - ⭐ **멀티북 아키텍처** 도입 - 하나의 Neo4j에서 여러 책 관리
  - Book 노드 추가 (최상위 컨테이너)
  - 그래프 구조: Book → Document → Chunk → Entity → Community
  - Book 제약조건 추가: `CREATE CONSTRAINT book_id`
  - Book 노드 속성: id, title, author, genre, language, status, created_at
  - 쿼리 패턴 개선: 책별 필터링 지원
- **v1.3.0** (2026-01-20):
  - ⭐ llm-graph-builder 패턴 통합 (neo4j-labs/llm-graph-builder 분석)
  - 그래프 스키마 개선: __Entity__, __Community__ 노드 추가
  - 커뮤니티 감지: Leiden Algorithm (Neo4j GDS) 3-level 계층
  - 관계 추가: HAS_ENTITY, IN_COMMUNITY, PARENT_COMMUNITY
  - 벡터 인덱스 추가: entity_vector, community_vector (384 dim)
  - 전문검색 인덱스 추가: community_keyword
  - Python 의존성 추가: langchain-experimental, graphdatascience
- **v1.2.0** (2026-01-20):
  - 청킹 파이프라인 상세 설계 (512 tokens, 10% overlap)
  - 2-Step Entity Extraction 설계
  - Neo4j v6 native Vector Index 적용
  - 전체 파일/코드 구조 상세화
  - 라이브러리 결정: pdf-parse, @gxl/epub-parser, tiktoken
- **v1.1.0** (2026-01-20): 최신 이미지 모델 조사 (GPT Image 1.5, HiDream-E1.1), Strategy Pattern 도입
- **v1.0.0** (2026-01-20): 초기 아키텍처 설계
