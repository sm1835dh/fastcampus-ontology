// Relative imports carry the .ts extension — that is what Node 24 resolves at runtime.
import { loadConfig } from "./config.ts";

const config = loadConfig();

console.log("ontology up on node", process.version);
console.log("database host:", new URL(config.databaseUrl).host);
