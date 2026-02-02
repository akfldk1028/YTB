import neo4j from 'neo4j-driver';

const driver = neo4j.driver('bolt://34.47.112.49:7687', neo4j.auth.basic('neo4j', 'ytbbooks2026'));
const session = driver.session();

async function find() {
  // LaTeX 청크 ID 목록
  const latexChunkIds = [
    'chunk_AR_TALK_LATEX.pdf_7',
    'chunk_AR_TALK_LATEX.pdf_8',
    'chunk_AR_TALK_LATEX.pdf_9',
    'chunk_AR_TALK_LATEX.pdf_10',
    'chunk_AR_TALK_LATEX.pdf_22'
  ];

  // 이 청크들을 사용하는 에피소드 찾기
  const result = await session.run(`
    MATCH (e:Episode)-[:HAS_SCENE]->(s:Scene)
    WHERE e.documentId = 'AR_TALK_LATEX.pdf'
    UNWIND s.sourceChunkIds as chunkId
    WITH e, s, chunkId
    WHERE chunkId IN $latexChunkIds
    RETURN DISTINCT e.id as episodeId, e.episodeNumber, e.title, e.status,
           collect(DISTINCT chunkId) as latexChunks
    ORDER BY e.episodeNumber
  `, { latexChunkIds });

  console.log('Episodes using LaTeX chunks:');
  for (const record of result.records) {
    const epNum = record.get('e.episodeNumber')?.toInt();
    const status = record.get('e.status');
    const latexChunks = record.get('latexChunks');
    console.log(`  Episode ${epNum}: ${record.get('e.title')?.substring(0, 40)}...`);
    console.log(`    Status: ${status}`);
    console.log(`    LaTeX chunks: ${latexChunks.join(', ')}`);
    console.log(`    ID: ${record.get('episodeId')}`);
    console.log('');
  }

  await session.close();
  await driver.close();
}

find().catch(console.error);
