import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { en, type TKey } from "./i18n-en"
import { fil } from "./i18n-fil"

export type Lang = "en" | "fil"
export type { TKey }
export type TVars = Record<string, string | number>

const STORAGE_KEY = "tampisaw.lang"
const dictionaries: Record<Lang, Partial<Record<string, string>>> = { en, fil }

function readLang(): Lang {
  try {
    return localStorage.getItem(STORAGE_KEY) === "fil" ? "fil" : "en"
  } catch {
    return "en"
  }
}

function interpolate(text: string, vars?: TVars) {
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
}

type I18nValue = { lang: Lang; setLang: (l: Lang) => void; t: (key: TKey, vars?: TVars) => string }

const I18nContext = createContext<I18nValue>({
  lang: "en",
  setLang: () => {},
  t: (key, vars) => interpolate(en[key] ?? key, vars),
})

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readLang)
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])
  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try {
      localStorage.setItem(STORAGE_KEY, l)
    } catch {
      /* storage unavailable */
    }
  }, [])
  const value = useMemo<I18nValue>(
    () => ({
      lang,
      setLang,
      t: (key, vars) => interpolate(dictionaries[lang][key] ?? en[key] ?? key, vars),
    }),
    [lang, setLang],
  )
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  return useContext(I18nContext)
}
