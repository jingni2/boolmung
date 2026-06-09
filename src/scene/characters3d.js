import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";

const WALK_CLIP = "Walking";
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const easeInOut = (value) => {
  const t = clamp(value, 0, 1);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

const cloneMaterial = (material) => {
  if (Array.isArray(material)) {
    return material.map((entry) => entry.clone());
  }

  return material?.clone();
};

const forEachMaterial = (material, callback) => {
  if (Array.isArray(material)) {
    material.forEach(callback);
    return;
  }

  if (material) {
    callback(material);
  }
};

const tuneWaxMaterial = (material) => {
  forEachMaterial(material, (entry) => {
    if (entry.map) {
      entry.map.colorSpace = THREE.SRGBColorSpace;
      entry.map.needsUpdate = true;
    }
    if ("normalMap" in entry) {
      entry.normalMap = null;
    }
    if ("metalnessMap" in entry) {
      entry.metalnessMap = null;
    }
    if ("roughnessMap" in entry) {
      entry.roughnessMap = null;
    }
    if ("emissiveMap" in entry) {
      entry.emissiveMap = null;
    }
    entry.color?.set(0xffecd5);
    entry.emissive?.set(0x6f421f);
    if ("emissiveIntensity" in entry) {
      entry.emissiveIntensity = 0.16;
    }
    if ("metalness" in entry) {
      entry.metalness = 0;
    }
    if ("roughness" in entry) {
      entry.roughness = Math.max(entry.roughness ?? 0, 0.72);
    }
    entry.needsUpdate = true;
  });
};

const setModelOpacity = (model, opacity) => {
  model.traverse((node) => {
    if (!node.isMesh) {
      return;
    }

    forEachMaterial(node.material, (material) => {
      material.transparent = opacity < 0.999;
      material.opacity = opacity;
      material.depthWrite = opacity > 0.96;
      material.needsUpdate = true;
    });
  });
};

export class CharacterMotionGallery {
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      modelUrl: "./src/assets/models/umboi-web.glb",
      sittingModelUrl: "./src/assets/models/umboi-sitting.glb",
      maxFps: 24,
      walkSpeed: 44,
      distantScale: 0.5,
      departureDelay: 1.1,
      sitDelay: 1.05,
      expressionDelay: 16,
      expressionDuration: 3,
      expressionStagger: 0.68,
      expressionEmojis: ["🤍", "🤍"],
      expressionImageUrl: "./src/assets/emojis/heart.png",
      // 캐릭터가 걷는 화면 하단 밴드의 높이 비율. 캔버스를 이 밴드로만
      // 한정해 매 프레임 합성하는 픽셀 면적을 줄인다(전체화면 대비 약 절반).
      bandRatio: 0.55,
      ...options,
    };

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 2000);
    this.camera.position.set(0, 0, 1000);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: false,
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.setAttribute("aria-hidden", "true");

    this.clock = new THREE.Clock();
    this.character = null;
    this.sittingCharacter = null;
    this.animationFrame = null;
    this.lastRenderTime = 0;
    this.sourceHeight = 1;
    this.sittingSourceHeight = 1;
    this.characterHeight = 96;
    this.characterScale = 1;
    this.sittingScale = 1;
    this.bandHeight = 1;
    this.expressionLayer = document.createElement("div");
    this.expressions = [];
    this.sittingElapsed = 0;
    this.hasPlayedSittingExpression = false;
    this.destroyed = false;

    this.handleResize = this.handleResize.bind(this);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    this.animate = this.animate.bind(this);
  }

  async start() {
    this.container.appendChild(this.renderer.domElement);
    this.expressionLayer.className = "character-expression-layer";
    this.expressionLayer.setAttribute("aria-hidden", "true");
    Object.assign(this.expressionLayer.style, {
      position: "absolute",
      inset: "0",
      pointerEvents: "none",
      zIndex: "2",
    });
    this.container.appendChild(this.expressionLayer);
    this.addLights();
    this.handleResize();
    window.addEventListener("resize", this.handleResize, { passive: true });
    document.addEventListener("visibilitychange", this.handleVisibilityChange);

    const loader = new GLTFLoader();
    const [gltf, sittingGltf] = await Promise.all([
      loader.loadAsync(this.options.modelUrl),
      loader.loadAsync(this.options.sittingModelUrl).catch((error) => {
        console.warn("앉은 웜보이 GLB를 불러오지 못했습니다.", error);
        return null;
      }),
    ]);
    if (this.destroyed) {
      return [];
    }

    this.buildCharacter(gltf);
    if (sittingGltf) {
      this.buildSittingCharacter(sittingGltf);
    }
    this.handleResize();
    this.container.classList.add("is-ready");
    document.body.classList.add("has-3d-characters");
    this.clock.start();
    this.animationFrame = window.requestAnimationFrame(this.animate);

    return [{ role: "walk", number: 18, name: WALK_CLIP }];
  }

  addLights() {
    const hemisphere = new THREE.HemisphereLight(0xfff3dc, 0x4b1d0c, 1.05);
    const fireLight = new THREE.PointLight(0xff9a47, 1.8, 1300, 1.8);
    const fillLight = new THREE.DirectionalLight(0xffead3, 0.85);

    fireLight.position.set(0, -80, 420);
    fillLight.position.set(-300, 420, 500);
    this.scene.add(hemisphere, fireLight, fillLight);
  }

  buildCharacter(gltf) {
    const template = gltf.scene;
    const bounds = new THREE.Box3().setFromObject(template);
    const center = bounds.getCenter(new THREE.Vector3());
    const walkClip = gltf.animations.find((clip) => clip.name === WALK_CLIP);

    if (!walkClip) {
      throw new Error(`GLB에서 ${WALK_CLIP} 모션을 찾을 수 없습니다.`);
    }

    this.sourceHeight = Math.max(0.001, bounds.max.y - bounds.min.y);
    const model = cloneSkeleton(template);
    const wrapper = new THREE.Group();

    model.position.set(-center.x, -bounds.min.y, -center.z);
    model.traverse((node) => {
      if (!node.isMesh) {
        return;
      }
      node.material = cloneMaterial(node.material);
      tuneWaxMaterial(node.material);
      node.frustumCulled = false;
      node.castShadow = false;
      node.receiveShadow = false;
    });

    wrapper.add(model);
    wrapper.rotation.y = 0.55;
    this.scene.add(wrapper);

    const mixer = new THREE.AnimationMixer(model);
    const walkAction = mixer.clipAction(walkClip);
    walkAction.setLoop(THREE.LoopRepeat, Infinity);
    walkAction.timeScale = 0.82;
    walkAction.play();

    this.character = {
      wrapper,
      mixer,
      walkAction,
      state: "walking",
      settleElapsed: 0,
      screenPosition: { x: 0, y: 0 },
      startPosition: { x: 0, y: 0 },
      targetPosition: { x: 0, y: 0 },
      moveElapsed: 0,
      moveDuration: 1,
    };
    this.container.dataset.characterState = "walking";
  }

  buildSittingCharacter(gltf) {
    const template = gltf.scene;
    const bounds = new THREE.Box3().setFromObject(template);
    const center = bounds.getCenter(new THREE.Vector3());
    const model = cloneSkeleton(template);
    const wrapper = new THREE.Group();

    this.sittingSourceHeight = Math.max(0.001, bounds.max.y - bounds.min.y);
    model.position.set(-center.x, -bounds.min.y, -center.z);
    model.traverse((node) => {
      if (!node.isMesh) {
        return;
      }
      node.material = cloneMaterial(node.material);
      tuneWaxMaterial(node.material);
      node.frustumCulled = false;
      node.castShadow = false;
      node.receiveShadow = false;
    });

    wrapper.add(model);
    wrapper.rotation.y = 0.5;
    wrapper.visible = false;
    this.scene.add(wrapper);

    this.sittingCharacter = {
      wrapper,
      model,
      screenPosition: { x: 0, y: 0 },
    };
    setModelOpacity(model, 0);
  }

  getRoute(width, height) {
    const compact = width < 760;
    const targetHeight = compact
      ? clamp(width * 0.16, 58, 76)
      : clamp(width * 0.072, 82, 112);
    const sceneWidth = Math.min(width * (compact ? 0.92 : 0.72), compact ? 390 : 430);
    const fireHalfWidth = sceneWidth * 0.31;
    const stopGap = compact ? targetHeight * 0.34 : targetHeight * 0.42;
    const targetX = width / 2 - fireHalfWidth - stopGap;
    const footY = compact ? height * 0.84 : height * 0.81;
    const tentRect = document.querySelector(".camp-tent")?.getBoundingClientRect();
    const tentEntranceX = tentRect
      ? tentRect.left + tentRect.width * 0.58
      : targetHeight * 0.45;
    const tentEntranceY = tentRect
      ? tentRect.bottom - 2
      : height * 0.69;

    return {
      targetHeight,
      start: {
        x: Math.max(targetHeight * 0.18, tentEntranceX),
        y: Math.min(footY - targetHeight * 0.42, tentEntranceY),
      },
      target: {
        x: Math.max(targetHeight * 0.65, targetX),
        y: footY,
      },
    };
  }

  handleResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1);

    // 캔버스를 화면 하단 밴드로 한정한다(CSS에서 bottom:0 고정). 카메라와
    // 좌표 매핑을 밴드에 맞춰 캐릭터의 화면상 위치·크기는 그대로 유지한다.
    const bandHeight = Math.max(1, Math.round(height * this.options.bandRatio));
    this.bandHeight = bandHeight;

    this.camera.left = -width / 2;
    this.camera.right = width / 2;
    this.camera.top = bandHeight / 2;
    this.camera.bottom = -bandHeight / 2;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, bandHeight, true);

    if (!this.character) {
      return;
    }

    const route = this.getRoute(width, height);
    this.characterHeight = route.targetHeight;
    this.characterScale = route.targetHeight / this.sourceHeight;
    this.character.wrapper.scale.setScalar(this.characterScale);
    if (this.sittingCharacter) {
      this.sittingScale = (route.targetHeight * 0.72) / this.sittingSourceHeight;
      this.sittingCharacter.wrapper.scale.setScalar(this.sittingScale);
    }

    if (this.character.state === "sitting") {
      this.character.screenPosition = { ...route.target };
      if (this.sittingCharacter) {
        this.sittingCharacter.screenPosition = { ...route.target };
      }
    } else if (this.character.state === "settling") {
      this.character.screenPosition = { ...route.target };
    } else if (this.character.startPosition.x === 0) {
      this.setWalkingRoute(route);
    } else {
      const progress = clamp(
        this.character.moveElapsed / this.character.moveDuration,
        0,
        1
      );
      this.character.startPosition = { ...route.start };
      this.character.targetPosition = { ...route.target };
      this.character.screenPosition.x = THREE.MathUtils.lerp(
        route.start.x,
        route.target.x,
        progress
      );
      this.character.screenPosition.y = THREE.MathUtils.lerp(
        route.start.y,
        route.target.y,
        progress
      );
      const scaleProgress = easeInOut(progress);
      const walkingScale = THREE.MathUtils.lerp(
        this.options.distantScale,
        1,
        scaleProgress
      );
      this.character.wrapper.scale.setScalar(this.characterScale * walkingScale);
    }

    this.paintCharacter(width, height);
    this.paintSittingCharacter(width, height);
  }

  setWalkingRoute(route) {
    const distance = Math.hypot(
      route.target.x - route.start.x,
      route.target.y - route.start.y
    );
    this.character.state = "walking";
    this.sittingElapsed = 0;
    this.hasPlayedSittingExpression = false;
    this.clearExpressions();
    this.character.startPosition = { ...route.start };
    this.character.targetPosition = { ...route.target };
    this.character.screenPosition = { ...route.start };
    this.character.moveElapsed = -this.options.departureDelay;
    this.character.moveDuration = distance / this.options.walkSpeed;
    this.character.walkAction.paused = false;
    this.character.wrapper.visible = true;
    this.character.wrapper.scale.setScalar(
      this.characterScale * this.options.distantScale
    );
    if (this.sittingCharacter) {
      this.sittingCharacter.wrapper.visible = false;
      setModelOpacity(this.sittingCharacter.model, 0);
    }
    this.container.dataset.characterState = "walking";
  }

  handleVisibilityChange() {
    if (document.hidden) {
      window.cancelAnimationFrame(this.animationFrame);
      return;
    }

    this.clock.getDelta();
    this.lastRenderTime = 0;
    this.animationFrame = window.requestAnimationFrame(this.animate);
  }

  paintCharacter(width = window.innerWidth, height = window.innerHeight) {
    // 화면 좌표(위에서부터의 y)를 하단 밴드 카메라 좌표로 변환한다.
    const bandHeight = this.bandHeight || height;
    this.character.wrapper.position.set(
      this.character.screenPosition.x - width / 2,
      (height - bandHeight / 2) - this.character.screenPosition.y,
      0
    );
  }

  paintSittingCharacter(width = window.innerWidth, height = window.innerHeight) {
    if (!this.sittingCharacter) {
      return;
    }

    const bandHeight = this.bandHeight || height;
    this.sittingCharacter.wrapper.position.set(
      this.sittingCharacter.screenPosition.x - width / 2,
      (height - bandHeight / 2) - this.sittingCharacter.screenPosition.y,
      0
    );
  }

  updateCharacter(delta) {
    if (this.character.state === "sitting") {
      return;
    }

    if (this.character.state === "settling") {
      this.character.settleElapsed += delta;
      this.updateSitTransition(
        clamp(this.character.settleElapsed / this.options.sitDelay, 0, 1)
      );
      if (this.character.settleElapsed >= this.options.sitDelay) {
        this.sitCharacter();
      }
      return;
    }

    this.character.moveElapsed += delta;
    const progress = clamp(
      this.character.moveElapsed / this.character.moveDuration,
      0,
      1
    );

    this.character.screenPosition.x = THREE.MathUtils.lerp(
      this.character.startPosition.x,
      this.character.targetPosition.x,
      progress
    );
    this.character.screenPosition.y = THREE.MathUtils.lerp(
      this.character.startPosition.y,
      this.character.targetPosition.y,
      progress
    );
    const scaleProgress = easeInOut(progress);
    const walkingScale = THREE.MathUtils.lerp(
      this.options.distantScale,
      1,
      scaleProgress
    );
    this.character.wrapper.scale.setScalar(this.characterScale * walkingScale);
    this.paintCharacter();

    if (progress >= 1) {
      this.character.state = "settling";
      this.character.settleElapsed = 0;
      this.character.screenPosition = { ...this.character.targetPosition };
      this.character.wrapper.scale.setScalar(this.characterScale);
      this.character.walkAction.paused = true;
      if (this.sittingCharacter) {
        this.sittingCharacter.screenPosition = { ...this.character.targetPosition };
        this.sittingCharacter.wrapper.visible = true;
      }
      this.container.dataset.characterState = "settling";
      this.paintCharacter();
      this.paintSittingCharacter();
      this.updateSitTransition(0);
    }
  }

  updateSitTransition(progress) {
    const eased = easeInOut(progress);
    const standOpacity = 1 - eased;
    const sitOpacity = eased;
    const standScaleY = 1 - 0.24 * eased;
    const standScaleXZ = 1 + 0.05 * eased;

    this.character.wrapper.visible = standOpacity > 0.02;
    this.character.wrapper.scale.set(
      this.characterScale * standScaleXZ,
      this.characterScale * standScaleY,
      this.characterScale * standScaleXZ
    );
    this.character.screenPosition = {
      x: this.character.targetPosition.x,
      y: this.character.targetPosition.y,
    };
    setModelOpacity(this.character.wrapper, Math.max(standOpacity, 0));
    this.paintCharacter();

    if (!this.sittingCharacter) {
      return;
    }

    this.sittingCharacter.wrapper.visible = sitOpacity > 0.02;
    this.sittingCharacter.wrapper.scale.setScalar(
      this.sittingScale * (0.94 + 0.06 * eased)
    );
    this.sittingCharacter.screenPosition = {
      x: this.character.targetPosition.x,
      y: this.character.targetPosition.y,
    };
    setModelOpacity(this.sittingCharacter.model, Math.max(sitOpacity, 0));
    this.paintSittingCharacter();
  }

  sitCharacter() {
    this.character.state = "sitting";
    this.character.wrapper.visible = false;
    this.character.wrapper.scale.setScalar(this.characterScale);
    setModelOpacity(this.character.wrapper, 1);

    if (this.sittingCharacter) {
      this.sittingCharacter.screenPosition = { ...this.character.targetPosition };
      this.sittingCharacter.wrapper.visible = true;
      this.sittingCharacter.wrapper.scale.setScalar(this.sittingScale);
      setModelOpacity(this.sittingCharacter.model, 1);
      this.paintSittingCharacter();
    } else {
      this.character.wrapper.visible = true;
    }

    this.container.dataset.characterState = "sitting";
  }

  updateExpressions(delta) {
    if (this.character?.state === "sitting") {
      this.sittingElapsed += delta;
      if (
        !this.hasPlayedSittingExpression &&
        this.sittingElapsed >= this.options.expressionDelay
      ) {
        this.hasPlayedSittingExpression = true;
        this.spawnSittingExpressions();
      }
    }

    this.expressions = this.expressions.filter((expression) => {
      expression.elapsed += delta;
      const localElapsed = expression.elapsed - expression.delay;

      if (localElapsed < 0) {
        return true;
      }

      const progress = clamp(localElapsed / this.options.expressionDuration, 0, 1);
      const pop = progress < 0.18 ? easeInOut(progress / 0.18) : 1;
      const drift = this.characterHeight * 0.48 * easeInOut(progress);
      const fade = 1 - easeInOut(Math.max(0, (progress - 0.42) / 0.58));
      const wobble = Math.sin(progress * Math.PI * 1.8) * this.characterHeight * 0.035;

      expression.element.style.opacity = String(fade);
      expression.element.style.transform = [
        "translate(-50%, -50%)",
        `translate(${wobble}px, ${-drift}px)`,
        `scale(${0.55 + 0.45 * pop})`,
      ].join(" ");

      if (progress >= 1) {
        expression.element.remove();
        return false;
      }

      return true;
    });
  }

  spawnSittingExpressions() {
    const sittingPosition =
      this.sittingCharacter?.screenPosition || this.character.targetPosition;
    const fontSize = clamp(this.characterHeight * 0.133, 11, 16);
    const headX = sittingPosition.x;
    const sittingHeight = this.characterHeight * 0.72;
    const headY = sittingPosition.y - sittingHeight - fontSize * 0.65 - 4;

    this.options.expressionEmojis.forEach((emoji, index) => {
      const element = this.options.expressionImageUrl
        ? document.createElement("img")
        : document.createElement("span");
      element.className = "character-expression";
      if (this.options.expressionImageUrl) {
        element.src = this.options.expressionImageUrl;
        element.alt = "";
        element.decoding = "async";
        element.draggable = false;
      } else {
        element.textContent = emoji;
      }
      Object.assign(element.style, {
        position: "absolute",
        display: "block",
        left: `${headX}px`,
        top: `${headY}px`,
        width: `${fontSize}px`,
        height: `${fontSize}px`,
        fontSize: `${fontSize}px`,
        lineHeight: "1",
        objectFit: "contain",
        opacity: "0",
        pointerEvents: "none",
        transform: "translate(-50%, -50%) scale(0.55)",
        willChange: "opacity, transform",
      });
      this.expressionLayer.appendChild(element);

      this.expressions.push({
        element,
        elapsed: 0,
        delay: index * this.options.expressionStagger,
      });
    });
  }

  clearExpressions() {
    this.expressions.forEach((expression) => expression.element.remove());
    this.expressions = [];
    this.expressionLayer.replaceChildren();
  }

  animate(now) {
    if (this.destroyed) {
      return;
    }

    this.animationFrame = window.requestAnimationFrame(this.animate);
    const frameInterval = 1000 / this.options.maxFps;
    if (now - this.lastRenderTime < frameInterval) {
      return;
    }

    const delta = Math.min(this.clock.getDelta(), 0.05);
    this.lastRenderTime = now;
    this.character?.mixer.update(delta);
    if (this.character) {
      this.updateCharacter(delta);
      this.updateExpressions(delta);
    }
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    this.destroyed = true;
    window.cancelAnimationFrame(this.animationFrame);
    window.removeEventListener("resize", this.handleResize);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    this.character?.mixer.stopAllAction();
    this.clearExpressions();
    this.renderer.dispose();
    this.container.replaceChildren();
    document.body.classList.remove("has-3d-characters");
  }
}
