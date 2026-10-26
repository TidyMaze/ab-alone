import * as THREE from 'three/webgpu';
import init, { Encounter, Engine, Royale, boss_ids, boss_name, engine_version } from 'abalone-wasm';
import {
  BOARD_CELLS,
  CELLS,
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
import { askBot, askEval, botBudget } from './bot';
import { bossHtml, goalShown } from './bosshud';
import { FOV, framing, isDrag, orbit, pinchScale, resetView, screenView, viewPosition, wheelScale, zoom, type View } from './camera';
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
import { drawGlyph, parseRepulsions, polarityText, repulsionMoves, type Repulsion } from './magnetizer';
import { chaplainText, parseCells, previewFlips } from './chaplain';
import { ARMY_NAMES, choirText, parseArmies } from './choir';
import { countAttempt, dailyCard, dailyFor, dailyLine, dailyTitle, utcDay, type Daily } from './daily';
import { coopFromHash, inviteUrl, newRoomId, roomFromHash, type CoopFight } from './invite';
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
import { loadProgress, recordWin, saveProgress } from './progress';
import { canEnter, roomAt, roomsOf, step, type Spot as HubSpot } from './hub';
import { arrowCell, bumpLine, HUB_BOARD, hubHtml } from './hubview';
import { indexedDbStore } from './idb';
import { LocalSaves } from './savegame';
import { CONFIRM_MS, newGameLabel, pressNewGame, type Confirm } from './newgame';
import { gameFileName, gameFileText, readGameFile } from './gamefile';
import { ARENA, ARENA_SCALE, YOU, loadRoyale, nextRound, outSeats, parseLog, roundOrders, royaleHtml, seatAt, standings, type RoyaleFile } from './royale';
import { buildReveal, shownAt, sinkAt, type Fall, type Reveal } from './royale-reveal';
import { SEAT_GLYPHS, SEAT_INK, SEATS } from './marbles';
import './ui.css';

// Palette from docs/specs/world.md section 5.
const COLORS = { base: 0x0b0d0f, steel: 0x4a5258, cyan: 0x7fd6e8 };
const BONE = 0xd8d4c8; // the pale tells
// Tints of the deck textures: the plate darker than the cells, the rim between. Divided by the deck albedo's LIGHTEN
// (scripts/gen-assets.mjs, #344), so the frame looks as it did before the deck was lightened.
const FRAME_LOOK = { plate: 0x1f1f1f, rim: 0x5d5d5d };
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

await init();
let engine: Engine | Encounter = new Engine();
// Encounter mode: the boss and seed of the running fight, kept so Retry restarts the same one. A daily
// fight also keeps its UTC day and its attempt of that day (#195).
// The Goal control (#248): the HUD shows the boss goal before the first move, then only while it is open.
const goalButton = document.getElementById('boss-goal') as HTMLButtonElement;
let goalOpen = false;
let fight: { id: string; seed: number; daily?: { day: string; attempt: number } } | null = null;
const activeRadius = (): number => (fight?.id === 'ballast' ? 5 : 4);
const makeGame = (): Engine | Encounter => (fight ? new Encounter(fight.id, fight.seed) : new Engine());
// The offline battle royale (#502) while it is on, else null.
let royale: Royale | null = null;

// ?backend=webgl forces the WebGL2 backend, anything else lets three pick WebGPU first.
const forceWebGL = new URLSearchParams(location.search).get('backend') === 'webgl';
const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL });
await renderer.init();
renderer.setPixelRatio(renderPixelRatio(devicePixelRatio, navigator.webdriver));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; // rolls the lamp's highlights off instead of clipping them
const backend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend
  ? 'WebGPU'
  : 'WebGL2';

// Textures are generated by scripts/gen-assets.mjs. A failed load keeps the flat fallback look.
const loader = new THREE.TextureLoader();
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
  if (!deckMaps.has(name)) deckMaps.set(name, loadTexture(`deck-${name}.png`, true, true));
  return deckMaps.get(name)!;
};
const deckNormalMaps = new Map<Deck, Promise<THREE.Texture | null>>();
const deckNormalMap = (name: Deck): Promise<THREE.Texture | null> => {
  if (!deckNormalMaps.has(name)) deckNormalMaps.set(name, loadTexture(`deck-${name}-normal.png`, false, true));
  return deckNormalMaps.get(name)!;
};
const [deckAlbedo, deckRoughness, shellNormal, backdrop, crackDecal, firstDeckMap, firstDeckNormal] = await Promise.all([
  loadTexture('deck-albedo.png', true, true),
  loadTexture('deck-roughness.png', false, true),
  loadTexture('shell-normal.png', false, true),
  loadTexture('backdrop.png', true, false),
  loadTexture('crack-decal.png', false, false),
  deckMap(deckOf('local')), // a page opens at the Mess
  deckNormalMap(deckOf('local')),
]);

function prefilteredRoom(): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return texture;
}

const scene = new THREE.Scene();
scene.name = 'abalone-scene';
scene.background = backdrop ?? new THREE.Color(COLORS.base);
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
scene.environmentIntensity = LIGHT.environment.intensity;
const camera = new THREE.PerspectiveCamera(FOV, innerWidth / innerHeight, 0.1, 100);
// The whole board fits the window, held upright too, below the HUD and the buttons (#227).
function frameCamera(): void {
  const { fov, shift } = framing(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = fov;
  camera.setViewOffset(innerWidth, innerHeight, 0, -shift, innerWidth, innerHeight); // updates the projection
}
frameCamera();
let view = resetView();
// The terminal reader (#512): while the player reads the deck console, the view to go back to, else null.
let reading: View | null = null;
const consoleDef = spaceshipArchitecture(tier).find((p) => p.id === 'console-screen')!; // in every tier (room.ts)
const fogObj = new THREE.Fog(DECK_ATMOSPHERES.mess.fogColor, 10, 20);
function updateFog(): void {
  const fog = fogSettings(tier, clear, view, fogRadius, DECKS[deck].fog);
  if (!fog) {
    scene.fog = null;
  } else {
    fogObj.near = fog.near;
    fogObj.far = fog.far;
    fogObj.color.setHex(DECK_ATMOSPHERES[deck as DeckId].fogColor);
    if (scene.fog !== fogObj) scene.fog = fogObj;
  }
}

function applyView(): void {
  // The reader looks at the console screen, which stands on the west wall and faces the room, along +x.
  const [x, y, z] = reading ? consoleDef.position : [0, 0, 0];
  const [, height, width] = consoleDef.size;
  const p = reading ? screenView({ x, y, z }, { x: 1, y: 0, z: 0 }, width, height, camera.fov, camera.aspect) : viewPosition(view);
  camera.position.set(p.x, p.y, p.z);
  camera.lookAt(x, y, z);
  camera.updateMatrixWorld(); // picking and __cellToScreen run before the next frame
  updateFog(); // the fog follows the zoom
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
// The frame's radius, for the fog that starts at its edge (#399): drawFrame sets it, The Choir plays on radius 3.
let fogRadius = RADIUS;
let drawProps: () => void = () => {};

// Airborne particles per deck (#443): light dust/steam/smoke outside the board volume.
const MAX_PARTICLES = 96;
const particleGeometry = new THREE.BufferGeometry();
const particlePositions = new Float32Array(MAX_PARTICLES * 3);
const resetParticle = (i: number): void => {
  const angle = Math.random() * Math.PI * 2;
  const radius = 5.5 + Math.random() * 11.5;
  particlePositions[i * 3] = Math.cos(angle) * radius;
  particlePositions[i * 3 + 1] = -0.3 + Math.random() * 7.0;
  particlePositions[i * 3 + 2] = Math.sin(angle) * radius;
};
for (let i = 0; i < MAX_PARTICLES; i++) resetParticle(i);
const particlePositionAttr = new THREE.BufferAttribute(particlePositions, 3);
particleGeometry.setAttribute('position', particlePositionAttr);
const particleMaterial = new THREE.PointsMaterial({
  size: 0.1,
  transparent: true,
  opacity: 0.35,
  depthWrite: false,
  fog: false,
});
const particles = new THREE.Points(particleGeometry, particleMaterial);
particles.visible = false;
scene.add(particles);

function updateParticles(): void {
  const conf = DECK_PARTICLES[deck];
  const enabled = hasParticles(tier, clear, reducedMotion(), navigator.webdriver, forceParticles) && conf.count > 0;
  particles.visible = enabled;
  if (!enabled) return;
  particleMaterial.color.setHex(conf.color);
  particleMaterial.size = conf.size;
  particleMaterial.opacity = conf.opacity;
  particleGeometry.setDrawRange(0, conf.count);
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
};
const sliderAt = (bus: Bus): HTMLInputElement => document.getElementById(`volume-${bus}`) as HTMLInputElement;
const paintMenu = (): void => {
  for (const { id, label, icon: name, on } of settingsList(clear, theme, skin, glass, uiScale, safe, reducedMotion(), flatHud, palette, transcriptOn)) {
    const row = document.getElementById(`setting-${id}`)!;
    row.innerHTML = `${icon(name)}<span>${label}</span>`;
    row.setAttribute('aria-label', label); // held upright only the icon shows (#414): the name stays for screen readers
    row.title = label; // and as a tooltip
    if (on !== undefined) row.setAttribute('aria-pressed', String(on));
  }
};
for (const { id } of settingsList(clear, theme, skin, glass, uiScale, safe, reducedMotion(), flatHud, palette, transcriptOn)) {
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
// The deck's light (#400): a low ambient and one hard key, set again with the fog when a mode starts on another deck.
const ambient = new THREE.AmbientLight();
const lamp = new THREE.DirectionalLight();
lamp.castShadow = true;
lamp.shadow.mapSize.set(LIGHT.key.shadow.mapSize, LIGHT.key.shadow.mapSize);
lamp.shadow.camera.near = LIGHT.key.shadow.camera.near;
lamp.shadow.camera.far = LIGHT.key.shadow.camera.far;
const shadowBound = LIGHT.key.shadow.camera.bounds;
lamp.shadow.camera.left = -shadowBound;
lamp.shadow.camera.right = shadowBound;
lamp.shadow.camera.top = shadowBound;
lamp.shadow.camera.bottom = -shadowBound;
lamp.shadow.bias = LIGHT.key.shadow.bias;
lamp.shadow.normalBias = LIGHT.key.shadow.normalBias;
scene.add(ambient, lamp);
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
  const entry = LORE.find((e) => e.id === id)!;
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
  markRead(store, consoleEntry);
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
  if (!reading) {
    if (e.key.toLowerCase() === 't') openReader();
  } else if (e.key === 'Escape') leaveReader();
  else if (e.key === 'ArrowRight') turnReader(1);
  else if (e.key === 'ArrowLeft') turnReader(-1);
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
  const light = DECKS[deck];
  ambient.color.set(light.ambient.color);
  ambient.intensity = light.ambient.intensity;
  lamp.color.set(light.key.color);
  lamp.intensity = light.key.intensity;
  lamp.position.set(...light.key.position);
  renderer.toneMappingExposure = light.exposure;
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
// Accents (#376): a cold rim from behind, a small warm point at the lamp's side. Weaker than the key.
const coldRim = new THREE.DirectionalLight(LIGHT.accents.rim.color, LIGHT.accents.rim.intensity);
coldRim.position.set(...LIGHT.accents.rim.position);
const warmLight = new THREE.PointLight(LIGHT.accents.warm.color, LIGHT.accents.warm.intensity, LIGHT.accents.warm.distance);
warmLight.position.set(...LIGHT.accents.warm.position);
scene.add(coldRim, warmLight);
// Background decor (#376, #432): industrial bulkhead frame of the ore hauler far behind the board, below the deck
// plane, so no cell, marble or mark can sit under them. Ribs, girders and diagonal trusses catch the accent lights
// with parallax depth as the camera rotates, without competing with the board.
const decorMaterial = new THREE.MeshStandardMaterial({ color: DECOR.color, roughness: 0.85, fog: false });
const decor = new THREE.Group();
for (let x = -10; x <= 10; x += 4) {
  const rib = new THREE.Mesh(new THREE.BoxGeometry(0.35, 6, 0.4), decorMaterial);
  rib.position.set(x, 0.5, -10);
  decor.add(rib);
}
const topGirder = new THREE.Mesh(new THREE.BoxGeometry(24, 0.4, 0.4), decorMaterial);
topGirder.position.set(0, 3, -10);
const midGirder = new THREE.Mesh(new THREE.BoxGeometry(24, 0.3, 0.4), decorMaterial);
midGirder.position.set(0, -1.8, -10);
decor.add(topGirder, midGirder);
for (const x of [-6, 6]) {
  const truss1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 5.2, 0.3), decorMaterial);
  truss1.rotation.z = Math.PI / 4;
  truss1.position.set(x, 0.6, -10);
  const truss2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 5.2, 0.3), decorMaterial);
  truss2.rotation.z = -Math.PI / 4;
  truss2.position.set(x, 0.6, -10);
  decor.add(truss1, truss2);
}
scene.add(decor);


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
const targetMaterial = new THREE.MeshBasicMaterial({ color: COLORS.base });
const ringMaterial = new THREE.MeshBasicMaterial({ color: COLORS.cyan });
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
function convert(marble: THREE.Mesh): void {
  marble.material = unseen;
  const shell = Object.assign(new THREE.Mesh(shellHalfGeometry, marbleMaterials[1]), { name: 'shell', castShadow: true });
  const glass = Object.assign(new THREE.Mesh(glassHalfGeometry, marbleMaterials[2]), { name: 'glass', castShadow: true });
  marble.add(shell, glass, Object.assign(new THREE.Mesh(convertedCoreGeometry, convertedCore), { name: 'core', renderOrder: 1 }));
}
let exposed = 0; // marbles the hovered move would expose, for the HUD
// The Choir: each army wears its own glyph in the pale tell colour on top of its marbles, Alto a spike,
// Tenor a ring, Bass a block, never colour alone. The army that moves next gets the pale ring.
const armyGlyphs = [
  new THREE.ConeGeometry(0.08, 0.18, 4),
  new THREE.TorusGeometry(0.07, 0.025, 8, 16),
  new THREE.BoxGeometry(0.13, 0.13, 0.13),
];
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
// The Magnetizer tell (#645, game-design.md section 7.9): a pale + or − on a near-black disc over each polarized
// marble, a sprite that faces the camera and slides with it (magnetizer.ts, 3:1 and more). A marble that just got its
// polarity wears a pale ring until the next ply. During the repulsions of a ply the board drawn is the engine's board
// before the one playing (`shown`), then the engine's own board.
const glyphMaterials = new Map(
  [1, -1].map((sign) => {
    const canvas = Object.assign(document.createElement('canvas'), { width: 128, height: 128 });
    drawGlyph(canvas.getContext('2d')!, sign, 128);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    return [sign, new THREE.SpriteMaterial({ map, depthTest: false })];
  }),
);
let shown: { game: Engine | Encounter; board: number[]; poles: number[] } | null = null;
const showing = (): { board: number[]; poles: number[] } | null => (shown?.game === engine ? shown : null);
let polesDrawn: { cell: Axial; sign: number; fresh: boolean }[] = []; // read by the e2e tests

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
const arenaMarbles = new THREE.Group();
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
// The steel frame (#292, frame.ts): a plate under the cells and a rim around them, rebuilt when the board's size or
// its holes change. The rim is two halves, each with its own material: the half at the end of the side to move lights
// in that side's colour (#300). Picking tests the discs only.
const plateMaterial = new THREE.MeshStandardMaterial(
  deckAlbedo && deckRoughness
    ? { map: deckAlbedo, roughnessMap: deckRoughness, color: FRAME_LOOK.plate }
    : { color: FRAME_LOOK.plate, roughness: 0.8 },
);
const rimMaterial = new THREE.MeshStandardMaterial(
  deckAlbedo && deckRoughness
    ? { map: deckAlbedo, roughnessMap: deckRoughness, color: FRAME_LOOK.rim, metalness: 0.3, emissiveIntensity: 0.6 }
    : { color: COLORS.steel, roughness: 0.5, metalness: 0.3, emissiveIntensity: 0.6 },
); // the turn light keeps some of the steel under it
const plate = new THREE.Mesh(new THREE.BufferGeometry(), plateMaterial);
plate.receiveShadow = true;
const rim = {
  near: new THREE.Mesh(new THREE.BufferGeometry(), rimMaterial),
  far: new THREE.Mesh(new THREE.BufferGeometry(), rimMaterial.clone()),
};
rim.near.receiveShadow = true;
rim.far.receiveShadow = true;

// The surrounding deck table (#470): grounds the board in the derelict hauler room, replaces empty black void.
const roomMaterial = new THREE.MeshStandardMaterial(
  deckAlbedo && deckRoughness
    ? { map: deckAlbedo, roughnessMap: deckRoughness, color: ROOM_SURFACE.color, fog: false }
    : { color: ROOM_SURFACE.color, roughness: ROOM_SURFACE.roughness, fog: false },
);
const roomDeck = new THREE.Mesh(
  new THREE.BoxGeometry(ROOM_SURFACE.width, 0.4, ROOM_SURFACE.depth),
  roomMaterial,
);
roomDeck.position.set(0, ROOM_SURFACE.y - 0.2, 0);
roomDeck.receiveShadow = true;

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

const propsGroup = new THREE.Group();
drawProps = (): void => {
  propsGroup.clear();
  for (const def of spaceshipArchitecture(tier)) {
    let mat: THREE.Material;
    const screen = def.id === 'console-screen';
    if (screen) {
      mat = new THREE.MeshBasicMaterial({ map: consoleTexture, fog: false }); // a screen gives its own light
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
    mesh.position.set(...def.position);
    mesh.rotation.set(...def.rotation);
    if (def.id.startsWith('pedestal') || def.id.startsWith('conduit')) {
      mesh.receiveShadow = true;
      mesh.castShadow = true;
    }
    propsGroup.add(mesh);
  }
  const sLights = spaceshipLights(deck);
  const emergencyLight = new THREE.PointLight(sLights.emergency.color, sLights.emergency.intensity, sLights.emergency.distance);
  emergencyLight.position.set(...sLights.emergency.position);
  const consoleBounceLight = new THREE.PointLight(sLights.consoleBounce.color, sLights.consoleBounce.intensity, sLights.consoleBounce.distance);
  consoleBounceLight.position.set(...sLights.consoleBounce.position);
  const pedestalGlowLight = new THREE.PointLight(sLights.pedestalGlow.color, sLights.pedestalGlow.intensity, sLights.pedestalGlow.distance);
  pedestalGlowLight.position.set(...sLights.pedestalGlow.position);
  propsGroup.add(emergencyLight, consoleBounceLight, pedestalGlowLight);
  if (currentBay) {
    applyDeckAtmosphere(currentBay, deck as DeckId);
    propsGroup.add(currentBay.scene);
  }
};
let currentBay: SpaceshipBayAssets | null = null;
const mountBay = (bay: SpaceshipBayAssets | null): void => {
  currentBay = bay;
  if (currentBay) {
    applyDeckAtmosphere(currentBay, deck as DeckId);
    propsGroup.add(currentBay.scene);
  }
};
(window as unknown as Record<string, unknown>).__mountBay = mountBay;
drawProps();
void loadSpaceshipBay(`${import.meta.env.BASE_URL}assets/pbr/`).then(mountBay);

scene.add(roomDeck, propsGroup, plate, rim.near, rim.far);
let frame: FrameShape | null = null;
// The shape lies on the x z plane: shape y is -z once turned up, extruded from the top down.
const flat = (points: Point[]): THREE.Vector2[] => points.map((p) => new THREE.Vector2(p.x, -p.z));
const slab = (shape: THREE.Shape, top: number, depth: number): THREE.ExtrudeGeometry =>
  new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, top - depth, 0);
function drawFrame(board: ArrayLike<number>): void {
  const next = frameShape(board);
  if (JSON.stringify(next) === JSON.stringify(frame)) return;
  frame = next;
  fogRadius = next.radius;
  applyLook();
  const plateShape = new THREE.Shape(flat(next.inner));
  for (const h of next.holes) plateShape.holes.push(new THREE.Path().absarc(h.x, -h.z, FRAME.hole, 0, 2 * Math.PI, true));
  plate.geometry.dispose();
  plate.geometry = slab(plateShape, -0.1, 0.2); // just under the discs
  const halves = rimHalves(next);
  for (const end of ['near', 'far'] as const) {
    rim[end].geometry.dispose();
    rim[end].geometry = slab(new THREE.Shape(flat(halves[end])), 0, 0.3); // level with the cell tops: it hides none of them
  }
}
// The turn on the rim, at once, no fade (world.md section 8). Clear board keeps it: it is game information.
function lightRim(): void {
  const light = hubAt ? null : rimLight(engine.status(), engine.to_move(), glassOf()); // no game on in the hub (#521)
  for (const end of ['near', 'far'] as const) rim[end].material.emissive.set(light?.end === end ? light.color : 0);
  document.body.dataset.rim = light?.end ?? 'off';
}
// The boss phase notches on the rim (#356, notches.ts): a near-black groove per notch, filled bone-white while lit, and
// a bone-white triangle at the next-phase threshold, so they read on any rim light by shape, not colour alone. No fog
// on them: clear board and the low tier draw them the same (world.md section 8). The HUD P1 P2 P3 stay as the fallback.
const notches = new THREE.Group();
scene.add(notches);
const grooveGeometry = new THREE.BoxGeometry(0.14, 0.02, 0.21);
const scratchGeometry = new THREE.BoxGeometry(0.08, 0.03, 0.15);
const thresholdGeometry = new THREE.CircleGeometry(0.13, 3).rotateZ(Math.PI).rotateX(-Math.PI / 2); // points at the row
const thresholdMarkGeometry = new THREE.CircleGeometry(0.08, 3).rotateZ(Math.PI).rotateX(-Math.PI / 2);
const grooveMaterial = new THREE.MeshBasicMaterial({ color: COLORS.base, fog: false });
const scratchMaterial = new THREE.MeshBasicMaterial({ color: BONE, fog: false });
function drawNotches(): void {
  notches.clear();
  const row = engine instanceof Encounter && frame ? notchRow(frame, engine.phase_notches()) : null;
  if (!row) return;
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, p: Point, y: number): void => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(p.x, y, p.z);
    notches.add(mesh);
  };
  for (const n of row.notches) {
    add(grooveGeometry, grooveMaterial, n, 0);
    if (n.lit) add(scratchGeometry, scratchMaterial, n, 0);
  }
  add(thresholdGeometry, grooveMaterial, row.glyph, 0.005);
  add(thresholdMarkGeometry, scratchMaterial, row.glyph, 0.01);
}
// The ejected count scratched on the rim as tally marks (#389, tallymarks.ts), drawn as the phase notches: a groove per
// slot, a bone-white mark in it for each marble lost (lit while left, in The Choir). The HUD pips stay as the fallback.
const tallies = [new THREE.Group(), new THREE.Group()] as const;
scene.add(...tallies);
function drawTally(board: ArrayLike<number>): void {
  const onBoard = (s: number): number => Array.from(board).filter((v) => v === s).length;
  const lost = [engine.ejected(2), engine.ejected(1)] as const; // a side loses what the other ejects
  const slots = tallySlots(lost, [onBoard(1), onBoard(2)], fight?.id === 'choir' ? 'left' : 'lost');
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
const marbles = new THREE.Group();
scene.add(marbles);
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
const ghosts = new THREE.Group();
scene.add(ghosts);
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
  ghostCore.color.setHex(pal.core);
  scarab.color.setHex(pal.shell);
  const smoked = glassLooks.get('smoked');
  if (smoked) smoked.color.setHex(pal.glass);
  coreMaterial.color.setHex(glassSkinById(glass).core ?? pal.core);
  convertedCore.color.copy(coreMaterial.color);
}
applyPalette();
let hover: Axial | null = null;
let hubAt: HubSpot | null = null; // where the marble stands while the hub is shown (#521), else null
let roomOf: HubSpot | null = null; // the hub room that started the game, for Back to the ship (#522)
let bumped = ''; // Tally's line after the marble bumped a locked lift, until the next roll (#523)
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
  (moves) => askBot(analysisWorker, moves, budget), // the bot's own budget: the move the bot would play there
  () => refresh(), // the ghost and the rings on the marbles the move takes (#301)
);
function syncHint(): void {
  const state = hint.state(here());
  hintButton.hidden = !analysing; // online and boss games turn it off for good, with the bar (fair play, #164)
  hintButton.disabled = thinking || engine.status() !== 0;
  hintButton.setAttribute('aria-pressed', String(state !== 'off'));
  document.body.dataset.hint = state; // read by the e2e tests
}
hintButton.addEventListener('click', () => {
  selected = []; // the ghost shows the hint alone
  hint.press(engine, history);
  refresh();
});

async function botTurn(): Promise<void> {
  if (online || !worker || engine.status() !== 0 || engine.to_move() !== BOT_SIDE) return;
  thinking = true;
  syncHint(); // no hint while the bot thinks
  const current = fight;
  const game = engine;
  const started = performance.now();
  const move = await askBot(worker, history, budget, fight ?? undefined);
  diag.botSearch(performance.now() - started, current ? { boss: current.id } : { nodes: budget });
  if (engine !== game) return; // Retry, a new fight, New game or an import replaced the game while the bot was thinking
  thinking = false;
  whenSettled(() => {
    playMove(move);
    refresh();
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
  const after = repulsions[0]?.board ?? engine.board();
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
    const game = engine;
    shown = { game, ...repulsions[0]! };
    whenSettled(() => repel(game, repulsions, 0));
  }
  const ejection = findEjection(before, after, mv);
  if (ejection) eject(ejection, mv.dir, held, reduced);
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

/** Plays repulsion `k` of `game` (#645): the pair slides apart with the lines it pushes, an ejected marble falls, then
 * the next repulsion, or the engine's board after the last. A replaced game drops what waits for its slide. */
function repel(game: Engine | Encounter, repulsions: Repulsion[], k: number): void {
  const rep = repulsions[k]!;
  const next = repulsions[k + 1];
  const after = next?.board ?? Array.from(engine.board());
  const held = gameTurns();
  const tracks: SlideTrack[] = [];
  for (const half of repulsionMoves(rep.pair)) {
    const moved = slideTracks(rep.board, after, half, false);
    turns.map = carryTurns(turns.map, fight!.seed, moved, half.dir); // a Magnetizer fight
    tracks.push(...moved);
    const ejection = findEjection(rep.board, after, half);
    if (ejection) eject(ejection, half.dir, held, false);
  }
  shown = next ? { game, ...next } : null;
  refresh();
  slide = { game: engine, tracks, start: performance.now() };
  document.body.dataset.sliding = '1';
  document.body.dataset.repulsions = String(k + 1); // read by the e2e tests: the repulsions played this ply
  if (next) afterSlide.push(() => repel(game, repulsions, k + 1));
}

/** Starts the effect of the ejected marble `mesh` along `track`, in `parent`: the scene, or the battle royale arena at
 * its own scale (#612). */
function startEjection(mesh: THREE.Mesh, track: EjectTrack, parent: THREE.Object3D, delayMs = 0): void {
  mesh.traverse((o) => {
    const material = ((o as THREE.Mesh).material as THREE.Material).clone(); // its own, to fade
    material.transparent = true;
    material.depthWrite = false; // the core stays seen through the fading glass
    material.userData.opacity = material.opacity; // the glass is see-through before it fades
    (o as THREE.Mesh).material = material;
  });
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
  animateEjections(performance.now());
  animatePasses(performance.now());
}
addEventListener('pointerdown', skipEjections, { capture: true });
addEventListener('keydown', skipEjections, { capture: true });

let selected: Axial[] = [];
let ringed: Axial[] = []; // the marbles drawn with the selection ring, read by the e2e tests
let targets: ReturnType<typeof groupTargets> = []; // the cells drawn with a target arrow, read by the e2e tests

function hud(extra = ''): void {
  backButton.hidden = !roomOf || engine.status() === 0; // once the game a hub room started is over (#522)
  if (hubAt) {
    delete document.body.dataset.over; // no end light over the hub
    document.getElementById('hud')!.innerHTML = hubHtml(hubAt, bumped);
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
    tally: history.length === 0 && status === 0 ? tallyLine({ mode: fight ? 'boss' : online ? 'online' : worker ? 'bot' : 'local', boss: fight?.id }) : '',
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
  const showGoal = goalShown(history.length, goalOpen);
  goalButton.hidden = !(engine instanceof Encounter) || status !== 0; // once the fight is over the plate has no room for another row (#271)
  goalButton.disabled = history.length === 0; // the goal is on the plate until the first move
  goalButton.setAttribute('aria-expanded', String(showGoal));
  const boss = engine instanceof Encounter ? engine : null;
  const tell = boss
    ? [
        crackText(parseCracks(boss.cracks())),
        eggText(parseEggs(boss.eggs())),
        trainText(parseTrains(boss.trains())),
        fight?.id === 'magnetizer' ? polarityText(boss.phase(), history.length) : '',
        chaplainText(exposed, boss.converted().length / 2),
        choirText(boss.next_army()),
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
  if (flatHud) {
    const flat = { phase: boss?.phase() ?? 0, phases: boss?.phases() ?? 0, tell };
    document
      .getElementById('hud')!
      .insertAdjacentHTML('beforeend', flatHudHtml({ side: engine.to_move(), status, glass: glassOf(), ejected, win, boss: boss ? flat : undefined }));
  }
  showResultCard();
}

function refresh(): void {
  if (hubAt) return drawHub(hubAt);
  if (royale) return drawRoyale(royale);
  const board = showing()?.board ?? engine.board();
  drawFrame(board);
  lightRim();
  drawNotches();
  drawTally(board);
  const moves = parseMoves(engine.legal_moves());
  targets = groupTargets(moves, selected);
  ringed = [...selected, ...hint.marked(here())]; // the selection, or the marbles the hint takes (#301)
  const cracks = engine instanceof Encounter ? parseCracks(engine.cracks()) : [];
  const left = crackLeft(cracks);
  const converted = engine instanceof Encounter ? parseCells(engine.converted()) : [];
  const armies = engine instanceof Encounter ? parseArmies(engine.armies()) : [];
  const next = engine instanceof Encounter ? engine.next_army() : -1;
  const eggs = engine instanceof Encounter ? parseEggs(engine.eggs()) : [];
  trainsShown = engine instanceof Encounter ? parseTrains(engine.trains()) : [];
  const poles = showing()?.poles ?? (engine instanceof Encounter ? Array.from(engine.polarities()) : []);
  const fresh = showing() || !(engine instanceof Encounter) ? [] : parseCells(engine.assigned());
  marbles.clear();
  marbleAt.clear();
  crackDecals = [];
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
      const ring = new THREE.Mesh(targetRingGeometry, targetMaterial);
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
    const marble = marbleMesh(side);
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
  tellSound('crack', cracks);
  tellSound('choir', ARMY_NAMES[next] ? [next] : []);
  // The drones follow how tense the game is (#439): the player's marbles a push could eject, the boss phase.
  sfx.setTension(tensionLevel(rimDanger(board, glassOf()), engine instanceof Encounter ? engine.phase() : 0));
  document.body.dataset.armies = String(armies.length); // read by the e2e tests
  document.body.dataset.nextArmy = ARMY_NAMES[next] ?? '';
  document.body.dataset.converted = String(converted.length); // read by the e2e tests
  document.body.dataset.cracks = String(cracks.length);
  document.body.dataset.eggs = String(eggs.length);
  document.body.dataset.eggCounters = eggs.map((e) => e.left).join(',');
  document.body.dataset.trains = String(trainsShown.length);
  document.body.dataset.trainCounters = trainsShown.map((t) => t.left).join(',');
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

// The hub map (#521): the board's discs on the map cells only, in a frame shrunk to the map, a pale ring on each room
// and the glass marble on its cell. No rim light, phase notch or tally mark: no game is on. A lift wears a near-black
// arrow toward its deck, as a target arrow reads 3:1 on the lit cell, with a bar across while it is locked (#523).
function drawHub(at: HubSpot): void {
  const { beaten } = loadProgress(store);
  const lifts: string[] = [];
  drawFrame(HUB_BOARD);
  lightRim();
  notches.clear();
  for (const group of tallies) group.clear();
  discs.forEach((disc, i) => (disc.visible = (HUB_BOARD[i] ?? VANISHED) !== VANISHED));
  marbles.clear();
  marbleAt.clear();
  ghosts.clear();
  sfx.setTension(0);
  for (const { cell, door } of roomsOf(at.deck)) {
    const p = axialTo3D(...cell);
    const glyph = new THREE.Mesh(outlineGeometry, paleMaterial);
    glyph.rotation.x = Math.PI / 2;
    glyph.position.set(p.x, 0.02, p.z);
    marbles.add(glyph);
    const open = door.kind === 'lift' && canEnter(door, beaten);
    if (door.kind === 'lift') {
      const arrow = new THREE.Mesh(arrowGeometry, targetMaterial);
      arrow.rotation.set(-Math.PI / 2, ((cell[1] < 0 ? 1 : -1) * Math.PI) / 2, 0, 'YXZ'); // up or down the map
      arrow.position.set(p.x, 0.02, p.z);
      marbles.add(arrow);
      lifts.push(`${door.to} ${open ? 'open' : 'locked'}`);
    }
    if (door.kind !== 'lift' || open) continue;
    const bar = new THREE.Mesh(barGeometry, targetMaterial); // a bar across the ring: a lift locked (#522, #523)
    bar.rotation.y = Math.PI / 4;
    bar.position.set(p.x, 0.02, p.z);
    marbles.add(bar);
  }
  document.body.dataset.lifts = lifts.join(','); // read by the e2e tests
  const p = axialTo3D(...at.cell);
  const marble = marbleMesh(glassOf());
  marble.position.set(p.x, 0.36, p.z);
  marbles.add(marble);
  document.body.dataset.hub = `${at.deck} ${at.cell[0]},${at.cell[1]}`; // read by the e2e tests
  hud();
}

function refreshGhosts(moves: ReturnType<typeof parseMoves>): void {
  if (royale) return; // no ghost over the arena
  const mv = hover ? moveForClick(moves, selected, hover) : null;
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

function click(q: number, r: number): void {
  if (hubAt) return walk([q, r]);
  if (royale) return pickRoyale(q, r);
  if (engine.status() !== 0) return; // over: no move, no selection (#282)
  if (thinking || online?.role === 'spectator') return;
  if (sliding()) return whenSettled(() => click(q, r)); // the next move waits for the slide
  if (online && !online.ourTurn()) return; // not our turn: our colour in versus, our human ply in co-op
  if (online && !online.canPlay()) return hud(' · waiting for opponent'); // a move would never reach them
  const side = engine.board()[cellIndex(q, r)];
  if (side === engine.to_move()) {
    selected = toggleSelection(selected, [q, r]);
    hint.clear(); // a new selection
  } else {
    // The engine is the only judge: a click that is not a legal move changes nothing.
    const mv = moveForClick(parseMoves(engine.legal_moves()), selected, [q, r]);
    if (mv) {
      const record = encodeMove(mv);
      playMove(record);
      selected = [];
      void online?.send(record);
      if (online && fight) void answerBoss(true); // co-op: our move's boss reply
    }
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
function onProp(e: PointerEvent, prop: THREE.Mesh): boolean {
  aim(e);
  return raycaster.intersectObject(prop).length > 0;
}

// One pointer that stays put is a click, one that moves is an orbit, two pointers are a pinch.
const canvas = renderer.domElement;
const pointers = new Map<number, { x: number; y: number }>();
let press: { x: number; y: number; drag: boolean } | null = null;
const span = (): number => {
  const [a, b] = [...pointers.values()];
  return Math.hypot(a!.x - b!.x, a!.y - b!.y);
};

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) press = { x: e.clientX, y: e.clientY, drag: false };
  else press!.drag = true; // a second finger never selects (press is set while any pointer is down)
});

canvas.addEventListener('pointermove', (e) => {
  const last = pointers.get(e.pointerId);
  if (last && press) {
    const prevSpan = pointers.size === 2 ? span() : 0;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) view = zoom(view, pinchScale(prevSpan, span()));
    else if (press.drag || isDrag(e.clientX - press.x, e.clientY - press.y)) {
      press.drag = true;
      view = orbit(view, e.clientX - last.x, e.clientY - last.y);
    }
    applyView();
    return;
  }
  if (hubAt) return; // no ghost over the hub
  const next = cellAt(e);
  if (next === hover) return;
  hover = next;
  refreshGhosts(parseMoves(engine.legal_moves()));
});

function release(e: PointerEvent): void {
  const wasClick = e.type === 'pointerup' && press && !press.drag && pointers.size === 1;
  pointers.delete(e.pointerId);
  if (pointers.size === 0) press = null;
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
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);

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
  view = resetView(activeRadius());
  applyView();
});
(document.getElementById('reset-view') as HTMLButtonElement).disabled = false; // listener ready (#146)

addEventListener('resize', () => {
  frameCamera();
  renderer.setPixelRatio(renderPixelRatio(devicePixelRatio, navigator.webdriver, tier));
  renderer.setSize(innerWidth, innerHeight);
  applyView(); // the reader fits the screen to the new window
});

// Used by the browser checks to click a cell by its axial coordinates.
(window as unknown as Record<string, unknown>).__cellToScreen = (q: number, r: number) => {
  const p = axialTo3D(q, r, royale ? ARENA_SCALE : 1);
  camera.updateMatrixWorld();
  const v = new THREE.Vector3(p.x, 0, p.z).project(camera);
  return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight };
};
// Used by the browser checks to see the console screen (#512) and the recorder (#517) on the window: the box around its
// corners, in pixels.
function rectOf(prop: THREE.Mesh): { x: number; y: number; width: number; height: number } {
  const box = new THREE.Box3().setFromObject(prop);
  const xs: number[] = [];
  const ys: number[] = [];
  for (const x of [box.min.x, box.max.x])
    for (const y of [box.min.y, box.max.y])
      for (const z of [box.min.z, box.max.z]) {
        const v = new THREE.Vector3(x, y, z).project(camera);
        xs.push(((v.x + 1) / 2) * innerWidth);
        ys.push(((1 - v.y) / 2) * innerHeight);
      }
  const [left, top] = [Math.min(...xs), Math.min(...ys)];
  return { x: left, y: top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
}
(window as unknown as Record<string, unknown>).__consoleRect = () => rectOf(consoleScreen);
(window as unknown as Record<string, unknown>).__recorderRect = () => rectOf(recorder);
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
// Used by the browser checks to find The Magnetizer's polarities as drawn: the cell, the sign and the ring of a fresh one.
(window as unknown as Record<string, unknown>).__polarities = () => polesDrawn;
// Used by the browser checks to read the shell's heat pulse (#509).
(window as unknown as Record<string, unknown>).__shellPulse = () => scarab.emissiveIntensity;
// Used by the browser checks to find The Chaplain's converted marbles (#326).
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
        const reply = await askBot(worker, history, budget, fight ?? undefined);
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
  if (hubAt) {
    leaveHub();
    applyDeck(deckOf('local'));
  }
  engine = new Engine();
  history.length = 0;
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
  view = resetView(activeRadius());
  applyView();
  refresh();
}
for (const id of boss_ids()) {
  const entry = document.createElement('button');
  entry.type = 'button';
  entry.textContent = boss_name(id)!;
  entry.addEventListener('click', () => startBoss(id, crypto.getRandomValues(new Uint32Array(1))[0]!));
  bossList.appendChild(entry);
}
bossButton.addEventListener('click', () => {
  if (online) return;
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
  if (online) return;
  moveModes('pick');
  leaveRoyale();
  enterHub(loadProgress(store).at);
});
shipButton.disabled = false; // listener ready (#146)
function enterHub(at: HubSpot): void {
  roomOf = null;
  bumped = '';
  hubAt = at;
  evalBar.hidden = hintButton.hidden = exportButton.hidden = importButton.hidden = true; // no game on in the hub: a new game shows them again (#583, #589)
  analyst.stop();
  applyDeck(at.deck);
  refresh();
}
function walk(to: Axial): void {
  const progress = loadProgress(store);
  const from = hubAt!;
  hubAt = step(from, to, progress.beaten);
  bumped = bumpLine(from, to, progress.beaten);
  if (hubAt === from) return hud(); // not a neighbour, or a locked lift
  saveProgress(store, { ...progress, at: hubAt });
  if (hubAt.deck !== deck) applyDeck(hubAt.deck);
  refresh();
  enterRoom(hubAt);
}
// The doors (#522): rolling onto a boss door or a table starts the same game as its mode menu entry, and the room is
// kept for Back to the ship. A terminal opens its lore entry in the reader, and Esc leaves it to the hub on the same
// cell (#524). A lift starts nothing here.
function enterRoom(at: HubSpot): void {
  const door = roomAt(at.deck, at.cell);
  if (door?.kind === 'terminal') return openReader(door.lore);
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
  hubAt = null;
  delete document.body.dataset.hub;
  delete document.body.dataset.lifts;
}
addEventListener('keydown', (e) => {
  // An open terminal reader pages by them, a text field moves its caret.
  const to = hubAt && !reading && !(e.target instanceof HTMLInputElement) ? arrowCell(hubAt.cell, e.key) : null;
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
  if (online || fight || hubAt) return; // the player left for another game, or the hub, while the file was read
  if ('refused' in read) return hud(` · ${read.refused}`);
  engine = read.engine;
  history.length = 0;
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
const inviteBox = document.getElementById('invite') as HTMLInputElement;
const inviteLabel = document.getElementById('invite-label')!;
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
    const move = await askBot(analysisWorker, history.slice(), budget, fight!);
    await new Promise<void>((done) => whenSettled(() => (replay(move, live), refresh(), done())));
  })();
  return bossReply;
}
function replay(mv: ArrayLike<number>, live: boolean): void {
  const before = Array.from(engine.board());
  engine.play(Int32Array.from(mv));
  afterPlay(before, Array.from(mv), live);
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
  selected = [];
  leaveRoyale();
  diag.connecting();
  const net =
    new URLSearchParams(location.search).get('net') === 'hook'
      ? hookTransport()
      : p2pTransport(room, (message) => diag.joinError(message));
  link = net;
  // The creator waits for an opponent as long as it takes, a joiner should find the creator's room at once.
  if (side !== 1) setTimeout(() => diag.timeout(), SIGNALING_TIMEOUT_MS);
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
}
/** Opens a new room as its creator and shows its invite link: a co-op room with `coop` (#529), a versus room without. */
function playOnline(coop?: CoopFight): void {
  moveModes('pick');
  const room = newRoomId((b) => crypto.getRandomValues(b));
  inviteBox.value = inviteUrl(location.href, room, coop);
  location.hash = new URL(inviteBox.value).hash;
  inviteBox.hidden = false;
  inviteLabel.hidden = false;
  inviteLabel.textContent = `Invite link: send it to your ${coop ? 'partner' : 'opponent'}`;
  void goOnline(room, 1, coop);
}
document.getElementById('play-online')!.addEventListener('click', () => playOnline());
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
  inviteBox.hidden = inviteLabel.hidden = rematchButton.hidden = true;
  newGameButton.hidden = false;
  window.history.replaceState(null, '', location.pathname + location.search); // no room in the address
}
const playOnlineButton = document.getElementById('play-online') as HTMLButtonElement;
setButton(playOnlineButton, 'Play online', icon('online'));

// The offline battle royale (#502, rules.md section 10.4): Battle royale starts 1 player against 5 bots on the radius 8
// arena, at the Furnace. The player presses a target on the arena, as a move, which locks the order (#611), or holds;
// the bots' orders come from the round-start state, and the round resolves. The HUD plate shows the next round's
// initiative order before its reveal, and the reveal of the last round. A boss fight, Play online or Ship leaves it,
// and it leaves Ship.
const holdButton = document.getElementById('royale-hold') as HTMLButtonElement;
function startRoyale(file: RoyaleFile): void {
  leaveHub();
  stopAnalysis();
  fight = null;
  delete document.body.dataset.boss;
  delete document.body.dataset.over;
  engine = new Engine(); // a bot reply to the old game is dropped (botTurn)
  history.length = 0;
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
  targets = reveal ? [] : groupTargets(parseMoves(game.legal_orders(YOU)), selected);
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
      const ring = new THREE.Mesh(targetRingGeometry, targetMaterial);
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
  const end = royaleBanner(placed, YOU);
  if (end) document.body.dataset.over = end.anim;
  else delete document.body.dataset.over;
  const { board, cracks } = arenaView(game);
  const log = parseLog(game.round_log());
  const shown = log && reveal ? { ...log, turns: log.turns.slice(0, shownAt(reveal.plan, reveal.ms)) } : log;
  document.getElementById('hud')!.innerHTML = royaleHtml(shown, { out: outSeats(board), cracks, standings: placed });
  holdButton.disabled = end !== null;
  backButton.hidden = !roomOf || end === null;
}
// A press on one of the player's marbles selects it, a press on a target locks that move as the order and plays the
// round (#611). Once the game is over a press does nothing.
function pickRoyale(q: number, r: number): void {
  endReveal();
  const game = royale!;
  if (game.placement().length) return;
  if (seatAt(game.board()[cellIndex(q, r, ARENA)]!) === YOU) {
    selected = toggleSelection(selected, [q, r]);
    return refresh();
  }
  const mv = moveForClick(parseMoves(game.legal_orders(YOU)), selected, [q, r]);
  if (mv) playRound(encodeMove(mv));
}
// Under reduced motion the arena jumps to the new position (#612).
function playRound(mine: readonly number[]): void {
  endReveal();
  const game = royale!;
  if (game.placement().length) return; // Hold pressed during the reveal of the last round
  const before = game.board();
  const cracks = game.cracks();
  const orders = roundOrders(game, mine);
  game.resolve(orders);
  selected = [];
  if (reducedMotion()) return refresh();
  const plan = buildReveal(before, orders, parseLog(game.round_log())!, game.board());
  reveal = { plan, cracks, start: performance.now(), ms: 0, at: -1 };
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
  playOnlineButton.disabled = coopButton.disabled = state.disabled;
  offlineNotice = state.notice;
  hud();
}
addEventListener('online', syncConnectivity);
addEventListener('offline', syncConnectivity);
playReady = true; // engine and listener ready (#127)
syncConnectivity();
const invited = roomFromHash(location.hash);
const coopInvite = coopFromHash(location.hash);
if (invited) void goOnline(invited, 2);
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
if (!hubAt) void botTurn(); // a resumed game saved while the bot was thinking
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
let lastParticleNow = 0;
function animateParticles(now: number): void {
  if (!particles.visible) {
    lastParticleNow = now;
    return;
  }
  const dt = lastParticleNow ? Math.min(0.08, (now - lastParticleNow) / 1000) : 0.016;
  lastParticleNow = now;
  const conf = DECK_PARTICLES[deck];
  for (let i = 0; i < conf.count; i++) {
    const o = i * 3;
    particlePositions[o]! += conf.drift[0] * dt * 10; // o + 2 < 3 * MAX_PARTICLES: always a number
    particlePositions[o + 1]! += conf.drift[1] * dt * 10;
    particlePositions[o + 2]! += conf.drift[2] * dt * 10;
    const x = particlePositions[o]!;
    const y = particlePositions[o + 1]!;
    const z = particlePositions[o + 2]!;
    if (y > 7.5 || y < -0.4 || Math.hypot(x, z) > 17.5 || Math.hypot(x, z) < 5.2) {
      resetParticle(i);
    }
  }
  particlePositionAttr.needsUpdate = true;
}

renderer.setAnimationLoop((now) => {
  if (fpsOn) {
    fpsStamps = keepWindow(fpsStamps, now);
    lastFps = fpsOf(fpsStamps);
    fpsBox.textContent = `${lastFps} FPS`;
  }
  animateSlides(now);
  animateReveal(now);
  animateEjections(now);
  animatePasses(now);
  animateParticles(now);
  eggGlowMaterial.opacity = eggGlow(now / 1000, reducedMotion());
  scarab.emissiveIntensity = pulsing ? pulseAt(now / 1000) : 0;
  turnConsole(now);
  tickLog(now);
  if (!drawDue(now, lastDraw.start, lastDraw.cost, drawAsked, navigator.webdriver)) return;
  renderer.render(scene, camera);
  draws++;
  drawAsked = false;
  lastDraw = { start: now, cost: performance.now() - now };
});
