# fastcampus-ontology

양조장 제조 도메인을 예제로, Postgres 위에 **온톨로지**를 직접 구현하는 FastCampus 실습 프로젝트입니다.

온톨로지는 "어떤 객체 타입이 있고, 각 타입에 어떤 속성·링크·액션이 있는지"를 **메타데이터 테이블**에 기록합니다. API는 이 메타데이터를 읽어 실제 데이터(인스턴스 테이블)에 대한 쿼리를 동적으로 구성하므로, 타입별 라우트를 따로 작성하지 않아도 모든 객체 타입을 같은 방식으로 조회하고 조작할 수 있습니다.

## 기술 스택

| 영역 | 사용 기술 |
|---|---|
| 런타임 | Node.js 24+ (`.ts` 네이티브 실행), pnpm 워크스페이스 |
| 데이터베이스 | Neon Postgres |
| API | Hono, Kysely(쿼리 빌더), node-postgres, @cfworker/json-schema |
| 웹 UI | Vite, React 18, Blueprint 6 (core · icons · datetime) |

## 프로젝트 구조

```
fastcampus-ontology/
├── apps/
│   ├── ontology/                     # 온톨로지 API (포트 3000)
│   │   └── src/
│   │       ├── index.ts              # 서버 진입점, 라우트 마운트, 에러 처리
│   │       ├── config.ts             # DATABASE_URL 로딩
│   │       ├── db.ts                 # Kysely Database 인터페이스와 커넥션
│   │       ├── ontology/             # 메타데이터 로더, 동적 쿼리, 스키마 allowlist
│   │       ├── routes/               # meta · objects · actions 라우트
│   │       └── actions/              # 액션 핸들러 타입, 레지스트리, 구현
│   │           └── manufacturing/
│   │               └── batchDeferStart.ts
│   └── data-platform/                # 웹 UI (포트 5173)
│       └── src/
│           ├── App.tsx               # 앱 셸과 앱 전환 사이드바
│           ├── api.ts                # API 클라이언트와 응답 타입
│           ├── views/                # OntologyManager · ObjectExplorer
│           ├── components/           # 카드, 테이블, 액션 다이얼로그, 검색바 등
│           ├── actionForm.ts         # parameter_schema → 폼 필드 / 요청 본문
│           ├── search.ts             # 메타데이터 기반 인스턴스 검색
│           └── format.ts             # 값 표시 형식 (표 셀과 검색이 공유)
├── sql/
│   └── 001_manufacturing.sql         # 스키마 생성 + 메타데이터 + 시드 데이터
├── run-sql.ts                        # .sql 파일을 DATABASE_URL에 실행하는 CLI
├── tsconfig.base.json                # 공통 TypeScript 설정
├── pnpm-workspace.yaml
└── .env.example
```

## 데이터 모델

`manufacturing` 스키마 하나에 두 종류의 테이블이 있습니다.

**인스턴스 테이블**: 실제 데이터입니다. 기본 키는 `T-12`, `B-2105`, `REC-LAGER-V3` 같은 도메인 ID(text)입니다.

| 오브젝트 타입 (api_name) | 테이블 | 내용 |
|---|---|---|
| `tank` | `tank` | 발효·숙성 탱크 |
| `line` | `line` | 병입 라인 |
| `batch` | `batch` | 생산 중인 맥주 한 배치 |
| `bottlingRun` | `bottling_run` | 병입 작업 (시드 데이터 없음) |
| `maintenanceLog` | `maintenance_log` | 탱크·라인 정비 기록 |
| `operator` | `operator` | 작업자 |
| `recipe` | `recipe` | 레시피와 목표 당도 곡선 |
| `qualityTest` | `quality_test` | 배치 품질 검사 결과 |

**메타데이터 테이블**: 위 타입들을 설명합니다. 모든 행은 세 가지 식별자를 가집니다.
- **`id`**: 생성된 UUID로, 외래 키가 가리키는 대상입니다.
- **`api_name`**: 코드와 URL이 쓰는 안정적인 이름입니다. 대소문자를 구분합니다.
- **`name`**: 화면에 보이는 표시명으로, 자유롭게 수정할 수 있습니다.

| 테이블 | 역할 |
|---|---|
| `object_type` | 타입 정의와 데이터가 있는 위치 (`schema`, `datasource_table`) |
| `property` | 속성과 대응 컬럼 (`datasource_column`), 데이터 타입, title·PK 여부 |
| `link` | 타입 간 관계. FK 속성(`via_property_id`), `cardinality`, 역방향 이름 |
| `action_type` | 액션 정의와 파라미터 JSON Schema (`parameter_schema`) |
| `audit_log` | 액션 실행 기록. 메타데이터 UUID와 api_name 스냅샷을 함께 저장 |

## 시작하기

```bash
pnpm install

# DATABASE_URL을 Neon 연결 문자열로 바꿔 넣습니다
cp .env.example .env

# 스키마·메타데이터·시드 데이터를 적용합니다
pnpm run-sql sql/001_manufacturing.sql

# 터미널 두 개에서 각각 실행합니다. UI가 /api를 3000번으로 프록시하므로 API를 먼저 띄웁니다.
pnpm --filter @fastcampus/ontology dev          # http://localhost:3000
pnpm --filter @fastcampus/data-platform dev     # http://localhost:5173
```

## API

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/health` | 서버와 DB 연결 상태 |
| GET | `/api/objects/meta/types` | 오브젝트 타입 목록과 인스턴스 수 |
| GET | `/api/objects/meta/types/:type` | 한 타입의 메타데이터 묶음 (속성, 링크, 액션) |
| PATCH | `/api/objects/meta/types/:type` | 표시명(`name`)과 설명(`description`) 수정 |
| GET | `/api/objects/:type` | 인스턴스 목록. 쿼리 파라미터는 속성 필터 (`?status=queued`) |
| GET | `/api/objects/:type/:id` | 인스턴스 하나와 양방향 1단계 링크 |
| POST | `/api/objects/:type/:id/actions/:actionName` | 액션 실행 |

```bash
curl localhost:3000/api/objects/batch/B-2105

curl -X POST localhost:3000/api/objects/batch/B-2130/actions/deferStart \
  -H 'content-type: application/json' \
  -H 'x-actor: park.kyungwon' \
  -d '{"newPlannedStart": "2027-01-15T08:00:00+09:00"}'
```

- **쿼리 구성:** URL의 타입 이름과 필터 키는 SQL 식별자로 쓰이지 않습니다. 메타데이터 행을 찾는 데만 쓰이고, 실제 테이블·컬럼명은 그 행에서 가져와 allowlist 검사를 거친 뒤 사용합니다. 값은 모두 바인딩 파라미터로 전달됩니다.
- **액션 처리:** 요청 본문은 먼저 해당 액션의 `parameter_schema`로 검증됩니다. 그다음 레지스트리에서 `"{타입}.{액션}"` 키(예: `batch.deferStart`)로 핸들러를 찾아 실행합니다.

## 웹 UI

왼쪽 사이드바에서 두 앱을 오갈 수 있습니다.

**Ontology Manager**
- **타입 목록:** 레일에 오브젝트 타입과 인스턴스 수가 표시됩니다.
- **메타데이터 보기:** 선택한 타입의 속성, 액션, 링크를 보여줍니다.
- **인라인 편집:** 표시명과 설명을 바로 수정할 수 있습니다.

**Object Explorer**
- **인스턴스 목록:** 타입을 고르면 목록이 나오고, 검색창으로 실시간 필터링합니다. "Search all types"를 켜면 모든 타입에서 검색한 결과를 타입별로 묶어 보여줍니다.
- **상세 화면:** 속성과 연결된 객체를 보여주고, 링크를 따라 이동한 뒤 Back으로 돌아올 수 있습니다.
- **액션 실행:** 상단의 액션 버튼을 누르면 `parameter_schema`로 만든 폼 다이얼로그가 열리고, 실행 후 결과를 보여주며 화면을 새로고침합니다.

## 스크립트

| 명령 | 설명 |
|---|---|
| `pnpm run-sql <file.sql>` | SQL 파일을 실행하고 문장별 결과 출력 |
| `pnpm typecheck` | 모든 워크스페이스 타입체크 |
| `pnpm ontology` | API 실행 (watch 없음) |
| `pnpm --filter @fastcampus/ontology dev` | API를 watch 모드로 실행 |
| `pnpm --filter @fastcampus/data-platform dev` | UI 개발 서버 실행 |
| `pnpm --filter @fastcampus/data-platform build` | UI 프로덕션 빌드 |

## 개발 규칙

- **패키지 추가:** `pnpm add`를 사용합니다. `package.json`에 직접 적어 넣지 않습니다.
- **TypeScript 실행:** Node 24가 `.ts`를 직접 실행하므로 `tsx`를 쓰지 않습니다. 상대 경로 import에는 `.ts` 확장자를 붙입니다.
- **스키마 변경:** Kysely는 런타임 쿼리 빌더로만 씁니다. 스키마 변경은 SQL 파일로 작성해 `pnpm run-sql`로 적용합니다.
- **기본 키:** 인스턴스 테이블의 기본 키는 도메인 ID를 담는 text입니다. UUID나 serial은 쓰지 않습니다.

## 알아둘 점

- **SQL 재실행:** `sql/001_manufacturing.sql`은 `manufacturing` 스키마를 지우고 다시 만들기 때문에, 실행하면 데이터가 시드 상태로 초기화됩니다.
- **인증:** 아직 인증이 없습니다. 액션 실행자는 `x-actor` 헤더에서 읽고, 헤더가 없으면 `anonymous`로 기록합니다.
- **URL 대소문자:** api_name은 대소문자를 구분합니다. `/api/objects/batch`는 동작하지만 `/api/objects/Batch`는 404입니다.
