import type { ReactNode } from "react"
import { Navigate, useLocation } from "react-router-dom"
import { useTampisaw } from "../store"
import type { Role } from "../types"
import { canAccess } from "../lib/ops"

export const homeFor = (role: Role) =>
  role === "root-admin" ? "/root" : role === "admin" ? "/admin" : role === "guest" ? "/my-bookings" : "/staff"

export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { currentUser } = useTampisaw()
  const location = useLocation()
  if (!currentUser)
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />
  if (!roles.includes(currentUser.role) || !canAccess(currentUser.role, location.pathname)) return <Navigate to={homeFor(currentUser.role)} replace />
  return <>{children}</>
}
