import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="text-center">
            <h1 className="text-4xl md:text-6xl font-bold mb-6">
              Welcome to{' '}
              <span className="text-yellow-400">Backstop Cards</span>
            </h1>
            <p className="text-xl md:text-2xl mb-8 text-blue-100">
              Your personal hub for fantasy football dynasty management
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/fantasy-dashboard"
                className="bg-yellow-400 text-blue-900 px-8 py-4 rounded-lg font-semibold text-lg hover:bg-yellow-300 transition-colors"
              >
                Launch Fantasy Dashboard
              </Link>
              <Link
                href="/about"
                className="border-2 border-white text-white px-8 py-4 rounded-lg font-semibold text-lg hover:bg-white hover:text-blue-900 transition-colors"
              >
                Learn More
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Fantasy Football Tools
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Comprehensive tools for Sleeper dynasty leagues with KeepTradeCut valuations
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="bg-gray-50 p-8 rounded-xl">
              <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center mb-6">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-4">League Analytics</h3>
              <p className="text-gray-600">
                Comprehensive analysis of your Sleeper dynasty leagues with detailed statistics and insights.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-gray-50 p-8 rounded-xl">
              <div className="w-12 h-12 bg-green-600 rounded-lg flex items-center justify-center mb-6">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Player Valuations</h3>
              <p className="text-gray-600">
                Real-time player values from KeepTradeCut integrated with your roster for informed decisions.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-gray-50 p-8 rounded-xl">
              <div className="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center mb-6">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Trade Analyzer</h3>
              <p className="text-gray-600">
                Compare player values and analyze potential trades with detailed breakdowns and recommendations.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Ready to Dominate Your Dynasty League?
          </h2>
          <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
            Join thousands of fantasy football managers who use our tools to make better decisions and win championships.
          </p>
          <Link
            href="/fantasy-dashboard"
            className="bg-yellow-400 text-gray-900 px-8 py-4 rounded-lg font-semibold text-lg hover:bg-yellow-300 transition-colors inline-block"
          >
            Get Started Now
          </Link>
        </div>
      </section>

      {/* External Links Preview */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              External Properties
            </h2>
            <p className="text-xl text-gray-600">
              Check out our other platforms and resources
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* eBay Store */}
            <div className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-red-600 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">eBay Store</h3>
              <p className="text-gray-600 mb-4">
                Browse our collection of sports cards and memorabilia
              </p>
              <a href="#" className="text-blue-600 hover:text-blue-800 font-medium">
                Visit Store →
              </a>
            </div>

            {/* Sleeper */}
            <div className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-green-600 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Sleeper</h3>
              <p className="text-gray-600 mb-4">
                The best fantasy football platform for dynasty leagues
              </p>
              <a href="#" className="text-blue-600 hover:text-blue-800 font-medium">
                Learn More →
              </a>
            </div>

            {/* KeepTradeCut */}
            <div className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">KeepTradeCut</h3>
              <p className="text-gray-600 mb-4">
                Player valuations and rankings for dynasty leagues
              </p>
              <a href="#" className="text-blue-600 hover:text-blue-800 font-medium">
                Check Values →
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
