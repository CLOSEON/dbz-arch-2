'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Steam wisp ───────────────────────────────────────────────────────────────
function SteamWisp({ x, delay }: { x: number; delay: number }) {
  return (
    <motion.path
      d={`M${x} 0 Q${x - 6} -10 ${x} -20 Q${x + 6} -30 ${x} -40`}
      stroke="rgba(255,255,255,0.55)"
      strokeWidth="3"
      strokeLinecap="round"
      fill="none"
      initial={{ opacity: 0, scaleY: 0, y: 0 }}
      animate={{ opacity: [0, 0.7, 0], scaleY: [0, 1, 1.2], y: [0, -12, -24] }}
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
      fill="rgba(255,255,255,0.22)"
      initial={{ y: 0, opacity: 0, scale: 0 }}
      animate={{ y: [-2, -10, -18], opacity: [0, 0.8, 0], scale: [0.4, 1, 0.6] }}
      transition={{ repeat: Infinity, duration: 1.6, delay, ease: 'easeOut' }}
    />
  );
}

// ─── Tiffin Box (Indian dabba) ─────────────────────────────────────────────────
// Three-tier stacked tiffin — drawn in SVG using the brand palette
function TiffinSVG({ cooking }: { cooking: boolean }) {
  return (
    <svg
      viewBox="0 0 120 130"
      width={140}
      height={150}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* ── Tier 3 (bottom) ─────────────────── */}
      <rect x="20" y="90" width="80" height="30" rx="6" fill="#FF3B30" />
      <rect x="20" y="90" width="80" height="8" rx="6" fill="#CC2F26" />
      <rect x="16" y="92" width="88" height="6" rx="3" fill="#E6352B" />

      {/* ── Tier 2 (middle) ─────────────────── */}
      <rect x="20" y="58" width="80" height="30" rx="6" fill="#FF5F56" />
      <rect x="20" y="58" width="80" height="8" rx="6" fill="#CC2F26" />
      <rect x="16" y="60" width="88" height="6" rx="3" fill="#FF3B30" />

      {/* ── Tier 1 (top) ────────────────────── */}
      <rect x="20" y="26" width="80" height="30" rx="6" fill="#FF7B73" />
      <rect x="20" y="26" width="80" height="8" rx="6" fill="#FF5F56" />
      <rect x="16" y="28" width="88" height="6" rx="3" fill="#FF5F56" />

      {/* ── Lid ──────────────────────────────── */}
      <rect x="16" y="16" width="88" height="14" rx="7" fill="#CC2F26" />
      {/* Lid handle */}
      <rect x="48" y="8" width="24" height="10" rx="5" fill="#E6352B" />
      <rect x="50" y="6" width="20" height="6" rx="3" fill="#FF3B30" />

      {/* ── Clasp ────────────────────────────── */}
      <rect x="53" y="14" width="14" height="72" rx="3" fill="#FFCC00" opacity="0.85" />
      <rect x="55" y="14" width="10" height="72" rx="2" fill="#FFD700" opacity="0.5" />

      {/* ── Sheen on lid ─────────────────────── */}
      <ellipse cx="60" cy="20" rx="24" ry="4" fill="rgba(255,255,255,0.12)" />

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
          {/* Spoon SVG in brand red/orange */}
          <svg viewBox="0 0 120 40" width={130} height={44}>
            {/* Handle */}
            <rect x="20" y="16" width="78" height="8" rx="4" fill="#FF3B30" />
            {/* Bowl of spoon */}
            <ellipse cx="14" cy="20" rx="14" ry="11" fill="#FF5F56" />
            <ellipse cx="11" cy="18" rx="6" ry="5" fill="rgba(255,255,255,0.25)" />
            {/* Shine on handle */}
            <rect x="30" y="17" width="40" height="3" rx="1.5" fill="rgba(255,255,255,0.3)" />
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
      className="absolute rounded-full"
      style={{
        width: 180,
        height: 180,
        background: 'radial-gradient(circle, rgba(255,59,48,0.18) 0%, transparent 70%)',
      }}
      animate={{ scale: [1, 1.18, 1], opacity: [0.5, 0.9, 0.5] }}
      transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
    />
  );
}

// ─── Dot loader bar ───────────────────────────────────────────────────────────
function DotLoader() {
  return (
    <div className="flex gap-2 items-center">
      {[0, 0.18, 0.36].map((delay, i) => (
        <motion.span
          key={i}
          className="block rounded-full bg-brand"
          style={{ width: 7, height: 7 }}
          animate={{ y: [0, -8, 0], opacity: [0.4, 1, 0.4] }}
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
            <div className="w-24 h-24 rounded-full bg-brand/10 flex items-center justify-center">
              <motion.svg viewBox="0 0 48 48" width={48} height={48}>
                <motion.polyline
                  points="8,26 20,38 40,14"
                  fill="none"
                  stroke="#FF3B30"
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
      <div className="flex flex-col items-center gap-3">
        <AnimatePresence mode="wait">
          <motion.p
            key={wiped ? 'done' : spoonFired ? 'served' : 'cooking'}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className="text-[11px] font-black text-slate-400 tracking-[0.18em] uppercase text-center"
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
          'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(255,59,48,0.06) 0%, transparent 70%), #FEFCE8',
      }}
    >
      <DabzzoLoading />
    </div>
  );
}
