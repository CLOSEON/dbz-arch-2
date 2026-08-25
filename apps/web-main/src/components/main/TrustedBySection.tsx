'use client';

import { motion } from 'framer-motion';

export function TrustedBySection() {
  const stats = [
    { label: 'Meals Delivered', value: '100k+' },
    { label: 'Active Subscribers', value: '10k+' },
    { label: 'Verified Kitchens', value: '50+' },
    { label: 'Delivery Partners', value: '200+' },
  ];

  return (
    <section className="py-16 bg-white border-y border-slate-100 relative z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-center text-sm font-bold text-slate-400 uppercase tracking-widest mb-10">
          Trusted by the best in the city
        </p>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 lg:gap-12 text-center">
          {stats.map((stat, i) => (
            <motion.div 
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
            >
              <div className="text-3xl lg:text-4xl font-black text-slate-900 mb-1">
                {stat.value}
              </div>
              <div className="text-sm font-semibold text-slate-500">
                {stat.label}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
