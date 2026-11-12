// Static, seeded starfield (no animation loop: cheap on battery, calm on screen).
export function drawStars(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = (canvas.width = innerWidth * dpr);
  const h = (canvas.height = innerHeight * dpr);
  const ctx = canvas.getContext("2d");
  let s = 20261114;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const n = Math.round((innerWidth * innerHeight) / 5200);
  for (let i = 0; i < n; i++) {
    const r = (rnd() < 0.06 ? 1.6 : 0.7 + rnd() * 0.5) * dpr;
    ctx.globalAlpha = 0.25 + rnd() * 0.65;
    ctx.fillStyle = rnd() < 0.15 ? "#4fd1c5" : rnd() < 0.2 ? "#f2a33a" : "#e8edf3";
    ctx.beginPath();
    ctx.arc(rnd() * w, rnd() * h, r, 0, 6.2832);
    ctx.fill();
  }
}
