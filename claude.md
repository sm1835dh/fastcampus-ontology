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
