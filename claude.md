## Conventions

- Use `pnpm add` to install libraries.
Don't add packages by writing them directly into a `package.json`.
- The Neon Postgres connection string lives in `DATABASE_URL` in `.env` at the repository root.
- We use Node 24+, which can natively run `.ts` files without `tsx`, using `node --env-file=.env <file>.ts`.
- Kysely is used as a runtime query builder only, not as a migration or schema management tool. Schema changes go through SQL files applied with `pnpm run-sql`.
- Instance-table primary keys are text, holding domain IDs like `T-12` and `REC-LAGER-V3`. Not UUIDs or serial integers.
- Neon project name: `fastcampus-ontology` (twilight-snow-12938604)
- When adding variables to .env, use `echo 'KEY=VALUE' >> .env` rather than editing the file. Editing exposes existing secrets in the diff and sends them through tool calls.
- The ontology server's clock is anchored to the system-level override date `COURSE_NOW`. The process's current time starts at the course's narrative date and advances from there.
- Importing the ontology app into another process patches that process's global `Date`. Agent and telemetry processes must not do it: OpenTelemetry stamps spans with `Date`, and a collector silently drops spans dated months out of its ingestion window, so tracing disappears with no error. Run the ontology API as its own process and point `ONTOLOGY_URL` at it. `runAgent` warns when it detects the skew.
- Run agent files with the project root .env file.
- An action has two halves: a handler in `apps/ontology/src/actions/...` and an `action_type` metadata row holding its `parameter_schema` (JSON Schema). The invoke route reads the metadata to validate and dispatch, so a handler with no row is unreachable and its audit write fails. Add both together, apply the metadata INSERT via a temporary SQL file applied with `run-sql` (not the read-only Neon MCP), and keep the schema and the handler's params in sync.
- A new object type has two halves: an instance table in the target ontology schema and metadata rows (`object_type` + `property` rows, plus `link` rows if it references other types). The generic routes discover types from `object_type`, read columns from `property`, and resolve links from `link`. A table with no metadata is invisible to the API and UI. Add both together in a temporary SQL file applied with `run-sql`.


## Working agreements

- Plan before implementing. State the plan first: what will be built, which facts it depends on, and how it will be verified. Then check the facts that are still assumptions, and only then write code.
- Do not guess at an API. Read the installed package's own type declarations, or its documentation, before calling it. A plausible-looking guess that compiles can still be wrong, and two wrong guesses cost more than one lookup.
- When something fails twice, stop changing the code and go find the fact. Isolate one variable at a time; a hypothesis that explains the symptom is not the same as a cause that has been demonstrated.
- Make decision logic a named, exported function rather than an inline callback, so it can be tested directly instead of only through a live run.
- A check that passes silently deserves suspicion. Confirm the check itself can fail before trusting that it passed.
