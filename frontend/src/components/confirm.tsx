import { useState, type ReactNode } from "react"
import { Button, Modal } from "./ui"

/** Two-step confirmation used for every destructive or irreversible action. */
export function ConfirmDialog({
  open,
  title,
  children,
  message,
  closeOnConfirm = false,
  confirmLabel = "Confirm",
  cancelLabel = "Keep as is",
  danger = false,
  disabled = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  children?: ReactNode
  message?: ReactNode
  closeOnConfirm?: boolean
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  disabled?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal open={open} title={title} onClose={onCancel}>
      <div className="grid gap-5">
        <div className="text-sm leading-6 text-slate-600">{message ?? children}</div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            disabled={disabled}
            onClick={() => {
              onConfirm()
              if (closeOnConfirm) onCancel()
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export type PendingConfirm = {
  title: string
  body: ReactNode
  confirmLabel: string
  run: () => void
  danger?: boolean
  cancelLabel?: string
}

/**
 * Two-step confirmation for any button: `ask({ title, body, confirmLabel, run })`
 * opens the dialog; `run` only fires after the user confirms. Render `dialog` once in the page JSX.
 */
export function useConfirm() {
  const [pending, setPending] = useState<PendingConfirm | null>(null)
  const dialog = (
    <ConfirmDialog
      open={!!pending}
      title={pending?.title ?? ""}
      confirmLabel={pending?.confirmLabel}
      cancelLabel={pending?.cancelLabel}
      danger={pending?.danger ?? false}
      message={pending?.body}
      onCancel={() => setPending(null)}
      onConfirm={() => {
        const run = pending?.run
        setPending(null)
        run?.()
      }}
    />
  )
  return { ask: setPending, dialog }
}
