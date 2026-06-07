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
    this.animationFrame = null;
    this.lastFrameTime = 0;
    this.width = 1;
    this.height = 1;
    this.stars = [];
    this.dustStars = [];
    this.meteor = null;
    this.nextMeteorAt = 0;
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.resize = this.resize.bind(this);
    this.animate = this.animate.bind(this);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
  }

  start() {
    this.resize();
    window.addEventListener("resize", this.resize, { passive: true });
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
  }

  destroy() {
    window.removeEventListener("resize", this.resize);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    window.clearTimeout(this.resizeTimer);
    window.cancelAnimationFrame(this.animationFrame);
  }

  resize() {
    window.clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(() => {
      this.buildSky();
      window.cancelAnimationFrame(this.animationFrame);
      this.lastFrameTime = 0;
      if (this.nextMeteorAt === 0) {
        this.scheduleNextMeteor(window.performance.now());
      }
      this.animationFrame = window.requestAnimationFrame(this.animate);
    }, 80);
  }

  buildSky() {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 1.4);
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const random = createRandom(width * 31 + height * 17);

    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.width = width;
    this.height = height;

    const starCount = Math.round(clamp(width * 0.2, 190, 430));
    this.stars = Array.from({ length: starCount }, () => {
      const depth = random();
      const radius = depth > 0.975
        ? 1.25 + random() * 0.85
        : 0.22 + Math.pow(depth, 3.2) * 0.9;

      return {
        x: random() * width,
        y: Math.pow(random(), 1.14) * height * 0.92,
        radius,
        alpha: 0.24 + depth * 0.7,
        warmth: random(),
        phase: random() * Math.PI * 2,
        speed: 0.42 + random() * 1.55,
        shimmer: 0.08 + random() * (radius > 1.15 ? 0.34 : 0.2),
        glintPhase: random() * Math.PI * 2,
      };
    });

    // A faint diagonal dusting suggests the Milky Way without becoming decorative.
    this.dustStars = Array.from({ length: Math.round(starCount * 0.55) }, () => ({
      x: (random() - 0.5) * width * 0.72,
      y: (random() - 0.5) * height * 0.18,
      radius: 0.16 + random() * 0.42,
      alpha: 0.08 + random() * 0.2,
      phase: random() * Math.PI * 2,
      speed: 0.2 + random() * 0.55,
    }));
  }

  scheduleNextMeteor(time) {
    // Keep the average close to 38 seconds without feeling mechanically timed.
    this.nextMeteorAt = time + 34000 + Math.random() * 8000;
  }

  createMeteor(time) {
    const travelsRight = Math.random() > 0.28;
    const travelX = this.width * (0.25 + Math.random() * 0.18);
    const travelY = this.height * (0.13 + Math.random() * 0.1);
    const margin = this.width * 0.08;
    const startX = travelsRight
      ? margin + Math.random() * Math.max(1, this.width - travelX - margin * 2)
      : this.width - margin - Math.random() * Math.max(1, this.width - travelX - margin * 2);

    this.meteor = {
      startTime: time,
      duration: 1200 + Math.random() * 400,
      startX,
      startY: this.height * (0.08 + Math.random() * 0.28),
      travelX: travelX * (travelsRight ? 1 : -1),
      travelY,
      tailLength: clamp(this.width * (0.1 + Math.random() * 0.055), 96, 220),
      brightness: 0.88 + Math.random() * 0.12,
    };
    const meteorCount = Number(this.canvas.dataset.meteorCount || 0) + 1;
    this.canvas.dataset.meteorCount = String(meteorCount);
    this.canvas.dataset.meteorActive = "true";
  }

  drawMeteor(time) {
    if (!this.meteor && time >= this.nextMeteorAt) {
      this.createMeteor(time);
      this.scheduleNextMeteor(time);
    }

    if (!this.meteor) {
      return;
    }

    const progress = (time - this.meteor.startTime) / this.meteor.duration;
    if (progress >= 1) {
      this.meteor = null;
      this.canvas.dataset.meteorActive = "false";
      return;
    }

    const easedProgress = 1 - Math.pow(1 - clamp(progress, 0, 1), 2.2);
    const fade = Math.sin(Math.PI * clamp(progress, 0, 1));
    const headX = this.meteor.startX + this.meteor.travelX * easedProgress;
    const headY = this.meteor.startY + this.meteor.travelY * easedProgress;
    const travelLength = Math.hypot(this.meteor.travelX, this.meteor.travelY);
    const directionX = this.meteor.travelX / travelLength;
    const directionY = this.meteor.travelY / travelLength;
    const visibleTail = this.meteor.tailLength * clamp(progress * 4.5, 0.12, 1);
    const tailX = headX - directionX * visibleTail;
    const tailY = headY - directionY * visibleTail;
    const alpha = fade * this.meteor.brightness;
    const ctx = this.context;

    const tailGradient = ctx.createLinearGradient(tailX, tailY, headX, headY);
    tailGradient.addColorStop(0, "rgba(176, 207, 255, 0)");
    tailGradient.addColorStop(0.48, `rgba(199, 222, 255, ${alpha * 0.2})`);
    tailGradient.addColorStop(0.84, `rgba(235, 243, 255, ${alpha * 0.78})`);
    tailGradient.addColorStop(1, `rgba(255, 252, 233, ${alpha})`);

    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = tailGradient;
    ctx.lineWidth = 1.7;
    ctx.shadowColor = `rgba(177, 211, 255, ${alpha * 0.75})`;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(headX, headY);
    ctx.stroke();

    ctx.shadowColor = `rgba(255, 245, 213, ${alpha})`;
    ctx.shadowBlur = 16;
    ctx.fillStyle = `rgba(255, 253, 238, ${alpha})`;
    ctx.beginPath();
    ctx.arc(headX, headY, 1.4 + alpha * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  draw(time = 0) {
    const ctx = this.context;
    const seconds = time / 1000;
    ctx.clearRect(0, 0, this.width, this.height);

    for (const star of this.stars) {
      const primaryWave = Math.sin(seconds * star.speed + star.phase);
      const airWave = Math.sin(seconds * star.speed * 0.37 + star.phase * 1.7);
      const twinkle = this.reducedMotion.matches
        ? 1
        : clamp(1 + primaryWave * star.shimmer + airWave * star.shimmer * 0.38, 0.42, 1.45);
      const alpha = clamp(star.alpha * twinkle, 0.06, 1);
      const radius = star.radius * (0.96 + Math.max(0, primaryWave) * 0.1);
      const warm = star.warmth > 0.76;

      if (radius > 1.15) {
        const glowRadius = radius * (4.2 + Math.max(0, primaryWave) * 1.5);
        const glow = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, glowRadius);
        glow.addColorStop(0, `rgba(255, 249, 225, ${alpha * 0.68})`);
        glow.addColorStop(0.25, `rgba(205, 222, 255, ${alpha * 0.2})`);
        glow.addColorStop(1, "rgba(180, 210, 255, 0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(star.x, star.y, glowRadius, 0, Math.PI * 2);
        ctx.fill();

        const glint = Math.pow(Math.max(0, Math.sin(seconds * 0.72 + star.glintPhase)), 12);
        if (glint > 0.08 && !this.reducedMotion.matches) {
          ctx.strokeStyle = `rgba(230, 240, 255, ${glint * alpha * 0.42})`;
          ctx.lineWidth = 0.55;
          ctx.beginPath();
          ctx.moveTo(star.x - radius * (2.5 + glint * 2), star.y);
          ctx.lineTo(star.x + radius * (2.5 + glint * 2), star.y);
          ctx.moveTo(star.x, star.y - radius * (2 + glint * 1.4));
          ctx.lineTo(star.x, star.y + radius * (2 + glint * 1.4));
          ctx.stroke();
        }
      }

      ctx.fillStyle = warm
        ? `rgba(255, 231, 185, ${alpha})`
        : `rgba(225, 236, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.translate(this.width * 0.54, this.height * 0.44);
    ctx.rotate(-0.18);
    for (const star of this.dustStars) {
      const shimmer = this.reducedMotion.matches
        ? 1
        : 0.84 + Math.sin(seconds * star.speed + star.phase) * 0.16;
      ctx.fillStyle = `rgba(218, 226, 238, ${star.alpha * shimmer})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    this.drawMeteor(time);
  }

  animate(time) {
    if (document.hidden) {
      return;
    }

    this.animationFrame = window.requestAnimationFrame(this.animate);
    if (time - this.lastFrameTime < 1000 / 30) {
      return;
    }

    this.lastFrameTime = time;
    this.draw(time);
  }

  handleVisibilityChange() {
    if (document.hidden) {
      window.cancelAnimationFrame(this.animationFrame);
      return;
    }

    this.lastFrameTime = 0;
    this.animationFrame = window.requestAnimationFrame(this.animate);
  }
}

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
