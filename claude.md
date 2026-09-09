## Conventions

- Use `pnpm add` to install libraries.
Don't add packages by writing them directly into a `package.json`.
- The Neon Postgres connection string lives in `DATABASE_URL` in `.env` at the repository root.
- We use Node 24+, which can natively run `.ts` files without `tsx`, using `node --env-file=.env <file>.ts`.