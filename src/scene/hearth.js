// 사실적인 화로(火爐) — 쌓아 올린 장작 + 이글거리는 잉걸불 베드.
// 두 불꽃 모드(영상·셰이더) 공통의 "진짜 장작" 토대다.
//
// 장작: 원통 음영(껍질 톤) + 결 홈 + 숯이 된 끝면 + 불빛 림라이트.
// 정적인 장작 픽셀은 오프스크린 캔버스에 한 번만 그려 캐싱하고, 매 프레임에는
// 이글거리는 잉걸불과 불빛 번짐(가산광)만 다시 그려 성능을 아낀다.

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 장작 배치 (정규화 좌표: x→오른쪽, y→아래). r 은 캔버스 높이 대비 반지름.
// end: 'a'|'b'|'both'|'none' — 숯이 되어 빛나는 끝면.
const LOGS = [
  { a: [0.22, 0.64], b: [0.80, 0.60], r: 0.082, end: "none", hue: 24 }, // 뒤
  { a: [0.30, 0.92], b: [0.53, 0.40], r: 0.072, end: "b", hue: 26 },    // 삼각 좌
  { a: [0.75, 0.93], b: [0.49, 0.37], r: 0.066, end: "b", hue: 22 },    // 삼각 우
  { a: [0.14, 0.90], b: [0.62, 0.85], r: 0.090, end: "both", hue: 28 }, // 앞 가로
  { a: [0.40, 0.94], b: [0.88, 0.88], r: 0.078, end: "a", hue: 20 },    // 앞 교차
];

// 잉걸불 중심(불꽃 밑동)
const FIRE_CX = 0.5;
const FIRE_CY = 0.82;

export class HearthRenderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d", { alpha: true });
    this.options = { maxPixelRatio: 2, targetFrameMs: 1000 / 30, ...options };

    this.width = 1;
    this.height = 1;
    this.ratio = 1;
    this.startTime = 0;
    this.lastFrameTime = 0;
    this.animationFrame = null;
    this.resizeObserver = null;
    this.running = false;

    this.logCanvas = document.createElement("canvas");
    this.logCtx = this.logCanvas.getContext("2d");
    this.embers = [];
    this.showLogs = true; // 영상 모드에서는 영상 자체 장작을 쓰므로 끈다.

    this.resize = this.resize.bind(this);
    this.animate = this.animate.bind(this);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.resize();
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(this.canvas);
    window.addEventListener("resize", this.resize, { passive: true });
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    this.animationFrame = window.requestAnimationFrame(this.animate);
  }

  stop() {
    this.running = false;
    if (this.animationFrame) window.cancelAnimationFrame(this.animationFrame);
    this.animationFrame = null;
    window.removeEventListener("resize", this.resize);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
  }

  destroy() {
    this.stop();
  }

  setLogsVisible(visible) {
    this.showLogs = !!visible;
  }

  handleVisibilityChange() {
    if (document.hidden) {
      if (this.animationFrame) window.cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    } else if (this.running && !this.animationFrame) {
      this.lastFrameTime = 0;
      this.animationFrame = window.requestAnimationFrame(this.animate);
    }
  }

  resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, this.options.maxPixelRatio);
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, Math.floor(rect.width));
    this.height = Math.max(1, Math.floor(rect.height));
    this.ratio = ratio;
    this.canvas.width = Math.max(1, Math.floor(this.width * ratio));
    this.canvas.height = Math.max(1, Math.floor(this.height * ratio));
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.buildEmbers();
    this.renderLogs();
  }

  buildEmbers() {
    const rnd = mulberry32(20260607);
    const W = this.width;
    const H = this.height;
    this.embers = [];
    const count = Math.round(46 + (W * H) / 3600);
    for (let i = 0; i < count; i++) {
      // 불꽃 밑동 주변에 타원형으로 흩뿌림.
      const ang = rnd() * Math.PI * 2;
      const rad = Math.pow(rnd(), 0.6);
      const x = FIRE_CX * W + Math.cos(ang) * rad * W * 0.2;
      const y = FIRE_CY * H + Math.sin(ang) * rad * H * 0.085 + H * 0.02;
      this.embers.push({
        x,
        y,
        r: (1.4 + rnd() * 3.4) * (this.height / 200),
        phase: rnd() * Math.PI * 2,
        speed: 1.4 + rnd() * 2.6,
        heat: 0.45 + rnd() * 0.55, // 0..1 더 뜨거운 잉걸
        hot: rnd() > 0.7,
      });
    }
  }

  // --- 정적인 장작을 오프스크린에 한 번만 렌더 ---
  renderLogs() {
    const W = this.width;
    const H = this.height;
    const ratio = this.ratio;
    this.logCanvas.width = Math.max(1, Math.floor(W * ratio));
    this.logCanvas.height = Math.max(1, Math.floor(H * ratio));
    const ctx = this.logCtx;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, W, H);

    for (const log of LOGS) {
      this.drawLog(ctx, log, W, H);
    }
  }

  drawLog(ctx, log, W, H) {
    const ax = log.a[0] * W;
    const ay = log.a[1] * H;
    const bx = log.b[0] * W;
    const by = log.b[1] * H;
    const r = log.r * H;
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx);

    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(ang);
    // 로컬 좌표: x 0..len (축), y -r..r (단면)

    // 그림자(바닥에 드리운).
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = "#000";
    this.capsule(ctx, -r * 0.4, r * 0.7, len + r * 0.8, r * 1.5);
    ctx.filter = "blur(2px)";
    ctx.fill();
    ctx.restore();

    // 원통 본체 — 단면(y) 방향 그라디언트로 입체감.
    const grad = ctx.createLinearGradient(0, -r, 0, r);
    grad.addColorStop(0.0, "#241710");
    grad.addColorStop(0.18, "#3c2716");
    grad.addColorStop(0.4, "#6b4427"); // 불빛 받는 면
    grad.addColorStop(0.52, "#7c4e2c");
    grad.addColorStop(0.7, "#3a2415");
    grad.addColorStop(1.0, "#140d08");

    this.capsule(ctx, 0, -r, len, r * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // 결(grain) — 축을 따라 흐르는 짙은 홈 + 옅은 결.
    ctx.save();
    this.capsule(ctx, 0, -r, len, r * 2);
    ctx.clip();
    const rnd = mulberry32(Math.floor(len * 13.7 + r * 91.3));
    const grooves = Math.round(5 + r * 0.5);
    for (let i = 0; i < grooves; i++) {
      const gy = -r * 0.78 + (i / (grooves - 1)) * r * 1.56;
      const dark = rnd() > 0.5;
      ctx.beginPath();
      ctx.moveTo(r * 0.2, gy);
      const seg = 6;
      for (let s = 1; s <= seg; s++) {
        const px = r * 0.2 + (len - r * 0.4) * (s / seg);
        const py = gy + Math.sin(s * 1.3 + i) * r * 0.06;
        ctx.lineTo(px, py);
      }
      ctx.strokeStyle = dark ? "rgba(20,12,7,0.55)" : "rgba(150,104,64,0.18)";
      ctx.lineWidth = dark ? r * 0.12 : r * 0.07;
      ctx.stroke();
    }
    ctx.restore();

    // 상단 림라이트(불빛 받는 모서리).
    ctx.save();
    this.capsule(ctx, 0, -r, len, r * 2);
    ctx.clip();
    const rim = ctx.createLinearGradient(0, -r, 0, -r * 0.2);
    rim.addColorStop(0, "rgba(255,176,92,0.34)");
    rim.addColorStop(1, "rgba(255,176,92,0)");
    ctx.fillStyle = rim;
    ctx.fillRect(0, -r, len, r * 0.9);
    ctx.restore();

    // 끝면 — 나뭇결 동심원 + 숯/잉걸불.
    if (log.end === "a" || log.end === "both") this.drawLogEnd(ctx, 0, r, true);
    if (log.end === "b" || log.end === "both") this.drawLogEnd(ctx, len, r, false);

    ctx.restore();
  }

  drawLogEnd(ctx, cx, r, leftFace) {
    ctx.save();
    ctx.translate(cx, 0);
    // 타원 끝면.
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.42, r * 0.96, 0, 0, Math.PI * 2);
    const face = ctx.createRadialGradient(0, 0, r * 0.05, 0, 0, r);
    face.addColorStop(0.0, "#ffd27a");
    face.addColorStop(0.22, "#ff8a2a");
    face.addColorStop(0.45, "#c4441a");
    face.addColorStop(0.7, "#5a2410");
    face.addColorStop(1.0, "#1c100a");
    ctx.fillStyle = face;
    ctx.fill();
    // 동심 결.
    ctx.strokeStyle = "rgba(40,20,10,0.4)";
    ctx.lineWidth = r * 0.05;
    for (let k = 1; k <= 3; k++) {
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.42 * (k / 3.5), r * 0.96 * (k / 3.5), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // x..x+len, 세로 -? 캡슐(둥근 양 끝) 경로. (top 은 y 좌상단, h 높이)
  capsule(ctx, x, top, len, h) {
    const r = h / 2;
    const cy = top + r;
    ctx.beginPath();
    ctx.moveTo(x + r, top);
    ctx.lineTo(x + len - r, top);
    ctx.arc(x + len - r, cy, r, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(x + r, top + h);
    ctx.arc(x + r, cy, r, Math.PI / 2, -Math.PI / 2);
    ctx.closePath();
  }

  animate(now) {
    if (!this.running) return;
    this.animationFrame = window.requestAnimationFrame(this.animate);
    if (now - this.lastFrameTime < this.options.targetFrameMs) return;
    this.lastFrameTime = now;
    if (this.startTime === 0) this.startTime = now;
    this.draw((now - this.startTime) * 0.001);
  }

  draw(time) {
    const ctx = this.context;
    const W = this.width;
    const H = this.height;
    ctx.clearRect(0, 0, W, H);

    const flicker =
      0.82 +
      0.12 * Math.sin(time * 7.0) +
      0.06 * Math.sin(time * 13.0 + 1.7) +
      0.05 * Math.sin(time * 2.3);

    // 1) 잉걸불 베드 글로우(바닥의 은은한 주황 빛 웅덩이).
    const bedX = FIRE_CX * W;
    const bedY = FIRE_CY * H + H * 0.03;
    const bed = ctx.createRadialGradient(bedX, bedY, 2, bedX, bedY, W * 0.34);
    bed.addColorStop(0.0, `rgba(255,150,46,${0.5 * flicker})`);
    bed.addColorStop(0.3, `rgba(255,110,30,${0.32 * flicker})`);
    bed.addColorStop(0.6, "rgba(150,52,14,0.12)");
    bed.addColorStop(1.0, "rgba(40,16,6,0)");
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = bed;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // 2) 캐싱된 장작.
    if (this.showLogs) ctx.drawImage(this.logCanvas, 0, 0, W, H);

    // 3) 불빛(가산광) — 불꽃 밑동에서 퍼지는 따뜻한 빛이 장작을 비춘다.
    const lx = FIRE_CX * W;
    const ly = FIRE_CY * H - H * 0.04;
    const light = ctx.createRadialGradient(lx, ly, 2, lx, ly, W * 0.5);
    light.addColorStop(0.0, `rgba(255,170,70,${0.42 * flicker})`);
    light.addColorStop(0.28, `rgba(255,120,38,${0.2 * flicker})`);
    light.addColorStop(0.6, "rgba(180,70,20,0.06)");
    light.addColorStop(1.0, "rgba(0,0,0,0)");
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // 4) 이글거리는 잉걸불 알갱이.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const e of this.embers) {
      const pulse = 0.5 + 0.5 * Math.sin(time * e.speed + e.phase);
      const glow = e.heat * (0.35 + 0.65 * pulse) * flicker;
      const r = e.r * (0.85 + 0.3 * pulse);
      const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r * 2.4);
      if (e.hot) {
        g.addColorStop(0, `rgba(255,240,190,${0.95 * glow})`);
        g.addColorStop(0.35, `rgba(255,160,50,${0.7 * glow})`);
      } else {
        g.addColorStop(0, `rgba(255,150,54,${0.8 * glow})`);
        g.addColorStop(0.4, `rgba(220,80,24,${0.5 * glow})`);
      }
      g.addColorStop(1, "rgba(80,24,6,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r * 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
