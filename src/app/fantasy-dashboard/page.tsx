"use client";

import { useState } from "react";
import {
  getSleeperUser,
  getSleeperLeagues,
  getSleeperRosters,
  SleeperUser,
  SleeperLeague,
  SleeperRoster,
} from "@/services/sleeperApi";

export default function FantasyDashboard() {
  const [username, setUsername] = useState("");
  const [user, setUser] = useState<SleeperUser | null>(null);
  const [leagues, setLeagues] = useState<SleeperLeague[]>([]);
  const [rosters, setRosters] = useState<Record<string, SleeperRoster[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const currentSeason = new Date().getFullYear().toString();

  async function handleFetch() {
    setError("");
    setLoading(true);
    setUser(null);
    setLeagues([]);
    setRosters({});
    try {
      const userData = await getSleeperUser(username);
      if (!userData) {
        setError("User not found");
        setLoading(false);
        return;
      }
      setUser(userData);
      const leaguesData = await getSleeperLeagues(userData.user_id, currentSeason);
      setLeagues(leaguesData);
      const rostersData: Record<string, SleeperRoster[]> = {};
      for (const league of leaguesData) {
        rostersData[league.league_id] = await getSleeperRosters(league.league_id);
      }
      setRosters(rostersData);
    } catch (e) {
      setError("Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow p-6 mb-8">
        <h2 className="text-2xl font-bold mb-4">Sync Your Sleeper Leagues</h2>
        <div className="flex flex-col sm:flex-row gap-4 items-center">
          <input
            type="text"
            placeholder="Enter your Sleeper username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="border border-gray-300 rounded-lg px-4 py-2 flex-1"
            disabled={loading}
          />
          <button
            onClick={handleFetch}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            disabled={loading || !username}
          >
            {loading ? "Loading..." : "Sync"}
          </button>
        </div>
        {error && <div className="text-red-600 mt-4">{error}</div>}
      </div>

      {user && (
        <div className="max-w-2xl mx-auto bg-white rounded-lg shadow p-6 mb-8">
          <div className="flex items-center gap-4 mb-4">
            {user.avatar && (
              <img
                src={`https://sleepercdn.com/avatars/thumbs/${user.avatar}`}
                alt="avatar"
                className="w-12 h-12 rounded-full"
              />
            )}
            <div>
              <div className="font-bold text-lg">{user.display_name || user.username}</div>
              <div className="text-gray-500 text-sm">Sleeper ID: {user.user_id}</div>
            </div>
          </div>
          <div className="text-gray-700">Leagues found: {leagues.length}</div>
        </div>
      )}

      {leagues.length > 0 && (
        <div className="max-w-4xl mx-auto">
          <h3 className="text-xl font-bold mb-4">Your Leagues</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {leagues.map((league) => (
              <div key={league.league_id} className="bg-white rounded-lg shadow p-4">
                <div className="flex items-center gap-3 mb-2">
                  {league.avatar && (
                    <img
                      src={`https://sleepercdn.com/avatars/thumbs/${league.avatar}`}
                      alt="league avatar"
                      className="w-8 h-8 rounded"
                    />
                  )}
                  <div className="font-semibold">{league.name}</div>
                  <span className="ml-auto text-xs text-gray-500">Season: {league.season}</span>
                </div>
                <div className="text-sm text-gray-600 mb-2">
                  Rosters: {league.total_rosters} | Positions: {league.roster_positions.join(", ")}
                </div>
                <div className="text-sm font-bold mb-1">Your Roster:</div>
                <ul className="text-sm text-gray-800 mb-2">
                  {(rosters[league.league_id] || [])
                    .filter((r) => r.owner_id === user?.user_id)
                    .flatMap((r) => r.players)
                    .map((playerId) => (
                      <li key={playerId}>{playerId}</li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
} 