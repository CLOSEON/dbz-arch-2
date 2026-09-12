"use client";

import { useState, useRef, useEffect } from "react";
import { motion, useMotionValue, useTransform } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";

interface SwipeToConfirmProps {
  onConfirm: () => void;
  text?: string;
  confirmText?: string;
  className?: string;
  disabled?: boolean;
}

export function SwipeToConfirm({
  onConfirm,
  text = "Swipe to Confirm",
  confirmText = "Confirmed",
  className = "",
  disabled = false,
}: SwipeToConfirmProps) {
  const [isConfirmed, setIsConfirmed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Framer Motion values
  const x = useMotionValue(0);
  
  useEffect(() => {
    if (containerRef.current) {
      // Handle width is 48px, so max drag distance is containerWidth - 48
      setContainerWidth(containerRef.current.offsetWidth);
    }
  }, []);

  const dragRange = containerWidth - 56; // 48px handle + 8px padding/margins
  const opacity = useTransform(x, [0, dragRange], [1, 0]);
  const scale = useTransform(x, [0, dragRange], [1, 1.1]);

  const handleDragEnd = () => {
    if (disabled || isConfirmed) return;
    if (x.get() >= dragRange * 0.9) {
      x.set(dragRange);
      setIsConfirmed(true);
      if (onConfirm) {
        onConfirm();
      }
    } else {
      // Snap back
      x.set(0);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-14 bg-slate-900/40 border border-slate-800/80 rounded-full p-1 flex items-center justify-between select-none overflow-hidden ${
        disabled ? "opacity-50 pointer-events-none" : ""
      } ${className}`}
    >
      {/* Background slide color fill */}
      <motion.div
        className="absolute left-0 top-0 bottom-0 bg-brand/20 rounded-full"
        style={{ width: useTransform(x, [0, dragRange], [48, containerWidth]) }}
      />

      {/* Slide Text */}
      <motion.div
        style={{ opacity }}
        className="absolute inset-0 flex items-center justify-center text-xs font-black uppercase tracking-[0.15em] text-slate-400 pointer-events-none"
      >
        {text}
      </motion.div>

      {/* Draggable Handle */}
      {!isConfirmed ? (
        <motion.div
          drag="x"
          dragConstraints={{ left: 0, right: dragRange }}
          dragElastic={0.05}
          dragMomentum={false}
          style={{ x, scale }}
          onDragEnd={handleDragEnd}
          className="z-10 w-12 h-12 bg-brand rounded-full flex items-center justify-center cursor-grab active:cursor-grabbing shadow-lg"
        >
          <ArrowRight className="text-white w-5 h-5" />
        </motion.div>
      ) : (
        <div className="z-10 w-full h-full flex items-center justify-center gap-2 bg-emerald-500 rounded-full text-white text-xs font-black uppercase tracking-[0.15em] animate-fade-in">
          <Check className="w-5 h-5 animate-bounce" />
          {confirmText}
        </div>
      )}

      {/* Placeholder to keep alignment */}
      {!isConfirmed && <div className="w-12 h-12" />}
    </div>
  );
}
