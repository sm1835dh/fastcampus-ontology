import type { Kysely } from "kysely";
import type { Database } from "../db.ts";
import type { ActionTypeRow, InstanceRow, ObjectTypeRow } from "../ontology/metadata.ts";

/** What an action knows about the call it is serving. */
export type ActionContext = {
  db: Kysely<Database>;
  /** Both halves of the dual snapshot the audit trail needs. */
  objectType: ObjectTypeRow;
  actionType: ActionTypeRow;
  actor: string;
};

/**
 * An action handler. Implementations name their own instance and parameter
 * types; the route has already checked the params against parameter_schema, so
 * TParams describes a body that is known to fit the schema.
 */
export type ActionHandler<TInstance extends InstanceRow, TParams> = (
  instance: TInstance,
  params: TParams,
  context: ActionContext,
) => Promise<InstanceRow>;

/** The erased shape the registry stores, since it holds handlers for every type. */
export type RegisteredAction = ActionHandler<InstanceRow, Record<string, unknown>>;

/**
 * Registers a typed handler under the erased signature. The registry key
 * (`batch.deferStart`) is what makes the narrowing sound: the route resolves the
 * object type and loads that type's row before it dispatches, so a handler filed
 * under `batch.` is only ever handed a batch row.
 */
export function defineAction<TInstance extends InstanceRow, TParams>(
  handler: ActionHandler<TInstance, TParams>,
): RegisteredAction {
  return handler as RegisteredAction;
}
