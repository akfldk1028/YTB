/**
 * Neo4j 스키마 확인 스크립트
 */

import { createNeo4jService } from '../src/services/Neo4jService';

async function main() {
  const neo4j = createNeo4jService();

  try {
    // 1. 모든 노드 레이블 확인
    console.log('📋 노드 레이블:');
    const labels = await neo4j.runQuery('CALL db.labels() YIELD label RETURN label');
    labels.forEach(r => console.log(`   - ${r.get('label')}`));

    // 2. 각 레이블별 노드 수
    console.log('\n📊 레이블별 노드 수:');
    for (const r of labels) {
      const label = r.get('label');
      const countResult = await neo4j.runQuery(`MATCH (n:\`${label}\`) RETURN count(n) as count`);
      console.log(`   ${label}: ${countResult[0]?.get('count')?.toNumber?.() || 0}`);
    }

    // 3. 관계 타입 확인
    console.log('\n🔗 관계 타입:');
    const relTypes = await neo4j.runQuery('CALL db.relationshipTypes() YIELD relationshipType RETURN relationshipType');
    relTypes.forEach(r => console.log(`   - ${r.get('relationshipType')}`));

    // 4. 샘플 노드 확인 (Document)
    console.log('\n📄 Document 노드 샘플:');
    const docs = await neo4j.runQuery('MATCH (d:Document) RETURN d LIMIT 2');
    docs.forEach((r, i) => {
      const node = r.get('d');
      console.log(`   [${i + 1}] Properties:`, node.properties);
    });

    // 5. Chunk 노드 확인
    console.log('\n📄 Chunk 노드 샘플:');
    const chunks = await neo4j.runQuery('MATCH (c:Chunk) RETURN c LIMIT 2');
    if (chunks.length === 0) {
      // __Chunk__ 레이블 시도
      const chunks2 = await neo4j.runQuery('MATCH (c:__Chunk__) RETURN c LIMIT 2');
      chunks2.forEach((r, i) => {
        const node = r.get('c');
        console.log(`   [${i + 1}] (label: __Chunk__) Properties:`, Object.keys(node.properties));
      });
    } else {
      chunks.forEach((r, i) => {
        const node = r.get('c');
        console.log(`   [${i + 1}] Properties:`, Object.keys(node.properties));
      });
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await neo4j.close();
  }
}

main();
