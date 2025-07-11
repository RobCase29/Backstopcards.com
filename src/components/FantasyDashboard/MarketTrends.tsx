'use client';

import { useState } from 'react';

interface MarketTrend {
  id: string;
  name: string;
  position: string;
  team: string;
  currentValue: number;
  previousValue: number;
  change: number;
  changePercent: number;
  trend: 'up' | 'down' | 'stable';
  volume: number;
}

export default function MarketTrends() {
  const [selectedPosition, setSelectedPosition] = useState('all');
  const [timeframe, setTimeframe] = useState('7d');

  // Mock data - replace with actual API data
  const mockTrends: MarketTrend[] = [
    {
      id: '1',
      name: 'Bijan Robinson',
      position: 'RB',
      team: 'ATL',
      currentValue: 7200,
      previousValue: 6900,
      change: 300,
      changePercent: 4.3,
      trend: 'up',
      volume: 85,
    },
    {
      id: '2',
      name: 'Christian McCaffrey',
      position: 'RB',
      team: 'SF',
      currentValue: 8500,
      previousValue: 8600,
      change: -100,
      changePercent: -1.2,
      trend: 'down',
      volume: 92,
    },
    {
      id: '3',
      name: 'CeeDee Lamb',
      position: 'WR',
      team: 'DAL',
      currentValue: 7100,
      previousValue: 7000,
      change: 100,
      changePercent: 1.4,
      trend: 'up',
      volume: 78,
    },
    {
      id: '4',
      name: 'Tyreek Hill',
      position: 'WR',
      team: 'MIA',
      currentValue: 8200,
      previousValue: 8200,
      change: 0,
      changePercent: 0,
      trend: 'stable',
      volume: 65,
    },
    {
      id: '5',
      name: 'Ja\'Marr Chase',
      position: 'WR',
      team: 'CIN',
      currentValue: 7800,
      previousValue: 7950,
      change: -150,
      changePercent: -1.9,
      trend: 'down',
      volume: 88,
    },
  ];

  const filteredTrends = mockTrends.filter(trend => 
    selectedPosition === 'all' || trend.position === selectedPosition
  );

  const sortedTrends = [...filteredTrends].sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up':
        return '↗️';
      case 'down':
        return '↘️';
      default:
        return '→';
    }
  };

  const getTrendColor = (trend: string, change: number) => {
    if (change > 0) return 'text-green-600';
    if (change < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  const getVolumeColor = (volume: number) => {
    if (volume >= 80) return 'bg-green-100 text-green-800';
    if (volume >= 60) return 'bg-yellow-100 text-yellow-800';
    return 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Market Trends</h2>
          <p className="text-gray-600">Track player value changes and market activity</p>
        </div>
        <div className="flex items-center space-x-4">
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="1d">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
          </select>
          <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
            Export Data
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-gray-50 p-4 rounded-lg mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Position</label>
            <select
              value={selectedPosition}
              onChange={(e) => setSelectedPosition(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Positions</option>
              <option value="QB">QB</option>
              <option value="RB">RB</option>
              <option value="WR">WR</option>
              <option value="TE">TE</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sort By</label>
            <select className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="change">Value Change</option>
              <option value="volume">Trade Volume</option>
              <option value="name">Player Name</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Min Change</label>
            <input
              type="number"
              placeholder="0"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-end">
            <button className="w-full bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors">
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-green-50 p-6 rounded-lg border border-green-200">
          <div className="flex items-center">
            <div className="p-2 bg-green-600 rounded-lg">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-green-600">Biggest Gainers</p>
              <p className="text-2xl font-bold text-green-900">+4.3%</p>
            </div>
          </div>
        </div>

        <div className="bg-red-50 p-6 rounded-lg border border-red-200">
          <div className="flex items-center">
            <div className="p-2 bg-red-600 rounded-lg">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-red-600">Biggest Losers</p>
              <p className="text-2xl font-bold text-red-900">-1.9%</p>
            </div>
          </div>
        </div>

        <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
          <div className="flex items-center">
            <div className="p-2 bg-blue-600 rounded-lg">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-blue-600">Active Players</p>
              <p className="text-2xl font-bold text-blue-900">{mockTrends.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-purple-50 p-6 rounded-lg border border-purple-200">
          <div className="flex items-center">
            <div className="p-2 bg-purple-600 rounded-lg">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-purple-600">Avg Volume</p>
              <p className="text-2xl font-bold text-purple-900">82</p>
            </div>
          </div>
        </div>
      </div>

      {/* Market Trends Table */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Value Changes</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Player
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Position
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Current Value
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Change
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  % Change
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Volume
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Trend
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedTrends.map((trend) => (
                <tr key={trend.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10">
                        <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                          <span className="text-sm font-medium text-gray-700">
                            {trend.name.split(' ').map(n => n[0]).join('')}
                          </span>
                        </div>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">{trend.name}</div>
                        <div className="text-sm text-gray-500">{trend.team}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      trend.position === 'QB' ? 'bg-red-100 text-red-800' :
                      trend.position === 'RB' ? 'bg-blue-100 text-blue-800' :
                      trend.position === 'WR' ? 'bg-green-100 text-green-800' :
                      'bg-purple-100 text-purple-800'
                    }`}>
                      {trend.position}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    ${trend.currentValue.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <span className={`mr-1 ${getTrendColor(trend.trend, trend.change)}`}>
                        {getTrendIcon(trend.trend)}
                      </span>
                      <span className={`text-sm font-medium ${getTrendColor(trend.trend, trend.change)}`}>
                        {trend.change > 0 ? '+' : ''}{trend.change}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`text-sm font-medium ${getTrendColor(trend.trend, trend.change)}`}>
                      {trend.changePercent > 0 ? '+' : ''}{trend.changePercent.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getVolumeColor(trend.volume)}`}>
                      {trend.volume}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="flex items-center">
                      <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                        <div 
                          className={`h-2 rounded-full ${getTrendColor(trend.trend, trend.change).replace('text-', 'bg-')}`}
                          style={{ width: `${Math.min(Math.abs(trend.changePercent) * 10, 100)}%` }}
                        ></div>
                      </div>
                      <span className="text-xs">{trend.trend}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Market Insights */}
      <div className="mt-8">
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Market Insights</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <h4 className="font-medium text-blue-900 mb-2">Top Gainers</h4>
              <div className="space-y-2">
                {sortedTrends.filter(t => t.change > 0).slice(0, 3).map((trend) => (
                  <div key={trend.id} className="flex justify-between items-center">
                    <span className="text-sm text-blue-700">{trend.name}</span>
                    <span className="text-sm font-medium text-green-600">+{trend.changePercent.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-red-50 p-4 rounded-lg border border-red-200">
              <h4 className="font-medium text-red-900 mb-2">Top Decliners</h4>
              <div className="space-y-2">
                {sortedTrends.filter(t => t.change < 0).slice(0, 3).map((trend) => (
                  <div key={trend.id} className="flex justify-between items-center">
                    <span className="text-sm text-red-700">{trend.name}</span>
                    <span className="text-sm font-medium text-red-600">{trend.changePercent.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 