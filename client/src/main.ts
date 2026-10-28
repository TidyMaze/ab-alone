import * as THREE from 'three/webgpu';
import init, { Encounter, Engine, Royale, boss_ids, boss_name, engine_version } from 'abalone-wasm';
import {
  BOARD_CELLS,
  CELLS,
  CORE_CODE,
  DIRECTIONS,
  OVERSEER_CODE,
  RADIUS,
  VANISHED,
  arrowYaw,
  axialTo3D,
  cellIndex,
  encodeMove,
  groupTargets,
  moveForClick,
  parseMoves,
  toggleSelection,
  type Axial,
  type Move,
} from './board';
import { extendPath, releaseDir } from './drag';
import { KEY_DIRS, announce, moveFor, nextGroup } from './keyboard';
import { askBot, askEval, botBudget } from './bot';
import { AUTO_DELAY_MS, autoPlayState } from './autoplay';
import { hasMedal } from './medals';
import { bootFailed } from './bootfail';
import { bossHtml, goalShown } from './bosshud';
import { drawBossBar } from './bossbar';
import { choirChips, drawChoirChips } from './choirchips';
import { FOV, fitView, framing, isDrag, orbit, pinchScale, resetView, screenView, viewPosition, wheelScale, zoom, type View } from './camera';
import { FreeCameraController } from './freecam';
import { RenderModeManager, type RenderMode } from './rendermode';
import { lightPanel } from './lightpanel';
import { TUBE_SPACING, tubeLights } from './neonlight';
import { ClusteredLighting } from 'three/examples/jsm/lighting/ClusteredLighting.js';
import { Diagnostics, copyText, gameInfo } from './diagnostics';
import { BLOOD_DROPS, BLOOD_MS, bloodAt, bloodStainAt } from './blood';
import { ejectTrack, findEjection, trackAt, type EjectTrack } from './eject';
import { Analyst, evalFill, evalText } from './evalbar';
import { ghostMarbles } from './ghost';
import { Hint, type Spot } from './hint';
import { crackLeft, crackText, parseCracks, tickOffsets } from './hull';
import { COUNTER_MAX, drawCounter, eggGlow, eggText, parseEggs } from './alien';
import {
  CHEVRON_COLOR,
  CHEVRON_SHAPE,
  TRAIN_LEAD,
  TRAIN_PARTS,
  chevronSpots,
  knockedMarbles,
  parseTrains,
  passedTrains,
  railSpan,
  reachMs,
  trainAt,
  trainText,
  type Train,
} from './railyard';
import { BUBBLE_SPOT, HAZE_PER_VENT, TAUNTS, burnTrack, burnsPlayer, hazeAt, parseBurns, startsBurningPlayer, tauntIndex, toxinText, ventNote, type Burn } from './overseer';
import { ANGRY_HOLD_MS, FAREWELL, TAUNT_HOLD_MS, angryLine, speechAt, type Speech } from './speech';
import { blinkAt, drawAnnounce, drawGlyph, parseAnnounce, parseRepulsions, polarityText, repulsionMoves, type Repulsion } from './magnetizer';
import {
  RIB_SPACING,
  STRIKE_COLOR,
  beforeBelts,
  beltMoves,
  beltSpan,
  beltText,
  blinkAt as strikeBlink,
  chevronSpots as beltChevrons,
  counterSpot as beltCounterSpot,
  fellOff,
  parseBelts,
  parseCarries,
  plateSpots,
  ribOffsets,
  rollerSpots,
  slamAt,
  struckBy,
  type Belt,
  type Belts,
  type Carry,
} from './assembly';
import {
  PULSAR_BOUNDS,
  RIPPLES,
  PULSAR_PARTS,
  PULSE_COUNTER_SIZE,
  SHOCK_COLOR,
  charging,
  chevronSpots as pulseChevrons,
  counterSpot,
  fallen,
  parsePulse,
  parsePulsar,
  rippleAt,
  rippling,
  pulseMove,
  pulseText,
  pulsarSpot,
  shockAt,
  type Pulse,
  type Pulsar,
} from './pulsar';
import {
  CORE_COLOR,
  ENERGY,
  WARN_CHARGES,
  WARN_COLOR,
  burstAt,
  coreText,
  energyGlow,
  fallen as shoved,
  lostCells,
  parseCharges,
  parseCore,
  parseEvents,
  pipOffsets,
  shoveTracks,
  sweepAt,
  wedgeCorners,
  wedgeGlow,
  type Charge,
  type Core,
  type UnstableEvents,
} from './unstable';
import { ballastText, firedText, parseFired, type Fired } from './ballast';
import { chaplainText, parseCells, previewFlips } from './chaplain';
import { ARMY_NAMES, armiesLeft, choirText, parseArmies } from './choir';
import { BLAST_SHARDS, blastAt, martyrText, parseBlast, parseMartyr } from './martyr';
import { countAttempt, dailyCard, dailyFor, dailyLine, dailyTitle, utcDay, type Daily } from './daily';
import { coopFromHash, inviteUrl, newRoomId, roomFromHash, royaleFromHash, royaleUrl, type CoopFight } from './invite';
import { COOP_SIDE, attemptLine, coopTurn, retryText, seatAfter } from './coop';
import { hookTransport, p2pTransport } from './p2p';
import type { Transport } from './transport';
import { endBanner, royaleBanner } from './endbanner';
import { tallyLine } from './tally';
import { generateKeys } from './moverecord';
import { SIGNALING_TIMEOUT_MS } from './netcounters';
import { beatPeriod } from './coordinator';
import { OnlineSession } from './session';
import { coopStatus, onlineStatus, type OnlineStatus } from './presence';
import { playOnlineState } from './connectivity';
import { rematchText } from './rematch';
import { MARBLE_RADIUS, SLIDE_MS, slideAt, slideTracks, type SlideTrack } from './slide';
import { carryTurns, cellTurn, inHolder, rolledTurn, turnOf, type Quat } from './orient';
import { flatHudHtml, hudHtml } from './hud';
import { drawSkin, type Look } from './skinart';
import { nextSkin, skinById } from './skins';
import { glassSkinById, nextGlassSkin } from './glassskins';
import { readDifficulty, writeDifficulty, nextDifficulty, scaleBudget, DIFFICULTY_PERCENT, type Difficulty } from './difficulty';
import { DEFAULT_RATING } from './elo';
import { findMatch, toleranceWindow } from './matchmaking';
import { loadRankedProfile, rankedHudHtml, settleRanked1v1, settleRankedRoyale, type RankedMode } from './ranked';
import { archiveList, menuOpen, motionReduced, nextDisplay, settingsList, themeAttribute, VOLUME_NAMES, type MenuEvent, type Theme } from './settings';
import { icon } from './icons';
import { fpsOf, keepWindow } from './fps';
import { DECKS, DECOR, LIGHT } from './light';
import { ROOM_SURFACE, spaceshipArchitecture, spaceshipLights } from './room';
import { createCanvasTexture, drawHazardStripes, drawWallPanel } from './roomart';
import { applyDeckAtmosphere, DECK_ATMOSPHERES, type DeckId, loadSpaceshipBay, type SpaceshipBayAssets } from './roomloader';
import { DECK_PARTICLES, deckOf, type Deck } from './deck';
import { AUDIO_LOGS, lineAt, logOf, type AudioLog } from './audiologs';
import { LORE } from './lore';
import { collectedLogs, markCollected, markRead, readLore } from './lorestore';
import { drawTerminal, pageAt, TERMINAL, terminalFonts, terminalPages, type TerminalPage } from './terminal';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import {
  drawDue,
  fogSettings,
  hasParticles,
  isAutomation,
  shadowSettings,
  readClearBoard,
  readFlatHud,
  readFps,
  readReducedMotion,
  readGlassSkin,
  readSafeMode,
  readSkin,
  readMix,
  readPalette,
  readTheme,
  readTier,
  type Tier,
  readTranscript,
  readUiScale,
  hasReflections,
  meshDetail,
  renderPixelRatio,
  writeClearBoard,
  writeFlatHud,
  writeFps,
  writeReducedMotion,
  writeGlassSkin,
  writePalette,
  writeSafeMode,
  writeSkin,
  writeVolume,
  writeTheme,
  writeTier,
  writeTranscript,
  writeUiScale,
} from './quality';
import { nextPalette, paletteById, type Palette } from './palettes';
import { limitFlash } from './safe';
import { clampUiScale, maxUiScale, uiScaleFactor, type UiScale } from './uiscale';
import { BUSES, Sfx, TellWatch, type Bus, type Tell } from './sound';
import { rimDanger, tensionLevel } from './tension';
import { glassSide, sideName } from './glass';
import { ACCENTS, CONVERTED, CORE, coreLevel, GLASS, HEAT, pulseAt, SHELL, type Accent } from './marbles';
import { FRAME, frameShape, rimHalves, rimLight, type FrameShape, type Point } from './frame';
import { notchRow } from './notches';
import { tallyRow, tallySlots } from './tallymarks';
import { formatScore } from './score';
import { bestTurns, medalLabel, medalLine, medalRoom, playerTurns, recordMedal, type MedalResult } from './medals';
import { loadProgress, recordWin, saveProgress } from './progress';
import { roomAt, type Spot as HubSpot } from './hub';
import { HubController } from './controller';
import { indexedDbStore } from './idb';
import { LocalSaves } from './savegame';
import { engineAt, replayKey, replayLabel, stepPly, type ReplayStep } from './replay';
import { CONFIRM_MS, newGameLabel, pressNewGame, type Confirm } from './newgame';
import { gameFileName, gameFileText, readGameFile } from './gamefile';
import { ARENA, ARENA_SCALE, YOU, deadlineText, loadRoyale, nextRound, outSeats, parseLog, roundOrders, royaleHtml, seatAt, standings, type RoyaleFile } from './royale';
import { buildReveal, shownAt, sinkAt, type Fall, type Reveal } from './royale-reveal';
import { netStatus, parseRoyale, ROOM_JUDGE, roundPeriod, RoyaleNet, seedOf } from './royale-net';
import { SEAT_GLYPHS, SEAT_INK, SEATS } from './marbles';
import './ui.css';

import { BONE, COLORS, FRAME_LOOK, SceneRenderer } from './scene';
const BOT_SIDE = 2; // the human plays side 1 (the glass), the bot plays side 2
declare const __BUILD__: string; // the commit, set by vite.config.ts

// Net state changes, refused moves, desyncs and bot search times, kept in memory for Copy diagnostics (#220).
const diag = new Diagnostics(() => performance.now(), console);

// Offline app (#193): the production build registers the service worker that scripts/offline-app.mjs writes (at the
// end of this file), the dev server none. A new build that takes over this page leaves it the files of its own build
// (offline.ts keeps the previous cache), and New version offers the reload that runs the new build whole. Listened
// to before the first await: the new build can take over while this page is still loading.
const serviceWorker = import.meta.env.PROD && 'serviceWorker' in navigator ? navigator.serviceWorker : null;
const updateButton = document.getElementById('update') as HTMLButtonElement;
updateButton.addEventListener('click', () => location.reload());
if (serviceWorker) {
  const updating = serviceWorker.controller !== null; // a first install takes control, it is no update
  serviceWorker.addEventListener('controllerchange', () => {
    if (updating) updateButton.hidden = false;
  });
}

document.getElementById('boot-reload')!.addEventListener('click', () => location.reload());
await init().catch(bootFailed);
let engine: Engine | Encounter = new Engine();
// Replay (#793): while set, `engine` is the position after `ply` moves of the move log, rebuilt by replaying the log on a
// new engine, and `live` is the game itself, put back in place by Live or by any move that arrives.
let replaying: { live: Engine | Encounter; ply: number } | null = null;
// Encounter mode: the boss and seed of the running fight, kept so Retry restarts the same one. A daily
// fight also keeps its UTC day and its attempt of that day (#195).
// The Goal control (#248): the HUD shows the boss goal before the first move, then only while it is open.
const goalButton = document.getElementById('boss-goal') as HTMLButtonElement;
let goalOpen = false;
let fight: { id: string; seed: number; daily?: { day: string; attempt: number } } | null = null;
const activeRadius = (): number => (fight?.id === 'ballast' ? 5 : 4);
// The view a fight opens on: the whole board of its radius (#573), drawn back in a Pulsar fight until every pulsar and
// its counter fit the window too (#691), off the HUD plate (#695).
const fightView = (): View =>
  fight?.id === 'pulsar'
    ? fitView(resetView(), PULSAR_BOUNDS, innerWidth, innerHeight, [document.getElementById('hud')!.getBoundingClientRect()])
    : resetView(activeRadius());
// The view last set by a fight start or Reset view (#696): while it is still the view, the player has not moved the
// camera himself and a new window size fits it again. Once he orbits or zooms, his view stays until Reset view.
let fitted: View | null = null;
const makeGame = (): Engine | Encounter => (fight ? new Encounter(fight.id, fight.seed) : new Engine());
// The battle royale (#502) while it is on, else null.
let royale: Royale | null = null;
// Its rounds when it is an online one (#504), and the interval that lets their deadlines pass.
let royaleNet: RoyaleNet<Royale> | null = null;
let ticking = 0;

// ?backend=webgl forces the WebGL2 backend, anything else lets three pick WebGPU first.
const forceWebGL = new URLSearchParams(location.search).get('backend') === 'webgl';

// Textures ship as KTX2, encoded from client/textures/ by scripts/ktx2-textures.mjs (#700). KTX2Loader transcodes each
// one to a format the GPU reads, which it asks the renderer: the renderer comes up first. Its transcoder is a file of
// the build (a hashed asset, like the wasm), so the offline app has it. A failed load keeps the flat fallback look.
const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL });
await renderer.init().catch(bootFailed);
// The neon tubes' rows of short lights (neonlight.ts) cost little when each pixel only adds the lights that reach it:
// clustered (Forward+) lighting, 4x the frame rate of a rect light per tube. It needs compute shaders, so WebGPU only:
// on WebGL a tube gets one light.
const clustered = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend === true;
if (clustered) renderer.lighting = new ClusteredLighting();
const loader = new KTX2Loader().detectSupport(renderer);
async function loadTexture(name: string, srgb: boolean, tiled: boolean): Promise<THREE.Texture | null> {
  try {
    const t = await loader.loadAsync(`${import.meta.env.BASE_URL}assets/${name}`);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    if (tiled) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  } catch {
    return null;
  }
}
// The cells' albedo and normal map of each deck (#401, #440), loaded the first time a mode starts on that deck:
// a page that stays at the Mess loads the Mess one only.
const deckMaps = new Map<Deck, Promise<THREE.Texture | null>>();
const deckMap = (name: Deck): Promise<THREE.Texture | null> => {
  if (!deckMaps.has(name)) deckMaps.set(name, loadTexture(`deck-${name}.ktx2`, true, true));
  return deckMaps.get(name)!;
};
const deckNormalMaps = new Map<Deck, Promise<THREE.Texture | null>>();
const deckNormalMap = (name: Deck): Promise<THREE.Texture | null> => {
  if (!deckNormalMaps.has(name)) deckNormalMaps.set(name, loadTexture(`deck-${name}-normal.ktx2`, false, true));
  return deckNormalMaps.get(name)!;
};
const [
  deckAlbedo,
  deckRoughness,
  shellNormal,
  backdrop,
  crackDecal,
  firstDeckMap,
  firstDeckNormal,
  plateAlbedo,
  plateRoughness,
  plateNormal,
  rimAlbedo,
  rimRoughness,
  rimNormal,
] = await Promise.all([
  loadTexture('deck-albedo.ktx2', true, true),
  loadTexture('deck-roughness.ktx2', false, true),
  loadTexture('shell-normal.ktx2', false, true),
  loadTexture('backdrop.ktx2', true, false),
  loadTexture('crack-decal.ktx2', false, false),
  deckMap(deckOf('local')), // a page opens at the Mess
  deckNormalMap(deckOf('local')),
  // The board plate: brushed aluminium, ambientCG Metal051A (CC0), large swirls.
  loadTexture('pbr/board-albedo.ktx2', true, true),
  loadTexture('pbr/board-roughness.ktx2', false, true),
  loadTexture('pbr/board-normal.ktx2', false, true),
  loadTexture('pbr/plate-albedo.ktx2', true, true),
  loadTexture('pbr/plate-roughness.ktx2', false, true),
  loadTexture('pbr/plate-normal.ktx2', false, true),
]);

if (plateAlbedo) {
  plateAlbedo.wrapS = plateAlbedo.wrapT = THREE.RepeatWrapping;
  plateAlbedo.repeat.set(0.15, 0.15);
}
if (plateRoughness) {
  plateRoughness.wrapS = plateRoughness.wrapT = THREE.RepeatWrapping;
  plateRoughness.repeat.set(0.15, 0.15);
}
if (plateNormal) {
  plateNormal.wrapS = plateNormal.wrapT = THREE.RepeatWrapping;
  plateNormal.repeat.set(0.15, 0.15);
}

const sceneRenderer = new SceneRenderer({
  renderer,
  backdrop,
  deckAlbedo,
  deckRoughness,
  firstDeckMap,
  firstDeckNormal,
  plateAlbedo,
  plateRoughness,
  plateNormal,
  rimAlbedo,
  rimRoughness,
  rimNormal,
});
await sceneRenderer.init().catch(bootFailed);
const {
  scene,
  camera,
  backend,
  ambient,
  lamp,
  coldRim,
  warmLight,
  decor,
  decorMaterial,
  fogObj,
  plate,
  rim,
  roomDeck,
  propsGroup,
  notches,
  tallies,
  marbles,
  ghosts,
  arenaMarbles,
  particles,
  particlePositions,
  particleGeometry,
  particlePositionAttr,
  particleMaterial,
  grooveGeometry,
  scratchGeometry,
  thresholdGeometry,
  thresholdMarkGeometry,
  grooveMaterial,
  scratchMaterial,
} = sceneRenderer;

function prefilteredRoom(): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return texture;
}
// Fog and vignette follow the quality tier, clear-board switches both off (docs/specs/tech.md 5.1).
const store = (() => {
  try {
    return localStorage;
  } catch {
    return null;
  }
})();
// Reduced motion (#379): the setting of the menu once pressed, else the system's prefers-reduced-motion, read live.
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
let savedMotion = readReducedMotion(store);
let flatHud = readFlatHud(store); // the flat HUD fallback (#391): every game-critical value as text on the plate
let transcriptOn = readTranscript(store); // the audio log transcript (#516), on by default
const reducedMotion = (): boolean => motionReduced(motionQuery.matches, savedMotion);
let tier = readTier(store, {
  width: innerWidth,
  cores: navigator.hardwareConcurrency,
  memory: (navigator as { deviceMemory?: number }).deviceMemory,
  reducedMotion: reducedMotion(),
});
const queryQuality = new URLSearchParams(location.search).get('quality');
if (queryQuality === 'high' || queryQuality === 'low') {
  tier = queryQuality;
  writeTier(store, tier);
}
diag.log.log('info', 'start', { backend, tier });

// Reflections (#376, #424): prefiltered room used for marble materials on high tier only.
// Omitted on low tier / mobile and under automation to save WebGL2 fill rate and PMREM prefilter cost (#416, #424).
const reflections = hasReflections(tier, navigator.webdriver) ? prefilteredRoom() : null;

// The whole board fits the window, held upright too, below the HUD and the buttons (#227).
function frameCamera(): void {
  sceneRenderer.frameCamera(innerWidth, innerHeight);
}
frameCamera();
let view = resetView();
// The terminal reader (#512): while the player reads the deck console, the view to go back to, else null.
let reading: View | null = null;
const consoleDef = spaceshipArchitecture(tier).find((p) => p.id === 'console-screen')!; // in every tier (room.ts)
function updateFog(): void {
  sceneRenderer.fogRadius = fogRadius;
  sceneRenderer.updateFog(tier, clear, view, fogRadius, deck);
}

function applyView(): void {
  if (freeCam.active) {
    updateFreeCamCamera();
    return;
  }
  sceneRenderer.fogRadius = fogRadius;
  sceneRenderer.applyView(view, reading, { tier, clear, deck, consoleDef });
}

const freeCam = new FreeCameraController();
const renderModeManager = new RenderModeManager();
let renderMode: RenderMode = 'normal';

function updateFreeCamCamera(): void {
  sceneRenderer.camera.position.set(freeCam.position.x, freeCam.position.y, freeCam.position.z);
  const target = freeCam.getLookTarget();
  sceneRenderer.camera.lookAt(target.x, target.y, target.z);
  sceneRenderer.camera.updateMatrixWorld();
  drawAsked = true;
}

/** The free camera on (from where the camera is, facing `at`: the board's middle, or a light of ?lights) or off. */
function toggleFreeCam(enabled?: boolean, at: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }): void {
  const shouldEnable = enabled !== undefined ? enabled : !freeCam.active;
  if (shouldEnable) {
    const curPos = sceneRenderer.camera.position;
    const forwardX = at.x - curPos.x;
    const forwardY = at.y - curPos.y;
    const forwardZ = at.z - curPos.z;
    const horizDist = Math.hypot(forwardX, forwardZ);
    const yaw = Math.atan2(-forwardX, -forwardZ);
    const pitch = Math.atan2(forwardY, Math.max(0.001, horizDist));
    freeCam.enable(curPos, yaw, pitch);
    updateFreeCamCamera();
  } else {
    freeCam.disable();
    applyView();
  }
  document.getElementById('free-cam')!.setAttribute('aria-pressed', String(freeCam.active));
}

function setRenderMode(mode: RenderMode): void {
  renderMode = mode;
  renderModeManager.setMode(sceneRenderer.scene, mode);
  paintMenu();
  drawAsked = true;
}

function cycleRenderMode(): RenderMode {
  renderMode = renderModeManager.cycle(sceneRenderer.scene);
  paintMenu();
  drawAsked = true;
  return renderMode;
}
let clear = readClearBoard(store);
const forceShadows =
  new URLSearchParams(location.search).get('shadows') === 'on' ||
  new URLSearchParams(location.search).get('shadows') === '1';
const forceParticles =
  new URLSearchParams(location.search).get('particles') === 'on' ||
  new URLSearchParams(location.search).get('particles') === '1';
// The deck in play (#400): its light and fog. A page opens on a local game, hot-seat or against the bot, at the Mess.
let deck: Deck = deckOf('local');
// The theme (#317): System follows the system setting, Dark and Light set data-theme (index.html sets it before the first paint).
let theme: Theme = readTheme(store);
let skin = readSkin(store); // the dark shell skin (#377), skins.ts
let glass = readGlassSkin(store); // the pale glass skin (#377), glassskins.ts
let palette: Palette = readPalette(store); // the colorblind palette (#381), palettes.ts
let difficulty: Difficulty = readDifficulty(store); // the AI and boss difficulty (#704), difficulty.ts
// The FPS readout (#426): off by default. Off, the frame loop only checks the flag; on, it keeps the last frame stamps.
let fpsOn = readFps(store);
let fpsStamps: number[] = [];
let lastFps = 0;
function applyTheme(): void {
  const value = themeAttribute(theme);
  if (value) document.documentElement.dataset.theme = value;
  else delete document.documentElement.dataset.theme;
}
// Photosensitivity safe mode (#380), on by default, and the UI scale (#382): one custom property on the root, which
// the HUD and the settings menu read (ui.css). The board does not scale.
let safe = readSafeMode(store);
let uiScale: UiScale = clampUiScale(readUiScale(store), maxUiScale(innerWidth, innerHeight));
function applyUiScale(): void {
  document.documentElement.style.setProperty('--ui-scale', uiScaleFactor(uiScale));
}
applyUiScale();
// Safe mode (#380) caps the one flashing effect, the end-of-game light: its peak and duration are custom properties
// that ui.css reads. The win light pulses once in 1.6 s (0.625 a second), under the 3 a second cap.
const applySafe = (): void => {
  const light = limitFlash({ rate: 1 / 1.6, amplitude: 1 }, safe);
  document.documentElement.style.setProperty('--end-peak', String(light.amplitude));
  document.documentElement.style.setProperty('--end-duration', `${1 / light.rate}s`);
};
applySafe();
// The sounds (docs/specs/world.md section 7) through four buses, each with its volume slider in the menu (#438). The
// audio context waits for a user gesture: browsers block audio before one. A mouse press or a key is a gesture on the
// way down, a touch on the way up, and moving a slider up from 0 starts it too (setVolume).
const sfx = new Sfx(() => (typeof AudioContext === 'undefined' ? null : new AudioContext()), readMix(store));
// The sound twin of each boss tell (#358), only when the tell appears or changes. The cues played, read by the e2e tests.
const tells = new TellWatch();
const tellCues: Tell[] = [];
function tellSound(tell: Tell, marks: readonly unknown[]): void {
  if (!tells.changed(tell, marks)) return;
  const cue = sfx.tell(tell);
  if (cue) tellCues.push(cue);
}
// The frame's radius, for the fog that starts at its edge (#399): drawFrame sets it.
let fogRadius = RADIUS;
let drawProps: () => void = () => {};

function updateParticles(): void {
  sceneRenderer.updateParticles(tier, clear, reducedMotion(), navigator.webdriver, forceParticles, deck);
}

// How many times the look was rebuilt: an orbit never rebuilds it (bug #475, e2e/camera.spec.ts).
let looks = 0;
let pulsing = false;
(window as unknown as Record<string, unknown>).__looks = () => looks;
(window as unknown as Record<string, unknown>).__setTier = (nextTier: Tier) => {
  tier = nextTier;
  writeTier(store, tier);
  applyLook();
};
function applyLook(): void {
  looks++;
  updateFog();
  renderer.setPixelRatio(renderPixelRatio(devicePixelRatio, navigator.webdriver, tier));
  const shadowConf = shadowSettings(tier, isAutomation(navigator.webdriver), forceShadows);
  renderer.shadowMap.enabled = shadowConf.enabled;
  renderer.shadowMap.type = shadowConf.soft ? THREE.PCFSoftShadowMap : THREE.BasicShadowMap;
  document.body.dataset.tier = tier;
  document.body.dataset.clear = clear ? 'on' : 'off';
  document.body.dataset.shadows = shadowConf.enabled ? 'on' : 'off'; // read by the e2e tests (#729)
  drawProps();
  updateParticles();
  if (reducedMotion()) document.documentElement.dataset.motion = 'reduced'; // ui.css cuts every animation
  else delete document.documentElement.dataset.motion;
  pulsing = tier === 'high' && !safe && !reducedMotion(); // the shell's heat pulse (#509)
  document.body.dataset.pulse = pulsing ? 'on' : 'off';
}
// The settings menu: one button per item, its icon then its label, opened by the cog only. Escape, a press outside
// and the cog close it. A toggle shows its state in aria-pressed.
const cog = document.getElementById('settings') as HTMLButtonElement;
const menu = document.getElementById('settings-menu')!;
const toggles: Record<string, () => void> = {
  'clear-board': () => {
    clear = !clear;
    writeClearBoard(store, clear);
  },
  // Sound opens the volume page (#438): the four sliders in place of the items, until the menu closes.
  sound: () => {
    menu.dataset.page = 'volume';
    sliderAt('music').focus();
  },
  transcript: () => {
    transcriptOn = !transcriptOn;
    writeTranscript(store, transcriptOn);
    paintLog();
  },
  theme: () => {
    const next = nextDisplay(theme, uiScale, safe, maxUiScale(innerWidth, innerHeight));
    theme = next.theme;
    uiScale = next.scale;
    safe = next.safe;
    writeTheme(store, theme);
    writeUiScale(store, uiScale);
    writeSafeMode(store, safe);
    applyTheme();
    applyUiScale();
    applySafe();
    layoutConsole();
  },
  'shell-skin': () => {
    skin = nextSkin(skin);
    writeSkin(store, skin);
    marbleMaterials[1] = shellMaterial(skin);
    refresh();
  },
  'reduced-motion': () => {
    savedMotion = !reducedMotion();
    writeReducedMotion(store, savedMotion);
  },
  'flat-hud': () => {
    flatHud = !flatHud;
    writeFlatHud(store, flatHud);
    reader.classList.toggle('flat', flatHud);
    refresh();
  },
  'glass-skin': () => {
    glass = nextGlassSkin(glass);
    writeGlassSkin(store, glass);
    setGlassLook(glass);
    refresh();
  },
  palette: () => {
    palette = nextPalette(palette);
    writePalette(store, palette);
    applyPalette();
    refresh();
  },
  difficulty: () => {
    difficulty = nextDifficulty(difficulty);
    writeDifficulty(store, difficulty);
  },
  'render-mode': () => {
    cycleRenderMode();
  },
};
const sliderAt = (bus: Bus): HTMLInputElement => document.getElementById(`volume-${bus}`) as HTMLInputElement;
const paintMenu = (): void => {
  for (const { id, label, icon: name, on } of settingsList(clear, theme, skin, glass, uiScale, safe, reducedMotion(), flatHud, palette, transcriptOn, difficulty, renderMode)) {
    const row = document.getElementById(`setting-${id}`)!;
    row.innerHTML = `${icon(name)}<span>${label}</span>`;
    const full = id === 'difficulty' ? `Difficulty: ${difficulty} (${DIFFICULTY_PERCENT[difficulty]}%)` : label;
    row.setAttribute('aria-label', full); // held upright only the icon shows (#414): the name stays for screen readers
    row.title = full; // and as a tooltip
    if (on !== undefined) row.setAttribute('aria-pressed', String(on));
  }
};
for (const { id } of settingsList(clear, theme, skin, glass, uiScale, safe, reducedMotion(), flatHud, palette, transcriptOn, difficulty, renderMode)) {
  const row = menu.appendChild(document.createElement('button'));
  row.id = `setting-${id}`;
  row.type = 'button';
  const toggle = toggles[id];
  if (!toggle) {
    row.disabled = true; // Export game and Import game: enabled once their listeners are in, below (#146)
    continue;
  }
  row.addEventListener('click', () => {
    toggle();
    applyLook();
    paintMenu();
  });
}
paintMenu();
// The FPS switch (#426) is a second button in the Clear board item's group: no row of its own, so the menu keeps its height.
const fpsBox = document.getElementById('fps') as HTMLDivElement;
const fpsButton = document.createElement('button');
fpsButton.id = 'setting-fps';
fpsButton.type = 'button';
fpsButton.textContent = 'FPS';
fpsButton.setAttribute('aria-pressed', String(fpsOn));
const clearRow = document.getElementById('setting-clear-board')!;
const clearGroup = document.createElement('div');
clearGroup.className = 'setting-group';
clearRow.replaceWith(clearGroup);
clearGroup.append(clearRow, fpsButton);
// The glass skin (#377) is a second button in the shell skin's item: no row of its own, so the menu keeps its height.
const shellSkinRow = document.getElementById('setting-shell-skin')!;
const skinGroup = document.createElement('div');
skinGroup.className = 'setting-group skin-pair';
shellSkinRow.replaceWith(skinGroup);
skinGroup.append(shellSkinRow, document.getElementById('setting-glass-skin')!);
// The palette choice (#381) is a second button in the theme item: no row of its own, so the menu keeps its height.
const themeRow = document.getElementById('setting-theme')!;
const themeGroup = document.createElement('div');
themeGroup.className = 'setting-group skin-pair';
themeRow.replaceWith(themeGroup);
themeGroup.append(themeRow, document.getElementById('setting-palette')!);
// The audio log Transcript toggle (#516) is a second button in the Sound item, as Palette is in the Theme item.
const soundRow = document.getElementById('setting-sound')!;
const soundGroup = document.createElement('div');
soundGroup.className = 'setting-group skin-pair';
soundRow.replaceWith(soundGroup);
soundGroup.append(soundRow, document.getElementById('setting-transcript')!);
fpsBox.hidden = !fpsOn;
// The four volume sliders (#438), the page Sound opens: 0 to 100 %, each saved on its own.
for (const bus of BUSES) {
  const row = menu.appendChild(document.createElement('label'));
  row.className = 'setting-volume';
  row.innerHTML = `<span>${VOLUME_NAMES[bus]}</span><input id="volume-${bus}" type="range" min="0" max="100" step="5">`;
  sliderAt(bus).value = String(sfx.volume(bus));
  sliderAt(bus).addEventListener('input', () => {
    sfx.setVolume(bus, Number(sliderAt(bus).value));
    writeVolume(store, bus, sfx.volume(bus));
  });
}
// The difficulty setting (#704) is a second button in the Export game item, so the menu keeps its height.
const exportRow = document.getElementById('setting-export-game')!;
const exportGroup = document.createElement('div');
exportGroup.className = 'setting-group';
exportRow.replaceWith(exportGroup);
exportGroup.append(exportRow, document.getElementById('setting-difficulty')!);
// The log archive (#513): its button, Logs, is a short word beside Import game, as FPS is beside Clear board, so the menu
// keeps its height. It opens a page of one button per entry read, then per audio log collected (#517), in place of the
// items; a press on one closes the menu and reopens the entry in the terminal reader, or replays the log.
const archiveButton = Object.assign(document.createElement('button'), {
  id: 'setting-log-archive',
  type: 'button',
  textContent: 'Logs',
  title: 'Log archive',
});
const importRow = document.getElementById('setting-import-game')!;
const importGroup = document.createElement('div');
importGroup.className = 'setting-group';
importRow.replaceWith(importGroup);
importGroup.append(importRow, archiveButton);
archiveButton.addEventListener('click', openArchive);
const archive = menu.appendChild(document.createElement('div'));
archive.className = 'setting-archive';
function openArchive(): void {
  menu.dataset.page = 'archive';
  const row = (title: string, open: () => void): HTMLButtonElement => {
    const button = Object.assign(document.createElement('button'), { type: 'button', textContent: title });
    button.addEventListener('click', () => {
      moveMenu('pick');
      open();
    });
    return button;
  };
  const rows = [
    ...archiveList(readLore(store), LORE).map((entry) => row(entry.title, () => openReader(entry.id))),
    ...archiveList(collectedLogs(store), AUDIO_LOGS).map((log) => row(log.title, () => playLog(log))),
  ];
  archive.replaceChildren(...(rows.length ? rows : ['Nothing read yet.']));
  rows[0]?.focus();
}
fpsButton.addEventListener('click', () => {
  fpsOn = !fpsOn;
  writeFps(store, fpsOn);
  fpsBox.hidden = !fpsOn;
  fpsStamps = [];
  fpsButton.setAttribute('aria-pressed', String(fpsOn));
});
motionQuery.addEventListener('change', () => {
  applyLook(); // a system change still counts until the player presses Reduced motion
  paintMenu();
});
applyView(); // camera and fog
let menuIsOpen = false;
const moveMenu = (event: MenuEvent): void => {
  menuIsOpen = menuOpen(menuIsOpen, event);
  menu.hidden = !menuIsOpen;
  delete menu.dataset.page; // the menu opens on its items again
  cog.setAttribute('aria-expanded', String(menuIsOpen));
};
cog.addEventListener('click', () => moveMenu('button'));
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !menuIsOpen) return;
  moveMenu('escape');
  cog.focus();
});
addEventListener('pointerdown', (e) => {
  if (menuIsOpen && !menu.contains(e.target as Node) && !cog.contains(e.target as Node)) moveMenu('outside');
});
cog.disabled = false; // listener ready (#146)
// The mode menu (#357): Play online, Boss fight with its boss list, and Daily challenge behind one button, opened and
// closed like the settings menu. Starting a mode closes it (startBoss, Play online).
const modeButton = document.getElementById('modes') as HTMLButtonElement;
const modeMenu = document.getElementById('mode-menu')!;
modeButton.innerHTML = icon('modes');
let modesOpen = false;
const moveModes = (event: MenuEvent): void => {
  modesOpen = menuOpen(modesOpen, event);
  modeMenu.hidden = !modesOpen;
  modeButton.setAttribute('aria-expanded', String(modesOpen));
};
modeButton.addEventListener('click', () => moveModes('button'));
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !modesOpen) return;
  moveModes('escape');
  modeButton.focus();
});
addEventListener('pointerdown', (e) => {
  if (modesOpen && !modeMenu.contains(e.target as Node) && !modeButton.contains(e.target as Node)) moveModes('outside');
});
modeButton.disabled = false; // listener ready (#146)

for (const type of ['pointerdown', 'pointerup', 'keydown']) addEventListener(type, () => sfx.unlock(), { capture: true });
document.addEventListener('visibilitychange', () => sfx.visible(!document.hidden)); // no sound in a hidden tab (#728)
// The Medal room (#812) reads like a lore entry; its text is built when it opens, from the saved medals.
const MEDAL_ROOM = 'medal-room';
const bossRoster = (): { id: string; name: string }[] => boss_ids().map((id) => ({ id, name: boss_name(id)! }));
// The deck console (#511): the console-screen prop shows its deck's first lore entry, paged for the UI scale and drawn
// once the web fonts are in, so no fallback font shows first. Drawn again on a page turn only, never per frame.
const consoleCanvas = Object.assign(document.createElement('canvas'), { width: TERMINAL.width, height: TERMINAL.height });
const consoleG = consoleCanvas.getContext('2d')!;
const consoleTexture = new THREE.CanvasTexture(consoleCanvas);
consoleTexture.colorSpace = THREE.SRGBColorSpace;
let consoleFonts = false;
let consoleEntry = '';
let consolePages: TerminalPage[] = [];
let consolePage = -1;
let consoleSince = 0;
// The console shows its deck's first entry (every deck has its entries, lore.test.ts), or one reopened from the archive.
const deckEntry = (): string => LORE.find((e) => e.deck === deck)!.id;
function layoutConsole(id = deckEntry()): void {
  if (!consoleFonts) return;
  const entry = id === MEDAL_ROOM ? { ...medalRoom(store, bossRoster()), id } : LORE.find((e) => e.id === id)!;
  consolePages = terminalPages(entry, uiScale, (text, font) => {
    consoleG.font = font;
    return consoleG.measureText(text).width;
  });
  consolePage = -1;
  consoleSince = performance.now();
  consoleEntry = entry.id;
  if (reading) showConsole(0);
}
// Draws a page on the screen and copies it into #reader, for screen readers and the flat HUD.
function showConsole(page: number): void {
  consolePage = page;
  const shown = consolePages[page]!;
  drawTerminal(consoleG, shown, uiScale);
  consoleTexture.needsUpdate = true;
  document.body.dataset.console = `${consoleEntry} ${page + 1}/${consolePages.length}`; // read by the e2e tests
  const lines = [shown.title.join(' '), shown.body.join(' '), `Page ${page + 1} of ${shown.pages}`];
  reader.replaceChildren(...lines.map((text) => Object.assign(document.createElement('p'), { textContent: text })));
}
function turnConsole(now: number): void {
  if (reading) return; // the player turns the pages
  const page = consolePages.length ? pageAt(now - consoleSince, consolePages.length) : consolePage;
  if (page !== consolePage) showConsole(page);
}
// The terminal reader (#512): a click on the console screen or the T key frames the camera on it; a click on the screen
// or the right arrow turns the page, the left arrow goes back; Esc, a click off the screen or a click past the last page
// leaves, to the view the player had. The page chrome hides meanwhile (ui.css), so nothing covers the text at any UI
// scale; the game goes on: a move played or received lands as always.
const reader = document.getElementById('reader')!;
reader.classList.toggle('flat', flatHud);
let consoleScreen!: THREE.Mesh; // set by drawProps
let recorder!: THREE.Mesh; // set by drawProps
function openReader(id?: string): void {
  if (id) layoutConsole(id); // an entry of the log archive (#513)
  if (!consolePages.length) return; // the fonts are not in yet
  reading = view;
  reader.hidden = false;
  document.body.dataset.reading = consoleEntry; // read by the e2e tests
  if (consoleEntry !== MEDAL_ROOM) markRead(store, consoleEntry);
  showConsole(0);
  applyView();
  paintLog();
}
function leaveReader(): void {
  view = reading!;
  reading = null;
  reader.hidden = true;
  delete document.body.dataset.reading;
  consoleSince = performance.now() - consolePage * TERMINAL.pageMs; // the screen turns on from the page left
  if (consoleEntry !== deckEntry()) layoutConsole(); // after an entry of the log archive, the deck's own again
  applyView();
  paintLog();
}
function turnReader(step: number): void {
  const page = Math.max(0, consolePage + step);
  if (page === consolePages.length) leaveReader();
  else showConsole(page);
}
addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

  if (e.key.toLowerCase() === 'c' && !reading) {
    toggleFreeCam();
    return;
  }
  if (e.key.toLowerCase() === 'x' && !reading) {
    cycleRenderMode();
    return;
  }
  if (freeCam.active) {
    if (e.key === 'Escape') {
      toggleFreeCam(false);
      return;
    }
    if (freeCam.onKeyDown(e.code)) {
      e.preventDefault();
      drawAsked = true;
      return;
    }
  }

  if (!reading) {
    if (e.key.toLowerCase() === 't') openReader();
  } else if (e.key === 'Escape') leaveReader();
  else if (e.key === 'ArrowRight') turnReader(1);
  else if (e.key === 'ArrowLeft') turnReader(-1);
});
addEventListener('keyup', (e) => {
  if (freeCam.active) {
    freeCam.onKeyUp(e.code);
  }
});
// The audio log player (#516, world.md section 4): while the player reads the deck console, Play log plays the audio log
// of the deck of the entry shown (an entry of the log archive may be another deck's) on the voice bus, music and
// ambience ducked under it. Skip log stops it at any time, on the console or off
// it; the game goes on meanwhile. Its transcript shows line by line unless the Transcript toggle is off.
const logButton = document.getElementById('log-button') as HTMLButtonElement;
const transcript = document.getElementById('transcript')!;
let playing: { log: AudioLog; since: number } | null = null;
function paintLog(): void {
  logButton.hidden = !reading && !playing;
  logButton.textContent = playing ? 'Skip log' : 'Play log';
  const line = (playing && transcriptOn && lineAt(playing.log, (performance.now() - playing.since) / 1000)) || '';
  if (transcript.textContent !== line) transcript.textContent = line; // aria-live: a line is read once
  transcript.hidden = !line;
}
function stopLog(): void {
  sfx.stopLog();
  playing = null;
  delete document.body.dataset.log;
  paintLog();
}
// Any log heard joins the log archive (#517).
function playLog(log: AudioLog): void {
  markCollected(store, log.id);
  playing = { log, since: performance.now() };
  document.body.dataset.logSound = sfx.playLog(log.voices) ? 'voice' : 'none'; // read by the tests
  document.body.dataset.log = log.id; // read by the e2e tests
  paintLog();
}
logButton.addEventListener('click', () => {
  if (playing) stopLog();
  else playLog(logOf(LORE.find((e) => e.id === consoleEntry)!.deck));
});
// Called every frame: the next transcript line, and the end of the log.
function tickLog(now: number): void {
  if (!playing) return;
  if (now - playing.since >= playing.log.seconds * 1000) stopLog();
  else paintLog();
}
void Promise.all(Object.values(terminalFonts(uiScale)).map((font) => document.fonts.load(font)))
  .catch(() => undefined)
  .then(() => {
    consoleFonts = true;
    layoutConsole();
  });
function applyDeck(next: Deck): void {
  deck = next;
  sceneRenderer.applyDeck(deck);
  document.body.dataset.deck = deck; // read by the e2e tests
  applyLook();
  layoutConsole();
  // The deck's texture set (#401, #440) once loaded, the steel when its file did not load; the frame keeps the steel.
  // Only on the textured look: a map added to the flat look would rebuild its pipeline. body[data-deck-set] is read by the e2e.
  void Promise.all([deckMap(next), deckNormalMap(next)]).then(([map, normal]) => {
    if (deck !== next || !steel.map) return; // another deck started meanwhile, or the flat look
    steel.map = map ?? deckAlbedo;
    if (steel.normalMap && normal) steel.normalMap = normal;
    document.body.dataset.deckSet = map ? next : 'steel';
  });
}


const detail = meshDetail(tier);
const discGeometry = new THREE.CylinderGeometry(0.46, 0.46, 0.1, detail.discSegments);
const marbleGeometry = new THREE.SphereGeometry(MARBLE_RADIUS, detail.marbleWidthSegments, detail.marbleHeightSegments);
const ringGeometry = new THREE.TorusGeometry(0.44, 0.04, 8, 32);
const steel = new THREE.MeshStandardMaterial(
  deckAlbedo && deckRoughness
    ? {
        map: firstDeckMap ?? deckAlbedo,
        roughnessMap: deckRoughness,
        ...(firstDeckNormal ? { normalMap: firstDeckNormal } : {}),
      }
    : { color: COLORS.steel, roughness: 0.8 },
);
applyDeck(deck);
// Used by the browser checks to light the board in play as any deck, the Bridge included, which has no mode yet.
(window as unknown as Record<string, unknown>).__deck = applyDeck;
// Key 1 is the enemy shell (matte, ridged), key 2 the player's smoked glass (marbles.ts).
const { ridges, ...shell } = SHELL;
const scarab = new THREE.MeshStandardMaterial({
  ...shell,
  emissive: HEAT.color, // the heat pulse (#509), dark until the loop sets its intensity
  emissiveIntensity: 0,
  envMap: reflections,
  envMapIntensity: LIGHT.environment.intensity,
  ...(shellNormal ? { normalMap: shellNormal, normalScale: new THREE.Vector2(ridges, ridges) } : {}),
});
// The other dark shells (#377): the skin's pattern drawn once on a small canvas that wraps the sphere; a glowing skin
// lights its pattern through the same canvas, the base is dark enough to stay dark.
const shellLooks = new Map<string, THREE.MeshStandardMaterial>([['scarab', scarab]]);
// A skin's pattern on a canvas that wraps the sphere (the shells and the pale glass, #377).
function skinTexture(s: Look): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  [canvas.width, canvas.height] = [256, 128];
  drawSkin(canvas.getContext('2d')!, canvas.width, canvas.height, s);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  return map;
}
function shellMaterial(id: string): THREE.MeshStandardMaterial {
  const s = skinById(id);
  let look = shellLooks.get(s.id);
  if (!look) {
    const map = skinTexture(s);
    look = new THREE.MeshStandardMaterial({
      map,
      roughness: s.roughness,
      metalness: s.metalness,
      envMap: reflections,
      envMapIntensity: LIGHT.environment.intensity,
      ...(s.glow ? { emissive: 0xffffff, emissiveMap: map, emissiveIntensity: s.glow } : {}),
    });
    shellLooks.set(s.id, look);
  }
  return look;
}
// The pale glass skins (#377): GLASS in the skin's colour, or its pattern on the same kind of canvas. Smoked glass has no
// pattern and is GLASS as it was. The inner light takes the skin's colour when it has one (Lantern core).
const glassLooks = new Map<string, THREE.MeshPhysicalMaterial>();
function glassMaterial(id: string): THREE.MeshPhysicalMaterial {
  const s = glassSkinById(id);
  let look = glassLooks.get(s.id);
  if (!look) {
    const map = s.pattern === null ? null : skinTexture(s);
    look = new THREE.MeshPhysicalMaterial({
      ...GLASS,
      color: map ? 0xffffff : s.color,
      roughness: s.roughness,
      ...(map ? { map } : {}),
      envMap: reflections,
      envMapIntensity: LIGHT.environment.glass,
    });
    glassLooks.set(s.id, look);
  }
  return look;
}
const marbleMaterials: Record<number, THREE.MeshStandardMaterial> = {
  1: shellMaterial(skin),
  2: glassMaterial(glass),
};
const coreGeometry = new THREE.SphereGeometry(CORE.radius, 16, 8);
const coreMaterial = new THREE.MeshBasicMaterial({ color: CORE.color, transparent: true }); // drawn after the glass
coreMaterial.color.set(glassSkinById(glass).core ?? CORE.color);
const convertedCore = new THREE.MeshBasicMaterial({ color: coreMaterial.color, transparent: true, opacity: CONVERTED.core });
function setGlassLook(id: string): void {
  marbleMaterials[2] = glassMaterial(id);
  const pal = paletteById(palette);
  coreMaterial.color.set(glassSkinById(id).core ?? pal.core);
  convertedCore.color.copy(coreMaterial.color);
}
// Who wears the glass depends on the mode (glass.ts), so a side maps to a look only at draw time. The glass holds
// its cyan core as a child: the selection lift, the slide and the ejection carry it.
const glassOf = (): number => glassSide({ online: online !== null, bot: worker !== null, fight: fight !== null });
// The boss accents (#507, marbles.ts): one mesh per boss, that each shell of its side holds as a child in boss mode.
function accentGeometry(a: Accent): THREE.BufferGeometry {
  if (a.shape === 'torus') return new THREE.TorusGeometry(...a.args).rotateX(a.tilt);
  const geometry = new THREE.CylinderGeometry(...a.args);
  const rim = geometry.attributes.position!; // a cylinder's first row of vertices is its top rim
  for (let v = 1; v < a.args[3]; v += 2) rim.setY(v, rim.getY(v) - a.points);
  return geometry.translate(0, a.y, 0);
}
const accents = new Map(
  Object.entries(ACCENTS).map(([boss, a]) => {
    const { name, color, roughness, metalness } = a;
    const envMapIntensity = LIGHT.environment.intensity;
    const side = THREE.DoubleSide; // the inside of the open crown shows
    const look = new THREE.MeshStandardMaterial({ color, roughness, metalness, envMap: reflections, envMapIntensity, side });
    return [boss, Object.assign(new THREE.Mesh(accentGeometry(a), look), { name, castShadow: true })];
  }),
);
function marbleMesh(side: number, looks = marbleMaterials, core = coreMaterial): THREE.Mesh {
  const glass = side === glassOf();
  const mesh = new THREE.Mesh(marbleGeometry, looks[glass ? 2 : 1]);
  mesh.castShadow = looks === marbleMaterials;
  if (glass) mesh.add(Object.assign(new THREE.Mesh(coreGeometry, core), { renderOrder: 1 }));
  const accent = !glass && looks === marbleMaterials ? accents.get(fight?.id ?? '') : undefined; // the boss side (#507)
  if (accent) mesh.add(accent.clone());
  return mesh;
}
/** Turns a marble (#346): the shell takes the turn, what it holds stays upright (its boss accent, #507). */
function turnMarble(marble: THREE.Object3D, turn: Quat): void {
  marble.quaternion.fromArray(turn);
  for (const child of marble.children) child.quaternion.copy(marble.quaternion).invert();
}
// A legal target (#390): a ring and an arrow glyph flat on the cell, pointing the way the group goes (world.md 6, rule
// 5). Near-black like the shell, so it reads 3:1 on the lit deck in every mode; the shape carries it, not a colour.
const targetRingGeometry = new THREE.RingGeometry(0.34, 0.42, 32);
const arrowShape = new THREE.Shape(
  [[0.26, 0], [0.04, 0.18], [0.04, 0.07], [-0.2, 0.07], [-0.2, -0.07], [0.04, -0.07], [0.04, -0.18]].map(
    ([x, y]) => new THREE.Vector2(x, y),
  ),
);
const arrowGeometry = new THREE.ShapeGeometry(arrowShape);
// The arrow is dark on the lit cell, inside its luminous ring: a cyan one could not reach 3:1 on it (#390, #787).
const targetMaterial = new THREE.MeshBasicMaterial({ color: COLORS.base });
const ringMaterial = new THREE.MeshStandardMaterial({
  color: 0x38e8ff,
  emissive: 0x38e8ff,
  emissiveIntensity: 1.25,
  roughness: 0.2,
  metalness: 0.1,
});
// The Hull tell: a cracked cell wears the crack decal on its steel (crack-decal.png, a steady shape), near-black fissures
// that read 3:1 on the light deck, with one pale tick per ply left. Without the texture, the ticks and the HUD line
// carry the tell.
const crackGeometry = new THREE.CircleGeometry(0.46, 32).rotateX(-Math.PI / 2);
if (crackDecal) crackDecal.anisotropy = renderer.getMaxAnisotropy(); // the cell is seen at a slant: no blur along it
const crackMaterial = new THREE.MeshBasicMaterial({ color: COLORS.base, alphaMap: crackDecal, transparent: true, depthWrite: false });
let crackDecals: Axial[] = []; // the cells drawn with the decal, for the e2e tests
const tickGeometry = new THREE.BoxGeometry(0.05, 0.02, 0.1);
const tickMaterial = new THREE.MeshBasicMaterial({ color: BONE });
// The Chaplain tell: a steady pale ring and a glyph on each marble a hovered move would expose to a
// flip, never a halo or colour alone.
const paleMaterial = new THREE.MeshBasicMaterial({ color: BONE });
const outlineGeometry = new THREE.TorusGeometry(0.42, 0.025, 8, 32);
const barGeometry = new THREE.BoxGeometry(0.84, 0.02, 0.05);
const glyphGeometry = new THREE.OctahedronGeometry(0.09);
// The Chaplain's martyr tell (#748): a steady ember ring and a tall glyph on the marble that explodes next boss turn.
const emberMaterial = new THREE.MeshBasicMaterial({ color: 0xff7a3d });
const martyrGlyphGeometry = new THREE.OctahedronGeometry(0.11).scale(1, 2, 1);
// Its explosion: a flash disc and a ring of shards, moved by the animation loop.
const blastFlashGeometry = new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2);
const blastFlashMaterial = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, depthWrite: false, side: THREE.DoubleSide });
const blastShardGeometry = new THREE.TetrahedronGeometry(0.15);
const blastShardMaterial = new THREE.MeshBasicMaterial({ color: 0xff7a3d, transparent: true, depthWrite: false });
let blast: { group: THREE.Group; flash: THREE.Mesh; shards: THREE.Mesh[]; start: number; reduced: boolean; then?: Speech } | null = null;
// A converted marble (#508, world.md section 5) is half and half, 3:1 on the shell (#326): the ridged shell up to its
// middle, a bowl closed by a flat floor so its inside never shows, and the player's glass above it with the core dimmed
// (marbles.ts), resting on the floor. The halves stay upright whatever the marble's turn, under its boss accent; the
// marble's own sphere is not drawn.
const half = detail.marbleHeightSegments / 2;
const shellHalfGeometry = new THREE.LatheGeometry(
  [
    ...Array.from({ length: half + 1 }, (_, k) => {
      const a = ((k / half - 1) * Math.PI) / 2; // from the bottom up to the middle
      return new THREE.Vector2(MARBLE_RADIUS * Math.cos(a), MARBLE_RADIUS * Math.sin(a));
    }),
    new THREE.Vector2(0, 0), // the floor, facing up
  ],
  detail.marbleWidthSegments,
);
const glassHalfGeometry = new THREE.SphereGeometry(MARBLE_RADIUS, detail.marbleWidthSegments, half, 0, Math.PI * 2, 0, Math.PI / 2);
const convertedCoreGeometry = coreGeometry.clone().translate(0, CORE.radius, 0);
const unseen = new THREE.MeshBasicMaterial({ visible: false });
// Beyond the colour (#790): the Chaplain's pale glyph over the wax and pale cracks on the shell half (the crack decal of the
// Hull), both 3:1 on every shell and glass skin, whatever the deck's light.
const convertedGlyph = new THREE.MeshBasicMaterial({ color: BONE });
const convertedGlyphGeometry = glyphGeometry.clone().translate(0, 0.6, 0); // over the wax, and so turned upright with the marble's parts
const convertedCracks = new THREE.MeshBasicMaterial({ color: BONE, alphaMap: crackDecal, transparent: true, depthWrite: false });
function convert(marble: THREE.Mesh): void {
  marble.material = unseen;
  const shell = Object.assign(new THREE.Mesh(shellHalfGeometry, marbleMaterials[1]), { name: 'shell', castShadow: true });
  const glass = Object.assign(new THREE.Mesh(glassHalfGeometry, marbleMaterials[2]), { name: 'glass', castShadow: true });
  const cracks = Object.assign(new THREE.Mesh(shellHalfGeometry, convertedCracks), { name: 'cracks' });
  cracks.scale.setScalar(1.01); // just outside the shell
  const glyph = Object.assign(new THREE.Mesh(convertedGlyphGeometry, convertedGlyph), { name: 'glyph' });
  marble.add(shell, glass, Object.assign(new THREE.Mesh(convertedCoreGeometry, convertedCore), { name: 'core', renderOrder: 1 }), cracks, glyph);
}
let exposed = 0; // marbles the hovered move would expose, for the HUD
// The Choir: each army wears its own glyph in the pale tell colour on top of its marbles, Alto a spike,
// Tenor a ring, Bass a block, never colour alone. The army that moves next gets the pale ring.
const armyGlyphs = [
  new THREE.ConeGeometry(0.08, 0.18, 4),
  new THREE.TorusGeometry(0.07, 0.025, 8, 16),
  new THREE.BoxGeometry(0.13, 0.13, 0.13),
];
// The Overseer (#635, game-design.md section 7.11): a dark hexagonal pedestal with a pale eye on the centre cell; a core
// is a pale marble with a dark eye on top, a shape and not a colour; a vent wears a warm disc crossed by dark slots on
// its cell. A burning marble sinks into its vent where it stands (overseer.ts).
const pedestalGeometry = new THREE.CylinderGeometry(0.36, 0.44, 0.72, 6).translate(0, 0.36, 0);
const pedestalMaterial = new THREE.MeshStandardMaterial({ color: COLORS.base, roughness: 0.4, metalness: 0.6 });
const eyeGeometry = new THREE.SphereGeometry(0.16, 24, 16);
const eyeMaterial = new THREE.MeshBasicMaterial({ color: BONE });
const coreShell = new THREE.MeshStandardMaterial({ color: BONE, roughness: 0.3, emissive: 0x5a4a30 });
const pupilGeometry = new THREE.CircleGeometry(0.15, 24).rotateX(-Math.PI / 2);
const pupilMaterial = new THREE.MeshBasicMaterial({ color: COLORS.base });
const ventGeometry = new THREE.CircleGeometry(0.4, 32).rotateX(-Math.PI / 2);
const ventMaterial = new THREE.MeshBasicMaterial({ color: 0xc8501e });
const slotGeometry = new THREE.PlaneGeometry(0.56, 0.07).rotateX(-Math.PI / 2);
// A toxic green haze rises from the vents once they burn the player's marbles too (P2, #741): 3 soft puffs a vent,
// looping, one faint puff held still under reduced motion (overseer.ts hazeAt).
const hazeMap = (() => {
  const canvas = Object.assign(document.createElement('canvas'), { width: 64, height: 64 });
  const g = canvas.getContext('2d')!;
  const glow = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  glow.addColorStop(0, 'rgba(120, 220, 60, 1)');
  glow.addColorStop(1, 'rgba(120, 220, 60, 0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, 64, 64);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
})();
let hazes: { sprite: THREE.Sprite; k: number }[] = []; // moved by the animation loop
// The Overseer's speech bubble (#741): a DOM element over its marble, typed at reading speed (speech.ts). The taunt of
// each 20 % of the neurotoxin, and an angry shaking red line when a core burns on a vent.
const bubbleBox = document.getElementById('bubble')!;
const bubbleText = document.getElementById('bubble-text')!;
const bubbleLine = document.getElementById('bubble-line')!; // the whole line for screen readers
let speech: { spec: Speech; start: number; chars: number } | null = null;
let tauntSaid: { game: Engine | Encounter | null; index: number } = { game: null, index: -1 };
let phaseSeen: { game: Engine | Encounter | null; phase: number; since: number } = { game: null, phase: 0, since: -1 }; // since: the ply the vents began to burn the player's marbles
/** The Overseer starts saying `spec`; `animateSpeech` types it. */
function say(spec: Speech): void {
  speech = { spec, start: performance.now(), chars: 0 };
  bubbleLine.textContent = spec.text;
  bubbleBox.hidden = false;
  bubbleBox.classList.toggle('angry', spec.angry);
  bubbleBox.classList.toggle('still', reducedMotion()); // no shake
}
/** Types the bubble up to now, with the flicker and a blip per new character, and puts it over the Overseer. */
function animateSpeech(now: number): void {
  if (!speech) return;
  const at = speechAt(speech.spec, now - speech.start, reducedMotion());
  if (at.done) {
    speech = null;
    bubbleBox.hidden = true;
    return;
  }
  if (at.text.length > speech.chars && sfx.tell('blip')) tellCues.push('blip');
  speech.chars = at.text.length;
  bubbleText.textContent = at.text;
  bubbleBox.classList.toggle('glitch', at.glitch);
  bubbleBox.style.opacity = String(at.opacity);
  camera.updateMatrixWorld();
  const spot = new THREE.Vector3(BUBBLE_SPOT.x, BUBBLE_SPOT.y, BUBBLE_SPOT.z).project(camera);
  bubbleBox.style.left = `${(spot.x * 0.5 + 0.5) * innerWidth}px`;
  bubbleBox.style.top = `${(0.5 - spot.y * 0.5) * innerHeight}px`;
}
/** Blinks the announced marble, or shows its steady outline with reduced motion. */
function animateAnnounce(now: number): void {
  if (!blinking) return;
  const [reduced, blink] = [reducedMotion(), blinkAt(now, reducedMotion())];
  for (const material of blinking.materials) material.opacity = (material.userData.opacity as number) * blink;
  blinking.ring.visible = reduced;
  document.body.dataset.announceBlink = blink.toFixed(2); // read by the e2e tests
}
/** Moves the haze puffs of the vents. */
function animateHaze(now: number): void {
  for (const { sprite, k } of hazes) {
    const at = hazeAt(now, k, reducedMotion());
    sprite.position.y = at.y;
    sprite.scale.setScalar(1.3 * at.scale);
    sprite.material.opacity = at.opacity;
  }
  if (hazes[0]) document.body.dataset.hazeY = hazes[0].sprite.position.y.toFixed(3); // read by the e2e tests
}
let overseerBlown: Engine | Encounter | null = null; // the game whose Overseer blew up (#789): its pedestal is not drawn again
let overseerPedestal: THREE.Mesh | null = null;
let overseerDrawn: { overseer: Axial | null; cores: Axial[]; vents: Axial[] } = { overseer: null, cores: [], vents: [] }; // read by the e2e tests
/** A core of The Overseer: a pale marble, its dark eye on top. */
function coreMesh(): THREE.Mesh {
  const core = Object.assign(new THREE.Mesh(marbleGeometry, coreShell), { castShadow: true });
  const pupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
  pupil.position.y = 0.37;
  core.add(pupil);
  return core;
}
/** An incinerator vent on the cell at `p`: the warm disc and its 3 dark slots. */
function ventAt(p: { x: number; z: number }): THREE.Group {
  const vent = new THREE.Group();
  vent.add(new THREE.Mesh(ventGeometry, ventMaterial));
  for (const dz of [-0.14, 0, 0.14]) {
    const slot = new THREE.Mesh(slotGeometry, pupilMaterial);
    slot.position.set(0, 0.002, dz);
    vent.add(slot);
  }
  vent.position.set(p.x, 0.004, p.z);
  return vent;
}

// The Alien tell (#588, game-design.md section 7.7): a pale egg on its cell and, above it, a counter of the player turns
// left before it hatches: a sprite, so it always faces the camera, drawn over the marbles (alien.ts, 3:1 and more). On 1
// a glow under the egg pulses once a second, held still under reduced motion (the animation loop sets it).
const eggGeometry = new THREE.SphereGeometry(0.17, 24, 16).scale(1, 1.35, 1).translate(0, 0.23, 0);
const eggMaterial = new THREE.MeshStandardMaterial({ color: BONE, roughness: 0.55 });
const eggGlowGeometry = new THREE.CircleGeometry(0.4, 32).rotateX(-Math.PI / 2);
const eggGlowMaterial = new THREE.MeshBasicMaterial({ color: BONE, transparent: true, depthWrite: false });
const counterMaterials = Array.from({ length: Math.max(COUNTER_MAX, TRAIN_LEAD) }, (_, i) => {
  const canvas = Object.assign(document.createElement('canvas'), { width: 128, height: 128 });
  drawCounter(canvas.getContext('2d')!, i + 1, 128);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.SpriteMaterial({ map, depthTest: false });
});
let eggsDrawn: { cell: Axial; left: number; glow: boolean }[] = []; // read by the e2e tests
// The Rail Yard tell (#626, game-design.md section 7.8): rails under each announced line, out past both edges onto the
// deck, an amber chevron on both edges and on every cell of the line, pointing the way the train runs (railyard.ts, 3:1
// and more), and the counter of the player turns left above the entry edge, the eggs' sprite. Its pass: the low-poly
// freight train runs the line and knocks each marble on it off with the ejection fall; under reduced motion it jumps.
const chevronGeometry = new THREE.ShapeGeometry(
  new THREE.Shape(CHEVRON_SHAPE.map(([x, z]) => new THREE.Vector2(x, -z))),
).rotateX(-Math.PI / 2);
const chevronMaterial = new THREE.MeshBasicMaterial({ color: CHEVRON_COLOR });
const railGeometry = new THREE.BoxGeometry(1, 0.03, 0.04);
const sleeperGeometry = new THREE.BoxGeometry(0.08, 0.02, 0.6);
const railMaterial = new THREE.MeshStandardMaterial({ color: 0x8a9096, metalness: 0.6, roughness: 0.4 });
const sleeperMaterial = new THREE.MeshStandardMaterial({ color: 0x3a2c22, roughness: 0.9 });
const trainGeometries = TRAIN_PARTS.map(({ type, size }) =>
  type === 'box'
    ? new THREE.BoxGeometry(size[0], size[1], size[2])
    : type === 'wheel'
      ? new THREE.CylinderGeometry(size[0], size[0], size[1], 8).rotateX(Math.PI / 2)
      : new THREE.DodecahedronGeometry(size[0]).scale(1.4, 0.45, 0.8),
);
const trainMaterials = new Map(TRAIN_PARTS.map((p) => [p.color, new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.75 })]));
/** A new freight train, its front at its origin, running along +x. */
function trainModel(): THREE.Group {
  const train = Object.assign(new THREE.Group(), { name: 'train' });
  TRAIN_PARTS.forEach((part, i) => {
    const mesh = Object.assign(new THREE.Mesh(trainGeometries[i], trainMaterials.get(part.color)), { name: part.id, castShadow: true });
    mesh.position.set(...part.position);
    train.add(mesh);
  });
  return train;
}
let trainsShown: Train[] = []; // the trains of the last refresh, to see which passed after a move
interface Passing {
  train: Train;
  model: THREE.Group;
  rails: THREE.Group; // kept under the train until it is gone
  start: number;
  skipped: boolean;
}
const passing: Passing[] = [];
// The Assembly Line (#744, game-design.md section 7.12): each belt is a near-black strip with a steel roller at each end,
// ribs that scroll the way it runs, a steel plate on every strike slot (red under a press hanging over it when the strike
// is announced), an amber chevron on every cell of a running belt, and the centre belt's counter of the turns left
// before it reverses (assembly.ts). A press slams on the cell it strikes; under reduced motion the ribs hold still and
// nothing slams.
const beltGeometry = new THREE.BoxGeometry(1, 0.04, 0.6);
const beltMaterial = new THREE.MeshStandardMaterial({ color: 0x1d2024, roughness: 0.95 });
const ribGeometry = new THREE.BoxGeometry(0.05, 0.012, 0.56);
const ribMaterial = new THREE.MeshStandardMaterial({ color: 0x3c4249, roughness: 0.8 });
const rollerGeometry = new THREE.CylinderGeometry(0.17, 0.17, 0.64, 12).rotateX(Math.PI / 2);
const plateGeometry = new THREE.BoxGeometry(0.62, 0.02, 0.5);
const plateMaterial = new THREE.MeshStandardMaterial({ color: 0x6b7178, metalness: 0.5, roughness: 0.5 });
const strikeMaterial = new THREE.MeshStandardMaterial({ color: STRIKE_COLOR, emissive: STRIKE_COLOR, emissiveIntensity: 0.8 });
const pressGeometry = new THREE.BoxGeometry(0.55, 0.28, 0.46);
const pressMaterial = new THREE.MeshStandardMaterial({ color: 0x4a4f55, metalness: 0.6, roughness: 0.4 });
let beltsShown: Belts | null = null; // the belts of the last refresh, read by the e2e tests
let beltRibs: { belt: Belt; ribs: THREE.Mesh[] }[] = []; // scrolled by the animation loop
const slams: { mesh: THREE.Mesh; start: number; skipped: boolean }[] = [];
// The Magnetizer tell (#645, game-design.md section 7.9): a pale + or − on a near-black disc over each polarized
// marble, a sprite that faces the camera and slides with it (magnetizer.ts, 3:1 and more). A marble that just got its
// polarity wears a pale ring until the next ply. During the repulsions of a ply the board drawn is the engine's board
// before the one playing (`shown`), then the engine's own board.
// The marble announced for the next assignment wears an indicator floating higher: the coming sign on a diamond (#671).
// A pair that repels loses its glyphs: they fade out as the pair slides apart.
const signMaterials = (draw: typeof drawGlyph): Map<number, THREE.SpriteMaterial> =>
  new Map(
    [1, -1].map((sign) => {
      const canvas = Object.assign(document.createElement('canvas'), { width: 128, height: 128 });
      draw(canvas.getContext('2d')!, sign, 128);
      const map = new THREE.CanvasTexture(canvas);
      map.colorSpace = THREE.SRGBColorSpace;
      return [sign, new THREE.SpriteMaterial({ map, depthTest: false })];
    }),
  );
const glyphMaterials = signMaterials(drawGlyph);
const announceMaterials = signMaterials(drawAnnounce);
let announceDrawn: { cell: Axial; sign: number } | null = null; // read by the e2e tests
const fading: { sprite: THREE.Sprite; start: number }[] = [];
let shown: { game: Engine | Encounter; board: number[]; poles: number[] } | null = null;
const showing = (): { board: number[]; poles: number[] } | null => (shown?.game === engine ? shown : null);
// The announced marble blinks in opacity (#741, magnetizer.ts blinkAt); with reduced motion it wears a steady outline.
const announceRingMaterial = new THREE.MeshBasicMaterial({ color: BONE });
let blinking: { materials: THREE.Material[]; ring: THREE.Mesh } | null = null; // moved by the animation loop
let polesDrawn: { cell: Axial; sign: number; fresh: boolean }[] = []; // read by the e2e tests
// The Pulsar (#675, game-design.md section 7.10): six low-poly beacons off the corners of the board, a steel base, a
// pale core that spins and two beam cones along the way it pushes. The one that charges glows steady, its counter (2,
// then 1) beside it and an amber chevron before each of its 9 lines, the Rail Yard's. On a pulse a pale ring grows from
// it across the board while the pushed marbles slide a cell and the ones past the rim fall; reduced motion: the ring
// shows whole and fades, the marbles jump. During the move's slide the board drawn is the one before the pulse.
const pulsarGeometries = PULSAR_PARTS.map(({ type, size, flip }) =>
  type === 'base'
    ? new THREE.CylinderGeometry(size[0], size[0]! * 1.2, size[1], 6)
    : type === 'core'
      ? new THREE.IcosahedronGeometry(size[0])
      : new THREE.ConeGeometry(size[0], size[1], 6).rotateZ(flip ? Math.PI / 2 : -Math.PI / 2),
);
const pulsarMaterials = PULSAR_PARTS.map(
  ({ type, color }) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: type === 'base' ? 0.6 : 0, emissive: type === 'base' ? 0 : color, emissiveIntensity: 0.15 }),
);
const chargeMaterial = new THREE.MeshStandardMaterial({ color: PULSAR_PARTS[1]!.color, emissive: PULSAR_PARTS[1]!.color, emissiveIntensity: 1.6 });
const shockGeometry = new THREE.RingGeometry(0.96, 1, 96).rotateX(-Math.PI / 2);
const shockMaterial = new THREE.MeshBasicMaterial({ color: SHOCK_COLOR, transparent: true, depthWrite: false, side: THREE.DoubleSide });
let pulsarShown: Pulsar | null = null; // the next pulse of the last refresh
// The pulsar that fires next turn loops small faint rings while the player thinks (#741, pulsar.ts rippleAt).
const rippleGeometry = new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2);
const rippleMaterials = Array.from({ length: RIPPLES }, () => new THREE.MeshBasicMaterial({ color: SHOCK_COLOR, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
let ripples: THREE.Mesh[] = []; // moved by the animation loop
// The Ballast Mind's last borrowed effect (#838): a steady ring in the hazard colour (the orange of its HUD line) on each cell it touched, until the next ply.
const firedGeometry = new THREE.RingGeometry(0.4, 0.5, 40).rotateX(-Math.PI / 2);
const firedMaterial = new THREE.MeshBasicMaterial({ color: 0xe8812a, transparent: true, depthWrite: false }) // transparent: drawn after the discs;
let firedShown: Fired | null = null; // read by the e2e tests
let pulsarCores: THREE.Mesh[] = []; // spun by the animation loop
let shock: { mesh: THREE.Mesh; id: number; start: number; reduced: boolean; skipped: boolean } | null = null;
// The Unstable Core (#751, game-design.md section 7.13): a glowing hexagon on each of the 7 energy cells while the core
// stands (it pulses, flickers the turn before it collapses), 1 to 3 diamond pips over every charged marble (red at 3),
// the announced wedge glowing, a ring bursting where a marble overloads or falls with the core, and the shockwave: the
// wedge's slice of light sweeping outward from the centre. Reduced motion: steady glows, the ring and the slice show
// whole and fade.
const energyGeometry = new THREE.RingGeometry(0.3, 0.42, 6).rotateX(-Math.PI / 2);
const energyMaterial = new THREE.MeshBasicMaterial({ color: CORE_COLOR, transparent: true, depthWrite: false, side: THREE.DoubleSide });
const pipGeometry = new THREE.OctahedronGeometry(0.09);
const pipMaterial = new THREE.MeshStandardMaterial({ color: CORE_COLOR, emissive: CORE_COLOR, emissiveIntensity: 1.2 });
const warnMaterial = new THREE.MeshStandardMaterial({ color: WARN_COLOR, emissive: WARN_COLOR, emissiveIntensity: 2 });
const wedgeGlowMaterial = new THREE.MeshBasicMaterial({ color: CORE_COLOR, transparent: true, depthWrite: false, side: THREE.DoubleSide });
const sweepMaterial = new THREE.MeshBasicMaterial({ color: CORE_COLOR, transparent: true, depthWrite: false, side: THREE.DoubleSide });
const wedgeSlices = new Map<number, THREE.ShapeGeometry>();
/** The slice of the board a wedge covers, flat on the board plane, apex at the centre. */
function wedgeSlice(wedge: number): THREE.ShapeGeometry {
  if (!wedgeSlices.has(wedge)) {
    const [a, b, c] = wedgeCorners(wedge);
    const shape = new THREE.Shape([new THREE.Vector2(a.x, -a.z), new THREE.Vector2(b.x, -b.z), new THREE.Vector2(c.x, -c.z)]);
    wedgeSlices.set(wedge, new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2));
  }
  return wedgeSlices.get(wedge)!;
}
type Fx = { mesh: THREE.Mesh; start: number; reduced: boolean; skipped: boolean };
let unstableShown: (Core & { pips: Charge[] }) | null = null; // the next events and the charges of the last refresh
let bursts: Fx[] = [];
let sweep: Fx | null = null;

// The cell edge (#339): a thin bright steel bevel round each disc's top, so the edge reads 3:1 against the surface.
// Each disc is turned by its own angle (#347), so the deck texture repeated on every cell does not read as a pattern.
const edgeGeometry = new THREE.TorusGeometry(0.44, 0.03, 8, 32).rotateX(Math.PI / 2);
const edgeMaterial = new THREE.MeshStandardMaterial({ color: 0xc4cacf, roughness: 0.5, metalness: 0.3, emissive: 0x25292d });
const discs: THREE.Mesh[] = BOARD_CELLS.map(([q, r], i) => {
  const disc = new THREE.Mesh(discGeometry, steel);
  disc.receiveShadow = true;
  disc.rotation.y = cellTurn(i);
  const bevel = new THREE.Mesh(edgeGeometry, edgeMaterial);
  bevel.position.y = 0.05; // the disc's top face, so the bevel is not buried in the disc
  disc.add(bevel);
  const p = axialTo3D(q, r);
  disc.position.set(p.x, -0.05, p.z);
  disc.updateMatrixWorld(); // picking can run before the first render computes it (#237)
  scene.add(disc);
  return disc;
});
// The battle royale arena (#502): its own 217 discs at half the spacing, in the room of the radius 4 board, shown in its
// place while a battle royale is on. Its marbles wear their seat's shell tint (marbles.ts).
const arena = new THREE.Group();
arena.scale.setScalar(ARENA_SCALE);
arena.visible = false;
const arenaDiscs = ARENA.map(([q, r], i) => {
  const disc = new THREE.Mesh(discGeometry, steel);
  disc.receiveShadow = true;
  disc.rotation.y = cellTurn(i);
  const bevel = new THREE.Mesh(edgeGeometry, edgeMaterial);
  bevel.position.y = 0.05;
  disc.add(bevel);
  const p = axialTo3D(q, r);
  disc.position.set(p.x, -0.05, p.z);
  arena.add(disc);
  return disc;
});
arena.add(arenaMarbles);
arena.updateMatrixWorld(true); // picking can run before the first render
scene.add(arena);
const seatLooks = SEATS.map((color) => new THREE.MeshStandardMaterial({ color, roughness: SHELL.roughness, metalness: SHELL.metalness }));
// Each seat's glyph (#558), flat in the ink on its marbles, never the tint alone: it touches the shell where the shell
// faces the default view, turned to face it, so it stays inside the marble's outline.
const glyphTilt = resetView().polar;
const glyphLift = new THREE.Vector3(0, Math.cos(glyphTilt), Math.sin(glyphTilt)).multiplyScalar(MARBLE_RADIUS + 0.005);
const seatGlyphs = SEAT_GLYPHS.map(({ points }) =>
  new THREE.ShapeGeometry(new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x * 0.2, y * 0.2)))).rotateX(glyphTilt - Math.PI / 2),
);
const seatInk = new THREE.MeshBasicMaterial({ color: SEAT_INK });
// The breach (#503): a cracked arena cell glows in the hazard colour under the Hull's crack decal and ticks.
const breachGlow = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false });

// Spaceship interior architecture (bulkhead arches, rear wall, airlock, pedestal, conduits) (#478)
let wallTexture: THREE.Texture | null = null;
let hazardTexture: THREE.Texture | null = null;
if (deckAlbedo && tier === 'high' && typeof document !== 'undefined') {
  try {
    const wallCanvas = createCanvasTexture(512, 512, drawWallPanel);
    wallTexture = new THREE.Texture(wallCanvas);
    wallTexture.needsUpdate = true;
    wallTexture.wrapS = THREE.RepeatWrapping;
    wallTexture.wrapT = THREE.RepeatWrapping;
    wallTexture.repeat.set(4, 2);

    const hazardCanvas = createCanvasTexture(256, 64, drawHazardStripes);
    hazardTexture = new THREE.Texture(hazardCanvas);
    hazardTexture.needsUpdate = true;
    hazardTexture.wrapS = THREE.RepeatWrapping;
    hazardTexture.wrapT = THREE.ClampToEdgeWrapping;
    hazardTexture.repeat.set(4, 1);
  } catch {
    // Canvas context not available (e.g. in basic headless environments)
  }
}

// ?lights: a power slider per light and neon tube (lightpanel.ts), rebuilt when the props replace their lights.
const lightsPanel = new URLSearchParams(location.search).has('lights') ? document.body.appendChild(document.createElement('div')) : null;
const refreshLights = (): void => void (lightsPanel && lightPanel(sceneRenderer.scene, lightsPanel, (at) => toggleFreeCam(true, at)));
drawProps = (): void => {
  propsGroup.clear();
  const sLights = spaceshipLights(deck);
  for (const def of spaceshipArchitecture(tier)) {
    let mat: THREE.Material;
    const screen = def.id === 'console-screen';
    if (screen) {
      mat = new THREE.MeshBasicMaterial({ map: consoleTexture, fog: false }); // a screen gives its own light
    } else if (def.id === 'log-recorder') {
      mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    } else if (def.id.includes('neon')) {
      const neonColor =
        def.id === 'pedestal-neon-3' ||
        def.id === 'pedestal-neon-4' ||
        def.id === 'pedestal-neon-5' ||
        def.id.endsWith('-sw') ||
        def.id.endsWith('-ne') ||
        def.id.includes('airlock')
          ? sLights.emergency.color
          : sLights.rim.color;
      mat = new THREE.MeshStandardMaterial({
        color: neonColor,
        emissive: neonColor,
        emissiveIntensity: 5.5,
        roughness: 0.15,
        fog: true,
      });
    } else if (def.id.includes('wall') && wallTexture) {
      mat = new THREE.MeshStandardMaterial({
        color: def.color,
        roughness: def.roughness,
        map: wallTexture,
        fog: false,
      });
    } else if (def.id.includes('hazard') && hazardTexture) {
      mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: def.roughness,
        map: hazardTexture,
        fog: false,
      });
    } else {
      mat = new THREE.MeshStandardMaterial({
        color: def.color,
        roughness: def.roughness,
        fog: false,
      });
    }

    const geom =
      def.type === 'cylinder'
        ? new THREE.CylinderGeometry(def.size[0], def.size[1], def.size[2], def.size[3])
        : new THREE.BoxGeometry(def.size[0], def.size[1], def.size[2]);

    const mesh = new THREE.Mesh(geom, mat);
    if (screen) consoleScreen = mesh;
    if (def.id === 'log-recorder') recorder = mesh;
    mesh.name = def.id; // a neon tube gets its ?lights slider by name
    if (!screen && def.id !== 'log-recorder' && !def.id.includes('neon')) {
      mesh.visible = !currentBay;
    }
    if (def.id.includes('neon') && currentBay) {
      if (def.id === 'corner-neon-nw') {
        mesh.position.set(-8.4, 5.2, -17.35);
        mesh.scale.set(1.4, 1.0, 1.4);
      } else if (def.id === 'corner-neon-ne') {
        mesh.position.set(8.4, 5.2, -17.35);
        mesh.scale.set(1.4, 1.0, 1.4);
      } else if (def.id === 'corner-neon-sw') {
        mesh.position.set(-8.4, 5.2, 17.35);
        mesh.scale.set(1.4, 1.0, 1.4);
      } else if (def.id === 'corner-neon-se') {
        mesh.position.set(8.4, 5.2, 17.35);
        mesh.scale.set(1.4, 1.0, 1.4);
      } else if (def.id === 'neon-column-wn') {
        mesh.position.set(-17.35, 5.2, -8.4);
        mesh.scale.set(1.4, 1.0, 1.4);
      } else if (def.id === 'neon-column-ws') {
        mesh.position.set(-17.35, 5.2, 8.4);
        mesh.scale.set(1.4, 1.0, 1.4);
      } else if (def.id === 'neon-column-en') {
        mesh.position.set(17.35, 5.2, -8.4);
        mesh.scale.set(1.4, 1.0, 1.4);
      } else if (def.id === 'neon-column-es') {
        mesh.position.set(17.35, 5.2, 8.4);
        mesh.scale.set(1.4, 1.0, 1.4);
      } else if (def.id === 'neon-airlock-top') {
        mesh.position.set(0, 8.35, -17.65);
        mesh.scale.set(1.1, 1.8, 1.8);
      } else if (def.id === 'neon-observation-top') {
        mesh.position.set(0, 7.2, 17.65);
        mesh.scale.set(1.1, 1.8, 1.8);
      } else if (def.id === 'neon-gantry-north') {
        mesh.position.set(0, 13.05, -8.4);
        mesh.scale.set(1.05, 1.4, 1.4);
      } else if (def.id === 'neon-gantry-south') {
        mesh.position.set(0, 13.05, 8.4);
        mesh.scale.set(1.05, 1.4, 1.4);
      } else mesh.position.set(...def.position);
    } else {
      mesh.position.set(...def.position);
    }
    mesh.rotation.set(...def.rotation);
    if (def.id.startsWith('pedestal') || def.id.startsWith('conduit')) {
      mesh.receiveShadow = true;
      mesh.castShadow = true;
    }
    propsGroup.add(mesh);
  }
  // Each neon tube lights the room for real: a row of lights along it (neonlight.ts), one slider in ?lights.
  for (const tube of propsGroup.children.filter((o) => o.name.includes('neon')))
    propsGroup.add(...tubeLights(tube as THREE.Mesh, clustered ? TUBE_SPACING : Infinity));
  const emergencyLight = new THREE.PointLight(sLights.emergency.color, sLights.emergency.intensity, sLights.emergency.distance);
  emergencyLight.position.set(...sLights.emergency.position);
  const consoleBounceLight = new THREE.PointLight(sLights.consoleBounce.color, sLights.consoleBounce.intensity, sLights.consoleBounce.distance);
  consoleBounceLight.position.set(...sLights.consoleBounce.position);
  const pedestalGlowLight = new THREE.PointLight(sLights.pedestalGlow.color, sLights.pedestalGlow.intensity, sLights.pedestalGlow.distance);
  pedestalGlowLight.position.set(...sLights.pedestalGlow.position);
  const neonWestLight = new THREE.PointLight(sLights.rim.color, 0.2, 6.0);
  neonWestLight.position.set(-5.5, 0.35, -1.0);
  const neonEastLight = new THREE.PointLight(sLights.emergency.color, 0.2, 6.0);
  neonEastLight.position.set(5.5, 0.35, -1.0);
  const neonWallNwLight = new THREE.PointLight(sLights.rim.color, 2.7, 10.0);
  neonWallNwLight.position.set(-8.4, 5.2, -16.8);
  const neonWallNeLight = new THREE.PointLight(sLights.emergency.color, 2.7, 10.0);
  neonWallNeLight.position.set(8.4, 5.2, -16.8);
  const neonWallSwLight = new THREE.PointLight(sLights.rim.color, 2.7, 10.0);
  neonWallSwLight.position.set(-8.4, 5.2, 16.8);
  const neonWallSeLight = new THREE.PointLight(sLights.emergency.color, 2.7, 10.0);
  neonWallSeLight.position.set(8.4, 5.2, 16.8);
  const airlockSodiumLight = new THREE.PointLight(sLights.emergency.color, 3.15, 11.0);
  airlockSodiumLight.position.set(0, 8.2, -17.0);
  const viewportRimLight = new THREE.PointLight(sLights.rim.color, 2.7, 11.0);
  viewportRimLight.position.set(17.0, 4.6, 0);
  const kioskGreenLight = new THREE.PointLight(0x55efc4, 2.25, 6.0);
  kioskGreenLight.position.set(-10.2, 2.5, -5.8);
  const lights = {
    emergencyLight,
    consoleBounceLight,
    pedestalGlowLight,
    neonWestLight,
    neonEastLight,
    neonWallNwLight,
    neonWallNeLight,
    neonWallSwLight,
    neonWallSeLight,
    airlockSodiumLight,
    viewportRimLight,
    kioskGreenLight,
  };
  for (const [name, light] of Object.entries(lights)) light.name = name; // the ?lights sliders' names
  propsGroup.add(...Object.values(lights));
  if (currentBay) {
    applyDeckAtmosphere(currentBay, deck as DeckId);
    propsGroup.add(currentBay.scene);
    if (sceneRenderer.bayLights) propsGroup.add(sceneRenderer.bayLights); // propsGroup.clear() took them out (#787)
  }
  refreshLights();
};
let currentBay: SpaceshipBayAssets | null = null;
const mountBay = (bay: SpaceshipBayAssets | null): void => {
  currentBay = bay;
  drawProps();
  sceneRenderer.mountBay(bay, deck);
  refreshLights(); // the room's lamps came with it
  if (currentBay) {
    document.body.dataset.bay = 'ready'; // the room is complete: the browser checks of a still scene wait for it (#661)
  }
};
(window as unknown as Record<string, unknown>).__mountBay = mountBay;drawProps();
void loadSpaceshipBay(`${import.meta.env.BASE_URL}assets/pbr/`, undefined, loader).then(mountBay);

let frame: FrameShape | null = null;
function drawFrame(board: ArrayLike<number>): void {
  const next = sceneRenderer.drawFrame(board);
  if (!next) return;
  frame = next;
  fogRadius = next.radius;
  applyLook();
}
// The turn on the rim, at once, no fade (world.md section 8). Clear board keeps it: it is game information.
function lightRim(): void {
  const light = hub ? null : rimLight(engine.status(), engine.to_move(), glassOf()); // no game on in the hub (#521)
  sceneRenderer.lightRim(light);
  document.body.dataset.rim = light?.end ?? 'off';
}
// The boss phase notches on the rim (#356, notches.ts): a near-black groove per notch, filled bone-white while lit, and
// a bone-white triangle at the next-phase threshold, so they read on any rim light by shape, not colour alone. No fog
// on them: clear board and the low tier draw them the same (world.md section 8). The HUD P1 P2 P3 stay as the fallback.
function drawNotches(): void {
  const row = engine instanceof Encounter && frame ? notchRow(frame, engine.phase_notches()) : null;
  sceneRenderer.drawNotches(row);
}
// The ejected count scratched on the rim as tally marks (#389, tallymarks.ts), drawn as the phase notches: a groove per
// slot, a bone-white mark in it for each marble lost. The HUD pips stay as the fallback.
function drawTally(): void {
  const lost = [engine.ejected(2), engine.ejected(1)] as const; // a side loses what the other ejects
  const slots = tallySlots(lost);
  tallies.forEach((group, s) => {
    group.clear();
    for (const m of tallyRow(frame!, s === 0 ? 1 : 2, slots[s]!)) {
      for (const geometry of m.marked ? [grooveGeometry, scratchGeometry] : [grooveGeometry]) {
        const mesh = new THREE.Mesh(geometry, geometry === grooveGeometry ? grooveMaterial : scratchMaterial);
        mesh.position.set(m.x, 0, m.z);
        mesh.rotation.y = m.angle;
        group.add(mesh);
      }
    }
  });
}
// Cell index to the marble on it, first, and what is drawn on that marble (glyph, tell ring): the
// slide moves them together and rolls the marble only.
const marbleAt = new Map<number, THREE.Object3D[]>();
// Each marble's own turn (#346), carried and rolled by its slides (#345), for the game it belongs to (orient.ts).
let turns: { game: Engine | Encounter; map: Map<number, Quat> } = { game: engine, map: new Map() };
const gameTurns = (): Map<number, Quat> => {
  if (turns.game !== engine) turns = { game: engine, map: new Map() };
  return turns.map;
};
const turnAt = (i: number): Quat => turnOf(gameTurns(), fight?.seed ?? 0, i);
const onMarble = (i: number, obj: THREE.Object3D): void => {
  marbleAt.set(i, [...(marbleAt.get(i) ?? []), obj]);
};
// Ghost layer: the position a hovered legal move would give, drawn translucent.
const ghostMaterials: Record<number, THREE.MeshStandardMaterial> = {};
for (const [key, color] of [[1, SHELL.color], [2, GLASS.color]] as const) {
  ghostMaterials[key] = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false });
}
const ghostCore = new THREE.MeshBasicMaterial({ color: CORE.color, transparent: true, opacity: 0.45, depthWrite: false });
function applyPalette(): void {
  const pal = paletteById(palette);
  document.documentElement.dataset.palette = palette;
  document.documentElement.style.setProperty('--accent', pal.accent);
  document.documentElement.style.setProperty('--hazard', pal.hazard);
  coldRim.color.setHex(pal.rim);
  warmLight.color.setHex(pal.sodium);
  ringMaterial.color.setHex(pal.core);
  tickMaterial.color.setHex(pal.tell);
  scratchMaterial.color.setHex(pal.tell);
  paleMaterial.color.setHex(pal.tell);
  firedMaterial.color.set(pal.hazard);
  ghostCore.color.setHex(pal.core);
  scarab.color.setHex(pal.shell);
  const smoked = glassLooks.get('smoked');
  if (smoked) smoked.color.setHex(pal.glass);
  coreMaterial.color.setHex(glassSkinById(glass).core ?? pal.core);
  convertedCore.color.copy(coreMaterial.color);
}
applyPalette();
let hover: Axial | null = null;
let hub: HubController | null = null;
let roomOf: HubSpot | null = null; // the hub room that started the game, for Back to the ship (#522)
const backButton = document.getElementById('ship-back') as HTMLButtonElement;

// The bot thinks in a worker so the page never freezes. ?bot=off gives the two-player board back
// (the rules e2e tests drive both sides by hand).
const botWorker =
  new URLSearchParams(location.search).get('bot') === 'off'
    ? null
    : new Worker(new URL('./bot.worker.ts', import.meta.url), { type: 'module' });
let worker = botWorker; // the bot of this game: none at the hub's hot-seat table either (#522)
const history: number[][] = [];
let thinking = false;

// A local game survives a reload: saved in IndexedDB after every move, replayed through the engine on
// load (docs/specs/tech.md section 8). Loaded before the board listeners exist, so no click races it.
const saves = new LocalSaves(indexedDbStore(), navigator.storage);
// Without ?bot=off the page resumes the game of either mode: a hot-seat game from the hub's table goes on with
// no bot (#565).
const resumed = await saves.load(worker ? undefined : false, () => new Engine());
if (resumed) {
  if (!resumed.bot) worker = null;
  engine = resumed.engine;
  history.push(...resumed.moves);
}

// Evaluation bar (#191): the search score of every position of a local or bot game, from a second
// copy of the bot worker, so a bot reply never waits behind it. Online and boss games turn it off for
// good (fair play, #164).
const evalBar = document.getElementById('eval')!;
const evalMeter = evalBar.querySelector('.track')!;
const evalLabel = evalBar.querySelector('.label')!;
const analysisWorker = new Worker(new URL('./bot.worker.ts', import.meta.url), { type: 'module' });
const analyst = new Analyst(
  (moves) => askEval(analysisWorker, moves),
  (score, { history: moves, side }) => {
    const fill = evalFill(score, side);
    const words = evalText(score, side, glassOf());
    evalBar.style.setProperty('--fill', String(fill));
    evalMeter.setAttribute('aria-valuenow', String(Math.round(fill * 100)));
    evalMeter.setAttribute('aria-valuetext', words);
    evalLabel.textContent = words;
    evalBar.dataset.ply = String(moves.length); // read by the e2e tests
  },
  botFailed,
);
let analysing = true;
function analyse(): void {
  if (!analysing) return;
  evalBar.hidden = false;
  analyst.request({ history: history.slice(), side: engine.to_move() });
}
function stopAnalysis(): void {
  analysing = false;
  evalBar.hidden = true;
  analyst.stop();
}

// The bot's and the hint's search budget: BOT_NODES, or the test budget of ?nodes (bot.ts).
const budget = botBudget(location.search, navigator.webdriver);

// Hint (#192): a press shows the engine's best move for the side to move as a ghost, it never plays it. Asked from
// the analysis worker with the bot's own budget, so the bot's reply never waits behind it. A hint belongs to the
// position it was asked for (hint.ts): the next move, New game or an import leave it behind, and a late answer is
// never drawn on a newer position. A new selection and a second press clear it. Local games only, like the bar.
const hintButton = document.getElementById('hint') as HTMLButtonElement;
const here = (): Spot => ({ game: engine, ply: history.length });
const hint = new Hint(
  (moves) => askBot(analysisWorker, moves, scaleBudget(budget, difficulty)), // the bot's own budget: the move the bot would play there
  () => refresh(), // the ghost and the rings on the marbles the move takes (#301)
  botFailed,
);
function syncHint(): void {
  const state = hint.state(here());
  hintButton.hidden = !analysing; // online and boss games turn it off for good, with the bar (fair play, #164)
  hintButton.disabled = thinking || engine.status() !== 0 || replaying !== null;
  hintButton.setAttribute('aria-pressed', String(state !== 'off'));
  document.body.dataset.hint = state; // read by the e2e tests
}
hintButton.addEventListener('click', () => {
  selected = []; // the ghost shows the hint alone
  hint.press(engine, history);
  refresh();
});

// Auto-play (#792, docs/specs/ui.md section 4.3): a toggle in the fight HUD lets the bot play the player's side, one move
// per AUTO_DELAY_MS, until it is turned off, the game is over or replaced. The bot's own side is played as ever. Against
// a boss it needs that boss's medal (#791); online, in the hub and with ?bot=off (no bot) it is not there. The battle royale asks the royale bot for the order.
const autoButton = document.getElementById('auto-play') as HTMLButtonElement;
const autoReason = document.getElementById('auto-reason')!;
let autoPlay = false;
let autoGame: object | null = null; // the game or royale it was turned on in
let autoTimer: ReturnType<typeof setTimeout> | undefined;
function stopAuto(): void {
  autoPlay = false;
  clearTimeout(autoTimer);
}
function syncAuto(): void {
  const boss = engine instanceof Encounter ? engine.name() : null;
  const state = autoPlayState({ online: Boolean(hub) || online !== null || botWorker === null, boss }, fight !== null && hasMedal(store, fight.id));
  const over = royale ? royale.placement().length > 0 : engine.status() !== 0;
  const reason = state.shown ? state.reason : null;
  const usable = state.shown && reason === null && !over;
  if (autoPlay && (!usable || (royale ?? engine) !== autoGame)) stopAuto();
  autoButton.hidden = !state.shown;
  autoButton.disabled = !usable;
  autoButton.setAttribute('aria-pressed', String(autoPlay));
  autoReason.hidden = reason === null;
  autoReason.textContent = reason;
}
function autoRoyale(): void {
  autoTimer = setTimeout(() => {
    autoRoyale(); // first: a round that ends the game stops it (syncAuto)
    if (!reveal && canOrder()) playRound([...royale!.bot_order(me())]);
  }, AUTO_DELAY_MS);
}
autoButton.addEventListener('click', () => {
  const on = !autoPlay;
  stopAuto();
  autoPlay = on;
  autoGame = royale ?? engine;
  if (autoPlay) royale ? autoRoyale() : void botTurn();
  refresh();
});

// The replay bar (#793): first, previous, next, last, a slider and Live step through every position of the move log,
// view only (blocked() refuses every move meanwhile). Left and Right step, Left also opens it, Escape is Live.
const replayButton = document.getElementById('replay') as HTMLButtonElement;
const replayBar = document.getElementById('replay-bar')!;
const replaySlider = document.getElementById('replay-slider') as HTMLInputElement;
const liveGame = (): Engine | Encounter => replaying?.live ?? engine;
const shownPly = (): number => replaying?.ply ?? history.length;
function showPly(ply: number): void {
  stopAuto(); // the bot does not play on while the player looks back (#792)
  replaying ??= { live: engine, ply };
  replaying.ply = ply;
  engine = ply === history.length ? replaying.live : engineAt(history, ply, makeGame);
  selected = [];
  keyDir = -1;
  hint.clear();
  skipEjections();
  refresh();
}
function leaveReplay(): void {
  if (replaying) engine = replaying.live;
  replaying = null;
}
function liveAgain(): void {
  leaveReplay();
  refresh();
}
function stepReplay(step: ReplayStep): void {
  showPly(stepPly(shownPly(), step, history.length));
}
function syncReplay(): void {
  if (hub || royale) leaveReplay();
  replayButton.hidden = Boolean(hub || royale);
  replayButton.disabled = history.length === 0;
  replayBar.hidden = replaying === null;
  replaySlider.max = String(history.length);
  replaySlider.value = String(shownPly());
  document.getElementById('replay-label')!.textContent = replayLabel(shownPly(), history.length);
}
replayButton.addEventListener('click', () => showPly(history.length));
for (const step of ['first', 'prev', 'next', 'last'] as const) {
  document.getElementById(`replay-${step}`)!.addEventListener('click', () => stepReplay(step));
}
document.getElementById('replay-live')!.addEventListener('click', liveAgain);
replaySlider.addEventListener('input', () => showPly(Number(replaySlider.value)));
addEventListener('keydown', (e) => {
  const step = replayKey(e.key, replaying !== null, history.length > 0);
  const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement; // the slider steps by itself
  if (!step || typing || hub || royale || reading || freeCam.active || e.altKey || e.ctrlKey || e.metaKey) return;
  e.preventDefault();
  if (step === 'live') liveAgain();
  else stepReplay(step);
});

// The bot, the boss, the evaluation bar or the hint got no answer from its worker (#736): the game must not wait for it.
function botFailed(): void {
  hud(` · The bot could not answer: press New game`);
  syncHint();
}

async function botTurn(): Promise<void> {
  if (online || replaying || thinking || engine.status() !== 0) return;
  const bots = worker !== null && engine.to_move() === BOT_SIDE;
  const auto = autoPlay && !bots; // the player's side, played by the bot (#792)
  const mover = worker ?? botWorker;
  if ((!bots && !auto) || !mover) return;
  thinking = true;
  syncHint(); // no hint while the bot thinks
  const current = fight;
  const game = liveGame();
  const started = performance.now();
  const searchBudget = scaleBudget(budget, difficulty);
  const diffPercent = DIFFICULTY_PERCENT[difficulty];
  let move: number[];
  try {
    // An auto-played move comes no sooner than AUTO_DELAY_MS after the last, so the game can be followed and stopped.
    [move] = await Promise.all([
      askBot(mover, history, searchBudget, fight ?? undefined, diffPercent, auto),
      auto ? new Promise((done) => setTimeout(done, AUTO_DELAY_MS)) : undefined,
    ]);
  } catch {
    if (liveGame() === game) {
      thinking = false; // the worker cannot answer (#736); a replaced game has nothing to say
      botFailed();
    }
    return;
  }
  diag.botSearch(performance.now() - started, current ? { boss: current.id } : { nodes: searchBudget });
  if (liveGame() !== game) return; // Retry, a new fight, New game or an import replaced the game while the bot was thinking
  if (!auto) thinking = false;
  whenSettled(() => {
    if (auto) {
      thinking = false; // an auto-played move keeps the board shut to clicks until it is played
      if (!autoPlay) return void refresh(); // turned off while the bot thought
    }
    playMove(move);
    refresh();
    void botTurn(); // the other side's reply, or the next auto-played move
  });
}

// Moved marbles slide to their new cell. A click or a bot reply during a slide waits for its end.
let slide: { game: Engine | Encounter; tracks: SlideTrack[]; start: number } | null = null;
const afterSlide: (() => void)[] = [];
// The slide of a replaced game (an import, New game, Retry, a new fight, going online) holds nothing back: what
// would wait for it would be dropped with it at the next frame (#371).
const sliding = (): boolean => slide?.game === engine;
function whenSettled(fn: () => void): void {
  if (sliding()) afterSlide.push(fn);
  else fn();
}

function animateSlides(now: number): void {
  if (!slide) return;
  const stale = slide.game !== engine; // Retry, a new fight or going online ends the slide
  const elapsed = now - slide.start;
  for (const track of stale ? [] : slide.tracks) {
    const p = slideAt(track, elapsed);
    const i = cellIndex(track.cell[0], track.cell[1]);
    const on = marbleAt.get(i) ?? [];
    for (const obj of on) {
      obj.position.x = p.x;
      obj.position.z = p.z;
    }
    if (on[0]) turnMarble(on[0], rolledTurn(track, elapsed, turnAt(i)));
  }
  if (!stale && elapsed < SLIDE_MS) return;
  slide = null;
  delete document.body.dataset.sliding;
  if (stale) afterSlide.length = 0; // what waited belongs to the old game
  for (const fn of afterSlide.splice(0)) whenSettled(fn);
}

// Marbles leaving the board: pushed one cell out over the rim, they fall, tumble, stretch and fade
// into the void, then are removed. Reduced motion: a plain fade. A click or a key ends the effect at
// once, and the effect never holds the next move.
interface Ejecting {
  holder: THREE.Group; // its x axis is the pull, so its scale stretches the marble along the pull
  tumble: THREE.Group; // in the holder: the roll and the twist
  mesh: THREE.Mesh; // in the tumble, turned so the marble starts with its own turn on the board (#364)
  track: EjectTrack;
  start: number;
  skipped: boolean;
}
const ejecting: Ejecting[] = [];
function playMove(record: number[]): void {
  leaveReplay(); // a bot reply or a peer's move shows the live game
  const before = Array.from(engine.board());
  engine.play(Int32Array.from(record));
  afterPlay(before, record);
  if (!online && !fight) void saves.save({ bot: worker !== null, moves: history }, engine.status() !== 0);
  analyse();
}

// `live` false: a move replayed by a catch-up shows at once, without its ejection effect and sound (#232).
function afterPlay(before: number[], record: number[], live = true): void {
  history.push(record);
  const mv = parseMoves(record)[0]!;
  const reduced = reducedMotion();
  // The Magnetizer's repulsions (#645): the move slides to the board before the first one, then each plays in turn.
  const repulsions = live && !reduced && engine instanceof Encounter ? parseRepulsions(engine.repulsions()) : [];
  // The Pulsar's pulse (#675): the move slides to the board before the pulse, then the pulse plays.
  const pulse = live && engine instanceof Encounter ? parsePulse(engine.last_pulse(), engine.board().length) : null;
  // The Assembly Line's belts: the move slides to the board before them, then they carry the marbles.
  const carries = live && engine instanceof Encounter ? parseCarries(engine.last_belts()) : [];
  const beltBoard = carries.length > 0 ? beforeBelts(engine.board(), carries) : null;
  // The Unstable Core's overloads, collapse and shockwave (#751): the move slides to the board before them first.
  const unstable = live && engine instanceof Encounter ? parseEvents(engine.last_unstable()) : null;
  const after = repulsions[0]?.board ?? pulse?.board ?? beltBoard ?? unstable?.board ?? engine.board();
  const tracks = slideTracks(before, after, mv, reduced);
  const held = gameTurns(); // first: a new game starts its own. Kept for the ejected marble, whose cell is taken
  turns.map = carryTurns(held, fight?.seed ?? 0, tracks, mv.dir);
  if (!live) return;
  delete document.body.dataset.repulsions;
  if (tracks.some((t) => t.durationMs > 0)) {
    slide = { game: engine, tracks, start: performance.now() };
    document.body.dataset.sliding = '1';
  }
  document.body.dataset.knock = String(sfx.knock(mv.cells.length) ?? 'none'); // the knock's pitch in Hz, read by the e2e tests (#289)
  startPasses(before, mv, reduced);
  if (repulsions.length > 0) {
    // Each repulsion slides from its board to the next one's, the last to the engine's; then the engine's own tells.
    const game = engine;
    const steps = [...repulsions, { board: Array.from(engine.board()), poles: Array.from((engine as Encounter).polarities()) }];
    shown = { game, ...steps[0]! };
    whenSettled(() => {
      repulsions.forEach((rep, k) => whenSettled(() => repel(game, rep, steps[k + 1]!)));
      whenSettled(() => {
        shown = null;
        refresh();
      });
    });
  }
  if (pulse) {
    shown = { game: engine, board: pulse.board, poles: [] };
    whenSettled(() => firePulse(pulse, reduced));
  }
  if (unstable) {
    shown = { game: engine, board: unstable.board, poles: [] };
    whenSettled(() => fireUnstable(unstable, reduced));
  }
  const ejection = findEjection(before, after, mv);
  if (ejection) eject(ejection, mv.dir, held, reduced);
  // The Overseer's vents (#635): the push slides first, then each marble they burnt sinks into its vent.
  delete document.body.dataset.burns;
  const vented = engine instanceof Encounter && engine.incinerators().length > 0;
  const burns = vented ? parseBurns((engine as Encounter).removed()) : [];
  const won = fight?.id === 'overseer' && engine instanceof Encounter && engine.result() === 1;
  if (burns.length > 0) whenSettled(() => burn(burns, reduced, history.length, won));
  // The defeated Overseer (#789): after the last burn its pedestal blows up like the martyr, then it says its farewell.
  if (won && overseerBlown !== engine) {
    overseerBlown = engine;
    whenSettled(() => {
      explode([0, 0], reduced, { text: FAREWELL, hold: TAUNT_HOLD_MS, angry: false });
      overseerDrawn.overseer = null;
      overseerPedestal!.visible = false;
    });
  }
  if (beltBoard) {
    shown = { game: engine, board: beltBoard, poles: [] };
    whenSettled(() => fireBelts(carries, beltBoard, reduced));
  }
  // The Choir removes its weakest army (#747): the push slides first, then the army's marbles sink where they stood.
  delete document.body.dataset.sunk;
  const sunk = fight?.id === 'choir' ? parseBurns((engine as Encounter).removed()) : [];
  if (sunk.length > 0) whenSettled(() => sink(sunk, reduced));
  // The Chaplain's martyr (#748): the board shows the converted marbles at once, the flash and shards play over them.
  const boom = fight?.id === 'chaplain' && engine instanceof Encounter ? parseBlast(engine.removed()) : null;
  if (boom) whenSettled(() => explode(boom, reduced));
}

/** The removed army: each marble sinks into its cell, or fades with reduced motion. */
function sink(marbles: Burn[], reduced: boolean): void {
  document.body.dataset.sunk = String(marbles.length); // read by the e2e tests
  for (const { cell, side } of marbles) startEjection(marbleMesh(side), burnTrack(cell, reduced), scene);
}

/** The explosion at `cell` (the Chaplain's martyr, the defeated Overseer): a flash and a ring of shards, a static flash with
 * reduced motion, then the bubble says `then`. */
function explode(cell: Axial, reduced: boolean, then?: Speech): void {
  const p = axialTo3D(cell[0], cell[1]);
  const group = Object.assign(new THREE.Group(), { name: 'martyr-blast' });
  group.position.set(p.x, 0.36, p.z);
  const flash = new THREE.Mesh(blastFlashGeometry, blastFlashMaterial);
  const shards = reduced ? [] : Array.from({ length: BLAST_SHARDS }, () => new THREE.Mesh(blastShardGeometry, blastShardMaterial));
  group.add(flash, ...shards);
  scene.add(group);
  blast = { group, flash, shards, start: performance.now(), reduced, then };
  drawBlast(0);
  document.body.dataset.explosions = String(Number(document.body.dataset.explosions ?? 0) + 1); // read by the e2e tests
  document.body.dataset.exploding = '1';
}

/** Draws the explosion `elapsedMs` in, and takes it away once it is over. */
function drawBlast(elapsedMs: number): void {
  const at = blastAt(elapsedMs, blast!.reduced);
  blast!.flash.scale.setScalar(at.flashRadius);
  blastFlashMaterial.opacity = at.flashOpacity;
  blastShardMaterial.opacity = at.shardOpacity;
  blast!.shards.forEach((shard, k) => {
    const angle = (2 * Math.PI * k) / BLAST_SHARDS;
    shard.position.set(Math.cos(angle) * at.shardRadius, at.shardLift, Math.sin(angle) * at.shardRadius);
    shard.rotation.set(elapsedMs / 150 + k, elapsedMs / 200, 0);
  });
  if (!at.done) return;
  scene.remove(blast!.group);
  const { then } = blast!;
  blast = null;
  delete document.body.dataset.exploding;
  if (then) say(then); // the Overseer's farewell types once its marble is gone (#789)
}

/** The burns of a ply at `ply`: each marble sinks into its vent, or fades with reduced motion; a burnt core angers the Overseer, unless it is the last one: its farewell has priority (#789). */
function burn(burns: Burn[], reduced: boolean, ply: number, won: boolean): void {
  document.body.dataset.burns = String(burns.length); // read by the e2e tests
  if (!won && burns.some((b) => b.side === CORE_CODE)) say({ text: angryLine(fight!.seed, ply), hold: ANGRY_HOLD_MS, angry: true }); // #741
  for (const { cell, side } of burns) startEjection(side === CORE_CODE ? coreMesh() : marbleMesh(side), burnTrack(cell, reduced), scene);
}

/** The effect and sound of `ejection`, pushed off in direction `dir`, the marble with its turn in `held`. */
function eject(ejection: NonNullable<ReturnType<typeof findEjection>>, dir: number, held: Map<number, Quat>, reduced: boolean): void {
  const body = document.body;
  body.dataset.ejections = String(Number(body.dataset.ejections ?? 0) + 1);
  body.dataset.sound = sfx.ejection(ejection.side, glassOf()) ?? 'none'; // read by the e2e tests: toll, clack or none
  const track = ejectTrack(ejection.cell, dir, reduced);
  const mesh = marbleMesh(ejection.side);
  turnMarble(mesh, inHolder(turnOf(held, fight?.seed ?? 0, cellIndex(...ejection.cell)), trackAt(track, 0).yaw));
  startEjection(mesh, track, scene);
  if (!reduced) startBlood(track);
}

/** Plays repulsion `rep` of `game` (#645): the pair slides apart with the lines it pushes to the board `to`, its glyphs
 * fade out (#671), an ejected marble falls. A replaced game drops what waits for its slide. */
function repel(game: Engine | Encounter, rep: Repulsion, to: { board: number[]; poles: number[] }): void {
  const held = gameTurns();
  const tracks: SlideTrack[] = [];
  const spent: { cell: Axial; sign: number }[] = []; // the pair, whose glyphs fade out
  for (const half of repulsionMoves(rep.pair)) {
    const moved = slideTracks(rep.board, to.board, half, false);
    // The member's own track comes first; a member pushed off the board has none, as its line is itself alone.
    const sign = rep.poles[cellIndex(...half.cells[0]!)]!;
    spent.push(...moved.slice(0, 1).map((t) => ({ cell: t.cell, sign })));
    turns.map = carryTurns(turns.map, fight!.seed, moved, half.dir); // a Magnetizer fight
    tracks.push(...moved);
    const ejection = findEjection(rep.board, to.board, half);
    if (ejection) eject(ejection, half.dir, held, false);
  }
  shown = { game, ...to };
  refresh();
  for (const { cell, sign } of spent) fadeGlyph(cell, sign);
  slide = { game: engine, tracks, start: performance.now() };
  document.body.dataset.sliding = '1';
  document.body.dataset.repulsions = String(Number(document.body.dataset.repulsions ?? 0) + 1); // read by the e2e tests
}

/** The glyph `sign` of a pair member, drawn on its marble that slides to `cell` and fading out with the slide: the pair
 * loses its polarities (#671). */
function fadeGlyph(cell: Axial, sign: number): void {
  const sprite = Object.assign(new THREE.Sprite(glyphMaterials.get(sign)!.clone()), { renderOrder: 2 });
  const p = axialTo3D(...cell);
  sprite.position.set(p.x, 0.86, p.z);
  sprite.scale.setScalar(0.34);
  marbles.add(sprite);
  onMarble(cellIndex(...cell), sprite);
  fading.push({ sprite, start: performance.now() });
}

/** Fades the glyphs of a spent pair out over the slide, then drops them. */
function fadeGlyphs(now: number): void {
  for (const f of fading.slice()) {
    const t = Math.min(1, (now - f.start) / SLIDE_MS);
    f.sprite.material.opacity = 1 - t;
    if (t < 1) continue;
    f.sprite.removeFromParent();
    f.sprite.material.dispose();
    fading.splice(fading.indexOf(f), 1);
  }
}

/** Plays the pulse of the last ply (#675): the ring grows from the pulsar, the pushed marbles slide a cell and the ones
 * past the rim fall, then the engine's board shows. It waits for the move's slide, so a replaced game drops it. */
function firePulse(pulse: Pulse, reduced: boolean): void {
  const after = Array.from(engine.board());
  const held = gameTurns();
  const tracks = slideTracks(pulse.board, after, pulseMove(pulse), reduced);
  turns.map = carryTurns(turns.map, fight!.seed, tracks, pulse.id); // a Pulsar fight
  for (const ejection of fallen(pulse)) eject(ejection, pulse.id, held, reduced);
  shown = null;
  refresh();
  if (tracks.some((t) => t.durationMs > 0)) {
    slide = { game: engine, tracks, start: performance.now() };
    document.body.dataset.sliding = '1';
  }
  if (shock) scene.remove(shock.mesh);
  shock = { mesh: new THREE.Mesh(shockGeometry, shockMaterial), id: pulse.id, start: performance.now(), reduced, skipped: false };
  scene.add(shock.mesh);
  drawShock(0);
  document.body.dataset.pulses = String(Number(document.body.dataset.pulses ?? 0) + 1); // read by the e2e tests
  document.body.dataset.pulsing = '1';
}

/** Plays what the last ply's hook did (#751): a ring bursts where a marble overloaded or fell with the core, the
 * shoved marbles slide a cell and the ones past the rim fall, the wedge's slice sweeps outward; then the engine's board
 * shows. It waits for the move's slide, so a replaced game drops it. */
function fireUnstable(events: UnstableEvents, reduced: boolean): void {
  const held = gameTurns();
  const tracks = shoveTracks(events, reduced);
  for (const track of tracks) turns.map = carryTurns(turns.map, fight!.seed, [track], track.dir);
  for (const { cell, side, dir } of shoved(events)) eject({ cell, side }, dir, held, reduced);
  const lost = lostCells(events);
  for (const cell of lost) {
    const p = axialTo3D(...cell);
    const material = new THREE.MeshBasicMaterial({ color: WARN_COLOR, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const mesh = Object.assign(new THREE.Mesh(shockGeometry, material), { name: 'burst' });
    mesh.position.set(p.x, 0.3, p.z);
    scene.add(mesh);
    bursts.push({ mesh, start: performance.now(), reduced, skipped: false });
  }
  document.body.dataset.bursts = String(Number(document.body.dataset.bursts ?? 0) + lost.length); // read by the e2e tests
  shown = null;
  refresh();
  if (tracks.some((t) => t.durationMs > 0)) {
    slide = { game: engine, tracks, start: performance.now() };
    document.body.dataset.sliding = '1';
  }
  if (events.wedge >= 0) {
    sweep = { mesh: new THREE.Mesh(wedgeSlice(events.wedge), sweepMaterial), start: performance.now(), reduced, skipped: false };
    sweep.mesh.position.y = 0.02;
    scene.add(sweep.mesh);
    drawSweep(0);
    document.body.dataset.shockwaves = String(Number(document.body.dataset.shockwaves ?? 0) + 1); // read by the e2e tests
  }
}

/** Draws the bursts and the sweep `elapsedMs` into their effects, and takes them away once they are over. */
function animateUnstable(now: number): void {
  for (const b of bursts.slice()) {
    const at = burstAt(b.skipped ? Infinity : now - b.start, b.reduced);
    b.mesh.scale.setScalar(at.radius);
    (b.mesh.material as THREE.MeshBasicMaterial).opacity = at.opacity;
    if (!at.done) continue;
    scene.remove(b.mesh);
    (b.mesh.material as THREE.Material).dispose();
    bursts.splice(bursts.indexOf(b), 1);
  }
  if (sweep) drawSweep(now - sweep.start);
  if (unstableShown?.core) energyMaterial.opacity = energyGlow(now / 1000, unstableShown.collapsing, reducedMotion());
  if (unstableShown && unstableShown.wedge >= 0) wedgeGlowMaterial.opacity = wedgeGlow(now / 1000, reducedMotion());
}

function drawSweep(elapsedMs: number): void {
  const at = sweepAt(sweep!.skipped ? Infinity : elapsedMs, sweep!.reduced);
  sweep!.mesh.scale.setScalar(at.scale);
  sweepMaterial.opacity = at.opacity;
  if (!at.done) return;
  scene.remove(sweep!.mesh);
  sweep = null;
}

/** Draws the Unstable Core's marks (#751): the energy cells while the core stands, the pips over the charged marbles and
 * the announced wedge. Nothing in the other fights. */
function drawUnstable(core: Core | null, charges: Charge[]): void {
  unstableShown = core && { ...core, pips: charges };
  if (!core) return;
  if (core.core) {
    for (const cell of ENERGY) {
      const p = axialTo3D(...cell);
      const hex = Object.assign(new THREE.Mesh(energyGeometry, energyMaterial), { name: 'energy-cell' });
      hex.position.set(p.x, 0.006, p.z);
      marbles.add(hex);
    }
  }
  for (const { cell, n } of charges) {
    const p = axialTo3D(...cell);
    for (const dx of pipOffsets(n)) {
      const pip = Object.assign(new THREE.Mesh(pipGeometry, n >= WARN_CHARGES ? warnMaterial : pipMaterial), { name: 'charge-pip' });
      pip.position.set(p.x + dx, 0.9, p.z);
      marbles.add(pip);
      onMarble(cellIndex(...cell), pip);
    }
  }
  if (core.wedge >= 0) {
    const glow = Object.assign(new THREE.Mesh(wedgeSlice(core.wedge), wedgeGlowMaterial), { name: 'wedge-glow' });
    glow.position.y = 0.012;
    marbles.add(glow);
  }
}

/** Draws the shockwave `elapsedMs` into the pulse, and takes it away once it is over. */
function drawShock(elapsedMs: number): void {
  const at = shockAt(shock!.id, shock!.skipped ? Infinity : elapsedMs, shock!.reduced);
  shock!.mesh.position.set(at.x, 0.05, at.z);
  shock!.mesh.scale.setScalar(Math.max(at.radius, 0.01));
  shockMaterial.opacity = at.opacity;
  if (!at.done) return;
  scene.remove(shock!.mesh);
  shock = null;
  delete document.body.dataset.pulsing;
}

/** Gives `mesh` and its parts materials of their own, to fade: transparent, the opacity they had kept in `userData.opacity`
 * (the glass is see-through before it fades). */
function fadable(mesh: THREE.Object3D): THREE.Material[] {
  const own: THREE.Material[] = [];
  mesh.traverse((o) => {
    const material = ((o as THREE.Mesh).material as THREE.Material).clone();
    material.transparent = true;
    material.depthWrite = false; // the core stays seen through the fading glass
    material.userData.opacity = material.opacity;
    (o as THREE.Mesh).material = material;
    own.push(material);
  });
  return own;
}

/** Plays the belts of the last ply (#744): the marbles they carry slide a cell, the ones that reach the end roll off and
 * fall, the ones a press struck sink under it. It waits for the move's slide, so a replaced game drops it. */
function fireBelts(carries: Carry[], before: number[], reduced: boolean): void {
  const after = Array.from(engine.board());
  const held = gameTurns();
  const tracks: SlideTrack[] = [];
  for (const mv of beltMoves(carries)) {
    const moved = slideTracks(before, after, mv, reduced);
    turns.map = carryTurns(turns.map, fight!.seed, moved, mv.dir);
    tracks.push(...moved);
  }
  for (const { cell, side, dir } of fellOff(carries)) eject({ cell, side }, dir, held, reduced);
  const struck = struckBy(carries);
  shown = null;
  refresh();
  if (tracks.some((t) => t.durationMs > 0)) {
    slide = { game: engine, tracks, start: performance.now() };
    document.body.dataset.sliding = '1';
  }
  if (struck.length > 0) burn(struck, reduced, history.length, false);
  if (!reduced) for (const { cell } of struck) pressOn(cell);
  document.body.dataset.beltTurns = String(Number(document.body.dataset.beltTurns ?? 0) + 1); // read by the e2e tests
}

/** The press comes down on `cell`. */
function pressOn(cell: Axial): void {
  const p = axialTo3D(...cell);
  const mesh = Object.assign(new THREE.Mesh(pressGeometry, pressMaterial), { name: 'belt-slam', castShadow: true });
  mesh.position.set(p.x, slamAt(0, false).y, p.z);
  scene.add(mesh);
  slams.push({ mesh, start: performance.now(), skipped: false });
  document.body.dataset.slams = String(Number(document.body.dataset.slams ?? 0) + 1); // read by the e2e tests
}

function animateSlams(now: number): void {
  for (const s of slams.slice()) {
    const at = slamAt(s.skipped ? Infinity : now - s.start, false);
    s.mesh.position.y = at.y;
    if (!at.done) continue;
    scene.remove(s.mesh);
    slams.splice(slams.indexOf(s), 1);
  }
}

/** Starts the effect of the ejected marble `mesh` along `track`, in `parent`: the scene, or the battle royale arena at
 * its own scale (#612). */
function startEjection(mesh: THREE.Mesh, track: EjectTrack, parent: THREE.Object3D, delayMs = 0): void {
  fadable(mesh);
  const tumble = new THREE.Group();
  tumble.add(mesh);
  const holder = new THREE.Group();
  holder.add(tumble);
  parent.add(holder);
  const e: Ejecting = { holder, tumble, mesh, track, start: performance.now() + delayMs, skipped: false }; // waits on its cell
  drawEjection(e, 0);
  ejecting.push(e);
  document.body.dataset.ejecting = track.kind; // read by the e2e tests: tumble, or fade with reduced motion
}

/** Draws an ejected marble `elapsedMs` into its effect, true once the effect is over. */
function drawEjection(e: Ejecting, elapsedMs: number): boolean {
  const p = trackAt(e.track, elapsedMs, e.skipped);
  e.holder.position.set(p.x, 0.36 - p.drop, p.z);
  e.holder.rotation.y = p.yaw;
  e.holder.scale.set(p.along, p.across, p.across);
  e.tumble.rotation.set(p.twist, 0, -p.roll); // rolling forward, the top turns toward the pull: negative z
  e.mesh.traverse((o) => {
    const material = (o as THREE.Mesh).material as THREE.Material;
    material.opacity = material.userData.opacity * p.opacity;
  });
  return p.done;
}

// The blood spatter of an ejection (issue #278): a stylised spatter just past the steel frame, drawn from
// blood.ts. It never covers a cell, a marble or the frame, ends by itself, and a click or a key ends it at once.
const BLOOD_COLOR = 0xbd2a20; // 3.3:1 on the void (#0b0d0f), brighter than the rust it replaces, still not the UI danger red
const DROP_SIZE = 1.6; // world units: big enough to count at 1280x720, still a droplet
interface Bleeding {
  points: THREE.Points;
  stain: THREE.Mesh;
  from: { x: number; z: number };
  dir: { x: number; z: number };
  start: number;
  skipped: boolean;
}
const bleeding: Bleeding[] = [];

function startBlood(track: EjectTrack): void {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BLOOD_DROPS * 3), 3));
  const material = new THREE.PointsMaterial({ color: BLOOD_COLOR, size: DROP_SIZE, transparent: true, depthWrite: false });
  const points = new THREE.Points(geometry, material);
  // The stain: a flat disc on the void just under the rim, its own mesh so it can grow and fade.
  const stain = new THREE.Mesh(
    new THREE.CircleGeometry(1, 24),
    new THREE.MeshBasicMaterial({ color: BLOOD_COLOR, transparent: true, depthWrite: false }),
  );
  stain.rotation.x = -Math.PI / 2;
  scene.add(points, stain);
  const b: Bleeding = { points, stain, from: track.from, dir: track.dir, start: performance.now(), skipped: false };
  drawBlood(b, 0);
  bleeding.push(b);
  document.body.dataset.blood = 'spatter'; // read by the e2e tests
}

/** Draws a spatter `elapsedMs` into its effect, true once it is over. */
function drawBlood(b: Bleeding, elapsedMs: number): boolean {
  const t = b.skipped ? BLOOD_MS : elapsedMs;
  const drops = bloodAt(b.from, b.dir, t, false);
  if (drops.length === 0) return true;
  const position = b.points.geometry.getAttribute('position') as THREE.BufferAttribute;
  drops.forEach((d, i) => position.setXYZ(i, d.x, d.y, d.z));
  position.needsUpdate = true;
  (b.points.material as THREE.PointsMaterial).opacity = drops[0]!.alpha;
  const stain = bloodStainAt(b.from, b.dir, t, false)!;
  b.stain.position.set(stain.x, 0.01, stain.z);
  b.stain.scale.setScalar(stain.radius);
  (b.stain.material as THREE.MeshBasicMaterial).opacity = stain.alpha;
  return false;
}

function animateEjections(now: number): void {
  for (const e of ejecting.slice()) {
    if (!drawEjection(e, now - e.start)) continue;
    e.holder.removeFromParent();
    e.mesh.traverse((o) => ((o as THREE.Mesh).material as THREE.Material).dispose());
    ejecting.splice(ejecting.indexOf(e), 1);
  }
  if (ejecting.length === 0) delete document.body.dataset.ejecting;
  for (const b of bleeding.slice()) {
    if (!drawBlood(b, now - b.start)) continue;
    scene.remove(b.points, b.stain);
    b.points.geometry.dispose();
    (b.points.material as THREE.Material).dispose();
    b.stain.geometry.dispose();
    (b.stain.material as THREE.Material).dispose();
    bleeding.splice(bleeding.indexOf(b), 1);
  }
  if (bleeding.length === 0) delete document.body.dataset.blood;
}

// Skip: a click or a key jumps the effect to its end, then goes on to do its usual job.
function skipEjections(): void {
  for (const e of ejecting) e.skipped = true;
  for (const b of bleeding) b.skipped = true;
  for (const p of passing) p.skipped = true;
  for (const s of slams) s.skipped = true;
  if (shock) shock.skipped = true;
  for (const b of bursts) b.skipped = true;
  if (sweep) sweep.skipped = true;
  animateEjections(performance.now());
  animatePasses(performance.now());
  animateSlams(performance.now());
  if (shock) drawShock(0);
  animateUnstable(performance.now());
}
addEventListener('pointerdown', skipEjections, { capture: true });
addEventListener('keydown', skipEjections, { capture: true });

let selected: Axial[] = [];
let keyDir = -1; // the direction picked with Q W E A S D for the selected group, -1 for none (#738)
let ringed: Axial[] = []; // the marbles drawn with the selection ring, read by the e2e tests
let targets: ReturnType<typeof groupTargets> = []; // the cells drawn with a target arrow, read by the e2e tests

// The medal of a won boss fight (#791), earned once per fight: hud() runs again on every refresh. Solo, daily and co-op
// fights all come here, so every peer of a co-op win gets the medal.
let medalSeen: { game: unknown; note: string } = { game: null, note: '' };
function medalNote(boss: { id: string }): string {
  if (medalSeen.game !== engine) {
    const turns = playerTurns(history.length);
    const result: MedalResult = recordMedal(store, boss.id, turns);
    medalSeen = { game: engine, note: medalLine(result, result === 'kept' ? bestTurns(store, boss.id)! : turns) };
  }
  return medalSeen.note;
}

function hud(extra = ''): void {
  syncReplay();
  backButton.hidden = !roomOf || engine.status() === 0; // once the game a hub room started is over (#522)
  if (hub || royale) document.getElementById('boss-bar')!.hidden = true; // no boss there (#814)
  if (hub) {
    delete document.body.dataset.over; // no end light over the hub
    document.getElementById('hud')!.innerHTML = hub.hud();
    return;
  }
  if (royale) return royaleHud(royale);
  const status = engine.status();
  const ejected = [engine.ejected(1), engine.ejected(2)] as const;
  const win = [engine.win_ejections(1), engine.win_ejections(2)] as const;
  // End banner (#282): body[data-over] carries the animation id for the CSS and the e2e tests.
  const end = endBanner({
    status,
    reason: engine.draw_reason(),
    win: status === 1 || status === 2 ? win[status - 1]! : 0,
    mode: fight ? 'boss' : online ? 'online' : worker ? 'bot' : 'local', // a co-op fight is a boss fight on the HUD (#530)
    side: online ? (online.role === 'player' ? online.side : 0) : fight || worker ? 1 : 0,
    glass: glassOf(),
  });
  if (end?.anim === 'win' && fight) end.line = `${end.line} ${medalNote(fight)}`; // a won fight: Black is the player's side
  if (end) document.body.dataset.over = end.anim;
  else delete document.body.dataset.over;
  document.getElementById('hud')!.innerHTML = hudHtml({
    end: end ?? undefined,
    side: engine.to_move(),
    status,
    glass: glassOf(),
    score: formatScore(ejected, win, status, engine.draw_reason(), glassOf()),
    ejected,
    win,
    note: `${onlineNote}${online ? '' : offlineNotice}${extra}`,
    online: onlineLine,
    // Co-op (#530): a seated player's human ply is its own or the partner's, the boss turn reads as in solo.
    turn: online?.role === 'player' && fight && engine.to_move() === COOP_SIDE ? coopTurn(online.ourTurn()) : undefined,
    // Tally's line at the start of a match, the same mode as the end banner (#294).
    tally: shownPly() === 0 && status === 0 ? tallyLine({ mode: fight ? 'boss' : online ? 'online' : worker ? 'bot' : 'local', boss: fight?.id }) : '',
    // Who asked for a rematch, for the seated players of a finished online game (#186), a Retry in co-op (#531).
    rematch:
      online?.role !== 'player' || status === 0
        ? ''
        : fight
          ? retryText(online.askedRematch(online.ourSeat), online.askedRematch(3 - online.ourSeat))
          : rematchText(online.side, online.askedRematch(online.side), online.askedRematch(3 - online.side), glassOf()),
  });
  rematchButton.hidden = online?.role !== 'player' || status === 0; // spectators never see it
  rematchButton.disabled = !online?.canRematch(); // asked already, or the opponent is gone
  exportButton.hidden = importButton.hidden = online !== null || fight !== null; // local games only (#219)
  syncHint();
  const showGoal = goalShown(shownPly(), goalOpen);
  goalButton.hidden = !(engine instanceof Encounter) || status !== 0; // once the fight is over the plate has no room for another row (#271)
  goalButton.disabled = shownPly() === 0; // the goal is on the plate until the first move
  goalButton.setAttribute('aria-expanded', String(showGoal));
  const boss = engine instanceof Encounter ? engine : null;
  if (boss) {
    // The vents note (#741): the change that starts burning the player's marbles, shown for 2 plies.
    const phase = boss.phase();
    if (phaseSeen.game !== engine) phaseSeen = { game: engine, phase, since: -1 };
    else if (phaseSeen.phase !== phase) {
      phaseSeen = { game: engine, phase, since: boss.incinerators().length > 0 && startsBurningPlayer(phaseSeen.phase, phase) ? shownPly() : -1 };
    }
  }
  const tell = boss
    ? [
        crackText(parseCracks(boss.cracks())),
        eggText(parseEggs(boss.eggs())),
        trainText(parseTrains(boss.trains())),
        beltText(parseBelts(boss.belts())),
        pulseText(parsePulsar(boss.pulsar())),
        ballastText(boss.ballast_next()),
        firedText(parseFired(boss.ballast_fired())),
        coreText(parseCore(boss.unstable())),
        toxinText(boss.turns_left()),
        ventNote(phaseSeen.since, shownPly()),
        fight?.id === 'magnetizer' ? polarityText(boss.phase(), shownPly()) : '',
        chaplainText(exposed, boss.converted().length / 2),
        martyrText(parseMartyr(boss.martyr())),
        choirText(boss.next_army(), armiesLeft(parseArmies(boss.armies()))),
      ]
        .filter((t) => t !== '')
        .join(' · ')
    : '';
  if (boss) {
    if (boss.result() === 1) recordWin(store, fight!.id); // a boss win opens the lift onto the next deck (#520)
    document.getElementById('hud')!.insertAdjacentHTML(
      'beforeend',
      bossHtml({
        name: boss.name(),
        phase: boss.phase(),
        phases: boss.phases(),
        result: end ? 0 : boss.result(), // the end banner already says Victory or Defeat, one line less in the plate
        goal: showGoal ? boss.goal() : '',
        tell,
        // The daily line, or the attempt of a co-op room (#531).
        daily: fight?.daily ? dailyLine(fight.daily.day, fight.daily.attempt) : online ? attemptLine(online.attempt) : '',
      }),
    );
  }
  drawBossBar(
    document.getElementById('boss-bar')!,
    boss ? { name: boss.name(), ejected: engine.ejected(1), win: engine.win_ejections(1), steps: Array.from(boss.phase_ejections()), phase: boss.phase() } : null,
  );
  drawChoirChips(document.getElementById('boss-bar')!, boss ? choirChips(parseArmies(boss.armies()), boss.next_army()) : null);
  if (flatHud) {
    const flat = { phase: boss?.phase() ?? 0, phases: boss?.phases() ?? 0, tell };
    document
      .getElementById('hud')!
      .insertAdjacentHTML('beforeend', flatHudHtml({ side: engine.to_move(), status, glass: glassOf(), ejected, win, boss: boss ? flat : undefined }));
  }
  if (rankedMode === '1v1') {
    if (status !== 0 && !rankedDone) {
      rankedDelta = settleRanked1v1(store, online!.side, status, Array.from(engine.board()).join(','), rankedOpponentRating).delta;
      rankedDone = true;
    }
    const waiting = online?.presenceOf(3 - online.side) === 'waiting';
    const queueWindow = waiting ? toleranceWindow(Date.now() - rankedQueuedAt) : undefined;
    document.getElementById('hud')!.insertAdjacentHTML('beforeend', rankedHudHtml(loadRankedProfile(store).rating1v1, { queueWindow, delta: rankedDelta }));
  }
  showResultCard();
}

function refresh(): void {
  syncAuto();
  if (hub) {
    hub.draw(sceneRenderer, discs, sfx, loadProgress(store).beaten, marbleMesh(glassOf()), drawFrame, lightRim);
    hud();
    return;
  }
  if (royale) return drawRoyale(royale);
  const board = showing()?.board ?? engine.board();
  drawFrame(board);
  lightRim();
  drawNotches();
  drawTally();
  const moves = parseMoves(engine.legal_moves());
  targets = groupTargets(moves, selected);
  ringed = [...selected, ...hint.marked(here())]; // the selection, or the marbles the hint takes (#301)
  const cracks = engine instanceof Encounter ? parseCracks(engine.cracks()) : [];
  const left = crackLeft(cracks);
  const converted = engine instanceof Encounter ? parseCells(engine.converted()) : [];
  const martyr = engine instanceof Encounter ? parseMartyr(engine.martyr()) : null;
  const armies = engine instanceof Encounter ? parseArmies(engine.armies()) : [];
  const next = engine instanceof Encounter ? engine.next_army() : -1;
  const eggs = engine instanceof Encounter ? parseEggs(engine.eggs()) : [];
  trainsShown = engine instanceof Encounter ? parseTrains(engine.trains()) : [];
  const poles = showing()?.poles ?? (engine instanceof Encounter ? Array.from(engine.polarities()) : []);
  const fresh = showing() || !(engine instanceof Encounter) ? [] : parseCells(engine.assigned());
  announceDrawn = showing() || !(engine instanceof Encounter) ? null : parseAnnounce(engine.announce());
  blinking = null;
  delete document.body.dataset.announceBlink;
  marbles.clear();
  marbleAt.clear();
  crackDecals = [];
  const vents = engine instanceof Encounter ? parseCells(engine.incinerators()) : [];
  overseerDrawn = { overseer: null, cores: [], vents };
  for (const [q, r] of vents) marbles.add(ventAt(axialTo3D(q, r)));
  hazes = !burnsPlayer(engine instanceof Encounter ? engine.phase() : 0) ? [] : vents.flatMap(([q, r], v) => {
    const p = axialTo3D(q, r);
    return Array.from({ length: HAZE_PER_VENT }, (_, j) => {
      const material = new THREE.SpriteMaterial({ map: hazeMap, transparent: true, depthWrite: false, opacity: 0 });
      const sprite = Object.assign(new THREE.Sprite(material), { name: 'vent-haze' });
      sprite.position.set(p.x, 0.5, p.z);
      marbles.add(sprite);
      return { sprite, k: j / HAZE_PER_VENT + v * 0.17 };
    });
  });
  document.body.dataset.haze = String(hazes.length); // read by the e2e tests
  discs.forEach((disc, i) => {
    const [q, r] = BOARD_CELLS[i]!;
    const side = board[i] ?? VANISHED; // ring 5 is off a board of 61 cells (#564)
    disc.visible = side !== VANISHED; // a vanished cell is a hole: no disc, no marble
    if (side === VANISHED) return;
    const p = axialTo3D(q, r);
    const plies = left.get(i) ?? 0;
    disc.material = steel;
    if (plies > 0 && crackDecal) {
      const decal = new THREE.Mesh(crackGeometry, crackMaterial); // on the disc's top face, under the ticks
      decal.position.set(p.x, 0.003, p.z);
      marbles.add(decal);
      crackDecals.push([q, r]);
    }
    const target = targets.find(({ cell: [tq, tr] }) => tq === q && tr === r);
    if (target) {
      const ring = new THREE.Mesh(targetRingGeometry, ringMaterial);
      const arrow = new THREE.Mesh(arrowGeometry, targetMaterial);
      ring.rotation.x = -Math.PI / 2; // flat on the cell, facing up
      arrow.rotation.set(-Math.PI / 2, arrowYaw(target.dir), 0, 'YXZ');
      ring.position.set(p.x, 0.005, p.z);
      arrow.position.set(p.x, 0.005, p.z);
      marbles.add(ring, arrow);
    }
    for (const dx of tickOffsets(plies)) {
      const tick = new THREE.Mesh(tickGeometry, tickMaterial); // on the front edge, clear of the marble
      tick.position.set(p.x + dx, 0.01, p.z + 0.39);
      marbles.add(tick);
    }
    if (side === 0) return;
    if (side === OVERSEER_CODE) {
      if (overseerBlown === engine) return;
      const pedestal = new THREE.Mesh(pedestalGeometry, pedestalMaterial);
      overseerPedestal = pedestal;
      const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
      eye.position.y = 0.86;
      pedestal.add(eye);
      pedestal.position.set(p.x, 0, p.z);
      marbles.add(pedestal);
      overseerDrawn.overseer = [q, r];
      return;
    }
    if (side === CORE_CODE) overseerDrawn.cores.push([q, r]);
    const marble = side === CORE_CODE ? coreMesh() : marbleMesh(side);
    if (converted.some(([cq, cr]) => cq === q && cr === r)) convert(marble);
    marble.position.set(p.x, 0.36, p.z);
    turnMarble(marble, turnAt(i));
    marbles.add(marble);
    onMarble(i, marble);
    if (ringed.some(([sq, sr]) => sq === q && sr === r)) {
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(p.x, 0.02, p.z);
      marbles.add(ring);
      marble.position.y = 0.5;
    }
  });
  for (const { cell, army } of armies) {
    const p = axialTo3D(cell[0], cell[1]);
    const glyph = new THREE.Mesh(armyGlyphs[army], paleMaterial);
    glyph.position.set(p.x, 0.76, p.z);
    if (army === 1) glyph.rotation.x = Math.PI / 2; // the ring lies flat, read from above
    marbles.add(glyph);
    onMarble(cellIndex(cell[0], cell[1]), glyph);
    if (army !== next) continue;
    const ring = new THREE.Mesh(outlineGeometry, paleMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(p.x, 0.36, p.z);
    marbles.add(ring);
    onMarble(cellIndex(cell[0], cell[1]), ring);
  }
  if (martyr) {
    const p = axialTo3D(martyr[0], martyr[1]);
    const ring = Object.assign(new THREE.Mesh(outlineGeometry, emberMaterial), { name: 'martyr-ring' });
    ring.rotation.x = Math.PI / 2;
    ring.position.set(p.x, 0.36, p.z);
    const glyph = Object.assign(new THREE.Mesh(martyrGlyphGeometry, emberMaterial), { name: 'martyr-glyph' });
    glyph.position.set(p.x, 0.85, p.z);
    marbles.add(ring, glyph);
    onMarble(cellIndex(martyr[0], martyr[1]), ring);
    onMarble(cellIndex(martyr[0], martyr[1]), glyph);
  }
  document.body.dataset.martyr = martyr ? martyr.join(',') : ''; // read by the e2e tests
  polesDrawn = poles.flatMap((sign, i) => {
    if (sign === 0) return [];
    const [q, r] = BOARD_CELLS[i]!;
    const p = axialTo3D(q, r);
    const glyph = Object.assign(new THREE.Sprite(glyphMaterials.get(sign)), { renderOrder: 2 });
    glyph.position.set(p.x, 0.86, p.z);
    glyph.scale.setScalar(0.34);
    marbles.add(glyph);
    onMarble(i, glyph);
    const isFresh = fresh.some(([fq, fr]) => fq === q && fr === r);
    if (isFresh) {
      const ring = new THREE.Mesh(outlineGeometry, paleMaterial);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(p.x, 0.36, p.z);
      marbles.add(ring);
      onMarble(i, ring);
    }
    return [{ cell: [q, r] as Axial, sign, fresh: isFresh }];
  });
  if (announceDrawn) {
    const { cell, sign } = announceDrawn;
    const p = axialTo3D(...cell);
    const indicator = Object.assign(new THREE.Sprite(announceMaterials.get(sign)), { renderOrder: 2, name: 'announce' });
    indicator.position.set(p.x, 1.3, p.z); // over the glyph disc of a marble that will flip
    indicator.scale.setScalar(0.5);
    marbles.add(indicator);
    onMarble(cellIndex(...cell), indicator);
    const ring = Object.assign(new THREE.Mesh(outlineGeometry, announceRingMaterial), { name: 'announce-ring' });
    ring.rotation.x = Math.PI / 2;
    ring.position.set(p.x, 0.36, p.z);
    marbles.add(ring);
    onMarble(cellIndex(...cell), ring);
    blinking = { materials: fadable(marbleAt.get(cellIndex(...cell))![0]!), ring };
  }
  eggsDrawn = eggs.map(({ cell: [q, r], left }) => {
    const p = axialTo3D(q, r);
    const egg = Object.assign(new THREE.Mesh(eggGeometry, eggMaterial), { name: 'egg', castShadow: true });
    egg.position.set(p.x, 0, p.z);
    const counter = Object.assign(new THREE.Sprite(counterMaterials[left - 1]), { renderOrder: 2 });
    counter.position.set(p.x, 0.95, p.z);
    counter.scale.setScalar(0.42);
    marbles.add(egg, counter);
    if (left === 1) {
      const glow = Object.assign(new THREE.Mesh(eggGlowGeometry, eggGlowMaterial), { name: 'egg-glow' });
      glow.position.set(p.x, 0.004, p.z);
      marbles.add(glow);
    }
    return { cell: [q, r], left, glow: left === 1 };
  });
  for (const train of trainsShown) drawTrack(train);
  beltsShown = engine instanceof Encounter ? parseBelts(engine.belts()) : null;
  beltRibs = beltsShown ? drawBelts(beltsShown) : [];
  pulsarShown = engine instanceof Encounter ? parsePulsar(engine.pulsar()) : null;
  pulsarCores = pulsarShown ? drawPulsars(pulsarShown) : [];
  ripples = pulsarShown && rippling(pulsarShown) ? Array.from({ length: reducedMotion() ? 1 : RIPPLES }, (_, k) => {
    const { x, z } = pulsarSpot(pulsarShown!.id);
    const ring = Object.assign(new THREE.Mesh(rippleGeometry, rippleMaterials[k]), { name: 'pulsar-ripple' });
    ring.position.set(x, 0.05, z);
    marbles.add(ring);
    return ring;
  }) : [];
  document.body.dataset.ripples = String(ripples.length); // read by the e2e tests
  firedShown = engine instanceof Encounter ? parseFired(engine.ballast_fired()) : null;
  for (const [q, r] of firedShown?.cells ?? []) {
    const { x, z } = axialTo3D(q, r);
    const ring = Object.assign(new THREE.Mesh(firedGeometry, firedMaterial), { name: 'ballast-fired' });
    ring.position.set(x, 0.06, z);
    marbles.add(ring);
  }
  document.body.dataset.fired = String(firedShown?.cells.length ?? 0); // read by the e2e tests
  // The charges belong to the board after the hook: while a move slides to the board before it, none is drawn.
  drawUnstable(engine instanceof Encounter ? parseCore(engine.unstable()) : null, showing() || !(engine instanceof Encounter) ? [] : parseCharges(engine.charges()));
  const taunt = engine instanceof Encounter ? tauntIndex(engine.turns_left()) : -1; // the Overseer's line of this 20 %
  if (tauntSaid.game !== engine || tauntSaid.index !== taunt) {
    tauntSaid = { game: engine, index: taunt };
    if (taunt >= 0) say({ text: TAUNTS[taunt]!, hold: TAUNT_HOLD_MS, angry: false });
    else {
      speech = null;
      bubbleBox.hidden = true;
    }
  }
  tellSound('crack', cracks);
  tellSound('choir', ARMY_NAMES[next] ? [next] : []);
  // The drones follow how tense the game is (#439): the player's marbles a push could eject, the boss phase.
  const weights = engine instanceof Encounter && !showing() ? parseCharges(engine.charges()) : []; // the Core's weighted push
  sfx.setTension(tensionLevel(rimDanger(board, glassOf(), weights), engine instanceof Encounter ? engine.phase() : 0));
  document.body.dataset.armies = String(armies.length); // read by the e2e tests
  document.body.dataset.nextArmy = ARMY_NAMES[next] ?? '';
  document.body.dataset.converted = String(converted.length); // read by the e2e tests
  document.body.dataset.cracks = String(cracks.length);
  document.body.dataset.eggs = String(eggs.length);
  document.body.dataset.eggCounters = eggs.map((e) => e.left).join(',');
  document.body.dataset.trains = String(trainsShown.length);
  document.body.dataset.trainCounters = trainsShown.map((t) => t.left).join(',');
  document.body.dataset.beltCounter = beltsShown ? String(beltsShown.left) : '';
  document.body.dataset.beltDirs = beltsShown ? beltsShown.belts.map((b) => b.dir).join(',') : '';
  document.body.dataset.beltStrikes = beltsShown ? beltsShown.belts.map((b) => b.strike).join(',') : '';
  document.body.dataset.pulseCounter = pulsarShown && charging(pulsarShown) ? String(pulsarShown.left) : '';
  document.body.dataset.vanished = String(Array.from(board).filter((v) => v === VANISHED).length);
  const enemy = 3 - glassOf(); // the core dims a step per player marble the enemy ejected (#506)
  coreMaterial.opacity = coreLevel(engine.ejected(enemy), engine.win_ejections(enemy));
  document.body.dataset.core = coreMaterial.opacity.toFixed(2); // read by the e2e tests
  hud();
  refreshGhosts(moves);
}

/** The rails and sleepers under the line of `train`, out past both edges onto the deck. */
function railsOf(train: Train): THREE.Group {
  const rails = new THREE.Group();
  const span = railSpan(train);
  for (const side of [-0.22, 0.22]) {
    const rail = Object.assign(new THREE.Mesh(railGeometry, railMaterial), { name: 'rail' });
    rail.scale.x = span.length;
    rail.rotation.y = span.yaw;
    rail.position.set(span.x - Math.sin(span.yaw) * side, 0.02, span.z - Math.cos(span.yaw) * side);
    rails.add(rail);
  }
  for (let d = 0.25 - span.length / 2; d < span.length / 2; d += 0.5) {
    const sleeper = new THREE.Mesh(sleeperGeometry, sleeperMaterial);
    sleeper.rotation.y = span.yaw;
    sleeper.position.set(span.x + Math.cos(span.yaw) * d, 0.008, span.z - Math.sin(span.yaw) * d);
    rails.add(sleeper);
  }
  return rails;
}

/** The tell of an announced train: its rails, its chevrons, and its counter above the entry edge. */
function drawTrack(train: Train): void {
  marbles.add(railsOf(train));
  for (const spot of chevronSpots(train)) {
    const chevron = Object.assign(new THREE.Mesh(chevronGeometry, chevronMaterial), { name: spot.edge ? 'edge-chevron' : 'chevron' });
    chevron.rotation.y = spot.yaw;
    chevron.position.set(spot.x, 0.03, spot.z);
    chevron.scale.setScalar(spot.edge ? 1.5 : 1);
    marbles.add(chevron);
  }
  const entry = chevronSpots(train)[0]!;
  const counter = Object.assign(new THREE.Sprite(counterMaterials[train.left - 1]), { renderOrder: 2, name: 'train-counter' });
  counter.position.set(entry.x, 0.75, entry.z);
  counter.scale.setScalar(0.5);
  marbles.add(counter);
}

/** The belts of an Assembly Line fight: a strip, two rollers, the plates of the strike slots (the announced one red under
 * its press), the chevrons of a running belt and the centre belt's counter. Returns the ribs to scroll. */
function drawBelts(b: Belts): { belt: Belt; ribs: THREE.Mesh[] }[] {
  const counter = Object.assign(new THREE.Sprite(counterMaterials[b.left - 1]), { renderOrder: 2, name: 'belt-counter' });
  const at = beltCounterSpot(b.belts[0]!);
  counter.position.set(at.x, at.y, at.z);
  counter.scale.setScalar(0.5);
  marbles.add(counter);
  return b.belts.map((belt) => {
    const span = beltSpan(belt);
    const strip = Object.assign(new THREE.Mesh(beltGeometry, beltMaterial), { name: 'belt' });
    strip.scale.x = span.length;
    strip.position.set(span.x, 0.02, span.z);
    marbles.add(strip);
    for (const { x, z } of rollerSpots(belt)) {
      const roller = Object.assign(new THREE.Mesh(rollerGeometry, railMaterial), { name: 'belt-roller' });
      roller.position.set(x, 0.12, z);
      marbles.add(roller);
    }
    const ribs = Array.from({ length: span.length / RIB_SPACING }, () => Object.assign(new THREE.Mesh(ribGeometry, ribMaterial), { name: 'belt-rib' }));
    marbles.add(...ribs);
    for (const { x, z, strike } of plateSpots(belt)) {
      const plate = Object.assign(new THREE.Mesh(plateGeometry, strike ? strikeMaterial : plateMaterial), { name: strike ? 'belt-strike' : 'belt-plate' });
      plate.position.set(x, 0.06, z);
      marbles.add(plate);
      if (!strike) continue;
      const press = Object.assign(new THREE.Mesh(pressGeometry, pressMaterial), { name: 'belt-press', castShadow: true });
      press.position.set(x, slamAt(0, false).y, z);
      marbles.add(press);
    }
    for (const { x, z, dir } of beltChevrons(belt)) {
      const chevron = Object.assign(new THREE.Mesh(chevronGeometry, chevronMaterial), { name: 'belt-chevron' });
      chevron.rotation.y = arrowYaw(dir);
      chevron.position.set(x, 0.08, z);
      marbles.add(chevron);
    }
    return { belt, ribs };
  });
}

/** Scrolls the ribs of the running belts and swells the red of the announced slot. */
function animateBelts(now: number): void {
  const reduced = reducedMotion();
  for (const { belt, ribs } of beltRibs) {
    const { x, z } = beltSpan(belt);
    ribOffsets(belt, now, reduced).forEach((offset, k) => ribs[k]!.position.set(x + offset, 0.048, z));
  }
  strikeMaterial.emissiveIntensity = 0.8 * strikeBlink(now, reduced);
}

/** The six pulsars of a Pulsar fight, and the charge of the one whose pulse is 2 turns or less away: its core glows,
 * its counter shows beside it and a chevron lies before each of its lines. Returns the cores, which spin. */
function drawPulsars(next: Pulsar): THREE.Mesh[] {
  const ballast = fight?.id === 'ballast'; // only the pulsar of the announced pulse, and none of the radius 4 chevrons (#838)
  return (ballast ? [next.id] : [0, 1, 2, 3, 4, 5]).map((id) => {
    const spot = pulsarSpot(id);
    const lit = id === next.id && charging(next);
    const model = Object.assign(new THREE.Group(), { name: lit ? 'pulsar-charging' : 'pulsar' });
    PULSAR_PARTS.forEach((part, i) => {
      const material = lit && part.type === 'core' ? chargeMaterial : pulsarMaterials[i];
      const mesh = Object.assign(new THREE.Mesh(pulsarGeometries[i], material), { name: part.id, castShadow: true });
      mesh.position.set(...part.position);
      model.add(mesh);
    });
    model.position.set(spot.x, 0, spot.z);
    model.rotation.y = spot.yaw;
    marbles.add(model);
    if (lit) {
      const counter = Object.assign(new THREE.Sprite(counterMaterials[next.left - 1]), { renderOrder: 2, name: 'pulse-counter' });
      const at = counterSpot(id);
      counter.position.set(at.x, at.y, at.z);
      counter.scale.setScalar(PULSE_COUNTER_SIZE);
      marbles.add(counter);
      for (const c of ballast ? [] : pulseChevrons(id)) {
        const chevron = Object.assign(new THREE.Mesh(chevronGeometry, chevronMaterial), { name: 'pulse-chevron' });
        chevron.rotation.y = c.yaw;
        chevron.position.set(c.x, 0.03, c.z);
        chevron.scale.setScalar(1.5);
        marbles.add(chevron);
      }
    }
    return model.getObjectByName('pulsar-core') as THREE.Mesh;
  });
}

/** Starts the pass of each train the move let through: the freight train runs its line, and each marble that sat on it
 * after the move falls off with the ejection effect when the train reaches it. */
function startPasses(before: number[], mv: Move, reduced: boolean): void {
  if (!(engine instanceof Encounter)) return;
  for (const train of passedTrains(trainsShown, parseTrains(engine.trains()))) {
    const [model, rails] = [trainModel(), railsOf(train)];
    scene.add(model, rails);
    const pass: Passing = { train, model, rails, start: performance.now(), skipped: false };
    drawPass(pass, 0);
    passing.push(pass);
    for (const { cell, side, at } of knockedMarbles(before, mv, train)) {
      const mesh = marbleMesh(side);
      turnMarble(mesh, turnAt(cellIndex(...cell)));
      startEjection(mesh, ejectTrack(cell, train.dir, reduced), scene, reachMs(train, at, reduced));
    }
  }
  document.body.dataset.passing = String(passing.length); // read by the e2e tests
}

/** Draws a passing train `elapsedMs` into its pass, true once it is over. */
function drawPass(p: Passing, elapsedMs: number): boolean {
  const at = trainAt(p.train, p.skipped ? Infinity : elapsedMs, reducedMotion());
  p.model.position.set(at.x, 0, at.z);
  p.model.rotation.y = at.yaw;
  return at.done;
}

function animatePasses(now: number): void {
  for (const p of passing.slice()) {
    if (!drawPass(p, now - p.start)) continue;
    scene.remove(p.model, p.rails);
    passing.splice(passing.indexOf(p), 1);
    document.body.dataset.passing = String(passing.length);
  }
}


function refreshGhosts(moves: ReturnType<typeof parseMoves>): void {
  if (royale) return; // no ghost over the arena
  const mv = keyDir >= 0 ? moveFor(moves, selected, keyDir) : hover ? moveForClick(moves, selected, hover) : null;
  const record = mv ? encodeMove(mv) : hint.shown(here()); // the hovered move, else the hint (#192)
  const list = ghostMarbles(history, record, makeGame);
  if (record && engine instanceof Encounter) {
    // The tell: the boss reply announced for the hovered move, drawn on the position after it.
    const reply = Array.from(engine.tell_move(Int32Array.from(record)));
    if (reply.length) list.push(...ghostMarbles([...history, record], reply, makeGame));
  }
  ghosts.clear();
  for (const { cell, side } of list) {
    const p = axialTo3D(cell[0], cell[1]);
    const marble = marbleMesh(side, ghostMaterials, ghostCore);
    marble.position.set(p.x, 0.36, p.z);
    ghosts.add(marble);
  }
  document.body.dataset.ghosts = String(list.length);
  const flips = engine instanceof Encounter ? previewFlips(history, record, makeGame as () => Encounter) : [];
  for (const [q, r] of flips) {
    const p = axialTo3D(q, r);
    const ring = new THREE.Mesh(outlineGeometry, paleMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(p.x, 0.36, p.z);
    const glyph = new THREE.Mesh(glyphGeometry, paleMaterial);
    glyph.position.set(p.x, 0.85, p.z);
    ghosts.add(ring, glyph);
  }
  tellSound('flip', flips);
  document.body.dataset.flips = String(flips.length); // read by the e2e tests
  if (flips.length !== exposed) {
    exposed = flips.length;
    hud();
  }
}

// The guards of a move input: the game is over, a bot is thinking, a slide is running, or it is not our turn.
// A click waits for the slide (`retry`), a key is dropped.
function blocked(retry: () => void): boolean {
  if (replaying) return true; // view only (#793)
  if (engine.status() !== 0) return true; // over: no move, no selection (#282)
  if (thinking || online?.role === 'spectator') return true;
  if (sliding()) return whenSettled(retry), true; // the next move waits for the slide
  if (online && !online.ourTurn()) return true; // not our turn: our colour in versus, our human ply in co-op
  if (online && !online.canPlay()) return hud(' · waiting for opponent'), true; // a move would never reach them
  return false;
}

function play(mv: Move): void {
  const record = encodeMove(mv);
  playMove(record);
  selected = [];
  keyDir = -1;
  void online?.send(record);
  if (online && fight) void answerBoss(true); // co-op: our move's boss reply
}

function click(q: number, r: number): void {
  if (hub) return walk([q, r]);
  if (royale) return pickRoyale(q, r);
  if (blocked(() => click(q, r))) return;
  const side = engine.board()[cellIndex(q, r)];
  if (side === engine.to_move()) {
    selected = toggleSelection(selected, [q, r]);
    keyDir = -1;
    hint.clear(); // a new selection
  } else {
    // The engine is the only judge: a click that is not a legal move changes nothing.
    const mv = moveForClick(parseMoves(engine.legal_moves()), selected, [q, r]);
    if (mv) play(mv);
  }
  refresh();
  void botTurn();
}

const raycaster = new THREE.Raycaster();
function aim(e: PointerEvent | MouseEvent): void {
  raycaster.setFromCamera(
    new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1),
    camera,
  );
}
function cellAt(e: PointerEvent | MouseEvent): Axial | null {
  aim(e);
  const [shown, cells] = royale ? [arenaDiscs, ARENA] : [discs, BOARD_CELLS];
  const hit = raycaster.intersectObjects(shown.filter((disc) => disc.visible))[0]; // no cell where no disc is drawn
  return hit ? cells[shown.indexOf(hit.object as THREE.Mesh)]! : null;
}
const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
// The point of the board plane under the pointer, null when the ray never meets it (the horizon).
function groundAt(e: PointerEvent): THREE.Vector3 | null {
  aim(e);
  return raycaster.ray.intersectPlane(ground, new THREE.Vector3());
}
const ours = (cell: Axial | null): cell is Axial => !!cell && engine.board()[cellIndex(cell[0], cell[1])] === engine.to_move();
function onProp(e: PointerEvent, prop: THREE.Mesh): boolean {
  aim(e);
  return raycaster.intersectObject(prop).length > 0;
}

// One pointer that stays put is a click, one that moves is an orbit, two pointers are a pinch.
const canvas = renderer.domElement;
const pointers = new Map<number, { x: number; y: number }>();
let press: { x: number; y: number; drag: boolean } | null = null;
let marbleDrag: Axial[] | null = null; // the marbles a drag that began on one of ours has passed over (#794)
const span = (): number => {
  const [a, b] = [...pointers.values()];
  return Math.hypot(a!.x - b!.x, a!.y - b!.y);
};

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) {
    press = { x: e.clientX, y: e.clientY, drag: false };
    // A press on one of our marbles starts a selection by drag, anywhere else it is the orbit (#794).
    const cell = hub || royale || reading || freeCam.active ? null : cellAt(e);
    marbleDrag = ours(cell) && !blocked(() => {}) ? [cell] : null;
  } else {
    press!.drag = true; // a second finger never selects (press is set while any pointer is down)
    marbleDrag = null;
  }
});

canvas.addEventListener('pointermove', (e) => {
  const last = pointers.get(e.pointerId);
  if (last && press) {
    if (freeCam.active) {
      freeCam.onPointerMove(e.clientX - last.x, e.clientY - last.y);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      updateFreeCamCamera();
      return;
    }
    const prevSpan = pointers.size === 2 ? span() : 0;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) view = zoom(view, pinchScale(prevSpan, span()));
    else if (marbleDrag && (press.drag || isDrag(e.clientX - press.x, e.clientY - press.y))) {
      press.drag = true;
      const cell = cellAt(e);
      const path = ours(cell) ? extendPath(marbleDrag, cell) : marbleDrag;
      if (path !== selected) {
        selected = marbleDrag = path;
        keyDir = -1;
        hint.clear(); // a new selection
        refresh();
      }
      return;
    } else if (press.drag || isDrag(e.clientX - press.x, e.clientY - press.y)) {
      press.drag = true;
      view = orbit(view, e.clientX - last.x, e.clientY - last.y);
    }
    applyView();
    return;
  }
  if (hub) {
    if (hub.onPointerMove(cellAt(e))) hud();
    return;
  }
  const next = cellAt(e);
  if (next === hover) return;
  hover = next;
  refreshGhosts(parseMoves(engine.legal_moves()));
});

function release(e: PointerEvent): void {
  const wasClick = e.type === 'pointerup' && press && !press.drag && pointers.size === 1;
  const dropped = e.type === 'pointerup' && marbleDrag && press!.drag && pointers.size === 1;
  pointers.delete(e.pointerId);
  if (pointers.size === 0) press = marbleDrag = null;
  if (dropped) return dropMarbles(e);
  if (!wasClick) return;
  if (reading) {
    if (onProp(e, consoleScreen)) turnReader(1);
    else leaveReader();
    return;
  }
  const cell = cellAt(e);
  if (cell) click(cell[0], cell[1]);
  else if (royale && raycaster.intersectObjects(arenaDiscs).length) return; // the hole (#610): no prop behind it
  else if (onProp(e, consoleScreen)) openReader();
  else if (onProp(e, recorder)) playLog(logOf(deck)); // the deck's recorder prop (#517)
}
// The release of a drag over our marbles plays the move of the group toward the nearest direction; no legal move: nothing.
function dropMarbles(e: PointerEvent): void {
  const at = groundAt(e);
  const dir = at ? releaseDir(selected, at.x, at.z) : null;
  const mv = dir === null ? null : moveFor(parseMoves(engine.legal_moves()), selected, dir);
  if (!mv) return;
  play(mv);
  refresh();
  void botTurn();
}
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);

// Keyboard play (#738), only while the canvas has focus: Tab and Shift+Tab walk the legal groups (past the ends the
// focus moves on), Q W E A S D pick the direction, Enter plays it, Escape backs out one step.
canvas.tabIndex = 0;
canvas.setAttribute('aria-label', 'Abalone board');
canvas.addEventListener('keydown', (e) => {
  if (hub || royale || reading || e.altKey || e.ctrlKey || e.metaKey || blocked(() => {})) return;
  const dir = KEY_DIRS[e.key.toLowerCase()];
  const moves = parseMoves(engine.legal_moves());
  if (e.key === 'Tab') {
    const group = nextGroup(moves, selected, e.shiftKey ? -1 : 1);
    if (group) e.preventDefault();
    selected = group ?? [];
    keyDir = -1;
    hint.clear();
  } else if (dir !== undefined) {
    e.preventDefault();
    keyDir = dir;
  } else if (e.key === 'Enter') {
    const mv = moveFor(moves, selected, keyDir);
    if (!mv) return;
    e.preventDefault();
    play(mv);
    refresh();
    return void botTurn();
  } else if (e.key === 'Escape' && (keyDir >= 0 || selected.length > 0)) {
    e.preventDefault();
    if (keyDir >= 0) keyDir = -1;
    else selected = [];
  } else return;
  refresh();
  hud(` · ${announce(moves, selected, keyDir)}`);
});
canvas.addEventListener('pointerleave', () => {
  if (hub && hub.onPointerLeave()) {
    hud();
  }
});

canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    view = zoom(view, wheelScale(e.deltaY));
    applyView();
  },
  { passive: false },
);

document.getElementById('reset-view')!.addEventListener('click', () => {
  if (freeCam.active) toggleFreeCam(false);
  view = fitted = fightView();
  applyView();
});
(document.getElementById('reset-view') as HTMLButtonElement).disabled = false; // listener ready (#146)

const freeCamBtn = document.getElementById('free-cam') as HTMLButtonElement;
freeCamBtn.addEventListener('click', () => toggleFreeCam());
freeCamBtn.disabled = false;

addEventListener('resize', () => {
  if (view === fitted) view = fitted = fightView();
  frameCamera();
  renderer.setPixelRatio(renderPixelRatio(devicePixelRatio, navigator.webdriver, tier));
  renderer.setSize(innerWidth, innerHeight);
  applyView(); // the reader fits the screen to the new window
});

// Used by the browser checks to click a cell by its axial coordinates.
(window as unknown as Record<string, unknown>).__cellToScreen = (q: number, r: number) => {
  return sceneRenderer.cellToScreen(q, r, innerWidth, innerHeight, royale ? ARENA_SCALE : 1);
};
// Used by the browser checks to see the console screen (#512) and the recorder (#517) on the window: the box around its
// corners, in pixels.
function rectOfPoints(points: THREE.Vector3[]): { x: number; y: number; width: number; height: number } {
  camera.updateMatrixWorld();
  const xs: number[] = [];
  const ys: number[] = [];
  for (const p of points) {
    const v = p.clone().project(camera);
    xs.push(((v.x + 1) / 2) * innerWidth);
    ys.push(((1 - v.y) / 2) * innerHeight);
  }
  const [left, top] = [Math.min(...xs), Math.min(...ys)];
  return { x: left, y: top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
}
function rectOf(prop: THREE.Mesh): { x: number; y: number; width: number; height: number } {
  const box = new THREE.Box3().setFromObject(prop);
  const corners: THREE.Vector3[] = [];
  for (const x of [box.min.x, box.max.x])
    for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
  return rectOfPoints(corners);
}
(window as unknown as Record<string, unknown>).__consoleRect = () => rectOf(consoleScreen);
(window as unknown as Record<string, unknown>).__recorderRect = () => rectOf(recorder);
// Used by the browser checks to see The Pulsar on the window (#691): the box round the vertices of each of the six
// pulsars, its glowing core included, and round the counter it shows when it charges, the sprite facing the camera, in
// pixels.
(window as unknown as Record<string, unknown>).__pulsarRects = () => {
  camera.updateMatrixWorld();
  marbles.updateMatrixWorld(true);
  const vertices = (model: THREE.Object3D): THREE.Vector3[] =>
    (model.children as THREE.Mesh[]).flatMap(({ geometry, matrixWorld }) => {
      const at = geometry.getAttribute('position');
      return Array.from({ length: at.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(at, i).applyMatrix4(matrixWorld));
    });
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(PULSE_COUNTER_SIZE / 2);
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).multiplyScalar(PULSE_COUNTER_SIZE / 2);
  return marbles.children
    .filter((c) => c.name === 'pulsar' || c.name === 'pulsar-charging')
    .map((model, id) => {
      const { x, y, z } = counterSpot(id);
      const centre = new THREE.Vector3(x, y, z);
      const square = [1, -1].flatMap((i) => [1, -1].map((j) => centre.clone().addScaledVector(right, i).addScaledVector(up, j)));
      return { pulsar: rectOfPoints(vertices(model)), counter: rectOfPoints(square) };
    });
};
// Used by the browser checks to play their setup plies: the same click, without the raycast and the frames of a mouse click.
(window as unknown as Record<string, unknown>).__click = (q: number, r: number) => click(q, r);

// Used by the browser checks to read the turn of the marble on a cell (#345, #346), null when it has none.
(window as unknown as Record<string, unknown>).__marbleTurn = (q: number, r: number) =>
  marbleAt.get(cellIndex(q, r))?.[0]?.quaternion.toArray() ?? null;
// Used by the browser checks to list the marbles that wear a boss accent (#507): their cell and the accent's name.
const accentNames = new Set(Object.values(ACCENTS).map((a) => a.name)); // not the parts of a converted marble (#508)
(window as unknown as Record<string, unknown>).__accents = () =>
  [...marbleAt].flatMap(([i, [marble]]) =>
    marble!.children.filter((c) => accentNames.has(c.name)).map((c) => ({ cell: BOARD_CELLS[i], accent: c.name })),
  );
// Used by the browser checks to see the look of The Chaplain's converted marbles (#508): the parts each one holds.
(window as unknown as Record<string, unknown>).__convertedLooks = () =>
  [...marbleAt]
    .filter(([, [marble]]) => (marble as THREE.Mesh).material === unseen)
    .map(([i, [marble]]) => ({ cell: BOARD_CELLS[i], parts: marble!.children.map((c) => c.name) }));

// Used by the browser checks to count the phase notches drawn on the frame and see the threshold glyph (#356).
(window as unknown as Record<string, unknown>).__notches = () => {
  const drawn = notches.parent === scene ? notches.children.map((m) => (m as THREE.Mesh).geometry) : [];
  const lit = drawn.filter((g) => g === scratchGeometry).length;
  return { lit, dark: drawn.filter((g) => g === grooveGeometry).length - lit, glyph: drawn.includes(thresholdMarkGeometry) };
};
// Used by the browser checks to count the tally marks drawn on the frame, per side, side 1 first (#389).
(window as unknown as Record<string, unknown>).__tally = () =>
  tallies.map((group) => {
    const drawn = group.parent === scene ? group.children.map((m) => (m as THREE.Mesh).geometry) : [];
    return { marked: drawn.filter((g) => g === scratchGeometry).length, slots: drawn.filter((g) => g === grooveGeometry).length };
  });
// Used by the browser checks to read the frame's size and holes, and that it is drawn (#292).
(window as unknown as Record<string, unknown>).__frame = () => ({
  radius: frame?.radius,
  holes: frame?.holes.length,
  drawn: [plate, rim.near, rim.far].every((m) => m.visible && m.parent === scene && m.geometry.attributes.position!.count > 0),
  lit: { near: rim.near.material.emissive.getHex(), far: rim.far.material.emissive.getHex() }, // #300
});
// Used by the browser checks and tests to mount the high-fidelity PBR spaceship bay (#648).
(window as unknown as Record<string, unknown>).__mountBay = mountBay;
(window as unknown as Record<string, unknown>).__toggleFreeCam = (enabled?: boolean) => toggleFreeCam(enabled);
(window as unknown as Record<string, unknown>).__freeCamActive = () => freeCam.active;
(window as unknown as Record<string, unknown>).__renderMode = () => renderMode;
(window as unknown as Record<string, unknown>).__setRenderMode = (mode: RenderMode) => setRenderMode(mode);
(window as unknown as Record<string, unknown>).__cycleRenderMode = () => cycleRenderMode();
(window as unknown as Record<string, unknown>).__clayActive = () => renderMode === 'clay';
(window as unknown as Record<string, unknown>).__wireframeActive = () => renderMode === 'wireframe';
(window as unknown as Record<string, unknown>).__toggleWireframe = (enabled?: boolean) => {
  const next = enabled ?? renderMode !== 'wireframe';
  setRenderMode(next ? 'wireframe' : 'normal');
};

// Used by the browser checks to see the ejected marbles as drawn `ms` into their effect (the next
// frame draws them at the real time again).
(window as unknown as Record<string, unknown>).__ejectAt = (ms: number) =>
  ejecting.map((e) => {
    drawEjection(e, ms);
    const material = e.mesh.material as THREE.Material;
    return {
      along: e.holder.scale.x,
      across: e.holder.scale.y,
      roll: -e.tumble.rotation.z,
      twist: e.tumble.rotation.x,
      drop: 0.36 - e.holder.position.y,
      opacity: material.opacity / material.userData.opacity, // the fade, the glass's own see-through aside
      turn: e.mesh.getWorldQuaternion(new THREE.Quaternion()).toArray(),
    };
  });

// Used by the browser checks to see the spatter `ms` into its effect in screen space (px), beside what it must not
// cover: each cell disc, each marble on the board, and the frame's outer edge (#278). Draws nothing.
(window as unknown as Record<string, unknown>).__bloodAt = (ms: number) => {
  camera.updateMatrixWorld();
  const px = (x: number, y: number, z: number) => {
    const v = new THREE.Vector3(x, y, z).project(camera);
    return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight };
  };
  const boxOf = (pts: { x: number; y: number }[]) => ({
    x0: Math.min(...pts.map((p) => p.x)),
    y0: Math.min(...pts.map((p) => p.y)),
    x1: Math.max(...pts.map((p) => p.x)),
    y1: Math.max(...pts.map((p) => p.y)),
  });
  const ring = (cx: number, cz: number, radius: number, y: number) =>
    Array.from({ length: 16 }, (_, k) => px(cx + Math.cos((k * Math.PI) / 8) * radius, y, cz + Math.sin((k * Math.PI) / 8) * radius));
  const b = bleeding.at(-1);
  const drops = b ? bloodAt(b.from, b.dir, ms, false) : [];
  const stain = b ? bloodStainAt(b.from, b.dir, ms, false) : null;
  const spray = [...drops.map((d) => px(d.x, d.y, d.z)), ...(stain ? ring(stain.x, stain.z, stain.radius, 0.01) : [])];
  const cells = CELLS.map(([q, r]) => {
    const c = axialTo3D(q, r);
    return boxOf(ring(c.x, c.z, 0.46, 0.05));
  });
  const boardMarbles = marbles.children.map((o) => {
    const bb = new THREE.Box3().setFromObject(o, true); // precise: a turned marble's box is not its turned bounding cube (#346)
    const corners = [bb.min.x, bb.max.x].flatMap((x) => [bb.min.y, bb.max.y].flatMap((y) => [bb.min.z, bb.max.z].map((z) => px(x, y, z))));
    return boxOf(corners);
  });
  return {
    spray: spray.length > 0 ? boxOf(spray) : null,
    drops: drops.length,
    cells,
    marbles: boardMarbles,
    frame: frame!.outer.map((p) => px(p.x, 0, p.z)), // drawn by the first refresh, before any hook can run
  };
};

// Used by the browser checks to see whether the audio context exists ('none') and runs.
(window as unknown as Record<string, unknown>).__audio = () => sfx.state;
// The gain of a bus (#438): 0 before a gesture, then its slider's level.
(window as unknown as Record<string, unknown>).__gain = (bus: Bus) => sfx.gain(bus);
// The tension level and the gain of each drone layer (#439).
(window as unknown as Record<string, unknown>).__tension = () => ({ level: sfx.tension, layers: sfx.layers });
// The sound twins of the boss tells played so far (#358).
(window as unknown as Record<string, unknown>).__tellCues = () => tellCues;
// Whether music and ambience are ducked under an audio log (#516).
(window as unknown as Record<string, unknown>).__ducked = () => sfx.ducking;
(window as unknown as Record<string, unknown>).__palette = () => palette;

// Used by the browser checks to count the plies played, bot replies included, and to compare them.
(window as unknown as Record<string, unknown>).__plies = () => history.length;
(window as unknown as Record<string, unknown>).__history = () => history;
// Used by the browser checks to read the boss, seed and daily attempt of the running fight.
(window as unknown as Record<string, unknown>).__fight = () => fight;
(window as unknown as Record<string, unknown>).__view = () => view;

// Used by the browser checks to read the hinted move and the marbles that wear the selection ring (#301).
(window as unknown as Record<string, unknown>).__hint = () => hint.shown(here());
(window as unknown as Record<string, unknown>).__rings = () => ringed;
// Used by the browser checks to read the target cells and the direction of their arrow (#390).
(window as unknown as Record<string, unknown>).__targets = () => targets;
(window as unknown as Record<string, unknown>).__marbles = () => marbles;

// Used by the browser checks to pick a legal move (the boss tests play forward), and to find one that
// exposes a marble to The Chaplain.
(window as unknown as Record<string, unknown>).__legal = () => parseMoves(engine.legal_moves());
(window as unknown as Record<string, unknown>).__preview = (mv: Parameters<typeof encodeMove>[0]) =>
  engine instanceof Encounter ? previewFlips(history, encodeMove(mv), makeGame as () => Encounter) : [];
// Used by the browser checks to see which Choir army moved.
(window as unknown as Record<string, unknown>).__armies = () =>
  engine instanceof Encounter ? parseArmies(engine.armies()) : [];
// Used by the browser checks to find The Hull's cracked cells and the ones drawn with the crack decal (#355).
(window as unknown as Record<string, unknown>).__cracks = () =>
  engine instanceof Encounter ? parseCracks(engine.cracks()) : [];
(window as unknown as Record<string, unknown>).__crackDecals = () => crackDecals;
(window as unknown as Record<string, unknown>).__crackDecalShown = (shown: boolean) => (crackMaterial.visible = shown);
// Used by the browser checks to find The Alien's eggs as drawn: their cell, counter and glow on 1 (#588), and the glow.
(window as unknown as Record<string, unknown>).__eggs = () => eggsDrawn;
(window as unknown as Record<string, unknown>).__eggGlow = () => eggGlowMaterial.opacity;
// Used by the browser checks to find The Rail Yard's trains as drawn (#626): each line, its cells from the entry and
// its counter, and the trains passing now, with where their front is.
(window as unknown as Record<string, unknown>).__trains = () => trainsShown;
(window as unknown as Record<string, unknown>).__passes = () =>
  passing.map((p) => ({ line: p.train.line, x: p.model.position.x, z: p.model.position.z }));
// Used by the browser checks to find The Assembly Line's belts as drawn (#744): each belt's cells, direction, pattern
// scroll and announced strike cell, and the turns left before the centre belt reverses.
(window as unknown as Record<string, unknown>).__belts = () => beltsShown;
// Used by the browser checks to find The Ballast Mind's last borrowed effect as drawn (#838): its code and the ringed cells.
(window as unknown as Record<string, unknown>).__fired = () => firedShown;
// Used by the browser checks to find The Pulsar's next pulse as drawn (#675), and the shockwave of a pulse now.
(window as unknown as Record<string, unknown>).__pulsar = () => pulsarShown && { ...pulsarShown, charging: charging(pulsarShown) };
(window as unknown as Record<string, unknown>).__shock = () =>
  shock && { radius: shock.mesh.scale.x, opacity: shockMaterial.opacity, x: shock.mesh.position.x, z: shock.mesh.position.z };
// Used by the browser checks to find The Unstable Core's marks as drawn (#751): the next events and the charges, and the
// shockwave's slice now.
(window as unknown as Record<string, unknown>).__unstable = () => unstableShown;
(window as unknown as Record<string, unknown>).__sweep = () => sweep && { scale: sweep.mesh.scale.x, opacity: sweepMaterial.opacity };
// Used by the browser checks to find The Magnetizer's polarities as drawn: the cell, the sign and the ring of a fresh one.
(window as unknown as Record<string, unknown>).__polarities = () => polesDrawn;
// Used by the browser checks to find The Overseer as drawn: its cell, the cores and the vents.
(window as unknown as Record<string, unknown>).__overseer = () => overseerDrawn;
// The announced marble and its coming sign as drawn (#671), and the opacity of the glyphs of a spent pair still fading.
(window as unknown as Record<string, unknown>).__announce = () => announceDrawn;
(window as unknown as Record<string, unknown>).__fading = () => fading.map((f) => f.sprite.material.opacity);
// Used by the browser checks to read the shell's heat pulse (#509).
(window as unknown as Record<string, unknown>).__shellPulse = () => scarab.emissiveIntensity;
// Used by the browser checks to hold the pulse `t` seconds into its cycle instead of following the clock (#716).
let pulseHeld: number | null = null;
(window as unknown as Record<string, unknown>).__holdPulse = (t: number) => {
  pulseHeld = t;
};
// Used by the browser checks to find The Chaplain's converted marbles (#326).
(window as unknown as Record<string, unknown>).__blast = () =>
  blast && { shards: blast.shards.length, flash: blastFlashMaterial.opacity, shard: blastShardMaterial.opacity, reduced: blast.reduced };
(window as unknown as Record<string, unknown>).__converted = () =>
  engine instanceof Encounter ? parseCells(engine.converted()) : [];
// Used by the e2e tests to play `turns` boss turns in one call (#349): each player move is the first legal single-marble
// move in `dirs`, the boss replies as botTurn does, and each ply is applied as a catch-up is (afterPlay, not live): no
// slide, ejection or frame per ply, one refresh at the end.
if (navigator.webdriver) {
  (window as unknown as Record<string, unknown>).__playTurns = async (turns: number, dirs: number[]): Promise<number> => {
    if (thinking || online || !worker) return 0;
    thinking = true;
    syncHint();
    await new Promise<void>((done) => whenSettled(done)); // a slide in progress ends first
    const ply = (record: number[]): void => {
      const before = Array.from(engine.board());
      engine.play(Int32Array.from(record));
      afterPlay(before, record, false);
    };
    let played = 0;
    try {
      for (let i = 0; i < turns && engine.status() === 0; i++) {
        const game = engine;
        const mv = parseMoves(engine.legal_moves()).find((m) => m.cells.length === 1 && dirs.includes(m.dir));
        if (!mv) break;
        ply(encodeMove(mv));
        if (engine.status() !== 0) break;
        const reply = await askBot(worker, history, scaleBudget(budget, difficulty), fight ?? undefined, DIFFICULTY_PERCENT[difficulty]);
        if (engine !== game) break; // Retry, New game or an import replaced the game while the bot thought
        ply(reply);
        played++;
      }
    } finally {
      thinking = false;
      refresh();
    }
    return played;
  };
  // Plays the recorded plies of both sides, like a fixture of the core tests: the last one shows its effects (#748).
  (window as unknown as Record<string, unknown>).__playMoves = (records: number[][]): number => {
    records.forEach((record, k) => {
      const before = Array.from(engine.board());
      engine.play(Int32Array.from(record));
      afterPlay(before, record, k === records.length - 1);
    });
    refresh();
    return records.length;
  };
}

// New game (#230): leaves the local game for the start position, bot on or off as it was, and deletes its
// save. Once a move is played, the first press asks for a confirmation for a few seconds (newgame.ts).
// Boss, daily and online games hide it for good (startBoss, goOnline).
// A HUD button with an icon (#297): `content` is the icon or the words, `label` the accessible name and tooltip.
const setButton = (button: HTMLElement, label: string, content: string): void => {
  button.innerHTML = content;
  button.setAttribute('aria-label', label);
  button.title = label;
};
const newGameButton = document.getElementById('new-game') as HTMLButtonElement;
setButton(newGameButton, 'New game', icon('newgame'));
let confirmNew: Confirm = null;
let lapse = 0; // ends the confirmation
function askNewGame(confirm: Confirm): void {
  confirmNew = confirm;
  const label = newGameLabel(confirm);
  setButton(newGameButton, label, confirm === null ? icon('newgame') : label); // the words while it waits for the confirmation
  newGameButton.classList.toggle('confirm', confirm !== null);
  clearTimeout(lapse);
  if (confirm !== null) lapse = setTimeout(askNewGame, CONFIRM_MS, null);
}
newGameButton.addEventListener('click', () => {
  const press = pressNewGame(confirmNew, performance.now(), history.length);
  askNewGame(press.confirm);
  if (press.start) newGame();
});
function newGame(): void {
  if (hub) {
    leaveHub();
    applyDeck(deckOf('local'));
  }
  engine = new Engine();
  history.length = 0;
  replaying = null;
  selected = [];
  thinking = false; // the bot's reply to the old game is dropped (botTurn)
  void saves.clear();
  view = resetView(4);
  applyView();
  refresh();
  analyse(); // the bar follows the new game, an answer for the old one is dropped
}
newGameButton.disabled = false; // listener ready (#146)

// Boss fight: the menu lists the bosses of the bridge, picking one switches the page to encounter
// mode (human Black, the boss answers in the worker). Retry restarts the same boss and seed.
const bossButton = document.getElementById('boss-fight')!;
const bossList = document.getElementById('boss-list')!;
const retryButton = document.getElementById('boss-retry')!;
function startBoss(id: string, seed: number, daily?: { day: string; attempt: number }): void {
  leaveHub();
  worker = botWorker; // the boss answers, after the hub's hot-seat table too (#522)
  stopAnalysis();
  fight = { id, seed, daily };
  goalOpen = false;
  engine = new Encounter(id, seed);
  history.length = 0;
  replaying = null;
  selected = [];
  thinking = false;
  leaveRoyale();
  bossList.hidden = true;
  bossButton.setAttribute('aria-expanded', 'false');
  moveModes('pick');
  retryButton.hidden = false;
  newGameButton.hidden = true;
  document.body.dataset.boss = id;
  applyDeck(deckOf('boss', id));
  refresh(); // the HUD of the fight first: the view keeps off its plate
  view = fitted = fightView();
  applyView();
}
const bossEntries = new Map<string, HTMLButtonElement>();
for (const id of boss_ids()) {
  const entry = document.createElement('button');
  entry.type = 'button';
  entry.textContent = boss_name(id)!;
  entry.addEventListener('click', () => startBoss(id, crypto.getRandomValues(new Uint32Array(1))[0]!));
  bossList.appendChild(entry);
  bossEntries.set(id, entry);
}
/** The medal and its best turn count next to each beaten boss (#791), read from the storage when the menu opens. */
function showMedals(): void {
  for (const [id, entry] of bossEntries) {
    const turns = bestTurns(store, id);
    entry.replaceChildren(boss_name(id)!);
    if (turns !== null) entry.append(' ', Object.assign(document.createElement('span'), { className: 'medal', textContent: medalLabel(turns) }));
  }
}
bossButton.addEventListener('click', () => {
  if (online) return;
  if (bossList.hidden) showMedals();
  bossList.hidden = !bossList.hidden;
  bossButton.setAttribute('aria-expanded', String(!bossList.hidden));
  if (!bossList.hidden) showCoopList(false); // one boss list open at a time (#615)
});
(bossButton as HTMLButtonElement).disabled = false; // engine, boss list and listener ready (#144)

// Daily challenge (#195): the UTC date gives the boss and the seed, the same for everyone that day.
// Each start counts one attempt of the day in localStorage, Retry included. Retry on a daily starts
// the daily of the current day, so after 00:00 UTC it is the new day's fight.
const dailyButton = document.getElementById('daily') as HTMLButtonElement;
function today(): Daily {
  const daily = dailyFor(utcDay(Date.now()), boss_ids());
  // The boss name is a span: held upright on a phone it takes a line of its own (ui.css, #575).
  const name = Object.assign(document.createElement('span'), { textContent: boss_name(daily.id)! });
  dailyButton.replaceChildren(dailyTitle(daily.day, ''), name);
  return daily;
}
function startDaily(): void {
  if (online) return;
  const { day, id, seed } = today();
  startBoss(id, seed, { day, attempt: countAttempt(store, day) });
}
today();
setInterval(today, 60_000); // an open page follows the day change at 00:00 UTC
dailyButton.addEventListener('click', startDaily);
dailyButton.disabled = false; // label and listener ready (#144)
goalButton.addEventListener('click', () => {
  goalOpen = !goalOpen;
  hud();
});
retryButton.addEventListener('click', () => (fight!.daily ? startDaily() : startBoss(fight!.id, fight!.seed)));

// The hub (#521, game-design.md section 3.5): Ship draws the map of the saved deck, in that deck's look, with the
// player's glass marble on the saved cell. A click on a neighbour cell or an arrow key rolls it one cell (hub.ts step),
// and the spot is saved (progress.ts). A new game, a boss fight or Play online leaves it.
const shipButton = document.getElementById('ship') as HTMLButtonElement;
shipButton.addEventListener('click', () => {
  moveModes('pick');
  leaveOnline();
  leaveRoyale();
  enterHub(loadProgress(store).at);
});
shipButton.disabled = false; // listener ready (#146)
function enterHub(at: HubSpot): void {
  roomOf = null;
  hub = new HubController(at);
  hub.enter(at);
  evalBar.hidden = hintButton.hidden = exportButton.hidden = importButton.hidden = true; // no game on in the hub: a new game shows them again (#583, #589)
  analyst.stop();
  applyDeck(at.deck);
  refresh();
}
function walk(to: Axial): void {
  const progress = loadProgress(store);
  const deck = hub!.at.deck;
  const { stepped, at } = hub!.onCellClick(to, progress.beaten);
  if (!stepped) return hud();
  saveProgress(store, { ...progress, at });
  if (at.deck !== deck) applyDeck(at.deck);
  refresh();
  enterRoom(at);
}
// The doors (#522): rolling onto a boss door or a table starts the same game as its mode menu entry, and the room is
// kept for Back to the ship. A terminal opens its lore entry in the reader, and Esc leaves it to the hub on the same
// cell (#524). A lift starts nothing here.
function enterRoom(at: HubSpot): void {
  const door = roomAt(at.deck, at.cell);
  if (door?.kind === 'terminal') return openReader(door.lore);
  if (door?.kind === 'medals') return openReader(MEDAL_ROOM);
  if (door?.kind === 'boss') startBoss(door.boss, crypto.getRandomValues(new Uint32Array(1))[0]!);
  else if (door?.kind === 'hotseat' || door?.kind === 'bot') startLocal(door.kind === 'bot');
  else if (door?.kind === 'online' && !playOnlineButton.disabled) playOnline();
  else if (door?.kind === 'royale') startRoyale({ seed: crypto.getRandomValues(new Uint32Array(1))[0]!, rounds: [] });
  else return;
  roomOf = at;
}
function startLocal(bot: boolean): void {
  worker = bot ? botWorker : null;
  fight = null; // a boss fight the hub was opened from
  delete document.body.dataset.boss;
  retryButton.hidden = true;
  newGameButton.hidden = false;
  newGame();
}
backButton.addEventListener('click', () => {
  leaveOnline();
  leaveRoyale();
  enterHub(roomOf!);
});
function leaveHub(): void {
  hub?.exit();
  hub = null;
}
addEventListener('keydown', (e) => {
  // An open terminal reader pages by them, a text field moves its caret.
  const to = hub && !(e.target instanceof HTMLInputElement) ? hub.onKeyDown(e.key, Boolean(reading)) : null;
  if (!to) return;
  e.preventDefault(); // no page scroll
  walk(to);
});

// Daily result card (#196): once a daily fight is over, the text to share, and Copy. The text is
// built here and goes nowhere but the clipboard, and only when the player copies it. Copy uses the
// clipboard helper of Copy diagnostics (#220): when the browser refuses, the text is selected in its
// box to copy by hand. It is only set when it changes, so a HUD update keeps the selection.
const resultCard = document.getElementById('daily-card')!;
const resultText = document.getElementById('daily-result') as HTMLTextAreaElement;
function showResultCard(): void {
  const text =
    fight?.daily && engine instanceof Encounter
      ? dailyCard({
          day: fight.daily.day,
          boss: engine.name(),
          result: engine.result(),
          plies: history.length,
          attempt: fight.daily.attempt,
        })
      : '';
  resultCard.hidden = text === '';
  if (resultText.value !== text) resultText.value = text;
}
document.getElementById('daily-copy')!.addEventListener('click', async () => {
  if (await copyText(resultText.value, navigator.clipboard)) return hud(' · result copied');
  resultText.focus();
  resultText.select();
  hud(' · result selected: copy it by hand');
});

// Export and import (#219): the local game as a JSON file in the save format, docs/specs/tech.md section 8. An
// imported game is replayed through the engine, replaces the local game and is saved like one, in this page's mode
// (against the bot, or hot-seat with ?bot=off). A bad file changes nothing but the HUD note.
const exportButton = document.getElementById('setting-export-game') as HTMLButtonElement; // in the settings menu (#287)
const importButton = document.getElementById('setting-import-game') as HTMLButtonElement;
const importFile = document.getElementById('import-file') as HTMLInputElement;
exportButton.addEventListener('click', () => {
  const link = document.createElement('a');
  const text = gameFileText({ bot: worker !== null, moves: history });
  link.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  link.download = gameFileName(new Date());
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 60_000); // the download may still be reading it
});
importButton.addEventListener('click', () => importFile.click());
importFile.addEventListener('change', async () => {
  const file = importFile.files?.[0];
  importFile.value = ''; // so picking the same file again is a change too
  if (!file) return;
  const read = await readGameFile(file, () => new Engine());
  if (online || fight || hub) return; // the player left for another game, or the hub, while the file was read
  if ('refused' in read) return hud(` · ${read.refused}`);
  engine = read.engine;
  history.length = 0;
  replaying = null;
  history.push(...read.moves);
  selected = [];
  thinking = false;
  void saves.save({ bot: worker !== null, moves: history }, engine.status() !== 0);
  refresh();
  analyse(); // the bar follows the imported position (#191)
  void botTurn();
});
exportButton.disabled = importButton.disabled = false; // listeners ready (#146)

// Online play: Black creates the room and shares the invite link, the link opener plays White.
// The engine stays the only judge: every remote move is replayed through it, a bad one is refused.
// ?net=hook swaps the Trystero transport for the page hook the e2e test wires (no public relays).
// Once the game is over, Rematch starts a new game in the same room with the colours swapped (#186).
let online: OnlineSession | null = null;
let onlineNote = '';
let offlineNotice = ''; // no connection: Play online is disabled, a game in progress keeps its own status (#194)
let playReady = false;
let onlineLine: OnlineStatus | undefined;
let link: Transport | null = null; // the transport of the online room, closed by Back to the ship (#522)
let rankedMode: RankedMode | null = null;
let rankedQueuedAt = 0;
let rankedDelta: number | undefined;
let rankedDone = false;
let rankedOpponentRating = DEFAULT_RATING;
const inviteBox = document.getElementById('invite') as HTMLInputElement;
const inviteLabel = document.getElementById('invite-label')!;
const inviteCopy = document.getElementById('invite-copy') as HTMLButtonElement;
/** Shows the invite link of a room, its address too. The link makes the button column taller, and a column scrolled down
 * to the mode menu would keep the buttons above out of its box: it goes back to the top (#839). */
function showInvite(url: string, caption: string): void {
  inviteBox.value = url;
  location.hash = new URL(url).hash;
  inviteBox.hidden = inviteLabel.hidden = inviteCopy.hidden = false;
  inviteLabel.textContent = caption;
  document.getElementById('online')!.scrollTop = 0;
}
const hideInvite = (): void => void (inviteBox.hidden = inviteLabel.hidden = inviteCopy.hidden = true);
// Copy (#839): the link goes to the clipboard and the link, its label and Copy close. When the browser refuses, the link
// stays, selected, to copy by hand.
inviteCopy.addEventListener('click', async () => {
  if (await copyText(inviteBox.value, navigator.clipboard)) return hideInvite();
  inviteBox.focus();
  inviteBox.select();
  hud(' · invite link selected: copy it by hand');
});
const rematchButton = document.getElementById('rematch') as HTMLButtonElement;
rematchButton.addEventListener('click', () => void online?.rematch());
// Co-op (docs/specs/coop-boss.md section 3): every page plays the boss reply to each human move itself, from the same
// encounter. It is asked from the analysis worker, idle online: on the main thread one reply of The Hull or The Choir
// blocks the page for 150 ms typically, up to 440 ms (#529). Until it is played, the room's next message waits in the
// session's queue, so a partner's next move never comes before it; the boss reply to our own move is awaited first too.
let bossReply: Promise<void> = Promise.resolve();
function answerBoss(live: boolean): Promise<void> {
  bossReply = (async () => {
    if (engine.status() !== 0) return; // the human move ended the fight
    const searchBudget = scaleBudget(budget, difficulty);
    const diffPercent = DIFFICULTY_PERCENT[difficulty];
    const move = await askBot(analysisWorker, history.slice(), searchBudget, fight!, diffPercent);
    await new Promise<void>((done) => whenSettled(() => (replay(move, live), refresh(), done())));
  })();
  return bossReply;
}
function replay(mv: ArrayLike<number>, live: boolean): void {
  leaveReplay();
  const before = Array.from(engine.board());
  engine.play(Int32Array.from(mv));
  afterPlay(before, Array.from(mv), live);
}
/** The creator waits for the others as long as it takes, a joiner should find the creator's room at once. */
function signalingTimeout(side: number): void {
  if (side !== 1) setTimeout(() => diag.timeout(), SIGNALING_TIMEOUT_MS);
}
/** The transport of `room`: Trystero, or the page hook the e2e test wires under ?net=hook. */
function roomTransport(room: string): Transport {
  return new URLSearchParams(location.search).get('net') === 'hook' ? hookTransport() : p2pTransport(room, (message) => diag.joinError(message));
}
/** Joins `room` in seat `side`, a co-op room against the boss and seed of `coop` (#529), a versus room without. */
async function goOnline(room: string, side: number, coop?: CoopFight): Promise<void> {
  leaveHub();
  stopAnalysis();
  fight = coop ? { id: coop.boss, seed: coop.seed } : null;
  rematchButton.textContent = coop ? 'Retry' : 'Rematch'; // co-op: the same fight again, both seats asked (#531)
  delete document.body.dataset.boss;
  applyDeck(deckOf('online'));
  retryButton.hidden = true;
  newGameButton.hidden = true;
  engine = makeGame();
  history.length = 0;
  replaying = null;
  selected = [];
  leaveRoyale();
  diag.connecting();
  const net = roomTransport(room);
  link = net;
  signalingTimeout(side);
  let netState = '';
  // An extra peer is a spectator: it follows the game and never sends (the spectator view is #34).
  // The status line shows our color and whether the key bound to the other seat is connected (#121).
  // Our color is the session's: it swaps at each rematch.
  const note = (): void => {
    const session = online; // set before the session calls back, and below before the first note
    if (!session) return; // the room was left for the ship (#522)
    const role = session.role;
    const mine = session.side;
    const other = coop ? 3 - side : 3 - mine; // co-op: the partner's seat, both seats play Black
    const opponent = session.presenceOf(other);
    document.body.dataset.online = role === 'spectator' ? 'Spectator' : sideName(mine, glassOf());
    document.body.dataset.seat = role; // read by the e2e tests
    document.body.dataset.opponent = opponent;
    document.body.dataset.coordinator = String(session.coordinatorSeq); // join_seq of the coordinator, read by the e2e tests (#359)
    document.body.dataset.handover = session.handover;
    onlineLine = coop ? coopStatus(role, opponent, session.isAgent(other)) : onlineStatus(mine, role, opponent, session.isAgent(other), glassOf());
    onlineNote = netState;
    hud();
  };
  online = new OnlineSession({
    game: room,
    side,
    engine: engine_version(),
    keys: await generateKeys(),
    transport: net,
    judge: {
      to_move: () => engine.to_move(),
      play: coop
        ? async (mv, live) => {
            await bossReply;
            replay(mv, live);
            await answerBoss(live);
          }
        : replay,
      status: () => engine.status(),
      restart: () => {
        engine = makeGame();
        history.length = 0;
        replaying = null;
      },
      ...(coop && { mover: () => seatAfter(history.length, 2) }),
    },
    onMove: () => refresh(),
    onRefuse: (reason) => {
      diag.refused(reason);
      hud(` · refused move: ${reason}`);
    },
    onState: (s) => {
      diag.netState(s);
      netState = ` · ${s}`;
      note();
    },
    onRole: note,
    onPresence: note,
    onCoordinator: note,
    beat: { ms: beatPeriod(location.search, navigator.webdriver), now: Date.now, every: (fn, ms) => void setInterval(fn, ms) },
    onRematchAsk: note,
    onRematch: () => {
      selected = [];
      note();
      refresh();
    },
  });
  note();
  refresh();
  if (coop) {
    view = fitted = fightView(); // as in a solo fight (#695)
    applyView();
  }
}
/** Opens a new room as its creator and shows its invite link: a co-op room with `coop` (#529), a versus room without. */
function playOnline(coop?: CoopFight): void {
  rankedMode = null;
  moveModes('pick');
  const room = newRoomId((b) => crypto.getRandomValues(b));
  showInvite(inviteUrl(location.href, room, coop), `Invite link: send it to your ${coop ? 'partner' : 'opponent'}`);
  void goOnline(room, 1, coop);
}
document.getElementById('play-online')!.addEventListener('click', () => playOnline());
const rankedButton = document.getElementById('ranked') as HTMLButtonElement;
rankedButton.addEventListener('click', () => {
  rankedDelta = undefined;
  rankedDone = false;
  rankedQueuedAt = Date.now();
  if (royale) {
    rankedMode = 'royale';
    moveModes('pick');
    hud();
    return;
  }
  const rating = loadRankedProfile(store).rating1v1;
  const matched = findMatch(
    { peerId: 'self', rating, queuedAt: rankedQueuedAt },
    [{ peerId: 'peer', rating: DEFAULT_RATING, queuedAt: rankedQueuedAt }],
    rankedQueuedAt,
  );
  rankedOpponentRating = matched!.rating;
  playOnline();
  rankedMode = '1v1';
  hud();
});
// Fight together (#530): the mode menu lists the bosses again, under it; picking one opens a co-op room against that
// boss with a random seed, the creator in seat 1.
const coopButton = document.getElementById('fight-together') as HTMLButtonElement;
const coopList = document.getElementById('coop-list')!;
function showCoopList(shown: boolean): void {
  coopList.hidden = !shown;
  coopButton.setAttribute('aria-expanded', String(shown));
}
for (const id of boss_ids()) {
  const entry = document.createElement('button');
  entry.type = 'button';
  entry.textContent = boss_name(id)!;
  entry.addEventListener('click', () => {
    showCoopList(false);
    playOnline({ boss: id, seed: crypto.getRandomValues(new Uint32Array(1))[0]! });
  });
  coopList.appendChild(entry);
}
coopButton.addEventListener('click', () => {
  if (coopList.hidden) {
    bossList.hidden = true; // one boss list open at a time (#615)
    bossButton.setAttribute('aria-expanded', 'false');
  }
  showCoopList(!!coopList.hidden); // hidden: open it
});
// Back to the ship from an online table (#522): the room is closed and the page is a local one again.
function leaveOnline(): void {
  if (!online) return;
  online = null;
  link!.close();
  onlineNote = '';
  onlineLine = undefined;
  for (const key of ['online', 'seat', 'opponent', 'coordinator', 'handover']) delete document.body.dataset[key];
  hideInvite();
  rematchButton.hidden = true;
  newGameButton.hidden = false;
  window.history.replaceState(null, '', location.pathname + location.search); // no room in the address
}
const playOnlineButton = document.getElementById('play-online') as HTMLButtonElement;

// The offline battle royale (#502, rules.md section 10.4): Battle royale starts 1 player against 5 bots on the radius 8
// arena, at the Furnace. The player presses a target on the arena, as a move, which locks the order (#611), or holds;
// the bots' orders come from the round-start state, and the round resolves. The HUD plate shows the next round's
// initiative order before its reveal, and the reveal of the last round. A boss fight, Play online or Ship leaves it,
// and it leaves Ship.
const holdButton = document.getElementById('royale-hold') as HTMLButtonElement;
const startButton = document.getElementById('royale-start') as HTMLButtonElement; // the creator's, online (#504)
const royaleInviteButton = document.getElementById('royale-invite') as HTMLButtonElement; // offline: opens a room (#504)
function startRoyale(file: RoyaleFile): void {
  stopAuto();
  leaveHub();
  stopAnalysis();
  fight = null;
  delete document.body.dataset.boss;
  delete document.body.dataset.over;
  engine = new Engine(); // a bot reply to the old game is dropped (botTurn)
  history.length = 0;
  replaying = null;
  thinking = false;
  selected = [];
  reveal = null;
  royale = loadRoyale(file, (seats, seed) => new Royale(seats, seed));
  moveModes('pick');
  for (const control of [newGameButton, retryButton, goalButton, hintButton, exportButton, importButton, resultCard]) control.hidden = true;
  holdButton.hidden = false;
  fogRadius = 4.2;
  applyDeck(deckOf('royale'));
  refresh();
}
function leaveRoyale(): void {
  stopAuto();
  if (royaleNet) {
    royaleNet = null;
    clearInterval(ticking);
    online = null;
    link!.close();
  }
  startButton.hidden = royaleInviteButton.hidden = true;
  for (const key of ['net', 'desync', 'online', 'seat']) delete document.body.dataset[key];
  royale = null;
  reveal = null;
  arena.visible = false;
  fogRadius = frame?.radius ?? RADIUS;
  for (const mesh of [plate, rim.near, rim.far]) mesh.visible = true;
  holdButton.hidden = true;
  delete document.body.dataset.royale;
  delete document.body.dataset.reveal;
}
// The round played out (#612, royale-reveal.ts) from `start`, `ms` into it, `at` the turn drawn (the number of turns
// for the breach), and the cracks before it; null once the arena shows the game as it stands. A press or a key ends it
// at once, and the next order waits for its end.
interface Revealing {
  plan: Reveal;
  cracks: Int32Array;
  start: number;
  ms: number;
  at: number;
}
let reveal: Revealing | null = null;
// The marble and glyph drawn on each arena cell, which the reveal slides.
const arenaAt = new Map<number, THREE.Mesh[]>();
const phaseOf = (r: Revealing): number => (r.ms >= r.plan.breach.start ? r.plan.steps.length : shownAt(r.plan, r.ms) - 1);
// What the arena shows: the game, or the reveal's turn or breach with the seat a fizzle or a hold marks.
function arenaView(game: Royale): { board: ArrayLike<number>; cracks: ReturnType<typeof parseCracks>; marked: number } {
  if (!reveal) return { board: game.board(), cracks: parseCracks(game.cracks()), marked: -1 };
  const step = reveal.plan.steps[phaseOf(reveal)];
  if (!step) return { board: reveal.plan.breach.board, cracks: [], marked: -1 };
  const marked = step.outcome === 'fizzled' || step.outcome === 'held' ? step.seat : -1;
  return { board: step.board, cracks: parseCracks(reveal.cracks), marked };
}
// The arena in place of the board: the cells left, each seat's marbles, the selection and its targets.
function drawRoyale(game: Royale): void {
  fogRadius = 4.2;
  for (const mesh of [...discs, plate, rim.near, rim.far]) mesh.visible = false;
  for (const group of [marbles, ghosts, notches, ...tallies, arenaMarbles]) group.clear();
  marbleAt.clear();
  arenaAt.clear();
  arena.visible = true;
  const { board, cracks, marked } = arenaView(game);
  const left = crackLeft(cracks, ARENA);
  breachGlow.color.set(paletteById(palette).hazard);
  crackDecals = [];
  targets = reveal || !canOrder() ? [] : groupTargets(parseMoves(game.legal_orders(me())), selected);
  ringed = marked >= 0 ? ARENA.filter((_, i) => seatAt(board[i]!) === marked) : [...selected];
  ARENA.forEach(([q, r], i) => {
    arenaDiscs[i]!.visible = board[i] !== VANISHED;
    arenaDiscs[i]!.position.y = -0.05; // a disc the breach sank is back once void
    const p = axialTo3D(q, r);
    const rounds = left.get(i) ?? 0;
    if (rounds > 0) {
      const glow = new THREE.Mesh(crackGeometry, breachGlow);
      glow.position.set(p.x, 0.002, p.z);
      arenaMarbles.add(glow);
      if (crackDecal) {
        const decal = new THREE.Mesh(crackGeometry, crackMaterial);
        decal.position.set(p.x, 0.003, p.z);
        arenaMarbles.add(decal);
        crackDecals.push([q, r]);
      }
      for (const dx of tickOffsets(rounds)) {
        const tick = new THREE.Mesh(tickGeometry, tickMaterial); // one per round left, on the front edge
        tick.position.set(p.x + dx, 0.01, p.z + 0.39);
        arenaMarbles.add(tick);
      }
    }
    const target = targets.find(({ cell: [tq, tr] }) => tq === q && tr === r);
    if (target) {
      const ring = new THREE.Mesh(targetRingGeometry, ringMaterial);
      const arrow = new THREE.Mesh(arrowGeometry, targetMaterial);
      ring.rotation.x = -Math.PI / 2;
      arrow.rotation.set(-Math.PI / 2, arrowYaw(target.dir), 0, 'YXZ');
      ring.position.set(p.x, 0.005, p.z);
      arrow.position.set(p.x, 0.005, p.z);
      arenaMarbles.add(ring, arrow);
    }
    const seat = seatAt(board[i]!);
    if (seat < 0) return;
    const marble = new THREE.Mesh(marbleGeometry, seatLooks[seat]);
    marble.castShadow = true;
    const picked = ringed.some(([sq, sr]) => sq === q && sr === r);
    marble.position.set(p.x, picked ? 0.5 : 0.36, p.z);
    const glyph = new THREE.Mesh(seatGlyphs[seat], seatInk);
    glyph.position.copy(marble.position).add(glyphLift);
    arenaMarbles.add(marble, glyph);
    arenaAt.set(i, [marble, glyph]);
    if (!picked) return;
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(p.x, 0.02, p.z);
    arenaMarbles.add(ring);
  });
  document.body.dataset.royale = String(nextRound(parseLog(game.round_log()))); // read by the e2e tests
  document.body.dataset.reveal = !reveal ? 'done' : reveal.plan.steps[phaseOf(reveal)] ? 'turn' : 'breach'; // read by the e2e tests
  document.body.dataset.cracks = String(cracks.length);
  document.body.dataset.vanished = String(Array.from(board).filter((v) => v === VANISHED).length);
  hud();
}
// The plate, and once the game is over the end banner and its light (body[data-over], #282, #503).
// During the reveal, the log lines of the turns played so far and no end yet.
function royaleHud(game: Royale): void {
  const placed = reveal ? [] : standings(game.placement());
  const end = royaleBanner(placed, me());
  if (end) document.body.dataset.over = end.anim;
  else delete document.body.dataset.over;
  const { board, cracks } = arenaView(game);
  const log = parseLog(game.round_log());
  const shown = log && reveal ? { ...log, turns: log.turns.slice(0, shownAt(reveal.plan, reveal.ms)) } : log;
  const room = royaleNet && { names: royaleNet.names, you: me(), status: royaleStatus(royaleNet), left: royaleNet.left };
  document.getElementById('hud')!.innerHTML = royaleHtml(shown, { out: outSeats(board), cracks, standings: placed, ...room });
  if (rankedMode === 'royale') {
    if (placed.length > 0 && !rankedDone) {
      rankedDelta = settleRankedRoyale(store, placed, me()).delta;
      rankedDone = true;
    }
    document.getElementById('hud')!.insertAdjacentHTML('beforeend', rankedHudHtml(loadRankedProfile(store).ratingRoyale, { delta: rankedDelta }));
  }
  holdButton.disabled = end !== null || !canOrder();
  royaleInviteButton.hidden = royaleNet !== null;
  backButton.hidden = !roomOf || end === null;
}
// A press on one of the player's marbles selects it, a press on a target locks that move as the order and plays the
// round (#611). Once the game is over a press does nothing.
function pickRoyale(q: number, r: number): void {
  endReveal();
  const game = royale!;
  if (game.placement().length || !canOrder()) return;
  if (seatAt(game.board()[cellIndex(q, r, ARENA)]!) === me()) {
    selected = toggleSelection(selected, [q, r]);
    return refresh();
  }
  const mv = moveForClick(parseMoves(game.legal_orders(me())), selected, [q, r]);
  if (mv) playRound(encodeMove(mv));
}
// Under reduced motion the arena jumps to the new position (#612).
function playRound(mine: readonly number[]): void {
  endReveal();
  const game = royale!;
  if (game.placement().length) return; // Hold pressed during the reveal of the last round
  selected = [];
  if (royaleNet) return void royaleNet.play([...mine]); // online: committed, the round resolves on every peer (#504)
  const before = game.board();
  const cracks = game.cracks();
  const orders = roundOrders(game, mine);
  game.resolve(orders);
  showRound(game, before, cracks, orders);
}
/** Plays out the round `game` just resolved from the arena `before` it, with its cracks then and its orders. */
function showRound(game: Royale, before: ArrayLike<number>, cracks: ArrayLike<number>, orders: Int32Array): void {
  if (reducedMotion()) return refresh();
  const plan = buildReveal(before, orders, parseLog(game.round_log())!, game.board());
  reveal = { plan, cracks: Int32Array.from(cracks), start: performance.now(), ms: 0, at: -1 };
  animateReveal(reveal.start);
}
// Each frame of the reveal: a new turn or the breach redraws the arena and starts its falls, the turn's marbles slide,
// the voided discs sink.
function animateReveal(now: number): void {
  if (!reveal) return;
  const { plan } = reveal;
  const ms = now - reveal.start;
  if (ms >= plan.total) return endReveal();
  reveal.ms = ms;
  const at = phaseOf(reveal);
  const step = plan.steps[at];
  if (at !== reveal.at) {
    reveal.at = at;
    refresh();
    for (const fall of step ? (step.ejected ? [step.ejected] : []) : plan.breach.falls) fallInto(fall);
  }
  if (!step) {
    for (const i of plan.breach.voids) arenaDiscs[i]!.position.y = -0.05 - sinkAt(ms - plan.breach.start);
    return;
  }
  for (const track of step.tracks) {
    const p = slideAt(track, ms - step.start);
    const [marble, glyph] = arenaAt.get(cellIndex(...track.cell, ARENA))!;
    marble!.position.x = p.x;
    marble!.position.z = p.z;
    glyph!.position.copy(marble!.position).add(glyphLift);
  }
}
// A marble the reveal ejects or the breach takes: the ejection fall of a normal game, in the arena.
function fallInto({ cell, seat, dir }: Fall): void {
  const mesh = new THREE.Mesh(marbleGeometry, seatLooks[seat]);
  const glyph = new THREE.Mesh(seatGlyphs[seat], seatInk);
  glyph.position.copy(glyphLift);
  mesh.add(glyph);
  startEjection(mesh, ejectTrack(cell, dir, false), arena);
}
function endReveal(): void {
  if (!reveal) return;
  reveal = null;
  refresh();
}
addEventListener('pointerdown', endReveal, { capture: true });
addEventListener('keydown', endReveal, { capture: true });
const royaleButton = document.getElementById('battle-royale') as HTMLButtonElement;
royaleButton.addEventListener('click', () => {
  if (online) return;
  startRoyale({ seed: crypto.getRandomValues(new Uint32Array(1))[0]!, rounds: [] });
});
holdButton.addEventListener('click', () => playRound([]));
royaleButton.disabled = false; // listener ready (#146)

// The online battle royale (#504, docs/specs/tech.md section 6): Invite, in an offline battle royale, opens a room of 6
// seats and shows its invite link, each link opener takes the first free seat. The creator coordinates: Start begins the game, the
// seats empty then are bots, played alike on every peer. Each round a target press or Hold commits the order, the
// round resolves once every seat revealed or its deadline passed (royale-net.ts), and the arena plays it out.
const ONLINE_SEATS = 6;
/** Our seat on the arena: the player's offline, ours in the room online (-1 for a spectator). */
function me(): number {
  return royaleNet ? royaleNet.you : YOU;
}
/** Whether an order can be given now: always offline, while the open round takes ours online. */
function canOrder(): boolean {
  return !royaleNet || royaleNet.phase === 'choosing';
}
function royaleStatus(net: RoyaleNet<Royale>): OnlineStatus {
  const session = online!;
  document.body.dataset.online = 'royale'; // read by the e2e tests, as data-seat, data-net and data-desync
  document.body.dataset.seat = session.role;
  document.body.dataset.net = net.phase;
  document.body.dataset.desync = String(net.desync);
  startButton.hidden = net.phase !== 'lobby' || !session.isCoordinator;
  return netStatus(net.phase, session.isCoordinator, net.players, net.desync);
}
// The keys first: from the arena on, every order goes to the room.
async function goRoyale(room: string, side: number): Promise<void> {
  const keys = await generateKeys();
  leaveRoyale();
  startRoyale({ seed: seedOf(room), rounds: [] });
  const game = royale!;
  diag.connecting();
  const net = roomTransport(room);
  link = net;
  signalingTimeout(side);
  const session: OnlineSession = new OnlineSession({
    game: room,
    side,
    seatCount: ONLINE_SEATS,
    engine: engine_version(),
    keys,
    transport: net,
    judge: ROOM_JUDGE,
    onMove: refresh, // never: the judge plays no move
    onRefuse: (reason) => diag.refused(reason),
    onState: (state) => {
      diag.netState(state);
      if (state === 'open') void ours.resync(); // back after a drop: what did we miss (#504)
      refresh();
    },
    onRole: refresh,
    onPresence: refresh,
    beat: { ms: beatPeriod(location.search, navigator.webdriver), now: Date.now, every: (fn, ms) => void setInterval(fn, ms) },
    onOther: (m, key, peer) => {
      const message = parseRoyale(m);
      if (message) return ours.receive(message, key, peer);
    },
  });
  const ours: RoyaleNet<Royale> = new RoyaleNet({
    game: room,
    keys,
    royale: game,
    roundMs: roundPeriod(location.search, navigator.webdriver),
    now: Date.now,
    connected: () => net.state === 'open',
    send: (m, to) => net.send(m, to),
    coordinator: () => session.coordinator,
    roster: () => session.seats.roster(),
    onRound: (before, cracks, orders) => showRound(game, before, cracks, orders), // the room's link closes when it is left
    onChange: refresh,
  });
  online = session;
  royaleNet = ours;
  // The deadlines pass, and the plate is drawn again once its countdown shows another second (#673).
  let clock = '';
  ticking = setInterval(() => {
    const now = deadlineText(ours.left);
    if (now !== clock) hud();
    clock = now;
    void ours.tick();
  }, 100) as unknown as number;
  refresh();
}
startButton.addEventListener('click', () => void royaleNet?.start());
royaleInviteButton.addEventListener('click', () => {
  const room = newRoomId((b) => crypto.getRandomValues(b));
  showInvite(royaleUrl(location.href, room), 'Invite link: send it to the other players');
  void goRoyale(room, 1);
});
// Used by the browser checks to load a royale game file (#502).
(window as unknown as Record<string, unknown>).__royale = startRoyale;
// Used by the browser checks to read the marble drawn for an arena cell, where it is now: its seat and place (#612).
(window as unknown as Record<string, unknown>).__arenaAt = (q: number, r: number) => {
  const marble = arenaAt.get(cellIndex(q, r, ARENA))?.[0];
  return marble ? { seat: seatLooks.indexOf(marble.material as THREE.MeshStandardMaterial), x: marble.position.x, z: marble.position.z } : null;
};
// Used by the browser checks to count each seat's glyphs drawn on the arena, in seat order (#558).
(window as unknown as Record<string, unknown>).__seatGlyphs = () =>
  seatGlyphs.map((g) => arenaMarbles.children.filter((m) => (m as THREE.Mesh).geometry === g).length);
function syncConnectivity(): void {
  const state = playOnlineState(navigator.onLine, playReady);
  playOnlineButton.disabled = coopButton.disabled = rankedButton.disabled = royaleInviteButton.disabled = state.disabled;
  offlineNotice = state.notice;
  hud();
}
addEventListener('online', syncConnectivity);
addEventListener('offline', syncConnectivity);
playReady = true; // engine and listener ready (#127)
syncConnectivity();
const invited = roomFromHash(location.hash);
const coopInvite = coopFromHash(location.hash);
const royaleInvite = royaleFromHash(location.hash);
if (invited) void goOnline(invited, 2);
else if (royaleInvite) void goRoyale(royaleInvite, 2);
else if (coopInvite && boss_ids().includes(coopInvite.boss)) void goOnline(coopInvite.room, 2, coopInvite); // an unknown boss starts nothing
else if (!resumed && !location.search && !location.hash) enterHub(loadProgress(store).at); // a new player arrives on the Ship hub (#602)
else analyse(); // the start position

// Copy diagnostics: the events, the counters, the build and the game go to the clipboard, or are selected in a
// text box to copy by hand when the browser refuses (#220). Nothing is sent anywhere.
const copyButton = document.getElementById('copy-diagnostics') as HTMLButtonElement;
setButton(copyButton, 'Copy diagnostics', icon('diagnostics'));
const diagnosticsBox = document.getElementById('diagnostics') as HTMLTextAreaElement;
copyButton.addEventListener('click', async () => {
  const text = diag.text({
    build: __BUILD__,
    exported: new Date().toISOString(),
    environment: { mode: import.meta.env.MODE, backend, tier, userAgent: navigator.userAgent, fps: fpsOn ? lastFps : null },
    game: gameInfo({
      bot: worker !== null,
      fight,
      online: online && { game: online.game, side: online.side, role: online.role, signed: online.signedLog },
      toMove: engine.to_move(),
      status: engine.status(),
      moves: history,
    }),
  });
  const copied = await copyText(text, navigator.clipboard);
  diagnosticsBox.hidden = copied;
  if (copied) return hud(' · diagnostics copied');
  diagnosticsBox.value = text;
  diagnosticsBox.focus();
  diagnosticsBox.select();
  diagnosticsBox.scrollTop = 0; // select() scrolls to the end
  hud(' · diagnostics selected: copy them by hand');
});
diagnosticsBox.addEventListener('blur', () => (diagnosticsBox.hidden = true)); // never left over the board
copyButton.disabled = false; // listener ready (#146)

// Offline app (#193): registered at the end of the start, then checked for a new build at each load
// (Chrome does not check by itself on a reload), so the refresh after a deploy installs it. Blocked (the e2e runs),
// refused or offline, the game simply goes on.
if (serviceWorker) {
  serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`)
    .then((registration) => (serviceWorker.controller ? registration.update() : undefined))
    .catch(() => undefined);
}

refresh();
// The canvas joins the page last, once every listener and page hook is set: it draws nothing before the animation loop
// starts below, and the e2e tests take a canvas in the page for a page that is ready (bug #585).
document.body.appendChild(renderer.domElement);
if (!hub) void botTurn(); // a resumed game saved while the bot was thinking
let lastDraw = { start: -Infinity, cost: 0 };
let draws = 0;
let drawAsked = false;
// Used by the browser checks to wait for a draw: under automation the loop skips frames (#216), so a frame is not a draw (#365).
(window as unknown as Record<string, unknown>).__draws = () => draws;
// Used by the browser checks to ask for the next draw, which the throttle does not hold (#435): returns the draws so far.
(window as unknown as Record<string, unknown>).__drawNext = () => {
  drawAsked = true;
  return draws;
};
function animateParticles(now: number): void {
  sceneRenderer.animateParticles(now, deck);
}

renderer.setAnimationLoop((now) => {
  if (fpsOn) {
    fpsStamps = keepWindow(fpsStamps, now);
    lastFps = fpsOf(fpsStamps);
    fpsBox.textContent = `${lastFps} FPS`;
  }
  animateSlides(now);
  fadeGlyphs(now);
  animateReveal(now);
  animateEjections(now);
  animatePasses(now);
  animateSlams(now);
  animateBelts(now);
  if (shock) drawShock(now - shock.start);
  animateUnstable(now);
  if (blast) drawBlast(now - blast.start);
  animateSpeech(now);
  animateHaze(now);
  animateAnnounce(now);
  ripples.forEach((ring, k) => {
    const at = rippleAt(now, k, reducedMotion());
    ring.scale.setScalar(Math.max(at.radius, 0.01));
    rippleMaterials[k]!.opacity = at.opacity;
  });
  if (!reducedMotion()) for (const core of pulsarCores) core.rotation.y = now / 600;
  animateParticles(now);
  eggGlowMaterial.opacity = eggGlow(now / 1000, reducedMotion());
  scarab.emissiveIntensity = pulsing ? pulseAt(pulseHeld ?? now / 1000) : 0;
  turnConsole(now);
  tickLog(now);
  if (freeCam.active) {
    const dt = Math.min(0.05, Math.max(0.001, (now - (lastDraw.start > 0 ? lastDraw.start : now)) / 1000));
    if (freeCam.update(dt)) {
      updateFreeCamCamera();
    }
  }
  if (!drawDue(now, lastDraw.start, lastDraw.cost, drawAsked, navigator.webdriver)) return;
  sceneRenderer.render();
  draws++;
  drawAsked = false;
  lastDraw = { start: now, cost: performance.now() - now };
});
