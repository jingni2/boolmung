const createRandom = (seed = 9157) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

export class NightSkyRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d", { alpha: true });
    this.resizeTimer = null;
    this.resize = this.resize.bind(this);
  }

  start() {
    this.resize();
    window.addEventListener("resize", this.resize, { passive: true });
  }

  destroy() {
    window.removeEventListener("resize", this.resize);
    window.clearTimeout(this.resizeTimer);
  }

  resize() {
    window.clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(() => this.draw(), 80);
  }

  draw() {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 1.4);
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const random = createRandom(width * 31 + height * 17);
    const ctx = this.context;

    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const starCount = Math.round(clamp(width * 0.2, 190, 430));
    for (let index = 0; index < starCount; index += 1) {
      const depth = random();
      const x = random() * width;
      const y = Math.pow(random(), 1.14) * height * 0.92;
      const radius = depth > 0.975
        ? 1.25 + random() * 0.85
        : 0.22 + Math.pow(depth, 3.2) * 0.9;
      const warmth = random();
      const alpha = 0.24 + depth * 0.7;

      if (radius > 1.15) {
        const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 4.5);
        glow.addColorStop(0, `rgba(255, 249, 225, ${alpha * 0.7})`);
        glow.addColorStop(0.25, `rgba(205, 222, 255, ${alpha * 0.2})`);
        glow.addColorStop(1, "rgba(180, 210, 255, 0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, radius * 4.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = warmth > 0.76
        ? `rgba(255, 231, 185, ${alpha})`
        : `rgba(225, 236, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // A faint diagonal dusting suggests the Milky Way without becoming decorative.
    ctx.save();
    ctx.translate(width * 0.54, height * 0.44);
    ctx.rotate(-0.18);
    for (let index = 0; index < Math.round(starCount * 0.55); index += 1) {
      const x = (random() - 0.5) * width * 0.72;
      const y = (random() - 0.5) * height * 0.18;
      const radius = 0.16 + random() * 0.42;
      ctx.fillStyle = `rgba(218, 226, 238, ${0.08 + random() * 0.2})`;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
