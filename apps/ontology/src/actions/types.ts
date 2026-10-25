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
  /**
   * Who this action is attributed to, which is not always who sent the request.
   * Approving a proposal runs the underlying action on the approver's behalf,
   * and threads their identity through here so the inner action's audit row
   * names the person who authorised it rather than the machinery that ran it.
   *
   * Optional because an action can be invoked with nothing known about the
   * caller; handlers decide what an unattributed run is called.
   */
  callerIdentity?: string;
  /**
   * The proposal this action is being run to carry out, when it is one. Folded
   * into the audit entry by `auditResult` so the trail says not just who ran
   * the action but what authorised it.
   */
  authorizedByProposal?: number;
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
