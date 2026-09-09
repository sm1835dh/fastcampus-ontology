export type Config = {
  databaseUrl: string;
};

export function loadConfig(): Config {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set (expected in .env at the repo root)");
  }
  return { databaseUrl };
}
