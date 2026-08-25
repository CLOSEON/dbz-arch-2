'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Steam wisp ───────────────────────────────────────────────────────────────
function SteamWisp({ x, delay }: { x: number; delay: number }) {
  return (
    <motion.path
      d={`M${x} 0 Q${x - 6} -10 ${x} -20 Q${x + 6} -30 ${x} -40`}
      stroke="rgba(251, 191, 36, 0.65)"
      strokeWidth="3"
      strokeLinecap="round"
      fill="none"
      initial={{ opacity: 0, scaleY: 0, y: 0 }}
      animate={{ opacity: [0, 0.8, 0], scaleY: [0, 1, 1.2], y: [0, -12, -24] }}
      transition={{
        repeat: Infinity,
        duration: 2.2,
        delay,
        ease: 'easeOut',
      }}
      style={{ originY: 1 }}
    />
  );
}

// ─── Bubble ────────────────────────────────────────────────────────────────────
function Bubble({ cx, cy, r, delay }: { cx: number; cy: number; r: number; delay: number }) {
  return (
    <motion.circle
      cx={cx}
      cy={cy}
      r={r}
      fill="rgba(254, 243, 199, 0.4)"
      initial={{ y: 0, opacity: 0, scale: 0 }}
      animate={{ y: [-2, -10, -18], opacity: [0, 0.9, 0], scale: [0.4, 1, 0.6] }}
      transition={{ repeat: Infinity, duration: 1.6, delay, ease: 'easeOut' }}
    />
  );
}

// ─── Tiffin Box (Indian dabba) ─────────────────────────────────────────────────
// Three-tier stacked tiffin — rendered with Dabzzo luxury gold & signature orange gradients
function TiffinSVG({ cooking }: { cooking: boolean }) {
  return (
    <svg
      viewBox="0 0 120 130"
      width={140}
      height={150}
      xmlns="http://www.w3.org/2000/svg"
      className="drop-shadow-lg"
    >
      <defs>
        {/* Tier 3 (Bottom) Gradient: Deep Dabzzo Signature Orange */}
        <linearGradient id="tier3Grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F59E0B" />
          <stop offset="40%" stopColor="#E68A00" />
          <stop offset="100%" stopColor="#B45309" />
        </linearGradient>

        {/* Tier 2 (Middle) Gradient: Vibrant Amber Orange */}
        <linearGradient id="tier2Grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FBBF24" />
          <stop offset="45%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#D97706" />
        </linearGradient>

        {/* Tier 1 (Top) Gradient: Radiant Honey Gold */}
        <linearGradient id="tier1Grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FDE68A" />
          <stop offset="40%" stopColor="#FBBF24" />
          <stop offset="100%" stopColor="#E68A00" />
        </linearGradient>

        {/* Lid Gradient */}
        <linearGradient id="lidGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F59E0B" />
          <stop offset="50%" stopColor="#E68A00" />
          <stop offset="100%" stopColor="#B45309" />
        </linearGradient>

        {/* Metallic Brass Clasp */}
        <linearGradient id="claspGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FDE047" />
          <stop offset="45%" stopColor="#F59E0B" />
          <stop offset="85%" stopColor="#D97706" />
          <stop offset="100%" stopColor="#B45309" />
        </linearGradient>

        {/* Handle Gradient */}
        <linearGradient id="handleGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FBBF24" />
          <stop offset="100%" stopColor="#D97706" />
        </linearGradient>

        {/* Subtle Specular Highlight */}
        <linearGradient id="sheenGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="rgba(255, 255, 255, 0.45)" />
          <stop offset="100%" stopColor="rgba(255, 255, 255, 0.05)" />
        </linearGradient>
      </defs>

      {/* ── Tier 3 (bottom) ─────────────────── */}
      <rect x="20" y="90" width="80" height="30" rx="6" fill="url(#tier3Grad)" />
      <rect x="20" y="90" width="80" height="7" rx="4" fill="#92400E" opacity="0.6" />
      <rect x="16" y="92" width="88" height="5" rx="2.5" fill="#D97706" />
      {/* Specular sheen bottom */}
      <rect x="24" y="96" width="72" height="3" rx="1.5" fill="url(#sheenGrad)" />

      {/* ── Tier 2 (middle) ─────────────────── */}
      <rect x="20" y="58" width="80" height="30" rx="6" fill="url(#tier2Grad)" />
      <rect x="20" y="58" width="80" height="7" rx="4" fill="#B45309" opacity="0.55" />
      <rect x="16" y="60" width="88" height="5" rx="2.5" fill="#D97706" />
      {/* Specular sheen middle */}
      <rect x="24" y="64" width="72" height="3" rx="1.5" fill="url(#sheenGrad)" />

      {/* ── Tier 1 (top) ────────────────────── */}
      <rect x="20" y="26" width="80" height="30" rx="6" fill="url(#tier1Grad)" />
      <rect x="20" y="26" width="80" height="7" rx="4" fill="#D97706" opacity="0.5" />
      <rect x="16" y="28" width="88" height="5" rx="2.5" fill="#F59E0B" />
      {/* Specular sheen top */}
      <rect x="24" y="32" width="72" height="3" rx="1.5" fill="url(#sheenGrad)" />

      {/* ── Lid ──────────────────────────────── */}
      <rect x="16" y="16" width="88" height="14" rx="7" fill="url(#lidGrad)" />
      {/* Lid handle */}
      <rect x="48" y="8" width="24" height="10" rx="5" fill="url(#handleGrad)" />
      <rect x="50" y="6" width="20" height="5" rx="2.5" fill="#FDE047" />

      {/* ── Clasp (Vertical Brass Lock) ────────────────────────────── */}
      <rect x="53" y="14" width="14" height="72" rx="3" fill="url(#claspGrad)" />
      <rect x="55" y="14" width="10" height="72" rx="2" fill="#FEF08A" opacity="0.35" />

      {/* ── Sheen on lid ─────────────────────── */}
      <ellipse cx="60" cy="20" rx="26" ry="3.5" fill="url(#sheenGrad)" />

      {/* ── Steam layer (only when cooking) ─── */}
      {cooking && (
        <g transform="translate(60, 16)">
          <SteamWisp x={-18} delay={0} />
          <SteamWisp x={0} delay={0.5} />
          <SteamWisp x={18} delay={1.0} />
        </g>
      )}

      {/* ── Bubbles inside (peeking above lid) */}
      {cooking && (
        <g>
          <Bubble cx={42} cy={13} r={3} delay={0.2} />
          <Bubble cx={60} cy={10} r={2.5} delay={0.8} />
          <Bubble cx={78} cy={13} r={3} delay={0.4} />
        </g>
      )}
    </svg>
  );
}

// ─── Flying Spoon ─────────────────────────────────────────────────────────────
function FlyingSpoon({ trigger }: { trigger: boolean }) {
  return (
    <AnimatePresence>
      {trigger && (
        <motion.div
          key="spoon"
          className="absolute inset-0 flex items-center pointer-events-none"
          initial={{ x: '-110%', rotate: -20, opacity: 1 }}
          animate={{ x: '140%', rotate: 15, opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Spoon SVG in signature Dabzzo gold/orange */}
          <svg viewBox="0 0 120 40" width={130} height={44}>
            <defs>
              <linearGradient id="spoonGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FDE047" />
                <stop offset="50%" stopColor="#F59E0B" />
                <stop offset="100%" stopColor="#E68A00" />
              </linearGradient>
            </defs>
            {/* Handle */}
            <rect x="20" y="16" width="78" height="8" rx="4" fill="#E68A00" />
            {/* Bowl of spoon */}
            <ellipse cx="14" cy="20" rx="14" ry="11" fill="url(#spoonGrad)" />
            <ellipse cx="11" cy="18" rx="6" ry="5" fill="rgba(255,255,255,0.4)" />
            {/* Shine on handle */}
            <rect x="30" y="17" width="40" height="3" rx="1.5" fill="rgba(255,255,255,0.35)" />
          </svg>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Pulsing glow ring ────────────────────────────────────────────────────────
function GlowRing() {
  return (
    <motion.div
      className="absolute rounded-full pointer-events-none"
      style={{
        width: 190,
        height: 190,
        background: 'radial-gradient(circle, rgba(230, 138, 0, 0.22) 0%, rgba(251, 191, 36, 0.08) 50%, transparent 75%)',
      }}
      animate={{ scale: [1, 1.22, 1], opacity: [0.6, 0.95, 0.6] }}
      transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
    />
  );
}

// ─── Dot loader bar ───────────────────────────────────────────────────────────
function DotLoader() {
  return (
    <div className="flex gap-2.5 items-center">
      {[0, 0.18, 0.36].map((delay, i) => (
        <motion.span
          key={i}
          className="block rounded-full bg-gradient-to-r from-amber-500 to-orange-500 shadow-sm shadow-amber-500/40"
          style={{ width: 8, height: 8 }}
          animate={{ y: [0, -9, 0], scale: [0.85, 1.15, 0.85], opacity: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 0.9, delay, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

// ─── Main exported component ──────────────────────────────────────────────────
export function DabzzoLoading({ onDone }: { onDone?: boolean }) {
  const [spoonFired, setSpoonFired] = useState(false);
  const [wiped, setWiped] = useState(false);

  useEffect(() => {
    // Spoon flies after 3.5 s of "cooking"
    const t1 = setTimeout(() => setSpoonFired(true), 3500);
    // After spoon exits, clear the scene
    const t2 = setTimeout(() => setWiped(true), 4500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  // If parent signals done early, fire immediately
  useEffect(() => {
    if (onDone && !spoonFired) {
      setSpoonFired(true);
      setTimeout(() => setWiped(true), 1000);
    }
  }, [onDone]);

  return (
    <div className="flex flex-col items-center gap-8 select-none">

      {/* Scene */}
      <AnimatePresence mode="wait">
        {!wiped ? (
          <motion.div
            key="scene"
            className="relative flex items-center justify-center"
            style={{ width: 200, height: 200 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ duration: 0.35 }}
          >
            {/* Ambient glow */}
            <GlowRing />

            {/* Tiffin — bounces gently while cooking */}
            <motion.div
              animate={
                spoonFired
                  ? { scale: 0, opacity: 0 }
                  : { y: [0, -6, 0] }
              }
              transition={
                spoonFired
                  ? { duration: 0.25 }
                  : { repeat: Infinity, duration: 2, ease: 'easeInOut' }
              }
              className="absolute"
            >
              <TiffinSVG cooking={!spoonFired} />
            </motion.div>

            {/* Flying spoon */}
            <FlyingSpoon trigger={spoonFired} />
          </motion.div>
        ) : (
          <motion.div
            key="done"
            className="relative flex items-center justify-center"
            style={{ width: 200, height: 200 }}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          >
            {/* Checkmark */}
            <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center shadow-lg shadow-amber-500/10">
              <motion.svg viewBox="0 0 48 48" width={48} height={48}>
                <motion.polyline
                  points="8,26 20,38 40,14"
                  fill="none"
                  stroke="#E68A00"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                />
              </motion.svg>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Label */}
      <div className="flex flex-col items-center gap-3.5">
        <AnimatePresence mode="wait">
          <motion.p
            key={wiped ? 'done' : spoonFired ? 'served' : 'cooking'}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className="text-[12px] font-bold text-amber-950/80 tracking-[0.22em] uppercase text-center drop-shadow-sm"
          >
            {wiped
              ? 'Ready to serve! 🎉'
              : spoonFired
              ? 'Plating your experience...'
              : 'Cooking something delicious...'}
          </motion.p>
        </AnimatePresence>

        {!wiped && <DotLoader />}
      </div>
    </div>
  );
}

export function DabzzoLoadingScreen() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{
        background:
          'radial-gradient(ellipse 80% 60% at 50% 45%, rgba(230, 138, 0, 0.12) 0%, rgba(254, 243, 199, 0.35) 45%, #FAF8F5 100%)',
      }}
    >
      <DabzzoLoading />
    </div>
  );
}
