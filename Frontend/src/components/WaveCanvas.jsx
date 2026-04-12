import React, { useEffect, useRef } from 'react';

/**
 * WaveCanvas — animated green wave background.
 * Shared between Landing and Auth pages.
 * Renders a fixed full-screen canvas behind all content.
 */
export default function WaveCanvas() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;
    let t = 0;
    let lastTime = 0;
    const TARGET_MS = 1000 / 30; // ~30 fps cap

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const LINE_COUNT = 38;
    const lines = Array.from({ length: LINE_COUNT }, (_, i) => {
      const rand   = () => Math.random();
      const lighter = rand() > 0.65;
      return {
        baseY:   i / (LINE_COUNT - 1),
        phase:   (i / LINE_COUNT) * Math.PI * 5 + rand() * Math.PI,
        freq1:   0.55 + rand() * 0.9,
        freq2:   1.1  + rand() * 1.1,
        amp1:    0.045 + rand() * 0.11,
        amp2:    0.018 + rand() * 0.055,
        speed:   0.00035 + rand() * 0.00055,
        opacity: 0.035 + rand() * 0.20,
        r: lighter ? 52  : 16,
        g: lighter ? 211 : 185,
        b: lighter ? 153 : 129,
      };
    });

    const draw = (timestamp) => {
      animId = requestAnimationFrame(draw);
      if (timestamp - lastTime < TARGET_MS) return;
      lastTime = timestamp;

      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      lines.forEach(line => {
        ctx.beginPath();
        const STEPS = 110;
        for (let j = 0; j <= STEPS; j++) {
          const nx = j / STEPS;
          const y =
            H * line.baseY +
            H * line.amp1 * Math.sin(nx * Math.PI * 2 * line.freq1 + t * line.speed * 100 + line.phase) +
            H * line.amp2 * Math.sin(nx * Math.PI * 3 * line.freq2 + t * line.speed * 65  + line.phase * 1.5);
          if (j === 0) ctx.moveTo(0, y);
          else         ctx.lineTo(nx * W, y);
        }

        const grad = ctx.createLinearGradient(0, 0, W, 0);
        const { r, g, b, opacity: op } = line;
        grad.addColorStop(0,    `rgba(${r},${g},${b},0)`);
        grad.addColorStop(0.12, `rgba(${r},${g},${b},${op})`);
        grad.addColorStop(0.50, `rgba(${r},${g},${b},${(op * 1.15).toFixed(3)})`);
        grad.addColorStop(0.88, `rgba(${r},${g},${b},${(op * 0.65).toFixed(3)})`);
        grad.addColorStop(1,    `rgba(${r},${g},${b},0)`);

        ctx.strokeStyle = grad;
        ctx.lineWidth   = 0.85;
        ctx.stroke();
      });

      t++;
    };

    animId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="landing-wave-canvas" aria-hidden="true" />;
}
