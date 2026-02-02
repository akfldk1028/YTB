"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const neo4j_driver_1 = __importDefault(require("neo4j-driver"));
const driver = neo4j_driver_1.default.driver('bolt://34.47.112.49:7687', neo4j_driver_1.default.auth.basic('neo4j', 'ytbbooks2026'));
const session = driver.session();
async function approve() {
    // Episode 5를 approved로 변경
    const result = await session.run(`
    MATCH (e:Episode {id: 'ep_1769332653474_uy7qma'})
    SET e.status = 'approved'
    RETURN e.episodeNumber, e.title, e.status
  `);
    for (const record of result.records) {
        console.log('Episode updated:');
        console.log('  Number:', record.get('e.episodeNumber')?.toInt());
        console.log('  Title:', record.get('e.title'));
        console.log('  Status:', record.get('e.status'));
    }
    await session.close();
    await driver.close();
}
approve().catch(console.error);
