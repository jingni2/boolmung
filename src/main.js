import { RoamingCharacter } from "./character.js";
import { CampfireController } from "./scene/fire.js";
import { CharacterMotionGallery } from "./scene/characters3d.js";
import { NightSkyRenderer } from "./scene/sky.js";
import { DirtGroundRenderer } from "./scene/ground.js";

const wanderer = document.getElementById("wanderer");
const sceneRoot = document.querySelector(".scene");
const hearthCanvas = document.getElementById("hearthCanvas");
const realFlameVideo = document.getElementById("realFlameVideo");
const realFlameCanvas = document.getElementById("realFlameCanvas");
const character3dLayer = document.getElementById("character3dLayer");
const starCanvas = document.getElementById("starCanvas");
const groundCanvas = document.getElementById("groundCanvas");
const turnaroundFrames = Array.from({ length: 8 }, (_, index) =>
  `./src/assets/characters/umboi-${String(index + 1).padStart(2, "0")}.png`
);
let roamingCharacter = null;

if (starCanvas) {
  new NightSkyRenderer(starCanvas).start();
}

if (groundCanvas) {
  new DirtGroundRenderer(groundCanvas).start();
}

if (hearthCanvas || realFlameVideo || realFlameCanvas) {
  const campfire = new CampfireController({
    root: sceneRoot,
    hearthCanvas,
    realFlameVideo,
    realFlameCanvas,
  });
  campfire.start();
}

if (wanderer) {
  roamingCharacter = new RoamingCharacter(wanderer, {
    turnaroundFrames,
  });
  roamingCharacter.start();
}

if (character3dLayer) {
  const motionGallery = new CharacterMotionGallery(character3dLayer);
  motionGallery.start()
    .then((motions) => {
      roamingCharacter?.destroy();
      console.table(motions);
    })
    .catch((error) => {
      console.error("움보이 3D 모션을 불러오지 못했습니다.", error);
    });
}
