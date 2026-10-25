// Turns an action's parameter_schema into form fields, and form values back into
// the exact parameter object the action route validates and hands to its handler.
// No JSX here, so Node can run it directly.

export type FieldKind = "datetime" | "string" | "enum" | "number" | "boolean";

export type ActionField = {
  name: string;
  label: string;
  kind: FieldKind;
  required: boolean;
  description: string | undefined;
  /** enum only: the schema's own values, so a numeric enum is sent as a number. */
  enumValues: readonly unknown[];
  /** number only. */
  integer: boolean;
  minimum: number | undefined;
  maximum: number | undefined;
};

/**
 * What each editor holds. A datetime keeps the ISO string DateInput reports;
 * an editor with nothing in it is null.
 */
export type FieldValue = string | number | boolean | null;
export type FormValues = Record<string, FieldValue>;

type PropertySchema = {
  type?: string | readonly string[];
  format?: string;
  enum?: readonly unknown[];
  title?: string;
  description?: string;
  minimum?: number;
  maximum?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `["string", "null"]` means an optional string; the non-null member decides the editor. */
function primaryType(type: PropertySchema["type"]): string | undefined {
  if (typeof type === "string") return type;
  return type?.find((entry) => entry !== "null");
}

/** `newPlannedStart` -> `New planned start`, for schemas without a title. */
function humanize(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function fieldsFromSchema(schema: Record<string, unknown>): ActionField[] {
  const properties = isRecord(schema["properties"]) ? (schema["properties"] as Record<string, PropertySchema>) : {};
  const required = new Set(Array.isArray(schema["required"]) ? schema["required"].map(String) : []);

  return Object.entries(properties).map(([name, property]): ActionField => {
    const type = primaryType(property.type);
    const kind: FieldKind = Array.isArray(property.enum)
      ? "enum"
      : type === "string" && property.format === "date-time"
        ? "datetime"
        : type === "number" || type === "integer"
          ? "number"
          : type === "boolean"
            ? "boolean"
            : "string";

    return {
      name,
      label: property.title ?? humanize(name),
      kind,
      required: required.has(name),
      description: property.description,
      enumValues: property.enum ?? [],
      integer: type === "integer",
      minimum: property.minimum,
      maximum: property.maximum,
    };
  });
}

export function initialValues(fields: ActionField[]): FormValues {
  return Object.fromEntries(fields.map((field) => [field.name, field.kind === "boolean" ? false : null]));
}

function isEmpty(value: FieldValue | undefined): boolean {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

export function missingRequired(fields: ActionField[], values: FormValues): ActionField[] {
  return fields.filter((field) => field.required && isEmpty(values[field.name]));
}

/**
 * The request body. Keys are exactly the schema's property names, and an editor
 * left empty is omitted rather than sent as "" -- an empty string would fail a
 * `format: date-time` check before the handler ever saw it.
 */
export function buildParams(fields: ActionField[], values: FormValues): Record<string, unknown> {
  const params: Record<string, unknown> = {};

  for (const field of fields) {
    const value = values[field.name];
    if (isEmpty(value)) continue;

    switch (field.kind) {
      case "datetime": {
        // DateInput's ISO string can carry a local offset; one UTC instant is
        // what `new Date(params.x)` in a handler reads without ambiguity.
        const instant = new Date(String(value));
        if (!Number.isNaN(instant.getTime())) params[field.name] = instant.toISOString();
        break;
      }
      case "number":
        params[field.name] = Number(value);
        break;
      case "enum":
        params[field.name] = field.enumValues.find((option) => String(option) === String(value)) ?? value;
        break;
      case "boolean":
        params[field.name] = value === true;
        break;
      default:
        params[field.name] = String(value);
    }
  }

  return params;
}

const pad = (value: number) => String(value).padStart(2, "0");

/** How a datetime reads in the input while editing: `2026-12-01 08:00`, local time. */
export function formatDateInput(date: Date): string {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** The inverse of formatDateInput, strict so typed text is never guessed at. */
export function parseDateInput(text: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/.exec(text.trim());
  if (!match) return null;

  const [, year, month, day, hour = "00", minute = "00"] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));

  // new Date quietly rolls 2026-02-31 into March; refuse it instead.
  if (date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) return null;
  return date;
}
