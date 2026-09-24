/**
 * The one base every request goes through. In production it's the relative
 * `/api`: the frontend's own nginx forwards that to the backend, so the page
 * and its API share an origin and the same build works on any host name.
 * The local-dev default calls the backend on its own port instead.
 *
 * `||` rather than `??`: a CI build variable that's set but empty arrives
 * here as "", which must fall back too, not become a base of "".
 */
export function resolveApiBase(configured: string | undefined): string {
  return (configured || "http://localhost:3001").replace(/\/$/, "");
}

const API_URL = resolveApiBase(import.meta.env.VITE_API_URL);

export function apiUrl(path: string): string {
  return `${API_URL}${path}`;
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const isFormData = options.body instanceof FormData;

  let body: BodyInit | undefined;
  if (isFormData) {
    body = options.body as FormData;
  } else if (options.body !== undefined) {
    body = JSON.stringify(options.body);
  }

  const response = await fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    credentials: "include",
    headers: isFormData || options.body === undefined ? undefined : { "Content-Type": "application/json" },
    body,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const data: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    const message =
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : `Request failed with status ${response.status}`;
    throw new ApiError(response.status, message);
  }

  return data as T;
}
