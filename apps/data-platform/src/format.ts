// Plain-text renderings shared by the table cells and the search, so a search
// finds a value in the form the page shows it as well as the form it is stored in.

export function formatNumber(value: unknown): string {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toLocaleString() : String(value);
}

export function formatTimestamp(value: unknown): string {
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
