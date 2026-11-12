export type ApiError = {
  status: number;
  code: string;
  message: string;
  reason?: string;
};

export type Permission = {
  module: string;
  canView: boolean;
  canEdit: boolean;
  canApprove: boolean;
  canDownloadPdf: boolean;
};

export type User = {
  id: number;
  username: string;
  fullName: string;
  email: string;
  jobTitle: string;
  initials: string;
  role: string;
  roleName: string;
  departmentId: number | null;
  department: string;
  departmentName: string;
  siteId?: number | null;
  site: string;
  siteName: string;
};

export type Me = {
  user: User;
  permissions: Permission[];
  passwordChangeReason: null | "FIRST_LOGIN" | "EXPIRED";
  idleTimeoutSeconds: number;
  sessionExpiresAtUnix: number;
  passwordMinLength: number;
  passwordMaxAgeDays: number;
};

export const SESSION_EXPIRED_EVENT = "gap:session-expired";

type Options = {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  body?: unknown;
  /** Request latar belakang: tidak memperpanjang sesi idle (header X-Idle-Poll). */
  background?: boolean;
};

export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  const isFormData = typeof FormData !== "undefined" && opts.body instanceof FormData;
  const headers: Record<string, string> = {};
  if (opts.body !== undefined && !isFormData) headers["Content-Type"] = "application/json";
  if (opts.background) headers["X-Idle-Poll"] = "1";

  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers,
      body: opts.body === undefined ? undefined : isFormData ? (opts.body as FormData) : JSON.stringify(opts.body),
    });
  } catch {
    throw { status: 0, code: "NETWORK", message: "Cannot reach the server. Check your connection." } satisfies ApiError;
  }

  if (res.ok) return (await res.json()) as T;

  let err: ApiError = { status: res.status, code: "UNKNOWN", message: "Something went wrong. Please try again." };
  try {
    const data = await res.json();
    if (data?.error) err = { status: res.status, ...data.error };
  } catch {
    /* body bukan JSON */
  }
  if (err.code === "SESSION_EXPIRED" && typeof window !== "undefined") {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }
  throw err;
}

export function isApiError(e: unknown): e is ApiError {
  return typeof e === "object" && e !== null && "code" in e && "message" in e;
}
