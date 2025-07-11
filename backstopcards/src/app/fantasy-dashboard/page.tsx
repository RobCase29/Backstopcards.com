'use client';

import { useState } from 'react';
import LeagueOverview from '@/components/FantasyDashboard/LeagueOverview';
import PlayerValuations from '@/components/FantasyDashboard/PlayerValuations';
import TradeAnalyzer from '@/components/FantasyDashboard/TradeAnalyzer';
import RosterOptimizer from '@/components/FantasyDashboard/RosterOptimizer';
import MarketTrends from '@/components/FantasyDashboard/MarketTrends';

export default function FantasyDashboard() {
  const [activeTab, setActiveTab] = useState('overview');

  const tabs = [
    { id: 'overview', name: 'League Overview', icon: '🏈' },
    { id: 'valuations', name: 'Player Valuations', icon: '💰' },
    { id: 'trades', name: 'Trade Analyzer', icon: '⚖️' },
    { id: 'roster', name: 'Roster Optimizer', icon: '📊' },
    { id: 'trends', name: 'Market Trends', icon: '📈' },
  ];

  const renderActiveComponent = () => {
    switch (activeTab) {
      case 'overview':
        return <LeagueOverview />;
      case 'valuations':
        return <PlayerValuations />;
      case 'trades':
        return <TradeAnalyzer />;
      case 'roster':
        return <RosterOptimizer />;
      case 'trends':
        return <MarketTrends />;
      default:
        return <LeagueOverview />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Dashboard Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Fantasy Dashboard</h1>
              <p className="text-gray-600 mt-1">Manage your Sleeper dynasty leagues with KeepTradeCut valuations</p>
            </div>
            <div className="flex items-center space-x-4">
              <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
                Connect Sleeper
              </button>
              <button className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors">
                Sync Data
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Dashboard Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tab Navigation */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-8">
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8 px-6" aria-label="Tabs">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <span className="mr-2">{tab.icon}</span>
                  {tab.name}
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Active Component */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          {renderActiveComponent()}
        </div>
      </div>
    </div>
  );
} 