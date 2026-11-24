import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ZX_LOGO_SRC } from './ZxLogo';

export function SplashScreen({
  visible,
  onComplete,
}: {
  visible: boolean;
  onComplete?: () => void;
}) {
  useEffect(() => {
    if (!visible || !onComplete) return;
    const timer = setTimeout(() => {
      onComplete();
    }, 3500);
    return () => clearTimeout(timer);
  }, [visible, onComplete]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="zx-digi-mitra-splash"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.45, ease: 'easeInOut' } }}
          className="fixed inset-0 z-[100] bg-[#080810] flex flex-col items-center justify-center px-6 overflow-hidden select-none"
        >
          {/* Multi-Directional Converging Color Streams */}
          {/* Top-Left: Neon Purple */}
          <motion.div
            initial={{ x: '-60vw', y: '-55vh', scale: 0.5, opacity: 0 }}
            animate={{ x: ['-60vw', '0vw', '0vw'], y: ['-55vh', '0vh', '0vh'], scale: [0.6, 1.15, 0.9], opacity: [0, 0.9, 0.25] }}
            transition={{ duration: 1.5, times: [0, 0.65, 1], ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-none absolute w-80 h-80 rounded-full blur-[90px] bg-[#792BFF]"
          />

          {/* Top-Right: Electric Pink */}
          <motion.div
            initial={{ x: '60vw', y: '-55vh', scale: 0.5, opacity: 0 }}
            animate={{ x: ['60vw', '0vw', '0vw'], y: ['-55vh', '0vh', '0vh'], scale: [0.6, 1.15, 0.9], opacity: [0, 0.9, 0.25] }}
            transition={{ duration: 1.5, delay: 0.08, times: [0, 0.65, 1], ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-none absolute w-80 h-80 rounded-full blur-[90px] bg-[#FF28B9]"
          />

          {/* Bottom-Left: Electric Cyan */}
          <motion.div
            initial={{ x: '-60vw', y: '55vh', scale: 0.5, opacity: 0 }}
            animate={{ x: ['-60vw', '0vw', '0vw'], y: ['55vh', '0vh', '0vh'], scale: [0.6, 1.1, 0.85], opacity: [0, 0.85, 0.2] }}
            transition={{ duration: 1.5, delay: 0.14, times: [0, 0.65, 1], ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-none absolute w-72 h-72 rounded-full blur-[90px] bg-[#00D4FF]"
          />

          {/* Bottom-Right: Metallic Silver */}
          <motion.div
            initial={{ x: '60vw', y: '55vh', scale: 0.5, opacity: 0 }}
            animate={{ x: ['60vw', '0vw', '0vw'], y: ['55vh', '0vh', '0vh'], scale: [0.6, 1.05, 0.75], opacity: [0, 0.75, 0.18] }}
            transition={{ duration: 1.5, delay: 0.2, times: [0, 0.65, 1], ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-none absolute w-72 h-72 rounded-full blur-[90px] bg-[#E8E8F2]"
          />

          {/* Crisp Light Streaks converging from left, right, top, bottom */}
          <motion.div
            initial={{ scaleX: 0, opacity: 0, x: '-45vw' }}
            animate={{ scaleX: [0, 1.2, 0], opacity: [0, 1, 0], x: ['-45vw', '0vw', '0vw'] }}
            transition={{ duration: 1.15, ease: 'easeOut' }}
            className="pointer-events-none absolute h-[2px] w-72 bg-gradient-to-r from-transparent via-[#792BFF] to-[#E8E8F2]"
          />
          <motion.div
            initial={{ scaleX: 0, opacity: 0, x: '45vw' }}
            animate={{ scaleX: [0, 1.2, 0], opacity: [0, 1, 0], x: ['45vw', '0vw', '0vw'] }}
            transition={{ duration: 1.15, ease: 'easeOut' }}
            className="pointer-events-none absolute h-[2px] w-72 bg-gradient-to-l from-transparent via-[#FF28B9] to-[#E8E8F2]"
          />
          <motion.div
            initial={{ scaleY: 0, opacity: 0, y: '-45vh' }}
            animate={{ scaleY: [0, 1.2, 0], opacity: [0, 0.9, 0], y: ['-45vh', '0vh', '0vh'] }}
            transition={{ duration: 1.15, delay: 0.08, ease: 'easeOut' }}
            className="pointer-events-none absolute w-[2px] h-72 bg-gradient-to-b from-transparent via-[#00D4FF] to-white"
          />

          {/* Central Logo Assembly */}
          <div className="relative z-10 flex flex-col items-center text-center">
            {/* Expanding Halo Ring */}
            <motion.div
              initial={{ scale: 0.2, opacity: 0 }}
              animate={{ scale: [0.2, 1.25, 1.05], opacity: [0, 0.8, 0.35] }}
              transition={{ duration: 1.2, delay: 0.75, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-none absolute -top-5 w-40 h-40 rounded-full border border-white/25 shadow-[0_0_60px_rgba(121,43,255,0.55)]"
            />

            {/* Assembled ZX Logo Icon */}
            <motion.div
              initial={{ scale: 0.35, opacity: 0, rotate: -22 }}
              animate={{ scale: [0.35, 1.08, 1], opacity: 1, rotate: 0 }}
              transition={{ duration: 0.95, delay: 0.85, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-28 h-28 rounded-[28px] overflow-hidden ring-2 ring-[#E8E8F2]/35 shadow-2xl shadow-[#792BFF]/40 mb-5 bg-[#080810]"
            >
              <img
                src={ZX_LOGO_SRC}
                alt="ZX — India's Social Universe"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              <motion.div
                initial={{ x: '-140%', opacity: 0 }}
                animate={{ x: '160%', opacity: [0, 0.65, 0] }}
                transition={{ duration: 1.1, delay: 1.45, ease: 'easeInOut' }}
                className="pointer-events-none absolute inset-y-0 w-12 -skew-x-12 bg-gradient-to-r from-transparent via-white/45 to-transparent"
              />
            </motion.div>

            {/* Brand Title */}
            <motion.h1
              initial={{ opacity: 0, y: 14, letterSpacing: '0.3em' }}
              animate={{ opacity: 1, y: 0, letterSpacing: '0.06em' }}
              transition={{ duration: 0.65, delay: 1.35, ease: [0.16, 1, 0.3, 1] }}
              className="font-display text-4xl sm:text-5xl font-extrabold tracking-wide bg-gradient-to-r from-[#E8E8F2] via-[#FFFFFF] to-[#FF28B9] bg-clip-text text-transparent"
            >
              ZX
            </motion.h1>

            {/* Welcome by Digi Mitra */}
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.7, delay: 1.85, ease: [0.16, 1, 0.3, 1] }}
              className="mt-4 flex flex-col items-center"
            >
              <div className="px-5 py-2 rounded-2xl bg-white/[0.06] border border-white/15 backdrop-blur-md shadow-lg">
                <p className="font-display text-lg sm:text-xl font-bold tracking-wide text-white">
                  Welcome by <span className="zx-gradient-text">Digi Mitra</span>
                </p>
              </div>
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.75, delay: 2.15, ease: 'easeOut' }}
                className="mt-2.5 h-[2px] w-44 rounded-full zx-gradient-bg origin-center"
              />
              <p className="mt-2 text-xs text-[#E8E8F2]/70 tracking-wider uppercase">
                India&apos;s Social Universe · भारत का सोशल ब्रह्मांड
              </p>
            </motion.div>
          </div>

          {onComplete && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.7 }}
              whileHover={{ opacity: 1 }}
              transition={{ delay: 1.2 }}
              type="button"
              onClick={onComplete}
              className="absolute top-5 right-5 z-20 px-3.5 py-1.5 rounded-xl bg-white/10 border border-white/15 text-xs font-medium text-white/85 hover:bg-white/15"
            >
              Skip →
            </motion.button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
