'use client';

import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import Link from 'next/link';

export function PricingPlans() {
  const plans = [
    {
      name: 'Weekly Trial',
      price: 'Varies by Kitchen',
      duration: 'Billed Weekly',
      desc: 'Perfect for trying out our service with no long-term commitment.',
      features: ['7 Days of Meals', 'Choose any kitchen', 'Free Delivery', '1 Free Meal Swap'],
      cta: 'Start 1-Week Plan',
      popular: false
    },
    {
      name: 'Monthly Pro',
      price: 'Varies by Kitchen',
      duration: 'Billed Monthly',
      desc: 'Our most popular plan for daily commuters and busy professionals.',
      features: ['30 Days of Meals', 'Priority Kitchen Selection', 'Free Delivery', '5 Free Meal Swaps', 'Pause anytime (up to 5 days)'],
      cta: 'Subscribe Monthly',
      popular: true
    }
  ];

  return (
    <section id="pricing" className="py-24 bg-slate-950 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-brand font-bold tracking-wide uppercase text-sm mb-3">Subscription Plans</h2>
          <h3 className="text-3xl md:text-4xl font-black text-white leading-tight">
            Simple, transparent pricing.
          </h3>
          <p className="mt-4 text-slate-400">Cancel or pause your subscription anytime. No hidden fees.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {plans.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.2, duration: 0.5 }}
              className={`relative bg-slate-900 rounded-3xl p-8 border ${plan.popular ? 'border-brand shadow-2xl shadow-brand/20' : 'border-slate-800'}`}
            >
              {plan.popular && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-brand text-white px-4 py-1 rounded-full text-xs font-bold tracking-wider uppercase">
                  Most Popular
                </div>
              )}
              
              <h4 className="text-2xl font-bold mb-2">{plan.name}</h4>
              <p className="text-slate-400 text-sm mb-6 h-10">{plan.desc}</p>
              
              <div className="mb-8">
                <span className="text-2xl font-black text-white">{plan.price}</span>
                <span className="block text-slate-400 text-sm font-semibold mt-1">{plan.duration}</span>
              </div>
              
              <ul className="space-y-4 mb-10">
                {plan.features.map(feat => (
                  <li key={feat} className="flex items-center gap-3 text-slate-300">
                    <div className="w-5 h-5 rounded-full bg-brand/20 text-brand flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3" />
                    </div>
                    <span className="text-sm">{feat}</span>
                  </li>
                ))}
              </ul>
              
              <Link
                href="/login"
                className={`block w-full text-center py-4 rounded-xl font-bold transition-all ${
                  plan.popular 
                    ? 'bg-brand text-white hover:bg-brand-600' 
                    : 'bg-slate-800 text-white hover:bg-slate-700'
                }`}
              >
                {plan.cta}
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
