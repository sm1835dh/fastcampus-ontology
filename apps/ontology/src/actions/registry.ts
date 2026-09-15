// Every implemented action, keyed by `${objectTypeApiName}.${actionApiName}`.
// An action_type row without an entry here is metadata with no implementation
// behind it, which the route reports rather than guessing at.
import batchDeferStart from "./manufacturing/batchDeferStart.ts";
import tankScheduleMaintenance from "./manufacturing/tankScheduleMaintenance.ts";
import type { RegisteredAction } from "./types.ts";

export const actionHandlers: Record<string, RegisteredAction> = {
  "batch.deferStart": batchDeferStart,
  "tank.scheduleMaintenance": tankScheduleMaintenance,
};

export function handlerKey(objectTypeApiName: string, actionApiName: string): string {
  return `${objectTypeApiName}.${actionApiName}`;
}
