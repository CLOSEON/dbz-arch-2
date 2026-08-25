'use client';

import Link from 'next/link';
import { Logo } from '@/components/shared/Logo';

export function MainFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-slate-950 text-slate-300 py-16 lg:py-20 border-t border-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-8">
          
          {/* Brand & Mission */}
          <div className="lg:col-span-2 space-y-4">
            <Link href="/" className="flex items-center gap-2 outline-none inline-block">
              <Logo className="w-8 h-8 text-brand" />
              <span className="text-2xl font-black tracking-tight text-white">
                Dabzzo
              </span>
            </Link>
            <p className="text-sm leading-relaxed max-w-sm text-slate-400">
              Transforming the way you experience daily meals. Connecting home kitchens and local chefs with hungry subscribers through a smart, reliable marketplace.
            </p>
          </div>

          {/* Quick Links */}
          <div className="space-y-4">
            <h4 className="text-white font-bold tracking-wide">Quick Links</h4>
            <ul className="space-y-2.5 text-sm text-slate-400">
              <li><Link href="#about" className="hover:text-brand transition-colors">About Us</Link></li>
              <li><Link href="#how-it-works" className="hover:text-brand transition-colors">How it Works</Link></li>
              <li><Link href="#meal-plans" className="hover:text-brand transition-colors">Meal Plans</Link></li>
              <li><Link href="#pricing" className="hover:text-brand transition-colors">Pricing</Link></li>
              <li><Link href="#faq" className="hover:text-brand transition-colors">FAQ</Link></li>
            </ul>
          </div>

          {/* Partners */}
          <div className="space-y-4">
            <h4 className="text-white font-bold tracking-wide">Partners</h4>
            <ul className="space-y-2.5 text-sm text-slate-400">
              <li><Link href="#kitchen-partners" className="hover:text-brand transition-colors">Kitchen Partners</Link></li>
              <li><Link href="#delivery-partners" className="hover:text-brand transition-colors">Delivery Partners</Link></li>
              <li><Link href="/login" className="hover:text-brand transition-colors">Partner Login</Link></li>
            </ul>
          </div>

        </div>

        <div className="mt-12 pt-8 border-t border-slate-900 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p>© {currentYear} Dabzzo. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
