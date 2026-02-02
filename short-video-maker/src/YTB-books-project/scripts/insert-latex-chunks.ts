/**
 * AR_TALK.md (marker-pdf 출력) 파싱 후 Neo4j 삽입
 *
 * 목적: LaTeX 수식이 포함된 청크를 Neo4j에 삽입하여
 *       MathFormulaService가 수식을 감지하고 렌더링할 수 있도록 함
 */

import neo4j, { Driver, Session } from 'neo4j-driver';
import * as fs from 'fs-extra';
import * as path from 'path';

// Neo4j 연결 정보
const NEO4J_URI = 'bolt://34.47.112.49:7687';
const NEO4J_USER = 'neo4j';
const NEO4J_PASSWORD = 'ytbbooks2026';

// 문서 정보
const DOCUMENT_ID = 'AR_TALK_LATEX.pdf';  // 기존 AR_TALK.pdf와 구분
const BOOK_TITLE = 'ARTalk: Speech-Driven 3D Head Animation (LaTeX Enhanced)';

interface Chunk {
  id: string;
  text: string;
  sectionTitle: string;
  position: number;
  hasLatex: boolean;
  latexFormulas: string[];
}

/**
 * 마크다운에서 LaTeX 수식 추출
 */
function extractLatexFormulas(text: string): string[] {
  const formulas: string[] = [];

  // $$...$$ 블록 수식
  const blockRegex = /\$\$([^$]+)\$\$/g;
  let match;
  while ((match = blockRegex.exec(text)) !== null) {
    formulas.push(match[1].trim());
  }

  // $...$ 인라인 수식 (단, $$는 제외)
  const inlineRegex = /(?<!\$)\$(?!\$)([^$]+)\$(?!\$)/g;
  while ((match = inlineRegex.exec(text)) !== null) {
    formulas.push(match[1].trim());
  }

  return formulas;
}

/**
 * 마크다운을 섹션별로 청크 분리
 */
function parseMarkdownToChunks(markdown: string): Chunk[] {
  const chunks: Chunk[] = [];

  // # 또는 ## 또는 ### 헤딩으로 분리
  const sections = markdown.split(/(?=^#{1,3}\s)/m);

  let position = 0;
  for (const section of sections) {
    if (!section.trim()) continue;

    // 섹션 제목 추출
    const titleMatch = section.match(/^(#{1,3})\s+(.+)/);
    const sectionTitle = titleMatch ? titleMatch[2].trim() : 'Introduction';

    // 섹션 텍스트 (제목 포함)
    const text = section.trim();

    // 너무 짧은 섹션은 스킵
    if (text.length < 100) continue;

    // LaTeX 수식 추출
    const latexFormulas = extractLatexFormulas(text);

    const chunk: Chunk = {
      id: `chunk_${DOCUMENT_ID}_${position}`,
      text,
      sectionTitle,
      position,
      hasLatex: latexFormulas.length > 0,
      latexFormulas
    };

    chunks.push(chunk);
    position++;
  }

  return chunks;
}

/**
 * Neo4j에 Document 및 Chunks 삽입
 */
async function insertToNeo4j(chunks: Chunk[]): Promise<void> {
  const driver: Driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
  );

  const session: Session = driver.session();

  try {
    console.log(`📚 Neo4j 연결 성공`);

    // 1. 기존 문서 삭제 (있으면)
    console.log(`🗑️ 기존 ${DOCUMENT_ID} 문서 삭제...`);
    await session.run(`
      MATCH (d:Document {fileName: $fileName})
      OPTIONAL MATCH (d)<-[:PART_OF]-(c:Chunk)
      DETACH DELETE c, d
    `, { fileName: DOCUMENT_ID });

    // 2. Document 노드 생성
    console.log(`📄 Document 노드 생성: ${DOCUMENT_ID}`);
    await session.run(`
      CREATE (d:Document {
        fileName: $fileName,
        title: $title,
        status: 'Completed',
        total_chunks: $totalChunks,
        shortsStatus: 'unprocessed',
        createdAt: datetime(),
        hasLatex: true,
        source: 'marker-pdf'
      })
      RETURN d
    `, {
      fileName: DOCUMENT_ID,
      title: BOOK_TITLE,
      totalChunks: chunks.length
    });

    // 3. Chunk 노드 생성
    console.log(`📝 ${chunks.length}개 청크 삽입 중...`);

    let chunksWithLatex = 0;
    let totalFormulas = 0;

    for (const chunk of chunks) {
      await session.run(`
        MATCH (d:Document {fileName: $fileName})
        CREATE (c:Chunk {
          id: $chunkId,
          text: $text,
          sectionTitle: $sectionTitle,
          position: $position,
          hasLatex: $hasLatex,
          latexFormulas: $latexFormulas,
          fileName: $fileName,
          createdAt: datetime()
        })
        CREATE (c)-[:PART_OF]->(d)
        RETURN c
      `, {
        fileName: DOCUMENT_ID,
        chunkId: chunk.id,
        text: chunk.text,
        sectionTitle: chunk.sectionTitle,
        position: chunk.position,
        hasLatex: chunk.hasLatex,
        latexFormulas: chunk.latexFormulas
      });

      if (chunk.hasLatex) {
        chunksWithLatex++;
        totalFormulas += chunk.latexFormulas.length;
      }

      console.log(`  ✅ ${chunk.id}: "${chunk.sectionTitle.substring(0, 40)}..." (LaTeX: ${chunk.latexFormulas.length}개)`);
    }

    // 4. NEXT_CHUNK 관계 생성
    console.log(`🔗 NEXT_CHUNK 관계 생성...`);
    await session.run(`
      MATCH (d:Document {fileName: $fileName})<-[:PART_OF]-(c:Chunk)
      WITH c ORDER BY c.position
      WITH collect(c) as chunks
      UNWIND range(0, size(chunks)-2) as i
      WITH chunks[i] as c1, chunks[i+1] as c2
      CREATE (c1)-[:NEXT_CHUNK]->(c2)
    `, { fileName: DOCUMENT_ID });

    // 5. FIRST_CHUNK 관계 생성
    await session.run(`
      MATCH (d:Document {fileName: $fileName})
      MATCH (c:Chunk {fileName: $fileName, position: 0})
      CREATE (d)-[:FIRST_CHUNK]->(c)
    `, { fileName: DOCUMENT_ID });

    console.log(`\n📊 삽입 완료 통계:`);
    console.log(`   - 총 청크: ${chunks.length}개`);
    console.log(`   - LaTeX 포함 청크: ${chunksWithLatex}개`);
    console.log(`   - 총 수식: ${totalFormulas}개`);

  } finally {
    await session.close();
    await driver.close();
  }
}

/**
 * 메인 실행
 */
async function main(): Promise<void> {
  console.log('🚀 AR_TALK LaTeX 청크 삽입 시작\n');

  // 1. 마크다운 파일 읽기
  const mdPath = path.join(__dirname, '../../../../NEB/marker_output/AR_TALK.md');

  if (!await fs.pathExists(mdPath)) {
    console.error(`❌ 파일을 찾을 수 없음: ${mdPath}`);
    process.exit(1);
  }

  const markdown = await fs.readFile(mdPath, 'utf-8');
  console.log(`📖 마크다운 파일 로드: ${markdown.length} 글자\n`);

  // 2. 청크 파싱
  const chunks = parseMarkdownToChunks(markdown);
  console.log(`📦 파싱 완료: ${chunks.length}개 청크\n`);

  // 수식 포함 청크 미리보기
  const latexChunks = chunks.filter(c => c.hasLatex);
  console.log(`📐 LaTeX 포함 청크 미리보기:`);
  for (const c of latexChunks.slice(0, 5)) {
    console.log(`   - ${c.sectionTitle}: ${c.latexFormulas.length}개 수식`);
    if (c.latexFormulas.length > 0) {
      console.log(`     예: ${c.latexFormulas[0].substring(0, 60)}...`);
    }
  }
  console.log('');

  // 3. Neo4j 삽입
  await insertToNeo4j(chunks);

  console.log('\n✅ 완료! 이제 /api/books/AR_TALK_LATEX.pdf/curriculum 호출 가능');
}

main().catch(console.error);
