'use client';

import { motion } from 'framer-motion';

export function BackgroundBlobs() {
  return (
    <div className="fixed inset-0 overflow-hidden -z-10 pointer-events-none">
      {/* Primary Blob */}
      <motion.div
        animate={{
          x: [0, 100, 0],
          y: [0, 50, 0],
          scale: [1, 1.2, 1],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: "linear",
        }}
        className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-brand/5 blur-[120px]"
      />
      
      {/* Secondary Blob */}
      <motion.div
        animate={{
          x: [0, -80, 0],
          y: [0, 120, 0],
          scale: [1, 1.1, 1],
        }}
        transition={{
          duration: 25,
          repeat: Infinity,
          ease: "linear",
        }}
        className="absolute bottom-[-10%] right-[-5%] w-[60%] h-[60%] rounded-full bg-brand-secondary/5 blur-[150px]"
      />

      {/* Tertiary Blob */}
      <motion.div
        animate={{
          x: [0, 50, 0],
          y: [0, -100, 0],
          scale: [1, 1.3, 1],
        }}
        transition={{
          duration: 18,
          repeat: Infinity,
          ease: "linear",
        }}
        className="absolute top-[20%] right-[-10%] w-[40%] h-[40%] rounded-full bg-[#FFE8DC]/10 blur-[100px]"
      />
    </div>
  );
}
