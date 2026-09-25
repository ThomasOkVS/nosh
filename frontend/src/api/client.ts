/**
 * The one base every request goes through: the API always lives under `/api`
 * on the page's own origin. In production the frontend's nginx forwards that
 * to the backend (frontend/nginx.conf); in dev, Vite's dev server does the
 * same (vite.config.ts). Same origin means no CORS, and the same build works
 * under any host name.
 */
const API_BASE = "/api";

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
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

  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? "GET",
    credentials: "include",
    headers:
      isFormData || options.body === undefined ? undefined : { "Content-Type": "application/json" },
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
