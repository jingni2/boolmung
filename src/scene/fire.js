const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const noise = (value) => (
  Math.sin(value * 1.13) * 0.52 +
  Math.sin(value * 2.71 + 1.7) * 0.32 +
  Math.sin(value * 5.18 + 0.4) * 0.16
);

export class CampfireRenderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d", { alpha: true, desynchronized: true });
    this.options = {
      maxPixelRatio: 1,
      targetFrameMs: 1000 / 24,
      plumeCount: 7,
      emberCount: 18,
      ...options,
    };

    this.plumes = [];
    this.embers = [];
    this.width = 1;
    this.height = 1;
    this.lastFrameTime = 0;
    this.animationFrame = null;
    this.resizeObserver = null;

    this.resize = this.resize.bind(this);
    this.animate = this.animate.bind(this);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
  }

  start() {
    this.seed();
    this.resize();
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(this.canvas);
    window.addEventListener("resize", this.resize, { passive: true });
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    this.animationFrame = window.requestAnimationFrame(this.animate);
  }

  destroy() {
    window.cancelAnimationFrame(this.animationFrame);
    window.removeEventListener("resize", this.resize);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    this.resizeObserver?.disconnect();
  }

  handleVisibilityChange() {
    if (document.hidden) {
      window.cancelAnimationFrame(this.animationFrame);
      return;
    }

    this.lastFrameTime = 0;
    this.animationFrame = window.requestAnimationFrame(this.animate);
  }

  resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, this.options.maxPixelRatio);
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, Math.floor(rect.width));
    this.height = Math.max(1, Math.floor(rect.height));
    this.canvas.width = Math.max(1, Math.floor(this.width * ratio));
    this.canvas.height = Math.max(1, Math.floor(this.height * ratio));
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  seed() {
    this.plumes = Array.from({ length: this.options.plumeCount }, (_, index) => ({
      base: 0.3 + Math.random() * 0.4,
      width: 22 + Math.random() * 18,
      height: 82 + Math.random() * 132,
      lean: -30 + Math.random() * 60,
      speed: 0.78 + Math.random() * 1.05,
      phase: Math.random() * Math.PI * 2,
      alpha: 0.16 + Math.random() * 0.18,
      taper: 0.1 + Math.random() * 0.18,
      curl: 0.9 + Math.random() * 1.5,
      wobble: 0.9 + Math.random() * 1.4,
      flare: 0.2 + Math.random() * 0.36,
      layer: index / this.options.plumeCount,
    }));

    this.embers = Array.from({ length: this.options.emberCount }, () => ({
      x: 0.36 + Math.random() * 0.28,
      y: 0.72 + Math.random() * 0.22,
      size: 1.3 + Math.random() * 2.6,
      speed: 0.18 + Math.random() * 0.42,
      phase: Math.random() * Math.PI * 2,
      drift: -18 + Math.random() * 36,
    }));
  }

  animate(now) {
    if (now - this.lastFrameTime >= this.options.targetFrameMs) {
      this.lastFrameTime = now;
      this.draw(now * 0.001);
    }

    this.animationFrame = window.requestAnimationFrame(this.animate);
  }

  draw(time) {
    const ctx = this.context;
    const width = this.width;
    const height = this.height;

    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = "lighter";
    this.drawFireBody(ctx, width, height, time);

    for (const plume of this.plumes) {
      this.drawPlume(ctx, width, height, time, plume);
    }

    this.drawHotCore(ctx, width, height, time);
    this.drawSparks(ctx, width, height, time);
    ctx.globalCompositeOperation = "source-over";
  }

  drawFireBody(ctx, width, height, time) {
    const sway = noise(time * 0.95) * width * 0.03;
    const pulse = (Math.sin(time * 3.1) * 0.5 + 0.5);
    const wobble = noise(time * 2.4 + 1.1);
    const edgeRipple = noise(time * 4.6 + 0.7) * width * 0.018;
    const edgeRippleAlt = noise(time * 5.2 + 2.1) * width * 0.016;
    const baseSpread = width * (0.37 + pulse * 0.035);
    const leftBase = width * 0.5 - baseSpread;
    const rightBase = width * 0.5 + baseSpread;
    const baseY = height * (0.912 + pulse * 0.008);
    const crownX = width * 0.5 + sway * 1.55 + wobble * width * 0.012;
    const crownY = height * (0.165 + Math.sin(time * 4.2) * 0.014);
    const outlineSteps = 12;
    const leftEdge = [];
    const rightEdge = [];

    for (let step = 0; step <= outlineSteps; step += 1) {
      const t = step / outlineSteps;
      const y = baseY - (baseY - crownY) * t;
      const widthFactor = Math.pow(1 - t, 0.52);
      const shoulderBulge = Math.sin(t * Math.PI * 0.95) * width * 0.04;
      const edgeWave =
        noise(time * 3.8 + t * 6.4) * width * (0.012 + (1 - t) * 0.012) +
        Math.sin(time * 5.4 + t * 12.8) * width * 0.008 * (0.2 + t);
      const edgeWaveAlt =
        noise(time * 4.2 + 2.4 + t * 6.9) * width * (0.012 + (1 - t) * 0.012) +
        Math.sin(time * 5.9 + 1.3 + t * 11.6) * width * 0.008 * (0.2 + t);
      const pinch = Math.sin(t * Math.PI * 2.2 + time * 1.9) * width * 0.012 * t;
      const spread = baseSpread * widthFactor + shoulderBulge * (1 - t * 0.35);
      const centerX = width * 0.5 + sway * (0.45 + t) + Math.sin(time * 2.2 + t * 4.4) * width * 0.012 * t;

      leftEdge.push({
        x: centerX - spread + edgeWave + pinch - edgeRipple * (1 - t),
        y,
      });
      rightEdge.push({
        x: centerX + spread + edgeWaveAlt - pinch + edgeRippleAlt * (1 - t),
        y,
      });
    }

    const bodyGradient = ctx.createLinearGradient(width * 0.5, baseY, width * 0.5, crownY);
    bodyGradient.addColorStop(0, "rgba(255, 136, 18, 0.98)");
    bodyGradient.addColorStop(0.16, "rgba(255, 172, 34, 0.99)");
    bodyGradient.addColorStop(0.38, "rgba(255, 214, 82, 0.97)");
    bodyGradient.addColorStop(0.68, "rgba(255, 241, 176, 0.9)");
    bodyGradient.addColorStop(0.92, "rgba(255, 154, 48, 0.58)");
    bodyGradient.addColorStop(1, "rgba(255, 110, 34, 0.12)");

    ctx.fillStyle = bodyGradient;
    ctx.beginPath();
    ctx.moveTo(leftEdge[0].x, leftEdge[0].y);
    for (let index = 1; index < leftEdge.length; index += 1) {
      const previous = leftEdge[index - 1];
      const current = leftEdge[index];
      ctx.quadraticCurveTo(
        previous.x,
        previous.y,
        (previous.x + current.x) * 0.5,
        (previous.y + current.y) * 0.5
      );
    }
    const topLeft = leftEdge[leftEdge.length - 1];
    const topRight = rightEdge[rightEdge.length - 1];
    ctx.quadraticCurveTo(
      topLeft.x,
      topLeft.y,
      (topLeft.x + topRight.x) * 0.5,
      Math.min(topLeft.y, topRight.y) - 10
    );
    for (let index = rightEdge.length - 1; index > 0; index -= 1) {
      const previous = rightEdge[index];
      const current = rightEdge[index - 1];
      ctx.quadraticCurveTo(
        previous.x,
        previous.y,
        (previous.x + current.x) * 0.5,
        (previous.y + current.y) * 0.5
      );
    }
    ctx.quadraticCurveTo(
      width * 0.5 + sway * 0.32,
      height * (1.04 + pulse * 0.01),
      leftEdge[0].x,
      leftEdge[0].y
    );
    ctx.closePath();
    ctx.fill();

    const leftLick = ctx.createLinearGradient(width * 0.18, baseY, width * 0.28, height * 0.28);
    leftLick.addColorStop(0, "rgba(255, 170, 34, 0.38)");
    leftLick.addColorStop(0.32, "rgba(255, 224, 120, 0.34)");
    leftLick.addColorStop(0.74, "rgba(255, 246, 206, 0.18)");
    leftLick.addColorStop(1, "rgba(255, 246, 206, 0)");
    ctx.fillStyle = leftLick;
    ctx.beginPath();
    ctx.moveTo(width * 0.18, baseY);
    ctx.bezierCurveTo(
      width * 0.11 + edgeRipple * 0.4,
      height * 0.83,
      width * 0.16 + edgeRipple,
      height * 0.64,
      width * 0.24 + edgeRipple * 0.8,
      height * 0.48
    );
    ctx.bezierCurveTo(
      width * 0.29 + edgeRipple * 0.6,
      height * 0.4,
      width * 0.31,
      height * 0.33,
      width * 0.28,
      height * 0.27
    );
    ctx.bezierCurveTo(
      width * 0.25,
      height * 0.34,
      width * 0.21,
      height * 0.46,
      width * 0.2,
      height * 0.59
    );
    ctx.bezierCurveTo(width * 0.19, height * 0.73, width * 0.21, height * 0.84, width * 0.24, baseY);
    ctx.quadraticCurveTo(width * 0.21, height * 0.94, width * 0.18, baseY);
    ctx.closePath();
    ctx.fill();

    const rightLick = ctx.createLinearGradient(width * 0.82, baseY, width * 0.72, height * 0.24);
    rightLick.addColorStop(0, "rgba(255, 164, 30, 0.36)");
    rightLick.addColorStop(0.34, "rgba(255, 220, 114, 0.32)");
    rightLick.addColorStop(0.76, "rgba(255, 245, 204, 0.16)");
    rightLick.addColorStop(1, "rgba(255, 245, 204, 0)");
    ctx.fillStyle = rightLick;
    ctx.beginPath();
    ctx.moveTo(width * 0.82, baseY);
    ctx.bezierCurveTo(
      width * 0.88 + edgeRippleAlt * 0.4,
      height * 0.84,
      width * 0.85 + edgeRippleAlt,
      height * 0.66,
      width * 0.76 + edgeRippleAlt * 0.8,
      height * 0.5
    );
    ctx.bezierCurveTo(
      width * 0.71 + edgeRippleAlt * 0.6,
      height * 0.4,
      width * 0.69,
      height * 0.3,
      width * 0.73,
      height * 0.24
    );
    ctx.bezierCurveTo(
      width * 0.76,
      height * 0.32,
      width * 0.8,
      height * 0.44,
      width * 0.8,
      height * 0.59
    );
    ctx.bezierCurveTo(width * 0.8, height * 0.72, width * 0.79, height * 0.84, width * 0.76, baseY);
    ctx.quadraticCurveTo(width * 0.79, height * 0.95, width * 0.82, baseY);
    ctx.closePath();
    ctx.fill();

    const innerGradient = ctx.createLinearGradient(width * 0.5, baseY, width * 0.5, height * 0.22);
    innerGradient.addColorStop(0, "rgba(255, 252, 202, 0.92)");
    innerGradient.addColorStop(0.34, "rgba(255, 244, 128, 0.88)");
    innerGradient.addColorStop(0.68, "rgba(255, 198, 52, 0.4)");
    innerGradient.addColorStop(1, "rgba(255, 176, 42, 0)");

    ctx.fillStyle = innerGradient;
    ctx.beginPath();
    const innerBaseY = height * (0.918 + pulse * 0.008);
    const innerLeft = [];
    const innerRight = [];

    for (let step = 0; step <= outlineSteps - 1; step += 1) {
      const t = step / (outlineSteps - 1);
      const y = innerBaseY - (innerBaseY - height * 0.21) * t;
      const widthFactor = Math.pow(1 - t, 0.58);
      const spread = width * 0.24 * widthFactor + Math.sin(t * Math.PI) * width * 0.018;
      const centerX = width * 0.5 + sway * (0.3 + t * 0.7);
      const waveA = noise(time * 4.6 + t * 5.5) * width * 0.008 * (1 + t);
      const waveB = noise(time * 5.1 + 1.7 + t * 6.1) * width * 0.008 * (1 + t);
      innerLeft.push({ x: centerX - spread + waveA, y });
      innerRight.push({ x: centerX + spread + waveB, y });
    }

    ctx.moveTo(innerLeft[0].x, innerLeft[0].y);
    for (let index = 1; index < innerLeft.length; index += 1) {
      const previous = innerLeft[index - 1];
      const current = innerLeft[index];
      ctx.quadraticCurveTo(
        previous.x,
        previous.y,
        (previous.x + current.x) * 0.5,
        (previous.y + current.y) * 0.5
      );
    }
    const innerTopLeft = innerLeft[innerLeft.length - 1];
    const innerTopRight = innerRight[innerRight.length - 1];
    ctx.quadraticCurveTo(
      innerTopLeft.x,
      innerTopLeft.y,
      (innerTopLeft.x + innerTopRight.x) * 0.5,
      Math.min(innerTopLeft.y, innerTopRight.y) - 6
    );
    for (let index = innerRight.length - 1; index > 0; index -= 1) {
      const previous = innerRight[index];
      const current = innerRight[index - 1];
      ctx.quadraticCurveTo(
        previous.x,
        previous.y,
        (previous.x + current.x) * 0.5,
        (previous.y + current.y) * 0.5
      );
    }
    ctx.quadraticCurveTo(width * 0.5 + sway * 0.2, height * 1.0, innerLeft[0].x, innerLeft[0].y);
    ctx.closePath();
    ctx.fill();
  }

  drawPlume(ctx, width, height, time, plume) {
    const baseX = width * plume.base;
    const baseY = height * (0.88 - plume.layer * 0.014);
    const flicker = noise(time * plume.speed + plume.phase);
    const heightScale = 0.92 + flicker * 0.16 + Math.sin(time * 1.7 + plume.phase) * 0.08;
    const flameHeight = plume.height * heightScale;
    const tipX = baseX + plume.lean * 0.82 + flicker * 28;
    const tipY = baseY - flameHeight;
    const steps = 10;
    const leftEdge = [];
    const rightEdge = [];

    const gradient = ctx.createLinearGradient(baseX, baseY, tipX, tipY);
    gradient.addColorStop(0, `rgba(255, 122, 24, ${plume.alpha * 0.84})`);
    gradient.addColorStop(0.18, `rgba(255, 164, 38, ${plume.alpha * 1.18})`);
    gradient.addColorStop(0.38, `rgba(255, 214, 90, ${plume.alpha * 1.56})`);
    gradient.addColorStop(0.64, `rgba(255, 245, 196, ${plume.alpha * 1.2})`);
    gradient.addColorStop(0.86, `rgba(255, 140, 46, ${plume.alpha * 0.76})`);
    gradient.addColorStop(1, "rgba(255, 82, 30, 0)");

    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      const y = baseY - flameHeight * t;
      const centerShift =
        (tipX - baseX) * t +
        noise(time * (plume.speed + 0.3) + plume.phase + t * 5.2) * plume.width * 0.26 * (0.35 + t);
      const centerX = baseX + centerShift;
      const spread = 1.12 + plume.flare * Math.sin(t * Math.PI * 1.04);
      const widthFactor = (1 - Math.pow(t, 0.7) * (1 - plume.taper)) * spread;
      const ripple =
        noise(time * 3.4 + plume.phase * 0.8 + t * 9.6) * plume.width * 0.24 * (1 - t * 0.34);
      const halfWidth = plume.width * widthFactor * 0.5;
      const curl = Math.sin(time * 3 + plume.phase + t * 7.2) * plume.curl * 8.4 * t;

      leftEdge.push({ x: centerX - halfWidth + ripple - curl, y });
      rightEdge.push({ x: centerX + halfWidth + ripple * 0.42 + curl, y });
    }

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(leftEdge[0].x, leftEdge[0].y);
    for (let index = 1; index < leftEdge.length; index += 1) {
      const previous = leftEdge[index - 1];
      const current = leftEdge[index];
      ctx.quadraticCurveTo(
        previous.x,
        previous.y,
        (previous.x + current.x) * 0.5,
        (previous.y + current.y) * 0.5
      );
    }
    const tipLeft = leftEdge[leftEdge.length - 1];
    const tipRight = rightEdge[rightEdge.length - 1];
    ctx.quadraticCurveTo(
      tipLeft.x,
      tipLeft.y,
      (tipLeft.x + tipRight.x) * 0.5,
      Math.min(tipLeft.y, tipRight.y) - 10
    );
    for (let index = rightEdge.length - 1; index > 0; index -= 1) {
      const previous = rightEdge[index];
      const current = rightEdge[index - 1];
      ctx.quadraticCurveTo(
        previous.x,
        previous.y,
        (previous.x + current.x) * 0.5,
        (previous.y + current.y) * 0.5
      );
    }
    ctx.closePath();
    ctx.fill();
  }

  drawHotCore(ctx, width, height, time) {
    const sway = noise(time * 1.2) * width * 0.022;
    const core = ctx.createLinearGradient(width * 0.5, height * 0.92, width * 0.5 + sway, height * 0.18);
    core.addColorStop(0, "rgba(255, 182, 56, 0.34)");
    core.addColorStop(0.14, "rgba(255, 226, 120, 0.46)");
    core.addColorStop(0.42, "rgba(255, 249, 212, 0.52)");
    core.addColorStop(0.8, "rgba(255, 214, 116, 0.18)");
    core.addColorStop(1, "rgba(255, 250, 232, 0)");

    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.moveTo(width * 0.42, height * 0.9);
    ctx.bezierCurveTo(width * 0.36 + sway, height * 0.76, width * 0.43 + sway, height * 0.54, width * 0.48 + sway, height * 0.28);
    ctx.bezierCurveTo(width * 0.52 + sway, height * 0.18, width * 0.59 + sway, height * 0.48, width * 0.61, height * 0.9);
    ctx.closePath();
    ctx.fill();
  }

  drawSparks(ctx, width, height, time) {
    for (const ember of this.embers) {
      const travel = (time * ember.speed + ember.phase) % 1;
      const alpha = clamp(1 - travel * 1.4, 0, 1) * 0.42;
      const x = width * ember.x + Math.sin(time * 2.4 + ember.phase) * ember.drift * travel;
      const y = height * ember.y - travel * height * 0.46;

      ctx.fillStyle = `rgba(255, 198, 76, ${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, ember.size * (1 - travel * 0.45), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
