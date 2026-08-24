'use client';

import { motion } from 'framer-motion';
import { BadgeCheck, Utensils, ShieldCheck } from 'lucide-react';

export function AboutDabzzo() {
  const points = [
    {
      icon: Utensils,
      title: 'Home-style Cooking',
      desc: 'We partner with local kitchens that focus on everyday, comforting meals.'
    },
    {
      icon: ShieldCheck,
      title: 'Strict Quality Checks',
      desc: 'We personally vet every kitchen for quality, taste, and cleanliness before they join.'
    },
    {
      icon: BadgeCheck,
      title: 'Reliable Deliveries',
      desc: 'Forget deciding what to order every day. Set up your plan once and let us handle your daily meals.'
    }
  ];

  return (
    <section id="about" className="py-24 bg-ivory">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-brand font-bold tracking-wide uppercase text-sm mb-3">What is Dabzzo?</h2>
          <h3 className="text-3xl md:text-4xl font-black text-slate-900 leading-tight">
            A food subscription that actually works for you.
          </h3>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {points.map((point, i) => (
            <motion.div 
              key={point.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.2, duration: 0.6 }}
              className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 text-center hover:shadow-lg transition-shadow"
            >
              <div className="w-16 h-16 bg-brand/10 text-brand rounded-2xl flex items-center justify-center mx-auto mb-6">
                <point.icon className="w-8 h-8" />
              </div>
              <h4 className="text-xl font-bold text-slate-900 mb-3">{point.title}</h4>
              <p className="text-slate-500 leading-relaxed text-sm">
                {point.desc}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
