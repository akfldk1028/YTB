"""
Neo4j 연결 테스트 스크립트
YTB-Books-Project

사용법:
1. .env 파일에 Neo4j 연결 정보 설정
2. python test_neo4j_connection.py
"""

import os
import sys
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def test_connection():
    """Neo4j 연결 테스트"""

    # 환경변수 읽기
    uri = os.getenv('NEO4J_URI')
    username = os.getenv('NEO4J_USERNAME', 'neo4j')
    password = os.getenv('NEO4J_PASSWORD')
    database = os.getenv('NEO4J_DATABASE', 'neo4j')

    if not uri or not password:
        print("❌ 환경변수가 설정되지 않았습니다.")
        print("\n.env 파일에 다음 설정이 필요합니다:")
        print("  NEO4J_URI=neo4j+s://xxxxx.databases.neo4j.io")
        print("  NEO4J_USERNAME=neo4j")
        print("  NEO4J_PASSWORD=your-password")
        print("  NEO4J_DATABASE=neo4j")
        return False

    print(f"🔗 연결 시도: {uri}")
    print(f"   Database: {database}")

    try:
        from neo4j import GraphDatabase

        driver = GraphDatabase.driver(uri, auth=(username, password))

        # 연결 확인
        driver.verify_connectivity()
        print("✅ Neo4j 연결 성공!")

        # 간단한 쿼리 테스트
        with driver.session(database=database) as session:
            result = session.run("RETURN 1 AS test")
            record = result.single()
            print(f"✅ 쿼리 테스트 성공: {record['test']}")

            # 노드 수 확인
            result = session.run("MATCH (n) RETURN count(n) AS count")
            count = result.single()['count']
            print(f"📊 현재 노드 수: {count}")

            # 레이블별 노드 수
            result = session.run("""
                MATCH (n)
                RETURN labels(n)[0] AS label, count(n) AS count
                ORDER BY count DESC
                LIMIT 10
            """)
            records = list(result)
            if records:
                print("\n📋 레이블별 노드 수:")
                for r in records:
                    print(f"   {r['label']}: {r['count']}")

        driver.close()
        return True

    except ImportError:
        print("❌ neo4j 패키지가 설치되지 않았습니다.")
        print("   pip install neo4j")
        return False

    except Exception as e:
        print(f"❌ 연결 실패: {e}")
        return False


def test_constraints():
    """v1.4 제약조건 확인"""

    uri = os.getenv('NEO4J_URI')
    username = os.getenv('NEO4J_USERNAME', 'neo4j')
    password = os.getenv('NEO4J_PASSWORD')
    database = os.getenv('NEO4J_DATABASE', 'neo4j')

    if not uri or not password:
        return False

    try:
        from neo4j import GraphDatabase
        driver = GraphDatabase.driver(uri, auth=(username, password))

        with driver.session(database=database) as session:
            print("\n🔍 제약조건 확인:")
            result = session.run("SHOW CONSTRAINTS")
            constraints = list(result)

            if constraints:
                for c in constraints:
                    print(f"   ✓ {c['name']}: {c['type']}")
            else:
                print("   (제약조건 없음)")

            print("\n🔍 인덱스 확인:")
            result = session.run("SHOW INDEXES")
            indexes = list(result)

            if indexes:
                for i in indexes:
                    print(f"   ✓ {i['name']}: {i['type']}")
            else:
                print("   (인덱스 없음)")

        driver.close()
        return True

    except Exception as e:
        print(f"❌ 오류: {e}")
        return False


def create_book_constraint():
    """v1.4 Book 제약조건 생성"""

    uri = os.getenv('NEO4J_URI')
    username = os.getenv('NEO4J_USERNAME', 'neo4j')
    password = os.getenv('NEO4J_PASSWORD')
    database = os.getenv('NEO4J_DATABASE', 'neo4j')

    if not uri or not password:
        return False

    try:
        from neo4j import GraphDatabase
        driver = GraphDatabase.driver(uri, auth=(username, password))

        with driver.session(database=database) as session:
            print("\n📝 Book 제약조건 생성 중...")

            session.run("""
                CREATE CONSTRAINT book_id IF NOT EXISTS
                FOR (b:Book) REQUIRE b.id IS UNIQUE
            """)
            print("   ✅ book_id 제약조건 생성 완료")

        driver.close()
        return True

    except Exception as e:
        print(f"❌ 오류: {e}")
        return False


if __name__ == "__main__":
    print("=" * 50)
    print("  YTB-Books-Project Neo4j 연결 테스트")
    print("=" * 50)
    print()

    if test_connection():
        test_constraints()

        # 사용자에게 Book 제약조건 생성 여부 확인
        print("\n" + "=" * 50)
        response = input("Book 제약조건을 생성하시겠습니까? (y/N): ")
        if response.lower() == 'y':
            create_book_constraint()

    print("\n" + "=" * 50)
    print("  테스트 완료")
    print("=" * 50)
