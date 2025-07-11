"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import {
  getSleeperUser,
  getSleeperLeagues,
  getSleeperRosters,
  getSleeperUsers,
  getSleeperMatchups,
  getSleeperNFLState,
  getSleeperTrendingPlayers,
  SleeperUser,
  SleeperLeague,
  SleeperRoster,
  SleeperMatchup,
  SleeperNFLState,
  SleeperTrendingPlayer,
} from "@/services/sleeperApi";
import { analyticsService, RosterAnalytics, MatchupAnalytics, LeagueAnalytics } from "@/services/analyticsService";

interface LeagueData {
  league: SleeperLeague;
  rosters: SleeperRoster[];
  users: SleeperUser[];
  matchups: SleeperMatchup[];
  analytics: LeagueAnalytics | null;
  rosterAnalytics: RosterAnalytics[];
  matchupAnalytics: MatchupAnalytics[];
}

// Add skeleton components at the top of the file
function SkeletonCard({ className = "" }) {
  return (
    <div className={`bg-white rounded-xl shadow-lg p-6 animate-pulse ${className}`}>
      <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
      <div className="h-10 bg-gray-100 rounded w-2/3 mb-2"></div>
      <div className="h-4 bg-gray-100 rounded w-1/2"></div>
    </div>
  );
}
function SkeletonList({ count = 3 }) {
  return (
    <div className="space-y-3">
      {[...Array(count)].map((_, i) => (
        <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse"></div>
      ))}
    </div>
  );
}

// Add a helper to determine if it's the offseason
function isOffseason(nflState: SleeperNFLState | null) {
  if (!nflState) return false;
  return nflState.season_type === 'off' || nflState.season_type === 'post' || nflState.season_type === 'pre';
}

export default function FantasyDashboard() {
  const [username, setUsername] = useState("");
  const [user, setUser] = useState<SleeperUser | null>(null);
  const [leagues, setLeagues] = useState<SleeperLeague[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<LeagueData | null>(null);
  const [nflState, setNFLState] = useState<SleeperNFLState | null>(null);
  const [trendingPlayers, setTrendingPlayers] = useState<SleeperTrendingPlayer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<'overview' | 'rosters' | 'matchups' | 'analytics' | 'trades' | 'adddrop'>('overview');
  const [currentWeek, setCurrentWeek] = useState(1);
  const [seasonMode, setSeasonMode] = useState<'offseason' | 'inseason'>('inseason');

  // Refactor state for progressive loading
  const [leagueAnalytics, setLeagueAnalytics] = useState<LeagueAnalytics | null>(null);
  const [rosterAnalytics, setRosterAnalytics] = useState<RosterAnalytics[] | null>(null);
  const [matchupAnalytics, setMatchupAnalytics] = useState<MatchupAnalytics[] | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState({ league: false, rosters: false, matchups: false });

  // Add at the top of the FantasyDashboard component:
  const [selectedRosterId, setSelectedRosterId] = useState<number | null>(null);

  // Load saved username on component mount
  useEffect(() => {
    const savedUsername = localStorage.getItem("sleeperUsername");
    if (savedUsername) {
      setUsername(savedUsername);
    }
  }, []);

  // Fetch NFL state and trending players on mount
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [nflData, trendingData] = await Promise.all([
          getSleeperNFLState(),
          getSleeperTrendingPlayers('add', 24, 10)
        ]);
        
        setNFLState(nflData);
        setTrendingPlayers(trendingData);
        
        if (nflData) {
          setCurrentWeek(nflData.week);
        }
      } catch (err) {
        console.error('Failed to fetch initial data:', err);
      }
    };

    fetchInitialData();
  }, []);

  // Update nflState effect to set seasonMode
  useEffect(() => {
    if (nflState) {
      setSeasonMode(isOffseason(nflState) ? 'offseason' : 'inseason');
    }
  }, [nflState]);

  const handleSync = async () => {
    if (!username.trim()) return;

    setLoading(true);
    setError("");

    try {
      // Save username to localStorage
      localStorage.setItem("sleeperUsername", username);

      // Fetch user data
      const userData = await getSleeperUser(username);
      if (!userData) {
        setError("User not found. Please check your username.");
        return;
      }

      setUser(userData);

      // Fetch leagues for current season
      const currentSeason = nflState?.season || new Date().getFullYear().toString();
      const leaguesData = await getSleeperLeagues(userData.user_id, currentSeason);
      setLeagues(leaguesData);

      if (leaguesData.length > 0) {
        // Auto-select first league and load its data
        await loadLeagueData(leaguesData[0]);
      }
    } catch {
      setError("Failed to fetch data. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  const loadLeagueData = async (league: SleeperLeague) => {
    setLoading(true);
    setError("");
    setLeagueAnalytics(null);
    setRosterAnalytics(null);
    setMatchupAnalytics(null);
    setAnalyticsLoading({ league: true, rosters: true, matchups: true });
    try {
      const [rosters, users, matchups] = await Promise.all([
        getSleeperRosters(league.league_id),
        getSleeperUsers(league.league_id),
        getSleeperMatchups(league.league_id, currentWeek)
      ]);
      setSelectedLeague({ league, rosters, users, matchups, analytics: null, rosterAnalytics: [], matchupAnalytics: [] });
      // Progressive analytics loading
      analyticsService.analyzeLeague(league)
        .then((data) => setLeagueAnalytics(data))
        .catch((err) => { setError('Failed to analyze league.'); console.error(err); })
        .finally(() => setAnalyticsLoading(a => ({ ...a, league: false })));
      Promise.all(
        rosters.map(async (roster) => {
          const owner = users.find(u => u.user_id === roster.owner_id);
          return analyticsService.analyzeRoster(roster, league, owner?.display_name || 'Unknown');
        })
      )
        .then((data) => setRosterAnalytics(data))
        .catch((err) => { setError('Failed to analyze rosters.'); console.error(err); })
        .finally(() => setAnalyticsLoading(a => ({ ...a, rosters: false })));
      analyticsService.analyzeMatchup(matchups, currentWeek)
        .then((data) => setMatchupAnalytics(data))
        .catch((err) => { setError('Failed to analyze matchups.'); console.error(err); })
        .finally(() => setAnalyticsLoading(a => ({ ...a, matchups: false })));
    } catch (err) {
      setError("Failed to load league data.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleLeagueSelect = (league: SleeperLeague) => {
    loadLeagueData(league);
  };

  const formatNumber = (num: number): string => {
    return num.toLocaleString();
  };

  const getPositionColor = (position: string): string => {
    const colors: Record<string, string> = {
      QB: 'bg-red-100 text-red-800',
      RB: 'bg-green-100 text-green-800',
      WR: 'bg-blue-100 text-blue-800',
      TE: 'bg-yellow-100 text-yellow-800',
      K: 'bg-purple-100 text-purple-800',
      DEF: 'bg-gray-100 text-gray-800',
    };
    return colors[position] || 'bg-gray-100 text-gray-800';
  };

  const getRiskColor = (risk: string): string => {
    const colors: Record<string, string> = {
      Low: 'text-green-600',
      Medium: 'text-yellow-600',
      High: 'text-red-600',
    };
    return colors[risk] || 'text-gray-600';
  };

  // Add state for playerMap
  const [playerMap, setPlayerMap] = useState<Record<string, any> | null>(null);

  // On mount, fetch player map from analyticsService
  useEffect(() => {
    async function fetchPlayers() {
      if (analyticsService && analyticsService.initializeData) {
        await analyticsService.initializeData();
        // @ts-ignore
        setPlayerMap(analyticsService.players);
      }
    }
    fetchPlayers();
  }, []);


  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              🏈 Fantasy Football Analytics Hub
            </h1>
            <p className="text-xl text-gray-600">
              Get incredible insights into your Sleeper leagues
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-8 max-w-md mx-auto">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
              Connect Your Sleeper Account
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sleeper Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your Sleeper username"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  onKeyPress={(e) => e.key === 'Enter' && handleSync()}
                />
              </div>

              <button
                onClick={handleSync}
                disabled={loading || !username.trim()}
                className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Syncing...
                  </div>
                ) : (
                  'Sync My Leagues'
                )}
              </button>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
                  {error}
                </div>
              )}

              <div className="text-center">
                <a
                  href="https://sleeper.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 text-sm"
                >
                                     Don&apos;t have a Sleeper account? Create one here →
                </a>
              </div>
            </div>
          </div>

          {/* NFL State Info */}
          {nflState && (
            <div className="mt-8 bg-white rounded-xl shadow-lg p-6 max-w-md mx-auto">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">NFL Season Info</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Current Week:</span>
                  <span className="font-medium ml-2">{nflState.week}</span>
                </div>
                <div>
                  <span className="text-gray-600">Season:</span>
                  <span className="font-medium ml-2">{nflState.season}</span>
                </div>
                <div>
                  <span className="text-gray-600">Season Type:</span>
                  <span className="font-medium ml-2 capitalize">{nflState.season_type}</span>
                </div>
              </div>
            </div>
          )}

          {/* Trending Players */}
          {trendingPlayers.length > 0 && (
            <div className="mt-8 bg-white rounded-xl shadow-lg p-6 max-w-md mx-auto">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">🔥 Trending Adds</h3>
              <div className="space-y-2">
                {trendingPlayers.slice(0, 5).map((player, index) => (
                  <div key={player.player_id} className="flex justify-between items-center text-sm">
                    <span className="font-medium">#{index + 1}</span>
                    <span className="text-gray-600">{player.count} adds</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="bg-white rounded-xl shadow-lg p-8 flex items-center space-x-4">
          <svg className="animate-spin h-8 w-8 text-blue-500" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          <span className="text-xl font-medium text-gray-900">Loading analytics...</span>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="bg-white rounded-xl shadow-lg p-8 flex flex-col items-center space-y-4">
          <span className="text-xl font-medium text-red-600">{error}</span>
          <button
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }

  // Reorder and relabel tabs
  const mainTabs = [
    { id: 'adddrop', label: '🚀 Add/Drop Alpha', icon: '🚀' },
    { id: 'trades', label: '🔄 Trade Center', icon: '🔄' },
  ];
  const secondaryTabs = [
    { id: 'overview', label: '📊 Overview', icon: '📊' },
    { id: 'rosters', label: '👥 Rosters', icon: '👥' },
    { id: 'matchups', label: '⚔️ Matchups', icon: '⚔️' },
    { id: 'analytics', label: '📈 Analytics', icon: '📈' },
  ];
  const visibleTabs = seasonMode === 'offseason' ? mainTabs.concat([{ id: 'overview', label: '📊 Overview', icon: '📊' }]) : mainTabs.concat(secondaryTabs);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {user.avatar && (
                <Image
                  src={`https://sleepercdn.com/avatars/thumbs/${user.avatar}`}
                  alt="avatar"
                  width={64}
                  height={64}
                  className="w-16 h-16 rounded-full border-2 border-blue-400 shadow"
                />
              )}
            <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {user.display_name || user.username}
                </h1>
                <p className="text-gray-600">
                  {leagues.length} league{leagues.length !== 1 ? 's' : ''} • Week {currentWeek}
                </p>
              </div>
            </div>
            <button
              onClick={() => setUser(null)}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
            >
              Switch User
              </button>
            </div>
          </div>

        {/* League Selection */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Your Leagues</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {leagues.map((league) => (
              <div
                key={league.league_id}
                onClick={() => handleLeagueSelect(league)}
                className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                  selectedLeague?.league.league_id === league.league_id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  {league.avatar && (
                    <Image
                      src={`https://sleepercdn.com/avatars/thumbs/${league.avatar}`}
                      alt="league avatar"
                      width={40}
                      height={40}
                      className="w-10 h-10 rounded"
                    />
                  )}
                  <div>
                    <h3 className="font-semibold text-gray-900">{league.name}</h3>
                    <p className="text-sm text-gray-600">
                      {league.total_rosters} teams • {league.season}
                    </p>
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>

        {/* League Analytics Dashboard */}
        {selectedLeague && (
          <>
            {/* Banner for season mode */}
            <div className="mb-4">
              <div className={`rounded-lg px-4 py-3 text-center font-semibold shadow-md ${seasonMode === 'offseason' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                {seasonMode === 'offseason' ? 'Offseason Mode: Focus on add/drop alpha and trade opportunities!' : 'In-Season Mode: Weekly matchups, start/sit, and playoff odds are live!'}
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
              <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
                {visibleTabs.map((tab) => (
                <button
                  key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${activeTab === tab.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'}`}
                  >
                    {tab.label}
                </button>
              ))}
              </div>
            </div>

            {/* Tab Content */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* League Overview Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {analyticsLoading.league || !leagueAnalytics ? (
                    <>
                      <SkeletonCard />
                      <SkeletonCard />
                      <SkeletonCard />
                      <SkeletonCard />
                    </>
                  ) : (
                    <>
                      <div className="bg-white rounded-xl shadow-lg p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">League Health</h3>
                        <div className="text-3xl font-bold text-green-600">
                          {leagueAnalytics?.competitiveness || 0}%
                        </div>
                        <p className="text-sm text-gray-600">Competitiveness Score</p>
                      </div>
                      
                      <div className="bg-white rounded-xl shadow-lg p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">Parity</h3>
                        <div className="text-3xl font-bold text-blue-600">
                          {leagueAnalytics?.parityScore || 0}%
                        </div>
                        <p className="text-sm text-gray-600">League Balance</p>
                      </div>
                      
                      <div className="bg-white rounded-xl shadow-lg p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">Experience</h3>
                        <div className="text-3xl font-bold text-purple-600">
                          {leagueAnalytics?.averageExperience || 0}
                        </div>
                        <p className="text-sm text-gray-600">Avg Years</p>
                      </div>
                      
                      <div className="bg-white rounded-xl shadow-lg p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">Activity</h3>
                        <div className="text-3xl font-bold text-orange-600">
                          {leagueAnalytics?.mostActiveTraders.length || 0}
                        </div>
                        <p className="text-sm text-gray-600">Active Traders</p>
                      </div>
                    </>
                  )}
                </div>

                {/* Power Rankings */}
                <div className="bg-white rounded-xl shadow-lg p-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-4">🏆 Power Rankings</h3>
                  {analyticsLoading.rosters || !rosterAnalytics ? (
                    <SkeletonList count={5} />
                  ) : (
                    <div className="space-y-3">
                      {rosterAnalytics
                        .sort((a, b) => b.powerRanking - a.powerRanking)
                        .map((roster, index) => (
                          <div key={roster.roster_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                                index === 0 ? 'bg-yellow-100 text-yellow-800' :
                                index === 1 ? 'bg-gray-100 text-gray-800' :
                                index === 2 ? 'bg-orange-100 text-orange-800' :
                                'bg-blue-100 text-blue-800'
                              }`}>
                                {index + 1}
                              </div>
                              <div>
                                <div className="font-semibold text-gray-900">{roster.owner_name}</div>
                                <div className="text-sm text-gray-600">
                                  {roster.projectedPoints.toFixed(1)} proj pts
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-bold text-lg">{roster.powerRanking}</div>
                              <div className="text-sm text-gray-600">
                                {roster.playoffOdds}% playoffs
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                {/* Trade Market */}
                <div className="bg-white rounded-xl shadow-lg p-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-4">🔥 Trade Market</h3>
                  {analyticsLoading.league || !leagueAnalytics ? (
                    <SkeletonList count={3} />
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div>
                        <h4 className="font-semibold text-gray-900 mb-2">Hot Commodities</h4>
                        <div className="space-y-2">
                          {(leagueAnalytics?.tradeMarket.hotCommodities || []).map((player, index) => (
                            <div key={index} className="text-sm text-gray-600 bg-red-50 p-2 rounded">
                              {player}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900 mb-2">Buy Low</h4>
                        <div className="space-y-2">
                          {(leagueAnalytics?.tradeMarket.buyLowCandidates || []).map((player, index) => (
                            <div key={index} className="text-sm text-gray-600 bg-green-50 p-2 rounded">
                              {player}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900 mb-2">Sell High</h4>
                        <div className="space-y-2">
                          {(leagueAnalytics?.tradeMarket.sellHighCandidates || []).map((player, index) => (
                            <div key={index} className="text-sm text-gray-600 bg-blue-50 p-2 rounded">
                              {player}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'rosters' && selectedLeague && playerMap && (
              <div className="space-y-8">
                {selectedLeague.rosters.map((roster) => {
                  const owner = selectedLeague.users.find(u => u.user_id === roster.owner_id);
                  const allPlayers = roster.players.map(pid => playerMap[pid]).filter(Boolean);
                  return (
                    <div key={roster.roster_id} className="bg-white rounded-xl shadow p-6 border border-gray-200">
                      <div className="flex items-center gap-3 mb-4">
                        {owner?.avatar && (
                          <img src={`https://sleepercdn.com/avatars/thumbs/${owner.avatar}`} alt="avatar" className="w-8 h-8 rounded-full border border-gray-300" />
                        )}
                        <span className="text-lg font-bold text-gray-900">{owner?.display_name || 'Unknown Owner'}</span>
                        <span className="ml-auto text-xs text-gray-400">Roster ID: {roster.roster_id}</span>
                      </div>
                      <ul className="divide-y divide-gray-100">
                        {allPlayers.length === 0 && <li className="text-gray-400">No players found for this roster.</li>}
                        {allPlayers.map(player => (
                          <li key={player.player_id} className="py-2 flex items-center gap-4">
                            <span className="font-medium text-gray-900">{player.full_name || `${player.first_name} ${player.last_name}`}</span>
                            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${getPositionColor(player.position)}`}>{player.position}</span>
                            <span className="text-xs text-gray-500">{player.team}</span>
                            <span className="ml-auto text-sm text-blue-700 font-semibold">Proj: {player.projected_points || '--'}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === 'matchups' && (
              <div className="space-y-6">
                <div className="bg-white rounded-xl shadow-lg p-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-4">Week {currentWeek} Matchups</h3>
                  <div className="space-y-4">
                    {selectedLeague.matchupAnalytics.map((matchup) => (
                      <div key={matchup.matchup_id} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-4">
                          <div className="text-center flex-1">
                            <div className="font-semibold text-gray-900">
                              {selectedLeague.users.find(u => u.user_id === selectedLeague.rosters.find(r => r.roster_id === matchup.team1.roster_id)?.owner_id)?.display_name || 'Team 1'}
                            </div>
                            <div className="text-2xl font-bold text-blue-600">{matchup.team1.projectedPoints.toFixed(1)}</div>
                            <div className="text-sm text-gray-600">{matchup.team1.winProbability}% win chance</div>
                          </div>
                          
                          <div className="text-center px-4">
                            <div className="text-lg font-bold text-gray-900">VS</div>
                            <div className="text-sm text-gray-600">
                              {matchup.closenessRating}% close
                            </div>
                          </div>
                          
                          <div className="text-center flex-1">
                            <div className="font-semibold text-gray-900">
                              {selectedLeague.users.find(u => u.user_id === selectedLeague.rosters.find(r => r.roster_id === matchup.team2.roster_id)?.owner_id)?.display_name || 'Team 2'}
                            </div>
                            <div className="text-2xl font-bold text-blue-600">{matchup.team2.projectedPoints.toFixed(1)}</div>
                            <div className="text-sm text-gray-600">{matchup.team2.winProbability}% win chance</div>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                          <div>
                            <h4 className="font-semibold text-gray-900 mb-2">Team 1 Analysis</h4>
                            <div className="space-y-1">
                              <div><span className="text-green-600">Advantages:</span> {matchup.team1.advantages.join(', ')}</div>
                              <div><span className="text-red-600">Concerns:</span> {matchup.team1.concerns.join(', ')}</div>
                              <div><span className="text-blue-600">Key Players:</span> {matchup.team1.keyPlayers.join(', ')}</div>
                            </div>
                          </div>
                          
                          <div>
                            <h4 className="font-semibold text-gray-900 mb-2">Team 2 Analysis</h4>
                            <div className="space-y-1">
                              <div><span className="text-green-600">Advantages:</span> {matchup.team2.advantages.join(', ')}</div>
                              <div><span className="text-red-600">Concerns:</span> {matchup.team2.concerns.join(', ')}</div>
                              <div><span className="text-blue-600">Key Players:</span> {matchup.team2.keyPlayers.join(', ')}</div>
                            </div>
                          </div>
                        </div>
                        
                        {matchup.upsetPotential > 30 && (
                          <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm">
                            <span className="text-yellow-800">⚡ Upset Alert: {matchup.upsetPotential}% chance of upset</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'analytics' && (
              <div className="space-y-6">
                <div className="bg-white rounded-xl shadow-lg p-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-4">📊 Advanced Analytics</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-3">Playoff Picture</h4>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                          <span className="text-sm">Locked In: {selectedLeague.analytics?.playoffPicture.locked.length || 0} teams</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                          <span className="text-sm">Competing: {selectedLeague.analytics?.playoffPicture.competing.length || 0} teams</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                          <span className="text-sm">Eliminated: {selectedLeague.analytics?.playoffPicture.eliminated.length || 0} teams</span>
                        </div>
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-3">League Trends</h4>
                      <div className="space-y-2 text-sm">
                        <div>Most Active Traders: {selectedLeague.analytics?.mostActiveTraders.join(', ') || 'None'}</div>
                        <div>Waiver Wire Active: {selectedLeague.analytics?.waiversMostActive.join(', ') || 'None'}</div>
                        <div>Competitiveness: {selectedLeague.analytics?.competitiveness || 0}%</div>
                        <div>Parity Score: {selectedLeague.analytics?.parityScore || 0}%</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-lg p-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-4">🎯 Position Strength Analysis</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {selectedLeague.rosterAnalytics.map((roster) => (
                      <div key={roster.roster_id} className="border border-gray-200 rounded-lg p-4">
                        <h4 className="font-semibold text-gray-900 mb-2">{roster.owner_name}</h4>
                        <div className="space-y-2">
                          {Object.entries(roster.strengthByPosition).map(([position, strength]) => (
                            <div key={position} className="flex items-center justify-between">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${getPositionColor(position)}`}>
                                {position}
                              </span>
                              <div className="flex items-center gap-2">
                                <div className="w-16 bg-gray-200 rounded-full h-2">
                                  <div 
                                    className="bg-blue-600 h-2 rounded-full" 
                                    style={{ width: `${Math.min(strength, 100)}%` }}
                                  ></div>
                                </div>
                                <span className="text-sm text-gray-600">{strength}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'adddrop' && (
              <div className="space-y-6">
                <div className="bg-white rounded-xl shadow-lg p-6">
                  <h2 className="text-2xl font-bold text-blue-900 mb-2">🚀 Add/Drop Alpha</h2>
                  <p className="text-gray-700 mb-4">Find the best waiver wire pickups and drop candidates for maximum edge, even in the offseason.</p>
                  {/* TODO: Add trending adds, undervalued players, drop candidates, and actionable insights here */}
                  <SkeletonList count={5} />
                </div>
              </div>
            )}

            {activeTab === 'trades' && (
              <div className="space-y-6">
                <div className="bg-white rounded-xl shadow-lg p-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-4">🔄 Trade Center</h3>
                  
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                    <h4 className="font-semibold text-blue-900 mb-2">Trade Analyzer Coming Soon!</h4>
                    <p className="text-blue-800 text-sm">
                      Upload potential trades to get instant analysis on fairness, roster fit, and future impact.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-3">Trade Recommendations</h4>
                      <div className="space-y-3">
                        {selectedLeague.rosterAnalytics.map((roster) => (
                          <div key={roster.roster_id} className="border border-gray-200 rounded-lg p-3">
                            <div className="font-medium text-gray-900">{roster.owner_name}</div>
                            <div className="text-sm text-gray-600 mt-1">
                              Should target: {roster.tradeTargets.join(', ')}
                            </div>
                            <div className="text-sm text-gray-600">
                              Consider dropping: {roster.dropCandidates.join(', ')}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-3">Market Analysis</h4>
                      <div className="space-y-4">
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                          <h5 className="font-medium text-red-900">Hot Commodities</h5>
                          <div className="text-sm text-red-800 mt-1">
                            {selectedLeague.analytics?.tradeMarket.hotCommodities.join(', ') || 'None identified'}
                          </div>
                        </div>
                        
                        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                          <h5 className="font-medium text-green-900">Buy Low Candidates</h5>
                          <div className="text-sm text-green-800 mt-1">
                            {selectedLeague.analytics?.tradeMarket.buyLowCandidates.join(', ') || 'None identified'}
          </div>
        </div>

                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                          <h5 className="font-medium text-blue-900">Sell High Candidates</h5>
                          <div className="text-sm text-blue-800 mt-1">
                            {selectedLeague.analytics?.tradeMarket.sellHighCandidates.join(', ') || 'None identified'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {seasonMode === 'offseason' && (activeTab === 'matchups' || activeTab === 'analytics') && (
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-6 rounded-xl text-yellow-800 text-center font-semibold mb-6">
                These features are most relevant during the NFL season. Check back when games are live!
              </div>
            )}
          </>
        )}

        {loading && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 flex items-center gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="text-gray-900">Loading analytics...</span>
            </div>
        </div>
        )}
      </div>
    </div>
  );
} 