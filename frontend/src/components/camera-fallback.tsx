import { ExternalLink } from "lucide-react"

export type CameraIssue = "blocked" | "iframe" | "none" | "busy" | "unsupported"

export const inIframe = () => {
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}

/** Opens a camera stream, falling back to unconstrained video, and classifies failures. */
export async function openCamera(
  facingMode: "user" | "environment",
): Promise<{ stream: MediaStream } | { issue: CameraIssue }> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return { issue: inIframe() ? "iframe" : "unsupported" }
  }
  try {
    const status = await navigator.permissions?.query({ name: "camera" as PermissionName })
    if (status?.state === "denied") return { issue: inIframe() ? "iframe" : "blocked" }
  } catch {
    /* permissions API unavailable for camera */
  }
  const attempt = (video: MediaTrackConstraints | boolean) =>
    navigator.mediaDevices.getUserMedia({ video, audio: false })
  try {
    try {
      return { stream: await attempt({ facingMode }) }
    } catch (err) {
      const name = (err as DOMException)?.name
      if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError" || name === "TypeError") {
        return { stream: await attempt(true) }
      }
      throw err
    }
  } catch (err) {
    const name = (err as DOMException)?.name
    if (name === "NotFoundError" || name === "DevicesNotFoundError") return { issue: "none" }
    if (name === "NotReadableError" || name === "AbortError") return { issue: "busy" }
    return { issue: inIframe() ? "iframe" : "blocked" }
  }
}

export function cameraMessage(issue: CameraIssue, fallback: string) {
  switch (issue) {
    case "iframe":
      return `This preview window does not allow camera access. Open the app in a new tab, or ${fallback}.`
    case "blocked":
      return `Camera access is blocked. Allow the camera for this site in your browser settings, open the app in a new tab, or ${fallback}.`
    case "none":
      return `No camera was found on this device. ${fallback.charAt(0).toUpperCase()}${fallback.slice(1)}.`
    case "busy":
      return `The camera is being used by another app. Close it and try again, or ${fallback}.`
    default:
      return `This browser cannot open the camera here. Open the app in a new tab, or ${fallback}.`
  }
}

export function OpenInNewTabButton({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.open(window.location.href, "_blank")}
      className={`inline-flex items-center justify-center gap-2 rounded-xl bg-aqua-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-aqua-700 ${className}`}
    >
      <ExternalLink size={16} /> Open in new tab
    </button>
  )
}
