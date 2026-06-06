import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";

const WALK_CLIP = "Walking";
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export class CharacterMotionGallery {
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      modelUrl: "./src/assets/models/umboi-web.glb",
      maxFps: 24,
      walkSpeed: 44,
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
    this.animationFrame = null;
    this.lastRenderTime = 0;
    this.sourceHeight = 1;
    this.characterHeight = 96;
    this.destroyed = false;

    this.handleResize = this.handleResize.bind(this);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    this.animate = this.animate.bind(this);
  }

  async start() {
    this.container.appendChild(this.renderer.domElement);
    this.addLights();
    this.handleResize();
    window.addEventListener("resize", this.handleResize, { passive: true });
    document.addEventListener("visibilitychange", this.handleVisibilityChange);

    const gltf = await new GLTFLoader().loadAsync(this.options.modelUrl);
    if (this.destroyed) {
      return [];
    }

    this.buildCharacter(gltf);
    this.handleResize();
    this.container.classList.add("is-ready");
    document.body.classList.add("has-3d-characters");
    this.clock.start();
    this.animationFrame = window.requestAnimationFrame(this.animate);

    return [{ role: "walk", number: 18, name: WALK_CLIP }];
  }

  addLights() {
    const hemisphere = new THREE.HemisphereLight(0xaec7ff, 0x4b1d0c, 0.8);
    const fireLight = new THREE.PointLight(0xff9a47, 1.8, 1300, 1.8);
    const fillLight = new THREE.DirectionalLight(0xffead3, 0.6);

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
      screenPosition: { x: 0, y: 0 },
      startPosition: { x: 0, y: 0 },
      targetPosition: { x: 0, y: 0 },
      moveElapsed: 0,
      moveDuration: 1,
    };
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

    return {
      targetHeight,
      start: {
        x: -targetHeight * 0.75,
        y: footY,
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

    this.camera.left = -width / 2;
    this.camera.right = width / 2;
    this.camera.top = height / 2;
    this.camera.bottom = -height / 2;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);

    if (!this.character) {
      return;
    }

    const route = this.getRoute(width, height);
    this.characterHeight = route.targetHeight;
    this.character.wrapper.scale.setScalar(route.targetHeight / this.sourceHeight);

    if (this.character.state === "stopped") {
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
      this.character.screenPosition.y = route.target.y;
    }

    this.paintCharacter(width, height);
  }

  setWalkingRoute(route) {
    const distance = Math.abs(route.target.x - route.start.x);
    this.character.state = "walking";
    this.character.startPosition = { ...route.start };
    this.character.targetPosition = { ...route.target };
    this.character.screenPosition = { ...route.start };
    this.character.moveElapsed = 0;
    this.character.moveDuration = distance / this.options.walkSpeed;
    this.character.walkAction.paused = false;
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
    this.character.wrapper.position.set(
      this.character.screenPosition.x - width / 2,
      height / 2 - this.character.screenPosition.y,
      0
    );
  }

  updateCharacter(delta) {
    if (this.character.state === "stopped") {
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
    this.character.screenPosition.y = this.character.targetPosition.y;
    this.paintCharacter();

    if (progress >= 1) {
      this.character.state = "stopped";
      this.character.screenPosition = { ...this.character.targetPosition };
      this.character.walkAction.paused = true;
      this.paintCharacter();
    }
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
    }
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    this.destroyed = true;
    window.cancelAnimationFrame(this.animationFrame);
    window.removeEventListener("resize", this.handleResize);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    this.character?.mixer.stopAllAction();
    this.renderer.dispose();
    this.container.replaceChildren();
    document.body.classList.remove("has-3d-characters");
  }
}
