import { useEffect, useRef, useState } from "react"
import { ArrowLeft, Eye, X } from "lucide-react"
import { Button } from "./ui"

export function ProofViewer({
  name,
  image,
  label = "View proof",
  method,
  amount,
}: {
  name?: string
  image?: string
  label?: string
  method?: string
  amount?: number
}) {
  const [open, setOpen] = useState(false)
  const [zoom, setZoom] = useState(false)
  const backRef = useRef<HTMLButtonElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  const close = () => {
    setOpen(false)
    setZoom(false)
    triggerRef.current?.focus()
  }
  useEffect(() => {
    if (!open) return
    backRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
    }
    window.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [open])
  const isImage = !!image && image.startsWith("data:image/")
  const details = [name, method, amount !== undefined ? `₱${amount.toLocaleString()}` : ""].filter(Boolean).join(" · ")
  return (
    <>
      <Button
        variant="secondary"
        onClick={(e) => {
          triggerRef.current = e.currentTarget
          setOpen(true)
        }}
      >
        <Eye size={16} /> {label}
      </Button>
      {open && (
        <div
          className="animate-fade fixed inset-0 z-[60] flex flex-col bg-ink-950/90 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Proof of payment"
          onClick={close}
        >
          <div className="flex items-center justify-between gap-3 p-3 sm:p-4" onClick={(e) => e.stopPropagation()}>
            <button
              ref={backRef}
              type="button"
              onClick={close}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/10 px-4 text-sm font-bold text-white hover:bg-white/20"
            >
              <ArrowLeft size={18} /> Back
            </button>
            <p className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-white">{details || "Proof of payment"}</p>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="grid size-11 place-items-center rounded-xl bg-white/10 text-white hover:bg-white/20"
            >
              <X size={20} />
            </button>
          </div>
          <div className="grid min-h-0 flex-1 place-items-center overflow-auto p-3 sm:p-6">
            {isImage ? (
              <img loading="lazy" decoding="async"
                src={image}
                alt={`Proof of payment ${name ?? ""}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setZoom((z) => !z)
                }}
                className={`rounded-xl bg-white shadow-2xl ${
                  zoom ? "max-w-none cursor-zoom-out" : "max-h-[90vh] max-w-[90vw] cursor-zoom-in object-contain"
                }`}
                style={zoom ? { width: "min(180vw, 2000px)" } : undefined}
              />
            ) : (
              <p className="max-w-md rounded-xl bg-white p-5 text-center text-sm text-slate-600" onClick={(e) => e.stopPropagation()}>
                This proof (<b>{name ?? "uploaded file"}</b>) is not an image, so it cannot be previewed. Please ask the guest to upload a JPG, JPEG or PNG image.
              </p>
            )}
          </div>
          {isImage && <p className="pb-3 text-center text-xs text-white/70">Click the image to {zoom ? "zoom out" : "zoom in"}. Press Esc to close.</p>}
        </div>
      )}
    </>
  )
}

export function PayQr({ amount, size = 220 }: { amount?: number; size?: number }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <img loading="lazy" decoding="async" src="/payment-qr.png" alt="InstaPay QR for Golden Pyramid Swimming Pool" width={size} height={size} className="rounded-xl border bg-white p-2" />
      <p className="text-xs text-slate-500">
        InstaPay QR (GCash / Maya / banking app){amount !== undefined ? ` · pay exactly ₱${amount.toLocaleString()}` : ""}
      </p>
    </div>
  )
}
