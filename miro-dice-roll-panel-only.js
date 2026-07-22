// ==UserScript==
// @name         Miro Dice Roll — Panel Only (Unicode)
// @namespace    https://miro.com/
// @version      1.25.0-panel
// @description  Бросок кубиков (⚀–⚅) на доске Miro — только плавающая панель (F9)
// @author       joke
// @match        https://miro.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function diceRollUserScript() {
  'use strict';

  // =========================================================================
  // НАСТРОЙКИ ГЕОМЕТРИИ И ТАЙМИНГОВ (ИЗМЕНЯЙ ЭТИ ЗНАЧЕНИЯ ДЛЯ РЕПЛИКАЦИИ)
  // =========================================================================
  const DICE_BLOCK_WIDTH = 230; // Ширина текстового блока одного кубика
  const DICE_GAP = -30;         // Расстояние (зазор) между кубиками на доске
  const DICE_FONT_SIZE = 230;   // Размер шрифта символа кубика (⚀-⚅)

  // Настройки для нестандартных кубиков (Shape с числом)
  const CUSTOM_DICE_BLOCK_WIDTH = 100;  // Ширина/высота квадрата Shape
  const CUSTOM_DICE_GAP = 100;          // Зазор между Shape-кубиками
  const CUSTOM_DICE_FONT_SIZE = 45;     // Размер текста в Shape

  const CHANGES_PER_DIE = 3;    // Сколько раз меняется грань кубика до остановки
  const SPIN_INTERVAL_MS = 450; // Скорость смены граней при вращении (в миллисекундах)
  const SPAWN_DELAY_MS = 500;   // Задержка появления следующего кубика (в миллисекундах)
  // =========================================================================

  const DICE_FACES = Object.freeze([
    '\u2680',
    '\u2681',
    '\u2682',
    '\u2683',
    '\u2684',
    '\u2685',
  ]);

  const SIX_INDEX = 5;
  const STORAGE_KEY_FAB = 'miroDiceRollFab';
  const MODAL_ROOT_ID = 'miro-dice-roll-modal-root';
  const STYLE_ID = 'miro-dice-roll-styles';

  const DEFAULT_DICE_COUNT = 3;
  const MIN_DICE = 1;
  const MAX_DICE = 5;

  /** @type {{ x: number, y: number } | null} Последняя точка на доске */
  let lastCursorBoardPoint = null;

  /** Последние экранные координаты курсора */
  let lastClientX = null;
  let lastClientY = null;
  
  let rollingCount = 0;

  const VIEWPORT_CACHE_TTL = 50; // Ускоряем кэш зума до 20 FPS для мгновенной реакции
  /** @type {{ x: number, y: number, width: number, height: number } | null} */
  let cachedViewport = null;
  /** @type {number | null} */
  let cachedViewportTime = null;

  /**
   * @typedef {{ enabled: boolean, faceIndex: number }} DieSlotConfig
   * @typedef {import('@mirohq/websdk-types').Text} MiroTextItem
   * @typedef {import('@mirohq/websdk-types').Shape} MiroShapeItem
   */

  // =========================================================================
  //  FAB SETTINGS (localStorage)
  // =========================================================================

  function loadFabSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_FAB);
      if (!raw) throw new Error('no raw');

      const p = JSON.parse(raw);
      const diceCount = Number.parseInt(p.diceCount, 10);
      const sixCount = Number.parseInt(p.sixCount, 10);
      const panelX = Number.parseFloat(p.panelX);
      const panelY = Number.parseFloat(p.panelY);
      const customFaceCount = Number.parseInt(p.customFaceCount, 10);

      // Threshold mode properties
      const customThreshold = Number.parseInt(p.customThreshold, 10);
      const customThresholdCount = Number.parseInt(p.customThresholdCount, 10);

      // Exact mode properties
      const customExactFace = Number.parseInt(p.customExactFace, 10);
      const customExactCount = Number.parseInt(p.customExactCount, 10);

      return {
        perfMode: p.perfMode === true || p.perfMode === 'true',
        diceCount: Number.isNaN(diceCount) || diceCount < MIN_DICE || diceCount > MAX_DICE ? DEFAULT_DICE_COUNT : diceCount,
        sixCount: Number.isNaN(sixCount) || sixCount < 0 || sixCount > MAX_DICE ? 0 : sixCount,
        strictSixCount: p.strictSixCount !== false,
        panelVisible: p.panelVisible !== false,
        panelX: Number.isNaN(panelX) ? 24 : panelX,
        panelY: Number.isNaN(panelY) ? 24 : panelY,
        previewShowResult: p.previewShowResult === true,
        isCustomDice: p.isCustomDice === true,
        customFaceCount: Number.isNaN(customFaceCount) || customFaceCount < 4 || customFaceCount > 99 ? 20 : customFaceCount,

        customMode: p.customMode === 'exact' ? 'exact' : 'threshold',

        customThreshold: Number.isNaN(customThreshold) || customThreshold < 1 || customThreshold > 99 ? 13 : customThreshold,
        customThresholdCount: Number.isNaN(customThresholdCount) || customThresholdCount < 0 || customThresholdCount > MAX_DICE ? 1 : customThresholdCount,
        customDirection: p.customDirection === 'gte' ? 'gte' : 'lte',

        customExactFace: Number.isNaN(customExactFace) || customExactFace < 1 || customExactFace > 99 ? 20 : customExactFace,
        customExactCount: Number.isNaN(customExactCount) || customExactCount < 0 || customExactCount > MAX_DICE ? 0 : customExactCount,
        panelTheme: p.panelTheme === 'glass' ? 'glass' : 'solid',
        glassColor: p.glassColor || '#dce6ff',
        glassOpacity: p.glassOpacity !== undefined ? Number.parseFloat(p.glassOpacity) : 0.6,
        glassBlur: p.glassBlur !== undefined ? Number.parseInt(p.glassBlur, 10) : 16,
        accentColor: p.accentColor || '#4262ff'
      };
    } catch {
      return {
        diceCount: DEFAULT_DICE_COUNT,
        sixCount: 0,
        strictSixCount: true,
        panelVisible: true,
        panelX: 24,
        panelY: 24,
        previewShowResult: false,
        isCustomDice: false,
        customFaceCount: 20,

        customMode: 'threshold',

        customThreshold: 13,
        customThresholdCount: 1,
        customDirection: 'lte',

        customExactFace: 20,
        customExactCount: 0,
        perfMode: false,
        interactiveMode: false,
        interactiveValues: [],
        panelTheme: 'solid',
        glassColor: '#dce6ff',
        glassOpacity: 0.6,
        glassBlur: 16,
        accentColor: '#4262ff'
      };
    }
  }

  function saveFabSettings(config) {
    localStorage.setItem(STORAGE_KEY_FAB, JSON.stringify(config));
  }

  // =========================================================================
  //  DICE LOGIC
  // =========================================================================

  function pickRandomPositions(diceCount, selectCount) {
    const count = Math.max(0, Math.min(diceCount, selectCount));
    const indices = Array.from({ length: diceCount }, (_, index) => index);

    for (let i = indices.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = indices[i];
      indices[i] = indices[j];
      indices[j] = temp;
    }

    return new Set(indices.slice(0, count));
  }

  function buildPerDieForFab(diceCount, sixCount) {
    const resolvedSixSlots = pickRandomPositions(diceCount, sixCount);
    const perDie = [];

    for (let i = 0; i < MAX_DICE; i += 1) {
      if (i < diceCount && resolvedSixSlots.has(i)) {
        perDie.push({ enabled: true, faceIndex: SIX_INDEX });
      } else {
        perDie.push({ enabled: false, faceIndex: 0 });
      }
    }

    return perDie;
  }

  function hasForcedSixInRoll(diceCount, perDie) {
    for (let i = 0; i < diceCount; i += 1) {
      const slot = perDie[i];

      if (slot?.enabled && slot.faceIndex === SIX_INDEX) {
        return true;
      }
    }

    return false;
  }

  function buildFinalIndices(diceCount, perDie, strictSixCount) {
    const stripSixFromOthers = strictSixCount && hasForcedSixInRoll(diceCount, perDie);

    return Array.from({ length: diceCount }, (_, slotIndex) => {
      const slot = perDie[slotIndex];

      if (slot?.enabled && slot.faceIndex === SIX_INDEX) {
        return SIX_INDEX;
      }

      if (slot?.enabled) {
        return slot.faceIndex;
      }

      if (stripSixFromOthers) {
        return randomDieIndexExcludingSix();
      }

      return randomDieIndex();
    });
  }

  // --- Custom Dice Logic ---

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function buildCustomFinalValues(settings) {
    const {
      diceCount, faceCount, customMode,
      customThreshold, customThresholdCount, customDirection,
      customExactFace, customExactCount
    } = settings;

    if (customMode === 'exact') {
      const positions = pickRandomPositions(diceCount, customExactCount);
      
      return Array.from({ length: diceCount }, (_, i) => {
        if (positions.has(i)) {
          return customExactFace;
        }

        // Always strip exact face from others (strict mode)
        if (faceCount <= 1) return 1;

        let val;
        do {
          val = randomInt(1, faceCount);
        } while (val === customExactFace);
        return val;
      });
    } else {
      // Threshold mode
      const positions = pickRandomPositions(diceCount, customThresholdCount);

      return Array.from({ length: diceCount }, (_, i) => {
        if (positions.has(i)) {
          // Кубик ДОЛЖЕН соответствовать порогу
          let possibleMatches = [];
          for (let v = 1; v <= faceCount; v++) {
            if (customDirection === 'lte') {
              if (v <= customThreshold) possibleMatches.push(v);
            } else {
              if (v >= customThreshold) possibleMatches.push(v);
            }
          }
          if (possibleMatches.length === 0) return randomInt(1, faceCount);
          return possibleMatches[Math.floor(Math.random() * possibleMatches.length)];
        }

        // Остальные кубики строго НЕ соответствуют порогу
        let possibleNonMatches = [];
        for (let v = 1; v <= faceCount; v++) {
          if (customDirection === 'lte') {
            if (v > customThreshold) possibleNonMatches.push(v);
          } else {
            if (v < customThreshold) possibleNonMatches.push(v);
          }
        }

        if (possibleNonMatches.length === 0) {
          return randomInt(1, faceCount);
        }

        return possibleNonMatches[Math.floor(Math.random() * possibleNonMatches.length)];
      });
    }
  }

  // =========================================================================
  //  STYLES (only floating panel)
  // =========================================================================

  function injectStyles() {
    const existing = document.getElementById(STYLE_ID);

    if (existing) {
      existing.remove();
    }

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      /* ====== Perf Mode Override ====== */
      .mdr-perf-mode, .mdr-perf-mode * {
        animation: none !important;
        transition: none !important;
      }

      /* ====== Floating Panel ====== */
      @keyframes mdr-panel-in {
        0% { opacity: 0; transform: scale(0.95); }
        100% { opacity: 1; transform: scale(1); }
      }

      #${MODAL_ROOT_ID}-panel {
        position: fixed;
        z-index: 2147483645;
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 14px;
        background: #fff;
        border-radius: 14px;
        box-shadow: 0 12px 40px rgba(15, 23, 42, 0.15), 0 0 0 1px rgba(0,0,0,0.06);
        width: 192px;
        font-family: "Inter", "Segoe UI", system-ui, sans-serif;
        user-select: none;
        cursor: default;
        animation: mdr-panel-in 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        transition: background 0.3s, backdrop-filter 0.3s, box-shadow 0.3s;
      }

      #${MODAL_ROOT_ID}-panel.mdr-theme-glass {
        background: color-mix(in srgb, var(--glass-color, #dce6ff) var(--glass-opacity-pct, 60%), transparent);
        backdrop-filter: blur(var(--glass-blur, 16px)) saturate(180%);
        -webkit-backdrop-filter: blur(var(--glass-blur, 16px)) saturate(180%);
        box-shadow: 0 16px 48px rgba(15, 23, 42, 0.15), inset 0 0 0 1px rgba(255,255,255,0.6), 0 0 0 1px rgba(0,0,0,0.05);
      }

      /* Mouse spotlight glow on the background */
      #${MODAL_ROOT_ID}-panel.mdr-theme-glass::before {
        content: "";
        position: absolute;
        top: 0; left: 0; right: 0; bottom: 0;
        pointer-events: none;
        border-radius: 12px;
        background: radial-gradient(
          circle 60px at var(--mouse-x, -999px) var(--mouse-y, -999px),
          color-mix(in srgb, var(--accent-color, #4262ff) 35%, transparent),
          transparent 100%
        );
        opacity: 0;
        transition: opacity 0.3s ease;
        z-index: -1;
      }
      #${MODAL_ROOT_ID}-panel.mdr-theme-glass:hover::before {
        opacity: 1;
      }
      #${MODAL_ROOT_ID}-panel.mdr-theme-glass:has(button:hover, .mdr-custom-slider:hover, .mdr-toggle:hover, input:hover, #${MODAL_ROOT_ID}-drag-area:hover)::before {
        opacity: 0 !important;
      }

      /* Adjust child elements for glass theme to be translucent */
      .mdr-theme-glass .mdr-custom-dice-btn,
      .mdr-theme-glass .mdr-input,
      .mdr-theme-glass #${MODAL_ROOT_ID}-preview-row,
      .mdr-theme-glass .mdr-icon-btn,
      .mdr-theme-glass .mdr-toggle,
      .mdr-theme-glass #${MODAL_ROOT_ID}-drag-area {
        transition: all 0.3s ease !important;
      }
      .mdr-theme-glass .mdr-custom-slider .mdr-cs-thumb,
      .mdr-theme-glass .mdr-custom-slider .mdr-cs-track {
        transition: box-shadow 0.3s ease, transform 0.15s ease !important;
      }
      .mdr-theme-glass .mdr-custom-slider.is-smooth .mdr-cs-thumb,
      .mdr-theme-glass .mdr-custom-slider.is-smooth .mdr-cs-track,
      .mdr-theme-glass .mdr-custom-slider.is-smooth .mdr-cs-fill {
        transition: all 0.15s ease-out !important;
      }

      .mdr-theme-glass .mdr-custom-dice-btn,
      .mdr-theme-glass .mdr-input,
      .mdr-theme-glass #${MODAL_ROOT_ID}-preview-row,
      .mdr-theme-glass .mdr-icon-btn {
        background: rgba(255, 255, 255, 0.4) !important;
        border-color: rgba(255, 255, 255, 0.5) !important;
      }
      .mdr-theme-glass .mdr-toggle {
        background: rgba(0, 0, 0, 0.1) !important;
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.4);
      }
      .mdr-theme-glass .mdr-sub-section,
      .mdr-theme-glass .mdr-mode-wrap {
        background: rgba(255, 255, 255, 0.25) !important;
        border: 1px solid rgba(255, 255, 255, 0.4) !important;
        border-radius: 12px !important;
      }

      /* Hover states for the "flow" effect */
      .mdr-theme-glass .mdr-icon-btn:hover,
      .mdr-theme-glass .mdr-custom-dice-btn:hover,
      .mdr-theme-glass .mdr-input:focus,
      .mdr-theme-glass .mdr-input:hover,
      .mdr-theme-glass #${MODAL_ROOT_ID}-drag-area:hover {
        background: color-mix(in srgb, var(--accent-color, #4262ff) 15%, rgba(255, 255, 255, 0.6)) !important;
        border-color: color-mix(in srgb, var(--accent-color, #4262ff) 70%, transparent) !important;
        box-shadow: 0 0 12px color-mix(in srgb, var(--accent-color, #4262ff) 35%, transparent) !important;
      }
      .mdr-theme-glass .mdr-toggle:hover {
        background: rgba(255, 255, 255, 0.2) !important;
        box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent-color, #4262ff) 70%, transparent), 0 0 12px color-mix(in srgb, var(--accent-color, #4262ff) 35%, transparent) !important;
      }
      .mdr-theme-glass .mdr-custom-slider:hover .mdr-cs-thumb {
        box-shadow: 0 0 12px color-mix(in srgb, var(--accent-color, #4262ff) 70%, transparent), 0 2px 4px rgba(0,0,0,0.2) !important;
      }
      .mdr-theme-glass .mdr-custom-slider:hover .mdr-cs-track {
        box-shadow: 0 0 6px color-mix(in srgb, var(--accent-color, #4262ff) 40%, transparent) !important;
      }

      .mdr-theme-glass .mdr-custom-dice-btn.is-active {
        background: color-mix(in srgb, var(--accent-color, #4262ff) 20%, transparent) !important;
        border-color: var(--accent-color, #4262ff) !important;
      }
      .mdr-theme-glass .mdr-toggle.is-on {
        background: color-mix(in srgb, var(--accent-color, #4262ff) 80%, transparent) !important;
      }

      #${MODAL_ROOT_ID}-panel-theme-btn,
      #${MODAL_ROOT_ID}-panel-interactive-btn,
      #${MODAL_ROOT_ID}-panel-close-btn {
        background: transparent;
        border: none;
        color: #94a3b8;
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
        transition: background 0.15s, color 0.15s;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      #${MODAL_ROOT_ID}-panel-theme-btn:hover,
      #${MODAL_ROOT_ID}-panel-interactive-btn:hover,
      #${MODAL_ROOT_ID}-panel-close-btn:hover {
        background: #f1f5f9;
        color: #0f172a;
      }

      #${MODAL_ROOT_ID}-panel-interactive-btn.is-active {
        color: #eab308;
        background: #fef08a;
      }

      /* ====== Interactive Mode ====== */
      .mdr-global-btn {
        background: transparent;
        border: none;
        color: #94a3b8;
        cursor: pointer;
        font-size: 20px;
        font-weight: bold;
        transition: color 0.15s, transform 0.15s;
        padding: 4px;
        line-height: 1;
      }
      .mdr-global-btn:hover {
        color: #1e293b;
        transform: scale(1.2);
      }
      .mdr-global-btn:active {
        transform: scale(0.9);
      }

      .mdr-interactive-die-wrap {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      }
      .mdr-interactive-die-wrap:hover {
        transform: scale(1.15);
      }
      .mdr-interactive-die-wrap.is-popping {
        transform: scale(1.3);
      }
      
      .mdr-interactive-arrow {
        background: transparent;
        border: none;
        color: #cbd5e1;
        cursor: pointer;
        padding: 0;
        font-size: 14px;
        line-height: 1;
        transition: color 0.15s, transform 0.1s;
      }
      .mdr-interactive-die-wrap:hover .mdr-interactive-arrow {
        color: #94a3b8;
      }
      .mdr-interactive-arrow:hover {
        color: #1e293b !important;
        transform: scale(1.3);
      }
      .mdr-interactive-arrow:active {
        transform: scale(0.9);
      }

      #${MODAL_ROOT_ID}-panel.is-hidden,
      #${MODAL_ROOT_ID}-theme-settings.is-hidden {
        display: none !important;
      }

      #${MODAL_ROOT_ID}-theme-color::-webkit-color-swatch-wrapper {
        padding: 0;
      }
      #${MODAL_ROOT_ID}-theme-color::-webkit-color-swatch {
        border: none;
        border-radius: 4px;
      }

      /* ====== Mini button (collapsed state) ====== */
      #${MODAL_ROOT_ID}-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: grab;
        padding: 2px 0;
      }

      #${MODAL_ROOT_ID}-panel-header:active {
        cursor: grabbing;
      }

      #${MODAL_ROOT_ID}-panel-title {
        margin: 0;
        font-size: 14px;
        font-weight: 700;
        color: #1e293b;
        pointer-events: none;
        flex: 1;
      }

      #${MODAL_ROOT_ID}-ghost.is-perf,
      #${MODAL_ROOT_ID}-ghost-inner.is-perf {
        transition: none !important;
        animation: none !important;
        filter: none !important;
      }

      #${MODAL_ROOT_ID}-panel .mdr-label {
        margin: 0 0 5px;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.07em;
        color: #64748b;
      }

      /* Slider row */
      .mdr-slider-wrap {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .mdr-custom-slider {
        position: relative;
        flex: 1;
        height: 24px;
        margin: 0 20px;
        cursor: pointer;
        touch-action: none;
      }
      .mdr-cs-track {
        position: absolute;
        top: 50%; left: 0; right: 0;
        transform: translateY(-50%);
        height: 4px;
        background: #e2e8f0;
        border-radius: 4px;
      }
      .mdr-cs-fill {
        position: absolute;
        top: 50%; left: 0;
        transform: translateY(-50%);
        height: 4px;
        background: var(--accent-color, #4262ff);
        border-radius: 4px;
        transition: width 0.1s ease-out;
      }
      .mdr-cs-thumb {
        position: absolute;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: var(--accent-color, #4262ff);
        border: 2px solid #fff;
        box-shadow: 0 1px 4px color-mix(in srgb, var(--accent-color, #4262ff) 35%, transparent);
        top: 50%;
        transform: translate(-50%, -50%);
        transition: left 0.1s ease-out, transform 0.15s, box-shadow 0.15s, background 0.15s;
        cursor: grab;
      }
      .mdr-cs-thumb::after {
        content: '';
        position: absolute;
        top: -10px; left: -10px; right: -10px; bottom: -10px;
        background: transparent;
        border-radius: 50%;
      }
      .mdr-custom-slider.is-active .mdr-cs-thumb {
        transform: translate(-50%, -50%) scale(1.3);
        box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent-color, #4262ff) 15%, transparent);
        background: #314de6;
        cursor: grabbing;
      }
      .mdr-custom-slider.is-active .mdr-cs-track {
        background: #cbd5e1;
      }
      .mdr-perf-mode .mdr-cs-fill, .mdr-perf-mode .mdr-cs-thumb {
        transition: none !important;
      }

      .mdr-slider-value {
        min-width: 20px;
        text-align: center;
        font-size: 13px;
        font-weight: 700;
        color: #1e293b;
        transition: transform 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.275), color 0.15s;
      }

      .mdr-slider-value.is-popping {
        transform: scale(1.3);
        color: var(--accent-color, #4262ff);
      }

      /* Mode toggle row */
      .mdr-mode-wrap {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
      }

      .mdr-mode-opt {
        font-size: 10px;
        font-weight: 600;
        color: #94a3b8;
        transition: color 0.13s;
        user-select: none;
        flex: 1;
        text-align: center;
        white-space: nowrap;
      }

      .mdr-mode-opt.text-right { text-align: right; }
      .mdr-mode-opt.text-left { text-align: left; }
      .mdr-mode-opt.is-active { color: #1e293b; }

      .mdr-toggle {
        position: relative;
        width: 32px;
        height: 18px;
        background: #cbd5e1;
        border-radius: 18px;
        border: none;
        cursor: pointer;
        outline: none;
        transition: transform 0.1s, background-color 0.2s, box-shadow 0.2s;
        flex-shrink: 0;
      }
      .mdr-toggle:focus-visible {
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-color, #4262ff) 20%, transparent);
      }
      .mdr-toggle:active {
        transform: scale(0.92);
      }
      .mdr-toggle::before {
        content: '';
        position: absolute;
        top: 2px;
        left: 2px;
        width: 14px;
        height: 14px;
        background: #fff;
        border-radius: 50%;
        transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), background-color 0.2s;
        box-shadow: 0 1px 2px rgba(0,0,0,0.2);
      }
      .mdr-toggle.is-on {
        background: var(--accent-color, #4262ff);
      }
      .mdr-toggle.is-on::before {
        transform: translateX(14px);
        background: #fff;
      }

      /* Preview row — unified drag + preview block */
      #${MODAL_ROOT_ID}-preview-row {
        position: relative;
        display: flex;
        border: 1.5px solid var(--accent-color, #4262ff);
        border-radius: 11px;
        background: #f0f4ff;
        user-select: none;
        overflow: hidden;
      }

      #${MODAL_ROOT_ID}-drag-area {
        display: flex;
        align-items: center;
        justify-content: center;
        flex: 1;
        padding: 24px 8px 12px 8px; /* Extra top padding prevents overlap with corner buttons */
        cursor: grab;
        transition: background 0.14s;
        min-height: 50px;
      }

      #${MODAL_ROOT_ID}-drag-area:hover {
        background: color-mix(in srgb, var(--accent-color, #4262ff) 8%, transparent);
      }

      #${MODAL_ROOT_ID}-drag-area.is-dragging {
        cursor: grabbing;
        background: color-mix(in srgb, var(--accent-color, #4262ff) 12%, transparent);
      }

      #${MODAL_ROOT_ID}-drag-preview {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        flex-wrap: wrap;
      }

      /* Preview row buttons (corner tabs) */
      .mdr-icon-btn {
        position: absolute;
        top: 0;
        width: 26px;
        height: 24px;
        border: none;
        background: #f0f4ff; /* Solid background to mask drag-area hover */
        color: #64748b;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.15s;
        z-index: 2;
      }

      .mdr-icon-btn svg {
        width: 14px;
        height: 14px;
      }

      .mdr-icon-btn:hover {
        background: #e2e8f0;
        color: var(--accent-color, #4262ff);
      }

      #${MODAL_ROOT_ID}-preview-toggle-btn { 
        left: 0; 
        border-radius: 0 0 8px 0;
        border-right: 1px solid color-mix(in srgb, var(--accent-color, #4262ff) 15%, transparent);
        border-bottom: 1px solid color-mix(in srgb, var(--accent-color, #4262ff) 15%, transparent);
      }

      #${MODAL_ROOT_ID}-reroll-btn { 
        right: 0; 
        border-radius: 0 0 0 8px;
        border-left: 1px solid color-mix(in srgb, var(--accent-color, #4262ff) 15%, transparent);
        border-bottom: 1px solid color-mix(in srgb, var(--accent-color, #4262ff) 15%, transparent);
      }

      #${MODAL_ROOT_ID}-preview-toggle-btn.is-on {
        background: #e0e7ff;
        color: var(--accent-color, #4262ff);
      }


      /* Ghost dice following cursor during drag */
      #${MODAL_ROOT_ID}-ghost-wrapper {
        position: fixed;
        left: 0;
        top: 0;
        pointer-events: none;
        z-index: 2147483647;
        will-change: transform;
      }

      #${MODAL_ROOT_ID}-ghost {
        position: absolute;
        left: 0;
        top: 0;
        display: none;
        transform: translate(-50%, -50%);
        filter: drop-shadow(0 4px 12px rgba(0,0,0,0.3));
        transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      #${MODAL_ROOT_ID}-ghost.is-active {
        display: flex;
        animation: mdrGhostFadeIn 0.2s ease-out forwards;
        transform: scale(var(--drag-scale)) rotate(-5deg);
      }

      @keyframes mdrGhostFadeIn {
        from { opacity: 0; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1)); }
        to { opacity: 1; filter: drop-shadow(0 8px 24px rgba(0,0,0,0.4)); }
      }

      @keyframes mdrShake {
        0%, 100% { transform: scale(var(--drag-scale)) rotate(-5deg) translateX(0); filter: blur(0px); }
        25% { transform: scale(var(--drag-scale)) rotate(-15deg) translateX(-10px); filter: blur(2px); }
        50% { transform: scale(var(--drag-scale)) rotate(5deg) translateX(10px); filter: blur(2px); }
        75% { transform: scale(var(--drag-scale)) rotate(-10deg) translateX(-5px); filter: blur(1px); }
      }

      #${MODAL_ROOT_ID}-ghost.is-shaking {
        animation: mdrShake 0.3s cubic-bezier(.36,.07,.19,.97) both;
      }

      .mdr-sparkle {
        position: absolute;
        width: 6px;
        height: 6px;
        background: #FFD700;
        border-radius: 50%;
        pointer-events: none;
        box-shadow: 0 0 6px #FFD700, 0 0 12px #FFA500;
        animation: mdrSparkleAnim 0.6s ease-out forwards;
        z-index: 9999;
      }

      @keyframes mdrSparkleAnim {
        0% { transform: translate(-50%, -50%) scale(0); opacity: 1; }
        50% { transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) scale(1.5); opacity: 1; }
        100% { transform: translate(calc(-50% + var(--tx) * 1.5), calc(-50% + var(--ty) * 1.5)) scale(0); opacity: 0; }
      }

      #${MODAL_ROOT_ID}-ghost-inner {
        display: flex;
        gap: -12px;
        transition: zoom 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      /* Custom UI Elements */
      .mdr-custom-dice-btn-group {
        display: flex;
        gap: 4px;
        margin-bottom: 6px;
      }

      .mdr-custom-dice-btn {
        flex: 1;
        height: 26px;
        border: 1px solid #cbd5e1;
        border-radius: 4px;
        background: #fff;
        font-size: 11px;
        font-weight: 600;
        color: #475569;
        cursor: pointer;
        transition: all 0.1s;
      }

      .mdr-custom-dice-btn:hover {
        border-color: #94a3b8;
        background: #f8fafc;
      }
      .mdr-custom-dice-btn.is-active {
        border-color: var(--accent-color, #4262ff);
        background: #eff6ff;
        color: var(--accent-color, #4262ff);
        box-shadow: inset 0 0 0 1px var(--accent-color, #4262ff);
      }
      .mdr-custom-dice-btn.is-popping {
        z-index: 1;
        animation: mdr-die-pop 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
      }

      .mdr-custom-dice-input-wrap {
        display: flex;
        gap: 8px;
        align-items: center;
        margin-bottom: 10px;
      }

      .mdr-input {
        width: 100%;
        height: 28px;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        padding: 0 8px;
        font-size: 13px;
        font-weight: 600;
        color: #1e293b;
        background: #fff;
        transition: border-color 0.15s, box-shadow 0.15s;
        box-shadow: inset 0 1px 2px rgba(0,0,0,0.02);
        box-sizing: border-box;
      }

      .mdr-input:focus {
        outline: none;
        border-color: var(--accent-color, #4262ff);
        box-shadow: inset 0 1px 2px rgba(0,0,0,0.02), 0 0 0 3px color-mix(in srgb, var(--accent-color, #4262ff) 20%, transparent);
      }

      .mdr-input-small {
        width: 48px;
        text-align: center;
        padding: 0 4px;
      }

      /* Hide arrows in number inputs for cleaner UI */
      .mdr-input::-webkit-outer-spin-button,
      .mdr-input::-webkit-inner-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }
      .mdr-input[type=number] {
        -moz-appearance: textfield;
      }

      .mdr-section, .mdr-sub-section {
        display: flex;
        flex-direction: column;
        overflow: hidden;
        max-height: 400px;
        opacity: 1;
        transition: max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1), margin 0.3s cubic-bezier(0.4, 0, 0.2, 1), padding 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .mdr-section.is-hidden,
      .mdr-sub-section.is-hidden {
        max-height: 0;
        opacity: 0;
        margin-top: 0 !important;
        margin-bottom: 0 !important;
        padding-top: 0 !important;
        padding-bottom: 0 !important;
        border: none !important;
        pointer-events: none;
      }

      @keyframes mdr-die-pop {
        0% { transform: scale(0.5); opacity: 0; }
        100% { transform: scale(1); opacity: 1; }
      }
      .mdr-die-pop {
        animation: mdr-die-pop 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
      }

      /* Custom Dice Preview Box */
      .mdr-custom-row {
        display: flex;
        flex-direction: row;
        gap: ${CUSTOM_DICE_GAP}px;
      }

      .mdr-ghost-custom-box {
        display: flex;
        align-items: center;
        justify-content: center;
        width: ${CUSTOM_DICE_BLOCK_WIDTH}px;
        height: ${CUSTOM_DICE_BLOCK_WIDTH}px;
        border: 2px solid #1a1a1a;
        background: transparent;
        color: #1a1a1a;
        font-family: Arial, sans-serif;
        font-size: ${CUSTOM_DICE_FONT_SIZE}px;
        font-weight: bold;
        box-sizing: border-box;
      }
    `;

    document.head.appendChild(style);
  }

  // =========================================================================
  //  MIRO SDK & UTILITIES
  // =========================================================================

  async function waitForMiroSdk() {
    if (typeof window.miro !== 'undefined' && window.miro?.board) {
      return window.miro;
    }

    const deadline = Date.now() + 30_000;

    while (Date.now() < deadline) {
      await new Promise((resolve) => { window.setTimeout(resolve, 250); });
      if (typeof window.miro !== 'undefined' && window.miro?.board) {
        return window.miro;
      }
    }

    throw new Error('[Miro Dice] window.miro недоступен.');
  }

  function sleep(ms) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  function randomDieIndex() {
    return Math.floor(Math.random() * DICE_FACES.length);
  }

  function randomDieIndexExcludingSix() {
    return Math.floor(Math.random() * SIX_INDEX);
  }

  function faceByIndex(index) {
    return DICE_FACES[index] ?? DICE_FACES[0];
  }

  // =========================================================================
  //  GEOMETRY & COORDINATES
  // =========================================================================

  function getRowWidth(diceCount, isCustom) {
    const bw = isCustom ? CUSTOM_DICE_BLOCK_WIDTH : DICE_BLOCK_WIDTH;
    const gp = isCustom ? CUSTOM_DICE_GAP : DICE_GAP;
    return diceCount * bw + (diceCount - 1) * gp;
  }

  function getDieBlockPosition(anchorX, anchorY, dieIndex, diceCount, isCustom) {
    const bw = isCustom ? CUSTOM_DICE_BLOCK_WIDTH : DICE_BLOCK_WIDTH;
    const gp = isCustom ? CUSTOM_DICE_GAP : DICE_GAP;

    // Начинаем спавн ровно с первого кубика
    const startX = anchorX;

    return {
      x: startX + dieIndex * (bw + gp),
      y: anchorY,
    };
  }

  function findBoardCanvas() {
    const canvases = document.querySelectorAll('canvas');
    let largest = null;
    let maxArea = 0;

    for (const canvas of canvases) {
      const rect = canvas.getBoundingClientRect();
      const area = rect.width * rect.height;

      if (area > maxArea && rect.width > 200 && rect.height > 200) {
        maxArea = area;
        largest = canvas;
      }
    }

    return largest;
  }

  let currentBoardScale = 1;

  async function getCachedViewport() {
    const now = Date.now();
    if (cachedViewport && cachedViewportTime && now - cachedViewportTime < VIEWPORT_CACHE_TTL) {
      return cachedViewport;
    }
    try {
      cachedViewport = await window.miro.board.viewport.get();
      cachedViewportTime = now;
      if (typeof window.miro.board.viewport.getZoom === 'function') {
        currentBoardScale = await window.miro.board.viewport.getZoom();
      } else {
        const canvas = findBoardCanvas();
        if (canvas && cachedViewport) {
          const rect = canvas.getBoundingClientRect();
          currentBoardScale = rect.width / cachedViewport.width;
        }
      }
      return cachedViewport;
    } catch {
      return cachedViewport;
    }
  }

  async function clientToBoardPoint(miroSdk, clientX, clientY) {
    const canvas = findBoardCanvas();

    if (!canvas) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();
    const relX = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const relY = Math.max(0, Math.min(rect.height, clientY - rect.top));

    const viewport = await getCachedViewport();
    if (!viewport) {
      return null;
    }

    return {
      x: viewport.x + (relX / rect.width) * viewport.width,
      y: viewport.y + (relY / rect.height) * viewport.height,
    };
  }

  // =========================================================================
  //  CURSOR TRACKING
  // =========================================================================

  function trackPointerPosition(event) {
    lastClientX = event.clientX;
    lastClientY = event.clientY;

    if (typeof window.miro === 'undefined' || !window.miro?.board) {
      return;
    }

    void clientToBoardPoint(window.miro, event.clientX, event.clientY).then(
      (point) => {
        if (point) {
          lastCursorBoardPoint = point;
        }
      }
    );
  }

  function startCursorTracking() {
    document.addEventListener('pointermove', trackPointerPosition, {
      capture: true,
      passive: true,
    });

    document.addEventListener('pointerdown', trackPointerPosition, {
      capture: true,
      passive: true,
    });
  }

  // =========================================================================
  //  DICE ANIMATION (Miro SDK)
  // =========================================================================

  async function resolveGroupCenter(miroSdk, anchorPoint) {
    if (anchorPoint) {
      return anchorPoint;
    }

    const viewport = await getCachedViewport();
    if (!viewport) {
      return { x: 0, y: 0 };
    }
    return {
      x: viewport.x + viewport.width / 2,
      y: viewport.y + viewport.height / 2,
    };
  }

  async function createDieTextBlock(miroSdk, faceIndex, x, y) {
    return miroSdk.board.createText({
      content: faceByIndex(faceIndex),
      x,
      y,
      width: DICE_BLOCK_WIDTH,
      style: {
        fontSize: DICE_FONT_SIZE,
        textAlign: 'center',
        fillColor: 'transparent',
        color: '#1a1a1a',
      },
    });
  }

  async function updateDieBlock(widget, faceIndex) {
    try {
      widget.content = faceByIndex(faceIndex);
      await widget.sync();
    } catch {
      // Widget was deleted during animation
    }
  }

  async function createCustomDieShape(miroSdk, value, x, y, faceCount) {
    const textContent = faceCount === 6 ? faceByIndex(value - 1) : String(value);
    return miroSdk.board.createShape({
      shape: 'rectangle',
      content: textContent,
      x,
      y,
      width: CUSTOM_DICE_BLOCK_WIDTH,
      height: CUSTOM_DICE_BLOCK_WIDTH,
      style: {
        fontFamily: 'arial',
        fontSize: CUSTOM_DICE_FONT_SIZE,
        textAlign: 'center',
        textAlignVertical: 'middle',
        fillColor: 'transparent',
        borderColor: '#1a1a1a',
        borderWidth: 2,
        color: '#1a1a1a',
      },
    });
  }

  async function updateCustomDieShape(widget, value, faceCount) {
    try {
      widget.content = faceCount === 6 ? faceByIndex(value - 1) : String(value);
      await widget.sync();
    } catch {
      // Widget was deleted during animation
    }
  }

  async function spawnDiceBlocksSequentially(
    miroSdk,
    diceCount,
    anchorPoint,
    initialValues,
    isCustom,
    faceCount
  ) {
    const widgets = [];

    for (let i = 0; i < diceCount; i += 1) {
      if (i > 0) {
        await sleep(SPAWN_DELAY_MS);
      }

      const isShape = isCustom && faceCount !== 6;
      const { x, y } = getDieBlockPosition(
        anchorPoint.x,
        anchorPoint.y,
        i,
        diceCount,
        isShape
      );

      if (isShape) {
        widgets.push(await createCustomDieShape(miroSdk, initialValues[i], x, y, faceCount));
      } else {
        const faceIndex = isCustom ? initialValues[i] - 1 : initialValues[i];
        widgets.push(await createDieTextBlock(miroSdk, faceIndex, x, y));
      }
    }

    return widgets;
  }

  async function runSequentialSpinAnimation(widgets, finalValues, isCustom, faceCount) {
    const diceCount = widgets.length;
    const displayValues = Array.from({ length: diceCount }, () =>
      isCustom ? randomInt(1, faceCount) : randomDieIndex()
    );
    const spinChangesDone = Array.from({ length: diceCount }, () => 0);
    const frozen = Array.from({ length: diceCount }, () => false);

    let cyclePointer = 0;
    let safetyTicks = 0;
    const maxTicks = diceCount * (CHANGES_PER_DIE + 1) * 4;

    while (!frozen.every(Boolean) && safetyTicks < maxTicks) {
      let dieIndex = cyclePointer % diceCount;
      let skipped = 0;

      while (frozen[dieIndex] && skipped < diceCount) {
        cyclePointer += 1;
        dieIndex = cyclePointer % diceCount;
        skipped += 1;
      }

      if (frozen[dieIndex]) {
        break;
      }

      if (spinChangesDone[dieIndex] < CHANGES_PER_DIE) {
        let nextVal;
        do {
          nextVal = isCustom ? randomInt(1, faceCount) : randomDieIndex();
        } while (nextVal === displayValues[dieIndex]);
        displayValues[dieIndex] = nextVal;
        spinChangesDone[dieIndex] += 1;
      } else {
        displayValues[dieIndex] = finalValues[dieIndex];
        frozen[dieIndex] = true;
      }

      const isShape = isCustom && faceCount !== 6;
      if (isShape) {
        await updateCustomDieShape(widgets[dieIndex], displayValues[dieIndex], faceCount);
      } else {
        const faceIndex = isCustom ? displayValues[dieIndex] - 1 : displayValues[dieIndex];
        await updateDieBlock(widgets[dieIndex], faceIndex);
      }

      cyclePointer += 1;
      safetyTicks += 1;
      await sleep(SPAWN_INTERVAL_MS);
    }
  }

  async function runDiceRollAnimation(
    diceCount,
    perDie,
    anchorPoint,
    strictSixCount,
    finalIndicesOverride,
    isCustom,
    faceCount,
    customFinalValues
  ) {
    const miroSdk = await waitForMiroSdk();
    const groupCenter = await resolveGroupCenter(miroSdk, anchorPoint);

    rollingCount++;
    try {

    let finalValues;
    let initialValues;

    if (isCustom) {
      finalValues = customFinalValues;
      initialValues = Array.from({ length: diceCount }, () => randomInt(1, faceCount));
    } else {
      finalValues = finalIndicesOverride ?? buildFinalIndices(diceCount, perDie, strictSixCount);
      initialValues = Array.from({ length: diceCount }, () => randomDieIndex());
    }

    const widgets = await spawnDiceBlocksSequentially(
      miroSdk,
      diceCount,
      groupCenter,
      initialValues,
      isCustom,
      faceCount
    );

    if (diceCount === 1) {
      await sleep(SPAWN_DELAY_MS);
    }

    await runSequentialSpinAnimation(widgets, finalValues, isCustom, faceCount);

    if (isCustom) {
      console.log(`[Miro Dice] Custom Roll: ${finalValues.join('  ')}`);
    } else {
      console.log(`[Miro Dice] D6 Roll: ${finalValues.map((i) => faceByIndex(i)).join('  ')}`);
    }
    
    } finally {
      rollingCount--;
    }
  }

  // ============================================================
  //  FLOATING PANEL (drag-to-board)
  // ============================================================

  function buildFloatingLauncher() {
    injectStyles();

    const saved = loadFabSettings();

    // Remove existing panel if present to prevent overlapping panels
    const existingPanel = document.getElementById(`${MODAL_ROOT_ID}-panel`);
    if (existingPanel) {
      existingPanel.remove();
    }

    // --- Panel DOM ---
    const panel = document.createElement('div');
    panel.id = `${MODAL_ROOT_ID}-panel`;
    panel.classList.toggle('mdr-theme-glass', saved.panelTheme === 'glass');

    // Prevent interactions from passing through to Miro
    ['pointerdown', 'pointerup', 'pointermove', 'mousedown', 'mouseup', 'mousemove', 'click', 'dblclick', 'contextmenu', 'wheel', 'touchstart', 'touchend', 'touchmove'].forEach(evt => {
      panel.addEventListener(evt, (e) => e.stopPropagation());
    });
    panel.innerHTML = `
      <div id="${MODAL_ROOT_ID}-panel-header">
        <span id="${MODAL_ROOT_ID}-panel-title">Бросок кубиков</span>
        <div style="display: flex; gap: 4px;">
          <button type="button" id="${MODAL_ROOT_ID}-panel-theme-btn" title="Переключить тему (ПКМ - настройки)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 2v20"></path><path d="M2 12h20"></path></svg></button>
          <button type="button" id="${MODAL_ROOT_ID}-panel-interactive-btn" title="Интерактивный режим"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 8v8M8 12h8"></path></svg></button>
          <button type="button" id="${MODAL_ROOT_ID}-panel-close-btn" title="Закрыть">✕</button>
        </div>
      </div>
      <div id="${MODAL_ROOT_ID}-theme-settings" class="is-hidden" style="background: rgba(255,255,255,0.5); padding: 8px; border-radius: 8px; font-size: 10px; display: flex; flex-direction: column; gap: 6px; border: 1px solid rgba(255,255,255,0.4);">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <label>Цвет:</label>
          <input type="color" id="${MODAL_ROOT_ID}-theme-color" style="width: 24px; height: 16px; padding: 0; border: none; border-radius: 4px; cursor: pointer; background: transparent; overflow: hidden;">
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <label>Акцент:</label>
          <input type="color" id="${MODAL_ROOT_ID}-accent-color" style="width: 24px; height: 16px; padding: 0; border: none; border-radius: 4px; cursor: pointer; background: transparent; overflow: hidden;">
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <label style="width: 75px;">Прозрачность:</label>
          <div class="mdr-custom-slider" id="${MODAL_ROOT_ID}-theme-opacity" style="flex: 1; margin: 0;"></div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <label style="width: 75px;">Размытие:</label>
          <div class="mdr-custom-slider" id="${MODAL_ROOT_ID}-theme-blur" style="flex: 1; margin: 0;"></div>
        </div>
      </div>

      <div class="mdr-mode-wrap" style="margin-bottom: 10px;">
        <span class="mdr-mode-opt text-right" id="${MODAL_ROOT_ID}-fab-mode-d6">Стандартные</span>
        <button type="button" class="mdr-toggle" id="${MODAL_ROOT_ID}-fab-type-toggle"></button>
        <span class="mdr-mode-opt text-left" id="${MODAL_ROOT_ID}-fab-mode-custom">Кастомные</span>
      </div>

      <div id="${MODAL_ROOT_ID}-total-dice-wrap">
        <p class="mdr-label" style="margin-top:0;">Всего кубиков</p>
        <div class="mdr-slider-wrap" style="margin-bottom: 12px;">
          <div class="mdr-custom-slider" id="${MODAL_ROOT_ID}-fab-count-slider"></div>
          <span class="mdr-slider-value" id="${MODAL_ROOT_ID}-fab-count-value">${saved.diceCount}</span>
        </div>
      </div>

      <!-- D6 SECTION -->
      <div id="${MODAL_ROOT_ID}-section-d6" class="mdr-section">
        <p class="mdr-label" style="margin-top:0;">Выпадет шестёрок</p>
        <div class="mdr-slider-wrap" style="margin-bottom: 10px;">
          <div class="mdr-custom-slider" id="${MODAL_ROOT_ID}-fab-six-slider"></div>
          <span class="mdr-slider-value" id="${MODAL_ROOT_ID}-fab-six-value">${saved.sixCount ?? 0}</span>
        </div>

        <p class="mdr-label">Остальные кубики</p>
        <div class="mdr-mode-wrap">
          <span class="mdr-mode-opt text-right" id="${MODAL_ROOT_ID}-fab-mode-1-5">Только 1–5</span>
          <button type="button" class="mdr-toggle" id="${MODAL_ROOT_ID}-fab-strict-toggle"></button>
          <span class="mdr-mode-opt text-left" id="${MODAL_ROOT_ID}-fab-mode-1-6">Могут быть 1–6</span>
        </div>
      </div>

      <!-- CUSTOM DICE SECTION -->
      <div id="${MODAL_ROOT_ID}-section-custom" class="mdr-section is-hidden">

        <p class="mdr-label" style="margin-top:0;">Пресеты и свои грани</p>
        <div class="mdr-custom-dice-btn-group" style="margin-bottom: 6px;">
          <button type="button" class="mdr-custom-dice-btn" data-faces="4">d4</button>
          <button type="button" class="mdr-custom-dice-btn" data-faces="6">d6</button>
          <button type="button" class="mdr-custom-dice-btn" data-faces="10">d10</button>
          <button type="button" class="mdr-custom-dice-btn" data-faces="20">d20</button>
        </div>

        <div class="mdr-custom-dice-input-wrap" style="margin-bottom: 14px;">
          <span class="mdr-label" style="margin:0; flex:1;">Своя грань (4-99):</span>
          <input type="number" class="mdr-input mdr-input-small" id="${MODAL_ROOT_ID}-fab-custom-faces" min="4" max="99" value="${saved.customFaceCount}">
        </div>

        <div id="${MODAL_ROOT_ID}-custom-logic-wrap">
          <p class="mdr-label">Режим генерации</p>
          <div class="mdr-mode-wrap" style="margin-bottom: 10px; background: #f1f5f9; padding: 4px; border-radius: 6px;">
            <span class="mdr-mode-opt text-right" id="${MODAL_ROOT_ID}-fab-cmode-threshold">Порог</span>
            <button type="button" class="mdr-toggle" id="${MODAL_ROOT_ID}-fab-cmode-toggle"></button>
            <span class="mdr-mode-opt text-left" id="${MODAL_ROOT_ID}-fab-cmode-exact">Грань</span>
          </div>

        <!-- SUBSECTION: Threshold Mode -->
        <div id="${MODAL_ROOT_ID}-sub-threshold" class="mdr-sub-section" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px;">
          <div class="mdr-custom-dice-input-wrap" style="margin-bottom: 10px;">
            <span class="mdr-label" style="margin:0; flex:1;">Значение порога:</span>
            <input type="number" class="mdr-input mdr-input-small" id="${MODAL_ROOT_ID}-fab-custom-threshold" min="1" max="99" value="${saved.customThreshold}">
          </div>

          <div class="mdr-mode-wrap" style="margin-bottom: 10px;">
            <span class="mdr-mode-opt text-right" id="${MODAL_ROOT_ID}-fab-mode-lte">≤ порога</span>
            <button type="button" class="mdr-toggle" id="${MODAL_ROOT_ID}-fab-direction-toggle"></button>
            <span class="mdr-mode-opt text-left" id="${MODAL_ROOT_ID}-fab-mode-gte">≥ порога</span>
          </div>

          <p class="mdr-label" style="margin-top:4px;">Сработает раз:</p>
          <div class="mdr-slider-wrap">
            <div class="mdr-custom-slider" id="${MODAL_ROOT_ID}-fab-custom-threshold-count-slider"></div>
            <span class="mdr-slider-value" id="${MODAL_ROOT_ID}-fab-custom-threshold-count-value">${saved.customThresholdCount}</span>
          </div>
        </div>

        <!-- SUBSECTION: Exact Face Mode -->
        <div id="${MODAL_ROOT_ID}-sub-exact" class="mdr-sub-section is-hidden" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px;">
          <div class="mdr-custom-dice-input-wrap" style="margin-bottom: 10px;">
            <span class="mdr-label" style="margin:0; flex:1;">Нужная грань:</span>
            <input type="number" class="mdr-input mdr-input-small" id="${MODAL_ROOT_ID}-fab-custom-exact-face" min="1" max="99" value="${saved.customExactFace}">
          </div>

          <p class="mdr-label">Выпадет раз:</p>
          <div class="mdr-slider-wrap">
            <div class="mdr-custom-slider" id="${MODAL_ROOT_ID}-fab-custom-exact-count-slider"></div>
            <span class="mdr-slider-value" id="${MODAL_ROOT_ID}-fab-custom-exact-count-value">${saved.customExactCount}</span>
          </div>
        </div>
        </div>

      </div>

      <div id="${MODAL_ROOT_ID}-preview-row" style="margin-top: 10px;">
        <button type="button" class="mdr-icon-btn" id="${MODAL_ROOT_ID}-preview-toggle-btn" title="Показать итог">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
        </button>
        <button type="button" class="mdr-global-btn is-hidden" id="${MODAL_ROOT_ID}-interactive-minus" title="Убрать кубик">−</button>
        <div id="${MODAL_ROOT_ID}-drag-area">
          <div id="${MODAL_ROOT_ID}-drag-preview"></div>
        </div>
        <button type="button" class="mdr-global-btn is-hidden" id="${MODAL_ROOT_ID}-interactive-plus" title="Добавить кубик">+</button>
        <button type="button" class="mdr-icon-btn" id="${MODAL_ROOT_ID}-reroll-btn" title="Новая комбинация">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
        </button>
      </div>
    `;

    document.body.appendChild(panel);



    const preview = panel.querySelector(`#${MODAL_ROOT_ID}-drag-preview`);
    const dragArea = panel.querySelector(`#${MODAL_ROOT_ID}-drag-area`);
    const rerollBtn = panel.querySelector(`#${MODAL_ROOT_ID}-reroll-btn`);
    const header = panel.querySelector(`#${MODAL_ROOT_ID}-panel-header`);
    const interactiveBtn = panel.querySelector(`#${MODAL_ROOT_ID}-panel-interactive-btn`);
    const closeBtn = panel.querySelector(`#${MODAL_ROOT_ID}-panel-close-btn`);

    // Interactive Mode Buttons
    const intMinusBtn = panel.querySelector(`#${MODAL_ROOT_ID}-interactive-minus`);
    const intPlusBtn = panel.querySelector(`#${MODAL_ROOT_ID}-interactive-plus`);

    // Type toggle
    const typeToggle = panel.querySelector(`#${MODAL_ROOT_ID}-fab-type-toggle`);
    const modeD6Label = panel.querySelector(`#${MODAL_ROOT_ID}-fab-mode-d6`);
    const modeCustomLabel = panel.querySelector(`#${MODAL_ROOT_ID}-fab-mode-custom`);
    const sectionD6 = panel.querySelector(`#${MODAL_ROOT_ID}-section-d6`);
    const sectionCustom = panel.querySelector(`#${MODAL_ROOT_ID}-section-custom`);

    // D6 Controls
    const initSlider = (id, min, max, initialVal, step = 1) => {
      const el = panel.querySelector('#' + id);
      if (!el) return null;
      el.innerHTML = '<div class="mdr-cs-track"></div><div class="mdr-cs-fill"></div><div class="mdr-cs-thumb"></div>';
      el.classList.add('is-smooth');
      const fill = el.querySelector('.mdr-cs-fill');
      const thumb = el.querySelector('.mdr-cs-thumb');
      
      let currentVal = initialVal;
      let currentMax = max;
      let isDragging = false;
      let onInputCb = null;
      let onChangeCb = null;
      let sliderRect = null;
      
      const updateVisuals = (renderVal) => {
        const pct = currentMax === min ? 0 : Math.max(0, Math.min(1, (renderVal - min) / (currentMax - min)));
        fill.style.width = `${pct * 100}%`;
        thumb.style.left = `${pct * 100}%`;
      };
      
      const handleMove = (e) => {
        if (!isDragging || !sliderRect) return;
        let pct = (e.clientX - sliderRect.left) / sliderRect.width;
        pct = Math.max(0, Math.min(1, pct));
        let rawVal = min + pct * (currentMax - min);
        let rounded = Number((Math.round(rawVal / step) * step).toFixed(4));
        
        updateVisuals(rawVal);
        
        if (rounded !== currentVal) {
          currentVal = rounded;
          if (onInputCb) onInputCb();
        }
      };
      
      const handleUp = (e) => {
        if (!isDragging) return;
        isDragging = false;
        el.classList.remove('is-active');
        el.classList.add('is-smooth');
        window.removeEventListener('pointermove', handleMove, { capture: true });
        window.removeEventListener('pointerup', handleUp, { capture: true });
        updateVisuals(currentVal);
        if (onChangeCb) onChangeCb();
      };
      
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        isDragging = true;
        el.classList.remove('is-smooth');
        sliderRect = el.getBoundingClientRect();
        el.classList.add('is-active');
        window.addEventListener('pointermove', handleMove, { capture: true });
        window.addEventListener('pointerup', handleUp, { capture: true });
        handleMove(e);
      });

      let wheelTimeout = null;
      el.addEventListener('wheel', (e) => {
        e.preventDefault();
        const dir = e.deltaY < 0 ? step : -step;
        const next = Number((currentVal + dir).toFixed(4));
        const clamped = Math.max(min, Math.min(currentMax, next));
        if (clamped !== currentVal) {
          currentVal = clamped;
          if (!isDragging) updateVisuals(currentVal);
          if (onInputCb) onInputCb();
          
          if (wheelTimeout) clearTimeout(wheelTimeout);
          wheelTimeout = setTimeout(() => {
            if (onChangeCb) onChangeCb();
          }, 150);
        }
      });
      
      updateVisuals(currentVal);
      
      return {
        get value() { return currentVal; },
        set value(v) { 
          currentVal = Math.max(min, Math.min(currentMax, Number(v)));
          if (!isDragging) updateVisuals(currentVal);
        },
        set max(m) {
          currentMax = Math.max(min, Number(m));
          currentVal = Math.max(min, Math.min(currentMax, currentVal));
          if (!isDragging) updateVisuals(currentVal);
        },
        addEventListener: (event, cb) => {
          if (event === 'input') onInputCb = cb;
          if (event === 'change') onChangeCb = cb;
        }
      };
    };

    const countSlider = initSlider(`${MODAL_ROOT_ID}-fab-count-slider`, MIN_DICE, MAX_DICE, saved.diceCount);
    const countValue = panel.querySelector(`#${MODAL_ROOT_ID}-fab-count-value`);
    const sixSlider = initSlider(`${MODAL_ROOT_ID}-fab-six-slider`, 0, saved.diceCount, saved.sixCount ?? 0);
    const sixValue = panel.querySelector(`#${MODAL_ROOT_ID}-fab-six-value`);
    const strictToggle = panel.querySelector(`#${MODAL_ROOT_ID}-fab-strict-toggle`);
    const mode15Label = panel.querySelector(`#${MODAL_ROOT_ID}-fab-mode-1-5`);
    const mode16Label = panel.querySelector(`#${MODAL_ROOT_ID}-fab-mode-1-6`);

    // Custom Generic Controls
    const presetButtons = panel.querySelectorAll('.mdr-custom-dice-btn');
    const customFacesInput = /** @type {HTMLInputElement} */ (panel.querySelector(`#${MODAL_ROOT_ID}-fab-custom-faces`));

    // Custom Mode Toggle
    const customModeToggle = panel.querySelector(`#${MODAL_ROOT_ID}-fab-cmode-toggle`);
    const customModeThresholdLabel = panel.querySelector(`#${MODAL_ROOT_ID}-fab-cmode-threshold`);
    const customModeExactLabel = panel.querySelector(`#${MODAL_ROOT_ID}-fab-cmode-exact`);
    const subThreshold = panel.querySelector(`#${MODAL_ROOT_ID}-sub-threshold`);
    const subExact = panel.querySelector(`#${MODAL_ROOT_ID}-sub-exact`);

    // Custom Threshold Controls
    const customThresholdInput = /** @type {HTMLInputElement} */ (panel.querySelector(`#${MODAL_ROOT_ID}-fab-custom-threshold`));
    const customThresholdCountSlider = initSlider(`${MODAL_ROOT_ID}-fab-custom-threshold-count-slider`, 0, saved.diceCount, saved.customThresholdCount);
    const customThresholdCountValue = panel.querySelector(`#${MODAL_ROOT_ID}-fab-custom-threshold-count-value`);
    const directionToggle = panel.querySelector(`#${MODAL_ROOT_ID}-fab-direction-toggle`);
    const modeLteLabel = panel.querySelector(`#${MODAL_ROOT_ID}-fab-mode-lte`);
    const modeGteLabel = panel.querySelector(`#${MODAL_ROOT_ID}-fab-mode-gte`);

    // Custom Exact Controls
    const customExactFaceInput = /** @type {HTMLInputElement} */ (panel.querySelector(`#${MODAL_ROOT_ID}-fab-custom-exact-face`));
    const customExactCountSlider = initSlider(`${MODAL_ROOT_ID}-fab-custom-exact-count-slider`, 0, saved.diceCount, saved.customExactCount);
    const customExactCountValue = panel.querySelector(`#${MODAL_ROOT_ID}-fab-custom-exact-count-value`);
    // State
    let fabDiceCount = saved.diceCount;
    let fabSixCount = Math.max(0, Math.min(saved.sixCount ?? 0, fabDiceCount));
    let fabStrict = saved.strictSixCount;
    let fabPreviewShowResult = saved.previewShowResult ?? false;
    let fabTheme = saved.panelTheme ?? 'solid';
    let fabGlassColor = saved.glassColor ?? '#dce6ff';
    let fabGlassOpacity = saved.glassOpacity ?? 0.6;
    let fabGlassBlur = saved.glassBlur ?? 16;
    let fabAccentColor = saved.accentColor ?? '#4262ff';
    let panelX = saved.panelX;
    let panelY = saved.panelY;
    let isVisible = saved.panelVisible;

    let isCustomDice = saved.isCustomDice;
    let customFaceCount = saved.customFaceCount;
    let customMode = saved.customMode;
    let customThreshold = saved.customThreshold;
    let customThresholdCount = saved.customThresholdCount ?? 1;
    let customDirection = saved.customDirection;
    let customExactFace = saved.customExactFace ?? 20;
    let customExactCount = saved.customExactCount ?? 0;
    let isInteractiveMode = saved.interactiveMode ?? false;
    let interactiveValues = saved.interactiveValues ?? [];

    // Update toggle visual state
    const refreshToggleState = () => {
      // Type Toggle
      if (isCustomDice) {
        typeToggle.classList.add('is-on');
        modeD6Label.classList.remove('is-active');
        modeCustomLabel.classList.add('is-active');
        if (!isInteractiveMode) {
          sectionD6.classList.add('is-hidden');
          sectionCustom.classList.remove('is-hidden');
        }
      } else {
        typeToggle.classList.remove('is-on');
        modeD6Label.classList.add('is-active');
        modeCustomLabel.classList.remove('is-active');
        if (!isInteractiveMode) {
          sectionD6.classList.remove('is-hidden');
          sectionCustom.classList.add('is-hidden');
        }
      }

      // D6 Strict Toggle
      if (fabStrict) {
        strictToggle.classList.remove('is-on');
        mode15Label.classList.add('is-active');
        mode16Label.classList.remove('is-active');
      } else {
        strictToggle.classList.add('is-on');
        mode15Label.classList.remove('is-active');
        mode16Label.classList.add('is-active');
      }

      // Custom Mode Toggle
      if (customMode === 'exact') {
        customModeToggle.classList.add('is-on');
        customModeThresholdLabel.classList.remove('is-active');
        customModeExactLabel.classList.add('is-active');
        if (!isInteractiveMode) {
          subThreshold.classList.add('is-hidden');
          subExact.classList.remove('is-hidden');
        }
      } else {
        customModeToggle.classList.remove('is-on');
        customModeThresholdLabel.classList.add('is-active');
        customModeExactLabel.classList.remove('is-active');
        if (!isInteractiveMode) {
          subThreshold.classList.remove('is-hidden');
          subExact.classList.add('is-hidden');
        }
      }

      // Custom Direction Toggle
      if (customDirection === 'lte') {
        directionToggle.classList.remove('is-on');
        modeLteLabel.classList.add('is-active');
        modeGteLabel.classList.remove('is-active');
      } else {
        directionToggle.classList.add('is-on');
        modeLteLabel.classList.remove('is-active');
        modeGteLabel.classList.add('is-active');
      }
    };

    // --- Preview mode button ---
    const previewToggleBtn = panel.querySelector(`#${MODAL_ROOT_ID}-preview-toggle-btn`);
    const updatePreviewToggleBtn = () => {
      if (fabPreviewShowResult) {
        previewToggleBtn.classList.add('is-on');
        previewToggleBtn.title = 'Скрыть итог';
        rerollBtn.style.display = 'flex';
      } else {
        previewToggleBtn.classList.remove('is-on');
        previewToggleBtn.title = 'Показать итог';
        rerollBtn.style.display = 'none';
      }
    };
    previewToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      fabPreviewShowResult = !fabPreviewShowResult;
      updatePreviewToggleBtn();
      generateCurrentRolls();
      saveAndPersist();
    });

    // --- Dice drag state ---
    let isDiceDragging = false;
    let dragMoved = false;
    /** @type {{ x: number, y: number } | null} */
    let diceBoardPoint = null;
    /** @type {number[]} */
    let fabFinalIndices = [];
    /** @type {number[]} */
    let fabCustomFinalValues = [];
    /** @type {number[]} */
    let fabPerDie = [];

    const generateCurrentRolls = () => {
      if (isInteractiveMode) {
        interactiveValues = [];
        const maxFaces = isCustomDice ? customFaceCount : 6;
        for (let i = 0; i < fabDiceCount; i++) {
          interactiveValues.push(Math.floor(Math.random() * maxFaces) + 1);
        }
        if (isCustomDice) {
          fabCustomFinalValues = [...interactiveValues];
        } else {
          fabFinalIndices = interactiveValues.map(v => v - 1);
        }
      } else if (isCustomDice) {
        fabCustomFinalValues = buildCustomFinalValues({
          diceCount: fabDiceCount,
          faceCount: customFaceCount,
          customMode,
          customThreshold,
          customThresholdCount,
          customDirection,
          customExactFace,
          customExactCount
        });
      } else {
        fabPerDie = buildPerDieForFab(fabDiceCount, fabSixCount);
        fabFinalIndices = buildFinalIndices(fabDiceCount, fabPerDie, fabStrict);
      }
      refreshFabPreview();
    };

    // --- Ghost element ---
    const ghostWrapper = document.createElement('div');
    ghostWrapper.id = `${MODAL_ROOT_ID}-ghost-wrapper`;

    const ghost = document.createElement('div');
    ghost.id = `${MODAL_ROOT_ID}-ghost`;

    const ghostInner = document.createElement('div');
    ghostInner.id = `${MODAL_ROOT_ID}-ghost-inner`;
    
    ghost.appendChild(ghostInner);
    ghostWrapper.appendChild(ghost);
    document.body.appendChild(ghostWrapper);

    const refreshGhost = () => {
      if (isCustomDice && customFaceCount !== 6) {
        const html = fabCustomFinalValues
          .map((v) => `<div class="mdr-ghost-custom-box">${v}</div>`)
          .join('');
        ghostInner.innerHTML = `<div class="mdr-custom-row">${html}</div>`;
      } else {
        const faces = isCustomDice ? fabCustomFinalValues.map((v) => faceByIndex(v - 1)) : fabFinalIndices.map((i) => faceByIndex(i));
        ghostInner.innerHTML = `<div style="display: flex; flex-direction: row;">
          ${faces.map((f, idx) => `<div style="width: ${DICE_BLOCK_WIDTH}px; height: ${DICE_BLOCK_WIDTH}px; display: flex; align-items: center; justify-content: center; font-size: ${DICE_FONT_SIZE}px; line-height: 1; color: #1a1a1a; margin-left: ${idx > 0 ? DICE_GAP : 0}px;">${f}</div>`).join('')}
        </div>`;
      }
    };

    const updateGhostPos = (clientX, clientY) => {
      // Моментальное аппаратное следование за курсором
      ghostWrapper.style.transform = `translate3d(${clientX}px, ${clientY}px, 0)`;
      
      const isShape = isCustomDice && customFaceCount !== 6;
      const offsetX = isShape ? (CUSTOM_DICE_BLOCK_WIDTH / 2) : (DICE_BLOCK_WIDTH / 2);
      const offsetY = isShape ? 0 : (DICE_BLOCK_WIDTH * 0.031); // Идеальное значение базлайна от пользователя

      // Используем zoom, чтобы браузер рендерил векторный шрифт в нужном разрешении
      if ('zoom' in ghostInner.style) {
        ghostInner.style.zoom = currentBoardScale;
        ghost.style.transformOrigin = '';
        ghost.style.transform = `translate(-${offsetX * currentBoardScale}px, calc(-50% - ${offsetY * currentBoardScale}px))`;
      } else {
        ghost.style.transformOrigin = '0 0';
        ghost.style.transform = `scale(${currentBoardScale}) translate(-${offsetX}px, calc(-50% - ${offsetY}px))`;
      }
    };

    let ghostPollInterval = null;

    const startGhostPolling = () => {
      if (ghostPollInterval) return;
      ghostPollInterval = setInterval(async () => {
        if (!ghost.classList.contains('is-active')) {
          stopGhostPolling();
          return;
        }
        if (lastClientX !== null && lastClientY !== null) {
          const oldScale = currentBoardScale;
          await getCachedViewport();
          if (currentBoardScale !== oldScale) {
            updateGhostPos(lastClientX, lastClientY);
          }
        }
      }, 50); // Проверяем зум 20 раз в секунду даже если мышь стоит
    };

    const stopGhostPolling = () => {
      if (ghostPollInterval) {
        clearInterval(ghostPollInterval);
        ghostPollInterval = null;
      }
    };

    /**
     * Refreshes the dice preview inside the floating panel.
     */
    const refreshFabPreview = () => {
      if (isInteractiveMode) {
        const boxes = [...interactiveValues];
        const isShape = isCustomDice && customFaceCount !== 6;
        
        preview.innerHTML = `<div style="display: flex; gap: 8px; justify-content: center; align-items: center;">
          ${boxes.map((v, idx) => {
            const face = isShape ? v : faceByIndex(v - 1);
            const style = isShape 
              ? `width: 36px; height: 36px; font-size: 20px; display: flex; align-items: center; justify-content: center; font-weight: bold; background: #fff; border: 2px solid #e2e8f0; border-radius: 6px;`
              : `font-size: 38px; line-height: 1;`;
            return `<div class="mdr-interactive-die-wrap" data-idx="${idx}">
              <button type="button" class="mdr-interactive-arrow mdr-arrow-up">▲</button>
              <div class="mdr-die-pop mdr-interactive-die" style="${style}">${face}</div>
              <button type="button" class="mdr-interactive-arrow mdr-arrow-down">▼</button>
            </div>`;
          }).join('')}
        </div>`;
        return;
      }

      if (isCustomDice) {
        const boxes = [];
        if (fabPreviewShowResult) {
          boxes.push(...fabCustomFinalValues);
        } else {
          for (let i = 0; i < fabDiceCount; i += 1) {
            if (customMode === 'exact') {
              boxes.push(i < customExactCount ? customExactFace : 1);
            } else {
              boxes.push(i < customThresholdCount ? customThreshold : 1);
            }
          }
        }

        if (customFaceCount === 6) {
          const faces = boxes.map((v) => faceByIndex(v - 1));
          preview.innerHTML = faces
            .map((f) => `<span class="mdr-die-pop" style="font-size:34px;line-height:1;display:inline-block">${f}</span>`)
            .join('');
        } else {
          // Масштабируем превью, вычисляя точные размеры, чтобы рамки не пропадали
          const rowW = fabDiceCount * CUSTOM_DICE_BLOCK_WIDTH + (Math.max(0, fabDiceCount - 1)) * CUSTOM_DICE_GAP;
          const MAX_PREVIEW_WIDTH = 150;
          const MAX_PREVIEW_HEIGHT = 46;
          const scaleX = MAX_PREVIEW_WIDTH / Math.max(1, rowW);
          const scaleY = MAX_PREVIEW_HEIGHT / Math.max(1, CUSTOM_DICE_BLOCK_WIDTH);
          const scale = Math.min(1, scaleX, scaleY);

          const pSize = CUSTOM_DICE_BLOCK_WIDTH * scale;
          const pGap = CUSTOM_DICE_GAP * scale;
          // Делаем шрифт крупнее, убираем рамки, чтобы цифры лучше читались в превью
          const pFontSize = Math.max(16, pSize * 1.2);

          preview.innerHTML = `<div style="display: flex; gap: ${pGap}px; justify-content: center; align-items: center;">
            ${boxes.map((v) => `<div class="mdr-die-pop" style="
              display: flex;
              align-items: center;
              justify-content: center;
              width: ${pSize}px;
              height: ${pSize}px;
              font-family: Arial, sans-serif;
              font-size: ${pFontSize}px;
              font-weight: bold;
              box-sizing: border-box;
              color: #1a1a1a;
            ">${v}</div>`).join('')}
          </div>`;
        }
      } else {
        if (fabPreviewShowResult) {
          const faces = fabFinalIndices.map((i) => faceByIndex(i));
          preview.innerHTML = faces
            .map((f) => `<span class="mdr-die-pop" style="font-size:34px;line-height:1;display:inline-block">${f}</span>`)
            .join('');
        } else {
          const faces = [];
          for (let i = 0; i < fabDiceCount; i += 1) {
            if (i < fabSixCount) {
              faces.push('\u2685');
            } else {
              faces.push('\u2680');
            }
          }
          preview.innerHTML = faces
            .map((f) => `<span class="mdr-die-pop" style="font-size:34px;line-height:1;display:inline-block">${f}</span>`)
            .join('');
        }
      }
    };

    // --- Full UI refresh ---
    // --- Value Popping Helper ---
    const triggerPop = (el) => {
      if (!el || isInteractiveMode) return;
      el.classList.remove('is-popping');
      void el.offsetWidth; // trigger reflow
      el.classList.add('is-popping');
      setTimeout(() => el.classList.remove('is-popping'), 150);
    };

    const refreshFabUi = () => {
      fabDiceCount = Math.max(MIN_DICE, Math.min(MAX_DICE, fabDiceCount));
      fabSixCount = Math.max(0, Math.min(fabSixCount, fabDiceCount));
      customThresholdCount = Math.max(0, Math.min(customThresholdCount, fabDiceCount));
      customExactCount = Math.max(0, Math.min(customExactCount, fabDiceCount));

      // Sync slider positions (D6)
      countSlider.value = String(fabDiceCount);
      countSlider.max = String(MAX_DICE);
      countValue.textContent = String(fabDiceCount);

      sixSlider.max = String(fabDiceCount);
      sixSlider.value = String(fabSixCount);
      sixValue.textContent = String(fabSixCount);

      // Sync slider positions (Custom)
      customFacesInput.value = String(customFaceCount);
      presetButtons.forEach(btn => {
        const faces = Number(btn.getAttribute('data-faces'));
        const isActive = (customFaceCount === faces);
        if (isActive && !btn.classList.contains('is-active')) {
          triggerPop(btn);
        }
        btn.classList.toggle('is-active', isActive);
      });

      customThresholdInput.value = String(customThreshold);
      customThresholdCountSlider.max = String(fabDiceCount);
      customThresholdCountSlider.value = String(customThresholdCount);
      customThresholdCountValue.textContent = String(customThresholdCount);

      customExactFaceInput.value = String(customExactFace);
      customExactCountSlider.max = String(fabDiceCount);
      customExactCountSlider.value = String(customExactCount);
      customExactCountValue.textContent = String(customExactCount);

      refreshToggleState();
      refreshFabPreview();
      updatePreviewToggleBtn();
      refreshGhost();
    };

    // --- Position & visibility ---
    panel.style.left = `${panelX}px`;
    panel.style.top = `${panelY}px`;

    const applyVisibility = () => {
      if (isVisible) {
        panel.classList.remove('is-hidden');
      } else {
        panel.classList.add('is-hidden');
      }

      const totalDiceWrap = panel.querySelector(`#${MODAL_ROOT_ID}-total-dice-wrap`);
      const customLogicWrap = panel.querySelector(`#${MODAL_ROOT_ID}-custom-logic-wrap`);

      if (isInteractiveMode) {
        if (totalDiceWrap) totalDiceWrap.classList.add('is-hidden');
        if (sectionD6) sectionD6.classList.add('is-hidden');
        if (customLogicWrap) customLogicWrap.classList.add('is-hidden');
        
        // Ensure sub-threshold/sub-exact are hidden even if logic says otherwise
        const subThreshold = panel.querySelector(`#${MODAL_ROOT_ID}-sub-threshold`);
        const subExact = panel.querySelector(`#${MODAL_ROOT_ID}-sub-exact`);
        if (subThreshold) subThreshold.classList.add('is-hidden');
        if (subExact) subExact.classList.add('is-hidden');

        // Toggle interactive preview buttons
        if (intMinusBtn) intMinusBtn.classList.remove('is-hidden');
        if (intPlusBtn) intPlusBtn.classList.remove('is-hidden');
        if (previewToggleBtn) previewToggleBtn.classList.add('is-hidden');
        if (rerollBtn) rerollBtn.classList.add('is-hidden');
      } else {
        if (totalDiceWrap) totalDiceWrap.classList.remove('is-hidden');
        if (intMinusBtn) intMinusBtn.classList.add('is-hidden');
        if (intPlusBtn) intPlusBtn.classList.add('is-hidden');
        if (previewToggleBtn) previewToggleBtn.classList.remove('is-hidden');
        if (rerollBtn) rerollBtn.classList.remove('is-hidden');
        // Let refreshToggleState handle sectionD6, customLogicWrap, etc.
        refreshToggleState();
      }
    };

    applyVisibility();

    // --- Persistence ---
    const saveAndPersist = () => {
      saveFabSettings({
        perfMode: fabPerfMode,
        diceCount: fabDiceCount,
        sixCount: fabSixCount,
        strictSixCount: fabStrict,
        panelVisible: isVisible,
        panelX: panelX,
        panelY: panelY,
        previewShowResult: fabPreviewShowResult,

        isCustomDice,
        customFaceCount,

        customMode,

        customThreshold,
        customThresholdCount,
        customDirection,

        customExactFace,
        customExactCount,
        panelTheme: fabTheme,
        glassColor: fabGlassColor,
        glassOpacity: fabGlassOpacity,
        glassBlur: fabGlassBlur,
        accentColor: fabAccentColor
      });
    };

    // --- Perf Button ---
    const updatePerfUi = () => {
      if (interactiveBtn) interactiveBtn.classList.toggle('is-active', isInteractiveMode);
      // Removed is-perf logic as it's no longer a perf mode
      // panel.classList.toggle('mdr-perf-mode', isInteractiveMode);
    };
    if (interactiveBtn) {
      interactiveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        triggerPop(interactiveBtn);
        isInteractiveMode = !isInteractiveMode;
        if (isInteractiveMode) {
          generateCurrentRolls();
        }
        applyVisibility();
        refreshFabUi();
        saveFabSettings();
      });
    }
    updatePerfUi();
    // --- Theme Button ---
    const themeBtn = panel.querySelector(`#${MODAL_ROOT_ID}-panel-theme-btn`);
    const themeSettingsPanel = panel.querySelector(`#${MODAL_ROOT_ID}-theme-settings`);
    const themeColorInput = panel.querySelector(`#${MODAL_ROOT_ID}-theme-color`);
    const accentColorInput = panel.querySelector(`#${MODAL_ROOT_ID}-accent-color`);
    
    // Sliders initialized later
    let themeOpacitySlider = null;
    let themeBlurSlider = null;

    const updateThemeUi = () => {
      if (themeBtn) themeBtn.classList.toggle('is-active', fabTheme === 'glass');
      panel.classList.toggle('mdr-theme-glass', fabTheme === 'glass');
      
      // Update CSS variables
      panel.style.setProperty('--glass-color', fabGlassColor);
      panel.style.setProperty('--glass-opacity-pct', `${fabGlassOpacity * 100}%`);
      panel.style.setProperty('--glass-blur', `${fabGlassBlur}px`);
      panel.style.setProperty('--accent-color', fabAccentColor);

      // Update inputs
      if (themeColorInput) themeColorInput.value = fabGlassColor;
      if (themeOpacitySlider) themeOpacitySlider.value = fabGlassOpacity;
      if (themeBlurSlider) themeBlurSlider.value = fabGlassBlur;
      if (accentColorInput) accentColorInput.value = fabAccentColor;
    };

    if (themeBtn) {
      themeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fabTheme = fabTheme === 'glass' ? 'solid' : 'glass';
        console.log('[Miro Dice] Theme toggled to:', fabTheme);
        updateThemeUi();
        saveAndPersist();
      });

      themeBtn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (themeSettingsPanel) {
          themeSettingsPanel.classList.toggle('is-hidden');
          // If we open settings, auto-switch to glass mode so user can see changes
          if (!themeSettingsPanel.classList.contains('is-hidden') && fabTheme !== 'glass') {
            fabTheme = 'glass';
            updateThemeUi();
            saveAndPersist();
          }
        }
      });
      updateThemeUi();
    }

    if (themeColorInput) {
      themeColorInput.addEventListener('input', (e) => {
        fabGlassColor = e.target.value;
        panel.style.setProperty('--glass-color', fabGlassColor);
      });
      themeColorInput.addEventListener('change', () => saveAndPersist());
    }

    themeOpacitySlider = initSlider(`${MODAL_ROOT_ID}-theme-opacity`, 0.1, 1.0, fabGlassOpacity, 0.05);
    if (themeOpacitySlider) {
      themeOpacitySlider.addEventListener('input', () => {
        fabGlassOpacity = themeOpacitySlider.value;
        panel.style.setProperty('--glass-opacity-pct', `${fabGlassOpacity * 100}%`);
      });
      themeOpacitySlider.addEventListener('change', () => saveAndPersist());
    }

    themeBlurSlider = initSlider(`${MODAL_ROOT_ID}-theme-blur`, 0, 40, fabGlassBlur, 1);
    if (themeBlurSlider) {
      themeBlurSlider.addEventListener('input', () => {
        fabGlassBlur = themeBlurSlider.value;
        panel.style.setProperty('--glass-blur', `${fabGlassBlur}px`);
      });
      themeBlurSlider.addEventListener('change', () => saveAndPersist());
    }

    if (accentColorInput) {
      accentColorInput.addEventListener('input', (e) => {
        fabAccentColor = e.target.value;
        panel.style.setProperty('--accent-color', fabAccentColor);
      });
      accentColorInput.addEventListener('change', () => saveAndPersist());
    }

    // --- Close button ---
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      isVisible = false;
      applyVisibility();
      saveAndPersist();
    });

    // --- Type Toggle ---
    typeToggle.addEventListener('click', () => {
      isCustomDice = !isCustomDice;
      generateCurrentRolls();
      refreshFabUi();
      saveAndPersist();
    });
    // --- Mouse Wheel for Inputs ---
    const bindWheelToInput = (el) => {
      let wheelTimeout = null;
      el.addEventListener('wheel', (e) => {
        e.preventDefault();
        const dir = e.deltaY < 0 ? 1 : -1;
        const current = Number(el.value) || 0;
        const min = Number(el.min) || 0;
        const max = Number(el.max) || 999;
        let next = current + dir;
        if (next < min) next = min;
        if (next > max) next = max;
        if (next !== current) {
          el.value = String(next);
          el.dispatchEvent(new Event('input'));
          
          if (wheelTimeout) clearTimeout(wheelTimeout);
          wheelTimeout = setTimeout(() => {
            el.dispatchEvent(new Event('change'));
          }, 150);
        }
      });
    };
    bindWheelToInput(customFacesInput);
    bindWheelToInput(customThresholdInput);
    bindWheelToInput(customExactFaceInput);

    // --- D6 Events ---
    countSlider.addEventListener('input', () => {
      fabDiceCount = Number(countSlider.value);
      fabSixCount = Math.min(fabSixCount, fabDiceCount);
      customExactCount = Math.min(customExactCount, fabDiceCount);
      customThresholdCount = Math.min(customThresholdCount, fabDiceCount);
      generateCurrentRolls();
      refreshFabUi();
      saveAndPersist();
      triggerPop(countValue);
    });

    sixSlider.addEventListener('input', () => {
      fabSixCount = Number(sixSlider.value);
      generateCurrentRolls();
      refreshFabUi();
      saveAndPersist();
      triggerPop(sixValue);
    });

    strictToggle.addEventListener('click', () => {
      fabStrict = !fabStrict;
      generateCurrentRolls();
      refreshFabUi();
      saveAndPersist();
    });


    const setCustomFaces = (val) => {
      customFaceCount = val;
      // Adjust threshold and exact face to be within new bounds
      if (customThreshold > customFaceCount) customThreshold = customFaceCount;
      if (customExactFace > customFaceCount) customExactFace = customFaceCount;
      generateCurrentRolls();
      refreshFabUi();
      saveAndPersist();
    };

    presetButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const val = Number(btn.getAttribute('data-faces'));
        // Smart behavior: if exact mode is selected, set exact face to maximum of this die
        customExactFace = val;
        setCustomFaces(val);
      });
    });

    customFacesInput.addEventListener('change', () => {
      let val = Number(customFacesInput.value);
      if (isNaN(val) || val < 4) val = 4;
      if (val > 99) val = 99;
      customFacesInput.value = String(val);
      setCustomFaces(val);
    });

    // --- Custom Mode Toggle Event ---
    customModeToggle.addEventListener('click', () => {
      customMode = customMode === 'threshold' ? 'exact' : 'threshold';
      generateCurrentRolls();
      refreshFabUi();
      saveAndPersist();
    });

    // --- Custom Threshold Events ---
    customThresholdInput.addEventListener('change', () => {
      let val = Number(customThresholdInput.value);
      if (isNaN(val) || val < 1) val = 1;
      if (val > customFaceCount) val = customFaceCount;
      customThreshold = val;
      customThresholdInput.value = String(val);
      generateCurrentRolls();
      refreshFabUi();
      saveAndPersist();
    });

    customThresholdCountSlider.addEventListener('input', () => {
      customThresholdCount = Number(customThresholdCountSlider.value);
      generateCurrentRolls();
      refreshFabUi();
      saveAndPersist();
      triggerPop(customThresholdCountValue);
    });

    directionToggle.addEventListener('click', () => {
      customDirection = customDirection === 'lte' ? 'gte' : 'lte';
      generateCurrentRolls();
      refreshFabUi();
      saveAndPersist();
    });

    // --- Custom Exact Events ---
    customExactFaceInput.addEventListener('change', () => {
      let val = Number(customExactFaceInput.value);
      if (isNaN(val) || val < 1) val = 1;
      if (val > customFaceCount) val = customFaceCount;
      customExactFace = val;
      customExactFaceInput.value = String(val);
      generateCurrentRolls();
      refreshFabUi();
      saveAndPersist();
    });

    customExactCountSlider.addEventListener('input', () => {
      customExactCount = Number(customExactCountSlider.value);
      generateCurrentRolls();
      refreshFabUi();
      saveAndPersist();
      triggerPop(customExactCountValue);
    });

    // --- Reroll Event ---
    rerollBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      generateCurrentRolls();
      refreshFabPreview();
      refreshGhost();
    });

    // --- Panel drag (header) ---
    let isPanelDragging = false;
    let panelDragOffX = 0;
    let panelDragOffY = 0;

    header.addEventListener('pointerdown', (e) => {
      const target = /** @type {HTMLElement} */ (e.target);
      if (target.closest('button')) return;
      if (e.button !== 0) return;

      isPanelDragging = true;
      panelDragOffX = e.clientX - panelX;
      panelDragOffY = e.clientY - panelY;

      header.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    header.addEventListener('pointermove', (e) => {
      if (!isPanelDragging) return;

      panelX = Math.max(0, e.clientX - panelDragOffX);
      panelY = Math.max(0, e.clientY - panelDragOffY);

      panel.style.left = `${panelX}px`;
      panel.style.top = `${panelY}px`;
    });

    header.addEventListener('pointerup', () => {
      if (!isPanelDragging) return;
      isPanelDragging = false;
      saveAndPersist();
      panel.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg)`;
      panel.style.transition = 'transform 0.4s ease-out';
    });

    // --- Mouse Glow Effect ---
    panel.addEventListener('mousemove', (e) => {
      const x = e.clientX - panelX;
      const y = e.clientY - panelY;
      panel.style.setProperty('--mouse-x', `${x}px`);
      panel.style.setProperty('--mouse-y', `${y}px`);
    });

    // --- Dice drag (drag area → board) ---
    let shakePoints = [];

    const startDiceDrag = (e) => {
      if (e.button !== 0) return;
      shakePoints = [];

      isDiceDragging = true;
      // ВАЖНО: Мы НЕ генерируем новые кубики при старте перетягивания, чтобы бросить именно то, что было показано на превью!
      diceBoardPoint = null;

      dragArea.classList.add('is-dragging');
      refreshGhost();
      ghost.classList.add('is-active');
      updateGhostPos(e.clientX, e.clientY);
      startGhostPolling();

      if (window.miro?.board) {
        void clientToBoardPoint(window.miro, e.clientX, e.clientY).then((pt) => {
          diceBoardPoint = pt;
        });
      }

      e.preventDefault();
    };

    const moveDiceDrag = (e) => {
      if (!isDiceDragging) return;
      dragMoved = true;
      updateGhostPos(e.clientX, e.clientY);

      if (window.miro?.board) {
        void clientToBoardPoint(window.miro, e.clientX, e.clientY).then((pt) => {
          diceBoardPoint = pt;
        });
      }
    };

    const endDiceDrag = () => {
      if (!isDiceDragging) return;

      isDiceDragging = false;
      dragArea.classList.remove('is-dragging');
      ghost.classList.remove('is-active');
      stopGhostPolling();

      if (!dragMoved) {
        dragMoved = false;
        return;
      }
      dragMoved = false;

      const doRoll = () => {
        if (!diceBoardPoint || fabDiceCount === 0) return;

        // Копируем текущие значения для анимации, чтобы мы могли сразу сгенерировать новые для превью
        const currentFabPerDie = [...fabPerDie];
        const currentFabFinalIndices = [...fabFinalIndices];
        const currentFabCustomFinalValues = [...fabCustomFinalValues];

        if (isCustomDice) {
          console.log(`[Miro Dice] Panel drag (Custom ${customFaceCount}) → ${currentFabCustomFinalValues.join(' ')}`);
        } else {
          const previewEls = preview.querySelectorAll('span');
          const faces = Array.from(previewEls, (el) => el.textContent ?? '');
          console.log(`[Miro Dice] Panel drag (d6) → ${faces.join(' ')}`);
        }

        void runDiceRollAnimation(
          fabDiceCount,
          currentFabPerDie,
          diceBoardPoint,
          fabStrict,
          currentFabFinalIndices,
          isCustomDice,
          customFaceCount,
          currentFabCustomFinalValues
        ).catch((err) => console.error('[Miro Dice] Drag roll error:', err));

        // Автоматический реролл для следующего броска
        generateCurrentRolls();
        refreshFabPreview();
        refreshGhost();
      };

      if (diceBoardPoint) {
        doRoll();
      } else if (window.miro?.board) {
        void clientToBoardPoint(window.miro, lastClientX ?? window.innerWidth / 2, lastClientY ?? window.innerHeight / 2).then((pt) => {
          if (pt) {
            diceBoardPoint = pt;
            doRoll();
          }
        });
      }
    };

    const cancelDiceDrag = () => {
      if (!isDiceDragging) return;
      isDiceDragging = false;
      dragMoved = false;
      dragArea.classList.remove('is-dragging');
      ghost.classList.remove('is-active');
      ghost.classList.remove('is-shaking');
      stopGhostPolling();
    };

    dragArea.addEventListener('pointerdown', startDiceDrag);

    // --- Interactive Mode Events ---
    preview.addEventListener('wheel', (e) => {
      if (!isInteractiveMode) return;
      const wrap = e.target.closest('.mdr-interactive-die-wrap');
      if (wrap) {
        e.preventDefault();
        const idx = parseInt(wrap.getAttribute('data-idx'), 10);
        const maxFaces = isCustomDice ? customFaceCount : 6;
        if (e.deltaY < 0) {
          interactiveValues[idx] = Math.min(maxFaces, interactiveValues[idx] + 1);
        } else {
          interactiveValues[idx] = Math.max(1, interactiveValues[idx] - 1);
        }
        triggerPop(wrap);
        if (isCustomDice) fabCustomFinalValues[idx] = interactiveValues[idx];
        else fabFinalIndices[idx] = interactiveValues[idx] - 1;
        refreshFabPreview();
        saveAndPersist();
      }
    }, { passive: false });

    preview.addEventListener('pointerdown', (e) => {
      if (!isInteractiveMode) return;
      const arrow = e.target.closest('.mdr-interactive-arrow');
      if (arrow) {
        e.stopPropagation(); // prevent drag
      }
    });

    preview.addEventListener('click', (e) => {
      if (!isInteractiveMode) return;
      const arrow = e.target.closest('.mdr-interactive-arrow');
      if (arrow) {
        e.stopPropagation();
        const wrap = arrow.closest('.mdr-interactive-die-wrap');
        const idx = parseInt(wrap.getAttribute('data-idx'), 10);
        const maxFaces = isCustomDice ? customFaceCount : 6;
        if (arrow.classList.contains('mdr-arrow-up')) {
          interactiveValues[idx] = Math.min(maxFaces, interactiveValues[idx] + 1);
        } else {
          interactiveValues[idx] = Math.max(1, interactiveValues[idx] - 1);
        }
        triggerPop(wrap);
        if (isCustomDice) fabCustomFinalValues[idx] = interactiveValues[idx];
        else fabFinalIndices[idx] = interactiveValues[idx] - 1;
        refreshFabPreview();
        saveAndPersist();
      }
    });

    if (intPlusBtn) {
      intPlusBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (fabDiceCount < MAX_DICE) {
          fabDiceCount++;
          const maxFaces = isCustomDice ? customFaceCount : 6;
          interactiveValues.push(Math.floor(Math.random() * maxFaces) + 1);
          if (isCustomDice) fabCustomFinalValues = [...interactiveValues];
          else fabFinalIndices = interactiveValues.map(v => v - 1);
          triggerPop(intPlusBtn);
          refreshFabUi();
          saveAndPersist();
        }
      });
    }

    if (intMinusBtn) {
      intMinusBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (fabDiceCount > MIN_DICE) {
          fabDiceCount--;
          interactiveValues.pop();
          if (isCustomDice) fabCustomFinalValues = [...interactiveValues];
          else fabFinalIndices = interactiveValues.map(v => v - 1);
          triggerPop(intMinusBtn);
          refreshFabUi();
          saveAndPersist();
        }
      });
    }
    document.addEventListener('pointermove', moveDiceDrag, { capture: true });
    document.addEventListener('pointerup', endDiceDrag, { capture: true });
    document.addEventListener('pointercancel', cancelDiceDrag, { capture: true });

    // Right-click to cancel drag
    document.addEventListener('contextmenu', (e) => {
      if (isDiceDragging) {
        e.preventDefault();
        e.stopPropagation();
        cancelDiceDrag();
      }
    }, { capture: true });

    // --- F9: show panel ---
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'F9') return;

      e.preventDefault();
      e.stopImmediatePropagation();

      isVisible = true;
      applyVisibility();
      saveAndPersist();
    }, { capture: true });

    // --- Prevent accidental script paste in Miro ---
    document.addEventListener('paste', (e) => {
      if (isDiceDragging || rollingCount > 0) {
        e.preventDefault();
        e.stopImmediatePropagation();
        console.log('[Miro Dice] Blocked accidental paste during dice roll/drag.');
      }
    }, { capture: true });

    // --- Initial state ---
    generateCurrentRolls();
    refreshFabUi();
  }

  // ============================================================
  //  INIT
  // ============================================================

  startCursorTracking();
  buildFloatingLauncher();

  console.log('[Miro Dice] Panel-only: F9 — показать панель');
})();
