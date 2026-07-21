// Motion presets for Framer Motion / motion/react
//
// All easing curves are intentionally stronger than the default CSS
// easings — they lack the punch that makes animations feel intentional.
// Durations stay under 300ms for UI elements per Emil's rules.

import type { Transition, Variants } from 'framer-motion';

/* ─── Easing curves ─── */
/* Strong ease-out: starts fast, feels responsive. Default for enters. */
export const easeOut: Transition['ease'] = [0.23, 1, 0.32, 1];

/* Strong ease-in-out: natural acceleration/deceleration for on-screen movement. */
export const easeInOut: Transition['ease'] = [0.77, 0, 0.175, 1];

/* iOS-like drawer curve — overshoots slightly, then settles. */
export const easeDrawer: Transition['ease'] = [0.32, 0.72, 0, 1];

/* ─── Durations ─── */
export const dur = {
  press: 0.12, // 120ms — button press feedback
  pop: 0.18, // 180ms — tooltips, small popovers
  dropdown: 0.2, // 200ms — selects, dropdowns
  panel: 0.24, // 240ms — side panels, drawers
  modal: 0.32, // 320ms — modals, dialogs
  banner: 0.36, // 360ms — full-width banners
  crossfade: 0.22, // 220ms — list ↔ grid, page transitions
} as const;

/* ─── Spring presets (Apple-recommended style) ─── */
export const spring = {
  /** Responsive UI spring — slight bounce, settles fast. */
  snappy: { type: 'spring' as const, duration: 0.32, bounce: 0.18 },
  /** Layout transitions (nav collapse, modals) — slower, more bounce. */
  layout: { type: 'spring' as const, duration: 0.42, bounce: 0.22 },
  /** Gentle, decorative motion (mouse-tracking, decorative). */
  gentle: { type: 'spring' as const, duration: 0.55, bounce: 0.12 },
};

/* ─── Variants ─── */

/** Standard enter from below with fade — for messages, list items, toasts. */
export const fadeUp: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: dur.pop, ease: easeOut } },
  exit: { opacity: 0, y: -4, transition: { duration: dur.press, ease: easeOut } },
};

/** Origin-aware popover/dropdown enter — scale from 0.96 + fade. */
export const popover: Variants = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1, transition: { duration: dur.dropdown, ease: easeOut } },
  exit: { opacity: 0, scale: 0.97, transition: { duration: dur.press, ease: easeOut } },
};

/** Modal/dialog enter — keep transform-origin: center (modals are exempt). */
export const modal: Variants = {
  initial: { opacity: 0, scale: 0.96, y: 8 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { duration: dur.modal, ease: easeOut } },
  exit: { opacity: 0, scale: 0.98, transition: { duration: dur.press, ease: easeOut } },
};

/** Backdrop overlay fade. */
export const backdrop: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: dur.press, ease: 'linear' } },
  exit: { opacity: 0, transition: { duration: dur.press, ease: 'linear' } },
};

/** Slide-in panel from right (side drawers). */
export const panelRight: Variants = {
  initial: { x: '100%', opacity: 0 },
  animate: { x: 0, opacity: 1, transition: { duration: dur.panel, ease: easeDrawer } },
  exit: { x: '100%', opacity: 0, transition: { duration: dur.panel, ease: easeDrawer } },
};

/** Slide-down banner from top. */
export const bannerDown: Variants = {
  initial: { y: '-100%', opacity: 0 },
  animate: { y: 0, opacity: 1, transition: { duration: dur.banner, ease: easeDrawer } },
  exit: { y: '-100%', opacity: 0, transition: { duration: dur.panel, ease: easeInOut } },
};

/** Container that staggers children. */
export const stagger = (delayChildren = 0.04, staggerChildren = 0.04): Variants => ({
  initial: {},
  animate: {
    transition: { delayChildren, staggerChildren },
  },
});

/* ─── Press feedback helper ─── */
/* Returns motion props for a button that scales to 0.97 on press.
   Use on whileTap; combined with transition={{ duration: dur.press }}. */
export const pressProps = {
  whileTap: { scale: 0.97 },
  transition: { duration: dur.press, ease: easeOut },
};

/* ─── Reduced motion helpers ─── */
/* Returns duration 0.001s (effectively instant) when user prefers reduced motion. */
export const reducedDuration = (d: number) => (typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  ? 0.001
  : d);
