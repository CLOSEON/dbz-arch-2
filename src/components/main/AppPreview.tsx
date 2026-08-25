'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import { MapPin, Bell, Search, Home, ShoppingBag, User, Star, CheckCircle, ChevronRight, Zap, Pause, Navigation } from 'lucide-react';

// A pixel-faithful replica of the Dabzzo dashboard screen
function DashboardScreen() {
  return (
    <div className="w-full h-full bg-[#FEFCE8] flex flex-col text-slate-900 overflow-hidden select-none">
      {/* Warm Amber/Gold Header */}
      <div className="bg-gradient-to-r from-amber-600 to-amber-700 px-4 pt-4 pb-8 flex flex-col gap-1">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 bg-white/20 rounded-full px-2.5 py-1">
            <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            <span className="text-white text-[9px] font-bold">Near You</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="bg-white/20 backdrop-blur-xs rounded-full px-3 py-1 flex items-center">
              <span className="text-white text-[10px] font-extrabold tracking-tight">Dabzzo.in</span>
            </div>
            <Bell className="w-4 h-4 text-white" />
          </div>
        </div>
        <p className="text-amber-100 text-[9px] font-semibold uppercase tracking-widest">Good afternoon, test</p>
        <h2 className="text-white text-lg font-black leading-tight">Fresh Home<br />Tiffins<br />Delivered Daily.</h2>
      </div>

      {/* Live Order Card */}
      <div className="mx-3 -mt-5 bg-slate-900 rounded-2xl p-3 shadow-xl z-10">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-400 text-[8px] font-black uppercase tracking-widest">Live Order Status</span>
          </div>
          <span className="text-white/50 text-[8px] font-semibold">Today</span>
        </div>
        <p className="text-white text-xs font-bold mb-0.5">Your kitchen</p>
        <p className="text-white/60 text-[8px] mb-2">Status: Pending</p>
        <div className="w-full bg-amber-600 rounded-lg py-1.5 text-center">
          <span className="text-white text-[9px] font-black tracking-wide">TRACK LIVE DELIVERY</span>
        </div>
      </div>

      {/* Search */}
      <div className="mx-3 mt-3 flex items-center gap-2 bg-white rounded-xl px-3 py-2 shadow-xs border border-slate-100">
        <Search className="w-3 h-3 text-slate-400" />
        <span className="text-slate-400 text-[9px]">Explore now...</span>
      </div>

      {/* Filter pills */}
      <div className="flex gap-1.5 px-3 mt-2 overflow-x-auto scrollbar-none">
        {['All','Home Style','North Indian','South Indian','Jain'].map((cat, i) => (
          <span key={cat} className={`shrink-0 text-[8px] font-bold px-2.5 py-1 rounded-full ${i === 0 ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
            {cat}
          </span>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-2 px-3 mt-3">
        {[
          { icon: Zap, label: 'Menu Swaps', sub: 'Switch kitchen anytime' },
          { icon: Pause, label: 'Easy Pause', sub: 'Save credits when away' },
          { icon: Navigation, label: 'Live Track', sub: 'Real-time GPS delivery' },
        ].map(({ icon: Icon, label, sub }) => (
          <div key={label} className="bg-white rounded-xl p-2 shadow-xs border border-slate-100 text-center">
            <div className="w-6 h-6 bg-amber-500/10 rounded-lg flex items-center justify-center mx-auto mb-1">
              <Icon className="w-3 h-3 text-amber-600" />
            </div>
            <p className="text-[8px] font-black text-slate-800 leading-none">{label}</p>
            <p className="text-[6px] text-slate-400 mt-0.5 leading-tight">{sub}</p>
          </div>
        ))}
      </div>

      {/* Vendors */}
      <div className="px-3 mt-3 flex items-center justify-between">
        <span className="text-[10px] font-black text-slate-800">Nearest Vendors</span>
        <div className="flex items-center gap-1 text-[8px] text-slate-400">
          <span className="text-amber-600 font-bold">↺ 1 FOUND</span>
        </div>
      </div>
      <div className="mx-3 mt-2 bg-white rounded-2xl p-3 shadow-xs border border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center">
            <span className="text-lg">🍱</span>
          </div>
          <div>
            <div className="flex items-center gap-1 mb-0.5">
              <span className="text-[8px] font-black text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5">✓ VERIFIED</span>
            </div>
            <div className="flex items-center gap-0.5">
              <Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
              <span className="text-[8px] font-bold text-slate-700">4.5</span>
            </div>
          </div>
        </div>
        <ChevronRight className="w-3 h-3 text-slate-400" />
      </div>

      {/* Bottom Nav */}
      <div className="mt-auto border-t border-slate-100 bg-white flex items-center justify-around px-4 py-2">
        {[{ icon: Home, label: 'HOME', active: true }, { icon: ShoppingBag, label: 'ORDERS', active: false }, { icon: User, label: 'PROFILE', active: false }].map(({ icon: Icon, label, active }) => (
          <div key={label} className="flex flex-col items-center gap-0.5">
            <Icon className={`w-4 h-4 ${active ? 'text-amber-600' : 'text-slate-400'}`} />
            <span className={`text-[7px] font-black ${active ? 'text-amber-600' : 'text-slate-400'}`}>{label}</span>
            {active && <div className="w-1 h-1 rounded-full bg-amber-600" />}
          </div>
        ))}
      </div>
    </div>
  );
}

// Orders screen replica
function OrdersScreen() {
  return (
    <div className="w-full h-full bg-[#FEFCE8] flex flex-col text-slate-900 overflow-hidden select-none">
      <div className="bg-gradient-to-r from-amber-600 to-amber-700 px-4 pt-5 pb-5">
        <p className="text-amber-100 text-[9px] font-semibold uppercase tracking-widest mb-1">Your Orders</p>
        <h2 className="text-white text-xl font-black">Subscription Active</h2>
      </div>

      <div className="flex-1 px-3 pt-4 space-y-3 overflow-hidden">
        {[
          { status: 'Delivered', meal: 'Dal Rice + Sabzi', date: 'Today, Lunch', color: 'bg-emerald-50 border-emerald-200', badge: 'bg-emerald-500' },
          { status: 'Scheduled', meal: 'Roti + Paneer', date: 'Tomorrow, Lunch', color: 'bg-amber-50 border-amber-200', badge: 'bg-amber-500' },
          { status: 'Scheduled', meal: 'Veg Thali', date: 'Wed, Lunch', color: 'bg-slate-50 border-slate-200', badge: 'bg-slate-400' },
        ].map((order, i) => (
          <div key={i} className={`${order.color} border rounded-2xl p-3`}>
            <div className="flex items-start justify-between mb-1">
              <p className="text-[10px] font-black text-slate-800">{order.meal}</p>
              <span className={`${order.badge} text-white text-[7px] font-bold px-2 py-0.5 rounded-full`}>{order.status}</span>
            </div>
            <p className="text-[8px] text-slate-500">{order.date}</p>
          </div>
        ))}
      </div>

      {/* Bottom Nav */}
      <div className="mt-auto border-t border-slate-100 bg-white flex items-center justify-around px-4 py-2">
        {[{ icon: Home, label: 'HOME', active: false }, { icon: ShoppingBag, label: 'ORDERS', active: true }, { icon: User, label: 'PROFILE', active: false }].map(({ icon: Icon, label, active }) => (
          <div key={label} className="flex flex-col items-center gap-0.5">
            <Icon className={`w-4 h-4 ${active ? 'text-amber-600' : 'text-slate-400'}`} />
            <span className={`text-[7px] font-black ${active ? 'text-amber-600' : 'text-slate-400'}`}>{label}</span>
            {active && <div className="w-1 h-1 rounded-full bg-amber-600" />}
          </div>
        ))}
      </div>
    </div>
  );
}

function PhoneMockup({ children, rotate = 0, delay = 0, zIndex = 10 }: { children: React.ReactNode; rotate?: number; delay?: number; zIndex?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 60, rotate: rotate - 4 }}
      whileInView={{ opacity: 1, y: 0, rotate }}
      viewport={{ once: true }}
      transition={{ duration: 0.8, delay, type: 'spring', stiffness: 80 }}
      style={{ zIndex }}
      className="relative w-[210px] h-[440px] bg-slate-900 rounded-[2.5rem] shadow-2xl border-[8px] border-slate-800 overflow-hidden shrink-0"
    >
      {/* Notch */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-4 bg-slate-900 rounded-b-2xl z-20" />
      <div className="w-full h-full overflow-hidden">
        {children}
      </div>
    </motion.div>
  );
}

export function AppPreview() {
  return (
    <section className="py-24 bg-slate-900 text-white overflow-hidden relative">
      {/* Subtle texture */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(230, 138, 0, 0.15),transparent_60%)] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Header */}
        <div className="text-center mb-16">
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-amber-500 font-bold tracking-widest uppercase text-sm mb-3"
          >
            App Preview
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-4xl md:text-5xl font-black leading-tight"
          >
            Manage your meals<br />from your pocket.
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-slate-400 text-lg mt-4 max-w-xl mx-auto"
          >
            A fast, beautiful Progressive Web App. No downloads needed — just open it in your browser.
          </motion.p>
        </div>

        {/* Phones Showcase */}
        <div className="flex items-end justify-center gap-4 sm:gap-8 min-h-[480px] pb-8">
          <PhoneMockup rotate={-6} delay={0} zIndex={10}>
            <OrdersScreen />
          </PhoneMockup>

          <PhoneMockup rotate={0} delay={0.15} zIndex={20}>
            <DashboardScreen />
          </PhoneMockup>

          <PhoneMockup rotate={6} delay={0.3} zIndex={10}>
            <div className="w-full h-full bg-[#FEFCE8] flex flex-col overflow-hidden select-none">
              <div className="bg-gradient-to-r from-amber-600 to-amber-700 px-4 pt-5 pb-5">
                <p className="text-amber-100 text-[9px] font-semibold uppercase tracking-widest mb-1">Your Profile</p>
                <h2 className="text-white text-xl font-black">Hey, Test!</h2>
              </div>
              <div className="flex-1 px-3 pt-4 space-y-2.5">
                {[
                  { label: 'Active Plan', value: 'Weekly - 7 Days', icon: '📦' },
                  { label: 'Meals Remaining', value: '5 of 7', icon: '🍱' },
                  { label: 'Delivery Credits', value: '₹120', icon: '💳' },
                  { label: 'Current Kitchen', value: 'Swad Kitchen', icon: '🍳' },
                ].map(item => (
                  <div key={item.label} className="bg-white rounded-2xl p-3 flex items-center gap-3 shadow-xs border border-slate-100">
                    <span className="text-xl">{item.icon}</span>
                    <div>
                      <p className="text-[8px] text-slate-400 font-semibold">{item.label}</p>
                      <p className="text-[11px] text-slate-800 font-black">{item.value}</p>
                    </div>
                  </div>
                ))}
                <div className="bg-amber-600 rounded-2xl p-3 text-center">
                  <p className="text-white text-[10px] font-black">🏅 Rewards & Credits</p>
                </div>
              </div>
              <div className="mt-auto border-t border-slate-100 bg-white flex items-center justify-around px-4 py-2">
                {[{ icon: Home, label: 'HOME', active: false }, { icon: ShoppingBag, label: 'ORDERS', active: false }, { icon: User, label: 'PROFILE', active: true }].map(({ icon: Icon, label, active }) => (
                  <div key={label} className="flex flex-col items-center gap-0.5">
                    <Icon className={`w-4 h-4 ${active ? 'text-amber-600' : 'text-slate-400'}`} />
                    <span className={`text-[7px] font-black ${active ? 'text-amber-600' : 'text-slate-400'}`}>{label}</span>
                    {active && <div className="w-1 h-1 rounded-full bg-amber-600" />}
                  </div>
                ))}
              </div>
            </div>
          </PhoneMockup>
        </div>

        {/* Features row */}
        <div className="mt-16 grid sm:grid-cols-3 gap-6 text-center max-w-3xl mx-auto">
          {[
            { label: 'No App Download', desc: 'Works right in your browser on any device.', icon: '⚡' },
            { label: 'Real-Time Tracking', desc: 'Watch your rider come to you live on the map.', icon: '📍' },
            { label: 'Swap & Pause', desc: 'Full control over your meals, any day.', icon: '🔄' },
          ].map((f, i) => (
            <motion.div
              key={f.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="bg-white/5 border border-white/10 rounded-2xl p-6"
            >
              <span className="text-3xl mb-3 block">{f.icon}</span>
              <h4 className="font-black text-white mb-1">{f.label}</h4>
              <p className="text-slate-400 text-sm">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
