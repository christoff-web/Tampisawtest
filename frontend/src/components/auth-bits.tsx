import { useId, useState, type InputHTMLAttributes } from "react"
import { Check, Eye, EyeOff, TriangleAlert, X } from "lucide-react"
import { PASSWORD_RULES, cleanPhoneInput, phoneProblem } from "../lib/ops"

/**
 * Password box: show/hide, a Caps Lock warning while typing, and (when `rules` is on) a live checklist of the password rules.
 * The server applies the same rules, so this is guidance, not the only check.
 */
export function PasswordField({
  label,
  value,
  onChange,
  rules = false,
  autoComplete = "current-password",
  placeholder,
  name = "password",
  error,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  rules?: boolean
  autoComplete?: string
  placeholder?: string
  name?: string
  error?: string
}) {
  const id = useId()
  const [show, setShow] = useState(false)
  const [caps, setCaps] = useState(false)
  const [touched, setTouched] = useState(false)
  const track = (e: React.KeyboardEvent<HTMLInputElement>) => setCaps(e.getModifierState?.("CapsLock") ?? false)
  return (
    <div className="grid gap-2 text-sm font-semibold text-ink-800">
      <label htmlFor={id}>{label}</label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={show ? "text" : "password"}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-describedby={`${id}-msg`}
          aria-invalid={error ? true : undefined}
          onChange={(e) => {
            onChange(e.target.value)
            setTouched(true)
          }}
          onKeyDown={track}
          onKeyUp={track}
          onBlur={() => setCaps(false)}
          className={`min-h-12 w-full min-w-0 rounded-xl border bg-white px-3.5 pr-12 text-base font-normal outline-none transition placeholder:text-slate-400 focus:border-aqua-500 focus:ring-4 focus:ring-aqua-100 ${error ? "border-danger-500" : "border-slate-300"}`}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-1.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"
        >
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      <div id={`${id}-msg`} className="grid gap-1.5">
        {caps && (
          <p role="alert" className="flex items-center gap-1.5 text-xs font-bold text-warning-700">
            <TriangleAlert size={14} /> Caps Lock is on. Your password is case-sensitive.
          </p>
        )}
        {error && (
          <p role="alert" className="text-xs font-semibold text-danger-700">
            {error}
          </p>
        )}
        {rules && (touched || value.length > 0) && (
          <ul className="grid gap-1 text-xs font-medium" aria-label="Password requirements">
            {PASSWORD_RULES.map((r) => {
              const ok = r.ok(value)
              return (
                <li key={r.id} className={`flex items-center gap-1.5 ${ok ? "text-success-700" : "text-danger-700"}`}>
                  {ok ? <Check size={14} aria-hidden /> : <X size={14} aria-hidden />}
                  <span>{r.label}</span>
                  <span className="sr-only">{ok ? " (met)" : " (not met yet)"}</span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

/** Contact number box with a red warning as soon as the characters or the format are wrong. */
export function PhoneField({
  label,
  value,
  onChange,
  required,
  hint = "Example: 09171234567 or +639171234567",
  ...rest
}: {
  label: string
  value: string
  onChange: (v: string) => void
  required?: boolean
  hint?: string
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  const id = useId()
  const problem = phoneProblem(value)
  return (
    <div className="grid gap-2 text-sm font-semibold text-ink-800">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        value={value}
        required={required}
        maxLength={18}
        aria-invalid={problem ? true : undefined}
        aria-describedby={`${id}-msg`}
        placeholder="09XXXXXXXXX"
        onChange={(e) => onChange(cleanPhoneInput(e.target.value))}
        className={`min-h-12 w-full min-w-0 rounded-xl border bg-white px-3.5 text-base font-normal outline-none transition placeholder:text-slate-400 focus:ring-4 ${problem ? "border-danger-500 focus:border-danger-500 focus:ring-danger-100" : "border-slate-300 focus:border-aqua-500 focus:ring-aqua-100"}`}
        {...rest}
      />
      <p id={`${id}-msg`} role={problem ? "alert" : undefined} className={`text-xs ${problem ? "font-bold text-danger-700" : "font-normal text-slate-500"}`}>
        {problem || hint}
      </p>
    </div>
  )
}
