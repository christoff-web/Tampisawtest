import { Globe, Mail, MapPin, MessageCircle, Music2, Phone, Play, Sparkles } from "lucide-react"
import { useTampisaw } from "../store"

export const FACEBOOK_URL = "https://www.facebook.com/GPPResort"
export const FACEBOOK_NAME = "Golden Pyramid Pavillion and Resort"
export const CONTACT_PHONE = "09691219930"
export const CONTACT_EMAIL = "Goldenpyramidresort@gmail.com"

function FacebookIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.69.24 2.69.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.88v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z" />
    </svg>
  )
}

const platformStyles: Record<string, string> = {
  facebook: "bg-[#1877F2] text-white",
  instagram: "bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white",
  tiktok: "bg-[#000000] text-white",
  youtube: "bg-[#FF0000] text-white",
  x: "bg-[#0F172A] text-white",
  website: "bg-[#0ea5e9] text-white",
  linkedin: "bg-[#0A66C2] text-white",
  other: "bg-slate-700 text-white",
}

const platformIcon = (platform: string) => {
  switch (platform) {
    case "instagram": return <Globe size={16} />
    case "tiktok": return <Music2 size={16} />
    case "youtube": return <Play size={16} />
    case "facebook": return <FacebookIcon size={16} />
    default: return <Sparkles size={16} />
  }
}


export function SiteFooter({ place, mapLabel, photos }: { place: string; mapLabel: string; photos: string }) {
  const { state } = useTampisaw()
  const link = "underline-offset-4 hover:text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-aqua-300"
  const contact = state.settings?.contact ?? {
    resortName: FACEBOOK_NAME,
    facebookName: FACEBOOK_NAME,
    facebookUrl: FACEBOOK_URL,
    phone: CONTACT_PHONE,
    email: CONTACT_EMAIL,
    instagramUrl: "",
    tiktokUrl: "",
    socialLinks: [],
  }
  const socialLinks = (contact.socialLinks ?? []).filter((item) => item.active && item.url)
  const fbUrl = contact.facebookUrl || FACEBOOK_URL
  const fbName = contact.facebookName || FACEBOOK_NAME
  const phone = contact.phone || CONTACT_PHONE
  const email = contact.email || CONTACT_EMAIL

  return (
    <footer className="bg-ink-950 py-10 text-slate-300" id="contact">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 md:grid-cols-[1.2fr_1fr_1fr] lg:px-8">
        <div>
          <p className="text-xl font-extrabold text-white">{contact.resortName || "Golden Pyramid Pavillion and Resort"}</p>
          <p className="mt-2 text-sm">{fbName}</p>
          <p className="mt-2 flex items-start gap-2 text-sm">
            <MapPin size={16} className="mt-0.5 shrink-0 text-aqua-300" aria-hidden />
            <span>
              {place} ·{" "}
              <a href="https://maps.app.goo.gl/RbM3UtowLGxQVgUN6" target="_blank" rel="noopener noreferrer" className={link}>
                {mapLabel}
              </a>
            </span>
          </p>
        </div>

        <div>
          <p className="text-sm font-extrabold uppercase tracking-wider text-white">Contact us</p>
          <ul className="mt-3 grid gap-2 text-sm">
            <li>
              <a href={`tel:${phone}`} className={`flex items-center gap-2 ${link}`}>
                <Phone size={16} className="shrink-0 text-aqua-300" aria-hidden /> {phone}
              </a>
            </li>
            <li>
              <a href={`mailto:${email}`} className={`flex items-center gap-2 break-all ${link}`}>
                <Mail size={16} className="shrink-0 text-aqua-300" aria-hidden /> {email}
              </a>
            </li>
          </ul>
        </div>

        <div>
          <p className="text-sm font-extrabold uppercase tracking-wider text-white">Follow us</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {fbUrl && (
              <a
                href={fbUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${fbName} on Facebook (opens in a new tab)`}
                className="inline-flex items-center gap-3 rounded-xl border border-white/20 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10"
              >
                <span className="grid size-9 place-items-center rounded-full bg-[#1877F2] text-white">
                  <FacebookIcon />
                </span>
                <span>{fbName}</span>
              </a>
            )}
            {socialLinks.map((item) => (
              <a
                key={`${item.platform}-${item.url}`}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${item.label || item.platform} (opens in a new tab)`}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 ${platformStyles[item.platform] ?? platformStyles.other}`}
              >
                {platformIcon(item.platform)}
              </a>
            ))}
            {!fbUrl && !socialLinks.length && (
              <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-500/40 px-3 py-2 text-xs text-slate-400">
                <MessageCircle size={14} />
                Social links will appear here
              </div>
            )}
          </div>
        </div>
      </div>
      <p className="mx-auto mt-8 max-w-7xl border-t border-white/10 px-4 pt-5 text-xs text-slate-500 sm:px-6 lg:px-8">{photos}</p>
    </footer>
  )
}
