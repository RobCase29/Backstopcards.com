export interface SleeperUser {
  user_id: string;
  username: string;
  display_name: string;
  avatar: string | null;
}

export interface SleeperLeague {
  league_id: string;
  name: string;
  season: string;
  avatar: string | null;
  total_rosters: number;
  roster_positions: string[];
  status: string;
  sport: string;
  season_type: string;
  scoring_settings: Record<string, unknown>;
  settings: Record<string, unknown>;
  previous_league_id?: string;
  draft_id?: string;
}

export interface SleeperRoster {
  roster_id: number;
  owner_id: string;
  players: string[];
  starters: string[];
  settings: Record<string, unknown>;
  reserve?: string[];
  taxi?: string[];
  co_owners?: string[];
}

export interface SleeperPlayer {
  player_id: string;
  first_name: string;
  last_name: string;
  full_name?: string;
  position: string;
  team: string;
  age?: number;
  height?: string;
  weight?: string;
  college?: string;
  years_exp?: number;
  status: string;
  injury_status?: string;
  fantasy_positions: string[];
  number?: number;
  depth_chart_position?: number;
  depth_chart_order?: number;
  search_rank?: number;
  hashtag?: string;
  birth_date?: string;
  rookie_year?: number;
  practice_participation?: string;
  injury_start_date?: string;
  injury_notes?: string;
  news_updated?: number;
  fantasy_data_id?: number;
  rotowire_id?: number;
  rotoworld_id?: number;
  espn_id?: number;
  yahoo_id?: number;
  sportradar_id?: string;
  stats_id?: string;
}

export interface SleeperMatchup {
  roster_id: number;
  matchup_id: number;
  starters: string[];
  players: string[];
  points: number;
  custom_points?: number;
  players_points?: Record<string, number>;
  starters_points?: Record<string, number>;
}

export interface SleeperTransaction {
  transaction_id: string;
  type: string;
  status: string;
  roster_ids: number[];
  leg: number;
  created: number;
  status_updated: number;
  creator: string;
  consenter_ids: number[];
  adds?: Record<string, number>;
  drops?: Record<string, number>;
  draft_picks?: SleeperDraftPick[];
  waiver_budget?: SleeperWaiverBudget[];
  settings?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface SleeperDraftPick {
  season: string;
  round: number;
  roster_id: number;
  previous_owner_id: number;
  owner_id: number;
}

export interface SleeperWaiverBudget {
  sender: number;
  receiver: number;
  amount: number;
}

export interface SleeperNFLState {
  week: number;
  season_type: string;
  season_start_date: string;
  season: string;
  previous_season: string;
  leg: number;
  league_season: string;
  league_create_season: string;
  display_week: number;
}

export interface SleeperTrendingPlayer {
  player_id: string;
  count: number;
}

export interface SleeperPlayoffBracket {
  r: number; // round
  m: number; // match id
  t1: number | null; // team 1 roster id
  t2: number | null; // team 2 roster id
  w: number | null; // winner roster id
  l: number | null; // loser roster id
  t1_from?: { w?: number; l?: number };
  t2_from?: { w?: number; l?: number };
  p?: number; // position (for consolation bracket)
}

const SLEEPER_API_BASE = 'https://api.sleeper.app/v1';

export async function getSleeperUser(username: string): Promise<SleeperUser | null> {
  const res = await fetch(`${SLEEPER_API_BASE}/user/${username}`);
  if (!res.ok) return null;
  return res.json();
}

export async function getSleeperLeagues(userId: string, season: string): Promise<SleeperLeague[]> {
  const res = await fetch(`${SLEEPER_API_BASE}/user/${userId}/leagues/nfl/${season}`);
  if (!res.ok) return [];
  return res.json();
}

export async function getSleeperRosters(leagueId: string): Promise<SleeperRoster[]> {
  const res = await fetch(`${SLEEPER_API_BASE}/league/${leagueId}/rosters`);
  if (!res.ok) return [];
  return res.json();
}

export async function getSleeperLeague(leagueId: string): Promise<SleeperLeague | null> {
  const res = await fetch(`${SLEEPER_API_BASE}/league/${leagueId}`);
  if (!res.ok) return null;
  return res.json();
}

export async function getSleeperUsers(leagueId: string): Promise<SleeperUser[]> {
  const res = await fetch(`${SLEEPER_API_BASE}/league/${leagueId}/users`);
  if (!res.ok) return [];
  return res.json();
}

export async function getSleeperMatchups(leagueId: string, week: number): Promise<SleeperMatchup[]> {
  const res = await fetch(`${SLEEPER_API_BASE}/league/${leagueId}/matchups/${week}`);
  if (!res.ok) return [];
  return res.json();
}

export async function getSleeperTransactions(leagueId: string, week: number): Promise<SleeperTransaction[]> {
  const res = await fetch(`${SLEEPER_API_BASE}/league/${leagueId}/transactions/${week}`);
  if (!res.ok) return [];
  return res.json();
}

export async function getSleeperTradedPicks(leagueId: string): Promise<SleeperDraftPick[]> {
  const res = await fetch(`${SLEEPER_API_BASE}/league/${leagueId}/traded_picks`);
  if (!res.ok) return [];
  return res.json();
}

export async function getSleeperPlayoffBracket(leagueId: string, type: 'winners' | 'losers'): Promise<SleeperPlayoffBracket[]> {
  const res = await fetch(`${SLEEPER_API_BASE}/league/${leagueId}/${type}_bracket`);
  if (!res.ok) return [];
  return res.json();
}

export async function getSleeperNFLState(): Promise<SleeperNFLState | null> {
  const res = await fetch(`${SLEEPER_API_BASE}/state/nfl`);
  if (!res.ok) return null;
  return res.json();
}

export async function getSleeperPlayers(): Promise<Record<string, SleeperPlayer> | null> {
  const res = await fetch(`${SLEEPER_API_BASE}/players/nfl`);
  if (!res.ok) return null;
  return res.json();
}

export async function getSleeperTrendingPlayers(type: 'add' | 'drop', lookbackHours = 24, limit = 25): Promise<SleeperTrendingPlayer[]> {
  const res = await fetch(`${SLEEPER_API_BASE}/players/nfl/trending/${type}?lookback_hours=${lookbackHours}&limit=${limit}`);
  if (!res.ok) return [];
  return res.json();
} 