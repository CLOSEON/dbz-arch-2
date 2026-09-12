'use client';

import { motion } from 'framer-motion';

export function HowItWorks() {
  const steps = [
    { num: '01', title: 'Pick a Plan', desc: 'Pick a 7-day or 30-day plan that fits your schedule.' },
    { num: '02', title: 'Select a Kitchen', desc: 'Explore menus from local chefs and lock in your favorite kitchen.' },
    { num: '03', title: 'Manage Deliveries', desc: 'Going out? Pause your delivery. Craving something else? Swap your meal for the day.' },
    { num: '04', title: 'Enjoy Daily', desc: 'Your food arrives fresh at your chosen time slot, every single day.' }
  ];

  return (
    <section id="how-it-works" className="py-24 bg-white border-y border-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-brand font-bold tracking-wide uppercase text-sm mb-3">How it Works</h2>
          <h3 className="text-3xl md:text-4xl font-black text-slate-900 leading-tight">
            Getting started is easy.
          </h3>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 relative">
          {/* Connector Line (Desktop) */}
          <div className="hidden lg:block absolute top-12 left-0 w-full h-0.5 bg-slate-100 -z-10" />

          {steps.map((step, i) => (
            <motion.div 
              key={step.num}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.15, duration: 0.5 }}
              className="relative"
            >
              <div className="w-24 h-24 bg-white border-4 border-ivory shadow-lg rounded-full flex items-center justify-center text-3xl font-black text-brand mx-auto mb-6 z-10">
                {step.num}
              </div>
              <h4 className="text-lg font-bold text-slate-900 text-center mb-2">{step.title}</h4>
              <p className="text-sm text-slate-500 text-center leading-relaxed max-w-xs mx-auto">
                {step.desc}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
