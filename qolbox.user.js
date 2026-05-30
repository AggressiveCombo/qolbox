// ==UserScript==
// @name         QOLBox
// @namespace    Violentmonkey Scripts
// @author       gpt-5.4 and gpt-5.5
// @version      1.5.1
// @description  Fullscreen hitbox.io, reserve spots for full lobbies, tab indicator when your game starts, Esc chat cancel, persistent audio controls, and a first-start setup menu for choosing QOLBox features.
// @license      ISC
// @match        https://hitbox.io/
// @match        https://www.hitbox.io/
// @match        https://hitbox.io/game2.html*
// @match        https://www.hitbox.io/game2.html*
// @run-at       document-start
// @inject-into  page
// @grant        none
// @downloadURL https://update.greasyfork.org/scripts/568667/QOLbox.user.js
// @updateURL https://update.greasyfork.org/scripts/568667/QOLbox.meta.js
// ==/UserScript==

(function () {
  'use strict';

  const GAME_VOLUME_KEY = 'vm.hitbox.volumePercent';
  const JUKEBOX_STATE_KEY = 'vm.hitbox.jukeboxState';
  const FEATURE_SETTINGS_KEY = 'vm.hitbox.qolboxFeatures';
  const ONBOARDING_COMPLETE_KEY = 'vm.hitbox.qolboxOnboardingComplete';

  const STEP_PERCENT = 5;
  const KEYBOARD_PAGE_STEP_MULTIPLIER = 4;
  const DEFAULT_GAME_PERCENT = 100;
  const DEFAULT_JUKEBOX_PERCENT = 50;
  const DESKTOP_LOBBY_CHAT_PROMPT = 'Press enter to send a message';
  const TOUCH_LOBBY_CHAT_PROMPT = 'Tap here to send a message';
  const GAME_CURVE_EXPONENT = 2;
  const JUKEBOX_CURVE_EXPONENT = 2;
  const GLOBAL_STYLE_ID = 'qolbox-style';
  const MENU_KEY_LABEL = 'F8';
  const MENU_KEY = 'F8';
  const QOLBOX_MENU_ID = 'qolboxOnboardingMenu';
  const QOLBOX_MENU_ROOT_CLASS = 'qolbox-menu-open';
  const FEATURE_FULLSCREEN = 'fullscreen';
  const FEATURE_AUDIO = 'audio';
  const FEATURE_RESERVE = 'reserve';
  const FEATURE_CHAT = 'chat';
  const FEATURE_GAME_START_ALERT = 'gameStartAlert';
  const FEATURE_DEFINITIONS = [
    {
      key: FEATURE_FULLSCREEN,
      title: 'Fullscreen Layout',
      shortTitle: 'Fullscreen',
      summary: 'Center and scale hitbox.io so the play area uses the browser window cleanly.',
    },
    {
      key: FEATURE_AUDIO,
      title: 'Audio Controls',
      shortTitle: 'Audio',
      summary: 'Remember volume choices, make the sliders easier to adjust, and keep jukebox mute behavior stable.',
    },
    {
      key: FEATURE_RESERVE,
      title: 'Reserve Spots',
      shortTitle: 'Reserve',
      summary: 'Wait for a spot in full custom lobbies instead of immediately giving up on room_full.',
    },
    {
      key: FEATURE_CHAT,
      title: 'Chat Cancel',
      shortTitle: 'Chat',
      summary: 'Press Esc while typing to discard the draft and return to the game without sending anything.',
    },
    {
      key: FEATURE_GAME_START_ALERT,
      title: 'Away Game Alert',
      shortTitle: 'Game Alert',
      summary: 'Flash the tab title and favicon when a lobby game starts while you are away and playing.',
    },
  ];

  const FALLBACK_BASE_WIDTH = 800;
  const FALLBACK_BASE_HEIGHT = 500;
  const MENU_FRAME_PADDING_PX = 0;
  const GAMEPLAY_SAFE_TOP_PX = 0;
  const GAMEPLAY_SAFE_BOTTOM_PX = 0;
  const GAMEPLAY_SAFE_SIDE_PX = 0;
  const SCORE_ROW_FALLBACK_RGB = { red: 225, green: 21, blue: 0 };
  const TEAM_SCORE_COLORS = new Map([
    [2, { red: 225, green: 21, blue: 0 }],
    [3, { red: 0, green: 117, blue: 225 }],
  ]);
  const FULLSCREEN_GAMEPLAY_LAYER_SELECTOR = '#pixiContainer, #singlePlayer, .singlePlayer';
  const FULLSCREEN_EDITOR_LAYER_SELECTOR = '#editorContainer';
  const FULLSCREEN_MENU_LAYER_SELECTOR = '.replayViewer';
  const CHAT_INPUT_SELECTOR = '.inGameChat .input, .lobbyContainer .chatBox .input';
  const FULLSCREEN_PLAY_LAYER_SELECTOR = [
    FULLSCREEN_GAMEPLAY_LAYER_SELECTOR,
    FULLSCREEN_EDITOR_LAYER_SELECTOR,
  ].join(', ');
  const FULLSCREEN_RENDER_LAYER_SELECTOR = [
    FULLSCREEN_PLAY_LAYER_SELECTOR,
    FULLSCREEN_MENU_LAYER_SELECTOR,
  ].join(', ');
  const FULLSCREEN_RENDER_CANVAS_SELECTORS = [
    '#pixiContainer canvas',
    '#singlePlayer canvas',
    '.singlePlayer canvas',
    '#editorContainer > canvas',
    '.replayViewer canvas',
  ];
  const FULLSCREEN_RENDER_CANVAS_SELECTOR = FULLSCREEN_RENDER_CANVAS_SELECTORS.join(', ');
  const FULLSCREEN_RENDER_CANVAS_FOCUS_SELECTOR = FULLSCREEN_RENDER_CANVAS_SELECTORS
    .flatMap(selector => [`${selector}:focus`, `${selector}:focus-visible`])
    .join(', ');
  const FULLSCREEN_LAYOUT_TARGET_SELECTOR = [
    '#appContainer',
    '#relativeContainer',
    '#backgroundImage',
    FULLSCREEN_RENDER_LAYER_SELECTOR,
    FULLSCREEN_RENDER_CANVAS_SELECTOR,
    '.inGameCSS',
    '.scores',
    '.spectateControls',
  ].join(', ');
  const FEATURE_PATCH_TARGET_SELECTOR = [
    CHAT_INPUT_SELECTOR,
    '.items.left',
    '.items.left .item',
    '.jukebox',
    '.jukebox .knob.volumeContainer',
    '#ytContainer',
    '#ytContainer iframe',
    '.roomListContainer',
    '.roomListContainer .scrollBox tr',
    '.roomListContainer .bottomButton.right',
    '.passwordWindowContainer',
    '.connectingWindowContainer',
    '.lobbyContainer',
  ].join(', ');
  const FULLSCREEN_SETTLE_PASSES = 4;
  const FULLSCREEN_NATIVE_LAYOUT_WAIT_MS = 2500;
  const RESIZE_SETTLE_PASSES = 2;

  const JUKEBOX_MIN_ANGLE = -40;
  const JUKEBOX_MAX_ANGLE = 220;
  const JUKEBOX_ARC_CENTER = 14;
  const JUKEBOX_ARC_RADIUS = 12;
  const JUKEBOX_WHEEL_STEP = 5;
  const JUKEBOX_DRAG_SENSITIVITY = 1;
  const JUKEBOX_ANGLE_EPSILON = 1e-6;
  const YOUTUBE_HOOK_RETRY_DELAY_MS = 250;
  const YOUTUBE_HOOK_MAX_RETRIES = 120;
  const RESERVE_BUTTON_TEXT = 'RESERVE';
  const JOIN_BUTTON_TEXT = 'JOIN';
  const RESERVE_WAIT_TITLE_TEXT = 'Waiting for a Spot';
  const RESERVE_WAIT_TEXT = 'Waiting for someone to leave...';
  const RESERVE_STATUS_FALLBACK_TEXT = 'Connecting...';
  const RESERVE_UNAVAILABLE_TITLE_TEXT = 'Lobby Not Available';
  const RESERVE_ONE_PERSON_TEXT = 'This lobby only allows one person, so there is no spot to reserve.';
  const RESERVE_RETRY_DELAY_MS = 2500;
  const RESERVE_COUNTDOWN_UPDATE_MS = 100;
  const RESERVE_RETRY_AUDIO_SUPPRESS_MS = 900;
  const RESERVE_JOINED_ROOM_FULL_SUPPRESS_MS = 12000;
  const RESERVE_ROOM_FULL_PATTERN = /room[_ ]?full|room is full/i;
  const RESERVE_ROOM_CLOSED_PATTERN = /room[_ ]?not[_ ]?found|room has just closed/i;
  const RESERVE_WRONG_PASSWORD_PATTERN = /wrong[_ ]?password|password incorrect|incorrect password/i;
  const GAME_START_TITLE_PREFIX = '[GAME STARTED] ';
  const GAME_PULLED_TITLE_PREFIX = '[PULLED INTO GAME] ';
  const GAME_START_TITLE_PREFIXES = [GAME_START_TITLE_PREFIX, GAME_PULLED_TITLE_PREFIX];
  const GAME_START_INDICATOR_DELAY_MS = 1200;
  const GAME_START_WATCH_INTERVAL_MS = 750;
  const GAME_START_FLASH_INTERVAL_MS = 700;
  const GAME_START_END_WATCH_INTERVAL_MS = 1000;
  const GAME_START_FAVICON_HREF =
    'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22%3E%3Crect width=%2264%22 height=%2264%22 rx=%2212%22 fill=%22%23f5c542%22/%3E%3Cpath d=%22M32 10 56 54H8Z%22 fill=%22%23111111%22/%3E%3Crect x=%2229%22 y=%2223%22 width=%226%22 height=%2217%22 rx=%223%22 fill=%22%23f5c542%22/%3E%3Ccircle cx=%2232%22 cy=%2247%22 r=%223%22 fill=%22%23f5c542%22/%3E%3C/svg%3E';
  const IS_QOLBOX_GAME_PAGE = /\/game2\.html$/i.test(window.location.pathname);

  if (!IS_QOLBOX_GAME_PAGE) {
    installTopLevelGameStartRelay();
    return;
  }

  let featureSettings = loadFeatureSettings();
  let onboardingComplete = loadOnboardingComplete();
  let onboardingStepIndex = 0;
  let qolboxMenuMode = 'closed';
  let qolboxMenuHooksInstalled = false;
  let gamePercent = loadGamePercent();
  let currentGameMenuItem = null;
  let originalHowlVolume = null;
  let originalHowlPlay = null;
  let settingGameVolumeInternally = false;

  let jukeboxState = loadJukeboxState();
  let currentJukeboxMenuItem = null;
  let activeKnobDrag = null;
  let trackedPlayers = new Set();
  let youTubeHookInstalled = false;
  let youTubeHookRetryTimer = 0;
  let youTubeHookRetryCount = 0;
  let youTubeReadyCallbackHookInstalled = false;
  let fullscreenHooksInstalled = false;
  let lastFullscreenSignature = '';
  let scheduledWorkRaf = 0;
  let scheduledWorkForce = false;
  let scheduledWorkFeatures = false;
  let scheduledWorkPasses = 0;
  let fullscreenMutationObserver = null;
  let fullscreenResizeObserver = null;
  let fullscreenStyleSnapshots = new WeakMap();
  let fullscreenNativeLayoutWaitStartedAt = 0;
  let observedResizeTargets = new WeakSet();
  let gameReadyHookInstalled = false;
  let chatEscapeHooksInstalled = false;
  let tabFocusHooksInstalled = false;
  let reserveSocketHookInstalled = false;
  let reserveFeatureDomPatched = false;
  let reserveSelectedRoomRow = null;
  let reserveSelectedRoomSignature = '';
  let reserveSelectedRoomWasFull = false;
  let reserveSelectedRoomWasUnavailable = false;
  let reservePasswordPromptPending = false;
  let reserveCapturedJoin = null;
  let reserveStatusWatchTimer = 0;
  let reserveCountdownTimer = 0;
  let reserveRetryAudioSuppressUntil = 0;
  let reserveJoinedRoomFullSuppressUntil = 0;
  let reserveState = null;
  let suppressEscapeKeyUntil = 0;
  let lobbyMusicPatchInstalled = false;
  let gameStartIndicatorHooksInstalled = false;
  let gameStartSessionHookTarget = null;
  let gameStartIndicatorActive = false;
  let gameStartIndicatorTimer = 0;
  let gameStartWatchTimer = 0;
  let gameStartEndWatchTimer = 0;
  let gameStartIndicatorFlashTimer = 0;
  let gameStartIndicatorFlashOn = false;
  let gameStartIndicatorFaviconLink = null;
  let gameStartOriginalFavicon = null;
  let gameStartOriginalTitle = '';
  let gameStartWasPlayingWhenUnfocused = false;
  let gameStartWasInLobbyWhenUnfocused = false;
  let gameStartIndicatorReason = 'started';
  let gameStartPageFocused = true;

  function clampPercent(value, fallback = 0) {
    if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
      return fallback;
    }

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return fallback;
    }

    return Math.max(0, Math.min(100, Math.round(numericValue / STEP_PERCENT) * STEP_PERCENT));
  }

  function clampJukeboxPercent(value) {
    if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
      return DEFAULT_JUKEBOX_PERCENT;
    }

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return DEFAULT_JUKEBOX_PERCENT;
    }

    return Math.max(0, Math.min(100, Math.round(numericValue)));
  }

  function loadGamePercent() {
    try {
      return clampPercent(localStorage.getItem(GAME_VOLUME_KEY), DEFAULT_GAME_PERCENT);
    } catch {
      return DEFAULT_GAME_PERCENT;
    }
  }

  function saveGamePercent() {
    try {
      localStorage.setItem(GAME_VOLUME_KEY, String(gamePercent));
    } catch {
      // Ignore storage failures.
    }
  }

  function loadJukeboxState() {
    const fallback = { percent: null, muted: false };

    try {
      const rawState = localStorage.getItem(JUKEBOX_STATE_KEY);
      if (!rawState) {
        return fallback;
      }

      const parsed = JSON.parse(rawState);
      return {
        percent:
          parsed && parsed.percent !== null && parsed.percent !== undefined
            ? clampJukeboxPercent(parsed.percent)
            : null,
        muted: Boolean(parsed && parsed.muted),
      };
    } catch {
      return fallback;
    }
  }

  function saveJukeboxState() {
    try {
      localStorage.setItem(JUKEBOX_STATE_KEY, JSON.stringify(jukeboxState));
    } catch {
      // Ignore storage failures.
    }
  }

  function getDefaultFeatureSettings() {
    const defaults = {};
    for (const feature of FEATURE_DEFINITIONS) {
      defaults[feature.key] = true;
    }
    return defaults;
  }

  function loadFeatureSettings() {
    const defaults = getDefaultFeatureSettings();

    try {
      const rawSettings = localStorage.getItem(FEATURE_SETTINGS_KEY);
      if (!rawSettings) {
        return defaults;
      }

      const parsedSettings = JSON.parse(rawSettings);
      if (!parsedSettings || typeof parsedSettings !== 'object') {
        return defaults;
      }

      for (const feature of FEATURE_DEFINITIONS) {
        if (Object.prototype.hasOwnProperty.call(parsedSettings, feature.key)) {
          defaults[feature.key] = parsedSettings[feature.key] !== false;
        }
      }
    } catch {
      // Defaults keep the script usable when storage is unavailable.
    }

    return defaults;
  }

  function saveFeatureSettings() {
    try {
      localStorage.setItem(FEATURE_SETTINGS_KEY, JSON.stringify(featureSettings));
    } catch {
      // Ignore storage failures.
    }
  }

  function loadOnboardingComplete() {
    try {
      return localStorage.getItem(ONBOARDING_COMPLETE_KEY) === 'true';
    } catch {
      return false;
    }
  }

  function saveOnboardingComplete() {
    try {
      localStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
    } catch {
      // Ignore storage failures.
    }
  }

  function isKnownFeature(featureKey) {
    return FEATURE_DEFINITIONS.some(feature => feature.key === featureKey);
  }

  function isFeatureEnabled(featureKey) {
    return featureSettings[featureKey] !== false;
  }

  function shouldRunFeature(featureKey) {
    return onboardingComplete && isFeatureEnabled(featureKey);
  }

  function percentToGameScalar(percent) {
    return Math.pow(clampPercent(percent, DEFAULT_GAME_PERCENT) / 100, GAME_CURVE_EXPONENT);
  }

  function percentToJukeboxVolume(percent) {
    return Math.round(Math.pow(clampJukeboxPercent(percent) / 100, JUKEBOX_CURVE_EXPONENT) * 100);
  }

  function percentToJukeboxAngle(percent) {
    const normalized = clampJukeboxPercent(percent) / 100;
    return JUKEBOX_MIN_ANGLE + (JUKEBOX_MAX_ANGLE - JUKEBOX_MIN_ANGLE) * normalized;
  }

  function getKeyboardPercentTarget(event, currentPercent, stepPercent) {
    if (!event || event.altKey || event.ctrlKey || event.metaKey) {
      return null;
    }

    const current = Number.isFinite(Number(currentPercent)) ? Number(currentPercent) : 0;
    const step = Math.max(1, Number(stepPercent) || 1);

    switch (event.key) {
      case 'ArrowUp':
      case 'ArrowRight':
        return current + step;
      case 'ArrowDown':
      case 'ArrowLeft':
        return current - step;
      case 'PageUp':
        return current + step * KEYBOARD_PAGE_STEP_MULTIPLIER;
      case 'PageDown':
        return current - step * KEYBOARD_PAGE_STEP_MULTIPLIER;
      case 'Home':
        return 0;
      case 'End':
        return 100;
      default:
        return null;
    }
  }

  function angleToJukeboxPercent(angle) {
    const numericAngle = Number(angle);
    if (!Number.isFinite(numericAngle)) {
      return DEFAULT_JUKEBOX_PERCENT;
    }

    const normalizedAngle = normalizeJukeboxAngle(numericAngle);
    const normalized =
      (Math.min(JUKEBOX_MAX_ANGLE, Math.max(JUKEBOX_MIN_ANGLE, normalizedAngle)) - JUKEBOX_MIN_ANGLE) /
      (JUKEBOX_MAX_ANGLE - JUKEBOX_MIN_ANGLE);
    return clampJukeboxPercent(normalized * 100);
  }

  function normalizeJukeboxAngle(angle) {
    const numericAngle = Number(angle);
    if (!Number.isFinite(numericAngle)) {
      return percentToJukeboxAngle(DEFAULT_JUKEBOX_PERCENT);
    }

    const candidates = [numericAngle, numericAngle + 360, numericAngle - 360];
    for (const candidate of candidates) {
      if (
        candidate >= JUKEBOX_MIN_ANGLE - JUKEBOX_ANGLE_EPSILON &&
        candidate <= JUKEBOX_MAX_ANGLE + JUKEBOX_ANGLE_EPSILON
      ) {
        return Math.max(JUKEBOX_MIN_ANGLE, Math.min(JUKEBOX_MAX_ANGLE, candidate));
      }
    }

    return Math.max(JUKEBOX_MIN_ANGLE, Math.min(JUKEBOX_MAX_ANGLE, numericAngle));
  }

  function parseJukeboxAngleFromTransform(transform) {
    if (typeof transform !== 'string' || transform === '' || transform === 'none') {
      return null;
    }

    const rotateMatch = transform.match(/rotate\(\s*(-?\d+(?:\.\d+)?)deg\s*\)/i);
    if (rotateMatch) {
      return normalizeJukeboxAngle(Number(rotateMatch[1]));
    }

    const matrixMatch = transform.match(/^matrix\(([^)]+)\)$/i);
    if (matrixMatch) {
      const values = matrixMatch[1].split(',').map(value => Number(value.trim()));
      if (values.length >= 4 && values.every(Number.isFinite)) {
        return normalizeJukeboxAngle((Math.atan2(values[1], values[0]) * 180) / Math.PI);
      }
    }

    const matrix3dMatch = transform.match(/^matrix3d\(([^)]+)\)$/i);
    if (matrix3dMatch) {
      const values = matrix3dMatch[1].split(',').map(value => Number(value.trim()));
      if (values.length >= 16 && values.every(Number.isFinite)) {
        return normalizeJukeboxAngle((Math.atan2(values[1], values[0]) * 180) / Math.PI);
      }
    }

    return null;
  }

  function polarToArcPoint(angle) {
    const radians = ((angle + 180) * Math.PI) / 180;
    return {
      x: JUKEBOX_ARC_CENTER + JUKEBOX_ARC_RADIUS * Math.cos(radians),
      y: JUKEBOX_ARC_CENTER + JUKEBOX_ARC_RADIUS * Math.sin(radians),
    };
  }

  function getFeatureRootClass(featureKey) {
    return `qolbox-feature-${featureKey}`;
  }

  function applyFeatureRootClasses() {
    const root = document.documentElement;
    if (!root || !root.classList) {
      return;
    }

    for (const feature of FEATURE_DEFINITIONS) {
      root.classList.toggle(getFeatureRootClass(feature.key), shouldRunFeature(feature.key));
    }

    root.classList.toggle(QOLBOX_MENU_ROOT_CLASS, qolboxMenuMode !== 'closed');
  }

  function prefixSelectorList(prefix, selectorList) {
    return selectorList
      .split(',')
      .map(selector => `${prefix} ${selector.trim()}`)
      .join(',\n      ');
  }

  function ensureGlobalStyle() {
    if (document.getElementById(GLOBAL_STYLE_ID)) {
      return true;
    }

    const styleHost = document.head || document.documentElement;
    if (!styleHost) {
      return false;
    }

    const style = document.createElement('style');
    style.id = GLOBAL_STYLE_ID;
    style.textContent = `
      html.qolbox-feature-fullscreen,
      html.qolbox-feature-fullscreen body {
        width: 100vw !important;
        height: 100vh !important;
        margin: 0 !important;
        overflow: hidden !important;
        background: #0a0a0a !important;
      }

      html.qolbox-feature-fullscreen #appContainer,
      html.qolbox-feature-fullscreen #relativeContainer {
        margin: 0 !important;
        max-width: none !important;
        max-height: none !important;
        border: 0 !important;
      }

      html.qolbox-feature-fullscreen #backgroundImage,
      html.qolbox-feature-fullscreen .mainMenuFancy {
        position: fixed !important;
        left: 0 !important;
        top: 0 !important;
        right: auto !important;
        bottom: auto !important;
        width: 100vw !important;
        height: 100vh !important;
        max-width: none !important;
        max-height: none !important;
      }

      ${prefixSelectorList('html.qolbox-feature-fullscreen', FULLSCREEN_RENDER_LAYER_SELECTOR)} {
        position: absolute !important;
        margin: 0 !important;
        max-width: none !important;
        max-height: none !important;
        overflow: hidden !important;
        transform: none !important;
      }

      html.qolbox-feature-fullscreen #editorContainer {
        overflow: visible !important;
        transform-origin: top left !important;
      }

      ${prefixSelectorList('html.qolbox-feature-fullscreen', FULLSCREEN_RENDER_CANVAS_SELECTOR)} {
        display: block !important;
        max-width: none !important;
        max-height: none !important;
        transform: none !important;
      }

      /* Keep game keyboard focus after chat closes without drawing a browser focus ring over the playfield. */
      ${prefixSelectorList('html.qolbox-feature-chat', FULLSCREEN_RENDER_CANVAS_FOCUS_SELECTOR)} {
        outline: 0 !important;
        outline-color: transparent !important;
        outline-style: none !important;
        outline-width: 0 !important;
      }

      html.qolbox-feature-fullscreen .scores {
        display: none !important;
      }

      html.qolbox-feature-fullscreen .scores .title {
        background-color: rgb(56, 56, 56) !important;
      }

      html.qolbox-feature-fullscreen .scores .title,
      html.qolbox-feature-fullscreen .scores .entryContainer,
      html.qolbox-feature-fullscreen .scores .entryContainer .number,
      html.qolbox-feature-fullscreen .scores .entryContainer .name {
        vertical-align: middle !important;
      }

      html.qolbox-feature-fullscreen #email,
      html.qolbox-feature-fullscreen #songcredit,
      html.qolbox-feature-fullscreen #betaLink {
        display: none !important;
      }

      html.qolbox-feature-reserve body.qolbox-reserve-active .connectingWindowContainer:not(.qolboxReserveWindowContainer) {
        display: none !important;
      }

      .qolboxReserveWindowContainer {
        display: none;
        z-index: 10000;
      }

      html.qolbox-feature-reserve body.qolbox-reserve-active .qolboxReserveWindowContainer {
        display: block !important;
      }

      html.qolbox-feature-reserve .roomListContainer .bottomButton.right.qolboxReserveUnavailable {
        cursor: not-allowed !important;
        filter: grayscale(1) saturate(0.35) !important;
        opacity: 0.48 !important;
      }

      .qolboxReserveWindowContainer .qolboxReserveContent {
        align-items: center;
        bottom: 48px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        justify-content: center;
        left: 16px;
        pointer-events: none;
        position: absolute;
        right: 16px;
        text-align: center;
        top: 50px;
      }

      .qolboxReserveWindowContainer .connectingWindow .spinner {
        bottom: auto !important;
        flex: 0 0 auto;
        left: auto !important;
        margin: 0 auto;
        order: 2;
        position: static !important;
        right: auto !important;
        top: auto !important;
      }

      .qolboxReserveWindowContainer .qolboxReserveStatus,
      .qolboxReserveWindowContainer .qolboxReserveCountdown,
      .qolboxReserveWindowContainer .qolboxReserveMessage {
        width: 100%;
      }

      .qolboxReserveWindowContainer .qolboxReserveStatus {
        color: rgb(205, 210, 218);
        font-size: 11px;
        line-height: 14px;
        min-height: 14px;
        order: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .qolboxReserveWindowContainer .qolboxReserveCountdown {
        color: rgb(242, 242, 242);
        font-size: 13px;
        line-height: 16px;
        min-height: 16px;
        order: 3;
        white-space: nowrap;
      }

      .qolboxReserveWindowContainer .qolboxReserveMessage {
        color: rgb(242, 242, 242);
        font-size: 13px;
        line-height: 16px;
        order: 1;
        white-space: normal;
      }

      .qolboxMenuOverlay {
        align-items: center;
        background: rgba(0, 0, 0, 0.72);
        box-sizing: border-box;
        display: flex;
        font-family: inherit;
        inset: 0;
        justify-content: center;
        opacity: 0;
        padding: 10px;
        pointer-events: none;
        position: fixed;
        z-index: 2147483647;
      }

      html.qolbox-menu-open .qolboxMenuOverlay {
        opacity: 1;
        pointer-events: auto;
      }

      .qolboxMenuPanel {
        background: rgba(22, 24, 28, 0.98);
        border: 2px solid rgb(69, 75, 86);
        border-radius: 4px;
        box-shadow: 0 8px 28px rgba(0, 0, 0, 0.55);
        box-sizing: border-box;
        color: #f4f4f4;
        display: flex;
        flex-direction: column;
        max-height: calc(100vh - 20px);
        max-width: min(430px, calc(100vw - 20px));
        overflow: hidden;
        width: 430px;
      }

      .qolboxMenuTopBar {
        background: rgb(56, 56, 56);
        border-bottom: 2px solid rgb(14, 16, 20);
        box-sizing: border-box;
        color: #f5c542;
        font-size: 14px;
        font-weight: 700;
        line-height: 18px;
        min-height: 32px;
        padding: 7px 12px;
        text-align: center;
      }

      .qolboxMenuBody {
        box-sizing: border-box;
        display: flex;
        flex: 1 1 auto;
        flex-direction: column;
        gap: 8px;
        min-height: 0;
        overflow: auto;
        padding: 12px;
      }

      .qolboxMenuTitle {
        color: #ffffff;
        font-size: 18px;
        font-weight: 700;
        letter-spacing: 0;
        line-height: 22px;
        margin: 0;
      }

      .qolboxMenuText {
        color: #d7dbe1;
        font-size: 12px;
        line-height: 16px;
        margin: 0;
      }

      .qolboxMenuProgress {
        align-items: center;
        display: flex;
        gap: 4px;
        margin-top: 2px;
      }

      .qolboxMenuDot {
        background: rgba(255, 255, 255, 0.25);
        border-radius: 999px;
        height: 5px;
        width: 12px;
      }

      .qolboxMenuDot.active {
        background: #f5c542;
      }

      .qolboxMenuToggleGroup {
        background: rgb(31, 34, 39);
        border: 1px solid rgb(72, 78, 89);
        border-radius: 3px;
        display: grid;
        grid-template-columns: 1fr 1fr;
        overflow: hidden;
      }

      .qolboxMenuButton,
      .qolboxMenuToggle {
        appearance: none;
        border: 0;
        box-sizing: border-box;
        cursor: pointer;
        font-family: inherit;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0;
        line-height: 14px;
        min-height: 28px;
      }

      .qolboxMenuToggle {
        background: transparent;
        color: #cfd3da;
      }

      .qolboxMenuToggle + .qolboxMenuToggle {
        border-left: 1px solid rgba(255, 255, 255, 0.14);
      }

      .qolboxMenuToggle.active {
        background: #f5c542;
        color: #111111;
      }

      .qolboxMenuActions {
        display: flex;
        gap: 6px;
        justify-content: flex-end;
        margin-top: 4px;
      }

      .qolboxMenuButton {
        background: rgb(47, 51, 58);
        border: 1px solid rgb(92, 98, 108);
        border-radius: 3px;
        color: #f4f4f4;
        padding: 0 12px;
      }

      .qolboxMenuButton.primary {
        background: #f5c542;
        color: #111111;
      }

      .qolboxMenuButton:disabled {
        cursor: default;
        opacity: 0.45;
      }

      .qolboxMenuSettingsList {
        display: grid;
        gap: 6px;
      }

      .qolboxMenuFeatureRow {
        align-items: center;
        border-bottom: 1px solid rgba(255, 255, 255, 0.09);
        display: grid;
        gap: 8px;
        grid-template-columns: minmax(0, 1fr) 108px;
        padding: 0 0 6px;
      }

      .qolboxMenuFeatureName {
        color: #ffffff;
        font-size: 12px;
        font-weight: 700;
        line-height: 15px;
      }

      .qolboxMenuFeatureSummary {
        color: #c4c9d1;
        font-size: 10px;
        line-height: 13px;
        margin-top: 1px;
      }

      .qolboxMenuKeybind {
        background: rgb(47, 51, 58);
        border: 1px solid rgb(92, 98, 108);
        border-radius: 3px;
        color: #ffffff;
        display: inline-block;
        font-size: 12px;
        font-weight: 700;
        line-height: 16px;
        padding: 1px 6px;
      }

      @media (max-height: 620px) {
        .qolboxMenuBody {
          gap: 6px;
          padding: 9px;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .qolboxMenuOverlay {
          transition: none;
        }
      }
    `;

    styleHost.appendChild(style);
    return true;
  }

  function rememberFullscreenStyle(element, property) {
    if (!element || !element.style) {
      return;
    }

    let snapshot = fullscreenStyleSnapshots.get(element);
    if (!snapshot) {
      snapshot = new Map();
      fullscreenStyleSnapshots.set(element, snapshot);
    }

    if (snapshot.has(property)) {
      return;
    }

    const value = element.style.getPropertyValue(property);
    const priority = element.style.getPropertyPriority(property);
    snapshot.set(property, {
      priority,
      value,
      hadValue: value !== '' || priority !== '',
    });
  }

  function setImportantStyle(element, property, value) {
    if (!element || !element.style) {
      return;
    }

    rememberFullscreenStyle(element, property);
    element.style.setProperty(property, value, 'important');
  }

  function restoreFullscreenStyles(element, properties) {
    if (!element || !element.style) {
      return;
    }

    const snapshot = fullscreenStyleSnapshots.get(element);
    for (const property of properties) {
      const original = snapshot && snapshot.get(property);
      if (original && original.hadValue) {
        element.style.setProperty(property, original.value, original.priority);
      } else {
        element.style.removeProperty(property);
      }
    }
  }

  function hasNativeLayoutSeed() {
    const appContainer = document.getElementById('appContainer');
    const relativeContainer = document.getElementById('relativeContainer');
    return Boolean(
      appContainer &&
        relativeContainer &&
        appContainer.style.width &&
        appContainer.style.height &&
        relativeContainer.style.width &&
        relativeContainer.style.height
    );
  }

  function shouldWaitForNativeLayoutSeed() {
    if (hasNativeLayoutSeed()) {
      fullscreenNativeLayoutWaitStartedAt = 0;
      return false;
    }

    if (!document.getElementById('appContainer') || !document.getElementById('relativeContainer')) {
      return false;
    }

    if (!fullscreenNativeLayoutWaitStartedAt) {
      fullscreenNativeLayoutWaitStartedAt = Date.now();
    }

    return Date.now() - fullscreenNativeLayoutWaitStartedAt < FULLSCREEN_NATIVE_LAYOUT_WAIT_MS;
  }

  function restoreNativeLayoutSizeFallback() {
    const canvas = getActiveRenderCanvas();
    const backingWidth = Number(canvas && canvas.width);
    const backingHeight = Number(canvas && canvas.height);
    const pixelRatio = Math.max(1, Number(window.devicePixelRatio) || 1);
    const width = backingWidth / pixelRatio;
    const height = backingHeight / pixelRatio;

    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0 ||
      width >= window.innerWidth * 0.98 ||
      height >= window.innerHeight * 0.98
    ) {
      return;
    }

    const containerWidthPx = `${Math.floor(width)}px`;
    const containerHeightPx = `${Math.floor(height)}px`;
    const canvasWidthPx = `${Math.round(width * 10) / 10}px`;
    const canvasHeightPx = `${Math.round(height * 10) / 10}px`;
    for (const element of [
      document.getElementById('appContainer'),
      document.getElementById('relativeContainer'),
    ]) {
      if (!element || !element.style || element.style.width || element.style.height) {
        continue;
      }

      element.style.width = containerWidthPx;
      element.style.height = containerHeightPx;
    }

    if (canvas && canvas.style && !canvas.style.width && !canvas.style.height) {
      canvas.style.width = canvasWidthPx;
      canvas.style.height = canvasHeightPx;
    }
  }

  function clearFullscreenLayoutStyles() {
    lastFullscreenSignature = '';

    restoreFullscreenStyles(document.documentElement, ['overflow']);
    restoreFullscreenStyles(document.body, ['overflow', 'margin', 'background-color']);

    restoreFullscreenStyles(document.getElementById('appContainer'), [
      'position',
      'left',
      'top',
      'right',
      'bottom',
      'margin',
      'width',
      'height',
      'max-width',
      'max-height',
      'border',
      'overflow',
    ]);
    restoreFullscreenStyles(document.getElementById('relativeContainer'), [
      'position',
      'left',
      'top',
      'right',
      'bottom',
      'margin',
      'width',
      'height',
      'overflow',
    ]);
    restoreFullscreenStyles(document.getElementById('backgroundImage'), [
      'position',
      'left',
      'top',
      'right',
      'bottom',
      'width',
      'height',
    ]);

    const frameProperties = [
      'position',
      'left',
      'top',
      'right',
      'bottom',
      'margin',
      'width',
      'height',
      'max-width',
      'max-height',
      'overflow',
      'transform',
      'transform-origin',
      'zoom',
    ];
    for (const element of document.querySelectorAll(FULLSCREEN_RENDER_LAYER_SELECTOR)) {
      restoreFullscreenStyles(element, frameProperties);
      delete element.dataset.qolboxEditorNativeWidth;
      delete element.dataset.qolboxEditorNativeHeight;
      delete element.dataset.qolboxEditorScale;
    }

    for (const canvas of document.querySelectorAll(FULLSCREEN_RENDER_CANVAS_SELECTOR)) {
      restoreFullscreenStyles(canvas, frameProperties);
    }

    for (const overlay of document.querySelectorAll('.inGameCSS')) {
      restoreFullscreenStyles(overlay, ['zoom', 'transform-origin']);
    }

    for (const scorePanel of document.querySelectorAll('.scores')) {
      resetScorePanelLayout(scorePanel);
      restoreFullscreenStyles(scorePanel, ['display']);
    }

    for (const scoreRow of document.querySelectorAll('.scores .entryContainer')) {
      restoreFullscreenStyles(scoreRow, ['background-color']);
    }

    for (const spectateControls of document.querySelectorAll('.spectateControls')) {
      resetSpectateControlsLayout(spectateControls);
    }

    restoreNativeFullscreenPatch();
    restoreNativeLayoutSizeFallback();
    fullscreenStyleSnapshots = new WeakMap();
  }

  function getViewportSize() {
    return {
      width: Math.max(window.innerWidth, document.documentElement.clientWidth || 0),
      height: Math.max(window.innerHeight, document.documentElement.clientHeight || 0),
    };
  }

  function getBaseGameSize() {
    const game = window.a8;
    const width = Number(game && game.Xg);
    const height = Number(game && game.Zg);

    return {
      width: Number.isFinite(width) && width > 0 ? width : FALLBACK_BASE_WIDTH,
      height: Number.isFinite(height) && height > 0 ? height : FALLBACK_BASE_HEIGHT,
    };
  }

  function isElementVisible(element) {
    if (!element || !element.isConnected) {
      return false;
    }

    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isEditorLayer(element) {
    return Boolean(element && element.id === 'editorContainer');
  }

  function isEditorCanvas(element) {
    return Boolean(
      element &&
        element.tagName === 'CANVAS' &&
        element.parentElement &&
        element.parentElement.id === 'editorContainer'
    );
  }

  function hasVisibleLayer(selector) {
    for (const layer of document.querySelectorAll(selector)) {
      if (isElementVisible(layer)) {
        return true;
      }
    }

    return false;
  }

  function hasReserveSuccessfulJoinLayer() {
    return hasVisibleLayer('.lobbyContainer') || hasVisibleLayer(FULLSCREEN_GAMEPLAY_LAYER_SELECTOR);
  }

  function escapeMenuText(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getOnboardingSteps() {
    return [
      {
        type: 'intro',
        title: 'Welcome to QOLBox',
        text:
          'QOLBox makes hitbox.io feel less cramped and less repetitive, with fullscreen layout, lobby quality-of-life fixes, audio controls, and alerts for moments that need your attention.',
      },
      ...FEATURE_DEFINITIONS.map(feature => ({
        type: 'feature',
        featureKey: feature.key,
        title: feature.title,
        text: feature.summary,
      })),
      {
        type: 'finish',
        title: 'Open QOLBox anytime',
        text:
          `Press ${MENU_KEY_LABEL} to open the QOLBox menu later. The menu lets you turn these features on or off whenever you want.`,
      },
    ];
  }

  function getMenuToggleMarkup(featureKey) {
    const enabled = isFeatureEnabled(featureKey);
    return `
      <div class="qolboxMenuToggleGroup" role="group" aria-label="${escapeMenuText(featureKey)} setting">
        <button class="qolboxMenuToggle${enabled ? ' active' : ''}" data-qolbox-action="set-feature" data-feature="${escapeMenuText(featureKey)}" data-enabled="true" aria-pressed="${enabled ? 'true' : 'false'}">Enabled</button>
        <button class="qolboxMenuToggle${enabled ? '' : ' active'}" data-qolbox-action="set-feature" data-feature="${escapeMenuText(featureKey)}" data-enabled="false" aria-pressed="${enabled ? 'false' : 'true'}">Off</button>
      </div>
    `;
  }

  function getOnboardingStepMarkup() {
    const steps = getOnboardingSteps();
    const step = steps[Math.max(0, Math.min(onboardingStepIndex, steps.length - 1))];
    const isFeatureStep = step.type === 'feature';
    const isFirstStep = onboardingStepIndex === 0;
    const isFinalStep = onboardingStepIndex === steps.length - 1;
    const progress = steps
      .map((_, index) => `<span class="qolboxMenuDot${index === onboardingStepIndex ? ' active' : ''}"></span>`)
      .join('');

    return `
      <div class="qolboxMenuTopBar">QOLBox Setup</div>
      <div class="qolboxMenuBody">
        <h1 class="qolboxMenuTitle">${escapeMenuText(step.title)}</h1>
        <p class="qolboxMenuText">${escapeMenuText(step.text)}</p>
        ${isFeatureStep ? getMenuToggleMarkup(step.featureKey) : ''}
        <div class="qolboxMenuProgress" aria-hidden="true">${progress}</div>
        <div class="qolboxMenuActions">
          ${
            isFirstStep
              ? '<button class="qolboxMenuButton" data-qolbox-action="skip-onboarding">Skip</button>'
              : '<button class="qolboxMenuButton" data-qolbox-action="back">Back</button>'
          }
          <button class="qolboxMenuButton primary" data-qolbox-action="${isFinalStep ? 'finish-onboarding' : 'next'}">${isFinalStep ? 'Finish' : 'Next'}</button>
        </div>
      </div>
    `;
  }

  function getSettingsMenuMarkup() {
    const rows = FEATURE_DEFINITIONS.map(feature => {
      return `
        <div class="qolboxMenuFeatureRow">
          <div>
            <div class="qolboxMenuFeatureName">${escapeMenuText(feature.title)}</div>
            <div class="qolboxMenuFeatureSummary">${escapeMenuText(feature.summary)}</div>
          </div>
          ${getMenuToggleMarkup(feature.key)}
        </div>
      `;
    }).join('');

    return `
      <div class="qolboxMenuTopBar">QOLBox Menu</div>
      <div class="qolboxMenuBody">
        <h1 class="qolboxMenuTitle">Feature Settings</h1>
        <p class="qolboxMenuText">Press <span class="qolboxMenuKeybind">${MENU_KEY_LABEL}</span> anytime to reopen this menu.</p>
        <div class="qolboxMenuSettingsList">${rows}</div>
        <div class="qolboxMenuActions">
          <button class="qolboxMenuButton primary" data-qolbox-action="close-menu">Done</button>
        </div>
      </div>
    `;
  }

  function renderQolboxMenu() {
    const menu = document.getElementById(QOLBOX_MENU_ID);
    const panel = menu && menu.querySelector('.qolboxMenuPanel');
    if (!panel) {
      return;
    }

    panel.innerHTML = qolboxMenuMode === 'settings' ? getSettingsMenuMarkup() : getOnboardingStepMarkup();

    window.setTimeout(() => {
      const focusTarget = panel.querySelector('.qolboxMenuButton.primary, .qolboxMenuToggle.active, .qolboxMenuButton');
      focusElementWithoutScroll(focusTarget);
    }, 0);
  }

  function ensureQolboxMenu() {
    let menu = document.getElementById(QOLBOX_MENU_ID);
    if (menu) {
      return menu;
    }

    const host = document.body || document.documentElement;
    if (!host) {
      return null;
    }

    menu = document.createElement('div');
    menu.id = QOLBOX_MENU_ID;
    menu.className = 'qolboxMenuOverlay';
    menu.setAttribute('role', 'dialog');
    menu.setAttribute('aria-modal', 'true');
    menu.innerHTML = '<div class="qolboxMenuPanel"></div>';
    menu.addEventListener('pointerdown', stopQolboxMenuPointerEvent, true);
    menu.addEventListener('mousedown', stopQolboxMenuPointerEvent, true);
    menu.addEventListener('mouseup', stopQolboxMenuPointerEvent, true);
    menu.addEventListener('wheel', stopQolboxMenuPointerEvent, { capture: true, passive: true });
    menu.addEventListener('click', handleQolboxMenuClick, true);
    host.appendChild(menu);
    return menu;
  }

  function openQolboxMenu(mode = 'settings') {
    ensureGlobalStyle();
    if (!ensureQolboxMenu()) {
      return;
    }

    qolboxMenuMode = mode;
    if (mode === 'onboarding') {
      onboardingStepIndex = 0;
    }

    applyFeatureRootClasses();
    renderQolboxMenu();
  }

  function closeQolboxMenu() {
    qolboxMenuMode = 'closed';
    applyFeatureRootClasses();
  }

  function disableFeatureSideEffects(featureKey) {
    switch (featureKey) {
      case FEATURE_RESERVE:
        if (reserveState) {
          stopReserveSpot({ hideNative: false });
        }
        reservePasswordPromptPending = false;
        syncReserveJoinButtonLabel();
        break;
      case FEATURE_GAME_START_ALERT:
        gameStartWasPlayingWhenUnfocused = false;
        gameStartWasInLobbyWhenUnfocused = false;
        clearGameStartWatchTimer();
        clearGameStartIndicator();
        break;
      case FEATURE_AUDIO:
        if (currentJukeboxMenuItem && currentJukeboxMenuItem.isConnected) {
          currentJukeboxMenuItem.remove();
        }
        currentJukeboxMenuItem = null;
        applyGameVolume();
        break;
      case FEATURE_FULLSCREEN:
        clearFullscreenLayoutStyles();
        break;
      default:
        break;
    }
  }

  function setFeatureEnabled(featureKey, enabled) {
    if (!isKnownFeature(featureKey)) {
      return;
    }

    featureSettings[featureKey] = Boolean(enabled);
    saveFeatureSettings();
    applyFeatureRootClasses();

    if (!shouldRunFeature(featureKey)) {
      disableFeatureSideEffects(featureKey);
    }

    if (onboardingComplete) {
      applyPersistentFeatures();
      scheduleUiWork({ force: true, features: true, passes: RESIZE_SETTLE_PASSES });
    }

    renderQolboxMenu();
  }

  function completeOnboarding() {
    onboardingComplete = true;
    saveOnboardingComplete();
    closeQolboxMenu();
    applyFeatureRootClasses();
    applyPersistentFeatures();
    scheduleUiWork({ force: true, features: true, passes: FULLSCREEN_SETTLE_PASSES });
  }

  function handleQolboxMenuClick(event) {
    if (qolboxMenuMode !== 'closed') {
      event.stopPropagation();
    }

    const actionElement =
      event.target instanceof Element ? event.target.closest('[data-qolbox-action]') : null;
    if (!actionElement) {
      return;
    }

    const action = actionElement.dataset.qolboxAction;
    event.preventDefault();
    event.stopImmediatePropagation();

    switch (action) {
      case 'set-feature':
        setFeatureEnabled(actionElement.dataset.feature, actionElement.dataset.enabled === 'true');
        break;
      case 'next':
        onboardingStepIndex = Math.min(onboardingStepIndex + 1, getOnboardingSteps().length - 1);
        renderQolboxMenu();
        break;
      case 'back':
        onboardingStepIndex = Math.max(0, onboardingStepIndex - 1);
        renderQolboxMenu();
        break;
      case 'skip-onboarding':
      case 'finish-onboarding':
        completeOnboarding();
        break;
      case 'close-menu':
        closeQolboxMenu();
        break;
      default:
        break;
    }
  }

  function stopQolboxMenuPointerEvent(event) {
    if (qolboxMenuMode !== 'closed') {
      event.stopPropagation();
    }
  }

  function handleQolboxMenuKey(event) {
    if (qolboxMenuMode !== 'closed' && isEscapeKey(event)) {
      event.preventDefault();
      event.stopImmediatePropagation();

      if (qolboxMenuMode === 'settings') {
        closeQolboxMenu();
      }

      return;
    }

    if (!event || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }

    if (event.key !== MENU_KEY && event.code !== MENU_KEY) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    if (qolboxMenuMode === 'settings') {
      closeQolboxMenu();
      return;
    }

    if (qolboxMenuMode === 'onboarding') {
      return;
    }

    openQolboxMenu(onboardingComplete ? 'settings' : 'onboarding');
  }

  function installQolboxMenuHooks() {
    if (qolboxMenuHooksInstalled) {
      return;
    }

    qolboxMenuHooksInstalled = true;
    window.addEventListener('keydown', handleQolboxMenuKey, true);
    document.addEventListener('keydown', handleQolboxMenuKey, true);
  }

  function showFirstBootOnboarding() {
    if (onboardingComplete || qolboxMenuMode !== 'closed') {
      return;
    }

    openQolboxMenu('onboarding');
  }

  function scheduleFirstBootOnboarding() {
    if (onboardingComplete) {
      return;
    }

    const show = () => window.setTimeout(showFirstBootOnboarding, 0);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', show, { once: true });
    } else {
      show();
    }
  }

  function cloneReserveJoinValue(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
  }

  function isReserveJoinPayload(value) {
    return Boolean(
      value &&
        typeof value === 'object' &&
        (typeof value.joinID === 'string' ||
          (Object.prototype.hasOwnProperty.call(value, 'playerName') &&
            Object.prototype.hasOwnProperty.call(value, 'peerID') &&
            Object.prototype.hasOwnProperty.call(value, 'password')))
    );
  }

  function getReserveJoinPayload(args) {
    return args.find(isReserveJoinPayload) || null;
  }

  function captureReserveJoin(socket, eventName, args) {
    if (!shouldRunFeature(FEATURE_RESERVE)) {
      return;
    }

    const payload = getReserveJoinPayload(args);
    const autoJoin = window.autoJoin;
    reserveCapturedJoin = {
      socket,
      eventName,
      args: args.map(cloneReserveJoinValue),
      autoReserve: Boolean(
        payload &&
          autoJoin &&
          typeof autoJoin === 'object' &&
          payload.joinID === autoJoin.address &&
          payload.password === autoJoin.passbypass
      ),
      time: Date.now(),
    };

    if (reserveState && reserveState.active) {
      reserveState.capturedJoin = reserveCapturedJoin;
    }

    scheduleReserveStatusWatch();
  }

  function shouldContinueReserveStatusWatch() {
    if (reserveState && reserveState.active) {
      return true;
    }

    if (isReserveJoinedRoomFullSuppressed()) {
      return true;
    }

    return Boolean(reserveCapturedJoin && Date.now() - reserveCapturedJoin.time < 30000 && !hasReserveSuccessfulJoinLayer());
  }

  function scheduleReserveStatusWatch(delay = 250) {
    if (reserveStatusWatchTimer) {
      return;
    }

    reserveStatusWatchTimer = window.setTimeout(() => {
      reserveStatusWatchTimer = 0;
      handleReserveConnectingState();

      if (shouldContinueReserveStatusWatch()) {
        scheduleReserveStatusWatch(delay);
      }
    }, delay);
  }

  function handleGameStartAfterNativeEvent(wasPlayingMatch, wasPlayableLobby) {
    if (!wasPlayingMatch && wasPlayableLobby && !isGameStartPageFocused() && isPlayingMatch()) {
      clearGameStartWatchTimer();
      clearGameStartIndicatorTimer();
      showGameStartIndicator('started');
      return;
    }

    updateGameStartIndicator();
  }

  function installReserveSocketCaptureHook() {
    if (reserveSocketHookInstalled) {
      return;
    }

    reserveSocketHookInstalled = true;

    const patchSocket = socket => {
      if (!socket) {
        return socket;
      }

      if (socket.__qolboxReservePatched || typeof socket.emit !== 'function') {
        return socket;
      }

      const nativeEmit = socket.emit;
      socket.emit = function wrappedReserveEmit(eventName, ...args) {
        if (getReserveJoinPayload(args)) {
          captureReserveJoin(this, eventName, args);
        }

        return nativeEmit.call(this, eventName, ...args);
      };
      socket.__qolboxReservePatched = true;
      socket.__qolboxReserveOriginalEmit = nativeEmit;
      return socket;
    };

    const patchSocketPrototype = ioFactory => {
      const prototype = ioFactory && ioFactory.Socket && ioFactory.Socket.prototype;
      if (!prototype) {
        return;
      }

      if (prototype.__qolboxReservePatched || typeof prototype.emit !== 'function') {
        return;
      }

      const nativeEmit = prototype.emit;
      prototype.emit = function wrappedReservePrototypeEmit(eventName, ...args) {
        if (getReserveJoinPayload(args)) {
          captureReserveJoin(this, eventName, args);
        }

        return nativeEmit.call(this, eventName, ...args);
      };
      prototype.__qolboxReservePatched = true;
      prototype.__qolboxReserveOriginalEmit = nativeEmit;
    };

    const patchIo = ioFactory => {
      if (typeof ioFactory !== 'function' || ioFactory.__qolboxReservePatched) {
        patchSocketPrototype(ioFactory);
        return ioFactory;
      }

      const wrappedIo = function wrappedReserveIo(...args) {
        return patchSocket(ioFactory.apply(this, args));
      };

      try {
        Object.setPrototypeOf(wrappedIo, Object.getPrototypeOf(ioFactory));
      } catch {
        // Keep the wrapped factory usable even if the browser refuses prototype changes.
      }

      for (const key of Reflect.ownKeys(ioFactory)) {
        try {
          wrappedIo[key] = ioFactory[key];
        } catch {
          // Some function properties are read-only in older browsers.
        }
      }

      wrappedIo.__qolboxReservePatched = true;
      wrappedIo.__qolboxReserveOriginal = ioFactory;
      patchSocketPrototype(wrappedIo);
      return wrappedIo;
    };

    try {
      let ioValue = window.io;
      Object.defineProperty(window, 'io', {
        configurable: true,
        enumerable: true,
        get() {
          return ioValue;
        },
        set(value) {
          ioValue = patchIo(value);
        },
      });

      if (ioValue) {
        window.io = ioValue;
      }
    } catch {
      if (window.io) {
        window.io = patchIo(window.io);
      }
    }
  }

  function getReserveJoinButton() {
    const button = document.querySelector('.roomListContainer .bottomButton.right');
    return isElementVisible(button) ? button : null;
  }

  function getReserveRowFromTarget(target) {
    return target instanceof Element ? target.closest('.roomListContainer .scrollBox tr') : null;
  }

  function getReserveRoomSignature(row) {
    if (!row || !row.cells || !row.cells[0]) {
      return '';
    }

    const roomName = row.cells[0].textContent.trim();
    const lockState = isReservePasswordRoom(row) ? 'locked' : 'open';
    return `${roomName}\n${lockState}`;
  }

  function findReserveRoomBySignature(signature = reserveSelectedRoomSignature) {
    if (!signature) {
      return null;
    }

    return (
      [...document.querySelectorAll('.roomListContainer .scrollBox tr')].find(row => {
        return row.isConnected && getReserveRoomSignature(row) === signature;
      }) || null
    );
  }

  function parseReserveRoomPlayers(row) {
    if (!row || !row.cells || row.cells.length < 2) {
      return null;
    }

    const match = row.cells[1].textContent.trim().match(/^(\d+)\s*\/\s*(\d+)$/);
    if (!match) {
      return null;
    }

    return {
      current: Number(match[1]),
      max: Number(match[2]),
    };
  }

  function isReserveRoomFull(row) {
    const players = parseReserveRoomPlayers(row);
    return Boolean(players && players.max > 0 && players.current >= players.max);
  }

  function isReserveOnePersonRoom(row) {
    const players = parseReserveRoomPlayers(row);
    return Boolean(players && players.max === 1);
  }

  function isReserveUnavailableRoom(row) {
    return Boolean(isReserveRoomFull(row) && isReserveOnePersonRoom(row));
  }

  function isReserveAutoJoinOnePersonRoom() {
    const autoJoin = window.autoJoin;
    if (!autoJoin || typeof autoJoin !== 'object') {
      return false;
    }

    // Current direct-link metadata omits max players, so avoid guessing from a generic room_full error.
    const maxPlayers = Number(autoJoin.maxPlayers || autoJoin.maxplayers || autoJoin.max);
    return Number.isFinite(maxPlayers) && maxPlayers === 1;
  }

  function isReservePasswordRoom(row) {
    return Boolean(row && row.querySelector('img[src*="lock"]'));
  }

  function rememberReserveSelectedRoom(row) {
    if (!row || !row.isConnected) {
      return null;
    }

    reserveSelectedRoomRow = row;
    reserveSelectedRoomSignature = getReserveRoomSignature(row);
    reserveSelectedRoomWasFull = isReserveRoomFull(row);
    reserveSelectedRoomWasUnavailable = isReserveUnavailableRoom(row);
    return row;
  }

  function getReserveSelectedRoomRow() {
    const selected = document.querySelector('.roomListContainer .scrollBox tr.SELECTED');
    if (selected && selected.isConnected) {
      return rememberReserveSelectedRoom(selected);
    }

    if (reserveSelectedRoomRow && reserveSelectedRoomRow.isConnected) {
      return rememberReserveSelectedRoom(reserveSelectedRoomRow);
    }

    const matchingRow = findReserveRoomBySignature();
    if (matchingRow) {
      return rememberReserveSelectedRoom(matchingRow);
    }

    return null;
  }

  function getReserveSelectedRoomState() {
    const row = getReserveSelectedRoomRow();
    if (row) {
      return {
        row,
        full: isReserveRoomFull(row),
        unavailable: isReserveUnavailableRoom(row),
      };
    }

    return {
      row: null,
      full: reserveSelectedRoomWasFull,
      unavailable: reserveSelectedRoomWasUnavailable,
    };
  }

  function syncReserveJoinButtonLabel() {
    const button = getReserveJoinButton();
    if (!button) {
      return;
    }

    if (!shouldRunFeature(FEATURE_RESERVE)) {
      button.dataset.qolboxReserveFull = 'false';
      button.dataset.qolboxReserveUnavailable = 'false';
      button.classList.remove('qolboxReserveUnavailable');
      button.removeAttribute('aria-disabled');
      if (button.textContent.trim() === RESERVE_BUTTON_TEXT) {
        button.textContent = JOIN_BUTTON_TEXT;
      }
      return;
    }

    const selectedState = getReserveSelectedRoomState();
    const shouldReserve = selectedState.full || selectedState.unavailable;
    const isUnavailable = selectedState.unavailable;
    const nextText = shouldReserve ? RESERVE_BUTTON_TEXT : JOIN_BUTTON_TEXT;

    if (button.textContent.trim() !== nextText) {
      button.textContent = nextText;
    }

    button.dataset.qolboxReserveFull = shouldReserve ? 'true' : 'false';
    button.dataset.qolboxReserveUnavailable = isUnavailable ? 'true' : 'false';
    button.classList.toggle('qolboxReserveUnavailable', isUnavailable);
    button.setAttribute('aria-disabled', isUnavailable ? 'true' : 'false');
  }

  function syncReservePasswordPrompt() {
    if (!shouldRunFeature(FEATURE_RESERVE)) {
      reservePasswordPromptPending = false;
      return;
    }

    const container = document.querySelector('.passwordWindowContainer');
    const joinButton = container && container.querySelector('.joinButton');

    if (!isElementVisible(container) || !joinButton) {
      reservePasswordPromptPending = false;
      return;
    }

    if (reservePasswordPromptPending && joinButton.textContent.trim() !== RESERVE_BUTTON_TEXT) {
      joinButton.textContent = RESERVE_BUTTON_TEXT;
    }
  }

  function ensureReserveWaitingWindow() {
    let container = document.getElementById('qolboxReserveWindow');
    if (container) {
      return container;
    }

    container = document.createElement('div');
    container.id = 'qolboxReserveWindow';
    container.className = 'connectingWindowContainer qolboxReserveWindowContainer';
    container.innerHTML = `
      <div class="behindBlocker"></div>
      <div class="connectingWindow">
        <div class="topBar"></div>
        <div class="qolboxReserveContent">
          <div class="spinner" aria-hidden="true"></div>
          <div class="qolboxReserveStatus"></div>
          <div class="qolboxReserveCountdown"></div>
          <div class="qolboxReserveMessage"></div>
        </div>
        <div class="cancelButton">CANCEL</div>
      </div>
    `;

    const cancelButton = container.querySelector('.cancelButton');
    cancelButton.addEventListener('click', () => {
      cancelReserveSpot();
    });

    (document.getElementById('appContainer') || document.body || document.documentElement).appendChild(container);
    return container;
  }

  function getReserveStatusLines() {
    return getNativeConnectingWindows()
      .flatMap(windowElement => {
        const textElement = windowElement.querySelector('.textBox') || windowElement;
        return (textElement.textContent || '').split(/\r?\n/);
      })
      .map(line => line.replace(/\s+/g, ' ').trim())
      .filter(line => {
        return (
          line &&
          !RESERVE_ROOM_FULL_PATTERN.test(line) &&
          !RESERVE_ROOM_CLOSED_PATTERN.test(line) &&
          !RESERVE_WRONG_PASSWORD_PATTERN.test(line) &&
          !/^cancel$/i.test(line) &&
          line !== RESERVE_WAIT_TEXT
        );
      });
  }

  function getReserveNativeMessage(pattern) {
    return (
      getNativeConnectingWindows()
        .flatMap(windowElement => {
          const textElement = windowElement.querySelector('.textBox') || windowElement;
          return (textElement.textContent || '').split(/\r?\n/);
        })
        .map(line => line.replace(/\s+/g, ' ').trim())
        .find(line => line && pattern.test(line)) || ''
    );
  }

  function getReserveStatusText() {
    const statusText = getReserveStatusLines().slice(-2).join(' - ');
    if (statusText) {
      if (reserveState) {
        reserveState.lastStatusText = statusText;
      }

      return statusText;
    }

    return (reserveState && reserveState.lastStatusText) || RESERVE_STATUS_FALLBACK_TEXT;
  }

  function getReserveCountdownText() {
    const nextRetryAt = reserveState && reserveState.nextRetryAt;
    const remainingMs = nextRetryAt ? Math.max(0, nextRetryAt - Date.now()) : RESERVE_RETRY_DELAY_MS;
    return `Retrying in ${(remainingMs / 1000).toFixed(1)} seconds...`;
  }

  function updateReserveWaitingWindow() {
    const container = ensureReserveWaitingWindow();
    const title = container.querySelector('.topBar');
    const spinner = container.querySelector('.spinner');
    const status = container.querySelector('.qolboxReserveStatus');
    const countdown = container.querySelector('.qolboxReserveCountdown');
    const message = container.querySelector('.qolboxReserveMessage');
    const isTerminalMessage = Boolean(reserveState && (reserveState.unavailable || reserveState.terminal));
    const isUnavailable = Boolean(reserveState && reserveState.unavailable);

    if (title) {
      title.textContent = isUnavailable ? RESERVE_UNAVAILABLE_TITLE_TEXT : RESERVE_WAIT_TITLE_TEXT;
    }

    if (spinner) {
      spinner.hidden = isTerminalMessage;
    }

    if (status) {
      status.hidden = isTerminalMessage;
      status.textContent = isTerminalMessage ? '' : getReserveStatusText();
    }

    if (countdown) {
      countdown.hidden = isTerminalMessage;
      countdown.textContent = isTerminalMessage ? '' : getReserveCountdownText();
    }

    if (message) {
      message.hidden = !isTerminalMessage;
      message.textContent = isTerminalMessage ? (reserveState.message || RESERVE_ONE_PERSON_TEXT) : '';
    }
  }

  function getNativeConnectingWindows() {
    return [...document.querySelectorAll('.connectingWindowContainer:not(.qolboxReserveWindowContainer)')];
  }

  function getNativeConnectingText() {
    return getNativeConnectingWindows()
      .map(windowElement => windowElement.textContent || '')
      .join('\n');
  }

  function hideNativeConnectingWindows() {
    for (const windowElement of getNativeConnectingWindows()) {
      windowElement.style.display = 'none';
    }
  }

  function isReserveJoinedRoomFullSuppressed() {
    return Date.now() < reserveJoinedRoomFullSuppressUntil;
  }

  function suppressReserveRoomFullAfterJoin() {
    reserveJoinedRoomFullSuppressUntil = Date.now() + RESERVE_JOINED_ROOM_FULL_SUPPRESS_MS;
  }

  function stopReserveAfterSuccessfulJoin() {
    suppressReserveRoomFullAfterJoin();
    stopReserveSpot({ hideNative: true });
    scheduleReserveStatusWatch();
  }

  function clearReserveCountdownTimer() {
    if (reserveCountdownTimer) {
      window.clearTimeout(reserveCountdownTimer);
      reserveCountdownTimer = 0;
    }
  }

  function scheduleReserveCountdownUpdate() {
    if (reserveCountdownTimer || !reserveState || !reserveState.active) {
      return;
    }

    reserveCountdownTimer = window.setTimeout(() => {
      reserveCountdownTimer = 0;

      if (!reserveState || !reserveState.active) {
        return;
      }

      updateReserveWaitingWindow();
      scheduleReserveCountdownUpdate();
    }, RESERVE_COUNTDOWN_UPDATE_MS);
  }

  function setReserveWaitingVisible(visible) {
    if (document.body) {
      document.body.classList.toggle('qolbox-reserve-active', visible);
    }

    const container = ensureReserveWaitingWindow();
    container.style.display = visible ? 'block' : 'none';
  }

  function clearReserveVisibleRoomSelection() {
    for (const row of document.querySelectorAll('.roomListContainer .scrollBox tr.SELECTED')) {
      row.classList.remove('SELECTED');
    }

    syncReserveJoinButtonLabel();
  }

  function startReserveSpot(reason) {
    if (!shouldRunFeature(FEATURE_RESERVE)) {
      return;
    }

    if (!reserveState || !reserveState.active) {
      reserveState = {
        active: true,
        unavailable: false,
        reason,
        retryTimer: 0,
        nextRetryAt: 0,
        retries: 0,
        capturedJoin: reserveCapturedJoin,
        lastStatusText: '',
      };
    } else {
      reserveState.reason = reserveState.reason || reason;
      reserveState.capturedJoin = reserveState.capturedJoin || reserveCapturedJoin;
      reserveState.unavailable = false;
    }

    updateReserveWaitingWindow();
    setReserveWaitingVisible(true);
    scheduleReserveStatusWatch();
    scheduleReserveCountdownUpdate();
  }

  function stopReserveSpot({ hideNative = false, clearCaptured = true, clearSelection = false } = {}) {
    if (reserveState && reserveState.retryTimer) {
      window.clearTimeout(reserveState.retryTimer);
    }

    if (reserveStatusWatchTimer) {
      window.clearTimeout(reserveStatusWatchTimer);
      reserveStatusWatchTimer = 0;
    }

    clearReserveCountdownTimer();

    if (clearCaptured) {
      reserveCapturedJoin = null;
    }

    reserveState = null;
    reservePasswordPromptPending = false;
    setReserveWaitingVisible(false);

    if (hideNative) {
      hideNativeConnectingWindows();
    }

    if (clearSelection) {
      clearReserveVisibleRoomSelection();
    } else {
      syncReserveJoinButtonLabel();
    }
  }

  function showReserveOnePersonUnavailable(row = null) {
    if (!shouldRunFeature(FEATURE_RESERVE)) {
      return;
    }

    if (row) {
      rememberReserveSelectedRoom(row);
    }

    if (reserveState && reserveState.retryTimer) {
      window.clearTimeout(reserveState.retryTimer);
    }

    if (reserveStatusWatchTimer) {
      window.clearTimeout(reserveStatusWatchTimer);
      reserveStatusWatchTimer = 0;
    }

    clearReserveCountdownTimer();
    reserveCapturedJoin = null;
    reservePasswordPromptPending = false;
    reserveState = {
      active: false,
      unavailable: true,
      reason: 'one-person-room',
      message: RESERVE_ONE_PERSON_TEXT,
    };

    updateReserveWaitingWindow();
    setReserveWaitingVisible(true);
    syncReserveJoinButtonLabel();
  }

  function showReserveTerminalMessage(reason, message) {
    if (!shouldRunFeature(FEATURE_RESERVE)) {
      return;
    }

    if (reserveState && reserveState.retryTimer) {
      window.clearTimeout(reserveState.retryTimer);
    }

    if (reserveStatusWatchTimer) {
      window.clearTimeout(reserveStatusWatchTimer);
      reserveStatusWatchTimer = 0;
    }

    clearReserveCountdownTimer();
    reserveCapturedJoin = null;
    reservePasswordPromptPending = false;
    reserveState = {
      active: false,
      unavailable: false,
      terminal: true,
      reason,
      message: message || RESERVE_STATUS_FALLBACK_TEXT,
    };

    updateReserveWaitingWindow();
    setReserveWaitingVisible(true);
    hideNativeConnectingWindows();
    syncReserveJoinButtonLabel();
  }

  function cancelReserveSpot() {
    if (reserveState && reserveState.unavailable) {
      stopReserveSpot({ clearSelection: true });
      return;
    }

    const cancelButton = getNativeConnectingWindows()
      .map(windowElement => windowElement.querySelector('.cancelButton'))
      .find(Boolean);

    if (cancelButton) {
      cancelButton.click();
    }

    stopReserveSpot();
  }

  function emitReserveJoinAttempt() {
    const captured = (reserveState && reserveState.capturedJoin) || reserveCapturedJoin;
    if (!captured || !captured.socket || typeof captured.socket.emit !== 'function') {
      return false;
    }

    if (!captured.socket.connected && typeof captured.socket.connect === 'function') {
      try {
        captured.socket.connect();
      } catch {
        return false;
      }
    }

    try {
      reserveRetryAudioSuppressUntil = Date.now() + RESERVE_RETRY_AUDIO_SUPPRESS_MS;
      captured.socket.emit(captured.eventName, ...captured.args.map(cloneReserveJoinValue));
      return true;
    } catch {
      return false;
    }
  }

  function scheduleReserveRetry() {
    if (!shouldRunFeature(FEATURE_RESERVE) || !reserveState || !reserveState.active || reserveState.retryTimer) {
      return;
    }

    reserveState.nextRetryAt = Date.now() + RESERVE_RETRY_DELAY_MS;
    updateReserveWaitingWindow();
    scheduleReserveCountdownUpdate();

    reserveState.retryTimer = window.setTimeout(() => {
      if (!reserveState || !reserveState.active) {
        return;
      }

      reserveState.retryTimer = 0;
      reserveState.nextRetryAt = 0;
      updateReserveWaitingWindow();

      if (hasReserveSuccessfulJoinLayer()) {
        stopReserveAfterSuccessfulJoin();
        return;
      }

      if (emitReserveJoinAttempt()) {
        reserveState.retries += 1;
      }

      scheduleReserveRetry();
    }, RESERVE_RETRY_DELAY_MS);
  }

  function handleReserveConnectingState() {
    if (!shouldRunFeature(FEATURE_RESERVE)) {
      if (reserveState) {
        stopReserveSpot();
      }
      return;
    }

    const nativeText = getNativeConnectingText();

    if (
      isReserveJoinedRoomFullSuppressed() &&
      hasReserveSuccessfulJoinLayer() &&
      RESERVE_ROOM_FULL_PATTERN.test(nativeText)
    ) {
      hideNativeConnectingWindows();
      return;
    }

    if (reserveState && reserveState.active && hasReserveSuccessfulJoinLayer()) {
      stopReserveAfterSuccessfulJoin();
      return;
    }

    if (reserveState && reserveState.active && RESERVE_ROOM_CLOSED_PATTERN.test(nativeText)) {
      stopReserveSpot();
      return;
    }

    if (reserveState && reserveState.active && RESERVE_WRONG_PASSWORD_PATTERN.test(nativeText)) {
      showReserveTerminalMessage('wrong-password', getReserveNativeMessage(RESERVE_WRONG_PASSWORD_PATTERN));
      return;
    }

    const canAutoReserve = Boolean((reserveState && reserveState.active) || (reserveCapturedJoin && reserveCapturedJoin.autoReserve));
    if (RESERVE_ROOM_FULL_PATTERN.test(nativeText) && canAutoReserve) {
      if (isReserveAutoJoinOnePersonRoom()) {
        showReserveOnePersonUnavailable();
        hideNativeConnectingWindows();
        return;
      }

      startReserveSpot('room-full');
      scheduleReserveRetry();
    }
  }

  function handleReserveRoomListClick(event) {
    if (!shouldRunFeature(FEATURE_RESERVE)) {
      return;
    }

    const row = getReserveRowFromTarget(event.target);
    const joinButton =
      event.target instanceof Element ? event.target.closest('.roomListContainer .bottomButton.right') : null;

    if (row) {
      rememberReserveSelectedRoom(row);
      window.setTimeout(syncReserveJoinButtonLabel, 0);

      if (isReserveUnavailableRoom(row)) {
        showReserveOnePersonUnavailable(row);

        if (joinButton) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      }
    }

    if (!joinButton) {
      return;
    }

    const selectedState = getReserveSelectedRoomState();
    const selectedRow = selectedState.row;
    if (selectedState.unavailable) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showReserveOnePersonUnavailable(selectedRow);
      return;
    }

    if (!selectedState.full) {
      reservePasswordPromptPending = false;
      return;
    }

    if (isReservePasswordRoom(selectedRow)) {
      reservePasswordPromptPending = true;
      window.setTimeout(syncReservePasswordPrompt, 0);
      return;
    }

    startReserveSpot('room-list');
  }

  function handleReserveRoomListDoubleClick(event) {
    if (!shouldRunFeature(FEATURE_RESERVE)) {
      return;
    }

    const row = getReserveRowFromTarget(event.target);
    if (!isReserveRoomFull(row)) {
      return;
    }

    rememberReserveSelectedRoom(row);

    if (isReserveUnavailableRoom(row)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showReserveOnePersonUnavailable(row);
      return;
    }

    if (isReservePasswordRoom(row)) {
      reservePasswordPromptPending = true;
      window.setTimeout(syncReservePasswordPrompt, 0);
      return;
    }

    startReserveSpot('room-list');
  }

  function handleReservePasswordSubmit(event) {
    if (!shouldRunFeature(FEATURE_RESERVE)) {
      return;
    }

    const submitButton = event.target instanceof Element ? event.target.closest('.passwordWindowContainer .joinButton') : null;
    if (!submitButton || !reservePasswordPromptPending) {
      return;
    }

    if (isReserveUnavailableRoom(getReserveSelectedRoomRow())) {
      event.preventDefault();
      event.stopImmediatePropagation();
      reservePasswordPromptPending = false;
      showReserveOnePersonUnavailable(getReserveSelectedRoomRow());
      return;
    }

    reservePasswordPromptPending = false;
    startReserveSpot('password-room');
  }

  function handleReservePasswordKey(event) {
    if (!shouldRunFeature(FEATURE_RESERVE)) {
      return;
    }

    if (event.key !== 'Enter' || !reservePasswordPromptPending || !isElementVisible(document.querySelector('.passwordWindowContainer'))) {
      return;
    }

    if (isReserveUnavailableRoom(getReserveSelectedRoomRow())) {
      event.preventDefault();
      event.stopImmediatePropagation();
      reservePasswordPromptPending = false;
      showReserveOnePersonUnavailable(getReserveSelectedRoomRow());
      return;
    }

    reservePasswordPromptPending = false;
    startReserveSpot('password-room');
  }

  function patchReserveSpotFeature() {
    if (!shouldRunFeature(FEATURE_RESERVE)) {
      syncReserveJoinButtonLabel();
      return;
    }

    installReserveSocketCaptureHook();
    syncReserveJoinButtonLabel();
    syncReservePasswordPrompt();
    handleReserveConnectingState();

    if (reserveFeatureDomPatched) {
      return;
    }

    reserveFeatureDomPatched = true;
    document.addEventListener('click', handleReserveRoomListClick, true);
    document.addEventListener('dblclick', handleReserveRoomListDoubleClick, true);
    document.addEventListener('click', handleReservePasswordSubmit, true);
    window.addEventListener('keyup', handleReservePasswordKey, true);
  }

  function isMenuGameplayOverlap() {
    return hasVisibleLayer(FULLSCREEN_MENU_LAYER_SELECTOR) && hasVisibleLayer(FULLSCREEN_PLAY_LAYER_SELECTOR);
  }

  function isPageFocused() {
    return !document.hidden && (!document.hasFocus || document.hasFocus());
  }

  function isGameStartPageFocused() {
    return gameStartPageFocused && isPageFocused();
  }

  function installTopLevelGameStartRelay() {
    if (window.top !== window || window.__qolboxGameStartRelayInstalled) {
      return;
    }

    window.__qolboxGameStartRelayInstalled = true;
    let relayActive = false;
    let relayOriginalTitle = '';
    let relayOriginalFavicon = null;
    let relayFaviconLink = null;

    function saveRelayState() {
      if (relayActive) {
        return;
      }

      const link = document.querySelector('link[rel~="icon"]');
      relayOriginalTitle = stripGameStartTitlePrefix(document.title || '');
      relayOriginalFavicon = link
        ? {
            href: link.getAttribute('href'),
            link,
            type: link.getAttribute('type'),
          }
        : { href: null, link: null, type: null };
      relayFaviconLink = link || document.createElement('link');

      if (!link) {
        relayFaviconLink.rel = 'icon';
        (document.head || document.documentElement).appendChild(relayFaviconLink);
      }

      relayActive = true;
    }

    function setRelayFavicon(active) {
      saveRelayState();

      if (!relayFaviconLink) {
        return;
      }

      if (active) {
        relayFaviconLink.setAttribute('href', GAME_START_FAVICON_HREF);
        relayFaviconLink.setAttribute('type', 'image/svg+xml');
        return;
      }

      if (relayOriginalFavicon && relayOriginalFavicon.href) {
        relayFaviconLink.setAttribute('href', relayOriginalFavicon.href);
      } else {
        relayFaviconLink.removeAttribute('href');
      }

      if (relayOriginalFavicon && relayOriginalFavicon.type) {
        relayFaviconLink.setAttribute('type', relayOriginalFavicon.type);
      } else {
        relayFaviconLink.removeAttribute('type');
      }
    }

    function clearRelayState() {
      if (!relayActive) {
        return;
      }

      document.title = relayOriginalTitle;

      if (relayOriginalFavicon && relayFaviconLink) {
        if (!relayOriginalFavicon.link) {
          relayFaviconLink.remove();
        } else {
          setRelayFavicon(false);
        }
      }

      relayActive = false;
      relayOriginalTitle = '';
      relayOriginalFavicon = null;
      relayFaviconLink = null;
    }

    window.addEventListener(
      'message',
      event => {
        if (!/^https:\/\/(www\.)?hitbox\.io$/i.test(event.origin)) {
          return;
        }

        const data = event.data;
        if (!data || data.source !== 'QOLBox' || data.feature !== 'gameStartIndicator') {
          return;
        }

        if (data.action === 'title') {
          saveRelayState();
          document.title = String(data.title || relayOriginalTitle);
        } else if (data.action === 'favicon') {
          setRelayFavicon(Boolean(data.active));
        } else if (data.action === 'clear') {
          clearRelayState();
        }
      },
      true
    );
  }

  function getMultiplayerSession() {
    return window.multiplayerSession && typeof window.multiplayerSession === 'object'
      ? window.multiplayerSession
      : null;
  }

  function getSessionPlayer(session = getMultiplayerSession()) {
    const gameState = session && session.JD;
    const players = gameState && gameState.Pi;
    const playerId = gameState && gameState.vL;

    if (!players || playerId === null || playerId === undefined) {
      return null;
    }

    return players[playerId] || (typeof players.get === 'function' ? players.get(playerId) : null);
  }

  function isCurrentPlayerSpectating(session = getMultiplayerSession()) {
    const player = getSessionPlayer(session);
    const team = Number(player && player.N);
    if (Number.isFinite(team)) {
      return team === 0;
    }

    return hasVisibleLayer('.spectateControls');
  }

  function isSessionLobbyActive(session = getMultiplayerSession()) {
    return Boolean(session && session.TJ && session.TJ.NS && !(session.KR && session.KR.SL));
  }

  function isSessionMatchActive(session = getMultiplayerSession()) {
    return Boolean(session && session.KR && session.KR.SL);
  }

  function isPlayableLobby() {
    const session = getMultiplayerSession();

    if (isSessionMatchActive(session)) {
      return false;
    }

    if (isSessionLobbyActive(session)) {
      return !isCurrentPlayerSpectating(session);
    }

    return (
      hasVisibleLayer('.lobbyContainer') &&
      !hasVisibleLayer('.spectateControls')
    );
  }

  function isPlayingMatch() {
    const session = getMultiplayerSession();

    if (isSessionMatchActive(session)) {
      return !isCurrentPlayerSpectating(session);
    }

    return (
      hasVisibleLayer(FULLSCREEN_GAMEPLAY_LAYER_SELECTOR) &&
      !hasVisibleLayer('.spectateControls')
    );
  }

  function getGameStartTitlePrefix(reason) {
    switch (reason) {
      case 'pulled':
        return GAME_PULLED_TITLE_PREFIX;
      case 'started':
      default:
        return GAME_START_TITLE_PREFIX;
    }
  }

  function getPolledGameStartReason() {
    return gameStartWasInLobbyWhenUnfocused ? 'started' : 'pulled';
  }

  function clearGameStartIndicatorTimer() {
    if (gameStartIndicatorTimer) {
      window.clearTimeout(gameStartIndicatorTimer);
      gameStartIndicatorTimer = 0;
    }
  }

  function clearGameStartWatchTimer() {
    if (gameStartWatchTimer) {
      window.clearTimeout(gameStartWatchTimer);
      gameStartWatchTimer = 0;
    }
  }

  function clearGameStartEndWatchTimer() {
    if (gameStartEndWatchTimer) {
      window.clearTimeout(gameStartEndWatchTimer);
      gameStartEndWatchTimer = 0;
    }
  }

  function clearGameStartFlashTimer() {
    if (gameStartIndicatorFlashTimer) {
      window.clearTimeout(gameStartIndicatorFlashTimer);
      gameStartIndicatorFlashTimer = 0;
    }
  }

  function getFaviconLink() {
    const targetDocument = getGameStartIndicatorDocument();
    return targetDocument.querySelector('link[rel~="icon"]');
  }

  function getGameStartIndicatorDocument() {
    try {
      return window.top && window.top.document ? window.top.document : document;
    } catch {
      return document;
    }
  }

  function shouldPostGameStartIndicatorToTop() {
    if (!window.top || window.top === window) {
      return false;
    }

    try {
      return !window.top.document;
    } catch {
      return true;
    }
  }

  function postGameStartIndicatorToTop(payload) {
    if (!shouldPostGameStartIndicatorToTop()) {
      return;
    }

    try {
      window.top.postMessage(
        {
          ...payload,
          feature: 'gameStartIndicator',
          source: 'QOLBox',
        },
        '*'
      );
    } catch {
      // Cross-origin title relay is best-effort.
    }
  }

  function saveGameStartFavicon() {
    if (gameStartOriginalFavicon) {
      return;
    }

    const targetDocument = getGameStartIndicatorDocument();
    const link = getFaviconLink();
    gameStartOriginalFavicon = link
      ? {
          href: link.getAttribute('href'),
          link,
          type: link.getAttribute('type'),
        }
      : { href: null, link: null, type: null };
    gameStartIndicatorFaviconLink = link || targetDocument.createElement('link');

    if (!link) {
      gameStartIndicatorFaviconLink.rel = 'icon';
      (targetDocument.head || targetDocument.documentElement).appendChild(gameStartIndicatorFaviconLink);
    }
  }

  function setGameStartFavicon(active) {
    saveGameStartFavicon();

    if (!gameStartIndicatorFaviconLink) {
      return;
    }

    if (active) {
      gameStartIndicatorFaviconLink.setAttribute('href', GAME_START_FAVICON_HREF);
      gameStartIndicatorFaviconLink.setAttribute('type', 'image/svg+xml');
      postGameStartIndicatorToTop({ action: 'favicon', active: true });
      return;
    }

    if (gameStartOriginalFavicon && gameStartOriginalFavicon.href) {
      gameStartIndicatorFaviconLink.setAttribute('href', gameStartOriginalFavicon.href);
    } else {
      gameStartIndicatorFaviconLink.removeAttribute('href');
    }

    if (gameStartOriginalFavicon && gameStartOriginalFavicon.type) {
      gameStartIndicatorFaviconLink.setAttribute('type', gameStartOriginalFavicon.type);
    } else {
      gameStartIndicatorFaviconLink.removeAttribute('type');
    }

    postGameStartIndicatorToTop({ action: 'favicon', active: false });
  }

  function restoreGameStartFavicon() {
    if (!gameStartOriginalFavicon || !gameStartIndicatorFaviconLink) {
      return;
    }

    if (!gameStartOriginalFavicon.link) {
      gameStartIndicatorFaviconLink.remove();
    } else {
      setGameStartFavicon(false);
    }

    gameStartIndicatorFaviconLink = null;
    gameStartOriginalFavicon = null;
  }

  function stripGameStartTitlePrefix(title) {
    for (const prefix of GAME_START_TITLE_PREFIXES) {
      if (title && title.startsWith(prefix)) {
        return title.slice(prefix.length);
      }
    }

    return title;
  }

  function getGameStartTitle() {
    return getGameStartIndicatorDocument().title || '';
  }

  function setGameStartTitle(title) {
    getGameStartIndicatorDocument().title = title;
    postGameStartIndicatorToTop({ action: 'title', title });
  }

  function flashGameStartIndicator() {
    if (!gameStartIndicatorActive) {
      return;
    }

    gameStartIndicatorFlashOn = !gameStartIndicatorFlashOn;
    setGameStartTitle(`${getGameStartTitlePrefix(gameStartIndicatorReason)}${gameStartOriginalTitle}`);
    setGameStartFavicon(gameStartIndicatorFlashOn);
    gameStartIndicatorFlashTimer = window.setTimeout(flashGameStartIndicator, GAME_START_FLASH_INTERVAL_MS);
  }

  function scheduleGameStartEndWatch() {
    if (!gameStartIndicatorActive || gameStartEndWatchTimer) {
      return;
    }

    gameStartEndWatchTimer = window.setTimeout(() => {
      gameStartEndWatchTimer = 0;

      if (!gameStartIndicatorActive) {
        return;
      }

      if (!isPlayingMatch()) {
        gameStartWasPlayingWhenUnfocused = false;
        gameStartWasInLobbyWhenUnfocused = isPlayableLobby();
        clearGameStartIndicator();

        if (!isGameStartPageFocused()) {
          scheduleGameStartWatch();
        }

        return;
      }

      scheduleGameStartEndWatch();
    }, GAME_START_END_WATCH_INTERVAL_MS);
  }

  function showGameStartIndicator(reason = 'started') {
    if (!shouldRunFeature(FEATURE_GAME_START_ALERT)) {
      return;
    }

    if (gameStartIndicatorActive) {
      scheduleGameStartEndWatch();
      return;
    }

    gameStartIndicatorReason = reason;
    gameStartOriginalTitle = stripGameStartTitlePrefix(getGameStartTitle());
    gameStartIndicatorActive = true;
    gameStartIndicatorFlashOn = false;
    clearGameStartFlashTimer();
    flashGameStartIndicator();
    scheduleGameStartEndWatch();
  }

  function clearGameStartIndicator() {
    clearGameStartIndicatorTimer();
    clearGameStartEndWatchTimer();
    clearGameStartFlashTimer();

    if (!gameStartIndicatorActive) {
      return;
    }

    setGameStartTitle(gameStartOriginalTitle);
    restoreGameStartFavicon();
    postGameStartIndicatorToTop({ action: 'clear' });
    gameStartOriginalTitle = '';
    gameStartIndicatorFlashOn = false;
    gameStartIndicatorReason = 'started';
    gameStartIndicatorActive = false;
  }

  function scheduleGameStartIndicator(reason = 'pulled') {
    if (!shouldRunFeature(FEATURE_GAME_START_ALERT) || gameStartIndicatorTimer || isGameStartPageFocused()) {
      return;
    }

    clearGameStartWatchTimer();
    gameStartIndicatorReason = reason;
    gameStartIndicatorTimer = window.setTimeout(() => {
      gameStartIndicatorTimer = 0;

      if (!isGameStartPageFocused() && !gameStartWasPlayingWhenUnfocused && isPlayingMatch() && !isPlayableLobby()) {
        showGameStartIndicator(gameStartIndicatorReason);
      }
    }, GAME_START_INDICATOR_DELAY_MS);
  }

  function scheduleGameStartWatch() {
    if (
      !shouldRunFeature(FEATURE_GAME_START_ALERT) ||
      gameStartWatchTimer ||
      isGameStartPageFocused() ||
      gameStartIndicatorActive
    ) {
      return;
    }

    gameStartWatchTimer = window.setTimeout(() => {
      gameStartWatchTimer = 0;
      updateGameStartIndicator();

      if (!gameStartIndicatorActive && !isGameStartPageFocused()) {
        scheduleGameStartWatch();
      }
    }, GAME_START_WATCH_INTERVAL_MS);
  }

  function updateGameStartIndicator() {
    if (!shouldRunFeature(FEATURE_GAME_START_ALERT)) {
      gameStartWasPlayingWhenUnfocused = false;
      clearGameStartWatchTimer();
      clearGameStartIndicator();
      return;
    }

    const playingMatch = isPlayingMatch();
    const playableLobby = isPlayableLobby();
    patchMultiplayerSessionGameStartHooks();

    if (isGameStartPageFocused()) {
      gameStartWasPlayingWhenUnfocused = playingMatch;
      gameStartWasInLobbyWhenUnfocused = false;
      return;
    }

    if (playableLobby) {
      gameStartWasPlayingWhenUnfocused = false;
      gameStartWasInLobbyWhenUnfocused = true;
      scheduleGameStartWatch();
      return;
    }

    if (!gameStartWasPlayingWhenUnfocused && playingMatch) {
      scheduleGameStartIndicator(getPolledGameStartReason());
      return;
    }

    if (!playingMatch) {
      gameStartWasPlayingWhenUnfocused = false;
      gameStartWasInLobbyWhenUnfocused = false;
      clearGameStartWatchTimer();
      clearGameStartIndicator();
      scheduleGameStartWatch();
    }
  }

  function patchMultiplayerSessionGameStartHooks(session = getMultiplayerSession()) {
    if (!shouldRunFeature(FEATURE_GAME_START_ALERT) || !session) {
      return;
    }

    if (
      session === gameStartSessionHookTarget &&
      ['KJ', 'ZJ'].every(methodName => typeof session[methodName] !== 'function' || session[methodName].__qolboxWrapped)
    ) {
      return;
    }

    let foundStartHandler = false;

    // Current hitbox.io game-start handlers in the live bundle.
    for (const methodName of ['KJ', 'ZJ']) {
      if (typeof session[methodName] !== 'function') {
        continue;
      }

      foundStartHandler = true;

      if (session[methodName].__qolboxWrapped) {
        continue;
      }

      const originalMethod = session[methodName];
      const wrappedMethod = function wrappedGameStartSessionMethod(...args) {
        const wasPlayingMatch = isPlayingMatch();
        const wasPlayableLobby = isPlayableLobby();
        let result;

        try {
          result = originalMethod.apply(this, args);
        } finally {
          handleGameStartAfterNativeEvent(wasPlayingMatch, wasPlayableLobby);
        }

        return result;
      };

      wrappedMethod.__qolboxWrapped = true;
      wrappedMethod.__qolboxOriginal = originalMethod;
      session[methodName] = wrappedMethod;
    }

    if (foundStartHandler) {
      gameStartSessionHookTarget = session;
    }
  }

  function handleGameStartIndicatorReturn() {
    if (!shouldRunFeature(FEATURE_GAME_START_ALERT)) {
      clearGameStartIndicator();
      return;
    }

    gameStartPageFocused = true;
    clearGameStartWatchTimer();
    clearGameStartIndicator();
    gameStartWasPlayingWhenUnfocused = isPlayingMatch();
    gameStartWasInLobbyWhenUnfocused = false;
  }

  function handleGameStartInteractionFocus() {
    if (shouldRunFeature(FEATURE_GAME_START_ALERT) && !document.hidden) {
      gameStartPageFocused = true;
      gameStartWasPlayingWhenUnfocused = isPlayingMatch();
      gameStartWasInLobbyWhenUnfocused = false;
    }
  }

  function installGameStartIndicatorHooks() {
    if (gameStartIndicatorHooksInstalled) {
      return;
    }

    gameStartIndicatorHooksInstalled = true;
    gameStartPageFocused = isPageFocused();
    document.addEventListener('pointerdown', handleGameStartInteractionFocus, true);
    document.addEventListener('mousedown', handleGameStartInteractionFocus, true);
    document.addEventListener('click', handleGameStartInteractionFocus, true);
    document.addEventListener('keydown', handleGameStartInteractionFocus, true);
    window.addEventListener('focus', handleGameStartIndicatorReturn, true);
    window.addEventListener(
      'blur',
      () => {
        if (!shouldRunFeature(FEATURE_GAME_START_ALERT)) {
          return;
        }

        gameStartPageFocused = false;
        patchMultiplayerSessionGameStartHooks();
        gameStartWasPlayingWhenUnfocused = isPlayingMatch();
        gameStartWasInLobbyWhenUnfocused = !gameStartWasPlayingWhenUnfocused && isPlayableLobby();
        scheduleGameStartWatch();
      },
      true
    );
    document.addEventListener(
      'visibilitychange',
      () => {
        if (!shouldRunFeature(FEATURE_GAME_START_ALERT)) {
          return;
        }

        if (document.hidden) {
          gameStartPageFocused = false;
          patchMultiplayerSessionGameStartHooks();
          gameStartWasPlayingWhenUnfocused = isPlayingMatch();
          gameStartWasInLobbyWhenUnfocused = !gameStartWasPlayingWhenUnfocused && isPlayableLobby();
          scheduleGameStartWatch();
        } else {
          handleGameStartIndicatorReturn();
        }
      },
      true
    );
  }

  function getActiveRenderMode() {
    // During the handoff into a match both layers can exist briefly.
    // Keep using the menu frame until the replay/menu layer is actually gone.
    if (hasVisibleLayer(FULLSCREEN_MENU_LAYER_SELECTOR)) {
      return 'menu';
    }

    if (hasVisibleLayer(FULLSCREEN_EDITOR_LAYER_SELECTOR)) {
      return 'editor';
    }

    if (hasVisibleLayer(FULLSCREEN_GAMEPLAY_LAYER_SELECTOR)) {
      return 'gameplay';
    }

    return 'menu';
  }

  function isEscapeKey(event) {
    return Boolean(event && (event.key === 'Escape' || event.key === 'Esc' || event.code === 'Escape'));
  }

  function isTabKey(event) {
    return Boolean(event && (event.key === 'Tab' || event.code === 'Tab'));
  }

  function isChatInput(element) {
    return Boolean(element instanceof Element && element.matches(CHAT_INPUT_SELECTOR));
  }

  function isLobbyChatInput(element) {
    return Boolean(element instanceof Element && element.matches('.lobbyContainer .chatBox .input'));
  }

  function getActiveChatInput(target = document.activeElement) {
    if (isChatInput(target)) {
      return target;
    }

    if (target instanceof Element) {
      const closestChatInput = target.closest(CHAT_INPUT_SELECTOR);
      if (isChatInput(closestChatInput)) {
        return closestChatInput;
      }
    }

    return document.querySelector('.inGameChat .input:focus, .lobbyContainer .chatBox .input:focus');
  }

  function focusElementWithoutScroll(element) {
    if (!element || typeof element.focus !== 'function') {
      return;
    }

    try {
      element.focus({ preventScroll: true });
    } catch {
      element.focus();
    }
  }

  function keepOutOfBrowserTabOrder(element) {
    if (element) {
      element.tabIndex = -1;
    }
  }

  function keepInBrowserTabOrder(element) {
    if (element) {
      element.tabIndex = 0;
    }
  }

  function resetBrowserScroll() {
    try {
      window.scrollTo(0, 0);
    } catch {
      // Ignore scroll failures in older userscript engines.
    }

    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }

  function setJukeboxBottom(jukebox, bottom) {
    if (jukebox) {
      jukebox.style.bottom = bottom;
    }
  }

  function focusActiveRenderCanvas() {
    const canvas = getActiveRenderCanvas();
    if (!canvas) {
      return;
    }

    if (!canvas.hasAttribute('tabindex')) {
      canvas.tabIndex = -1;
    }

    focusElementWithoutScroll(canvas);
  }

  function restoreLobbyChatPrompt(input) {
    if (!isLobbyChatInput(input)) {
      return;
    }

    const chatBox = input.closest('.lobbyContainer .chatBox');
    const instruction = chatBox && chatBox.querySelector('.lowerInstruction');
    if (instruction) {
      instruction.style.visibility = 'inherit';

      if (!(instruction.textContent || '').trim()) {
        instruction.textContent =
          window.a8 && window.a8.xm ? TOUCH_LOBBY_CHAT_PROMPT : DESKTOP_LOBBY_CHAT_PROMPT;
      }
    }

    if (!window.a8 || !window.a8.xm) {
      input.style.pointerEvents = 'none';
    }
  }

  function closeChatInput(input) {
    if (!shouldRunFeature(FEATURE_CHAT)) {
      return false;
    }

    if (!isChatInput(input)) {
      return false;
    }

    const closingLobbyChat = isLobbyChatInput(input);
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.blur();
    input.classList.remove('bgActive');

    if (closingLobbyChat) {
      restoreLobbyChatPrompt(input);
    } else {
      focusActiveRenderCanvas();
    }

    return true;
  }

  function handleChatEscape(event) {
    if (!shouldRunFeature(FEATURE_CHAT) || !isEscapeKey(event)) {
      return;
    }

    const input = getActiveChatInput(event.target);
    const suppressingKeyup = event.type === 'keyup' && Date.now() < suppressEscapeKeyUntil;
    if (!input && !suppressingKeyup) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (event.type === 'keydown' && input) {
      suppressEscapeKeyUntil = Date.now() + 500;
      closeChatInput(input);
    }
  }

  function installChatEscapeHooks() {
    if (chatEscapeHooksInstalled) {
      return;
    }

    chatEscapeHooksInstalled = true;
    window.addEventListener('keydown', handleChatEscape, true);
    window.addEventListener('keyup', handleChatEscape, true);
    document.addEventListener('keydown', handleChatEscape, true);
    document.addEventListener('keyup', handleChatEscape, true);
  }

  function patchChatTabOrder() {
    if (!shouldRunFeature(FEATURE_CHAT)) {
      return;
    }

    // Browser Tab focus bypasses the game's native chat-open path; Enter still focuses chat normally.
    for (const input of document.querySelectorAll(CHAT_INPUT_SELECTOR)) {
      keepOutOfBrowserTabOrder(input);
    }
  }

  function openJukeboxFromKeyboardFocus(jukebox) {
    if (!shouldRunFeature(FEATURE_AUDIO) || !jukebox) {
      return;
    }

    resetBrowserScroll();
    setJukeboxBottom(jukebox, '0px');

    if (typeof jukebox.onmouseenter === 'function') {
      jukebox.onmouseenter();
    } else {
      setJukeboxBottom(jukebox, '0px');
    }

    scheduleUiWork({ force: true, passes: RESIZE_SETTLE_PASSES });
  }

  function closeJukeboxFromKeyboardFocus(jukebox, nextFocusTarget) {
    if (
      !shouldRunFeature(FEATURE_AUDIO) ||
      !jukebox ||
      (nextFocusTarget instanceof Element && jukebox.contains(nextFocusTarget)) ||
      jukebox.matches(':hover')
    ) {
      return;
    }

    if (typeof jukebox.onmouseleave === 'function') {
      jukebox.onmouseleave();
    } else {
      setJukeboxBottom(jukebox, '-50px');
    }
  }

  function focusJukeboxKnobFromTab(knob) {
    if (!shouldRunFeature(FEATURE_AUDIO)) {
      return false;
    }

    const jukebox = knob && knob.closest('.jukebox');
    if (!jukebox) {
      return false;
    }

    openJukeboxFromKeyboardFocus(jukebox);
    focusElementWithoutScroll(knob);
    resetBrowserScroll();
    return true;
  }

  function isGameplayTabFocusContext(target, knob) {
    const activeCanvas = getActiveRenderCanvas();
    return (
      target === window ||
      target === document ||
      target === document.body ||
      target === document.documentElement ||
      target === activeCanvas ||
      target === knob
    );
  }

  function handleGameplayTabFocus(event) {
    if (
      !shouldRunFeature(FEATURE_AUDIO) ||
      !isTabKey(event) ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      isChatInput(event.target) ||
      getActiveRenderMode() !== 'gameplay'
    ) {
      return;
    }

    const knob = findJukeboxKnob();
    const jukebox = knob && knob.closest('.jukebox');
    if (!knob || !jukebox || !isElementVisible(jukebox) || !isGameplayTabFocusContext(event.target, knob)) {
      return;
    }

    event.preventDefault();

    if (document.activeElement === knob) {
      focusActiveRenderCanvas();
      closeJukeboxFromKeyboardFocus(jukebox, document.activeElement);
      return;
    }

    focusJukeboxKnobFromTab(knob);
  }

  function installTabFocusHooks() {
    if (tabFocusHooksInstalled) {
      return;
    }

    tabFocusHooksInstalled = true;
    window.addEventListener('keydown', handleGameplayTabFocus, true);
  }

  function patchJukeboxKeyboardFocus(knob) {
    if (!shouldRunFeature(FEATURE_AUDIO)) {
      return;
    }

    const jukebox = knob && knob.closest('.jukebox');
    if (!jukebox || jukebox.dataset.qolboxKeyboardFocusPatched) {
      return;
    }

    jukebox.dataset.qolboxKeyboardFocusPatched = 'true';
    jukebox.addEventListener('focusin', () => openJukeboxFromKeyboardFocus(jukebox), true);
    jukebox.addEventListener(
      'focusout',
      event => closeJukeboxFromKeyboardFocus(jukebox, event.relatedTarget),
      true
    );
  }

  function getLobbyMusicController() {
    const game = window.a8;
    return game && game.cR && typeof game.cR === 'object' ? game.cR : null;
  }

  function isLobbyMusicAllowed() {
    return !shouldRunFeature(FEATURE_AUDIO) || !hasVisibleLayer(FULLSCREEN_PLAY_LAYER_SELECTOR);
  }

  function stopLobbyMusicIfNeeded() {
    if (!shouldRunFeature(FEATURE_AUDIO) || isLobbyMusicAllowed()) {
      return;
    }

    const controller = getLobbyMusicController();
    if (!controller || typeof controller.stop !== 'function') {
      return;
    }

    try {
      controller.stop();
    } catch {
      // Ignore half-initialized audio controllers while the game is transitioning.
    }
  }

  function patchLobbyMusicController() {
    if (!shouldRunFeature(FEATURE_AUDIO) && !lobbyMusicPatchInstalled) {
      return false;
    }

    const controller = getLobbyMusicController();
    if (!controller || typeof controller.start !== 'function') {
      return false;
    }

    if (!lobbyMusicPatchInstalled || !controller.start.__qolboxWrapped) {
      const originalStart = controller.start;
      const wrappedStart = function (...args) {
        if (isLobbyMusicAllowed()) {
          return originalStart.apply(this, args);
        }

        if (typeof this.stop === 'function') {
          try {
            this.stop();
          } catch {
            // Ignore stop failures from partially initialized lobby music.
          }
        }

        return undefined;
      };

      wrappedStart.__qolboxWrapped = true;
      wrappedStart.__qolboxOriginal = originalStart;
      controller.start = wrappedStart;
      lobbyMusicPatchInstalled = true;
    }

    stopLobbyMusicIfNeeded();
    return true;
  }

  function getModeInsets(mode, viewport) {
    if (mode === 'gameplay' || mode === 'editor') {
      return {
        left: GAMEPLAY_SAFE_SIDE_PX,
        right: GAMEPLAY_SAFE_SIDE_PX,
        top: GAMEPLAY_SAFE_TOP_PX,
        bottom: GAMEPLAY_SAFE_BOTTOM_PX,
      };
    }

    return {
      left: MENU_FRAME_PADDING_PX,
      right: MENU_FRAME_PADDING_PX,
      top: MENU_FRAME_PADDING_PX,
      bottom: MENU_FRAME_PADDING_PX,
    };
  }

  function getFullscreenDimensions(viewport = getViewportSize(), mode = getActiveRenderMode()) {
    const base = getBaseGameSize();
    const insets = getModeInsets(mode, viewport);
    const availableWidth = Math.max(1, viewport.width - insets.left - insets.right);
    const availableHeight = Math.max(1, viewport.height - insets.top - insets.bottom);
    const scale = Math.max(0.01, Math.min(availableWidth / base.width, availableHeight / base.height));
    const width = Math.max(1, Math.round(base.width * scale));
    const height = Math.max(1, Math.round(base.height * scale));
    const left = insets.left + Math.max(0, Math.floor((availableWidth - width) / 2));
    const top = insets.top + Math.max(0, Math.floor((availableHeight - height) / 2));

    return {
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      baseWidth: base.width,
      baseHeight: base.height,
      width,
      height,
      scale,
      left,
      top,
      shellLeft: 0,
      shellTop: 0,
      shellWidth: viewport.width,
      shellHeight: viewport.height,
      insets,
      mode,
    };
  }

  function getNativeUiZoom(dimensions = getFullscreenDimensions()) {
    return Math.min(1, dimensions.width / 1400);
  }

  function getPinnedFullscreenDimensions(game = window.a8) {
    return (game && game.__qolboxPinnedDimensions) || getFullscreenDimensions();
  }

  function getRelativeContainerBounds(dimensions = getFullscreenDimensions()) {
    return {
      left: dimensions.left,
      top: dimensions.top,
      width: dimensions.width,
      height: dimensions.height,
    };
  }

  function getExpectedBackingSize(dimensions = getFullscreenDimensions()) {
    const pixelRatio = Math.max(1, Number(window.devicePixelRatio) || 1);
    return {
      width: Math.max(1, Math.round(dimensions.width * pixelRatio)),
      height: Math.max(1, Math.round(dimensions.height * pixelRatio)),
    };
  }

  function isLoadingScreenVisible() {
    const loading = document.getElementById('ccLoading');
    if (!loading || !loading.isConnected) {
      return false;
    }

    const style = window.getComputedStyle(loading);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }

  function resetScorePanelLayout(scorePanel) {
    for (const property of [
      'position',
      'left',
      'top',
      'right',
      'bottom',
      'transform',
      'text-align',
      'margin-top',
      'z-index',
    ]) {
      scorePanel.style.removeProperty(property);
    }
  }

  function resetSpectateControlsLayout(spectateControls) {
    for (const property of ['position', 'left', 'right', 'top', 'bottom', 'transform', 'margin', 'z-index']) {
      spectateControls.style.removeProperty(property);
    }
  }

  function parseCssRgbColor(value) {
    if (typeof value !== 'string') {
      return null;
    }

    const match = value.match(
      /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*(\d+(?:\.\d+)?))?\s*\)$/i
    );
    if (!match) {
      return null;
    }

    return {
      red: Math.max(0, Math.min(255, Math.round(Number(match[1])))),
      green: Math.max(0, Math.min(255, Math.round(Number(match[2])))),
      blue: Math.max(0, Math.min(255, Math.round(Number(match[3])))),
      alpha: match[4] === undefined ? 1 : Math.max(0, Math.min(1, Number(match[4]))),
    };
  }

  function parseNumericRgbColor(value) {
    const color = Number(value);
    if (!Number.isFinite(color) || color < 0 || color > 0xffffff) {
      return null;
    }

    return {
      red: (color >> 16) & 255,
      green: (color >> 8) & 255,
      blue: color & 255,
      alpha: 1,
    };
  }

  function parseHexRgbColor(value) {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim().replace(/^#|^0x/i, '');
    if (!/^[0-9a-f]{6}$/i.test(normalized)) {
      return null;
    }

    return parseNumericRgbColor(Number.parseInt(normalized, 16));
  }

  function colorsMatch(left, right) {
    return Boolean(
      left &&
        right &&
        left.red === right.red &&
        left.green === right.green &&
        left.blue === right.blue
    );
  }

  function isFallbackScoreRowColor(color) {
    return colorsMatch(color, SCORE_ROW_FALLBACK_RGB);
  }

  function getPlayerScoreColor(player) {
    if (!player || typeof player !== 'object') {
      return null;
    }

    for (const [key, value] of Object.entries(player)) {
      if (!/(colou?r|color|fill|tint)/i.test(key)) {
        continue;
      }

      const parsed =
        typeof value === 'number'
          ? parseNumericRgbColor(value)
          : parseCssRgbColor(value) || parseHexRgbColor(value);
      if (parsed) {
        return parsed;
      }
    }

    return TEAM_SCORE_COLORS.get(Number(player.N)) || null;
  }

  function getPlayerDisplayName(player) {
    if (!player || typeof player !== 'object') {
      return '';
    }

    for (const key of ['name', 'Nm', 'username', 'playerName']) {
      const value = player[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    return '';
  }

  function normalizeScoreName(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function getScoreRowName(row) {
    const nameElement = row && row.querySelector && row.querySelector('.name');
    return normalizeScoreName(nameElement ? nameElement.textContent : row && row.textContent);
  }

  function getScorePlayers() {
    const session = getMultiplayerSession();
    const players = session && session.KR && session.KR.uL ? session.KR.uL.Ho : null;
    return Array.isArray(players) ? players.filter(Boolean) : [];
  }

  function syncScoreRowsFromPlayers(scorePanel) {
    const rows = Array.from(scorePanel.querySelectorAll('.entryContainer'));
    const players = getScorePlayers();
    if (!rows.length || !players.length) {
      return false;
    }

    const playersByName = new Map();
    for (const player of players) {
      const name = normalizeScoreName(getPlayerDisplayName(player));
      if (name) {
        playersByName.set(name, player);
      }
    }

    let changed = false;
    rows.forEach((row, index) => {
      const inlineColor = parseCssRgbColor(row.style.backgroundColor);
      const computedColor = parseCssRgbColor(window.getComputedStyle(row).backgroundColor);
      const player = playersByName.get(getScoreRowName(row)) || players[index];
      const playerColor = getPlayerScoreColor(player);

      if (!playerColor || (inlineColor && !isFallbackScoreRowColor(inlineColor))) {
        return;
      }

      if (!inlineColor && computedColor && !isFallbackScoreRowColor(computedColor)) {
        return;
      }

      setImportantStyle(row, 'background-color', `rgb(${playerColor.red}, ${playerColor.green}, ${playerColor.blue})`);
      changed = true;
    });

    return changed;
  }

  function makeScoreRowsOpaque(scorePanel) {
    for (const row of scorePanel.querySelectorAll('.entryContainer')) {
      const inlineColor = parseCssRgbColor(row.style.backgroundColor);
      const computedColor = parseCssRgbColor(window.getComputedStyle(row).backgroundColor);
      const parsedColor = inlineColor || computedColor;
      if (!parsedColor || parsedColor.alpha >= 1) {
        continue;
      }

      // The vanilla CSS fallback is red; locking that in before the game fills player colors makes every pill red.
      if (!inlineColor && isFallbackScoreRowColor(parsedColor)) {
        continue;
      }

      setImportantStyle(
        row,
        'background-color',
        `rgb(${parsedColor.red}, ${parsedColor.green}, ${parsedColor.blue})`
      );
    }
  }

  function layoutRelativeHud(relativeBounds, dimensions) {
    const isLoading = isLoadingScreenVisible();
    const useGameplayHudLayout = dimensions.mode === 'gameplay' && !isLoading;

    for (const scorePanel of document.querySelectorAll('.scores')) {
      if (!useGameplayHudLayout) {
        resetScorePanelLayout(scorePanel);
        setImportantStyle(scorePanel, 'display', 'none');
        continue;
      }

      syncScoreRowsFromPlayers(scorePanel);
      makeScoreRowsOpaque(scorePanel);

      setImportantStyle(scorePanel, 'display', 'block');
      setImportantStyle(scorePanel, 'position', 'absolute');
      setImportantStyle(scorePanel, 'left', '50%');
      setImportantStyle(scorePanel, 'top', '12px');
      setImportantStyle(scorePanel, 'right', 'auto');
      setImportantStyle(scorePanel, 'bottom', 'auto');
      setImportantStyle(scorePanel, 'transform', 'translateX(-50%)');
      setImportantStyle(scorePanel, 'text-align', 'center');
      setImportantStyle(scorePanel, 'margin-top', '0');
      setImportantStyle(scorePanel, 'z-index', '10');
    }

    for (const spectateControls of document.querySelectorAll('.spectateControls')) {
      if (!useGameplayHudLayout) {
        resetSpectateControlsLayout(spectateControls);
        continue;
      }

      setImportantStyle(spectateControls, 'position', 'absolute');
      setImportantStyle(spectateControls, 'left', '50%');
      setImportantStyle(spectateControls, 'right', 'auto');
      setImportantStyle(spectateControls, 'top', 'auto');
      setImportantStyle(spectateControls, 'bottom', '12px');
      setImportantStyle(spectateControls, 'transform', 'translateX(-50%)');
      setImportantStyle(spectateControls, 'margin', '0');
      setImportantStyle(spectateControls, 'z-index', '11');
    }
  }

  function getEditorNativeSize(editorLayer) {
    const canvas = editorLayer && editorLayer.querySelector('canvas');
    const canvasWidth = Number(canvas && canvas.width);
    const canvasHeight = Number(canvas && canvas.height);
    const base = getBaseGameSize();

    return {
      width: Number.isFinite(canvasWidth) && canvasWidth > 0 ? canvasWidth : base.width,
      height: Number.isFinite(canvasHeight) && canvasHeight > 0 ? canvasHeight : base.height,
    };
  }

  // The editor renderer and its DOM toolbars share native canvas coordinates; scale them together to keep pointer math and menus aligned.
  function getScaledEditorFrame(editorLayer, dimensions = getFullscreenDimensions(undefined, 'editor')) {
    const nativeSize = getEditorNativeSize(editorLayer);
    const scale = Math.max(
      0.01,
      Math.min(dimensions.width / nativeSize.width, dimensions.height / nativeSize.height)
    );
    const visualWidth = Math.max(1, Math.round(nativeSize.width * scale));
    const visualHeight = Math.max(1, Math.round(nativeSize.height * scale));

    return {
      left: dimensions.left + Math.max(0, Math.floor((dimensions.width - visualWidth) / 2)),
      top: dimensions.top + Math.max(0, Math.floor((dimensions.height - visualHeight) / 2)),
      width: nativeSize.width,
      height: nativeSize.height,
      scale,
      visualWidth,
      visualHeight,
    };
  }

  function fitEditorCanvasToNative(canvas, frame) {
    if (!canvas || !frame) {
      return;
    }

    setImportantStyle(canvas, 'position', 'absolute');
    setImportantStyle(canvas, 'left', '0');
    setImportantStyle(canvas, 'top', '0');
    setImportantStyle(canvas, 'right', 'auto');
    setImportantStyle(canvas, 'bottom', 'auto');
    setImportantStyle(canvas, 'width', `${frame.width}px`);
    setImportantStyle(canvas, 'height', `${frame.height}px`);
    setImportantStyle(canvas, 'max-width', 'none');
    setImportantStyle(canvas, 'max-height', 'none');
    setImportantStyle(canvas, 'transform', 'none');
  }

  function fitEditorLayerToFrame(layer, dimensions = getFullscreenDimensions(undefined, 'editor')) {
    if (!layer || !(layer instanceof Element)) {
      return null;
    }

    const frame = getScaledEditorFrame(layer, dimensions);

    setImportantStyle(layer, 'position', 'absolute');
    setImportantStyle(layer, 'left', `${frame.left}px`);
    setImportantStyle(layer, 'top', `${frame.top}px`);
    setImportantStyle(layer, 'right', 'auto');
    setImportantStyle(layer, 'bottom', 'auto');
    setImportantStyle(layer, 'width', `${frame.width}px`);
    setImportantStyle(layer, 'height', `${frame.height}px`);
    setImportantStyle(layer, 'max-width', 'none');
    setImportantStyle(layer, 'max-height', 'none');
    setImportantStyle(layer, 'overflow', 'visible');
    setImportantStyle(layer, 'transform', `scale(${frame.scale})`);
    setImportantStyle(layer, 'transform-origin', 'top left');
    setImportantStyle(layer, 'zoom', '1');
    layer.dataset.qolboxEditorNativeWidth = String(frame.width);
    layer.dataset.qolboxEditorNativeHeight = String(frame.height);
    layer.dataset.qolboxEditorScale = String(frame.scale);

    const canvas = layer.querySelector('canvas');
    if (canvas) {
      fitEditorCanvasToNative(canvas, frame);
    }

    return frame;
  }

  function enforceFullscreenLayout(dimensions = getFullscreenDimensions()) {
    ensureGlobalStyle();
    const menuDimensions =
      dimensions.mode === 'menu' ? dimensions : getFullscreenDimensions(undefined, 'menu');
    const playDimensions =
      dimensions.mode === 'gameplay' || dimensions.mode === 'editor'
        ? dimensions
        : getFullscreenDimensions(undefined, 'gameplay');
    const activeDimensions =
      dimensions.mode === 'gameplay' || dimensions.mode === 'editor' ? playDimensions : menuDimensions;
    const relativeBounds = getRelativeContainerBounds(activeDimensions);

    setImportantStyle(document.documentElement, 'overflow', 'hidden');
    setImportantStyle(document.body, 'overflow', 'hidden');
    setImportantStyle(document.body, 'margin', '0');
    setImportantStyle(document.body, 'background-color', '#0a0a0a');

    const appContainer = document.getElementById('appContainer');
    if (appContainer) {
      setImportantStyle(appContainer, 'position', 'fixed');
      setImportantStyle(appContainer, 'left', `${activeDimensions.shellLeft}px`);
      setImportantStyle(appContainer, 'top', `${activeDimensions.shellTop}px`);
      setImportantStyle(appContainer, 'right', 'auto');
      setImportantStyle(appContainer, 'bottom', 'auto');
      setImportantStyle(appContainer, 'margin', '0');
      setImportantStyle(appContainer, 'width', `${activeDimensions.shellWidth}px`);
      setImportantStyle(appContainer, 'height', `${activeDimensions.shellHeight}px`);
      setImportantStyle(appContainer, 'max-width', 'none');
      setImportantStyle(appContainer, 'max-height', 'none');
      setImportantStyle(appContainer, 'border', '0');
      setImportantStyle(appContainer, 'overflow', 'hidden');
    }

    const relativeContainer = document.getElementById('relativeContainer');
    if (relativeContainer) {
      setImportantStyle(relativeContainer, 'position', 'fixed');
      setImportantStyle(relativeContainer, 'left', `${relativeBounds.left}px`);
      setImportantStyle(relativeContainer, 'top', `${relativeBounds.top}px`);
      setImportantStyle(relativeContainer, 'right', 'auto');
      setImportantStyle(relativeContainer, 'bottom', 'auto');
      setImportantStyle(relativeContainer, 'margin', '0');
      setImportantStyle(relativeContainer, 'width', `${relativeBounds.width}px`);
      setImportantStyle(relativeContainer, 'height', `${relativeBounds.height}px`);
      setImportantStyle(relativeContainer, 'overflow', 'visible');
    }

    const backgroundImage = document.getElementById('backgroundImage');
    if (backgroundImage) {
      setImportantStyle(backgroundImage, 'position', 'fixed');
      setImportantStyle(backgroundImage, 'left', '0');
      setImportantStyle(backgroundImage, 'top', '0');
      setImportantStyle(backgroundImage, 'right', 'auto');
      setImportantStyle(backgroundImage, 'bottom', 'auto');
      setImportantStyle(backgroundImage, 'width', `${dimensions.viewportWidth}px`);
      setImportantStyle(backgroundImage, 'height', `${dimensions.viewportHeight}px`);
    }

    for (const layer of document.querySelectorAll(FULLSCREEN_RENDER_LAYER_SELECTOR)) {
      if (isEditorLayer(layer)) {
        fitEditorLayerToFrame(layer, activeDimensions);
        continue;
      }

      setImportantStyle(layer, 'position', 'absolute');
      setImportantStyle(layer, 'left', `${activeDimensions.left}px`);
      setImportantStyle(layer, 'top', `${activeDimensions.top}px`);
      setImportantStyle(layer, 'right', 'auto');
      setImportantStyle(layer, 'bottom', 'auto');
      setImportantStyle(layer, 'width', `${activeDimensions.width}px`);
      setImportantStyle(layer, 'height', `${activeDimensions.height}px`);
      setImportantStyle(layer, 'max-width', 'none');
      setImportantStyle(layer, 'max-height', 'none');
      setImportantStyle(layer, 'overflow', 'hidden');
      setImportantStyle(layer, 'transform', 'none');
      setImportantStyle(layer, 'zoom', '1');
    }

    for (const canvas of document.querySelectorAll(FULLSCREEN_RENDER_CANVAS_SELECTOR)) {
      if (isEditorCanvas(canvas)) {
        const editorLayer = canvas.parentElement;
        const frame = getScaledEditorFrame(editorLayer, activeDimensions);
        fitEditorCanvasToNative(canvas, frame);
        continue;
      }

      setImportantStyle(canvas, 'position', 'absolute');
      setImportantStyle(canvas, 'left', '0');
      setImportantStyle(canvas, 'top', '0');
      setImportantStyle(canvas, 'right', 'auto');
      setImportantStyle(canvas, 'bottom', 'auto');
      setImportantStyle(canvas, 'width', `${activeDimensions.width}px`);
      setImportantStyle(canvas, 'height', `${activeDimensions.height}px`);
      setImportantStyle(canvas, 'max-width', 'none');
      setImportantStyle(canvas, 'max-height', 'none');
      setImportantStyle(canvas, 'transform', 'none');
    }

    const uiZoom = String(getNativeUiZoom(activeDimensions));
    for (const overlay of document.querySelectorAll('.inGameCSS')) {
      setImportantStyle(overlay, 'zoom', uiZoom);
      setImportantStyle(overlay, 'transform-origin', 'top left');
    }

    layoutRelativeHud(relativeBounds, activeDimensions);
    return true;
  }

  function setNativeFullscreenSize(dimensions = getFullscreenDimensions()) {
    const game = window.a8;
    if (!game) {
      return false;
    }

    game.__qolboxPinnedDimensions = dimensions;
    installNativeMetricOverride(game);

    game._P = dimensions.scale;
    game.lg = dimensions.width;
    game.ug = dimensions.height;

    if ('Qp' in game) {
      game.Qp = getNativeUiZoom(dimensions);
    }

    if (typeof game.PP === 'function') {
      try {
        game.PP();
      } catch {
        // Ignore intermediate layout failures while the game is booting.
      }
    }

    return true;
  }

  function installNativeMetricOverride(game = window.a8) {
    if (!game || game.__qolboxMetricOverrideInstalled) {
      return Boolean(game);
    }

    const metricNames = ['_P', 'Qp', 'lg', 'ug'];
    game.__qolboxMetricOriginals = {};
    for (const metricName of metricNames) {
      game.__qolboxMetricOriginals[metricName] = {
        descriptor: Object.getOwnPropertyDescriptor(game, metricName) || null,
      };
    }

    const makeMetricAccessor = getter => ({
      configurable: true,
      enumerable: true,
      get: getter,
      set: () => {
        // Ignore native writes and keep fullscreen metrics authoritative.
      },
    });

    try {
      Object.defineProperty(game, '_P', makeMetricAccessor(() => getPinnedFullscreenDimensions(game).scale));
      Object.defineProperty(
        game,
        'Qp',
        makeMetricAccessor(() => getNativeUiZoom(getPinnedFullscreenDimensions(game)))
      );
      Object.defineProperty(game, 'lg', makeMetricAccessor(() => getPinnedFullscreenDimensions(game).width));
      Object.defineProperty(
        game,
        'ug',
        makeMetricAccessor(() => getPinnedFullscreenDimensions(game).height)
      );
      game.__qolboxMetricOverrideInstalled = true;
      return true;
    } catch {
      return false;
    }
  }

  function restoreNativeMetricOverride(game = window.a8) {
    if (!game || !game.__qolboxMetricOverrideInstalled) {
      return false;
    }

    const originals = game.__qolboxMetricOriginals || {};
    for (const metricName of ['_P', 'Qp', 'lg', 'ug']) {
      const original = originals[metricName];
      try {
        if (original && original.descriptor) {
          Object.defineProperty(game, metricName, original.descriptor);
        } else {
          delete game[metricName];
        }
      } catch {
        // Keep going; any restored metric is better than leaving the whole override active.
      }
    }

    delete game.__qolboxPinnedDimensions;
    delete game.__qolboxMetricOriginals;
    delete game.__qolboxMetricOverrideInstalled;
    return true;
  }

  function restoreNativeFullscreenPatch(game = window.a8) {
    if (!game) {
      return false;
    }

    if (game.ag && game.ag.__qolboxWrapped && game.ag.__qolboxOriginal) {
      game.ag = game.ag.__qolboxOriginal;
    }

    restoreNativeMetricOverride(game);

    if (typeof game.ag === 'function') {
      try {
        game.ag.call(game);
      } catch {
        // Ignore native resize failures while the game is transitioning.
      }
    }

    return true;
  }

  function installNativeFullscreenPatch() {
    const game = window.a8;
    if (!game) {
      return false;
    }

    installNativeMetricOverride(game);

    if (typeof game.ag === 'function' && !game.ag.__qolboxWrapped) {
      const originalResize = game.ag;
      const wrappedResize = function (...args) {
        setNativeFullscreenSize(getFullscreenDimensions());

        if (game.__qolboxRunningNativeResize) {
          return originalResize.apply(this, args);
        }

        game.__qolboxRunningNativeResize = true;
        try {
          const result = originalResize.apply(this, args);
          setNativeFullscreenSize(getFullscreenDimensions());
          return result;
        } finally {
          game.__qolboxRunningNativeResize = false;
        }
      };

      wrappedResize.__qolboxWrapped = true;
      wrappedResize.__qolboxOriginal = originalResize;
      game.ag = wrappedResize;
    }
    return true;
  }

  function runNativeResize(dimensions = getFullscreenDimensions()) {
    const game = window.a8;
    if (!game || typeof game.ag !== 'function') {
      return false;
    }

    setNativeFullscreenSize(dimensions);

    try {
      game.ag.call(game, dimensions);
      return true;
    } catch {
      return false;
    }
  }

  function fitElementToFrame(element, dimensions = getFullscreenDimensions(), left = 0, top = 0) {
    if (!element || !(element instanceof Element)) {
      return;
    }

    if (isEditorLayer(element)) {
      fitEditorLayerToFrame(element, dimensions);
      return;
    }

    setImportantStyle(element, 'position', 'absolute');
    setImportantStyle(element, 'left', `${left}px`);
    setImportantStyle(element, 'top', `${top}px`);
    setImportantStyle(element, 'right', 'auto');
    setImportantStyle(element, 'bottom', 'auto');
    setImportantStyle(element, 'margin', '0');
    setImportantStyle(element, 'width', `${dimensions.width}px`);
    setImportantStyle(element, 'height', `${dimensions.height}px`);
    setImportantStyle(element, 'max-width', 'none');
    setImportantStyle(element, 'max-height', 'none');
    setImportantStyle(element, 'overflow', 'hidden');
    setImportantStyle(element, 'transform', 'none');
  }

  function getRendererHost(renderer) {
    const host =
      (renderer && (renderer.Tg || renderer.dg)) ||
      (renderer && renderer.Ag && renderer.Ag.view && renderer.Ag.view.parentElement) ||
      null;
    return host instanceof Element ? host : null;
  }

  function getKnownRenderers() {
    const renderers = [];
    const seen = new Set();

    function addRenderer(candidate) {
      if (
        !candidate ||
        typeof candidate !== 'object' ||
        seen.has(candidate) ||
        !candidate.Bc ||
        !(candidate.Ag || typeof candidate.cg === 'function')
      ) {
        return;
      }

      seen.add(candidate);
      renderers.push(candidate);
    }

    function collect(candidate) {
      if (!candidate) {
        return;
      }

      if (Array.isArray(candidate)) {
        candidate.forEach(collect);
        return;
      }

      addRenderer(candidate);
      addRenderer(candidate.hb);

      if (Array.isArray(candidate.hb)) {
        candidate.hb.forEach(addRenderer);
      }
    }

    collect(window.multiplayerSession);
    collect(window.A4);
    collect(window.a8 && window.a8.II);
    return renderers;
  }

  function resizeKnownRenderers(dimensions = getFullscreenDimensions()) {
    const pixelRatio = Math.max(1, Number(window.devicePixelRatio) || 1);

    for (const renderer of getKnownRenderers()) {
      const frameWidth = Math.max(1, Math.round(dimensions.width));
      const frameHeight = Math.max(1, Math.round(dimensions.height));

      renderer.Bc.wc = frameWidth;
      renderer.Bc.mc = frameHeight;

      if (renderer.Ag && typeof renderer.Ag === 'object') {
        if ('autoDensity' in renderer.Ag) {
          renderer.Ag.autoDensity = true;
        }
        if (typeof renderer.Ag.resolution === 'number') {
          renderer.Ag.resolution = pixelRatio;
        }
        if (renderer.Ag.options && typeof renderer.Ag.options === 'object') {
          renderer.Ag.options.autoDensity = true;
          renderer.Ag.options.resolution = pixelRatio;
        }
      }

      try {
        if (typeof renderer.cg === 'function') {
          renderer.cg(frameWidth, frameHeight);
        } else if (renderer.Ag && typeof renderer.Ag.resize === 'function') {
          renderer.Ag.resize(frameWidth, frameHeight);
        }
      } catch {
        // Ignore incomplete renderers while the scene is rebuilding.
      }

      fitElementToFrame(getRendererHost(renderer), dimensions, dimensions.left, dimensions.top);

      if (renderer.Ag && renderer.Ag.view) {
        const view = renderer.Ag.view;

        setImportantStyle(view, 'position', 'absolute');
        setImportantStyle(view, 'left', '0');
        setImportantStyle(view, 'top', '0');
        setImportantStyle(view, 'right', 'auto');
        setImportantStyle(view, 'bottom', 'auto');
        setImportantStyle(view, 'width', `${frameWidth}px`);
        setImportantStyle(view, 'height', `${frameHeight}px`);
        setImportantStyle(view, 'max-width', 'none');
        setImportantStyle(view, 'max-height', 'none');
        setImportantStyle(view, 'transform', 'none');

        fitElementToFrame(view.parentElement, dimensions, dimensions.left, dimensions.top);
      }
    }
  }

  function getActiveRenderCanvas(mode = getActiveRenderMode()) {
    const selector =
      mode === 'gameplay'
        ? FULLSCREEN_GAMEPLAY_LAYER_SELECTOR
        : mode === 'editor'
          ? FULLSCREEN_EDITOR_LAYER_SELECTOR
          : FULLSCREEN_MENU_LAYER_SELECTOR;

    for (const layer of document.querySelectorAll(selector)) {
      if (!isElementVisible(layer)) {
        continue;
      }

      const canvas = layer.querySelector('canvas');
      if (canvas) {
        return canvas;
      }
    }

    return document.querySelector(FULLSCREEN_RENDER_CANVAS_SELECTOR);
  }

  function getLayoutProbe() {
    const appContainer = document.getElementById('appContainer');
    const relativeContainer = document.getElementById('relativeContainer');
    const renderLayer = getActiveRenderCanvas();
    const appRect = appContainer ? appContainer.getBoundingClientRect() : null;
    const relativeRect = relativeContainer ? relativeContainer.getBoundingClientRect() : null;
    const renderRect = renderLayer ? renderLayer.getBoundingClientRect() : null;
    const game = window.a8;
    const renderers = getKnownRenderers();

    return {
      appWidth: appRect ? Math.round(appRect.width) : 0,
      appHeight: appRect ? Math.round(appRect.height) : 0,
      relativeWidth: relativeRect ? Math.round(relativeRect.width) : 0,
      relativeHeight: relativeRect ? Math.round(relativeRect.height) : 0,
      renderWidth: renderRect ? Math.round(renderRect.width) : 0,
      renderHeight: renderRect ? Math.round(renderRect.height) : 0,
      renderLeft: renderRect ? Math.round(renderRect.left) : 0,
      renderTop: renderRect ? Math.round(renderRect.top) : 0,
      backingWidth: renderLayer && typeof renderLayer.width === 'number' ? Math.round(renderLayer.width) : 0,
      backingHeight: renderLayer && typeof renderLayer.height === 'number' ? Math.round(renderLayer.height) : 0,
      rendererCount: renderers.length,
      nativeWidth: Number(game && game.lg) || 0,
      nativeHeight: Number(game && game.ug) || 0,
    };
  }

  function isRenderProbeAligned(probe, dimensions) {
    if (probe.renderWidth <= 0 || probe.renderHeight <= 0) {
      return false;
    }

    const expectedBacking = getExpectedBackingSize(dimensions);
    const backingIsAligned =
      dimensions.mode === 'editor'
        ? probe.backingWidth > 0 && probe.backingHeight > 0
        : Math.abs(probe.backingWidth - expectedBacking.width) <= 2 &&
          Math.abs(probe.backingHeight - expectedBacking.height) <= 2;

    return (
      Math.abs(probe.renderWidth - dimensions.width) <= 2 &&
      Math.abs(probe.renderHeight - dimensions.height) <= 2 &&
      Math.abs(probe.renderLeft - dimensions.left) <= 2 &&
      Math.abs(probe.renderTop - dimensions.top) <= 2 &&
      backingIsAligned
    );
  }

  function isNativeProbeAligned(probe, dimensions) {
    if (probe.nativeWidth <= 0 || probe.nativeHeight <= 0) {
      return false;
    }

    return (
      Math.abs(probe.nativeWidth - dimensions.width) <= 2 &&
      Math.abs(probe.nativeHeight - dimensions.height) <= 2
    );
  }

  function buildFullscreenSignature(dimensions, probe) {
    return [
      dimensions.mode,
      dimensions.viewportWidth,
      dimensions.viewportHeight,
      dimensions.width,
      dimensions.height,
      dimensions.left,
      dimensions.top,
      probe.appWidth,
      probe.appHeight,
      probe.relativeWidth,
      probe.relativeHeight,
      probe.renderWidth,
      probe.renderHeight,
      probe.renderLeft,
      probe.renderTop,
      probe.backingWidth,
      probe.backingHeight,
      probe.rendererCount,
      probe.nativeWidth,
      probe.nativeHeight,
      Boolean(window.a8),
    ].join(':');
  }

  function refreshFullscreen(force = false) {
    if (!shouldRunFeature(FEATURE_FULLSCREEN)) {
      clearFullscreenLayoutStyles();
      return false;
    }

    if (shouldWaitForNativeLayoutSeed()) {
      window.setTimeout(() => scheduleUiWork({ force: true, passes: 1 }), 100);
      return false;
    }

    const dimensions = getFullscreenDimensions();
    const probe = getLayoutProbe();
    const signature = buildFullscreenSignature(dimensions, probe);
    const transitionOverlap = isMenuGameplayOverlap();

    patchLobbyMusicController();
    stopLobbyMusicIfNeeded();
    updateGameStartIndicator();
    enforceFullscreenLayout(dimensions);
    installNativeFullscreenPatch();
    setNativeFullscreenSize(dimensions);

    if (
      !force &&
      signature === lastFullscreenSignature &&
      isRenderProbeAligned(probe, dimensions) &&
      isNativeProbeAligned(probe, dimensions)
    ) {
      return false;
    }

    lastFullscreenSignature = signature;
    const resizedNatively = runNativeResize(dimensions);
    const postNativeProbe = getLayoutProbe();

    if (!transitionOverlap && (!resizedNatively || !isRenderProbeAligned(postNativeProbe, dimensions))) {
      resizeKnownRenderers(dimensions);
    }

    enforceFullscreenLayout(dimensions);
    lastFullscreenSignature = buildFullscreenSignature(dimensions, getLayoutProbe());
    return true;
  }

  function matchesElementOrDescendant(node, selector) {
    if (!(node instanceof Element)) {
      return false;
    }

    return node.matches(selector) || Boolean(node.closest(selector)) || Boolean(node.querySelector(selector));
  }

  function mutationTouchesSelector(record, selector) {
    const targetElement =
      record.target instanceof Element
        ? record.target
        : record.target && record.target.parentElement instanceof Element
          ? record.target.parentElement
          : null;

    if (matchesElementOrDescendant(targetElement, selector)) {
      return true;
    }

    for (const node of record.addedNodes) {
      if (matchesElementOrDescendant(node, selector)) {
        return true;
      }
    }

    for (const node of record.removedNodes) {
      if (matchesElementOrDescendant(node, selector)) {
        return true;
      }
    }

    return false;
  }

  function observeResizeTarget(element) {
    if (!fullscreenResizeObserver || !(element instanceof Element) || observedResizeTargets.has(element)) {
      return;
    }

    observedResizeTargets.add(element);
    fullscreenResizeObserver.observe(element);
  }

  function refreshObservedResizeTargets() {
    observeResizeTarget(document.documentElement);
    observeResizeTarget(document.body);
    observeResizeTarget(document.getElementById('appContainer'));
    observeResizeTarget(document.getElementById('relativeContainer'));
    observeResizeTarget(document.getElementById('backgroundImage'));

    for (const element of document.querySelectorAll(FULLSCREEN_RENDER_LAYER_SELECTOR)) {
      observeResizeTarget(element);
    }

    for (const element of document.querySelectorAll(FULLSCREEN_RENDER_CANVAS_SELECTOR)) {
      observeResizeTarget(element);
    }
  }

  function applyPersistentFeatures() {
    applyFeatureRootClasses();

    if (shouldRunFeature(FEATURE_RESERVE)) {
      patchReserveSpotFeature();
    } else {
      syncReserveJoinButtonLabel();
    }

    if (shouldRunFeature(FEATURE_GAME_START_ALERT)) {
      installGameStartIndicatorHooks();
      updateGameStartIndicator();
    } else {
      disableFeatureSideEffects(FEATURE_GAME_START_ALERT);
    }

    if (shouldRunFeature(FEATURE_CHAT)) {
      patchChatTabOrder();
    }

    if (shouldRunFeature(FEATURE_AUDIO)) {
      installTabFocusHooks();
      hookHowlPrototype();
      patchLobbyMusicController();
      patchGameVolumeMenu();
      installYouTubeReadyCallbackHook();
      hookYouTubePlayer();
      patchJukeboxMenu();
      patchJukeboxKnob();
      applyJukeboxState();
    } else {
      disableFeatureSideEffects(FEATURE_AUDIO);
    }
  }

  // Coalesce DOM churn; hidden tabs use a timeout because requestAnimationFrame can pause.
  function scheduleUiWork({ force = false, features = false, passes = 1 } = {}) {
    scheduledWorkForce = scheduledWorkForce || force;
    scheduledWorkFeatures = scheduledWorkFeatures || features;
    scheduledWorkPasses = Math.max(scheduledWorkPasses, Math.max(1, passes));

    if (scheduledWorkRaf) {
      return;
    }

    const runScheduledWork = () => {
      scheduledWorkRaf = 0;

      const shouldForce = scheduledWorkForce;
      const shouldPatchFeatures = scheduledWorkFeatures;
      const remainingPasses = scheduledWorkPasses;

      scheduledWorkForce = false;
      scheduledWorkFeatures = false;
      scheduledWorkPasses = 0;

      ensureGlobalStyle();
      applyFeatureRootClasses();
      installFullscreenHooks();

      if (shouldPatchFeatures) {
        applyPersistentFeatures();
      }

      refreshFullscreen(shouldForce);
      refreshObservedResizeTargets();

      if (remainingPasses > 1) {
        scheduleUiWork({ force: true, passes: remainingPasses - 1 });
      }
    };

    scheduledWorkRaf = document.hidden
      ? window.setTimeout(runScheduledWork, 0)
      : window.requestAnimationFrame(runScheduledWork);
  }

  function installGameReadyHook() {
    if (gameReadyHookInstalled) {
      return;
    }

    gameReadyHookInstalled = true;

    if (window.a8) {
      scheduleUiWork({ force: true, passes: FULLSCREEN_SETTLE_PASSES });
      return;
    }

    try {
      let pendingGame = null;

      Object.defineProperty(window, 'a8', {
        configurable: true,
        enumerable: true,
        get() {
          return pendingGame;
        },
        set(value) {
          pendingGame = value;
          Object.defineProperty(window, 'a8', {
            configurable: true,
            enumerable: true,
            writable: true,
            value,
          });
          scheduleUiWork({ force: true, passes: FULLSCREEN_SETTLE_PASSES });
        },
      });
    } catch {
      // Fall back to the DOM observers if the native game object can't be trapped.
    }
  }

  function installFullscreenHooks() {
    if (fullscreenHooksInstalled) {
      return;
    }

    if (!document.documentElement) {
      scheduleUiWork({ force: true, features: true, passes: FULLSCREEN_SETTLE_PASSES });
      return;
    }

    fullscreenHooksInstalled = true;
    installGameReadyHook();
    installQolboxMenuHooks();
    installChatEscapeHooks();

    if (shouldRunFeature(FEATURE_AUDIO)) {
      installTabFocusHooks();
    }

    if (shouldRunFeature(FEATURE_GAME_START_ALERT)) {
      installGameStartIndicatorHooks();
    }

    if (shouldRunFeature(FEATURE_RESERVE)) {
      installReserveSocketCaptureHook();
    }

    window.addEventListener('resize', () => scheduleUiWork({ force: true, passes: RESIZE_SETTLE_PASSES }), true);
    window.addEventListener(
      'orientationchange',
      () => scheduleUiWork({ force: true, passes: RESIZE_SETTLE_PASSES }),
      true
    );
    window.addEventListener(
      'load',
      () => scheduleUiWork({ force: true, features: true, passes: FULLSCREEN_SETTLE_PASSES }),
      true
    );
    window.addEventListener(
      'pageshow',
      () => scheduleUiWork({ force: true, features: true, passes: RESIZE_SETTLE_PASSES }),
      true
    );
    document.addEventListener(
      'visibilitychange',
      () => {
        if (!document.hidden) {
          scheduleUiWork({ force: true, features: true, passes: RESIZE_SETTLE_PASSES });
        }
      },
      true
    );
    document.addEventListener(
      'fullscreenchange',
      () => scheduleUiWork({ force: true, passes: RESIZE_SETTLE_PASSES }),
      true
    );

    fullscreenMutationObserver = new MutationObserver(records => {
      let needsLayout = false;
      let needsFeatures = false;

      for (const record of records) {
        if (!needsLayout && mutationTouchesSelector(record, FULLSCREEN_LAYOUT_TARGET_SELECTOR)) {
          needsLayout = true;
        }

        if (!needsFeatures && mutationTouchesSelector(record, FEATURE_PATCH_TARGET_SELECTOR)) {
          needsFeatures = true;
        }

        if (needsLayout && needsFeatures) {
          break;
        }
      }

      if (needsLayout || needsFeatures) {
        updateGameStartIndicator();
        scheduleUiWork({
          force: needsLayout,
          features: needsFeatures,
          passes: needsLayout ? FULLSCREEN_SETTLE_PASSES : 1,
        });
      }
    });

    fullscreenMutationObserver.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'id'],
    });

    if ('ResizeObserver' in window && typeof window.ResizeObserver === 'function') {
      fullscreenResizeObserver = new window.ResizeObserver(() => {
        scheduleUiWork({ force: true, passes: 1 });
      });
      refreshObservedResizeTargets();
    }
  }

  function findGameVolumeItem() {
    const candidates = document.querySelectorAll('.items.left .item, .item');
    for (const candidate of candidates) {
      if (/^Volume:\s*\d+%$/.test(candidate.textContent.trim())) {
        return candidate;
      }
    }

    return null;
  }

  function updateGameVolumeText() {
    if (!shouldRunFeature(FEATURE_AUDIO)) {
      return;
    }

    if (!currentGameMenuItem || !currentGameMenuItem.isConnected) {
      currentGameMenuItem = findGameVolumeItem();
    }

    if (!currentGameMenuItem) {
      return;
    }

    currentGameMenuItem.textContent = `Volume: ${gamePercent}%`;
    currentGameMenuItem.title = 'Scroll or use arrow keys to adjust by 5%, left-click up, right-click down';
    currentGameMenuItem.style.cursor = 'ns-resize';
    currentGameMenuItem.style.userSelect = 'none';
    keepOutOfBrowserTabOrder(currentGameMenuItem);
    currentGameMenuItem.setAttribute('role', 'slider');
    currentGameMenuItem.setAttribute('aria-label', 'Game volume');
    currentGameMenuItem.setAttribute('aria-valuemin', '0');
    currentGameMenuItem.setAttribute('aria-valuemax', '100');
    currentGameMenuItem.setAttribute('aria-valuenow', String(gamePercent));
    currentGameMenuItem.setAttribute('aria-valuetext', `${gamePercent}%`);
  }

  function applyGameVolume() {
    updateGameVolumeText();

    if (!window.Howler || !Array.isArray(window.Howler._howls) || !originalHowlVolume) {
      return;
    }

    settingGameVolumeInternally = true;
    try {
      for (const howl of window.Howler._howls) {
        if (!howl || typeof howl !== 'object') {
          continue;
        }

        if (typeof howl.__qolboxBaseVolume !== 'number') {
          const initialVolume = Number(howl._volume);
          howl.__qolboxBaseVolume = Number.isFinite(initialVolume) ? initialVolume : 1;
        }

        const scalar = shouldRunFeature(FEATURE_AUDIO) ? percentToGameScalar(gamePercent) : 1;
        originalHowlVolume.call(howl, howl.__qolboxBaseVolume * scalar);
      }
    } finally {
      settingGameVolumeInternally = false;
    }
  }

  function setGamePercent(nextPercent) {
    gamePercent = clampPercent(nextPercent, DEFAULT_GAME_PERCENT);
    saveGamePercent();
    applyGameVolume();
  }

  function patchGameVolumeMenu() {
    if (!shouldRunFeature(FEATURE_AUDIO)) {
      return false;
    }

    const item = findGameVolumeItem();
    if (!item) {
      return false;
    }

    currentGameMenuItem = item;

    if (!item.dataset.qolboxGameVolumePatched) {
      item.dataset.qolboxGameVolumePatched = 'true';
      item.addEventListener(
        'click',
        event => {
          if (!shouldRunFeature(FEATURE_AUDIO)) {
            return;
          }

          event.preventDefault();
          event.stopImmediatePropagation();
          focusElementWithoutScroll(item);
          setGamePercent(gamePercent + STEP_PERCENT);
        },
        true
      );
      item.addEventListener(
        'contextmenu',
        event => {
          if (!shouldRunFeature(FEATURE_AUDIO)) {
            return;
          }

          event.preventDefault();
          event.stopImmediatePropagation();
          focusElementWithoutScroll(item);
          setGamePercent(gamePercent - STEP_PERCENT);
        },
        true
      );
      item.addEventListener(
        'wheel',
        event => {
          if (!shouldRunFeature(FEATURE_AUDIO)) {
            return;
          }

          event.preventDefault();
          event.stopImmediatePropagation();
          focusElementWithoutScroll(item);
          setGamePercent(gamePercent + (event.deltaY < 0 ? STEP_PERCENT : -STEP_PERCENT));
        },
        { passive: false, capture: true }
      );
      item.addEventListener(
        'keydown',
        event => {
          if (!shouldRunFeature(FEATURE_AUDIO)) {
            return;
          }

          const nextPercent = getKeyboardPercentTarget(event, gamePercent, STEP_PERCENT);
          if (nextPercent === null) {
            return;
          }

          event.preventDefault();
          event.stopImmediatePropagation();
          setGamePercent(nextPercent);
        },
        true
      );
    }

    updateGameVolumeText();
    return true;
  }

  function shouldSuppressReserveRetryAudio() {
    return Boolean(shouldRunFeature(FEATURE_RESERVE) && reserveState && reserveState.active && Date.now() < reserveRetryAudioSuppressUntil);
  }

  function hookHowlPrototype() {
    if (!shouldRunFeature(FEATURE_AUDIO) && !originalHowlVolume) {
      return false;
    }

    const HowlCtor = window.Howl;
    if (!HowlCtor || !HowlCtor.prototype) {
      return false;
    }

    let volumePatched = Boolean(HowlCtor.prototype.volume && HowlCtor.prototype.volume.__qolboxWrapped);

    if (!volumePatched && typeof HowlCtor.prototype.volume === 'function') {
      originalHowlVolume = HowlCtor.prototype.volume;

      function wrappedVolume(value, ...rest) {
        if (arguments.length === 0) {
          if (typeof this.__qolboxBaseVolume === 'number') {
            return this.__qolboxBaseVolume;
          }

          return originalHowlVolume.call(this);
        }

        if (typeof value === 'number' && !settingGameVolumeInternally) {
          this.__qolboxBaseVolume = value;
          const scalar = shouldRunFeature(FEATURE_AUDIO) ? percentToGameScalar(gamePercent) : 1;
          return originalHowlVolume.call(this, value * scalar, ...rest);
        }

        return originalHowlVolume.call(this, value, ...rest);
      }

      wrappedVolume.__qolboxWrapped = true;
      HowlCtor.prototype.volume = wrappedVolume;
      volumePatched = true;
    }

    if (
      typeof HowlCtor.prototype.play === 'function' &&
      !HowlCtor.prototype.play.__qolboxReserveAudioWrapped
    ) {
      originalHowlPlay = HowlCtor.prototype.play;

      function wrappedPlay(...args) {
        if (shouldSuppressReserveRetryAudio()) {
          return undefined;
        }

        return originalHowlPlay.call(this, ...args);
      }

      wrappedPlay.__qolboxReserveAudioWrapped = true;
      HowlCtor.prototype.play = wrappedPlay;
    }

    if (volumePatched) {
      applyGameVolume();
    }

    return volumePatched;
  }

  function findSettingsContainer() {
    return document.querySelector('.items.left');
  }

  function findChangeControlsItem(container) {
    if (!container) {
      return null;
    }

    for (const item of container.querySelectorAll('.item')) {
      if (item.textContent.trim() === 'Change Controls') {
        return item;
      }
    }

    return null;
  }

  function getJukeboxMenuLabel() {
    return jukeboxState.muted ? 'Unmute Jukebox' : 'Mute Jukebox';
  }

  function updateJukeboxMenuItem() {
    if (!currentJukeboxMenuItem || !currentJukeboxMenuItem.isConnected) {
      return;
    }

    currentJukeboxMenuItem.textContent = getJukeboxMenuLabel();
    currentJukeboxMenuItem.title = 'Remember the lobby radio mute state';
  }

  function patchJukeboxMenu() {
    if (!shouldRunFeature(FEATURE_AUDIO)) {
      return false;
    }

    const container = findSettingsContainer();
    if (!container) {
      return false;
    }

    let item = container.querySelector('.item[data-qolbox-jukebox-menu="true"]');
    if (!item) {
      item = document.createElement('div');
      item.className = 'item';
      item.dataset.qolboxJukeboxMenu = 'true';
      item.addEventListener(
        'click',
        event => {
          event.preventDefault();
          event.stopImmediatePropagation();
          toggleJukeboxMute();
        },
        true
      );

      const beforeItem = findChangeControlsItem(container);
      if (beforeItem) {
        container.insertBefore(item, beforeItem);
      } else {
        container.appendChild(item);
      }
    }

    currentJukeboxMenuItem = item;
    updateJukeboxMenuItem();
    return true;
  }

  function findJukeboxKnob() {
    return document.querySelector('.jukebox .knob.volumeContainer');
  }

  function readJukeboxPercentFromKnob(knob) {
    const bar = knob ? knob.querySelector('.barSVG') : null;
    if (!bar) {
      return null;
    }

    const inlineAngle = parseJukeboxAngleFromTransform(bar.style.transform);
    if (inlineAngle !== null) {
      return angleToJukeboxPercent(inlineAngle);
    }

    const computedAngle = parseJukeboxAngleFromTransform(window.getComputedStyle(bar).transform);
    if (computedAngle !== null) {
      return angleToJukeboxPercent(computedAngle);
    }

    return null;
  }

  function getEffectiveJukeboxPercent() {
    return clampJukeboxPercent(jukeboxState.percent ?? DEFAULT_JUKEBOX_PERCENT);
  }

  function ensureJukeboxPercent(knob) {
    if (jukeboxState.percent !== null) {
      return;
    }

    if (!knob) {
      return;
    }

    jukeboxState.percent = readJukeboxPercentFromKnob(knob) ?? DEFAULT_JUKEBOX_PERCENT;
    saveJukeboxState();
  }

  function updateJukeboxKnobAccessibility(knob, percent = null) {
    if (!knob) {
      return;
    }

    const effectivePercent = jukeboxState.muted
      ? 0
      : clampJukeboxPercent(percent ?? jukeboxState.percent ?? DEFAULT_JUKEBOX_PERCENT);

    knob.setAttribute('aria-label', 'Jukebox volume');
    knob.setAttribute('aria-orientation', 'vertical');
    knob.setAttribute('aria-valuemin', '0');
    knob.setAttribute('aria-valuemax', '100');
    knob.setAttribute('aria-valuenow', String(effectivePercent));
    knob.setAttribute('aria-valuetext', jukeboxState.muted ? `Muted (${effectivePercent}%)` : `${effectivePercent}%`);
    knob.setAttribute('role', 'slider');
    keepInBrowserTabOrder(knob);
  }

  function setKnobVisual(knob, percent) {
    if (!knob) {
      return;
    }

    const angle = percentToJukeboxAngle(percent);
    const bar = knob.querySelector('.barSVG');
    const arcPath = knob.querySelector('.arcSVG path');

    if (bar) {
      bar.style.transform = `rotate(${angle}deg)`;
    }

    if (arcPath) {
      const startPoint = polarToArcPoint(JUKEBOX_MIN_ANGLE);
      const endPoint = polarToArcPoint(angle);
      const sweepDegrees = Math.max(0, angle - JUKEBOX_MIN_ANGLE);
      const largeArcFlag = sweepDegrees > 180 ? 1 : 0;
      arcPath.setAttribute(
        'd',
        `M ${startPoint.x} ${startPoint.y} A ${JUKEBOX_ARC_RADIUS} ${JUKEBOX_ARC_RADIUS} 0 ${largeArcFlag} 1 ${endPoint.x} ${endPoint.y}`
      );
    }

    updateJukeboxKnobAccessibility(knob, percent);
  }

  function applyJukeboxStateToKnob(knob) {
    if (!shouldRunFeature(FEATURE_AUDIO) || !knob || activeKnobDrag) {
      return;
    }

    ensureJukeboxPercent(knob);
    setKnobVisual(knob, jukeboxState.muted ? 0 : jukeboxState.percent);
  }

  function trackPlayer(player) {
    if (!player || typeof player.setVolume !== 'function') {
      return;
    }

    trackedPlayers.add(player);
  }

  function discoverPlayers() {
    const yt = window.YT;
    if (!yt || typeof yt.get !== 'function') {
      return;
    }

    for (const candidate of document.querySelectorAll('#ytContainer [id], #ytContainer iframe[id]')) {
      if (!candidate.id) {
        continue;
      }

      try {
        const player = yt.get(candidate.id);
        if (player && typeof player.setVolume === 'function') {
          trackPlayer(player);
        }
      } catch {
        // Ignore unresolved ids.
      }
    }
  }

  function applyJukeboxStateToPlayer(player) {
    if (!shouldRunFeature(FEATURE_AUDIO)) {
      return;
    }

    if (!player || typeof player.setVolume !== 'function') {
      trackedPlayers.delete(player);
      return;
    }

    ensureJukeboxPercent(findJukeboxKnob());

    try {
      if (jukeboxState.muted) {
        if (typeof player.unMute === 'function') {
          player.unMute();
        }
        player.setVolume(0);
        if (typeof player.mute === 'function') {
          player.mute();
        }
      } else {
        if (typeof player.unMute === 'function') {
          player.unMute();
        }
        player.setVolume(percentToJukeboxVolume(getEffectiveJukeboxPercent()));
      }
    } catch {
      trackedPlayers.delete(player);
    }
  }

  function applyJukeboxState() {
    if (!shouldRunFeature(FEATURE_AUDIO)) {
      return;
    }

    const knob = findJukeboxKnob();
    applyJukeboxStateToKnob(knob);

    discoverPlayers();
    for (const player of Array.from(trackedPlayers)) {
      applyJukeboxStateToPlayer(player);
    }
  }

  function scheduleYouTubeHookRetry() {
    if (
      !shouldRunFeature(FEATURE_AUDIO) ||
      youTubeHookInstalled ||
      youTubeHookRetryTimer ||
      youTubeHookRetryCount >= YOUTUBE_HOOK_MAX_RETRIES
    ) {
      return;
    }

    youTubeHookRetryCount += 1;
    youTubeHookRetryTimer = window.setTimeout(() => {
      youTubeHookRetryTimer = 0;
      hookYouTubePlayer();
      applyJukeboxState();
    }, YOUTUBE_HOOK_RETRY_DELAY_MS);
  }

  function wrapYouTubeReadyCallback(callback) {
    if (typeof callback !== 'function' || callback.__qolboxWrapped) {
      return callback;
    }

    function wrappedYouTubeReadyCallback(...args) {
      if (shouldRunFeature(FEATURE_AUDIO)) {
        hookYouTubePlayer();
      }
      try {
        return callback.apply(this, args);
      } finally {
        if (shouldRunFeature(FEATURE_AUDIO)) {
          hookYouTubePlayer();
          window.setTimeout(applyJukeboxState, 0);
        }
      }
    }

    wrappedYouTubeReadyCallback.__qolboxWrapped = true;
    wrappedYouTubeReadyCallback.__qolboxOriginal = callback;
    return wrappedYouTubeReadyCallback;
  }

  function installYouTubeReadyCallbackHook() {
    if (!shouldRunFeature(FEATURE_AUDIO)) {
      return;
    }

    if (youTubeReadyCallbackHookInstalled) {
      return;
    }

    const descriptor = Object.getOwnPropertyDescriptor(window, 'onYouTubeIframeAPIReady');
    if (descriptor && (!descriptor.configurable || descriptor.get || descriptor.set)) {
      return;
    }

    youTubeReadyCallbackHookInstalled = true;
    let readyCallback = wrapYouTubeReadyCallback(descriptor ? descriptor.value : window.onYouTubeIframeAPIReady);

    try {
      Object.defineProperty(window, 'onYouTubeIframeAPIReady', {
        configurable: true,
        enumerable: true,
        get() {
          return readyCallback;
        },
        set(value) {
          readyCallback = wrapYouTubeReadyCallback(value);
        },
      });
    } catch {
      youTubeReadyCallbackHookInstalled = false;
    }
  }

  function wrapYouTubePlayerOptions(args, getPlayer) {
    const wrappedArgs = Array.from(args);
    const options = wrappedArgs[1];
    if (!options || typeof options !== 'object') {
      return wrappedArgs;
    }

    const events = options.events && typeof options.events === 'object' ? options.events : {};
    const originalOnReady = events.onReady;
    const wrappedEvents = {
      ...events,
      onReady(event) {
        const player = (event && event.target) || getPlayer();
        trackPlayer(player);

        try {
          return typeof originalOnReady === 'function' ? originalOnReady.apply(this, arguments) : undefined;
        } finally {
          window.setTimeout(() => {
            applyJukeboxStateToPlayer(player || getPlayer());
          }, 0);
        }
      },
    };

    wrappedArgs[1] = {
      ...options,
      events: wrappedEvents,
    };

    return wrappedArgs;
  }

  function hookYouTubePlayer() {
    if (!shouldRunFeature(FEATURE_AUDIO)) {
      return false;
    }

    installYouTubeReadyCallbackHook();

    const yt = window.YT;
    if (!yt || typeof yt.Player !== 'function') {
      scheduleYouTubeHookRetry();
      return false;
    }

    if (youTubeHookRetryTimer) {
      window.clearTimeout(youTubeHookRetryTimer);
      youTubeHookRetryTimer = 0;
    }
    youTubeHookRetryCount = 0;

    if (youTubeHookInstalled || yt.Player.__qolboxWrapped) {
      youTubeHookInstalled = true;
      discoverPlayers();
      return true;
    }

    const OriginalPlayer = yt.Player;

    function WrappedPlayer(...args) {
      let instance = null;
      const wrappedArgs = wrapYouTubePlayerOptions(args, () => instance);
      instance = new OriginalPlayer(...wrappedArgs);
      trackPlayer(instance);
      window.setTimeout(() => {
        applyJukeboxStateToPlayer(instance);
      }, 0);
      return instance;
    }

    Object.setPrototypeOf(WrappedPlayer, OriginalPlayer);
    WrappedPlayer.prototype = OriginalPlayer.prototype;
    WrappedPlayer.__qolboxWrapped = true;
    yt.Player = WrappedPlayer;
    youTubeHookInstalled = true;
    discoverPlayers();
    return true;
  }

  function setJukeboxPercent(nextPercent) {
    if (!shouldRunFeature(FEATURE_AUDIO)) {
      return;
    }

    jukeboxState.percent = clampJukeboxPercent(nextPercent);
    jukeboxState.muted = false;
    saveJukeboxState();
    updateJukeboxMenuItem();
    setKnobVisual(findJukeboxKnob(), jukeboxState.percent);
    applyJukeboxState();
  }

  function toggleJukeboxMute() {
    if (!shouldRunFeature(FEATURE_AUDIO)) {
      return;
    }

    ensureJukeboxPercent(findJukeboxKnob());
    jukeboxState.muted = !jukeboxState.muted;
    saveJukeboxState();
    updateJukeboxMenuItem();
    applyJukeboxState();
  }

  function getKnobPercentFromPointer(event) {
    if (!activeKnobDrag) {
      return DEFAULT_JUKEBOX_PERCENT;
    }

    const deltaY = activeKnobDrag.startY - event.clientY;
    return clampJukeboxPercent(activeKnobDrag.startPercent + deltaY * JUKEBOX_DRAG_SENSITIVITY);
  }

  function onKnobPointerMove(event) {
    if (!shouldRunFeature(FEATURE_AUDIO) || !activeKnobDrag) {
      return;
    }

    event.preventDefault();
    setJukeboxPercent(getKnobPercentFromPointer(event));
  }

  function endKnobDrag() {
    activeKnobDrag = null;
  }

  function patchGlobalKnobListeners() {
    if (window.__qolboxJukeboxGlobalsPatched) {
      return;
    }

    window.__qolboxJukeboxGlobalsPatched = true;
    window.addEventListener('pointermove', onKnobPointerMove, true);
    window.addEventListener('mousemove', onKnobPointerMove, true);
    window.addEventListener('pointerup', endKnobDrag, true);
    window.addEventListener('mouseup', endKnobDrag, true);
    window.addEventListener('blur', endKnobDrag, true);
  }

  function patchJukeboxKnob() {
    if (!shouldRunFeature(FEATURE_AUDIO)) {
      return false;
    }

    const knob = findJukeboxKnob();
    if (!knob) {
      return false;
    }

    patchGlobalKnobListeners();
    ensureJukeboxPercent(knob);
    applyJukeboxStateToKnob(knob);
    patchJukeboxKeyboardFocus(knob);

    if (!knob.dataset.qolboxJukeboxPatched) {
      knob.dataset.qolboxJukeboxPatched = 'true';
      knob.title = 'Scroll, drag, or use arrow keys to adjust the jukebox volume';
      knob.style.touchAction = 'none';

      knob.addEventListener(
        'pointerdown',
        event => {
          if (!shouldRunFeature(FEATURE_AUDIO)) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          focusElementWithoutScroll(knob);

          if (typeof knob.setPointerCapture === 'function' && event.pointerId !== undefined) {
            try {
              knob.setPointerCapture(event.pointerId);
            } catch {
              // Ignore pointer capture failures.
            }
          }

          if (jukeboxState.muted) {
            jukeboxState.muted = false;
            saveJukeboxState();
            updateJukeboxMenuItem();
            applyJukeboxState();
          }

          activeKnobDrag = {
            startY: event.clientY,
            startPercent: jukeboxState.percent ?? DEFAULT_JUKEBOX_PERCENT,
          };
          onKnobPointerMove(event);
        },
        true
      );

      knob.addEventListener(
        'wheel',
        event => {
          if (!shouldRunFeature(FEATURE_AUDIO)) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          focusElementWithoutScroll(knob);
          ensureJukeboxPercent(knob);

          const currentPercent = jukeboxState.muted ? 0 : jukeboxState.percent;
          setJukeboxPercent(currentPercent + (event.deltaY < 0 ? JUKEBOX_WHEEL_STEP : -JUKEBOX_WHEEL_STEP));
        },
        { passive: false }
      );
      knob.addEventListener(
        'keydown',
        event => {
          if (!shouldRunFeature(FEATURE_AUDIO)) {
            return;
          }

          const currentPercent = jukeboxState.muted ? 0 : getEffectiveJukeboxPercent();
          const nextPercent = getKeyboardPercentTarget(event, currentPercent, JUKEBOX_WHEEL_STEP);
          if (nextPercent === null) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          ensureJukeboxPercent(knob);
          setJukeboxPercent(nextPercent);
        },
        true
      );
    }

    return true;
  }

  applyFeatureRootClasses();
  ensureGlobalStyle();
  installQolboxMenuHooks();
  if (shouldRunFeature(FEATURE_RESERVE)) {
    installReserveSocketCaptureHook();
  }
  if (shouldRunFeature(FEATURE_AUDIO)) {
    installYouTubeReadyCallbackHook();
  }
  installFullscreenHooks();
  scheduleFirstBootOnboarding();
  scheduleUiWork({ force: true, features: true, passes: FULLSCREEN_SETTLE_PASSES });

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      () => scheduleUiWork({ force: true, features: true, passes: FULLSCREEN_SETTLE_PASSES }),
      { once: true }
    );
  } else {
    scheduleUiWork({ force: true, features: true, passes: FULLSCREEN_SETTLE_PASSES });
  }
})();
