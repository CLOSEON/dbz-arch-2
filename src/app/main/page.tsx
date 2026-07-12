'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion, useScroll, useTransform, AnimatePresence, type Variants } from 'framer-motion';
import {
  ArrowRight,
  BadgeCheck,
  CalendarCheck2,
  Clock3,
  MapPin,
  ShieldCheck,
  Sparkles,
  Star,
  Truck,
  Utensils,
  ChevronRight,
  Download
} from 'lucide-react';
import { VendorOnboardingWalkthrough } from '@/components/vendor/VendorOnboardingWalkthrough';

const highlights = [
  { label: 'Daily menus', value: 'Freshly planned', icon: Utensils },
  { label: 'Live tracking', value: 'Know every delivery', icon: Truck },
  { label: 'Flexible plans', value: 'Pause or renew fast', icon: CalendarCheck2 },
];

const steps = [
  {
    title: 'Sign in with your mobile',
    copy: 'OTP login keeps onboarding quick, familiar, and secure for every subscriber.',
  },
  {
    title: 'Choose your meal partner',
    copy: 'Browse approved kitchens, compare meal rates, and pick the plan that fits your week.',
  },
  {
    title: 'Track every delivery',
    copy: 'Subscription status, OTP proof, and delivery updates stay inside one clean app.',
  },
];

const proof = [
  'Verified vendors',
  'Admin-managed subscriptions',
  'Delivery OTP protection',
  'Support built into every account',
];

// Animation variants
const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } },
};

const scaleUp: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  show: { opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 24 } },
};

export default function LandingPage() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 500], [0, 150]);
  const opacity = useTransform(scrollY, [0, 300], [1, 0]);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <main className="min-h-screen overflow-hidden bg-ivory text-slate-950 selection:bg-brand/20 selection:text-brand-700">
      {/* Dynamic Navbar */}
      <motion.nav
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled
            ? 'bg-white/70 backdrop-blur-xl shadow-[0_4px_30px_rgba(0,0,0,0.03)] py-3 border-b border-white/50'
            : 'bg-transparent py-5'
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3 group" aria-label="Dabzzo home">
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-brand/10 bg-white shadow-[0_8px_20px_rgba(255,59,48,0.08)] transition-transform group-hover:scale-105 group-hover:shadow-[0_8px_25px_rgba(255,59,48,0.15)]">
              <Image src="/assets/dabzzo-logo.png" alt="" width={26} height={26} priority className="rounded-full object-contain" />
            </span>
            <span className="text-lg font-black tracking-tight text-slate-900">Dabzzo</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="#how-it-works" className="hidden text-sm font-bold text-slate-600 transition-colors hover:text-brand sm:block">
              How it works
            </Link>
            <div className="flex items-center gap-3">
              <a href="/app.apk" download className="group relative inline-flex items-center justify-center overflow-hidden rounded-full bg-white border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-900 transition-all hover:bg-slate-50 hover:shadow-sm active:scale-95">
                <span className="flex items-center gap-2">
                  <Download className="h-4 w-4" /> Download APK
                </span>
              </a>
              <Link href="/login" className="group relative inline-flex items-center justify-center overflow-hidden rounded-full bg-slate-900 px-5 py-2.5 text-sm font-bold text-white transition-transform hover:scale-105 hover:shadow-[0_8px_25px_rgba(15,23,42,0.15)] active:scale-95">
                <span className="absolute inset-0 h-full w-full bg-gradient-to-r from-brand to-brand-600 opacity-0 transition-opacity group-hover:opacity-100"></span>
                <span className="relative flex items-center gap-2">
                  Sign in <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            </div>
          </div>
        </div>
      </motion.nav>

      {/* Hero Section */}
      <section className="relative isolate min-h-screen pt-32 pb-20 px-4 sm:px-6 lg:px-8 lg:pt-40">
        <motion.div style={{ y, opacity }} className="absolute inset-x-0 top-0 -z-10 h-[60rem] opacity-60">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,59,48,0.12),transparent_40%),radial-gradient(circle_at_top_right,rgba(255,204,0,0.12),transparent_40%),radial-gradient(circle_at_bottom_center,rgba(59,130,246,0.08),transparent_50%)]" />
        </motion.div>

        <div className="mx-auto max-w-7xl">
          <div className="grid items-center gap-16 lg:grid-cols-[1.1fr_0.9fr] lg:gap-8">
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="show"
              className="max-w-3xl"
            >
              <motion.div variants={fadeInUp} className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand/20 bg-white/60 backdrop-blur-md px-4 py-2.5 text-[11px] font-black uppercase tracking-[0.16em] text-brand shadow-[0_4px_20px_rgba(255,59,48,0.1)]">
                <Sparkles className="h-4 w-4" />
                Built for daily tiffin subscriptions
              </motion.div>

              <motion.h1 variants={fadeInUp} className="max-w-3xl text-5xl font-black leading-[0.95] tracking-tighter text-slate-900 sm:text-7xl lg:text-[5rem] xl:text-[5.5rem]">
                Lunch on <br className="hidden sm:block" />
                <span className="relative inline-block text-transparent bg-clip-text bg-gradient-to-r from-brand to-brand-500">autopilot.</span>
              </motion.h1>
              
              <motion.p variants={fadeInUp} className="mt-6 max-w-2xl text-xl font-extrabold leading-tight text-slate-700 sm:text-2xl">
                Subscribe to dependable daily meals from trusted local kitchens, managed entirely in one app.
              </motion.p>
              
              <motion.p variants={fadeInUp} className="mt-5 max-w-xl text-base font-semibold leading-relaxed text-slate-500">
                Dabzzo brings customers, vendors, admins, and delivery teams into one disciplined workflow: clean onboarding, managed subscriptions, live visibility, and instant support.
              </motion.p>
              
              <motion.div variants={fadeInUp} className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
                <Link href="/login" className="group relative inline-flex items-center justify-center overflow-hidden rounded-full bg-brand px-8 py-4 text-base font-black text-white shadow-[0_8px_30px_rgba(255,59,48,0.3)] transition-transform hover:scale-105 active:scale-95 sm:w-auto">
                  <span className="absolute inset-0 h-full w-full bg-gradient-to-r from-brand-600 to-brand-500 opacity-0 transition-opacity group-hover:opacity-100"></span>
                  <span className="relative flex items-center gap-2">
                    Start subscribing
                    <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                  </span>
                </Link>
                <button
                  onClick={() => setIsOnboardingOpen(true)}
                  className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-8 py-4 text-base font-bold text-slate-900 shadow-[0_4px_20px_rgba(15,23,42,0.05)] transition-all hover:bg-slate-50 hover:shadow-[0_8px_30px_rgba(15,23,42,0.08)] active:scale-95 sm:w-auto"
                >
                  Join as Partner Kitchen
                </button>
              </motion.div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 25, delay: 0.3 }}
              className="relative mx-auto w-full max-w-md lg:max-w-lg lg:ml-auto"
            >
              {/* Decorative background blur */}
              <div className="absolute inset-0 -m-8 scale-95 transform rounded-full bg-gradient-to-tr from-brand/20 to-brand-secondary/20 blur-3xl" />
              
              <motion.div 
                animate={{ y: [0, -12, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -left-6 top-10 z-10 hidden rounded-2xl border border-emerald-100 bg-white/90 backdrop-blur-md px-4 py-3 shadow-[0_16px_34px_rgba(15,23,42,0.06)] sm:block"
              >
                <div className="flex items-center gap-2">
                  <BadgeCheck className="h-5 w-5 text-emerald-500" />
                  <span className="text-sm font-black text-slate-900">Vendor approved</span>
                </div>
              </motion.div>
              
              <motion.div 
                animate={{ y: [0, 10, 0] }}
                transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                className="relative z-0 rounded-[2.5rem] border-[6px] border-white/40 bg-white/40 p-2 backdrop-blur-xl shadow-[0_28px_80px_rgba(15,23,42,0.08)]"
              >
                <div className="overflow-hidden rounded-[2rem] bg-slate-950 shadow-inner">
                  <div className="bg-brand px-6 py-5 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10" />
                    <div className="flex items-center justify-between gap-4 relative z-10">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/80">Today's plan</p>
                        <p className="mt-1.5 text-2xl font-black text-white">North Indian Lunch</p>
                      </div>
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-md">
                        <Utensils className="h-6 w-6 text-white" />
                      </div>
                    </div>
                  </div>
                  <div className="bg-white p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-base font-black text-slate-900">Roti, dal, sabzi, rice</p>
                        <p className="mt-1.5 flex items-center gap-1.5 text-xs font-bold text-slate-500">
                          <MapPin className="h-3.5 w-3.5 text-brand" /> Delivery window 12:30-1:15 PM
                        </p>
                      </div>
                      <div className="rounded-full bg-brand-secondary/20 px-3 py-1.5 text-xs font-black text-brand-700">Active</div>
                    </div>
                    <div className="mt-6 grid grid-cols-3 gap-3">
                      {['Mon', 'Tue', 'Wed'].map((day, index) => (
                        <div key={day} className={`rounded-2xl border p-3 text-center transition-transform hover:scale-105 ${index < 2 ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-brand/15 bg-brand-50 text-brand'}`}>
                          <CheckMark active={index < 2} />
                          <p className="mt-2 text-xs font-black">{day}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 p-5 shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Delivery status</span>
                        <Clock3 className="h-4 w-4 text-brand" />
                      </div>
                      <div className="mt-4 h-2.5 rounded-full bg-slate-200 overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: '66%' }}
                          transition={{ duration: 1.5, delay: 0.8, ease: 'easeOut' }}
                          className="h-full rounded-full bg-brand relative"
                        >
                          <div className="absolute inset-0 bg-white/20 w-full h-full animate-pulse" />
                        </motion.div>
                      </div>
                      <p className="mt-3.5 text-sm font-extrabold text-slate-900">Rider assigned. OTP required on handoff.</p>
                    </div>
                  </div>
                </div>
              </motion.div>

              <motion.div 
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                className="absolute -bottom-4 -right-4 z-10 rounded-2xl border border-amber-100 bg-white/90 backdrop-blur-md px-4 py-3 shadow-[0_16px_34px_rgba(15,23,42,0.06)]"
              >
                <div className="flex items-center gap-2">
                  <Star className="h-5 w-5 fill-brand-secondary text-brand-secondary" />
                  <span className="text-sm font-black text-slate-900">4.8 meal rating</span>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Why Choose Dabzzo */}
      <section className="bg-white py-20 sm:py-24 lg:py-32 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-brand/5 rounded-full blur-[100px] -z-10" />
        
        <motion.div 
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-100px" }}
          variants={staggerContainer}
          className="mx-auto max-w-7xl"
        >
          <div className="text-center max-w-3xl mx-auto mb-16">
            <motion.h2 variants={fadeInUp} className="text-3xl font-black text-slate-900 sm:text-5xl tracking-tight">
              Why choose Dabzzo?
            </motion.h2>
            <motion.p variants={fadeInUp} className="mt-6 text-lg font-medium text-slate-500 sm:text-xl">
              We combine tasty meals, reliable delivery, and transparent pricing to keep you nourished and focused on your day.
            </motion.p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {[
              { title: 'Freshly prepared', desc: 'Our partner kitchens use daily‑made ingredients for authentic, healthy flavors.', icon: Utensils, color: 'text-orange-500', bg: 'bg-orange-50' },
              { title: 'Live tracking', desc: 'Know exactly when your meal arrives with real‑time GPS updates and accurate ETAs.', icon: Truck, color: 'text-blue-500', bg: 'bg-blue-50' },
              { title: 'Secure deliveries', desc: 'All transactions are encrypted, and our OTP verification protects every single delivery handoff.', icon: ShieldCheck, color: 'text-emerald-500', bg: 'bg-emerald-50' },
            ].map((feature, i) => (
              <motion.div 
                key={feature.title}
                variants={scaleUp}
                className="group relative rounded-3xl border border-slate-100 bg-white p-8 shadow-[0_8px_30px_rgba(0,0,0,0.04)] transition-all hover:-translate-y-2 hover:shadow-[0_20px_40px_rgba(0,0,0,0.08)]"
              >
                <div className={`mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl ${feature.bg} transition-transform group-hover:scale-110`}>
                  <feature.icon className={`h-7 w-7 ${feature.color}`} />
                </div>
                <h3 className="text-2xl font-black text-slate-900">{feature.title}</h3>
                <p className="mt-4 text-base font-medium leading-relaxed text-slate-500">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="bg-ivory px-4 py-20 sm:px-6 lg:px-8 lg:py-32 relative z-10 border-t border-slate-200/50">
        <motion.div 
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-100px" }}
          variants={staggerContainer}
          className="mx-auto grid max-w-7xl gap-16 lg:grid-cols-[0.8fr_1.2fr] lg:items-start"
        >
          <motion.div variants={fadeInUp} className="sticky top-32">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-brand/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-brand">
              How it works
            </div>
            <h2 className="text-4xl font-black tracking-tight text-slate-900 sm:text-5xl leading-[1.1]">
              From visit to <br /> subscription in minutes.
            </h2>
            <p className="mt-6 text-lg font-medium leading-relaxed text-slate-500">
              The platform builds trust immediately, moving you straight to a secure OTP sign-in where you can create an account and manage your daily meals effortlessly.
            </p>
          </motion.div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {steps.map((step, index) => (
              <motion.article 
                key={step.title} 
                variants={fadeInUp}
                className="group relative overflow-hidden rounded-3xl border border-slate-200/60 bg-white p-8 shadow-sm transition-all hover:border-brand/30 hover:shadow-md"
              >
                <div className="absolute top-0 left-0 w-1 h-full bg-slate-100 transition-colors group-hover:bg-brand" />
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-lg font-black text-white shadow-md transition-transform group-hover:scale-110 group-hover:bg-brand">
                  {index + 1}
                </span>
                <h3 className="mt-6 text-xl font-black text-slate-900">{step.title}</h3>
                <p className="mt-3 text-base font-medium leading-relaxed text-slate-500">{step.copy}</p>
              </motion.article>
            ))}
          </div>
        </motion.div>
      </section>

      {/* CTA Section */}
      <section className="relative px-4 py-20 sm:px-6 lg:px-8 bg-slate-900 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-brand/30 rounded-full blur-[100px]" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-blue-500/20 rounded-full blur-[100px]" />
        
        <motion.div 
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          variants={fadeInUp}
          className="relative mx-auto max-w-5xl text-center z-10"
        >
          <h2 className="text-4xl font-black tracking-tight text-white sm:text-6xl">
            Ready to put lunch on autopilot?
          </h2>
          <p className="mt-6 mx-auto max-w-2xl text-xl font-medium leading-relaxed text-slate-300">
            Sign in securely with your phone number, choose your role, and continue inside the Dabzzo ecosystem.
          </p>
          
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            {proof.map((item) => (
              <span key={item} className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-md border border-white/10 px-4 py-2 text-sm font-bold text-white shadow-sm">
                <ShieldCheck className="h-4 w-4 text-brand-400" />
                {item}
              </span>
            ))}
          </div>
          
          <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href="/app.apk" download className="group relative inline-flex items-center justify-center overflow-hidden rounded-full bg-white/10 backdrop-blur-md border border-white/20 px-10 py-5 text-lg font-black text-white shadow-sm transition-transform hover:bg-white/20 hover:scale-105 active:scale-95">
              <span className="relative flex items-center gap-2">
                <Download className="h-5 w-5" /> Download APK
              </span>
            </a>
            <Link href="/login" className="group relative inline-flex items-center justify-center overflow-hidden rounded-full bg-brand px-10 py-5 text-lg font-black text-white shadow-[0_8px_30px_rgba(255,59,48,0.4)] transition-transform hover:scale-105 active:scale-95">
              <span className="absolute inset-0 h-full w-full bg-gradient-to-r from-brand-600 to-brand-500 opacity-0 transition-opacity group-hover:opacity-100"></span>
              <span className="relative flex items-center gap-2">
                Sign in to start
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          </div>
        </motion.div>
      </section>
      {/* Vendor Onboarding Walkthrough Wizard */}
      <VendorOnboardingWalkthrough 
        isOpen={isOnboardingOpen} 
        onClose={() => setIsOnboardingOpen(false)} 
      />
    </main>
  );
}

function CheckMark({ active }: { active: boolean }) {
  if (!active) {
    return <span className="mx-auto block h-6 w-6 rounded-full border-2 border-slate-300" aria-hidden="true" />;
  }
  return (
    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 400, damping: 17 }}>
      <BadgeCheck className="mx-auto h-6 w-6" aria-hidden="true" />
    </motion.div>
  );
}

