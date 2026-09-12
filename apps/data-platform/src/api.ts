// Thin client over the ontology API. Field names mirror the server: metadata
// rows keep their snake_case column names, everything derived is camelCase.

export type ObjectType = {
  id: string;
  api_name: string;
  name: string;
  description: string | null;
  status: string;
  visibility: string;
  point_of_contact: string | null;
  edits_enabled: boolean;
  schema: string;
  datasource_table: string;
};

export type ObjectTypeListing = ObjectType & { instanceCount: number };

export type Property = {
  id: string;
  object_type_id: string;
  api_name: string;
  name: string;
  data_type: string;
  required: boolean;
  is_title: boolean;
  is_primary_key: boolean;
  datasource_column: string;
};

export type LinkView = {
  direction: "outbound" | "inbound";
  apiName: string;
  name: string;
  otherTypeApiName: string;
  cardinality: string;
  viaPropertyApiName: string;
  viaColumn: string;
};

export type ActionType = {
  id: string;
  object_type_id: string;
  api_name: string;
  name: string;
  description: string | null;
  parameter_schema: Record<string, unknown>;
};

export type TypeBundle = {
  objectType: ObjectType;
  instanceCount: number;
  properties: Property[];
  links: { outbound: LinkView[]; inbound: LinkView[] };
  actions: ActionType[];
};

/** One schema violation, as the action route reports it. */
export type ValidationIssue = { location: string; keyword: string; message: string };

/** A failed API call, keeping the server's message and any per-field details. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly details: ValidationIssue[];

  constructor(status: number, message: string, details: ValidationIssue[]) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.details = details;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const body = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    const payload = typeof body === "object" && body !== null ? (body as { error?: unknown; details?: unknown }) : {};
    throw new ApiRequestError(
      response.status,
      payload.error ? String(payload.error) : `Request failed with ${response.status}`,
      Array.isArray(payload.details) ? (payload.details as ValidationIssue[]) : [],
    );
  }

  return body as T;
}

export function listObjectTypes(): Promise<{ count: number; data: ObjectTypeListing[] }> {
  return request("/api/objects/meta/types");
}

export function getObjectType(apiName: string): Promise<TypeBundle> {
  return request(`/api/objects/meta/types/${encodeURIComponent(apiName)}`);
}

export function patchObjectType(
  apiName: string,
  patch: { name?: string; description?: string | null },
): Promise<{ objectType: ObjectType }> {
  return request(`/api/objects/meta/types/${encodeURIComponent(apiName)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
}

// --- instances ------------------------------------------------------------

/** A row keyed by property api_name, as the instance routes return it. */
export type InstanceRow = Record<string, unknown>;

export type ResolvedLink = {
  name: string;
  direction: "outbound" | "inbound";
  objectType: string;
  cardinality: string;
  data: InstanceRow | InstanceRow[] | null;
};

export type InstanceListing = { type: string; count: number; data: InstanceRow[] };

export type InstanceDetail = {
  type: string;
  id: string;
  data: InstanceRow;
  links: Record<string, ResolvedLink>;
};

/** Query parameters are property filters, keyed by property api_name. */
export function listInstances(apiName: string, filters?: Record<string, string>): Promise<InstanceListing> {
  const query = filters ? new URLSearchParams(filters).toString() : "";
  return request(`/api/objects/${encodeURIComponent(apiName)}${query ? `?${query}` : ""}`);
}

export function getInstance(apiName: string, id: string): Promise<InstanceDetail> {
  return request(`/api/objects/${encodeURIComponent(apiName)}/${encodeURIComponent(id)}`);
}

// --- actions ----------------------------------------------------------------

export type ActionResult = { type: string; id: string; action: string; data: InstanceRow };

/**
 * The body is the parameter object itself, keyed exactly as parameter_schema
 * declares -- the route validates it against that schema and hands it to the
 * handler unchanged.
 */
export function invokeAction(
  typeApiName: string,
  id: string,
  actionApiName: string,
  params: Record<string, unknown>,
): Promise<ActionResult> {
  const path = [typeApiName, id, "actions", actionApiName].map(encodeURIComponent).join("/");
  return request(`/api/objects/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
}

// --- audit ------------------------------------------------------------------

export type AuditEntry = {
  id: string;
  /** The action's api_name as recorded when it ran. */
  action: string;
  /** Its display name now, or null if the action type has since been deleted. */
  name: string | null;
  actor: string | null;
  params: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  createdAt: string;
};

export function getAudit(
  apiName: string,
  id: string,
): Promise<{ type: string; id: string; count: number; data: AuditEntry[] }> {
  return request(`/api/objects/${encodeURIComponent(apiName)}/${encodeURIComponent(id)}/audit`);
}
