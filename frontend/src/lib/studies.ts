export type Study = {
  slug: string
  label: string
  shortLabel: string
  csvFile: string
  pullCommand: string
}

export const STUDIES: Study[] = [
  {
    slug: 'bundesliga',
    label: 'Bundesliga LW Study',
    shortLabel: 'Bundesliga',
    csvFile: 'bundesliga_forwards.csv',
    pullCommand: 'python pull_forwards.py --league bundesliga',
  },
  {
    slug: 'ligue1',
    label: 'Ligue 1 LW Study',
    shortLabel: 'Ligue 1',
    csvFile: 'ligue1_forwards.csv',
    pullCommand: 'python pull_forwards.py --league ligue1',
  },
  {
    slug: 'ligue2',
    label: 'Ligue 2 LW Study',
    shortLabel: 'Ligue 2',
    csvFile: 'ligue2_forwards.csv',
    pullCommand: 'python pull_forwards.py --league ligue2',
  },
  {
    slug: 'laliga',
    label: 'La Liga LW Study',
    shortLabel: 'La Liga',
    csvFile: 'laliga_forwards.csv',
    pullCommand: 'python pull_forwards.py --league laliga',
  },
  {
    slug: 'seriea',
    label: 'Serie A LW Study',
    shortLabel: 'Serie A',
    csvFile: 'seriea_forwards.csv',
    pullCommand: 'python pull_forwards.py --league seriea',
  },
  {
    slug: 'premierleague',
    label: 'Premier League LW Study',
    shortLabel: 'Premier League',
    csvFile: 'premierleague_forwards.csv',
    pullCommand: 'python pull_forwards.py --league premierleague',
  },
  {
    slug: 'championship',
    label: 'Championship LW Study',
    shortLabel: 'Championship',
    csvFile: 'championship_forwards.csv',
    pullCommand: 'python pull_forwards.py --league championship',
  },
  {
    slug: 'eredivisie',
    label: 'Eredivisie LW Study',
    shortLabel: 'Eredivisie',
    csvFile: 'eredivisie_forwards.csv',
    pullCommand: 'python pull_forwards.py --league eredivisie',
  },
  {
    slug: 'primeiraliga',
    label: 'Primeira Liga LW Study',
    shortLabel: 'Primeira Liga',
    csvFile: 'primeiraliga_forwards.csv',
    pullCommand: 'python pull_forwards.py --league primeiraliga',
  },
  {
    slug: 'serieb',
    label: 'Serie B LW Study',
    shortLabel: 'Serie B',
    csvFile: 'serieb_forwards.csv',
    pullCommand: 'python pull_forwards.py --league serieb',
  },
  {
    slug: 'segunda',
    label: 'La Liga 2 LW Study',
    shortLabel: 'La Liga 2',
    csvFile: 'segunda_forwards.csv',
    pullCommand: 'python pull_forwards.py --league segunda',
  },
  {
    slug: 'zweite',
    label: '2. Bundesliga LW Study',
    shortLabel: '2. Bundesliga',
    csvFile: 'zweite_forwards.csv',
    pullCommand: 'python pull_forwards.py --league zweite',
  },
  {
    slug: 'proleague',
    label: 'Belgian Pro League LW Study',
    shortLabel: 'Pro League',
    csvFile: 'proleague_forwards.csv',
    pullCommand: 'python pull_forwards.py --league proleague',
  },
  {
    slug: 'austria',
    label: 'Austrian Bundesliga LW Study',
    shortLabel: 'Austrian Bundesliga',
    csvFile: 'austria_forwards.csv',
    pullCommand: 'python pull_forwards.py --league austria',
  },
  {
    slug: 'swiss',
    label: 'Swiss Super League LW Study',
    shortLabel: 'Swiss Super League',
    csvFile: 'swiss_forwards.csv',
    pullCommand: 'python pull_forwards.py --league swiss',
  },
]

export const ALL_STUDIES_SLUG = 'all'

export const ALL_FORWARDS_CSV = 'all_forwards.csv'

export const ALL_STUDIES: Study = {
  slug: ALL_STUDIES_SLUG,
  label: 'All Leagues LW Study',
  shortLabel: 'All',
  csvFile: ALL_FORWARDS_CSV,
  pullCommand: 'cd frontend && npm run sync-data',
}

export function studyBySlug(slug: string | undefined): Study {
  if (slug === ALL_STUDIES_SLUG) return ALL_STUDIES
  return STUDIES.find((s) => s.slug === slug) ?? STUDIES[0]
}

export function isAllStudies(slug: string | undefined): boolean {
  return slug === ALL_STUDIES_SLUG
}
