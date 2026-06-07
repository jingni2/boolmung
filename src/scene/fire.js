// 캠프파이어 컨트롤러 — 사실적인 화로(장작·잉걸불) 위에 실제 모닥불
// 영상에서 키잉한 불꽃만 얹는다.

import { HearthRenderer } from "./hearth.js";
import { RealVideoFlameRenderer } from "./flame-real-video.js";

export class CampfireController {
  constructor({ root, hearthCanvas, realFlameVideo, realFlameCanvas } = {}) {
    this.root = root || document.body;
    this.hearth = hearthCanvas ? new HearthRenderer(hearthCanvas) : null;
    this.real = realFlameVideo && realFlameCanvas
      ? new RealVideoFlameRenderer({ video: realFlameVideo, canvas: realFlameCanvas })
      : null;
  }

  start() {
    this.root.classList.add("fire-mode-real");
    this.hearth?.setLogsVisible(true);
    this.hearth?.start();
    this.real?.start();
  }

  destroy() {
    this.hearth?.destroy();
    this.real?.destroy();
  }
}

// 이전 진입점 호환용 별칭.
export { CampfireController as CampfireRenderer };
