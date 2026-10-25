// Every implemented action, keyed by `${objectTypeApiName}.${actionApiName}`.
// An action_type row without an entry here is metadata with no implementation
// behind it, which the route reports rather than guessing at.
import batchAlertOperator from "./manufacturing/batchAlertOperator.ts";
import batchCancel from "./manufacturing/batchCancel.ts";
import batchDeferStart from "./manufacturing/batchDeferStart.ts";
import tankScheduleMaintenance from "./manufacturing/tankScheduleMaintenance.ts";
import proposalApprove from "./shared/proposalApprove.ts";
import proposalReject from "./shared/proposalReject.ts";
import type { RegisteredAction } from "./types.ts";

export const actionHandlers: Record<string, RegisteredAction> = {
  "batch.alertOperator": batchAlertOperator,
  "batch.cancel": batchCancel,
  "batch.deferStart": batchDeferStart,
  "proposal.approve": proposalApprove,
  "proposal.reject": proposalReject,
  "tank.scheduleMaintenance": tankScheduleMaintenance,
};

export function handlerKey(objectTypeApiName: string, actionApiName: string): string {
  return `${objectTypeApiName}.${actionApiName}`;
}

/**
 * The inverse of `handlerKey`. A proposal stores the key as text, and approving
 * it has to get back to the two metadata rows the key stands for.
 *
 * Split on the first dot only: the object type's api_name never contains one,
 * while splitting on the last would quietly mangle anything that did.
 */
export function parseHandlerKey(key: string): { objectTypeApiName: string; actionApiName: string } {
  const dot = key.indexOf(".");
  if (dot <= 0 || dot === key.length - 1) {
    throw new Error(`'${key}' is not a handler key; expected the form 'objectType.actionName'.`);
  }
  return { objectTypeApiName: key.slice(0, dot), actionApiName: key.slice(dot + 1) };
}
