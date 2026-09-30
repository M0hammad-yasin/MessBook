import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from "axios";
import type {
  Entity,
  State,
  Member,
  Food,
  Fuel,
  Cooking,
  Shared,
  Payment,
  Purchase,
  Attendance,
} from "./domain";
import type { MealInput } from "./meal-service";

// ---------------------------------------------------------------------------
// Custom API Error
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ---------------------------------------------------------------------------
// Axios Client Setup with Interceptors (DRY Error & Response Handling)
// ---------------------------------------------------------------------------

export const http: AxiosInstance = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
});

// Response interceptor automatically extracts API errors uniformly across all endpoints
http.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error instanceof ApiError) {
      return Promise.reject(error);
    }
    if (error instanceof AxiosError && error.response) {
      const message =
        error.response.data?.error ||
        error.response.statusText ||
        error.message;
      return Promise.reject(new ApiError(message, error.response.status));
    }
    return Promise.reject(
      error instanceof Error ? error : new Error("Network error"),
    );
  },
);

/** Generic reusable request wrapper enforcing DRY response unwrapping */
async function request<T>(config: AxiosRequestConfig): Promise<T> {
  const { data } = await http.request<T>(config);
  return data;
}

// ---------------------------------------------------------------------------
// Auth API
// ---------------------------------------------------------------------------

export type AuthStatus = {
  user: { id: string; name: string; email: string } | null;
  needsSetup: boolean;
};

export const authApi = {
  /** GET /api/auth — check current session & setup state */
  getStatus: (): Promise<AuthStatus> =>
    request<AuthStatus>({
      url: "/auth",
      method: "GET",
      headers: { "Cache-Control": "no-store" },
    }),

  /** POST /api/auth — sign in or complete initial workspace setup */
  login: (credentials: Record<string, unknown> | FormData): Promise<void> => {
    const payload =
      credentials instanceof FormData
        ? Object.fromEntries(credentials.entries())
        : credentials;
    return request<void>({
      url: "/auth",
      method: "POST",
      data: payload,
    });
  },

  /** DELETE /api/auth — sign out and destroy session */
  logout: (): Promise<void> =>
    request<void>({
      url: "/auth",
      method: "DELETE",
    }),
};

// ---------------------------------------------------------------------------
// Records API & Generic CRUD Operations
// ---------------------------------------------------------------------------

export type SaveRecordsPayload = {
  revision: number;
  upsert?: Entity[];
  archive?: string[];
  meal?: MealInput;
};

export const recordsApi = {
  /** GET /api/records — fetch all active records and the current revision */
  getAll: (): Promise<State> =>
    request<State>({
      url: "/records",
      method: "GET",
      headers: { "Cache-Control": "no-store" },
    }),

  /** POST /api/records — atomic save operation */
  save: (payload: SaveRecordsPayload): Promise<State> =>
    request<State>({
      url: "/records",
      method: "POST",
      data: payload,
    }),

  /** Upsert a single entity */
  upsert: (entity: Entity, revision: number): Promise<State> =>
    recordsApi.save({ revision, upsert: [entity] }),

  /** Upsert multiple entities */
  bulkUpsert: (entities: Entity[], revision: number): Promise<State> =>
    recordsApi.save({ revision, upsert: entities }),

  /** Archive (delete) a single entity by ID */
  archive: (id: string, revision: number): Promise<State> =>
    recordsApi.save({ revision, archive: [id] }),

  /** Archive (delete) multiple entities by IDs */
  bulkArchive: (ids: string[], revision: number): Promise<State> =>
    recordsApi.save({ revision, archive: ids }),

  /** Save a meal transaction and its member splits */
  saveMeal: (meal: MealInput, revision: number): Promise<State> =>
    recordsApi.save({ revision, meal }),
};

// ---------------------------------------------------------------------------
// Specialized Entity CRUD Utilities (DRY & Scalable)
// ---------------------------------------------------------------------------

export const entityCrud = {
  member: {
    save: (item: Member, revision: number) => recordsApi.upsert(item, revision),
    archive: (id: string, revision: number) => recordsApi.archive(id, revision),
  },
  food: {
    save: (item: Food, revision: number) => recordsApi.upsert(item, revision),
    archive: (id: string, revision: number) => recordsApi.archive(id, revision),
  },
  fuel: {
    save: (item: Fuel, revision: number) => recordsApi.upsert(item, revision),
    archive: (id: string, revision: number) => recordsApi.archive(id, revision),
  },
  cooking: {
    save: (item: Cooking, revision: number) => recordsApi.upsert(item, revision),
    archive: (id: string, revision: number) => recordsApi.archive(id, revision),
  },
  shared: {
    save: (item: Shared, revision: number) => recordsApi.upsert(item, revision),
    archive: (id: string, revision: number) => recordsApi.archive(id, revision),
  },
  payment: {
    save: (item: Payment, revision: number) => recordsApi.upsert(item, revision),
    archive: (id: string, revision: number) => recordsApi.archive(id, revision),
  },
  purchase: {
    save: (item: Purchase, revision: number) => recordsApi.upsert(item, revision),
    archive: (id: string, revision: number) => recordsApi.archive(id, revision),
  },
  attendance: {
    save: (item: Attendance, revision: number) => recordsApi.upsert(item, revision),
    archive: (id: string, revision: number) => recordsApi.archive(id, revision),
  },
  meal: {
    save: (meal: MealInput, revision: number) => recordsApi.saveMeal(meal, revision),
    archive: (id: string, revision: number) => recordsApi.archive(id, revision),
  },
};

// ---------------------------------------------------------------------------
// Audit API
// ---------------------------------------------------------------------------

export type AuditEntry = {
  id: string;
  user_id: string;
  user_name: string;
  action: string;
  record_id: string;
  at: string;
  old_value: string | null;
  new_value: string | null;
};

export const auditApi = {
  /** GET /api/audit — paginated activity log */
  getLogs: (cursor?: { before: string; id: string }): Promise<AuditEntry[]> =>
    request<AuditEntry[]>({
      url: "/audit",
      method: "GET",
      params: cursor ? { before: cursor.before, id: cursor.id } : undefined,
      headers: { "Cache-Control": "no-store" },
    }),
};

// ---------------------------------------------------------------------------
// Convenience aliases for backwards compatibility
// ---------------------------------------------------------------------------

export const getAuth = authApi.getStatus;
export const login = authApi.login;
export const logout = authApi.logout;
export const getRecords = recordsApi.getAll;
export const saveRecords = recordsApi.save;
export const getAudit = auditApi.getLogs;
