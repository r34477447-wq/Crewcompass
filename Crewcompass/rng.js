// Small seeded random generator (mulberry32) so simulated missions are repeatable.
export function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  const next = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  let spare = null;
  return {
    next,
    uniform: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo)),            // [lo, hi)
    normal: (mu = 0, sd = 1) => {
      if (spare !== null) { const s = spare; spare = null; return mu + sd * s; }
      let u = 0, v = 0; while (u === 0) u = next(); v = next();
      const m = Math.sqrt(-2 * Math.log(u)); spare = m * Math.sin(2 * Math.PI * v);
      return mu + sd * m * Math.cos(2 * Math.PI * v);
    },
    shuffle: (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; },
  };
}
