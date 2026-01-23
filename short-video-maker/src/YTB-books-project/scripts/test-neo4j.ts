/**
 * Neo4j 연결 테스트 스크립트
 *
 * 실행: npx ts-node src/YTB-books-project/scripts/test-neo4j.ts
 */

import { createNeo4jService } from '../src/services/Neo4jService';

async function main() {
  console.log('🔗 Neo4j 연결 테스트 시작...\n');

  const neo4j = createNeo4jService();

  try {
    // 1. 연결 테스트
    console.log('1️⃣ 연결 테스트...');
    const connectionResult = await neo4j.testConnection();
    console.log(`   ${connectionResult.success ? '✅' : '❌'} ${connectionResult.message}`);
    if (!connectionResult.success) {
      return;
    }

    // 2. 그래프 통계
    console.log('\n2️⃣ 그래프 통계...');
    const stats = await neo4j.getGraphStats();
    console.log(`   📊 Documents: ${stats.documents}`);
    console.log(`   📄 Chunks: ${stats.chunks}`);
    console.log(`   🏷️  Entities: ${stats.entities}`);
    console.log(`   🔗 Relationships: ${stats.relationships}`);

    // 3. 책 목록
    console.log('\n3️⃣ 책 목록...');
    const books = await neo4j.getBooks();
    if (books.length === 0) {
      console.log('   ⚠️ 등록된 책이 없습니다. NEB에서 PDF를 업로드하세요.');
    } else {
      books.forEach((book, i) => {
        console.log(`   📚 [${i + 1}] ${book.title} (청크: ${book.totalChunks}개)`);
      });
    }

    // 4. 첫 번째 책의 청크 샘플
    if (books.length > 0) {
      console.log(`\n4️⃣ "${books[0].title}" 청크 샘플 (최대 3개)...`);
      const chunks = await neo4j.getChunks(books[0].title, 3);
      chunks.forEach((chunk, i) => {
        const preview = chunk.text.substring(0, 100).replace(/\n/g, ' ');
        console.log(`   [${i + 1}] ${preview}...`);
      });
    }

    console.log('\n✅ 테스트 완료!');

  } catch (error) {
    console.error('\n❌ 테스트 실패:', error);
  } finally {
    await neo4j.close();
  }
}

main();
