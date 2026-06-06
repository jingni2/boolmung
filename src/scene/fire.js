// 카툰 일러스트풍 캠프파이어 — 참조 이미지의 납작한 벡터 불꽃 느낌.
//
// 불꽃을 여러 개의 "혀(teardrop)" 도형의 합집합(union)으로 그린다. 각 혀는
// 통째로 아주 작은 진폭만 살랑이므로, 좌우 윤곽선이 교차해 형상이 찌그러지는
// 문제가 원천적으로 없다.
//
// 색은 2톤이지만 하드 엣지가 아니다: 하나의 실루엣을 (1)노란 세로 그라디언트로
// 채운 뒤, (2)가장자리로 갈수록 알파가 0이 되는 주황 라디얼 그라디언트를 같은
// path에 덧칠한다. 안쪽 주황이 바깥 노랑으로 부드럽게 녹아들어 경계가 없다.

// 불꽃 혀 정의 (정규화 좌표, x중심 0.5 / y는 위=0·아래=1).
//  b: 밑동, hw: 밑동 반폭, t: 끝(tip), curl: 끝 휨,
//  spd·ph: 흔들림 속도/위상, amp: 흔들림 진폭(작게).
const BODY = { bx: 0.5, by: 0.93, hw: 0.23, tx: 0.5, ty: 0.5, curl: 0.0, spd: 1.05, ph: 0.0, amp: 0.008 };

const TONGUES = [
  { bx: 0.5,  by: 0.8,  hw: 0.12,  tx: 0.47,  ty: 0.07, curl: 0.04,  spd: 1.7, ph: 0.0, amp: 0.022 }, // 중앙(최고)
  { bx: 0.57, by: 0.81, hw: 0.095, tx: 0.585, ty: 0.16, curl: 0.07,  spd: 2.1, ph: 1.1, amp: 0.020 }, // 중앙-우
  { bx: 0.41, by: 0.82, hw: 0.1,   tx: 0.27,  ty: 0.3,  curl: -0.14, spd: 1.9, ph: 2.2, amp: 0.020 }, // 좌-중
  { bx: 0.35, by: 0.85, hw: 0.072, tx: 0.2,   ty: 0.43, curl: -0.16, spd: 2.4, ph: 0.6, amp: 0.017 }, // 좌-소
  { bx: 0.62, by: 0.82, hw: 0.09,  tx: 0.74,  ty: 0.26, curl: 0.15,  spd: 2.0, ph: 3.0, amp: 0.020 }, // 우-중
  { bx: 0.67, by: 0.85, hw: 0.066, tx: 0.82,  ty: 0.43, curl: 0.17,  spd: 2.5, ph: 1.7, amp: 0.017 }, // 우-소
];

const PIVOT_Y = 0.84; // 호흡(breathe)의 세로 기준점

export class CampfireRenderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d", { alpha: true, desynchronized: true });
    this.options = {
      maxPixelRatio: 1,
      targetFrameMs: 1000 / 30,
      ...options,
    };

    this.width = 1;
    this.height = 1;
    this.lastFrameTime = 0;
    this.startTime = 0;
    this.animationFrame = null;
    this.resizeObserver = null;
    this.yellowGrad = null;
    this.coreRadial = null;

    this.resize = this.resize.bind(this);
    this.animate = this.animate.bind(this);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
  }

  start() {
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
      this.animationFrame = null;
      return;
    }
    if (!this.animationFrame) {
      this.lastFrameTime = 0;
      this.animationFrame = window.requestAnimationFrame(this.animate);
    }
  }

  resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, this.options.maxPixelRatio);
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, Math.floor(rect.width));
    this.height = Math.max(1, Math.floor(rect.height));
    this.canvas.width = Math.max(1, Math.floor(this.width * ratio));
    this.canvas.height = Math.max(1, Math.floor(this.height * ratio));
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.buildGradients();
  }

  // 그라디언트는 캔버스 좌표에 고정 — 리사이즈 때 한 번만 만든다.
  buildGradients() {
    const ctx = this.context;
    const W = this.width;
    const H = this.height;

    // (1) 바깥 노랑: 위 밝은 금빛 → 아래 진한 금빛.
    const yellow = ctx.createLinearGradient(0, H * 0.03, 0, H * 0.96);
    yellow.addColorStop(0.0, "#ffe85a");
    yellow.addColorStop(0.45, "#ffd338");
    yellow.addColorStop(1.0, "#fbbd2a");
    this.yellowGrad = yellow;

    // (2) 안쪽 주황·적 코어: 중심은 진하고 가장자리로 알파가 0 → 노랑과 부드럽게 섞임.
    const core = ctx.createRadialGradient(
      W * 0.5, H * 0.72, H * 0.01,
      W * 0.5, H * 0.66, H * 0.54
    );
    core.addColorStop(0.0, "rgba(222, 62, 18, 0.96)"); // 짙은 적-주황 코어
    core.addColorStop(0.26, "rgba(235, 92, 22, 0.9)");
    core.addColorStop(0.48, "rgba(244, 126, 28, 0.72)");
    core.addColorStop(0.68, "rgba(248, 150, 40, 0.38)");
    core.addColorStop(0.85, "rgba(250, 168, 52, 0.1)");
    core.addColorStop(1.0, "rgba(250, 168, 52, 0.0)");
    this.coreRadial = core;

    // 테두리를 부드럽게 풀어줄 글로우 블러 반경(넓은 것/좁은 것).
    this.glowWide = Math.max(6, H * 0.085);
    this.glowTight = Math.max(3, H * 0.035);
  }

  animate(now) {
    this.animationFrame = window.requestAnimationFrame(this.animate);
    if (now - this.lastFrameTime < this.options.targetFrameMs) {
      return;
    }
    this.lastFrameTime = now;
    if (this.startTime === 0) {
      this.startTime = now;
    }
    this.draw((now - this.startTime) * 0.001);
  }

  draw(time) {
    const ctx = this.context;
    const W = this.width;
    const H = this.height;

    ctx.clearRect(0, 0, W, H);

    // 전체 살랑임(위로 갈수록 크게) + 은은한 호흡.
    const swayGlobal = Math.sin(time * 1.0) * 0.012 + Math.sin(time * 1.7 + 0.8) * 0.006;
    const breathe = 1 + Math.sin(time * 1.3) * 0.02;

    // 실루엣 path를 한 번만 만든 뒤 여러 번 채운다.
    ctx.beginPath();
    this.traceShape(ctx, BODY, W, H, time, swayGlobal, breathe);
    for (const tongue of TONGUES) {
      this.traceShape(ctx, tongue, W, H, time, swayGlobal, breathe);
    }

    // (1) 따뜻한 글로우 헤일로 — 테두리를 배경으로 부드럽게 풀어준다.
    //     같은 실루엣을 shadowBlur로 두 번(넓게/좁게) 찍어 가장자리 gradient를 만든다.
    ctx.save();
    ctx.fillStyle = "#f9831e";
    ctx.shadowColor = "rgba(255, 134, 32, 0.4)";
    ctx.shadowBlur = this.glowWide;
    ctx.fill();
    ctx.shadowColor = "rgba(255, 176, 66, 0.55)";
    ctx.shadowBlur = this.glowTight;
    ctx.fill();
    ctx.restore();

    // (2) 바깥 노랑 → (3) 안쪽 주황 코어(가장자리 알파 0이라 부드럽게 섞임).
    ctx.fillStyle = this.yellowGrad;
    ctx.fill();
    ctx.fillStyle = this.coreRadial;
    ctx.fill();
  }

  // 혀 1개를 베지어로 path에 추가한다.
  traceShape(ctx, f, W, H, time, swayGlobal, breathe) {
    const flick = Math.sin(time * f.spd + f.ph);
    const flick2 = Math.sin(time * f.spd * 0.6 + f.ph * 1.3 + 0.5);

    const by = f.by;
    const ty0 = PIVOT_Y - (PIVOT_Y - f.ty) * breathe; // 호흡: 끝 높이 미세 변화
    const height = by - ty0;
    const tipSway = swayGlobal * (height / 0.85); // 높은 혀일수록 더 흔들림

    const bx = f.bx;
    const hw = f.hw;
    const tx = f.tx + flick * f.amp + tipSway;
    const ty = ty0 + flick2 * f.amp * 0.5;

    const h = Math.max(0.001, by - ty);
    const curl = f.curl;

    const X = (v) => v * W;
    const Y = (v) => v * H;

    const Lx = bx - hw, Rx = bx + hw;
    const c1x = bx - hw * 1.04, c1y = by - h * 0.42;
    const c2x = tx - hw * 0.5 + curl * h * 0.6, c2y = ty + h * 0.26;
    const c3x = tx + hw * 0.5 + curl * h * 0.6, c3y = ty + h * 0.26;
    const c4x = bx + hw * 1.04, c4y = by - h * 0.42;

    ctx.moveTo(X(Lx), Y(by));
    ctx.bezierCurveTo(X(c1x), Y(c1y), X(c2x), Y(c2y), X(tx), Y(ty));
    ctx.bezierCurveTo(X(c3x), Y(c3y), X(c4x), Y(c4y), X(Rx), Y(by));
    ctx.quadraticCurveTo(X(bx), Y(by + hw * 0.34), X(Lx), Y(by)); // 둥근 밑동
    ctx.closePath();
  }
}
