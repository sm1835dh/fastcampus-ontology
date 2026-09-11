import type { ContentfulStatusCode } from "hono/utils/http-status";

// Anything thrown as an ApiError reaches the client as JSON with its own status;
// everything else is a bug and becomes a 500.
export class ApiError extends Error {
  readonly status: ContentfulStatusCode;

  constructor(status: ContentfulStatusCode, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}
