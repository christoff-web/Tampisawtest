import { useState } from "react"
import { IMAGE_ACCEPT, isAllowedImage, IMAGE_ERROR } from "../lib/upload"

/** File input that accepts only JPG/JPEG/PNG. Calls onPick(file) for valid files, onPick(null) when cleared or rejected. */
export function ImageInput({
  onPick,
  className,
  capture,
}: {
  onPick: (file: File | null) => void | Promise<void>
  className?: string
  capture?: "user" | "environment"
}) {
  const [error, setError] = useState("")
  return (
    <>
      <input
        type="file"
        accept={IMAGE_ACCEPT}
        capture={capture}
        className={className}
        onChange={async (e) => {
          const input = e.currentTarget
          const f = input.files?.[0]
          if (!f) {
            setError("")
            await onPick(null)
            return
          }
          if (!isAllowedImage(f)) {
            setError(IMAGE_ERROR)
            input.value = ""
            await onPick(null)
            return
          }
          setError("")
          await onPick(f)
        }}
      />
      {error && (
        <span role="alert" className="text-xs font-semibold text-danger-600">
          {error}
        </span>
      )}
    </>
  )
}
