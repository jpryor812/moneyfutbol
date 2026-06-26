export function playerSlug(name: string): string {
  return encodeURIComponent(name)
}

export function playerNameFromSlug(slug: string | undefined): string | null {
  if (!slug) return null
  try {
    return decodeURIComponent(slug)
  } catch {
    return null
  }
}

export function playerPath(studySlug: string, name: string): string {
  return `/${studySlug}/player/${playerSlug(name)}`
}
