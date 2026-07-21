import { useEffect, useState } from 'react';

/**
 * Returns true when the user has requested reduced motion via OS settings.
 * Use to gate Framer Motion transitions and CSS transform-based animations.
 *
 * Per Emil's rules: reduced motion means fewer and gentler animations,
 * not zero. Keep opacity and color transitions. Remove movement/position.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return reduced;
}
