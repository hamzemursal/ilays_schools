const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; accessToken?: string | null } = {},
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(data?.message ?? `Request failed with status ${res.status}`, res.status);
  }
  return data as T;
}

export interface Profile {
  id: string;
  email: string;
  organizationId: string | null;
  roles: string[];
  permissions: string[];
  schoolIds: string[];
  schools: { id: string; name: string }[];
}

export const api = {
  login: (email: string, password: string) =>
    request<{ accessToken: string }>("/auth/login", { method: "POST", body: { email, password } }),
  refresh: () => request<{ accessToken: string }>("/auth/refresh", { method: "POST" }),
  logout: () => request<{ success: boolean }>("/auth/logout", { method: "POST" }),
  acceptInvite: (token: string, password: string) =>
    request<{ accessToken: string }>("/auth/accept-invite", { method: "POST", body: { token, password } }),
  me: (accessToken: string) => request<Profile>("/auth/me", { accessToken }),
};
