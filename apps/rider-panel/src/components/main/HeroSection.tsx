'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { MapPin, Search } from 'lucide-react';

export function HeroSection() {
  return (
    <section className="relative pt-36 pb-24 lg:pt-48 lg:pb-32 overflow-hidden text-white min-h-[90vh] flex items-center justify-center">
      {/* Background Image & Overlay */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('https://images.unsplash.com/photo-1585937421612-70a008356fbe?q=80&w=3000&auto=format&fit=crop')" }}
      />
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-slate-900/80 via-slate-900/60 to-slate-900/90" />
      
      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 w-full text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, type: 'spring' }}
        >
          <h1 className="text-5xl lg:text-7xl xl:text-[5.5rem] font-black tracking-tight leading-[1.05] mb-6 drop-shadow-sm">
            Order daily meals.<br />
            Discover local chefs.<br />
            Dabzzo it!
          </h1>
          
          <p className="text-lg lg:text-2xl text-white/90 mb-12 max-w-3xl mx-auto font-medium">
            We partner with local chefs to bring you authentic, everyday food.
          </p>
          
          {/* Search Bar - Swiggy Style */}
          <div className="max-w-4xl mx-auto bg-white p-2 rounded-2xl sm:rounded-full shadow-2xl flex flex-col sm:flex-row items-center gap-2">
            
            <div className="flex-1 flex items-center gap-3 px-4 py-4 w-full sm:w-auto border-b sm:border-b-0 sm:border-r border-slate-200">
              <MapPin className="w-6 h-6 text-brand shrink-0" />
              <input 
                type="text" 
                placeholder="Enter your delivery location" 
                className="w-full bg-transparent border-none focus:outline-none text-slate-900 placeholder:text-slate-500 font-medium text-lg"
              />
            </div>
            
            <div className="flex-[1.5] flex items-center gap-3 px-4 py-4 w-full sm:w-auto">
              <Search className="w-6 h-6 text-slate-400 shrink-0" />
              <input 
                type="text" 
                placeholder="Search for kitchens, thalis, or meals" 
                className="w-full bg-transparent border-none focus:outline-none text-slate-900 placeholder:text-slate-500 font-medium text-lg"
              />
            </div>
            
            <Link 
              href="/login" 
              className="w-full sm:w-auto px-10 py-5 bg-slate-900 text-white rounded-xl sm:rounded-full font-black text-xl hover:bg-slate-800 transition-colors shrink-0 text-center"
            >
              Find Food
            </Link>
            
          </div>

          {/* Feature Cards below search (Swiggy style) */}
          <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {[
              { title: 'MEAL PLANS', desc: 'Weekly & Monthly', discount: 'UPTO 20% OFF' },
              { title: 'FRESH THALIS', desc: 'From Local Chefs', discount: 'FREE DELIVERY' },
              { title: 'DIET FOOD', desc: 'Healthy & Keto', discount: 'CUSTOM MACROS' }
            ].map((card, i) => (
              <motion.div 
                key={card.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + (i * 0.1) }}
                className="bg-white rounded-3xl p-6 text-left cursor-pointer hover:scale-105 transition-transform shadow-xl shadow-black/5"
              >
                <h3 className="text-2xl font-black text-slate-900 leading-none mb-1">{card.title}</h3>
                <p className="text-sm font-bold text-slate-500 mb-2">{card.desc}</p>
                <p className="text-brand font-black text-sm uppercase tracking-wider">{card.discount}</p>
              </motion.div>
            ))}
          </div>

        </motion.div>
      </div>
    </section>
  );
}
