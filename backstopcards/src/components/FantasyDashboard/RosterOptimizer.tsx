'use client';

import { useState } from 'react';

interface RosterPlayer {
  id: string;
  name: string;
  position: string;
  team: string;
  value: number;
  projectedPoints: number;
  status: 'active' | 'bench' | 'injured';
  recommendation: string;
}

export default function RosterOptimizer() {
  const [selectedLeague, setSelectedLeague] = useState('1');
  const [optimizationType, setOptimizationType] = useState('points');

  // Mock data - replace with actual Sleeper API data
  const mockRoster: RosterPlayer[] = [
    {
      id: '1',
      name: 'Christian McCaffrey',
      position: 'RB',
      team: 'SF',
      value: 8500,
      projectedPoints: 25.5,
      status: 'active',
      recommendation: 'Start',
    },
    {
      id: '2',
      name: 'Tyreek Hill',
      position: 'WR',
      team: 'MIA',
      value: 8200,
      projectedPoints: 22.3,
      status: 'active',
      recommendation: 'Start',
    },
    {
      id: '3',
      name: 'Ja\'Marr Chase',
      position: 'WR',
      team: 'CIN',
      value: 7800,
      projectedPoints: 20.1,
      status: 'active',
      recommendation: 'Start',
    },
    {
      id: '4',
      name: 'Bijan Robinson',
      position: 'RB',
      team: 'ATL',
      value: 7200,
      projectedPoints: 18.7,
      status: 'bench',
      recommendation: 'Bench',
    },
    {
      id: '5',
      name: 'CeeDee Lamb',
      position: 'WR',
      team: 'DAL',
      value: 7100,
      projectedPoints: 19.2,
      status: 'active',
      recommendation: 'Start',
    },
    {
      id: '6',
      name: 'Travis Kelce',
      position: 'TE',
      team: 'KC',
      value: 6800,
      projectedPoints: 16.8,
      status: 'active',
      recommendation: 'Start',
    },
  ];

  const activePlayers = mockRoster.filter(player => player.status === 'active');
  const benchPlayers = mockRoster.filter(player => player.status === 'bench');
  const totalProjectedPoints = activePlayers.reduce((sum, player) => sum + player.projectedPoints, 0);
  const totalValue = mockRoster.reduce((sum, player) => sum + player.value, 0);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Roster Optimizer</h2>
          <p className="text-gray-600">Get lineup suggestions and roster optimization recommendations</p>
        </div>
        <div className="flex items-center space-x-4">
          <select
            value={selectedLeague}
            onChange={(e) => setSelectedLeague(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="1">Dynasty League Alpha</option>
            <option value="2">Redraft League Beta</option>
            <option value="3">Dynasty League Gamma</option>
          </select>
          <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
            Optimize Roster
          </button>
        </div>
      </div>

      {/* Optimization Options */}
      <div className="bg-gray-50 p-4 rounded-lg mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Optimization Settings</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Optimization Type</label>
            <select
              value={optimizationType}
              onChange={(e) => setOptimizationType(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="points">Maximize Points</option>
              <option value="value">Maximize Value</option>
              <option value="balanced">Balanced Approach</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">League Type</label>
            <select className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="dynasty">Dynasty</option>
              <option value="redraft">Redraft</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Scoring System</label>
            <select className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="ppr">PPR</option>
              <option value="half-ppr">Half PPR</option>
              <option value="standard">Standard</option>
            </select>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
          <div className="flex items-center">
            <div className="p-2 bg-blue-600 rounded-lg">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-blue-600">Projected Points</p>
              <p className="text-2xl font-bold text-blue-900">{totalProjectedPoints.toFixed(1)}</p>
            </div>
          </div>
        </div>

        <div className="bg-green-50 p-6 rounded-lg border border-green-200">
          <div className="flex items-center">
            <div className="p-2 bg-green-600 rounded-lg">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-green-600">Total Value</p>
              <p className="text-2xl font-bold text-green-900">${(totalValue / 1000).toFixed(1)}K</p>
            </div>
          </div>
        </div>

        <div className="bg-purple-50 p-6 rounded-lg border border-purple-200">
          <div className="flex items-center">
            <div className="p-2 bg-purple-600 rounded-lg">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-purple-600">Active Players</p>
              <p className="text-2xl font-bold text-purple-900">{activePlayers.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-yellow-50 p-6 rounded-lg border border-yellow-200">
          <div className="flex items-center">
            <div className="p-2 bg-yellow-600 rounded-lg">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-yellow-600">Optimization Score</p>
              <p className="text-2xl font-bold text-yellow-900">85%</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Roster */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Active Roster</h3>
          </div>
          <div className="p-6">
            <div className="space-y-3">
              {activePlayers.map((player) => (
                <div key={player.id} className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
                  <div className="flex items-center">
                    <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center mr-3">
                      <span className="text-white text-xs font-bold">{player.position}</span>
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">{player.name}</div>
                      <div className="text-sm text-gray-600">{player.team} • {player.projectedPoints.toFixed(1)} pts</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium text-green-600">${player.value.toLocaleString()}</div>
                    <div className="text-xs text-green-600">{player.recommendation}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bench Players */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Bench Players</h3>
          </div>
          <div className="p-6">
            <div className="space-y-3">
              {benchPlayers.map((player) => (
                <div key={player.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-center">
                    <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center mr-3">
                      <span className="text-white text-xs font-bold">{player.position}</span>
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">{player.name}</div>
                      <div className="text-sm text-gray-600">{player.team} • {player.projectedPoints.toFixed(1)} pts</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium text-gray-600">${player.value.toLocaleString()}</div>
                    <div className="text-xs text-gray-600">{player.recommendation}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Recommendations */}
      <div className="mt-8">
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Optimization Recommendations</h3>
          
          <div className="space-y-4">
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <div className="flex items-start">
                <div className="p-2 bg-blue-600 rounded-lg mr-3">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-medium text-blue-900">Lineup Optimization</h4>
                  <p className="text-sm text-blue-700 mt-1">
                    Consider starting Bijan Robinson over CeeDee Lamb this week. Robinson has a better matchup and higher projected points.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
              <div className="flex items-start">
                <div className="p-2 bg-green-600 rounded-lg mr-3">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-medium text-green-900">Trade Opportunities</h4>
                  <p className="text-sm text-green-700 mt-1">
                    Your roster is well-balanced. Consider trading depth for a top-tier QB if available.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
              <div className="flex items-start">
                <div className="p-2 bg-yellow-600 rounded-lg mr-3">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-medium text-yellow-900">Waiver Wire Targets</h4>
                  <p className="text-sm text-yellow-700 mt-1">
                    Monitor the waiver wire for backup RBs and WRs to improve depth. Your current depth is adequate but could be stronger.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 