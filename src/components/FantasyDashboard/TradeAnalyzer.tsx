'use client';

import { useState } from 'react';

interface TradePlayer {
  id: string;
  name: string;
  position: string;
  team: string;
  value: number;
  age: number;
  experience: string;
}

export default function TradeAnalyzer() {
  const [sideAPlayers, setSideAPlayers] = useState<TradePlayer[]>([]);
  const [sideBPlayers, setSideBPlayers] = useState<TradePlayer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Mock data - replace with actual API data
  const mockPlayers: TradePlayer[] = [
    { id: '1', name: 'Christian McCaffrey', position: 'RB', team: 'SF', value: 8500, age: 27, experience: '7 years' },
    { id: '2', name: 'Tyreek Hill', position: 'WR', team: 'MIA', value: 8200, age: 29, experience: '8 years' },
    { id: '3', name: 'Ja\'Marr Chase', position: 'WR', team: 'CIN', value: 7800, age: 23, experience: '3 years' },
    { id: '4', name: 'Bijan Robinson', position: 'RB', team: 'ATL', value: 7200, age: 22, experience: '1 year' },
    { id: '5', name: 'CeeDee Lamb', position: 'WR', team: 'DAL', value: 7100, age: 24, experience: '4 years' },
  ];

  const filteredPlayers = mockPlayers.filter(player =>
    player.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const addPlayerToSide = (player: TradePlayer, side: 'A' | 'B') => {
    if (side === 'A') {
      setSideAPlayers([...sideAPlayers, player]);
    } else {
      setSideBPlayers([...sideBPlayers, player]);
    }
  };

  const removePlayerFromSide = (playerId: string, side: 'A' | 'B') => {
    if (side === 'A') {
      setSideAPlayers(sideAPlayers.filter(p => p.id !== playerId));
    } else {
      setSideBPlayers(sideBPlayers.filter(p => p.id !== playerId));
    }
  };

  const sideATotalValue = sideAPlayers.reduce((sum, player) => sum + player.value, 0);
  const sideBTotalValue = sideBPlayers.reduce((sum, player) => sum + player.value, 0);
  const valueDifference = sideATotalValue - sideBTotalValue;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Trade Analyzer</h2>
          <p className="text-gray-600">Compare player values and analyze potential trades</p>
        </div>
        <div className="flex items-center space-x-4">
          <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
            Save Trade
          </button>
          <button className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors">
            Export Analysis
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Side A */}
        <div className="lg:col-span-1">
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <h3 className="text-lg font-semibold text-blue-900 mb-4">Side A</h3>
            <div className="space-y-3">
              {sideAPlayers.map((player) => (
                <div key={player.id} className="bg-white p-3 rounded-lg border border-blue-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-gray-900">{player.name}</div>
                      <div className="text-sm text-gray-600">{player.position} • {player.team}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium text-blue-600">${player.value.toLocaleString()}</div>
                      <button
                        onClick={() => removePlayerFromSide(player.id, 'A')}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-blue-200">
              <div className="flex justify-between items-center">
                <span className="font-medium text-blue-900">Total Value:</span>
                <span className="font-bold text-blue-900">${sideATotalValue.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Trade Analysis */}
        <div className="lg:col-span-1">
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Trade Analysis</h3>
            
            <div className="space-y-4">
              <div className="bg-white p-4 rounded-lg">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-600">Value Difference</span>
                  <span className={`font-bold ${valueDifference > 0 ? 'text-green-600' : valueDifference < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                    {valueDifference > 0 ? '+' : ''}${valueDifference.toLocaleString()}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full ${valueDifference > 0 ? 'bg-green-500' : valueDifference < 0 ? 'bg-red-500' : 'bg-gray-400'}`}
                    style={{ width: `${Math.min(Math.abs(valueDifference) / 1000 * 10, 100)}%` }}
                  ></div>
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg">
                <div className="text-sm font-medium text-gray-600 mb-2">Trade Rating</div>
                <div className="flex items-center">
                  <div className="flex-1">
                    <div className="flex items-center">
                      {[...Array(5)].map((_, i) => (
                        <svg
                          key={i}
                          className={`w-5 h-5 ${i < 3 ? 'text-yellow-400' : 'text-gray-300'}`}
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      ))}
                    </div>
                  </div>
                  <span className="text-sm font-medium text-gray-900">Fair Trade</span>
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg">
                <div className="text-sm font-medium text-gray-600 mb-2">Recommendation</div>
                <div className="text-sm text-gray-900">
                  {valueDifference > 500 ? 'Side A is significantly overpaying' :
                   valueDifference < -500 ? 'Side B is significantly overpaying' :
                   'This is a fair trade for both sides'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Side B */}
        <div className="lg:col-span-1">
          <div className="bg-green-50 p-4 rounded-lg border border-green-200">
            <h3 className="text-lg font-semibold text-green-900 mb-4">Side B</h3>
            <div className="space-y-3">
              {sideBPlayers.map((player) => (
                <div key={player.id} className="bg-white p-3 rounded-lg border border-green-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-gray-900">{player.name}</div>
                      <div className="text-sm text-gray-600">{player.position} • {player.team}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium text-green-600">${player.value.toLocaleString()}</div>
                      <button
                        onClick={() => removePlayerFromSide(player.id, 'B')}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-green-200">
              <div className="flex justify-between items-center">
                <span className="font-medium text-green-900">Total Value:</span>
                <span className="font-bold text-green-900">${sideBTotalValue.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Player Search */}
      <div className="mt-8">
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Players to Trade</h3>
          
          <div className="mb-4">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search for players..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPlayers.map((player) => (
              <div key={player.id} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="font-medium text-gray-900">{player.name}</div>
                    <div className="text-sm text-gray-600">{player.position} • {player.team}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium text-gray-900">${player.value.toLocaleString()}</div>
                  </div>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => addPlayerToSide(player, 'A')}
                    className="flex-1 bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition-colors"
                  >
                    Add to Side A
                  </button>
                  <button
                    onClick={() => addPlayerToSide(player, 'B')}
                    className="flex-1 bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 transition-colors"
                  >
                    Add to Side B
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
} 