export default function Links() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="text-center">
            <h1 className="text-4xl md:text-6xl font-bold mb-6">
              External Properties
            </h1>
            <p className="text-xl md:text-2xl mb-8 text-blue-100">
              Check out our other platforms and resources
            </p>
          </div>
        </div>
      </section>

      {/* Links Content */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* eBay Store */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow">
              <div className="h-48 bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center">
                <svg className="w-16 h-16 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
              </div>
              <div className="p-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-2">eBay Store</h3>
                <p className="text-gray-600 mb-4">
                  Browse our collection of sports cards, memorabilia, and collectibles. Find rare cards and unique items for your collection.
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Sports Cards & Memorabilia</span>
                  <a 
                    href="#" 
                    className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
                  >
                    Visit Store
                  </a>
                </div>
              </div>
            </div>

            {/* Sleeper */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow">
              <div className="h-48 bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center">
                <svg className="w-16 h-16 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
              </div>
              <div className="p-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Sleeper</h3>
                <p className="text-gray-600 mb-4">
                  The best fantasy football platform for dynasty leagues. Manage your teams, track players, and compete with friends.
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Fantasy Football Platform</span>
                  <a 
                    href="https://sleeper.app" 
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
                  >
                    Learn More
                  </a>
                </div>
              </div>
            </div>

            {/* KeepTradeCut */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow">
              <div className="h-48 bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center">
                <svg className="w-16 h-16 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
              </div>
              <div className="p-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-2">KeepTradeCut</h3>
                <p className="text-gray-600 mb-4">
                  Player valuations and rankings for dynasty leagues. Get real-time player values and trade advice.
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Player Valuations</span>
                  <a 
                    href="https://keeptradecut.com" 
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors"
                  >
                    Check Values
                  </a>
                </div>
              </div>
            </div>

            {/* FantasyPros */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow">
              <div className="h-48 bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                <svg className="w-16 h-16 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
              </div>
              <div className="p-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-2">FantasyPros</h3>
                <p className="text-gray-600 mb-4">
                  Expert fantasy football advice, rankings, and tools to help you make the best decisions for your team.
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Fantasy Advice & Rankings</span>
                  <a 
                    href="https://fantasypros.com" 
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Get Advice
                  </a>
                </div>
              </div>
            </div>

            {/* Dynasty League Football */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow">
              <div className="h-48 bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center">
                <svg className="w-16 h-16 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
              </div>
              <div className="p-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Dynasty League Football</h3>
                <p className="text-gray-600 mb-4">
                  Comprehensive dynasty league content, rankings, and analysis from industry experts.
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Dynasty Content</span>
                  <a 
                    href="https://dynastyleaguefootball.com" 
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition-colors"
                  >
                    Read Articles
                  </a>
                </div>
              </div>
            </div>

            {/* Twitter */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow">
              <div className="h-48 bg-gradient-to-br from-sky-500 to-sky-600 flex items-center justify-center">
                <svg className="w-16 h-16 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84"/>
                </svg>
              </div>
              <div className="p-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Twitter</h3>
                <p className="text-gray-600 mb-4">
                  Follow us for the latest fantasy football news, updates, and insights from the community.
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Social Media</span>
                  <a 
                    href="#" 
                    className="bg-sky-600 text-white px-4 py-2 rounded-lg hover:bg-sky-700 transition-colors"
                  >
                    Follow Us
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Additional Resources */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Additional Resources
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Tools and resources to help you succeed in fantasy football
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-gray-50 p-6 rounded-lg">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Fantasy Football Tools</h3>
              <ul className="space-y-3 text-gray-600">
                <li className="flex items-center">
                  <svg className="w-5 h-5 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <a href="#" className="hover:text-blue-600">Trade Calculator</a>
                </li>
                <li className="flex items-center">
                  <svg className="w-5 h-5 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <a href="#" className="hover:text-blue-600">Draft Simulator</a>
                </li>
                <li className="flex items-center">
                  <svg className="w-5 h-5 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <a href="#" className="hover:text-blue-600">League Analyzer</a>
                </li>
                <li className="flex items-center">
                  <svg className="w-5 h-5 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <a href="#" className="hover:text-blue-600">Player Rankings</a>
                </li>
              </ul>
            </div>

            <div className="bg-gray-50 p-6 rounded-lg">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Community Resources</h3>
              <ul className="space-y-3 text-gray-600">
                <li className="flex items-center">
                  <svg className="w-5 h-5 text-blue-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <a href="#" className="hover:text-blue-600">Fantasy Forums</a>
                </li>
                <li className="flex items-center">
                  <svg className="w-5 h-5 text-blue-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <a href="#" className="hover:text-blue-600">Discord Community</a>
                </li>
                <li className="flex items-center">
                  <svg className="w-5 h-5 text-blue-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <a href="#" className="hover:text-blue-600">Reddit Communities</a>
                </li>
                <li className="flex items-center">
                  <svg className="w-5 h-5 text-blue-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <a href="#" className="hover:text-blue-600">YouTube Channels</a>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Ready to Explore More?
          </h2>
          <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
            Check out our fantasy dashboard and start dominating your dynasty leagues today.
          </p>
          <a
            href="/fantasy-dashboard"
            className="bg-yellow-400 text-gray-900 px-8 py-4 rounded-lg font-semibold text-lg hover:bg-yellow-300 transition-colors inline-block"
          >
            Launch Dashboard
          </a>
        </div>
      </section>
    </div>
  );
} 