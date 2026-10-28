import { useEffect, useRef } from "react"
import { useBlocker, useLocation } from "react-router-dom"
import { useI18n } from "../lib/i18n"
import { ConfirmDialog } from "./confirm"

export const LEAVE_MESSAGE =
  "Leaving now may cancel your booking and discard the information you've entered."

/**
 * Blocks in-app navigation and browser refresh/close while `dirty` is true.
 * Render the returned `dialog` once in the page JSX. `onLeave` runs only when
 * the user confirms leaving (use it to release holds).
 */
export function useLeaveGuard(dirty: boolean, message: string = LEAVE_MESSAGE, onLeave?: () => void, allowPaths: string[] = []) {
  const { t, lang } = useI18n()
  const { pathname } = useLocation()
  // Dialog chrome is translated for guest pages only; staff/admin screens stay English.
  const fil = lang === "fil" && !/^\/(staff|admin)/.test(pathname)
  const knownMessage = message === LEAVE_MESSAGE ? t("leave.bookingMessage") : message === "Leaving now will discard the report you are writing." ? t("leave.reportMessage") : message
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const bypass = useRef(false)
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirtyRef.current &&
      !bypass.current &&
      currentLocation.pathname !== nextLocation.pathname &&
      !allowPaths.some((p) => nextLocation.pathname.startsWith(p)),
  )
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      if (bypass.current) return
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [dirty])
  useEffect(() => {
    if (blocker.state === "blocked" && !dirty) blocker.reset()
  }, [blocker, dirty])
  const dialog = (
    <ConfirmDialog
      open={blocker.state === "blocked"}
      title={fil ? t("leave.title") : "Leave this page?"}
      message={fil ? t("leave.prefix", { message: knownMessage }) : `Leave this page? ${message}`}
      confirmLabel={fil ? t("leave.confirm") : "Leave page"}
      cancelLabel={fil ? t("leave.stay") : "Stay"}
      danger
      onCancel={() => blocker.state === "blocked" && blocker.reset()}
      onConfirm={() => {
        onLeave?.()
        if (blocker.state === "blocked") blocker.proceed()
      }}
    />
  )
  /** Call right before a successful completion navigation so no prompt appears. */
  const allowLeave = () => {
    bypass.current = true
  }
  return { dialog, allowLeave }
}
