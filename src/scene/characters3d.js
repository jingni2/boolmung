import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";

const WALK_CLIP = "Walking";
const IDLE_CLIPS = [
  "Wave_One_Hand",
  "Tightrope_Walk_inplace",
  "Hip_Hop_Dance_4",
];

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const randomBetween = (min, max) => min + Math.random() * (max - min);

export class CharacterMotionGallery {
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      modelUrl: "./src/assets/models/umboi-web.glb",
      characterCount: 3,
      maxFps: 24,
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
    this.characters = [];
    this.animationFrame = null;
    this.lastRenderTime = 0;
    this.sourceHeight = 1;
    this.destroyed = false;
    this.paused = false;

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

    this.buildCharacters(gltf);
    this.handleResize();
    this.container.classList.add("is-ready");
    document.body.classList.add("has-3d-characters");
    this.clock.start();
    this.animationFrame = window.requestAnimationFrame(this.animate);

    return [
      { role: "walk", number: 18, name: WALK_CLIP },
      { role: "idle", number: 19, name: IDLE_CLIPS[0] },
      { role: "idle", number: 16, name: IDLE_CLIPS[1] },
      { role: "idle", number: 8, name: IDLE_CLIPS[2] },
    ];
  }

  addLights() {
    const hemisphere = new THREE.HemisphereLight(0xaec7ff, 0x4b1d0c, 0.8);
    const fireLight = new THREE.PointLight(0xff9a47, 1.8, 1300, 1.8);
    const fillLight = new THREE.DirectionalLight(0xffead3, 0.6);

    fireLight.position.set(0, -80, 420);
    fillLight.position.set(-300, 420, 500);
    this.scene.add(hemisphere, fireLight, fillLight);
  }

  buildCharacters(gltf) {
    const template = gltf.scene;
    const bounds = new THREE.Box3().setFromObject(template);
    const center = bounds.getCenter(new THREE.Vector3());
    this.sourceHeight = Math.max(0.001, bounds.max.y - bounds.min.y);

    const requiredNames = [WALK_CLIP, ...IDLE_CLIPS];
    const clips = new Map(
      requiredNames.map((name) => [
        name,
        gltf.animations.find((clip) => clip.name === name),
      ])
    );

    requiredNames.forEach((name) => {
      if (!clips.get(name)) {
        throw new Error(`GLB에서 ${name} 모션을 찾을 수 없습니다.`);
      }
    });

    for (let index = 0; index < this.options.characterCount; index += 1) {
      const character = cloneSkeleton(template);
      const wrapper = new THREE.Group();

      character.position.set(-center.x, -bounds.min.y, -center.z);
      character.traverse((node) => {
        if (!node.isMesh) {
          return;
        }
        node.frustumCulled = false;
        node.castShadow = false;
        node.receiveShadow = false;
      });

      wrapper.add(character);
      this.scene.add(wrapper);

      const mixer = new THREE.AnimationMixer(character);
      const actions = new Map();
      clips.forEach((clip, name) => {
        const action = mixer.clipAction(clip);
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.clampWhenFinished = false;
        actions.set(name, action);
      });

      this.characters.push({
        index,
        wrapper,
        mixer,
        actions,
        currentAction: null,
        state: "idle",
        side: index === 0 ? "left" : "right",
        screenPosition: { x: 0, y: 0 },
        startPosition: { x: 0, y: 0 },
        targetPosition: { x: 0, y: 0 },
        moveElapsed: 0,
        moveDuration: 1,
        idleRemaining: randomBetween(1.2, 3.4),
      });
    }
  }

  playAction(character, name, fadeDuration = 0.35) {
    const nextAction = character.actions.get(name);
    if (!nextAction || nextAction === character.currentAction) {
      return;
    }

    nextAction.reset();
    nextAction.timeScale = name === WALK_CLIP ? 0.82 : randomBetween(0.72, 0.9);
    nextAction.fadeIn(fadeDuration).play();

    if (character.currentAction) {
      character.currentAction.fadeOut(fadeDuration);
    }
    character.currentAction = nextAction;
  }

  startIdle(character, initial = false) {
    character.state = "idle";
    character.idleRemaining = initial
      ? randomBetween(0.4, 2.2)
      : randomBetween(2.4, 5.8);
    const idleName = IDLE_CLIPS[Math.floor(Math.random() * IDLE_CLIPS.length)];
    this.playAction(character, idleName);
  }

  startWalking(character) {
    const target = this.pickGroundPosition(character);
    const dx = target.x - character.screenPosition.x;
    const dy = target.y - character.screenPosition.y;
    const distance = Math.hypot(dx, dy);

    character.state = "walking";
    character.startPosition = { ...character.screenPosition };
    character.targetPosition = target;
    character.moveElapsed = 0;
    character.moveDuration = clamp(distance / randomBetween(30, 42), 2.8, 8.5);
    character.wrapper.rotation.y = dx >= 0 ? 0.55 : -0.55;
    this.playAction(character, WALK_CLIP);
  }

  getPatrolZone(character) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const compact = width < 760;
    const edge = compact ? 34 : 58;
    const fireHalfWidth = Math.min(width * 0.2, 260) + (compact ? 38 : 56);
    const center = width / 2;
    const sideRange = character.side === "left"
      ? [edge, Math.max(edge + 8, center - fireHalfWidth)]
      : [Math.min(width - edge - 8, center + fireHalfWidth), width - edge];
    const sameSideCharacters = this.characters.filter(({ side }) => side === character.side);
    const sideIndex = sameSideCharacters.findIndex(({ index }) => index === character.index);
    const sideCount = Math.max(1, sameSideCharacters.length);
    const availableWidth = sideRange[1] - sideRange[0];

    if (!compact || sideCount === 1) {
      const laneWidth = availableWidth / sideCount;
      const gap = Math.min(22, laneWidth * 0.14);
      return {
        minX: sideRange[0] + laneWidth * sideIndex + gap,
        maxX: sideRange[0] + laneWidth * (sideIndex + 1) - gap,
        minY: height * 0.76,
        maxY: height * 0.92,
      };
    }

    // 좁은 화면에서는 같은 쪽 캐릭터의 세로 레인을 분리한다.
    const groundTop = height * 0.71;
    const groundBottom = height * 0.93;
    const laneHeight = (groundBottom - groundTop) / sideCount;
    const verticalGap = Math.min(12, laneHeight * 0.12);
    return {
      minX: sideRange[0],
      maxX: sideRange[1],
      minY: groundTop + laneHeight * sideIndex + verticalGap,
      maxY: groundTop + laneHeight * (sideIndex + 1) - verticalGap,
    };
  }

  pickGroundPosition(character) {
    const zone = this.getPatrolZone(character);

    return {
      x: randomBetween(zone.minX, zone.maxX),
      y: randomBetween(zone.minY, zone.maxY),
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

    if (this.characters.length > 0) {
      this.layoutCharacters(width, height);
    }
  }

  handleVisibilityChange() {
    this.paused = document.hidden;
    if (this.paused) {
      window.cancelAnimationFrame(this.animationFrame);
      return;
    }

    this.clock.getDelta();
    this.lastRenderTime = 0;
    this.animationFrame = window.requestAnimationFrame(this.animate);
  }

  layoutCharacters(width, height) {
    const compact = width < 760;
    const targetHeight = compact
      ? clamp(width * 0.16, 58, 76)
      : clamp(width * 0.072, 82, 112);
    const scale = targetHeight / this.sourceHeight;

    this.characters.forEach((character, index) => {
      character.wrapper.scale.setScalar(scale);

      if (character.screenPosition.x === 0) {
        const position = this.pickGroundPosition(character);
        character.screenPosition = position;
        character.startPosition = { ...position };
        character.targetPosition = { ...position };
        this.startIdle(character, true);
      } else {
        const zone = this.getPatrolZone(character);
        character.screenPosition.x = clamp(character.screenPosition.x, zone.minX, zone.maxX);
        character.screenPosition.y = clamp(character.screenPosition.y, zone.minY, zone.maxY);
        character.startPosition = { ...character.screenPosition };
        character.targetPosition = { ...character.screenPosition };
      }

      this.paintCharacter(character, width, height);
    });
  }

  paintCharacter(character, width = window.innerWidth, height = window.innerHeight) {
    character.wrapper.position.set(
      character.screenPosition.x - width / 2,
      height / 2 - character.screenPosition.y,
      0
    );
  }

  updateCharacter(character, delta) {
    if (character.state === "idle") {
      character.idleRemaining -= delta;
      if (character.idleRemaining <= 0) {
        this.startWalking(character);
      }
      return;
    }

    character.moveElapsed += delta;
    const progress = clamp(character.moveElapsed / character.moveDuration, 0, 1);
    const eased = progress * progress * (3 - 2 * progress);
    character.screenPosition.x = THREE.MathUtils.lerp(
      character.startPosition.x,
      character.targetPosition.x,
      eased
    );
    character.screenPosition.y = THREE.MathUtils.lerp(
      character.startPosition.y,
      character.targetPosition.y,
      eased
    );
    this.paintCharacter(character);

    if (progress >= 1) {
      this.startIdle(character);
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
    this.characters.forEach((character) => {
      character.mixer.update(delta);
      this.updateCharacter(character, delta);
    });
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    this.destroyed = true;
    window.cancelAnimationFrame(this.animationFrame);
    window.removeEventListener("resize", this.handleResize);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    this.characters.forEach((character) => character.mixer.stopAllAction());
    this.renderer.dispose();
    this.container.replaceChildren();
    document.body.classList.remove("has-3d-characters");
  }
}
