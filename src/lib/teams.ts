const TEAM_LABELS: Record<string, string> = {
  ARI: 'Arizona Diamondbacks',
  ATH: 'Athletics',
  ATL: 'Atlanta Braves',
  BAL: 'Baltimore Orioles',
  BOS: 'Boston Red Sox',
  CHC: 'Chicago Cubs',
  CWS: 'Chicago White Sox',
  CIN: 'Cincinnati Reds',
  CLE: 'Cleveland Guardians',
  COL: 'Colorado Rockies',
  DET: 'Detroit Tigers',
  FA: 'Free Agent',
  HOU: 'Houston Astros',
  KC: 'Kansas City Royals',
  LAA: 'Los Angeles Angels',
  LAD: 'Los Angeles Dodgers',
  MIA: 'Miami Marlins',
  MIL: 'Milwaukee Brewers',
  MIN: 'Minnesota Twins',
  NYM: 'New York Mets',
  NYY: 'New York Yankees',
  OAK: 'Oakland Athletics',
  PHI: 'Philadelphia Phillies',
  PIT: 'Pittsburgh Pirates',
  SD: 'San Diego Padres',
  SEA: 'Seattle Mariners',
  SF: 'San Francisco Giants',
  STL: 'St. Louis Cardinals',
  TB: 'Tampa Bay Rays',
  TEX: 'Texas Rangers',
  TOR: 'Toronto Blue Jays',
  WSH: 'Washington Nationals',
  WSN: 'Washington Nationals',
}

const TEAM_CODE_ALIASES: Record<string, string> = {
  CHW: 'CWS',
  KCR: 'KC',
  OAK: 'ATH',
  SDP: 'SD',
  SFG: 'SF',
  TBR: 'TB',
  WSH: 'WSN',
}

const TEAM_ALIASES: Record<string, string> = {
  arizona: 'ARI',
  diamondbacks: 'ARI',
  dbacks: 'ARI',
  atlanta: 'ATL',
  braves: 'ATL',
  baltimore: 'BAL',
  orioles: 'BAL',
  boston: 'BOS',
  'red sox': 'BOS',
  redsox: 'BOS',
  cubs: 'CHC',
  'chicago cubs': 'CHC',
  whitesox: 'CWS',
  'white sox': 'CWS',
  'chicago white sox': 'CWS',
  cincinnati: 'CIN',
  reds: 'CIN',
  cleveland: 'CLE',
  guardians: 'CLE',
  colorado: 'COL',
  rockies: 'COL',
  detroit: 'DET',
  tigers: 'DET',
  'free agent': 'FA',
  houston: 'HOU',
  astros: 'HOU',
  royals: 'KC',
  'kansas city': 'KC',
  angels: 'LAA',
  dodgers: 'LAD',
  marlins: 'MIA',
  miami: 'MIA',
  brewers: 'MIL',
  twins: 'MIN',
  mets: 'NYM',
  yankees: 'NYY',
  athletics: 'ATH',
  a: 'ATH',
  phillies: 'PHI',
  pirates: 'PIT',
  padres: 'SD',
  mariners: 'SEA',
  giants: 'SF',
  cardinals: 'STL',
  rays: 'TB',
  rangers: 'TEX',
  jays: 'TOR',
  'blue jays': 'TOR',
  nationals: 'WSN',
  nats: 'WSN',
  washington: 'WSN',
}

function compact(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

function normalizedText(value: string) {
  return compact(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function normalizeTeamCode(value?: string | null) {
  const raw = compact(String(value ?? ''))
  if (!raw) return ''
  const upper = raw.toUpperCase().replace(/[^A-Z]/g, '')
  const canonical = TEAM_CODE_ALIASES[upper] ?? upper
  if (TEAM_LABELS[canonical]) return canonical
  const alias = TEAM_ALIASES[normalizedText(raw)]
  return alias ?? upper
}

export function teamDisplayName(value?: string | null) {
  const code = normalizeTeamCode(value)
  if (!code) return ''
  return TEAM_LABELS[code] ?? compact(String(value ?? code))
}

export function teamShortLabel(value?: string | null) {
  const code = normalizeTeamCode(value)
  if (!code) return ''
  const label = teamDisplayName(code)
  return label ? `${code} / ${label}` : code
}

export function teamSearchText(value?: string | null) {
  const code = normalizeTeamCode(value)
  if (!code) return ''
  const label = teamDisplayName(code)
  return [code, label, normalizedText(label)].filter(Boolean).join(' ')
}

export function compareTeamLabels(left: string, right: string) {
  return teamDisplayName(left).localeCompare(teamDisplayName(right)) || normalizeTeamCode(left).localeCompare(normalizeTeamCode(right))
}
