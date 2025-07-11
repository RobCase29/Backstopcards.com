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
}

export interface SleeperRoster {
  roster_id: number;
  owner_id: string;
  players: string[];
  starters: string[];
  settings: Record<string, unknown>;
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