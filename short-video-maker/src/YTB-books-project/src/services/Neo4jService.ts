/**
 * Neo4jService
 * Neo4j GraphDB 연결 및 쿼리 서비스
 *
 * NEB (llm-graph-builder)에서 청킹된 데이터를 쿼리
 */

import neo4j, { Driver, Session, Record as Neo4jRecord } from 'neo4j-driver';
import { logger } from '../../../config';
import type {
  BookChunk,
  BookMetadata,
  Episode,
  Scene,
  EpisodeWithScenes,
  CreateEpisodeInput,
  CreateSceneInput,
  EpisodeStatus,
  DocumentSeries
} from '../types';

export interface Neo4jConfig {
  uri: string;
  username: string;
  password: string;
  database?: string;
}

export class Neo4jService {
  private driver: Driver;
  private database: string;

  constructor(config: Neo4jConfig) {
    this.driver = neo4j.driver(
      config.uri,
      neo4j.auth.basic(config.username, config.password)
    );
    this.database = config.database || 'neo4j';

    logger.info({ uri: config.uri, database: this.database }, 'Neo4jService initialized');
  }

  /**
   * 연결 테스트
   */
  async testConnection(): Promise<{ success: boolean; message: string; nodeCount?: number }> {
    const session = this.driver.session({ database: this.database });

    try {
      const result = await session.run('MATCH (n) RETURN count(n) as count');
      const count = result.records[0]?.get('count')?.toNumber() || 0;

      logger.info({ nodeCount: count }, 'Neo4j connection successful');

      return {
        success: true,
        message: `Connected to Neo4j. Total nodes: ${count}`,
        nodeCount: count
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ error: errorMsg }, 'Neo4j connection failed');

      return {
        success: false,
        message: `Connection failed: ${errorMsg}`
      };
    } finally {
      await session.close();
    }
  }

  /**
   * 책 목록 조회 (Document 노드)
   * NEB 스키마: Document -[:FIRST_CHUNK]-> Chunk -[:NEXT_CHUNK]-> Chunk
   */
  async getBooks(): Promise<BookMetadata[]> {
    const session = this.driver.session({ database: this.database });

    try {
      const result = await session.run(`
        MATCH (d:Document)
        RETURN d.fileName as title,
               d.fileSource as source,
               d.fileType as fileType,
               d.status as status,
               d.total_chunks as totalChunks,
               d.chunkNodeCount as chunkNodeCount,
               d.entityNodeCount as entityNodeCount,
               d.createdAt as createdAt,
               d.model as model
        ORDER BY d.createdAt DESC
      `);

      const books: BookMetadata[] = result.records.map((record: Neo4jRecord) => ({
        id: record.get('title'),
        title: record.get('title') || 'Unknown',
        totalChunks: record.get('chunkNodeCount')?.toNumber?.() || record.get('totalChunks')?.toNumber?.() || 0,
        processedAt: record.get('createdAt') ? new Date() : undefined // LocalDateTime 처리
      }));

      logger.info({ count: books.length }, 'Books retrieved from Neo4j');
      return books;
    } catch (error) {
      logger.error({ error }, 'Failed to get books');
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Document 노드의 contentType 조회
   */
  async getDocumentContentType(fileName: string): Promise<string | null> {
    const session = this.driver.session({ database: this.database });
    try {
      const result = await session.run(
        `MATCH (d:Document {fileName: $fileName}) RETURN d.contentType as contentType`,
        { fileName }
      );
      return result.records[0]?.get('contentType') || null;
    } catch (error) {
      logger.error({ error, fileName }, 'Failed to get document contentType');
      return null;
    } finally {
      await session.close();
    }
  }

  /**
   * Document 노드에 contentType 저장
   */
  async setDocumentContentType(fileName: string, contentType: string): Promise<void> {
    const session = this.driver.session({ database: this.database });
    try {
      await session.run(
        `MATCH (d:Document {fileName: $fileName}) SET d.contentType = $contentType`,
        { fileName, contentType }
      );
      logger.info({ fileName, contentType }, 'Document contentType saved to Neo4j');
    } catch (error) {
      logger.error({ error, fileName, contentType }, 'Failed to save document contentType');
    } finally {
      await session.close();
    }
  }

  /**
   * 특정 책의 청크 조회
   * NEB 스키마: Chunk.fileName으로 연결, position으로 정렬
   */
  async getChunks(bookId: string, limit?: number): Promise<BookChunk[]> {
    const session = this.driver.session({ database: this.database });

    try {
      const query = `
        MATCH (c:Chunk {fileName: $bookId})
        RETURN c.id as id,
               c.text as text,
               c.position as position,
               c.length as length,
               c.content_offset as contentOffset,
               c.latexFormulas as latexFormulas,
               c.sectionTitle as sectionTitle,
               c.summary as summary,
               c.keywords as keywords,
               c.chunkType as chunkType
        ORDER BY c.position ASC
        ${limit ? `LIMIT ${limit}` : ''}
      `;

      const result = await session.run(query, { bookId });

      const chunks: BookChunk[] = result.records.map((record: Neo4jRecord, index: number) => ({
        id: record.get('id') || `chunk_${index}`,
        bookId,
        chunkIndex: record.get('position')?.toNumber?.() || index,
        text: record.get('text') || '',
        summary: record.get('summary') || undefined,
        latexFormulas: record.get('latexFormulas') || undefined,
        sectionTitle: record.get('sectionTitle') || undefined,
        keywords: record.get('keywords') || undefined,
        chunkType: record.get('chunkType') || undefined,
      }));

      logger.info({ bookId, count: chunks.length }, 'Chunks retrieved');
      return chunks;
    } catch (error) {
      logger.error({ error, bookId }, 'Failed to get chunks');
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * 청크와 관련된 엔티티 조회
   */
  async getChunkEntities(chunkId: string): Promise<string[]> {
    const session = this.driver.session({ database: this.database });

    try {
      const result = await session.run(`
        MATCH (c:Chunk {id: $chunkId})-[:HAS_ENTITY]->(e:Entity)
        RETURN e.name as name, e.type as type
      `, { chunkId });

      return result.records.map((record: Neo4jRecord) =>
        `${record.get('name')} (${record.get('type')})`
      );
    } catch (error) {
      logger.error({ error, chunkId }, 'Failed to get chunk entities');
      return [];
    } finally {
      await session.close();
    }
  }

  // ============================================
  // NEB Entity-Based Episode Planning Methods
  // ============================================

  /**
   * 문서의 모든 엔티티 조회 (NEB 스키마)
   * __Entity__ 레이블과 실제 타입 레이블(TECHNOLOGY, PERSON, CONCEPT 등) 사용
   */
  async getDocumentEntities(fileName: string): Promise<Array<{
    id: string;
    name: string;
    type: string;
    description: string | null;
    chunkCount: number;
  }>> {
    const session = this.driver.session({ database: this.database });

    try {
      const result = await session.run(`
        MATCH (d:Document {fileName: $fileName})<-[:PART_OF]-(c:Chunk)-[:HAS_ENTITY]->(e)
        WITH e, labels(e) as lbls, count(DISTINCT c) as chunkCount
        RETURN e.id as name,
               e.description as description,
               [l IN lbls WHERE l <> '__Entity__'][0] as type,
               chunkCount
        ORDER BY chunkCount DESC
      `, { fileName });

      const entities = result.records.map((record: Neo4jRecord) => ({
        id: record.get('name') || 'unknown',
        name: record.get('name') || 'unknown',
        type: record.get('type') || 'CONCEPT',
        description: record.get('description') || null,
        chunkCount: record.get('chunkCount')?.toNumber?.() || 0
      }));

      logger.info({ fileName, entityCount: entities.length }, 'Document entities retrieved');
      return entities;
    } catch (error) {
      logger.error({ error, fileName }, 'Failed to get document entities');
      return [];
    } finally {
      await session.close();
    }
  }

  /**
   * 청크 + 연결된 엔티티 함께 조회
   */
  async getChunksWithEntities(fileName: string): Promise<Array<{
    chunk: BookChunk;
    entities: Array<{ name: string; type: string }>;
    pageNumber?: number;
  }>> {
    const session = this.driver.session({ database: this.database });

    try {
      const result = await session.run(`
        MATCH (d:Document {fileName: $fileName})<-[:PART_OF]-(c:Chunk)
        OPTIONAL MATCH (c)-[:HAS_ENTITY]->(e)
        WITH c, collect({
          name: e.id,
          type: [l IN labels(e) WHERE l <> '__Entity__'][0]
        }) as entities
        RETURN c.id as id,
               c.text as text,
               c.position as position,
               c.page_number as pageNumber,
               entities
        ORDER BY c.position ASC
      `, { fileName });

      const chunksWithEntities = result.records.map((record: Neo4jRecord, index: number) => {
        const entitiesRaw = record.get('entities') || [];
        const entities = entitiesRaw
          .filter((e: any) => e.name !== null)
          .map((e: any) => ({ name: e.name, type: e.type || 'CONCEPT' }));

        return {
          chunk: {
            id: record.get('id') || `chunk_${index}`,
            bookId: fileName,
            chunkIndex: record.get('position')?.toNumber?.() || index,
            text: record.get('text') || ''
          },
          entities,
          pageNumber: record.get('pageNumber')?.toNumber?.() || undefined
        };
      });

      logger.info({ fileName, count: chunksWithEntities.length }, 'Chunks with entities retrieved');
      return chunksWithEntities;
    } catch (error) {
      logger.error({ error, fileName }, 'Failed to get chunks with entities');
      return [];
    } finally {
      await session.close();
    }
  }

  /**
   * 엔티티 클러스터링 - 같은 주제의 엔티티를 그룹화
   * 클러스터별로 에피소드 생성에 사용
   */
  async getEntityClusters(fileName: string): Promise<Array<{
    clusterId: string;
    clusterName: string;
    mainEntity: string;
    relatedEntities: string[];
    chunkIds: string[];
    summary?: string;
  }>> {
    const session = this.driver.session({ database: this.database });

    try {
      // 1. 핵심 기술/개념 엔티티 (많은 청크에 등장하는 것)
      // 최소 2개 청크에 등장하는 엔티티 선택 (더 많은 클러스터 생성)
      const mainEntitiesResult = await session.run(`
        MATCH (d:Document {fileName: $fileName})<-[:PART_OF]-(c:Chunk)-[:HAS_ENTITY]->(e)
        WITH e, labels(e) as lbls, collect(DISTINCT c.id) as chunkIds, count(DISTINCT c) as chunkCount
        WHERE chunkCount >= 2
        WITH e, lbls, chunkIds, chunkCount
        ORDER BY chunkCount DESC
        LIMIT 15
        RETURN e.id as name,
               [l IN lbls WHERE l <> '__Entity__'][0] as type,
               chunkIds,
               chunkCount
      `, { fileName });

      // 2. 각 핵심 엔티티별로 관련 엔티티와 청크 그룹화
      const clusters: Array<{
        clusterId: string;
        clusterName: string;
        mainEntity: string;
        relatedEntities: string[];
        chunkIds: string[];
      }> = [];

      const usedChunks = new Set<string>();

      for (let i = 0; i < mainEntitiesResult.records.length && clusters.length < 10; i++) {
        const record = mainEntitiesResult.records[i];
        const mainEntity = record.get('name');
        const entityType = record.get('type');
        const chunkIds: string[] = record.get('chunkIds') || [];

        // 이미 사용된 청크가 50% 이상이면 스킵
        const newChunks = chunkIds.filter(id => !usedChunks.has(id));
        if (newChunks.length < chunkIds.length * 0.5) continue;

        // 관련 엔티티 조회
        const relatedResult = await session.run(`
          MATCH (e {id: $mainEntity})<-[:HAS_ENTITY]-(c:Chunk)-[:HAS_ENTITY]->(related)
          WHERE related.id <> $mainEntity
          WITH related, count(c) as coOccurrence
          ORDER BY coOccurrence DESC
          LIMIT 5
          RETURN related.id as name
        `, { mainEntity });

        const relatedEntities = relatedResult.records.map((r: Neo4jRecord) => r.get('name'));

        // 클러스터 이름 생성
        const clusterName = entityType === 'TECHNOLOGY'
          ? `${mainEntity} 기술 분석`
          : entityType === 'PERSON'
          ? `${mainEntity}의 연구`
          : `${mainEntity} 개념 설명`;

        clusters.push({
          clusterId: `cluster_${i}`,
          clusterName,
          mainEntity,
          relatedEntities,
          chunkIds: newChunks
        });

        // 사용된 청크 표시
        newChunks.forEach(id => usedChunks.add(id));
      }

      // 3. 클러스터가 3개 미만이면 청크 기반 분할 폴백
      if (clusters.length < 3) {
        logger.info({ fileName, entityClusters: clusters.length }, '엔티티 클러스터 부족, 청크 기반 분할 시도');

        // 전체 청크 조회
        const allChunksResult = await session.run(`
          MATCH (d:Document {fileName: $fileName})<-[:PART_OF]-(c:Chunk)
          RETURN c.id as id, c.text as text, c.position as position
          ORDER BY c.position ASC
        `, { fileName });

        const allChunks = allChunksResult.records.map((r: Neo4jRecord) => ({
          id: r.get('id'),
          text: r.get('text') || '',
          position: r.get('position') || 0
        }));

        // 청크를 3-4개씩 그룹화하여 추가 클러스터 생성
        const chunkGroupSize = Math.ceil(allChunks.length / 5); // 5개 클러스터 목표
        let groupIndex = clusters.length;

        for (let i = 0; i < allChunks.length; i += chunkGroupSize) {
          if (clusters.length >= 7) break;

          const groupChunks = allChunks.slice(i, i + chunkGroupSize);
          const groupChunkIds = groupChunks.map(c => c.id).filter(id => !usedChunks.has(id));

          if (groupChunkIds.length === 0) continue;

          // 그룹의 첫 텍스트에서 주제 추출 (간략화)
          const firstText = groupChunks[0]?.text || '';
          const topicMatch = firstText.match(/^([^.!?]{10,50})/);
          const topic = topicMatch ? topicMatch[1].trim() : `섹션 ${groupIndex + 1}`;

          clusters.push({
            clusterId: `chunk_group_${groupIndex}`,
            clusterName: `${topic} 상세 설명`,
            mainEntity: topic,
            relatedEntities: [],
            chunkIds: groupChunkIds
          });

          groupChunkIds.forEach(id => usedChunks.add(id));
          groupIndex++;
        }

        logger.info({ fileName, finalClusterCount: clusters.length }, '청크 기반 추가 클러스터 생성 완료');
      }

      logger.info({ fileName, clusterCount: clusters.length }, 'Entity clusters created');
      return clusters;
    } catch (error) {
      logger.error({ error, fileName }, 'Failed to get entity clusters');
      return [];
    } finally {
      await session.close();
    }
  }

  /**
   * 특정 엔티티 클러스터의 청크 텍스트 조회
   */
  async getClusterChunkTexts(chunkIds: string[]): Promise<string[]> {
    const session = this.driver.session({ database: this.database });

    try {
      const result = await session.run(`
        MATCH (c:Chunk)
        WHERE c.id IN $chunkIds
        RETURN c.text as text, c.position as position
        ORDER BY c.position ASC
      `, { chunkIds });

      return result.records.map((r: Neo4jRecord) => r.get('text') || '');
    } catch (error) {
      logger.error({ error }, 'Failed to get cluster chunk texts');
      return [];
    } finally {
      await session.close();
    }
  }

  /**
   * 유사 청크 검색 (벡터 검색)
   */
  async searchSimilarChunks(
    query: string,
    topK: number = 5
  ): Promise<Array<BookChunk & { score: number }>> {
    const session = this.driver.session({ database: this.database });

    try {
      // NEB에서 임베딩이 저장된 경우
      const result = await session.run(`
        CALL db.index.fulltext.queryNodes("chunkTextIndex", $query) YIELD node, score
        RETURN node.id as id,
               node.text as text,
               node.position as position,
               score
        LIMIT $topK
      `, { query, topK: neo4j.int(topK) });

      return result.records.map((record: Neo4jRecord, index: number) => ({
        id: record.get('id') || `search_${index}`,
        bookId: '',
        chunkIndex: record.get('position')?.toNumber?.() || index,
        text: record.get('text') || '',
        score: record.get('score') || 0
      }));
    } catch (error) {
      logger.warn({ error }, 'Full-text search not available, using fallback');
      return [];
    } finally {
      await session.close();
    }
  }

  /**
   * 그래프 통계 조회
   * NEB 스키마: __Entity__ 레이블 사용
   */
  async getGraphStats(): Promise<{
    documents: number;
    chunks: number;
    entities: number;
    relationships: number;
  }> {
    const session = this.driver.session({ database: this.database });

    try {
      // 각 카운트를 개별 쿼리로 실행 (더 안정적)
      const docsResult = await session.run('MATCH (d:Document) RETURN count(d) as count');
      const chunksResult = await session.run('MATCH (c:Chunk) RETURN count(c) as count');
      const entitiesResult = await session.run('MATCH (e:__Entity__) RETURN count(e) as count');
      const relsResult = await session.run('MATCH ()-[r]->() RETURN count(r) as count');

      return {
        documents: docsResult.records[0]?.get('count')?.toNumber?.() || 0,
        chunks: chunksResult.records[0]?.get('count')?.toNumber?.() || 0,
        entities: entitiesResult.records[0]?.get('count')?.toNumber?.() || 0,
        relationships: relsResult.records[0]?.get('count')?.toNumber?.() || 0
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get graph stats');
      return { documents: 0, chunks: 0, entities: 0, relationships: 0 };
    } finally {
      await session.close();
    }
  }

  /**
   * 커스텀 Cypher 쿼리 실행
   */
  async runQuery(cypher: string, params?: Record<string, unknown>): Promise<Neo4jRecord[]> {
    const session = this.driver.session({ database: this.database });

    try {
      const result = await session.run(cypher, params);
      return result.records;
    } finally {
      await session.close();
    }
  }

  // ============================================
  // Shorts 상태 관리 메서드
  // ============================================

  /**
   * Shorts 미생성 문서 조회
   * shorts_status가 null, 'pending', 'analyzed' 인 문서들
   */
  async getUnprocessedDocuments(): Promise<BookMetadata[]> {
    const session = this.driver.session({ database: this.database });

    try {
      const result = await session.run(`
        MATCH (d:Document)
        WHERE d.shorts_status IS NULL
           OR d.shorts_status = 'pending'
           OR d.shorts_status = 'analyzed'
        RETURN d.fileName as title,
               d.fileSource as source,
               d.status as status,
               d.chunkNodeCount as chunkNodeCount,
               d.shorts_status as shortsStatus,
               d.shorts_updated_at as shortsUpdatedAt
        ORDER BY d.createdAt DESC
      `);

      const books: BookMetadata[] = result.records.map((record: Neo4jRecord) => ({
        id: record.get('title'),
        title: record.get('title') || 'Unknown',
        totalChunks: record.get('chunkNodeCount')?.toNumber?.() || 0,
        shortsStatus: record.get('shortsStatus') || 'pending'
      }));

      logger.info({ count: books.length }, 'Unprocessed documents retrieved');
      return books;
    } catch (error) {
      logger.error({ error }, 'Failed to get unprocessed documents');
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * 문서 Shorts 상태 업데이트
   */
  async updateDocumentShortsStatus(
    fileName: string,
    status: 'pending' | 'analyzed' | 'generating' | 'completed' | 'uploaded',
    metadata?: { planId?: string; totalShorts?: number }
  ): Promise<boolean> {
    const session = this.driver.session({ database: this.database });

    try {
      const setClause = metadata?.planId
        ? 'SET d.shorts_status = $status, d.shorts_updated_at = datetime(), d.shorts_plan_id = $planId'
        : metadata?.totalShorts
        ? 'SET d.shorts_status = $status, d.shorts_updated_at = datetime(), d.shorts_total = $totalShorts'
        : 'SET d.shorts_status = $status, d.shorts_updated_at = datetime()';

      const result = await session.run(`
        MATCH (d:Document {fileName: $fileName})
        ${setClause}
        RETURN d.shorts_status as status
      `, {
        fileName,
        status,
        planId: metadata?.planId,
        totalShorts: metadata?.totalShorts ? neo4j.int(metadata.totalShorts) : null
      });

      if (result.records.length === 0) {
        logger.warn({ fileName }, 'Document not found for status update');
        return false;
      }

      logger.info({ fileName, status }, 'Document shorts status updated');
      return true;
    } catch (error) {
      logger.error({ error, fileName }, 'Failed to update document status');
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * v3.4.0: Document별 비디오 설정 저장
   * Document 노드에 videoConfig JSON 속성으로 저장
   */
  async saveDocumentVideoConfig(
    documentId: string,
    config: import('../types').DocumentVideoConfig
  ): Promise<boolean> {
    const session = this.driver.session({ database: this.database });

    try {
      const result = await session.run(`
        MATCH (d:Document {fileName: $documentId})
        SET d.videoConfig = $configJson, d.videoConfig_updated_at = datetime()
        RETURN d.fileName as id
      `, {
        documentId,
        configJson: JSON.stringify(config)
      });

      if (result.records.length === 0) {
        logger.warn({ documentId }, 'Document not found for config save');
        return false;
      }

      logger.info({ documentId, contentType: config.contentType }, 'Document video config saved');
      return true;
    } catch (error) {
      logger.error({ error, documentId }, 'Failed to save document video config');
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * v3.4.0: Document별 비디오 설정 조회
   * 없으면 null 반환 (호출측에서 기본 프리셋 사용)
   */
  async getDocumentVideoConfig(
    documentId: string
  ): Promise<import('../types').DocumentVideoConfig | null> {
    const session = this.driver.session({ database: this.database });

    try {
      const result = await session.run(`
        MATCH (d:Document {fileName: $documentId})
        RETURN d.videoConfig as configJson
      `, { documentId });

      if (result.records.length === 0 || !result.records[0].get('configJson')) {
        return null;
      }

      const configJson = result.records[0].get('configJson');
      return JSON.parse(configJson);
    } catch (error) {
      logger.warn({ error, documentId }, 'Failed to load document video config');
      return null;
    } finally {
      await session.close();
    }
  }

  /**
   * Shorts 계획을 Neo4j에 저장
   */
  async savePlan(fileName: string, plan: object): Promise<string> {
    const session = this.driver.session({ database: this.database });
    const planId = `plan_${Date.now()}`;

    try {
      await session.run(`
        MATCH (d:Document {fileName: $fileName})
        CREATE (p:ShortsPlan {
          id: $planId,
          data: $planJson,
          createdAt: datetime()
        })
        CREATE (d)-[:HAS_PLAN]->(p)
        SET d.shorts_status = 'analyzed',
            d.shorts_plan_id = $planId,
            d.shorts_updated_at = datetime()
        RETURN p.id as planId
      `, {
        fileName,
        planId,
        planJson: JSON.stringify(plan)
      });

      logger.info({ fileName, planId }, 'Shorts plan saved to Neo4j');
      return planId;
    } catch (error) {
      logger.error({ error, fileName }, 'Failed to save plan');
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * 저장된 Shorts 계획 조회
   */
  async getPlan(fileName: string): Promise<object | null> {
    const session = this.driver.session({ database: this.database });

    try {
      const result = await session.run(`
        MATCH (d:Document {fileName: $fileName})-[:HAS_PLAN]->(p:ShortsPlan)
        RETURN p.data as planJson, p.id as planId, p.createdAt as createdAt
        ORDER BY p.createdAt DESC
        LIMIT 1
      `, { fileName });

      if (result.records.length === 0) {
        return null;
      }

      const planJson = result.records[0].get('planJson');
      return JSON.parse(planJson);
    } catch (error) {
      logger.error({ error, fileName }, 'Failed to get plan');
      return null;
    } finally {
      await session.close();
    }
  }

  /**
   * 연결 종료
   */
  async close(): Promise<void> {
    await this.driver.close();
    logger.info('Neo4j connection closed');
  }

  // ============================================
  // Episode/Scene CRUD 메서드 (시리즈 연속성)
  // ============================================

  /**
   * Episode 생성
   * Document-[:HAS_EPISODE]->Episode 관계도 생성
   */
  async createEpisode(input: CreateEpisodeInput): Promise<Episode> {
    const session = this.driver.session({ database: this.database });
    const episodeId = `ep_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    try {
      const result = await session.run(`
        MATCH (d:Document {fileName: $documentId})
        CREATE (e:Episode {
          id: $episodeId,
          documentId: $documentId,
          episodeNumber: $episodeNumber,
          title: $title,
          hook: $hook,
          cta: $cta,
          ctaAction: $ctaAction,
          durationSec: 0,
          sceneCount: 0,
          keywords: $keywords,
          hashtags: $hashtags,
          description: $description,
          summary: $summary,
          status: 'draft',
          createdAt: datetime(),
          updatedAt: datetime()
        })
        CREATE (d)-[:HAS_EPISODE {order: $episodeNumber}]->(e)
        WITH e, d
        OPTIONAL MATCH (prevEp:Episode {id: $previousEpisodeId})
        FOREACH (prev IN CASE WHEN prevEp IS NOT NULL THEN [prevEp] ELSE [] END |
          CREATE (prev)-[:NEXT]->(e)
          SET prev.nextEpisodeId = e.id
          SET e.previousEpisodeId = prev.id
        )
        SET d.totalEpisodes = COALESCE(d.totalEpisodes, 0) + 1
        RETURN e
      `, {
        episodeId,
        documentId: input.documentId,
        episodeNumber: neo4j.int(input.episodeNumber),
        title: input.title,
        hook: input.hook,
        cta: input.cta,
        ctaAction: input.ctaAction || 'next_episode',
        keywords: input.keywords || [],
        hashtags: input.hashtags || [],
        description: input.description || '',
        summary: input.summary || '',
        previousEpisodeId: input.previousEpisodeId || ''
      });

      if (result.records.length === 0) {
        throw new Error(`Document not found: ${input.documentId}`);
      }

      const record = result.records[0].get('e').properties;
      logger.info({ episodeId, documentId: input.documentId, episodeNumber: input.episodeNumber },
        'Episode created');

      return this.recordToEpisode(record);
    } catch (error) {
      logger.error({ error, input }, 'Failed to create episode');
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Scene 생성
   * Episode-[:HAS_SCENE]->Scene 관계 생성
   * Scene-[:BASED_ON]->Chunk 관계 생성 (sourceChunkIds)
   */
  async createScene(input: CreateSceneInput): Promise<Scene> {
    const session = this.driver.session({ database: this.database });
    const sceneId = `sc_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    try {
      const result = await session.run(`
        MATCH (e:Episode {id: $episodeId})
        CREATE (s:Scene {
          id: $sceneId,
          episodeId: $episodeId,
          sceneNumber: $sceneNumber,
          type: $type,
          narration: $narration,
          onScreenText: $onScreenText,
          durationSec: $durationSec,
          visualType: $visualType,
          visualDesc: $visualDesc,
          camera: $camera,
          transition: $transition,
          sourceChunkIds: $sourceChunkIds,
          mentionedEntities: $mentionedEntities,
          assignedFormula: $assignedFormula,
          formulaName: $formulaName,
          formulaMetaphor: $formulaMetaphor,
          firstFramePrompt: $firstFramePrompt,
          lastFramePrompt: $lastFramePrompt
        })
        CREATE (e)-[:HAS_SCENE {order: $sceneNumber}]->(s)
        SET e.sceneCount = COALESCE(e.sceneCount, 0) + 1,
            e.durationSec = COALESCE(e.durationSec, 0) + $durationSec,
            e.updatedAt = datetime()
        WITH s, e
        UNWIND $sourceChunkIds AS chunkId
        OPTIONAL MATCH (c:Chunk {id: chunkId})
        FOREACH (chunk IN CASE WHEN c IS NOT NULL THEN [c] ELSE [] END |
          CREATE (s)-[:BASED_ON {relevance: 0.8}]->(chunk)
        )
        RETURN s
      `, {
        sceneId,
        episodeId: input.episodeId,
        sceneNumber: neo4j.int(input.sceneNumber),
        type: input.type,
        narration: input.narration,
        onScreenText: input.onScreenText || '',
        durationSec: neo4j.int(input.durationSec || 7),
        visualType: input.visualType || 'animation',
        visualDesc: input.visualDesc,
        camera: input.camera || 'static',
        transition: input.transition || 'cut',
        sourceChunkIds: input.sourceChunkIds || [],
        mentionedEntities: input.mentionedEntities || [],
        assignedFormula: input.assignedFormula || '',
        formulaName: input.formulaName || '',
        formulaMetaphor: input.formulaMetaphor || '',
        firstFramePrompt: input.firstFramePrompt || '',
        lastFramePrompt: input.lastFramePrompt || ''
      });

      if (result.records.length === 0) {
        throw new Error(`Episode not found: ${input.episodeId}`);
      }

      const record = result.records[0].get('s').properties;
      logger.info({ sceneId, episodeId: input.episodeId, sceneNumber: input.sceneNumber },
        'Scene created');

      return this.recordToScene(record);
    } catch (error) {
      logger.error({ error, input }, 'Failed to create scene');
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Episode + Scenes 생성 (단일 트랜잭션)
   * 세션 간 타이밍 이슈 방지를 위해 단일 세션에서 모든 작업 수행
   */
  async createEpisodeWithScenes(
    episodeInput: CreateEpisodeInput,
    scenesInput: Omit<CreateSceneInput, 'episodeId' | 'sceneNumber'>[]
  ): Promise<EpisodeWithScenes> {
    const session = this.driver.session({ database: this.database });
    const episodeId = `ep_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    try {
      // 단일 트랜잭션으로 Episode + Scenes 생성
      const tx = session.beginTransaction();

      try {
        // 1. Episode 생성
        const epResult = await tx.run(`
          MATCH (d:Document {fileName: $documentId})
          CREATE (e:Episode {
            id: $episodeId,
            documentId: $documentId,
            episodeNumber: $episodeNumber,
            title: $title,
            hook: $hook,
            cta: $cta,
            ctaAction: $ctaAction,
            durationSec: 0,
            sceneCount: $sceneCount,
            keywords: $keywords,
            hashtags: $hashtags,
            description: $description,
            summary: $summary,
            status: 'draft',
            createdAt: datetime(),
            updatedAt: datetime()
          })
          CREATE (d)-[:HAS_EPISODE {order: $episodeNumber}]->(e)
          WITH e, d
          OPTIONAL MATCH (prevEp:Episode {id: $previousEpisodeId})
          FOREACH (prev IN CASE WHEN prevEp IS NOT NULL THEN [prevEp] ELSE [] END |
            CREATE (prev)-[:NEXT]->(e)
            SET prev.nextEpisodeId = e.id
            SET e.previousEpisodeId = prev.id
          )
          SET d.totalEpisodes = COALESCE(d.totalEpisodes, 0) + 1
          RETURN e
        `, {
          episodeId,
          documentId: episodeInput.documentId,
          episodeNumber: neo4j.int(episodeInput.episodeNumber),
          title: episodeInput.title,
          hook: episodeInput.hook,
          cta: episodeInput.cta,
          ctaAction: episodeInput.ctaAction || 'next_episode',
          sceneCount: neo4j.int(scenesInput.length),
          keywords: episodeInput.keywords || [],
          hashtags: episodeInput.hashtags || [],
          description: episodeInput.description || '',
          summary: episodeInput.summary || '',
          previousEpisodeId: episodeInput.previousEpisodeId || ''
        });

        if (epResult.records.length === 0) {
          throw new Error(`Document not found: ${episodeInput.documentId}`);
        }

        const episode = this.recordToEpisode(epResult.records[0].get('e').properties);

        // 2. Scenes 생성 (같은 트랜잭션)
        const scenes: Scene[] = [];
        let totalDuration = 0;

        for (let i = 0; i < scenesInput.length; i++) {
          const sceneInput = scenesInput[i];
          const sceneId = `sc_${Date.now()}_${i}_${Math.random().toString(36).substring(5)}`;
          const durationSec = sceneInput.durationSec || 7;
          totalDuration += durationSec;

          const scResult = await tx.run(`
            MATCH (e:Episode {id: $episodeId})
            CREATE (s:Scene {
              id: $sceneId,
              episodeId: $episodeId,
              sceneNumber: $sceneNumber,
              type: $type,
              narration: $narration,
              onScreenText: $onScreenText,
              durationSec: $durationSec,
              visualType: $visualType,
              visualDesc: $visualDesc,
              camera: $camera,
              transition: $transition,
              sourceChunkIds: $sourceChunkIds,
              mentionedEntities: $mentionedEntities,
              assignedFormula: $assignedFormula,
              formulaName: $formulaName,
              formulaMetaphor: $formulaMetaphor,
              firstFramePrompt: $firstFramePrompt,
              lastFramePrompt: $lastFramePrompt
            })
            CREATE (e)-[:HAS_SCENE {order: $sceneNumber}]->(s)
            RETURN s
          `, {
            sceneId,
            episodeId,
            sceneNumber: neo4j.int(i + 1),
            type: sceneInput.type || 'explanation',
            narration: sceneInput.narration,
            onScreenText: sceneInput.onScreenText || '',
            durationSec: neo4j.int(durationSec),
            visualType: sceneInput.visualType || 'animation',
            visualDesc: sceneInput.visualDesc,
            camera: sceneInput.camera || 'static',
            transition: sceneInput.transition || 'cut',
            sourceChunkIds: sceneInput.sourceChunkIds || [],
            mentionedEntities: sceneInput.mentionedEntities || [],
            assignedFormula: (sceneInput as any).assignedFormula || '',
            formulaName: (sceneInput as any).formulaName || '',
            formulaMetaphor: (sceneInput as any).formulaMetaphor || '',
            firstFramePrompt: (sceneInput as any).firstFramePrompt || '',
            lastFramePrompt: (sceneInput as any).lastFramePrompt || ''
          });

          if (scResult.records.length > 0) {
            scenes.push(this.recordToScene(scResult.records[0].get('s').properties));
          }
        }

        // 3. Episode duration 업데이트
        await tx.run(`
          MATCH (e:Episode {id: $episodeId})
          SET e.durationSec = $totalDuration
        `, { episodeId, totalDuration: neo4j.int(totalDuration) });

        // 트랜잭션 커밋
        await tx.commit();

        logger.info({
          episodeId,
          documentId: episodeInput.documentId,
          episodeNumber: episodeInput.episodeNumber,
          sceneCount: scenes.length
        }, 'Episode with scenes created (single transaction)');

        return {
          ...episode,
          durationSec: totalDuration,
          sceneCount: scenes.length,
          scenes
        };
      } catch (txError) {
        await tx.rollback();
        throw txError;
      }
    } catch (error) {
      logger.error({ error, episodeInput }, 'Failed to create episode with scenes');
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Episode 조회 (ID)
   */
  async getEpisode(episodeId: string): Promise<Episode | null> {
    const session = this.driver.session({ database: this.database });

    try {
      const result = await session.run(`
        MATCH (e:Episode {id: $episodeId})
        RETURN e
      `, { episodeId });

      if (result.records.length === 0) {
        return null;
      }

      return this.recordToEpisode(result.records[0].get('e').properties);
    } catch (error) {
      logger.error({ error, episodeId }, 'Failed to get episode');
      return null;
    } finally {
      await session.close();
    }
  }

  /**
   * Episode + Scenes 조회
   */
  async getEpisodeWithScenes(episodeId: string): Promise<EpisodeWithScenes | null> {
    const session = this.driver.session({ database: this.database });

    try {
      const result = await session.run(`
        MATCH (e:Episode {id: $episodeId})
        OPTIONAL MATCH (e)-[:HAS_SCENE]->(s:Scene)
        WITH e, s ORDER BY s.sceneNumber
        WITH e, collect(s) as scenes
        RETURN e, scenes
      `, { episodeId });

      if (result.records.length === 0) {
        return null;
      }

      const record = result.records[0];
      const episode = this.recordToEpisode(record.get('e').properties);
      const scenesRaw = record.get('scenes') || [];
      const scenes = scenesRaw
        .filter((s: any) => s !== null)
        .map((s: any) => this.recordToScene(s.properties));

      return { ...episode, scenes };
    } catch (error) {
      logger.error({ error, episodeId }, 'Failed to get episode with scenes');
      return null;
    } finally {
      await session.close();
    }
  }

  /**
   * Document의 모든 Episode 조회
   */
  async getDocumentEpisodes(documentId: string): Promise<Episode[]> {
    const session = this.driver.session({ database: this.database });

    try {
      const result = await session.run(`
        MATCH (d:Document {fileName: $documentId})-[:HAS_EPISODE]->(e:Episode)
        RETURN e
        ORDER BY e.episodeNumber
      `, { documentId });

      return result.records.map((r: Neo4jRecord) => this.recordToEpisode(r.get('e').properties));
    } catch (error) {
      logger.error({ error, documentId }, 'Failed to get document episodes');
      return [];
    } finally {
      await session.close();
    }
  }

  /**
   * Document의 마지막 Episode 번호 조회
   */
  async getLastEpisodeNumber(documentId: string): Promise<number> {
    const session = this.driver.session({ database: this.database });

    try {
      const result = await session.run(`
        MATCH (d:Document {fileName: $documentId})-[:HAS_EPISODE]->(e:Episode)
        RETURN max(e.episodeNumber) as lastEpisodeNumber
      `, { documentId });

      const lastNum = result.records[0]?.get('lastEpisodeNumber');
      return lastNum?.toNumber?.() || 0;
    } catch (error) {
      logger.error({ error, documentId }, 'Failed to get last episode number');
      return 0;
    } finally {
      await session.close();
    }
  }

  /**
   * Document의 전체 시리즈 조회
   */
  async getDocumentSeries(documentId: string): Promise<DocumentSeries | null> {
    const session = this.driver.session({ database: this.database });

    try {
      const result = await session.run(`
        MATCH (d:Document {fileName: $documentId})
        OPTIONAL MATCH (d)-[:HAS_EPISODE]->(e:Episode)
        OPTIONAL MATCH (e)-[:HAS_SCENE]->(s:Scene)
        WITH d, e, s ORDER BY e.episodeNumber, s.sceneNumber
        WITH d, e, collect(s) as scenes
        WITH d, collect({episode: e, scenes: scenes}) as episodesData
        RETURN d.fileName as documentId,
               d.fileName as documentTitle,
               size(episodesData) as totalEpisodes,
               episodesData,
               d.createdAt as createdAt
      `, { documentId });

      if (result.records.length === 0) {
        return null;
      }

      const record = result.records[0];
      const episodesData = record.get('episodesData') || [];

      const episodes: EpisodeWithScenes[] = episodesData
        .filter((ed: any) => ed.episode !== null)
        .map((ed: any) => {
          const episode = this.recordToEpisode(ed.episode.properties);
          const scenes = (ed.scenes || [])
            .filter((s: any) => s !== null)
            .map((s: any) => this.recordToScene(s.properties));
          return { ...episode, scenes };
        });

      const lastEpisodeNumber = episodes.length > 0
        ? Math.max(...episodes.map(e => e.episodeNumber))
        : 0;

      return {
        documentId: record.get('documentId'),
        documentTitle: record.get('documentTitle'),
        totalEpisodes: episodes.length,
        episodes,
        createdAt: new Date(),
        lastEpisodeNumber
      };
    } catch (error) {
      logger.error({ error, documentId }, 'Failed to get document series');
      return null;
    } finally {
      await session.close();
    }
  }

  /**
   * 두 Episode 연결 (previousEpisodeId ↔ nextEpisodeId)
   */
  async linkEpisodes(previousEpisodeId: string, nextEpisodeId: string): Promise<boolean> {
    const session = this.driver.session({ database: this.database });

    try {
      await session.run(`
        MATCH (prev:Episode {id: $previousEpisodeId})
        MATCH (next:Episode {id: $nextEpisodeId})
        SET prev.nextEpisodeId = $nextEpisodeId,
            next.previousEpisodeId = $previousEpisodeId,
            prev.updatedAt = datetime(),
            next.updatedAt = datetime()
      `, { previousEpisodeId, nextEpisodeId });

      logger.debug({ previousEpisodeId, nextEpisodeId }, 'Episodes linked');
      return true;
    } catch (error) {
      logger.error({ error, previousEpisodeId, nextEpisodeId }, 'Failed to link episodes');
      return false;
    } finally {
      await session.close();
    }
  }

  /**
   * Episode 상태 업데이트
   */
  async updateEpisodeStatus(episodeId: string, status: EpisodeStatus, metadata?: {
    masterImagePath?: string;
    videoPath?: string;
    youtubeId?: string;
  }): Promise<boolean> {
    const session = this.driver.session({ database: this.database });

    try {
      let setClause = 'SET e.status = $status, e.updatedAt = datetime()';

      if (metadata?.masterImagePath) {
        setClause += ', e.masterImagePath = $masterImagePath';
      }
      if (metadata?.videoPath) {
        setClause += ', e.videoPath = $videoPath';
      }
      if (metadata?.youtubeId) {
        setClause += ', e.youtubeId = $youtubeId';
      }

      const result = await session.run(`
        MATCH (e:Episode {id: $episodeId})
        ${setClause}
        RETURN e.status as status
      `, {
        episodeId,
        status,
        masterImagePath: metadata?.masterImagePath || null,
        videoPath: metadata?.videoPath || null,
        youtubeId: metadata?.youtubeId || null
      });

      if (result.records.length === 0) {
        logger.warn({ episodeId }, 'Episode not found for status update');
        return false;
      }

      logger.info({ episodeId, status }, 'Episode status updated');
      return true;
    } catch (error) {
      logger.error({ error, episodeId }, 'Failed to update episode status');
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Scene 업데이트 (이미지/오디오/클립 경로)
   */
  async updateSceneAssets(sceneId: string, assets: {
    imagePath?: string;
    audioPath?: string;
    clipPath?: string;
  }): Promise<boolean> {
    const session = this.driver.session({ database: this.database });

    try {
      let setClause = 'SET ';
      const setClauses: string[] = [];

      if (assets.imagePath) setClauses.push('s.imagePath = $imagePath');
      if (assets.audioPath) setClauses.push('s.audioPath = $audioPath');
      if (assets.clipPath) setClauses.push('s.clipPath = $clipPath');

      if (setClauses.length === 0) return true;

      setClause += setClauses.join(', ');

      const result = await session.run(`
        MATCH (s:Scene {id: $sceneId})
        ${setClause}
        RETURN s.id as id
      `, {
        sceneId,
        imagePath: assets.imagePath || null,
        audioPath: assets.audioPath || null,
        clipPath: assets.clipPath || null
      });

      return result.records.length > 0;
    } catch (error) {
      logger.error({ error, sceneId }, 'Failed to update scene assets');
      return false;
    } finally {
      await session.close();
    }
  }

  /**
   * 다음 처리할 Episode 조회 (draft 상태인 것 중 가장 빠른 것)
   */
  async getNextPendingEpisode(documentId?: string): Promise<Episode | null> {
    const session = this.driver.session({ database: this.database });

    try {
      const whereClause = documentId
        ? 'WHERE e.status = "draft" AND e.documentId = $documentId'
        : 'WHERE e.status = "draft"';

      const result = await session.run(`
        MATCH (e:Episode)
        ${whereClause}
        RETURN e
        ORDER BY e.createdAt
        LIMIT 1
      `, { documentId: documentId || '' });

      if (result.records.length === 0) {
        return null;
      }

      return this.recordToEpisode(result.records[0].get('e').properties);
    } catch (error) {
      logger.error({ error }, 'Failed to get next pending episode');
      return null;
    } finally {
      await session.close();
    }
  }

  /**
   * Episode/Scene 통계
   */
  async getEpisodeStats(): Promise<{
    totalEpisodes: number;
    totalScenes: number;
    byStatus: Record<string, number>;
    byDocument: Array<{ documentId: string; episodeCount: number }>;
  }> {
    const session = this.driver.session({ database: this.database });

    try {
      const totalEpResult = await session.run('MATCH (e:Episode) RETURN count(e) as count');
      const totalScResult = await session.run('MATCH (s:Scene) RETURN count(s) as count');

      const statusResult = await session.run(`
        MATCH (e:Episode)
        RETURN e.status as status, count(e) as count
      `);

      const docResult = await session.run(`
        MATCH (e:Episode)
        RETURN e.documentId as documentId, count(e) as count
        ORDER BY count DESC
      `);

      const byStatus: Record<string, number> = {};
      statusResult.records.forEach((r: Neo4jRecord) => {
        byStatus[r.get('status') || 'unknown'] = r.get('count')?.toNumber?.() || 0;
      });

      const byDocument = docResult.records.map((r: Neo4jRecord) => ({
        documentId: r.get('documentId'),
        episodeCount: r.get('count')?.toNumber?.() || 0
      }));

      return {
        totalEpisodes: totalEpResult.records[0]?.get('count')?.toNumber?.() || 0,
        totalScenes: totalScResult.records[0]?.get('count')?.toNumber?.() || 0,
        byStatus,
        byDocument
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get episode stats');
      return { totalEpisodes: 0, totalScenes: 0, byStatus: {}, byDocument: [] };
    } finally {
      await session.close();
    }
  }

  /**
   * 문서의 draft 에피소드 + 관련 Scene 삭제
   * completed 에피소드는 보존
   */
  async deleteDraftEpisodes(documentId: string): Promise<{ deletedEpisodes: number; deletedScenes: number }> {
    const session = this.driver.session({ database: this.database });

    try {
      // 1. draft Episode에 연결된 Scene 삭제
      const sceneResult = await session.run(`
        MATCH (e:Episode {documentId: $documentId, status: 'draft'})-[:HAS_SCENE]->(s:Scene)
        DETACH DELETE s
        RETURN count(s) as count
      `, { documentId });

      // 2. draft Episode 삭제
      const epResult = await session.run(`
        MATCH (e:Episode {documentId: $documentId, status: 'draft'})
        DETACH DELETE e
        RETURN count(e) as count
      `, { documentId });

      const deletedScenes = sceneResult.records[0]?.get('count')?.toNumber?.() || 0;
      const deletedEpisodes = epResult.records[0]?.get('count')?.toNumber?.() || 0;

      logger.info({ documentId, deletedEpisodes, deletedScenes }, 'Deleted draft episodes and scenes');
      return { deletedEpisodes, deletedScenes };
    } catch (error) {
      logger.error({ error, documentId }, 'Failed to delete draft episodes');
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * 문서의 모든 에피소드 + Scene 삭제 (completed 포함)
   */
  async deleteAllEpisodes(documentId: string): Promise<{ deletedEpisodes: number; deletedScenes: number }> {
    const session = this.driver.session({ database: this.database });

    try {
      const sceneResult = await session.run(`
        MATCH (e:Episode {documentId: $documentId})-[:HAS_SCENE]->(s:Scene)
        DETACH DELETE s
        RETURN count(s) as count
      `, { documentId });

      const epResult = await session.run(`
        MATCH (e:Episode {documentId: $documentId})
        DETACH DELETE e
        RETURN count(e) as count
      `, { documentId });

      const deletedScenes = sceneResult.records[0]?.get('count')?.toNumber?.() || 0;
      const deletedEpisodes = epResult.records[0]?.get('count')?.toNumber?.() || 0;

      logger.info({ documentId, deletedEpisodes, deletedScenes }, 'Deleted all episodes and scenes');
      return { deletedEpisodes, deletedScenes };
    } catch (error) {
      logger.error({ error, documentId }, 'Failed to delete all episodes');
      throw error;
    } finally {
      await session.close();
    }
  }

  // ============================================
  // v12.1: Smart Chunk CRUD (시맨틱 리청킹)
  // ============================================

  /**
   * 문서의 모든 Chunk 노드 삭제 (관계 포함)
   * Document 노드는 유지
   */
  async deleteChunks(documentId: string): Promise<{ deletedChunks: number }> {
    const session = this.driver.session({ database: this.database });

    try {
      const result = await session.run(`
        MATCH (c:Chunk {fileName: $documentId})
        DETACH DELETE c
        RETURN count(c) as count
      `, { documentId });

      const deletedChunks = result.records[0]?.get('count')?.toNumber?.() || 0;

      // Document 노드의 chunkNodeCount 리셋
      await session.run(`
        MATCH (d:Document {fileName: $documentId})
        SET d.chunkNodeCount = 0, d.total_chunks = 0
      `, { documentId });

      logger.info({ documentId, deletedChunks }, 'Deleted all chunks for document');
      return { deletedChunks };
    } catch (error) {
      logger.error({ error, documentId }, 'Failed to delete chunks');
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * 스마트 청크 생성 (AI 시맨틱 청킹 결과를 Neo4j에 저장)
   * 기존 Chunk 노드를 삭제한 후 호출
   */
  async createSmartChunks(documentId: string, chapters: Array<{
    title: string;
    summary: string;
    text: string;
    keywords: string[];
    chunkType?: 'chapter' | 'section' | 'concept';
  }>): Promise<{ createdChunks: number }> {
    const session = this.driver.session({ database: this.database });

    try {
      const tx = session.beginTransaction();

      try {
        let createdCount = 0;

        for (let i = 0; i < chapters.length; i++) {
          const ch = chapters[i];
          const chunkId = `smart_chunk_${Date.now()}_${i}`;

          await tx.run(`
            MATCH (d:Document {fileName: $documentId})
            CREATE (c:Chunk {
              id: $chunkId,
              fileName: $documentId,
              text: $text,
              position: $position,
              length: $length,
              sectionTitle: $sectionTitle,
              summary: $summary,
              keywords: $keywords,
              chunkType: $chunkType,
              content_offset: $contentOffset
            })
            CREATE (c)-[:PART_OF]->(d)
          `, {
            documentId,
            chunkId,
            text: ch.text,
            position: neo4j.int(i),
            length: neo4j.int(ch.text.length),
            sectionTitle: ch.title,
            summary: ch.summary,
            keywords: ch.keywords,
            chunkType: ch.chunkType || 'chapter',
            contentOffset: neo4j.int(0),
          });

          createdCount++;
        }

        // Document 노드의 chunkNodeCount 업데이트
        await tx.run(`
          MATCH (d:Document {fileName: $documentId})
          SET d.chunkNodeCount = $count, d.total_chunks = $count
        `, { documentId, count: neo4j.int(createdCount) });

        await tx.commit();

        logger.info({ documentId, createdChunks: createdCount }, 'Smart chunks created');
        return { createdChunks: createdCount };
      } catch (txError) {
        await tx.rollback();
        throw txError;
      }
    } catch (error) {
      logger.error({ error, documentId }, 'Failed to create smart chunks');
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * 원자적 청크 교체: 기존 삭제 + 새 청크 생성을 단일 트랜잭션으로
   */
  async replaceChunksAtomic(documentId: string, chapters: Array<{
    title: string;
    summary: string;
    text: string;
    keywords: string[];
    chunkType?: 'chapter' | 'section' | 'concept';
  }>): Promise<{ deletedChunks: number; createdChunks: number }> {
    const session = this.driver.session({ database: this.database });

    try {
      const tx = session.beginTransaction();

      try {
        // 1. 기존 청크 개수 먼저 조회 후 삭제
        const countResult = await tx.run(`
          MATCH (c:Chunk {fileName: $documentId})
          RETURN count(c) as cnt
        `, { documentId });
        const deletedChunks = countResult.records[0]?.get('cnt')?.toNumber?.() || 0;

        await tx.run(`
          MATCH (c:Chunk {fileName: $documentId})
          DETACH DELETE c
        `, { documentId });

        // 2. 새 청크 생성
        let createdCount = 0;
        for (let i = 0; i < chapters.length; i++) {
          const ch = chapters[i];
          const chunkId = `smart_chunk_${Date.now()}_${i}`;

          await tx.run(`
            MATCH (d:Document {fileName: $documentId})
            CREATE (c:Chunk {
              id: $chunkId,
              fileName: $documentId,
              text: $text,
              position: $position,
              length: $length,
              sectionTitle: $sectionTitle,
              summary: $summary,
              keywords: $keywords,
              chunkType: $chunkType,
              content_offset: $contentOffset
            })
            CREATE (c)-[:PART_OF]->(d)
          `, {
            documentId,
            chunkId,
            text: ch.text,
            position: neo4j.int(i),
            length: neo4j.int(ch.text.length),
            sectionTitle: ch.title,
            summary: ch.summary,
            keywords: ch.keywords,
            chunkType: ch.chunkType || 'chapter',
            contentOffset: neo4j.int(0),
          });

          createdCount++;
        }

        // 3. Document 노드 카운트 업데이트
        await tx.run(`
          MATCH (d:Document {fileName: $documentId})
          SET d.chunkNodeCount = $count, d.total_chunks = $count
        `, { documentId, count: neo4j.int(createdCount) });

        await tx.commit();

        logger.info({ documentId, deletedChunks, createdChunks: createdCount }, 'Chunks replaced atomically');
        return { deletedChunks, createdChunks: createdCount };
      } catch (txError) {
        await tx.rollback();
        throw txError;
      }
    } catch (error) {
      logger.error({ error, documentId }, 'Failed to replace chunks atomically');
      throw error;
    } finally {
      await session.close();
    }
  }

  // ============================================
  // Helper 메서드
  // ============================================

  private recordToEpisode(props: any): Episode {
    return {
      id: props.id,
      documentId: props.documentId,
      episodeNumber: props.episodeNumber?.toNumber?.() || props.episodeNumber || 0,
      title: props.title || '',
      hook: props.hook || '',
      cta: props.cta || '',
      ctaAction: props.ctaAction || 'next_episode',
      durationSec: props.durationSec?.toNumber?.() || props.durationSec || 0,
      sceneCount: props.sceneCount?.toNumber?.() || props.sceneCount || 0,
      keywords: props.keywords || [],
      hashtags: props.hashtags || [],
      status: props.status || 'draft',
      createdAt: props.createdAt ? new Date() : undefined,
      updatedAt: props.updatedAt ? new Date() : undefined,
      previousEpisodeId: props.previousEpisodeId || undefined,
      nextEpisodeId: props.nextEpisodeId || undefined,
      masterImagePath: props.masterImagePath || undefined,
      videoPath: props.videoPath || undefined,
      youtubeId: props.youtubeId || undefined
    };
  }

  private recordToScene(props: any): Scene {
    return {
      id: props.id,
      episodeId: props.episodeId,
      sceneNumber: props.sceneNumber?.toNumber?.() || props.sceneNumber || 0,
      type: props.type || 'explanation',
      narration: props.narration || '',
      onScreenText: props.onScreenText || undefined,
      durationSec: props.durationSec?.toNumber?.() || props.durationSec || 7,
      visualType: props.visualType || 'animation',
      visualDesc: props.visualDesc || '',
      camera: props.camera || 'static',
      transition: props.transition || 'cut',
      sourceChunkIds: props.sourceChunkIds || [],
      mentionedEntities: props.mentionedEntities || [],
      imagePath: props.imagePath || undefined,
      audioPath: props.audioPath || undefined,
      clipPath: props.clipPath || undefined,
      assignedFormula: props.assignedFormula || undefined,
      formulaName: props.formulaName || undefined,
      formulaMetaphor: props.formulaMetaphor || undefined,
      firstFramePrompt: props.firstFramePrompt || undefined,
      lastFramePrompt: props.lastFramePrompt || undefined,
    };
  }
}

// 기본 설정으로 인스턴스 생성 헬퍼
export function createNeo4jService(): Neo4jService {
  return new Neo4jService({
    uri: process.env.NEO4J_URI || 'bolt://34.47.112.49:7687',
    username: process.env.NEO4J_USERNAME || 'neo4j',
    password: process.env.NEO4J_PASSWORD || 'ytbbooks2026',
    database: process.env.NEO4J_DATABASE || 'neo4j'
  });
}
