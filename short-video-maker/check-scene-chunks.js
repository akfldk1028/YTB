"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const neo4j_driver_1 = __importDefault(require("neo4j-driver"));
const driver = neo4j_driver_1.default.driver('bolt://34.47.112.49:7687', neo4j_driver_1.default.auth.basic('neo4j', 'ytbbooks2026'));
const session = driver.session();
async function check() {
    // 최근 생성된 Episode의 Scene 확인
    const result = await session.run(`
    MATCH (e:Episode)-[:HAS_SCENE]->(s:Scene)
    WHERE e.documentId = 'AR_TALK_LATEX.pdf' AND e.episodeNumber = 3
    RETURN s.id, s.sourceChunkIds, s.narration
    LIMIT 3
  `);
    console.log('Episode 3 Scenes:');
    for (const record of result.records) {
        console.log('  Scene:', record.get('s.id'));
        console.log('    sourceChunkIds:', record.get('s.sourceChunkIds'));
        console.log('    narration:', (record.get('s.narration') || '').substring(0, 80));
        console.log('');
    }
    // LaTeX가 있는 청크 확인
    const latexResult = await session.run(`
    MATCH (c:Chunk {fileName: 'AR_TALK_LATEX.pdf'})
    WHERE c.latexFormulas IS NOT NULL AND size(c.latexFormulas) > 0
    RETURN c.id, c.sectionTitle, size(c.latexFormulas) as formulaCount
    LIMIT 5
  `);
    console.log('LaTeX Chunks:');
    for (const record of latexResult.records) {
        console.log('  Chunk:', record.get('c.id'));
        console.log('    sectionTitle:', record.get('c.sectionTitle'));
        console.log('    formulaCount:', record.get('formulaCount')?.toInt());
        console.log('');
    }
    await session.close();
    await driver.close();
}
check().catch(console.error);
