const createRandom = (seed = 4242) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

export class DirtGroundRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d", { alpha: false });
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
    this.resizeTimer = window.setTimeout(() => this.draw(), 100);
  }

  draw() {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const textureWidth = Math.min(900, width);
    const textureHeight = Math.min(560, height);
    const random = createRandom(width * 13 + height * 29);
    const texture = document.createElement("canvas");
    const textureContext = texture.getContext("2d", { alpha: false });

    texture.width = textureWidth;
    texture.height = textureHeight;
    const image = textureContext.createImageData(textureWidth, textureHeight);

    for (let y = 0; y < textureHeight; y += 1) {
      const perspective = y / textureHeight;
      for (let x = 0; x < textureWidth; x += 1) {
        const index = (y * textureWidth + x) * 4;
        const broad =
          Math.sin(x * 0.021) * 5 +
          Math.sin(y * 0.037 + x * 0.009) * 7 +
          Math.sin((x + y) * 0.071) * 3;
        const grain = (random() - 0.5) * (18 + perspective * 24);
        const base = broad + grain;

        image.data[index] = clamp(54 + base + perspective * 12, 24, 92);
        image.data[index + 1] = clamp(31 + base * 0.55 + perspective * 5, 16, 58);
        image.data[index + 2] = clamp(19 + base * 0.3, 10, 38);
        image.data[index + 3] = 255;
      }
    }
    textureContext.putImageData(image, 0, 0);

    // Irregular compacted patches and shallow depressions.
    for (let index = 0; index < 150; index += 1) {
      const x = random() * textureWidth;
      const y = random() * textureHeight;
      const perspective = 0.25 + y / textureHeight;
      const radiusX = (2 + random() * 13) * perspective;
      const radiusY = radiusX * (0.18 + random() * 0.28);
      textureContext.fillStyle = random() > 0.46
        ? `rgba(12, 8, 5, ${0.04 + random() * 0.13})`
        : `rgba(124, 76, 42, ${0.025 + random() * 0.08})`;
      textureContext.beginPath();
      textureContext.ellipse(x, y, radiusX, radiusY, random() * Math.PI, 0, Math.PI * 2);
      textureContext.fill();
    }

    // Small stones, dry clods and twig-like fragments.
    for (let index = 0; index < 240; index += 1) {
      const x = random() * textureWidth;
      const y = textureHeight * 0.08 + random() * textureHeight * 0.92;
      const perspective = 0.18 + y / textureHeight;
      const size = (0.35 + random() * 2.2) * perspective;
      textureContext.fillStyle = random() > 0.72
        ? `rgba(132, 100, 72, ${0.14 + random() * 0.2})`
        : `rgba(17, 11, 8, ${0.18 + random() * 0.28})`;
      textureContext.beginPath();
      textureContext.ellipse(x, y, size * 1.8, size * 0.72, random() * Math.PI, 0, Math.PI * 2);
      textureContext.fill();
    }

    this.canvas.width = width;
    this.canvas.height = height;
    this.context.imageSmoothingEnabled = true;
    this.context.drawImage(texture, 0, 0, width, height);
  }
}

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
