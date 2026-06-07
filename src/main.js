import { CampfireController } from "./scene/fire.js";
import { NightSkyRenderer } from "./scene/sky.js";
import { DirtGroundRenderer } from "./scene/ground.js";

const sceneRoot = document.querySelector(".scene");
const hearthCanvas = document.getElementById("hearthCanvas");
const realFlameVideo = document.getElementById("realFlameVideo");
const realFlameCanvas = document.getElementById("realFlameCanvas");
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
