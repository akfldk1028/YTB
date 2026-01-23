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

    logger.info({ uri: config.uri, database: this.database }, '🔗 Neo4jService initialized');
  }

  /**
   * 연결 테스트
   */
  async testConnection(): Promise<{ success: boolean; message: string; nodeCount?: number }> {
    const session = this.driver.session({ database: this.database });

    try {
      const result = await session.run('MATCH (n) RETURN count(n) as count');
      const count = result.records[0]?.get('count')?.toNumber() || 0;

      logger.info({ nodeCount: count }, '✅ Neo4j connection successful');

      return {
        success: true,
        message: `Connected to Neo4j. Total nodes: ${count}`,
        nodeCount: count
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ error: errorMsg }, '❌ Neo4j connection failed');

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

      logger.info({ count: books.length }, '📚 Books retrieved from Neo4j');
      return books;
    } catch (error) {
      logger.error({ error }, '❌ Failed to get books');
      throw error;
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
               c.content_offset as contentOffset
        ORDER BY c.position ASC
        ${limit ? `LIMIT ${limit}` : ''}
      `;

      const result = await session.run(query, { bookId });

      const chunks: BookChunk[] = result.records.map((record: Neo4jRecord, index: number) => ({
        id: record.get('id') || `chunk_${index}`,
        bookId,
        chunkIndex: record.get('position')?.toNumber?.() || index,
        text: record.get('text') || '',
        summary: undefined
      }));

      logger.info({ bookId, count: chunks.length }, '📄 Chunks retrieved');
      return chunks;
    } catch (error) {
      logger.error({ error, bookId }, '❌ Failed to get chunks');
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
      logger.error({ error, chunkId }, '❌ Failed to get chunk entities');
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
      logger.warn({ error }, '⚠️ Full-text search not available, using fallback');
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
      logger.error({ error }, '❌ Failed to get graph stats');
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

      logger.info({ count: books.length }, '📋 Unprocessed documents retrieved');
      return books;
    } catch (error) {
      logger.error({ error }, '❌ Failed to get unprocessed documents');
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
        logger.warn({ fileName }, '⚠️ Document not found for status update');
        return false;
      }

      logger.info({ fileName, status }, '✅ Document shorts status updated');
      return true;
    } catch (error) {
      logger.error({ error, fileName }, '❌ Failed to update document status');
      throw error;
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

      logger.info({ fileName, planId }, '✅ Shorts plan saved to Neo4j');
      return planId;
    } catch (error) {
      logger.error({ error, fileName }, '❌ Failed to save plan');
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
      logger.error({ error, fileName }, '❌ Failed to get plan');
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
    logger.info('🔌 Neo4j connection closed');
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
        previousEpisodeId: input.previousEpisodeId || ''
      });

      if (result.records.length === 0) {
        throw new Error(`Document not found: ${input.documentId}`);
      }

      const record = result.records[0].get('e').properties;
      logger.info({ episodeId, documentId: input.documentId, episodeNumber: input.episodeNumber },
        '✅ Episode created');

      return this.recordToEpisode(record);
    } catch (error) {
      logger.error({ error, input }, '❌ Failed to create episode');
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
          mentionedEntities: $mentionedEntities
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
        mentionedEntities: input.mentionedEntities || []
      });

      if (result.records.length === 0) {
        throw new Error(`Episode not found: ${input.episodeId}`);
      }

      const record = result.records[0].get('s').properties;
      logger.info({ sceneId, episodeId: input.episodeId, sceneNumber: input.sceneNumber },
        '✅ Scene created');

      return this.recordToScene(record);
    } catch (error) {
      logger.error({ error, input }, '❌ Failed to create scene');
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
      logger.error({ error, episodeId }, '❌ Failed to get episode');
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
      logger.error({ error, episodeId }, '❌ Failed to get episode with scenes');
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
      logger.error({ error, documentId }, '❌ Failed to get document episodes');
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
      logger.error({ error, documentId }, '❌ Failed to get last episode number');
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
      logger.error({ error, documentId }, '❌ Failed to get document series');
      return null;
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
        logger.warn({ episodeId }, '⚠️ Episode not found for status update');
        return false;
      }

      logger.info({ episodeId, status }, '✅ Episode status updated');
      return true;
    } catch (error) {
      logger.error({ error, episodeId }, '❌ Failed to update episode status');
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
      logger.error({ error, sceneId }, '❌ Failed to update scene assets');
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
      logger.error({ error }, '❌ Failed to get next pending episode');
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
      logger.error({ error }, '❌ Failed to get episode stats');
      return { totalEpisodes: 0, totalScenes: 0, byStatus: {}, byDocument: [] };
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
      clipPath: props.clipPath || undefined
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
