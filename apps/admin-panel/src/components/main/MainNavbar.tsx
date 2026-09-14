'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Menu, X, ChevronDown } from 'lucide-react';
import { Logo } from '@/components/shared/Logo';

export function MainNavbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? 'bg-white/95 backdrop-blur-xl shadow-[0_4px_30px_rgba(0,0,0,0.03)] py-3 border-b border-slate-100/50'
          : 'bg-transparent py-5'
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 group outline-none">
          <Logo className={`w-8 h-8 sm:w-10 sm:h-10 group-hover:scale-105 transition-transform duration-300 ${isScrolled ? 'text-brand' : 'text-white'}`} />
          <span className={`text-xl sm:text-2xl font-black tracking-tight group-hover:text-brand transition-colors ${isScrolled ? 'text-slate-900' : 'text-white'}`}>
            Dabzzo
          </span>
        </Link>

        {/* Desktop Nav */}
        <div className="hidden lg:flex items-center gap-6">
          <Link href="#about" className={`text-sm font-bold hover:text-brand transition-colors ${isScrolled ? 'text-slate-600' : 'text-white/90'}`}>About</Link>
          <Link href="#how-it-works" className={`text-sm font-bold hover:text-brand transition-colors ${isScrolled ? 'text-slate-600' : 'text-white/90'}`}>How it Works</Link>
          <Link href="#pricing" className={`text-sm font-bold hover:text-brand transition-colors ${isScrolled ? 'text-slate-600' : 'text-white/90'}`}>Pricing</Link>
          
          {/* Dropdown */}
          <div className="relative group">
            <button className={`text-sm font-bold hover:text-brand transition-colors flex items-center gap-1 ${isScrolled ? 'text-slate-600' : 'text-white/90'}`}>
              More <ChevronDown className="w-4 h-4" />
            </button>
            <div className="absolute top-full right-0 mt-2 w-48 bg-white border border-slate-100 shadow-xl rounded-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 overflow-hidden pt-1 pb-1">
              <Link href="#meal-plans" className="block px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50 hover:text-brand">Meal Plans</Link>
              <Link href="#faq" className="block px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50 hover:text-brand">FAQ</Link>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="hidden lg:flex items-center gap-4">
          <Link
            href="/login"
            className={`text-sm font-bold hover:text-brand transition-colors ${isScrolled ? 'text-slate-700' : 'text-white'}`}
          >
            Login
          </Link>
          <Link
            href="/login"
            className={`px-5 py-2.5 rounded-full text-sm font-bold shadow-lg transition-all active:scale-95 ${isScrolled ? 'bg-brand text-white shadow-brand/25 hover:bg-brand-600 hover:scale-105' : 'bg-white text-brand shadow-black/10 hover:bg-slate-50 hover:scale-105'}`}
          >
            Sign Up
          </Link>
        </div>

        {/* Mobile Menu Toggle */}
        <button
          className={`lg:hidden p-2 focus:outline-none ${isScrolled ? 'text-slate-700' : 'text-white'}`}
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Nav */}
      {mobileMenuOpen && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="lg:hidden bg-white border-b border-slate-100 shadow-xl"
        >
          <div className="px-4 pt-2 pb-6 space-y-1 mt-2">
            <Link href="#about" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-3 rounded-xl text-base font-bold text-slate-700 hover:bg-brand/5 hover:text-brand">About</Link>
            <Link href="#how-it-works" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-3 rounded-xl text-base font-bold text-slate-700 hover:bg-brand/5 hover:text-brand">How it Works</Link>
            <Link href="#pricing" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-3 rounded-xl text-base font-bold text-slate-700 hover:bg-brand/5 hover:text-brand">Pricing</Link>
            <Link href="#meal-plans" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-3 rounded-xl text-base font-bold text-slate-700 hover:bg-brand/5 hover:text-brand">Meal Plans</Link>
            <Link href="#faq" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-3 rounded-xl text-base font-bold text-slate-700 hover:bg-brand/5 hover:text-brand">FAQ</Link>
            
            <div className="border-t border-slate-100 mt-4 pt-4 flex flex-col gap-3 px-3">
              <Link
                href="/login"
                className="block w-full text-center text-slate-700 font-bold py-3 rounded-xl hover:bg-slate-50"
              >
                Login
              </Link>
              <Link
                href="/login"
                className="block w-full text-center bg-brand text-white font-bold py-3 rounded-xl shadow-md"
              >
                Sign Up
              </Link>
            </div>
          </div>
        </motion.div>
      )}
    </motion.nav>
  );
}
