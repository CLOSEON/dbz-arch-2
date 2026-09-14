'use client';

import { motion } from 'framer-motion';
import { Leaf, Flame, Heart, Coffee } from 'lucide-react';

export function MealCategories() {
  const categories = [
    { name: 'North Indian', desc: 'Rich curries, rotis, and classic flavors.', icon: Flame, color: 'bg-orange-50 text-orange-600' },
    { name: 'South Indian', desc: 'Authentic dosas, idlis, and traditional meals.', icon: Coffee, color: 'bg-amber-50 text-amber-600' },
    { name: 'Healthy & Keto', desc: 'Calorie-counted, high protein macro meals.', icon: Heart, color: 'bg-rose-50 text-rose-600' },
    { name: 'Pure Veg', desc: '100% vegetarian home-style daily cooking.', icon: Leaf, color: 'bg-emerald-50 text-emerald-600' },
  ];

  return (
    <section id="meal-plans" className="py-24 bg-ivory">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-brand font-bold tracking-wide uppercase text-sm mb-3">Meal Categories</h2>
          <h3 className="text-3xl md:text-4xl font-black text-slate-900 leading-tight">
            Something for every palate.
          </h3>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {categories.map((cat, i) => (
            <motion.div
              key={cat.name}
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.4 }}
              className="bg-white p-6 rounded-3xl border border-slate-100 hover:shadow-xl transition-all group cursor-pointer"
            >
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-5 ${cat.color} group-hover:scale-110 transition-transform`}>
                <cat.icon className="w-7 h-7" />
              </div>
              <h4 className="text-xl font-bold text-slate-900 mb-2">{cat.name}</h4>
              <p className="text-sm text-slate-500">{cat.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
