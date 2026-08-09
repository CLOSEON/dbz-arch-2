'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, ChevronDown } from 'lucide-react';

export function TestimonialsFaq() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const testimonials = [
    { name: 'Rahul S.', role: 'Software Engineer', text: 'Dabzzo completely solved my daily lunch problem. The food is strictly home-style and doesn\'t make me feel heavy.', rating: 5 },
    { name: 'Priya M.', role: 'Working Professional', text: 'I love how I can swap meals or skip days without losing money. The live tracking is super accurate too!', rating: 5 },
  ];

  const faqs = [
    { q: 'How does the subscription work?', a: 'You pick a 7-day or 30-day plan, select a kitchen, and we deliver fresh meals daily at your chosen time slot.' },
    { q: 'Can I skip a meal if I am out?', a: 'Yes! You can pause your subscription or skip specific meals directly from the app. You earn credits for skipped meals.' },
    { q: 'Are the kitchens hygienic?', a: 'Absolutely. Every kitchen partner undergoes a strict quality check and regular hygiene audits before onboarding.' },
    { q: 'How do I pay?', a: 'We accept all major UPI, Credit/Debit cards, and Netbanking via our secure Razorpay gateway.' },
  ];

  return (
    <section id="faq" className="py-24 bg-ivory">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Testimonials */}
        <div className="mb-24">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-brand font-bold tracking-wide uppercase text-sm mb-3">Testimonials</h2>
            <h3 className="text-3xl md:text-4xl font-black text-slate-900 leading-tight">
              What our customers are saying.
            </h3>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8">
            {testimonials.map((t, i) => (
              <motion.div 
                key={t.name}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.2 }}
                className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm"
              >
                <div className="flex gap-1 mb-4 text-amber-500">
                  {[...Array(t.rating)].map((_, j) => <Star key={j} className="w-5 h-5 fill-current" />)}
                </div>
                <p className="text-slate-700 text-lg leading-relaxed italic mb-6">"{t.text}"</p>
                <div>
                  <h4 className="font-bold text-slate-900">{t.name}</h4>
                  <p className="text-sm text-slate-500">{t.role}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* FAQ */}
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h3 className="text-3xl font-black text-slate-900 mb-4">Common questions</h3>
            <p className="text-slate-500">Here's what people usually ask us.</p>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, i) => (
              <div key={i} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <button 
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full px-6 py-5 text-left flex justify-between items-center focus:outline-none"
                >
                  <span className="font-bold text-slate-900">{faq.q}</span>
                  <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {openFaq === i && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="px-6 pb-5 text-slate-600 text-sm leading-relaxed"
                    >
                      {faq.a}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
}
