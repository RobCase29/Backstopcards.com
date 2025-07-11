'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex-shrink-0">
            <Link href="/" className="flex items-center">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">BC</span>
              </div>
              <span className="ml-2 text-xl font-bold text-gray-900">Backstop Cards</span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex space-x-8">
            <Link href="/" className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium transition-colors">
              Home
            </Link>
            <Link href="/fantasy-dashboard" className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium transition-colors">
              Fantasy Dashboard
            </Link>
            <Link href="/about" className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium transition-colors">
              About
            </Link>
            <Link href="/links" className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium transition-colors">
              Links
            </Link>
          </nav>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="text-gray-700 hover:text-blue-600 p-2 rounded-md"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMobileMenuOpen && (
          <div className="md:hidden">
            <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 border-t border-gray-200">
              <Link href="/" className="text-gray-700 hover:text-blue-600 block px-3 py-2 rounded-md text-base font-medium">
                Home
              </Link>
              <Link href="/fantasy-dashboard" className="text-gray-700 hover:text-blue-600 block px-3 py-2 rounded-md text-base font-medium">
                Fantasy Dashboard
              </Link>
              <Link href="/about" className="text-gray-700 hover:text-blue-600 block px-3 py-2 rounded-md text-base font-medium">
                About
              </Link>
              <Link href="/links" className="text-gray-700 hover:text-blue-600 block px-3 py-2 rounded-md text-base font-medium">
                Links
              </Link>
            </div>
          </div>
        )}
      </div>
    </header>
  );
} 