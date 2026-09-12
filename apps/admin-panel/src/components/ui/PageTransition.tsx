"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";
import { usePathname } from "next/navigation";

interface PageTransitionProps {
  children: ReactNode;
}

export const PageTransition = ({ children }: PageTransitionProps) => {
  const pathname = usePathname();

  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        type: "spring",
        stiffness: 260,
        damping: 20,
        duration: 0.3
      }}
      className="w-full h-full"
    >
      {children}
    </motion.div>
  );
};
