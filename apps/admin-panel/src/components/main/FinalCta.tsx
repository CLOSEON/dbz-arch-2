'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export function FinalCta() {
  return (
    <section className="py-24 bg-slate-900 text-white relative overflow-hidden">
      {/* Decorative background */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-brand/20 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-4xl md:text-6xl font-black mb-6 leading-tight">
            Ready to simplify your daily meals?
          </h2>
          <p className="text-xl text-slate-400 mb-10 max-w-2xl mx-auto">
            Join thousands of subscribers enjoying hot, fresh, home-cooked food delivered every single day.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link 
              href="/login" 
              className="w-full sm:w-auto px-10 py-5 bg-brand text-white rounded-full font-black text-lg shadow-xl shadow-brand/30 hover:bg-brand-600 hover:scale-105 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              Order Now <ArrowRight className="w-5 h-5" />
            </Link>
            
            <Link 
              href="#kitchen-partners" 
              className="w-full sm:w-auto px-10 py-5 bg-white/5 text-white border border-white/10 rounded-full font-black text-lg hover:bg-white/10 transition-all active:scale-95 flex items-center justify-center"
            >
              Join as Kitchen Partner
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
