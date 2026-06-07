// 실제 모닥불 영상 모드 — 공개 도메인 Fire.ogv를 브라우저 호환 WebM으로 변환한
// 고정 카메라 영상이다. 원본 영상의 어두운 배경은 캔버스 프레임 처리로
// 휘도→알파 키잉해서 검은 사각형 없이 불꽃만 장면에 얹는다.

export class RealVideoFlameRenderer {
  constructor({ video, canvas } = {}) {
    this.video = video;
    this.canvas = canvas;
    this.context = canvas?.getContext?.("2d", { alpha: true, willReadFrequently: true }) ?? null;
    this.active = false;
    this.width = 1;
    this.height = 1;
    this.ratio = 1;
    this.animationFrame = null;
    this.resizeObserver = null;

    this.resize = this.resize.bind(this);
    this.render = this.render.bind(this);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
  }

  safePlay() {
    if (!this.video) return;
    this.video.playbackRate = 0.6;
    const promise = this.video.play();
    if (promise && typeof promise.catch === "function") promise.catch(() => {});
  }

  handleVisibilityChange() {
    if (!this.active || !this.video) return;
    if (document.hidden) this.video.pause();
    else this.safePlay();
  }

  start() {
    if (!this.video || !this.context || this.active) return;
    this.active = true;
    this.resize();
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(this.canvas);
    window.addEventListener("resize", this.resize, { passive: true });
    this.video.currentTime = this.video.currentTime || 0;
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    if (!document.hidden) this.safePlay();
    this.animationFrame = window.requestAnimationFrame(this.render);
  }

  stop() {
    this.active = false;
    if (this.animationFrame) window.cancelAnimationFrame(this.animationFrame);
    this.animationFrame = null;
    if (this.video) this.video.pause();
    window.removeEventListener("resize", this.resize);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
  }

  destroy() {
    this.stop();
  }

  resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, Math.floor(rect.width));
    this.height = Math.max(1, Math.floor(rect.height));
    this.ratio = ratio;
    this.canvas.width = Math.max(1, Math.floor(this.width * ratio));
    this.canvas.height = Math.max(1, Math.floor(this.height * ratio));
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  mixColor(a, b, amount) {
    const t = Math.max(0, Math.min(1, amount));
    return [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
    ];
  }

  render() {
    if (!this.active) return;
    this.animationFrame = window.requestAnimationFrame(this.render);
    const video = this.video;
    const ctx = this.context;
    const W = this.width;
    const H = this.height;
    ctx.clearRect(0, 0, W, H);
    if (!video || video.readyState < video.HAVE_CURRENT_DATA) return;

    const vw = video.videoWidth || 360;
    const vh = video.videoHeight || 480;
    const scale = Math.max(W / vw, H / vh) * 1.04;
    const dw = vw * scale;
    const dh = vh * scale;
    const dx = (W - dw) * 0.5;
    // 원본 영상의 불꽃은 장작 끝 쪽에서 시작해 보이므로, 합성 위치를 낮춰
    // 앱의 잉걸불 베드에서 자연스럽게 타오르는 것처럼 맞춘다.
    const dy = (H - dh) * 0.45 + H * 0.235;
    ctx.drawImage(video, dx, dy, dw, dh);

    const frame = ctx.getImageData(0, 0, Math.max(1, this.canvas.width), Math.max(1, this.canvas.height));
    const data = frame.data;
    const frameWidth = Math.max(1, this.canvas.width);
    const frameHeight = Math.max(1, this.canvas.height);
    const warm = [255, 118, 42];
    const cyan = [44, 238, 218];
    const blue = [66, 142, 255];
    const pink = [255, 108, 190];
    const white = [255, 252, 222];

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const luma = r * 0.36 + g * 0.48 + b * 0.16;
      const heat = Math.max(r - b * 0.55, g - b * 0.35, luma);
      let alpha = (heat - 34) / 150;
      alpha = Math.max(0, Math.min(1, alpha));
      alpha = alpha * alpha * (3 - 2 * alpha);
      const pixel = i / 4;
      const x = (pixel % frameWidth) / frameWidth;
      const y = Math.floor(pixel / frameWidth) / frameHeight;
      const hot = Math.max(0, Math.min(1, (heat - 45) / 185));
      const upper = Math.max(0, Math.min(1, (0.92 - y) / 0.58));
      const wave = 0.5 + 0.5 * Math.sin(x * 13.0 + y * 18.0 + video.currentTime * 1.1);
      const aurora = Math.max(0, Math.min(1, upper * (0.36 + wave * 0.64)));
      const midAir = Math.max(0, Math.min(1, (0.88 - y) / 0.46)) * Math.max(0, Math.min(1, (y - 0.18) / 0.42));
      const magentaBand = midAir * (0.5 + 0.5 * Math.sin(x * 20.0 - y * 11.0 + video.currentTime * 1.7));

      let color = this.mixColor(warm, cyan, aurora * 1.28);
      color = this.mixColor(color, blue, Math.max(0, aurora - 0.40) * 0.95);
      color = this.mixColor(color, pink, Math.max(0, wave - 0.46) * upper * 0.82 + magentaBand * 0.42);
      color = this.mixColor(color, white, hot * hot * 0.36);

      data[i] = Math.min(255, color[0] * (0.72 + hot * 0.28));
      data[i + 1] = Math.min(255, color[1] * (0.86 + hot * 0.24));
      data[i + 2] = Math.min(255, color[2] * (0.98 + hot * 0.20));
      data[i + 3] = Math.round(alpha * 255);
    }
    ctx.putImageData(frame, 0, 0);
    this.drawIgnitionBridge(ctx, W, H);
  }

  drawIgnitionBridge(ctx, W, H) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const cx = W * 0.5;
    const cy = H * 0.875;

    let grad = ctx.createRadialGradient(cx, cy, H * 0.02, cx, cy, H * 0.16);
    grad.addColorStop(0.0, "rgba(242, 255, 220, 0.54)");
    grad.addColorStop(0.30, "rgba(48, 230, 210, 0.30)");
    grad.addColorStop(0.62, "rgba(255, 112, 190, 0.16)");
    grad.addColorStop(1.0, "rgba(255, 92, 28, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, W * 0.17, H * 0.045, 0, 0, Math.PI * 2);
    ctx.fill();

    grad = ctx.createLinearGradient(cx, H * 0.86, cx, H * 0.64);
    grad.addColorStop(0, "rgba(255, 230, 150, 0.36)");
    grad.addColorStop(0.42, "rgba(42, 226, 220, 0.22)");
    grad.addColorStop(0.72, "rgba(136, 118, 255, 0.13)");
    grad.addColorStop(1, "rgba(255, 70, 150, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(W * 0.42, H * 0.885);
    ctx.bezierCurveTo(W * 0.40, H * 0.80, W * 0.48, H * 0.73, W * 0.50, H * 0.64);
    ctx.bezierCurveTo(W * 0.56, H * 0.74, W * 0.60, H * 0.81, W * 0.58, H * 0.885);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
