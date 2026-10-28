import type { AppState, User } from "./types"

/** What the ASP.NET Core server sends back: the data this person may see, and who they are. */
export type ServerSnapshot = { state: AppState; user?: User | null }
export type ServerResult = { ok: boolean; error?: string; bookingId?: string }
export type DispatchResponse = ServerResult & ServerSnapshot

export class ServerUnreachable extends Error {
  constructor() {
    super("Cannot reach the Tampisaw server. Check that the application is running and try again.")
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      credentials: "same-origin",
      ...init,
      headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...(init?.headers ?? {}) },
    })
  } catch {
    throw new ServerUnreachable()
  }
  // 401/403 still carry a JSON body ({ ok:false, error, state }); anything else without JSON is a server fault.
  const text = await res.text()
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(res.ok ? "The server sent an unexpected answer." : `The server returned an error (${res.status}).`)
  }
}

export const apiGetState = () => request<ServerSnapshot>("/api/state")
export const apiPost = <T,>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) })
export const apiDispatch = (action: unknown) => apiPost<DispatchResponse>("/api/dispatch", action)
