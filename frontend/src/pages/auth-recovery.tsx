import { useState, type FormEvent } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { ArrowRight, MailCheck } from "lucide-react"
import { PublicLayout } from "../components/layouts"
import { Button, Card, Input } from "../components/ui"
import { PasswordField } from "../components/auth-bits"
import { apiPost } from "../api"
import { isValidEmail, passwordProblems } from "../lib/ops"

type Reply = { ok: boolean; error?: string; message?: string }

/**
 * Forgot password for every kind of account (guest, receptionist, admin, root admin):
 * 1) enter the e-mail, 2) enter the 6-digit code that was sent to it and choose a new password.
 */
export function ForgotPasswordPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [step, setStep] = useState<"email" | "code">("email")
  const [email, setEmail] = useState(params.get("email") ?? "")
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [info, setInfo] = useState("")
  const [busy, setBusy] = useState(false)

  const requestCode = async (e?: FormEvent) => {
    e?.preventDefault()
    setError("")
    if (!isValidEmail(email)) return setError("Enter the e-mail address of your account.")
    setBusy(true)
    try {
      const res = await apiPost<Reply>("/api/auth/forgot", { email: email.trim() })
      setInfo(res.message ?? "If that e-mail belongs to an account, a 6-digit code has been sent to it.")
      setStep("code")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the code. Try again.")
    } finally {
      setBusy(false)
    }
  }

  const reset = async (e: FormEvent) => {
    e.preventDefault()
    setError("")
    if (!/^\d{6}$/.test(code.trim())) return setError("Enter the 6-digit code from the e-mail.")
    const weak = passwordProblems(password)
    if (weak.length) return setError(`Your new password still needs: ${weak.join("; ").toLowerCase()}.`)
    if (password !== confirm) return setError("The two passwords do not match.")
    setBusy(true)
    try {
      const res = await apiPost<Reply>("/api/auth/reset", { email: email.trim(), code: code.trim(), password })
      if (!res.ok) return setError(res.error ?? "Could not reset the password.")
      navigate("/login?reset=1", { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset the password. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <PublicLayout>
      <main className="grid min-h-[calc(100vh-72px)] place-items-center px-4 py-10">
        <Card className="w-full max-w-md p-6 sm:p-9">
          <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-aqua-700">Account recovery</p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight">Forgot your password?</h1>
          <p className="mt-2 text-sm text-slate-500">
            {step === "email"
              ? "Enter your account e-mail. We will send a 6-digit code that proves the account is yours."
              : "Enter the code we sent and choose a new password."}
          </p>

          {step === "email" ? (
            <form className="mt-6 grid gap-5" onSubmit={requestCode} noValidate>
              <Input label="E-mail address" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              {error && <p role="alert" className="rounded-xl bg-danger-50 p-3 text-sm font-semibold text-danger-700">{error}</p>}
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? "Sending…" : "Send reset code"} <ArrowRight size={17} />
              </Button>
            </form>
          ) : (
            <form className="mt-6 grid gap-5" onSubmit={reset} noValidate>
              <p role="status" className="flex gap-2 rounded-xl bg-success-50 p-3 text-sm font-semibold text-success-800">
                <MailCheck size={18} className="mt-0.5 shrink-0" /> {info}
              </p>
              <Input
                label="6-digit code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
              <PasswordField label="New password" name="new-password" autoComplete="new-password" rules value={password} onChange={setPassword} />
              <PasswordField label="Confirm new password" name="confirm-password" autoComplete="new-password" value={confirm} onChange={setConfirm} />
              {error && <p role="alert" className="rounded-xl bg-danger-50 p-3 text-sm font-semibold text-danger-700">{error}</p>}
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? "Saving…" : "Set new password"} <ArrowRight size={17} />
              </Button>
              <button type="button" className="text-sm font-bold text-aqua-700" onClick={() => requestCode()} disabled={busy}>
                Send a new code
              </button>
            </form>
          )}
          <p className="mt-7 text-center text-sm text-slate-500">
            <Link className="font-bold text-aqua-700" to="/login">
              Back to log in
            </Link>
          </p>
        </Card>
      </main>
    </PublicLayout>
  )
}
