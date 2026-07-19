import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Normalize a user-typed link into a safe, openable absolute URL. Adds https://
 * when no scheme is present and only allows http(s) — returns null for anything
 * that can't be parsed or uses a disallowed scheme (e.g. javascript:).
 */
export function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`
  try {
    const url = new URL(withScheme)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    return url.href
  } catch {
    return null
  }
}

/** A short, human-friendly label for a URL (host + trimmed path). */
export function prettyUrl(raw: string): string {
  const normalized = normalizeUrl(raw)
  if (!normalized) return raw
  try {
    const url = new URL(normalized)
    const path = url.pathname === "/" ? "" : url.pathname
    return (url.host + path + url.search).replace(/\/$/, "")
  } catch {
    return raw
  }
}
