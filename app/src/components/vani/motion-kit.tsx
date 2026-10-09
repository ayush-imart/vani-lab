// Small motion helpers: short, transient, opacity/transform based. Everything respects the
// app-level <MotionConfig reducedMotion="user"> and `useReducedMotion` for the number tween.
// Mascots are never animated from here (see app/AGENTS.md).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, animate, motion, useReducedMotion } from "motion/react";

export const DURATION_S = 0.18;
export const TWEEN_S = 0.24;

type NumberProps = {
  value: number;
  format?: (n: number) => string;
  decimals?: number;
};

// Tweens from the previous value to the new one and flashes a fading highlight on change.
export function AnimatedNumber({ value, format, decimals = 0 }: NumberProps) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);
  const [flash, setFlash] = useState(0);
  const current = useRef(value);
  const previous = useRef(value);

  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    if (reduce) {
      current.current = value;
      setShown(value);
      return;
    }
    setFlash((f) => f + 1);
    const controls = animate(current.current, value, {
      duration: TWEEN_S,
      ease: "easeOut",
      onUpdate: (v) => {
        current.current = v;
        setShown(v);
      },
    });
    return () => controls.stop();
  }, [value, reduce]);

  const text = format ? format(shown) : shown.toFixed(decimals);
  return (
    <span key={flash} className={flash > 0 ? "num-flash" : undefined}>
      {text}
    </span>
  );
}

// Crossfades text (or any node) when `id` changes; no motion on the first render.
export function Crossfade({ id, children }: { id: string; children: ReactNode }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={id}
        style={{ display: "block" }}
        initial={{ opacity: 0, y: 3 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: DURATION_S, ease: "easeOut" }}
      >
        {children}
      </motion.span>
    </AnimatePresence>
  );
}

export function PageTransition({ id, children }: { id: string; children: ReactNode }) {
  return (
    <motion.div
      key={id}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION_S, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

// Mount/unmount reveal for conditional blocks (banners, errors, optional fields).
export function Reveal({ show, children }: { show: boolean; children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          key="reveal"
          style={{ overflow: "hidden" }}
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: DURATION_S, ease: "easeOut" }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Enter-only fade for step/tab panels that swap in place (no stacked exit frame).
export function FadeIn({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION_S, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

// Inline fade for small chips that appear/disappear in a text line.
export function RevealInline({ show, children }: { show: boolean; children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.span
          key="inline"
          style={{ display: "inline-block" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: DURATION_S }}
        >
          {children}
        </motion.span>
      )}
    </AnimatePresence>
  );
}
