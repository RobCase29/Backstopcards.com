"use client";

import { useState, useEffect } from "react";
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
  const [success, setSuccess] = useState(false);

  const currentSeason = new Date().getFullYear().toString();

  // Remember username in localStorage
  useEffect(() => {
    const saved = localStorage.getItem("sleeper_username");
    if (saved) setUsername(saved);
  }, []);
  useEffect(() => {
    if (username) localStorage.setItem("sleeper_username", username);
  }, [username]);

  async function handleFetch(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setError("");
    setSuccess(false);
    setLoading(true);
    setUser(null);
    setLeagues([]);
    setRosters({});
    try {
      const userData = await getSleeperUser(username);
      if (!userData) {
        setError("User not found. Double-check your username or ");
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
      setSuccess(true);
    } catch (e) {
      setError("Failed to fetch data. Please try again later.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 p-6">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-xl p-8 mb-10 border border-blue-100">
        <h1 className="text-3xl md:text-4xl font-extrabold text-blue-900 mb-2 text-center">
          Sync Your Sleeper Leagues
        </h1>
        <p className="text-lg text-blue-700 mb-6 text-center">
          Enter your Sleeper username to instantly view all your leagues and rosters.<br />
          <span className="text-blue-500 underline cursor-pointer" onClick={() => window.open('https://sleeper.com/', '_blank')}>What’s my Sleeper username?</span>
        </p>
        <form onSubmit={handleFetch} className="flex flex-col sm:flex-row gap-4 items-center justify-center">
          <input
            type="text"
            placeholder="e.g. dynastyKing123"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="border-2 border-blue-300 rounded-lg px-4 py-3 flex-1 text-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-500 transition"
            disabled={loading}
            autoFocus
            required
          />
          <button
            type="submit"
            className={`bg-blue-600 text-white px-8 py-3 rounded-lg font-bold text-lg shadow hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${loading ? 'animate-pulse' : ''}`}
            disabled={loading || !username}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                Fetching…
              </span>
            ) : (
              "Sync"
            )}
          </button>
        </form>
        {error && (
          <div className="text-red-600 mt-4 text-center">
            {error}
            <a
              href="https://support.sleeper.com/en/articles/2320542-how-do-i-find-my-username"
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-blue-600 ml-1"
            >
              Need help?
            </a>
          </div>
        )}
        {success && user && (
          <div className="mt-6 flex flex-col items-center">
            <div className="flex items-center gap-4 mb-2">
              {user.avatar && (
                <img
                  src={`https://sleepercdn.com/avatars/thumbs/${user.avatar}`}
                  alt="avatar"
                  className="w-16 h-16 rounded-full border-2 border-blue-400 shadow"
                />
              )}
              <div>
                <div className="font-bold text-xl text-blue-900">Welcome, {user.display_name || user.username}!</div>
                <div className="text-blue-500 text-sm">Sleeper ID: {user.user_id}</div>
              </div>
            </div>
            <div className="text-green-600 font-semibold mt-2">Leagues synced successfully!</div>
          </div>
        )}
      </div>

      {leagues.length > 0 && (
        <div className="max-w-4xl mx-auto">
          <h3 className="text-2xl font-bold mb-6 text-blue-900 text-center">Your Leagues</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {leagues.map((league) => (
              <div key={league.league_id} className="bg-white rounded-xl shadow p-6 border border-blue-100 hover:shadow-lg transition">
                <div className="flex items-center gap-3 mb-2">
                  {league.avatar && (
                    <img
                      src={`https://sleepercdn.com/avatars/thumbs/${league.avatar}`}
                      alt="league avatar"
                      className="w-10 h-10 rounded"
                    />
                  )}
                  <div className="font-semibold text-lg text-blue-800">{league.name}</div>
                  <span className="ml-auto text-xs text-blue-400">Season: {league.season}</span>
                </div>
                <div className="text-sm text-blue-600 mb-2">
                  Rosters: {league.total_rosters} | Positions: {league.roster_positions.join(", ")}
                </div>
                <div className="text-sm font-bold mb-1 text-blue-900">Your Roster:</div>
                <ul className="text-sm text-blue-900 mb-2 flex flex-wrap gap-2">
                  {(rosters[league.league_id] || [])
                    .filter((r) => r.owner_id === user?.user_id)
                    .flatMap((r) => r.players)
                    .map((playerId) => (
                      <li key={playerId} className="bg-blue-100 rounded px-2 py-1 font-mono text-xs">
                        {playerId}
                      </li>
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