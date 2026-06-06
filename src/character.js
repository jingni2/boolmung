const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export class RoamingCharacter {
  constructor(element, options = {}) {
    this.element = element;
    this.image = element.querySelector("img");
    this.options = {
      minPauseMs: 500,
      maxPauseMs: 1800,
      minMoveMs: 2600,
      maxMoveMs: 5200,
      bottomPadding: 22,
      sidePadding: 24,
      roamTopRatio: 0.86,
      roamBottomRatio: 0.965,
      idleChance: 0.24,
      turnaroundFrames: [],
      ...options,
    };

    this.position = { x: 0, y: 0 };
    this.roamBounds = null;
    this.fireZone = null;
    this.timer = null;
    this.destroyed = false;
    this.lastFrameIndex = -1;
    this.currentSide = Math.random() < 0.5 ? "left" : "right";

    this.handleResize = this.handleResize.bind(this);
    this.handlePointerEnter = this.handlePointerEnter.bind(this);
    this.handlePointerLeave = this.handlePointerLeave.bind(this);
  }

  start() {
    this.roamBounds = this.measureBounds();
    this.fireZone = this.measureFireZone();
    this.position = this.pickStartPosition();
    this.updateFrame(0, 1);
    this.paint();
    this.attach();
    this.scheduleNextMove(240);
  }

  attach() {
    window.addEventListener("resize", this.handleResize, { passive: true });
    this.element.addEventListener("pointerenter", this.handlePointerEnter);
    this.element.addEventListener("pointerleave", this.handlePointerLeave);
    this.element.addEventListener("focus", this.handlePointerEnter);
    this.element.addEventListener("blur", this.handlePointerLeave);
  }

  destroy() {
    this.destroyed = true;
    clearTimeout(this.timer);
    window.removeEventListener("resize", this.handleResize);
    this.element.removeEventListener("pointerenter", this.handlePointerEnter);
    this.element.removeEventListener("pointerleave", this.handlePointerLeave);
    this.element.removeEventListener("focus", this.handlePointerEnter);
    this.element.removeEventListener("blur", this.handlePointerLeave);
  }

  handleResize() {
    const previous = this.roamBounds ?? this.measureBounds();
    const next = this.measureBounds();
    const xRatio = previous.width ? (this.position.x - previous.minX) / previous.width : 0.5;
    const yRatio = previous.height ? (this.position.y - previous.minY) / previous.height : 0.5;

    this.roamBounds = next;
    this.fireZone = this.measureFireZone();
    this.position.x = next.minX + next.width * clamp(xRatio, 0, 1);
    this.position.y = next.minY + next.height * clamp(yRatio, 0, 1);
    this.ensureValidSide();
    this.paint();
  }

  handlePointerEnter() {
    this.element.classList.add("is-paused");
  }

  handlePointerLeave() {
    this.element.classList.remove("is-paused");
  }

  measureBounds() {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const spriteWidth = this.element.offsetWidth || 92;
    const spriteHeight = this.element.offsetHeight || spriteWidth * 1.28;
    const groundStart = viewportHeight * this.options.roamTopRatio;
    const groundBottom = viewportHeight * this.options.roamBottomRatio;

    const minX = this.options.sidePadding;
    const maxX = viewportWidth - spriteWidth - this.options.sidePadding;
    const minY = groundStart - spriteHeight;
    const maxY = groundBottom - spriteHeight - this.options.bottomPadding;

    return {
      minX,
      maxX: Math.max(minX, maxX),
      minY,
      maxY: Math.max(minY, maxY),
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
    };
  }

  measureFireZone() {
    const scene = document.querySelector(".scene");
    const viewportWidth = window.innerWidth;
    const spriteWidth = this.element.offsetWidth || 92;
    const sceneWidth = scene ? scene.getBoundingClientRect().width : Math.min(viewportWidth * 0.72, 430);
    const centerX = viewportWidth * 0.5;
    const padding = Math.max(spriteWidth * 0.85, sceneWidth * 0.24);

    return {
      left: centerX - padding,
      right: centerX + padding,
    };
  }

  getSideBounds(side = this.currentSide) {
    const bounds = this.roamBounds ?? this.measureBounds();
    const fireZone = this.fireZone ?? this.measureFireZone();
    const gap = 10;

    if (side === "right") {
      const minX = Math.max(bounds.minX, fireZone.right + gap);
      return {
        minX,
        maxX: Math.max(minX, bounds.maxX),
      };
    }

    const maxX = Math.min(bounds.maxX, fireZone.left - gap);
    return {
      minX: bounds.minX,
      maxX: Math.max(bounds.minX, maxX),
    };
  }

  ensureValidSide() {
    const leftBounds = this.getSideBounds("left");
    const rightBounds = this.getSideBounds("right");
    const fireZone = this.fireZone ?? this.measureFireZone();

    if (this.position.x < fireZone.left) {
      this.currentSide = "left";
      this.position.x = clamp(this.position.x, leftBounds.minX, leftBounds.maxX);
      return;
    }

    if (this.position.x > fireZone.right) {
      this.currentSide = "right";
      this.position.x = clamp(this.position.x, rightBounds.minX, rightBounds.maxX);
      return;
    }

    const leftDistance = Math.abs(this.position.x - leftBounds.maxX);
    const rightDistance = Math.abs(this.position.x - rightBounds.minX);

    if (leftDistance <= rightDistance) {
      this.currentSide = "left";
      this.position.x = leftBounds.maxX;
    } else {
      this.currentSide = "right";
      this.position.x = rightBounds.minX;
    }
  }

  pickStartPosition() {
    const bounds = this.roamBounds ?? this.measureBounds();
    const sideBounds = this.getSideBounds();
    const centerBias = 0.5 + (Math.random() - 0.5) * 0.28;
    return {
      x: sideBounds.minX + (sideBounds.maxX - sideBounds.minX) * clamp(centerBias, 0, 1),
      y: bounds.minY + bounds.height * (0.58 + Math.random() * 0.32),
    };
  }

  pickTarget() {
    const bounds = this.roamBounds ?? this.measureBounds();
    const sideBounds = this.getSideBounds();
    const horizontalBias = Math.random() < 0.72
      ? 0.5 + (Math.random() - 0.5) * 0.55
      : Math.random();

    return {
      x: sideBounds.minX + (sideBounds.maxX - sideBounds.minX) * clamp(horizontalBias, 0, 1),
      y: bounds.minY + bounds.height * (0.5 + Math.random() * 0.42),
    };
  }

  scheduleNextMove(delay) {
    clearTimeout(this.timer);
    if (this.destroyed) {
      return;
    }

    this.timer = window.setTimeout(() => {
      this.moveOnce();
    }, delay);
  }

  moveOnce() {
    const next = this.pickTarget();
    const deltaX = next.x - this.position.x;
    const deltaY = next.y - this.position.y;
    const distance = Math.hypot(deltaX, deltaY);
    const progress = clamp(distance / 520, 0, 1);
    const moveDuration = Math.round(
      this.options.minMoveMs + (this.options.maxMoveMs - this.options.minMoveMs) * progress
    );

    this.position = next;
    this.element.style.setProperty("--move-duration", `${moveDuration}ms`);
    this.element.classList.add("is-moving");
    this.updateFrame(deltaX, deltaY);
    this.paint();

    const pauseMs = Math.random() < this.options.idleChance
      ? this.options.maxPauseMs + Math.random() * 800
      : this.options.minPauseMs + Math.random() * (this.options.maxPauseMs - this.options.minPauseMs);

    window.setTimeout(() => {
      this.element.classList.remove("is-moving");
    }, moveDuration);

    this.scheduleNextMove(moveDuration + pauseMs);
  }

  paint() {
    const x = `${Math.round(this.position.x)}px`;
    const y = `${Math.round(this.position.y)}px`;
    this.element.style.setProperty("--char-x", x);
    this.element.style.setProperty("--char-y", y);
  }

  updateFrame(deltaX, deltaY) {
    if (!this.image || this.options.turnaroundFrames.length === 0) {
      return;
    }

    const angle = Math.atan2(deltaY, deltaX);
    const normalized = (angle + Math.PI * 2) % (Math.PI * 2);
    const sector = Math.round(normalized / (Math.PI / 4)) % 8;
    const frameIndex = (sector + 8) % 8;

    if (frameIndex === this.lastFrameIndex) {
      return;
    }

    this.lastFrameIndex = frameIndex;
    this.image.src = this.options.turnaroundFrames[frameIndex];
  }
}
