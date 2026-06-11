import { CampfireController } from "./scene/fire.js";
import { CharacterMotionGallery } from "./scene/characters3d.js?v=ground-contact-2";
import { NightSkyRenderer } from "./scene/sky.js";
import { DirtGroundRenderer } from "./scene/ground.js";

const sceneRoot = document.querySelector(".scene");
const hearthCanvas = document.getElementById("hearthCanvas");
const realFlameVideo = document.getElementById("realFlameVideo");
const realFlameCanvas = document.getElementById("realFlameCanvas");
const character3dLayer = document.getElementById("character3dLayer");
const starCanvas = document.getElementById("starCanvas");
const groundCanvas = document.getElementById("groundCanvas");

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

if (character3dLayer) {
  const walkingCharacter = new CharacterMotionGallery(character3dLayer);
  walkingCharacter.start().catch((error) => {
    console.error("움보이 3D 모션을 불러오지 못했습니다.", error);
  });
}
