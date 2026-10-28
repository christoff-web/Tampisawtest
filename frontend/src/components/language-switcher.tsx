import { useI18n, type Lang } from "../lib/i18n"

const OPTIONS: { value: Lang; label: string }[] = [
  { value: "en", label: "EN" },
  { value: "fil", label: "FIL" },
]

/** Compact "EN | FIL" segmented control. `dark` is for use on coloured backgrounds. */
export default function LanguageSwitcher({ dark = false, className = "" }: { dark?: boolean; className?: string }) {
  const { lang, setLang } = useI18n()
  return (
    <div
      role="group"
      aria-label="Language"
      className={`inline-flex shrink-0 overflow-hidden rounded-lg border text-xs font-extrabold ${dark ? "border-white/30" : "border-slate-300"} ${className}`}
    >
      {OPTIONS.map((o) => {
        const active = lang === o.value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => setLang(o.value)}
            className={`min-h-9 px-2.5 transition ${
              active
                ? dark ? "bg-white text-aqua-700" : "bg-aqua-700 text-white"
                : dark ? "text-white/80 hover:bg-white/10" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
