export type Config = {
  databaseUrl: string;
  /**
   * Where outbound alerts go. Optional: the server boots and serves every read
   * and every internal action without it, and only the actions that reach
   * outside refuse when it is missing.
   */
  webhookUrl: string | undefined;
};

export function loadConfig(): Config {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set (expected in .env at the repo root)");
  }
  // An empty string in .env means "not configured", not "send to nowhere".
  const webhookUrl = process.env["WEBHOOK_URL"]?.trim() || undefined;
  return { databaseUrl, webhookUrl };
}
