import type { ActionContext } from "./types.ts";

/**
 * The `result` an action records, with the authority it ran under folded in.
 *
 * An action invoked directly and the same action invoked because somebody
 * approved a proposal are indistinguishable in the trail otherwise: same actor,
 * same parameters, same effect. Recording which proposal authorised it is what
 * makes the chain readable afterwards -- proposal 10 says who proposed it and
 * why, and the batch's own entry points back at proposal 10.
 */
export function auditResult(
  context: ActionContext,
  result: Record<string, unknown>,
): Record<string, unknown> {
  return context.authorizedByProposal === undefined
    ? result
    : { ...result, authorizedByProposal: context.authorizedByProposal };
}
