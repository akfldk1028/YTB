"""
Quick Neo4j connection test
YTB-Books-Project

사용법:
1. .env 파일에 연결 정보 설정
2. python quick_test.py
"""
import os
import sys

# .env 파일 경로 설정
env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
if os.path.exists(env_path):
    from dotenv import load_dotenv
    load_dotenv(env_path)
    print(f"Loaded .env from: {env_path}")
else:
    print(f"Warning: .env not found at {env_path}")
    print("Copy .env.example to .env and fill in your credentials")

# 환경변수 읽기
uri = os.getenv('NEO4J_URI')
username = os.getenv('NEO4J_USERNAME', 'neo4j')
password = os.getenv('NEO4J_PASSWORD')
database = os.getenv('NEO4J_DATABASE', 'neo4j')

if not uri or not password:
    print("\n" + "=" * 50)
    print("ERROR: Neo4j 연결 정보가 설정되지 않았습니다")
    print("=" * 50)
    print("\n1. .env.example을 .env로 복사")
    print("2. Neo4j AuraDB에서 연결 정보 확인")
    print("3. .env 파일에 정보 입력")
    print("\nAuraDB 콘솔: https://console.neo4j.io/")
    sys.exit(1)

print("=" * 50)
print("  YTB-Books-Project Neo4j 연결 테스트")
print("=" * 50)

try:
    from neo4j import GraphDatabase

    print(f"\nConnecting to: {uri}")
    driver = GraphDatabase.driver(uri, auth=(username, password))
    driver.verify_connectivity()
    print("SUCCESS: Connected to Neo4j!")

    with driver.session(database=database) as session:
        result = session.run("MATCH (n) RETURN count(n) as cnt")
        count = result.single()["cnt"]
        print(f"\nNode count: {count}")

        # 레이블별 노드 수
        result = session.run("""
            MATCH (n)
            RETURN labels(n)[0] AS label, count(n) AS cnt
            ORDER BY cnt DESC
            LIMIT 10
        """)
        records = list(result)
        if records:
            print("\nLabels:")
            for r in records:
                print(f"  {r['label']}: {r['cnt']}")
        else:
            print("\n(No nodes yet - empty database)")

        # 제약조건 확인
        result = session.run("SHOW CONSTRAINTS")
        constraints = list(result)
        print(f"\nConstraints: {len(constraints)}")
        for c in constraints[:5]:
            print(f"  - {c['name']}")

    driver.close()
    print("\n" + "=" * 50)
    print("  Connection test PASSED!")
    print("=" * 50)

except ImportError:
    print("\nERROR: neo4j package not installed")
    print("Run: pip install neo4j python-dotenv")

except Exception as e:
    print(f"\nFAILED: {e}")

    if "Cannot resolve address" in str(e):
        print("\n가능한 원인:")
        print("1. AuraDB 인스턴스가 일시중지됨 (3일 미사용)")
        print("2. 인스턴스가 삭제됨 (30일 미사용)")
        print("3. URI가 잘못됨")
        print("\n해결: https://console.neo4j.io/ 에서 인스턴스 상태 확인")

    elif "authentication" in str(e).lower():
        print("\n가능한 원인:")
        print("1. 비밀번호가 잘못됨")
        print("2. 사용자 이름이 잘못됨")
        print("\n해결: AuraDB 콘솔에서 비밀번호 재설정")
