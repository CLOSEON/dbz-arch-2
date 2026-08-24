'use client';

import Link from 'next/link';
import { Logo } from '@/components/shared/Logo';
import { Globe, Camera, MessageSquare, Mail, MapPin, Phone } from 'lucide-react';

export function MainFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-slate-950 text-slate-300 py-16 lg:py-24 border-t border-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12 lg:gap-8">
          
          {/* Brand & Mission */}
          <div className="lg:col-span-2 space-y-6">
            <Link href="/" className="flex items-center gap-2 outline-none inline-block">
              <Logo className="w-8 h-8 text-brand" />
              <span className="text-2xl font-black tracking-tight text-white">
                Dabzzo
              </span>
            </Link>
            <p className="text-sm leading-relaxed max-w-sm text-slate-400">
              Transforming the way you experience daily meals. Connecting home kitchens and local chefs with hungry subscribers through a smart, reliable marketplace.
            </p>
            <div className="flex gap-4">
              <a href="#" className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center text-slate-400 hover:bg-brand hover:text-white transition-all">
                <Globe className="w-4 h-4" />
              </a>
              <a href="#" className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center text-slate-400 hover:bg-brand hover:text-white transition-all">
                <Camera className="w-4 h-4" />
              </a>
              <a href="#" className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center text-slate-400 hover:bg-brand hover:text-white transition-all">
                <MessageSquare className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div className="space-y-6">
            <h4 className="text-white font-bold tracking-wide">Quick Links</h4>
            <ul className="space-y-3 text-sm">
              <li><Link href="#about" className="hover:text-brand transition-colors">About Us</Link></li>
              <li><Link href="#how-it-works" className="hover:text-brand transition-colors">How it Works</Link></li>
              <li><Link href="#meal-plans" className="hover:text-brand transition-colors">Meal Plans</Link></li>
              <li><Link href="#pricing" className="hover:text-brand transition-colors">Pricing</Link></li>
              <li><Link href="#faq" className="hover:text-brand transition-colors">FAQ</Link></li>
            </ul>
          </div>

          {/* Partners */}
          <div className="space-y-6">
            <h4 className="text-white font-bold tracking-wide">Partners</h4>
            <ul className="space-y-3 text-sm">
              <li><Link href="#kitchen-partners" className="hover:text-brand transition-colors">Kitchen Partners</Link></li>
              <li><Link href="#delivery-partners" className="hover:text-brand transition-colors">Delivery Partners</Link></li>
              <li><Link href="/login" className="hover:text-brand transition-colors">Partner Login</Link></li>
            </ul>
          </div>

          {/* Contact */}
          <div className="space-y-6">
            <h4 className="text-white font-bold tracking-wide">Contact</h4>
            <ul className="space-y-4 text-sm">
              <li className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-brand shrink-0" />
                <span className="leading-relaxed">123 Food Street, Tech Park Phase 2, Bangalore, India</span>
              </li>
              <li className="flex items-center gap-3">
                <Phone className="w-5 h-5 text-brand shrink-0" />
                <span>+91 98765 43210</span>
              </li>
              <li className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-brand shrink-0" />
                <span>support@dabzzo.com</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-16 pt-8 border-t border-slate-900 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p>© {currentYear} Dabzzo. All rights reserved.</p>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-slate-300 transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-slate-300 transition-colors">Terms of Service</Link>
            <Link href="/refunds" className="hover:text-slate-300 transition-colors">Refund Policy</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
