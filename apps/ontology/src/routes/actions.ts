// Action invocation. The route resolves metadata, checks the body against the
// action's own parameter_schema, then hands off to the registered handler.
import { Validator, type Schema } from "@cfworker/json-schema";
import { Hono } from "hono";
import { actionHandlers, handlerKey } from "../actions/registry.ts";
import { db } from "../db.ts";
import { ApiError } from "../ontology/errors.ts";
import { findInstance } from "../ontology/instances.ts";
import { loadTypeView, requireActionType, toApiObject } from "../ontology/metadata.ts";

const actions = new Hono();

actions.post("/:type/:id/actions/:actionName", async (c) => {
  const view = await loadTypeView(c.req.param("type"));
  const id = c.req.param("id");

  const instance = await findInstance(view, id);
  if (!instance) throw new ApiError(404, `No ${view.objectType.api_name} with id '${id}'`);

  const actionType = await requireActionType(view.objectType.id, c.req.param("actionName"));

  // An absent body is an empty parameter object; a malformed one is a mistake
  // worth reporting rather than silently treating as empty.
  const raw = await c.req.text();
  let params: unknown = {};
  if (raw.trim() !== "") {
    try {
      params = JSON.parse(raw);
    } catch {
      throw new ApiError(400, "Request body must be JSON.");
    }
  }

  const validation = new Validator(actionType.parameter_schema as Schema).validate(params);
  if (!validation.valid) {
    return c.json(
      {
        error: `Parameters do not match the schema for '${actionType.api_name}'.`,
        details: validation.errors.map((issue) => ({
          location: issue.instanceLocation,
          keyword: issue.keyword,
          message: issue.error,
        })),
      },
      400,
    );
  }

  const key = handlerKey(view.objectType.api_name, actionType.api_name);
  const handler = actionHandlers[key];
  if (!handler) throw new ApiError(501, `Action '${key}' is declared in metadata but has no handler.`);

  // Both spellings, because two kinds of caller exist: a human's curl or the UI
  // sends x-actor, while runAgent tags every agent call with x-caller-identity.
  // Reading only one of them recorded a whole class of writes as "anonymous"
  // once already, so neither is read alone.
  const callerIdentity = c.req.header("x-caller-identity") ?? c.req.header("x-actor");

  const updated = await handler(instance, params as Record<string, unknown>, {
    db,
    objectType: view.objectType,
    actionType,
    // No auth yet; the caller names itself so the audit trail is not blank.
    actor: c.req.header("x-actor") ?? c.req.header("x-caller-identity") ?? "anonymous",
    // Narrowed to a string before it goes in: under exactOptionalPropertyTypes
    // an optional property may be absent, but not present-and-undefined.
    ...(callerIdentity === undefined ? {} : { callerIdentity }),
  });

  return c.json({
    type: view.objectType.api_name,
    id,
    action: actionType.api_name,
    data: toApiObject(updated, view.properties),
  });
});

export default actions;
