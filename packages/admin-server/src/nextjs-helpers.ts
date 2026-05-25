/**
 * Next.js API Route Helpers for cms0
 *
 * Shared utilities for handling CORS, body parsing, and response formatting
 * in Next.js App Router API routes.
 */

// Minimal type definitions to avoid Next.js dependency
export type NextRequest = {
  method: string;
  headers: Headers;
  nextUrl: { searchParams: URLSearchParams };
  formData(): Promise<FormData>;
  json(): Promise<unknown>;
};

/** Request body type */
export type RequestBody =
  | FormData
  | Record<string, unknown>
  | string
  | undefined;

/** Standard CORS headers for content API routes */
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods":
    "GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
} as const;

/**
 * Add CORS headers to any response
 */
export function addCorsHeaders<T extends Response>(response: T): T {
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

/**
 * Read and parse request body
 * Handles: undefined (GET/HEAD), FormData, JSON
 */
export async function readBody(request: NextRequest): Promise<RequestBody> {
  if (request.method === "GET" || request.method === "HEAD") {
    return undefined;
  }

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentType.includes("multipart/form-data")) {
    try {
      return await request.formData();
    } catch {
      return undefined;
    }
  }

  try {
    const data = await request.json();
    return data as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/** Server result structure from AdminServerBinding.handleRequest */
export type ServerResult = {
  body: unknown;
  headers?: Record<string, string>;
  status: number;
};

function isBinaryBody(
  body: unknown,
): body is ArrayBuffer | ArrayBufferView | Uint8Array {
  return (
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body) ||
    body instanceof Uint8Array
  );
}

function normalizeBinaryBody(
  body: ArrayBuffer | ArrayBufferView | Uint8Array,
): ArrayBuffer {
  if (body instanceof ArrayBuffer) {
    return body;
  }

  const view =
    body instanceof Uint8Array
      ? body
      : new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  return view.buffer.slice(
    view.byteOffset,
    view.byteOffset + view.byteLength,
  ) as ArrayBuffer;
}

/**
 * Convert server result to Next.js Response with CORS
 */
export function toHttpResponse(result: ServerResult): Response {
  const headers = new Headers(result.headers);
  const hasCustomResponse =
    headers.has("content-disposition") || headers.has("content-type");

  // Add CORS headers
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    headers.set(key, value);
  });

  if (!hasCustomResponse) {
    const body = JSON.stringify(result.body);
    headers.set("content-type", "application/json");
    return new Response(body, { status: result.status, headers });
  }

  const contentType = headers.get("content-type");
  const body = isBinaryBody(result.body)
    ? normalizeBinaryBody(result.body)
    : typeof result.body === "string"
      ? result.body
      : contentType?.includes("application/json")
        ? JSON.stringify(result.body, null, 2)
        : JSON.stringify(result.body);

  return new Response(body, { status: result.status, headers });
}

/** Handle CORS preflight request */
export function handleCorsPreflight(): Response {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

/** Admin server interface for content handler */
export type ContentServer = {
  handleRequest: (req: {
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";
    segments: string[];
    headers: Headers;
    searchParams: URLSearchParams;
    body: RequestBody;
  }) => Promise<ServerResult>;
};

/** Configuration for createContentHandler */
export type ContentHandlerConfig = {
  getServer: () => ContentServer;
};

const ADMIN_ROUTE_ROOTS = new Set([
  "_graph",
  "api-keys",
  "backups",
  "content",
  "context",
  "data-transfer",
  "health",
  "schema",
  "triggers",
  "uploads",
  "usage",
]);

function normalizeContentHandlerSegments(slug: string[] | undefined) {
  const segments = slug ?? [];
  if (segments.length === 0 || ADMIN_ROUTE_ROOTS.has(segments[0] ?? "")) {
    return segments;
  }

  return ["content", ...segments];
}

/**
 * Create a standard content API handler
 *
 * Usage in route.ts:
 * ```typescript
 * const handle = createContentHandler({ getServer: getSelfHostedAdminServer });
 * export const GET = handle;
 * export const POST = handle;
 * ```
 */
export function createContentHandler(config: ContentHandlerConfig) {
  return async function handle(
    request: NextRequest,
    context: { params: Promise<{ slug?: string[] }> },
  ): Promise<Response> {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return handleCorsPreflight();
    }

    const server = config.getServer();
    const params = await context.params;

    const result = await server.handleRequest({
      method: request.method as
        | "GET"
        | "POST"
        | "PUT"
        | "PATCH"
        | "DELETE"
        | "HEAD",
      segments: normalizeContentHandlerSegments(params.slug),
      headers: request.headers,
      searchParams: request.nextUrl.searchParams,
      body: await readBody(request),
    });

    return toHttpResponse(result);
  };
}
