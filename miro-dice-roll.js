// ==UserScript==
// @name         Miro Dice Roll (Unicode)
// @namespace    https://miro.com/
// @version      1.25.0
// @description  Бросок кубиков (⚀–⚅) на доске Miro
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
  const STORAGE_KEY_SETTINGS = 'miroDiceRollSettings';
  const STORAGE_KEY_FAB = 'miroDiceRollFab';
  const MODAL_ROOT_ID = 'miro-dice-roll-modal-root';
  const STYLE_ID = 'miro-dice-roll-styles';

  const DEFAULT_DICE_COUNT = 3;
  const MIN_DICE = 1;
  const MAX_DICE = 5;

  let isDialogOpen = false;
  let rollRequestInFlight = false;

  /** @type {{ x: number, y: number } | null} Последняя точка на доске (вне модалки) */
  let lastCursorBoardPoint = null;

  /** @type {{ x: number, y: number } | null} Зафиксирована при нажатии F8 */
  let rollAnchorPoint = null;

  /** Последние экранные координаты курсора */
  let lastClientX = null;
  let lastClientY = null;

  const VIEWPORT_CACHE_TTL = 500;
  /** @type {{ x: number, y: number, width: number, height: number } | null} */
  let cachedViewport = null;
  /** @type {number | null} */
  let cachedViewportTime = null;

  /**
   * @typedef {{ enabled: boolean, faceIndex: number }} DieSlotConfig
   * @typedef {'slots' | 'count'} SixPickMode
   * @typedef {{ diceCount: number, perDie: DieSlotConfig[], advancedOpen: boolean, sixPickMode: SixPickMode, sixCount: number, strictSixCount: boolean, panelVisible: boolean, panelX: number, panelY: number }} SavedSettings
   * @typedef {{ diceCount: number, perDie: DieSlotConfig[], advancedOpen: boolean, sixPickMode: SixPickMode, sixCount: number, strictSixCount: boolean }} RollConfig
   * @typedef {import('@mirohq/websdk-types').Text} MiroTextItem
   */

  /** @type {DieSlotConfig[]} */
  let activePerDie = createDefaultPerDie();

  /**
   * @returns {DieSlotConfig[]}
   */
  function createDefaultPerDie() {
    return Array.from({ length: MAX_DICE }, () => ({
      enabled: false,
      faceIndex: 0,
    }));
  }

  /**
   * @param {unknown} value
   * @returns {DieSlotConfig[]}
   */
  function normalizePerDie(value) {
    const base = createDefaultPerDie();

    if (!Array.isArray(value)) {
      return base;
    }

    for (let i = 0; i < MAX_DICE; i += 1) {
      const item = value[i];

      if (!item || typeof item !== 'object') {
        continue;
      }

      const faceIndex = Number.parseInt(item.faceIndex, 10);

      base[i] = {
        enabled: Boolean(item.enabled),
        faceIndex:
          Number.isNaN(faceIndex) || faceIndex < 0 || faceIndex > SIX_INDEX
            ? 0
            : faceIndex,
      };
    }

    return base;
  }

  /**
   * @returns {SavedSettings}
   */
  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_SETTINGS);

      if (!raw) {
        return {
          diceCount: DEFAULT_DICE_COUNT,
          perDie: createDefaultPerDie(),
          advancedOpen: false,
          sixPickMode: 'slots',
          sixCount: 0,
          strictSixCount: true,
        };
      }

      const parsed = JSON.parse(raw);
      const diceCount = Number.parseInt(parsed.diceCount, 10);
      const sixCountRaw = Number.parseInt(parsed.sixCount, 10);
      const sixPickMode = parsed.sixPickMode === 'count' ? 'count' : 'slots';
      const strictSixCount = Boolean(parsed.strictSixCount);
      const panelVisible = parsed.panelVisible === true;
      const panelXRaw = Number.parseFloat(parsed.panelX);
      const panelYRaw = Number.parseFloat(parsed.panelY);

      let perDie = normalizePerDie(parsed.perDie);
      const advancedOpen = Boolean(parsed.advancedOpen);

      if (!parsed.perDie && Array.isArray(parsed.forcedSixSlots)) {
        perDie = createDefaultPerDie();

        for (const slot of parsed.forcedSixSlots) {
          if (Number.isInteger(slot) && slot >= 0 && slot < MAX_DICE) {
            perDie[slot] = { enabled: true, faceIndex: SIX_INDEX };
          }
        }
      }

      return {
        diceCount:
          Number.isNaN(diceCount) || diceCount < MIN_DICE || diceCount > MAX_DICE
            ? DEFAULT_DICE_COUNT
            : diceCount,
        perDie,
        advancedOpen,
        sixPickMode,
        sixCount:
          Number.isNaN(sixCountRaw) || sixCountRaw < 0 || sixCountRaw > MAX_DICE
            ? 0
            : sixCountRaw,
        strictSixCount,
        panelVisible,
        panelX: Number.isNaN(panelXRaw) ? 24 : panelXRaw,
        panelY: Number.isNaN(panelYRaw) ? 24 : panelYRaw,
      };
    } catch {
      return {
        diceCount: DEFAULT_DICE_COUNT,
        perDie: createDefaultPerDie(),
        advancedOpen: false,
        sixPickMode: 'slots',
        sixCount: 0,
        strictSixCount: true,
        panelVisible: true,
        panelX: 24,
        panelY: 24,
      };
    }
  }

  /**
   * @param {number} diceCount
   * @param {DieSlotConfig[]} perDie
   * @param {boolean} advancedOpen
   * @param {SixPickMode} sixPickMode
   * @param {number} sixCount
   * @param {boolean} strictSixCount
   * @param {boolean} panelVisible
   * @param {number} panelX
   * @param {number} panelY
   */
  function saveSettings(diceCount, perDie, advancedOpen, sixPickMode, sixCount, strictSixCount, panelVisible, panelX, panelY) {
    const payload = {
      diceCount,
      advancedOpen,
      sixPickMode,
      sixCount: Math.max(0, Math.min(MAX_DICE, sixCount)),
      strictSixCount,
      panelVisible,
      panelX,
      panelY,
      perDie: perDie.map((slot, index) => {
        if (index >= diceCount) {
          return { enabled: false, faceIndex: slot.faceIndex };
        }

        return {
          enabled: slot.enabled,
          faceIndex: slot.faceIndex,
        };
      }),
    };

    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(payload));
  }

  /**
   * @returns {{ diceCount: number, sixCount: number, strictSixCount: boolean, panelVisible: boolean, panelX: number, panelY: number, previewShowResult: boolean }}
   */
  function loadFabSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_FAB);
      if (!raw) throw new Error('no raw');

      const p = JSON.parse(raw);
      const diceCount = Number.parseInt(p.diceCount, 10);
      const sixCount = Number.parseInt(p.sixCount, 10);
      const panelX = Number.parseFloat(p.panelX);
      const panelY = Number.parseFloat(p.panelY);

      return {
        diceCount:
          Number.isNaN(diceCount) || diceCount < MIN_DICE || diceCount > MAX_DICE
            ? DEFAULT_DICE_COUNT
            : diceCount,
        sixCount:
          Number.isNaN(sixCount) || sixCount < 0 || sixCount > MAX_DICE
            ? 0
            : sixCount,
        strictSixCount: p.strictSixCount !== false,
        panelVisible: p.panelVisible !== false,
        panelX: Number.isNaN(panelX) ? 24 : panelX,
        panelY: Number.isNaN(panelY) ? 24 : panelY,
        previewShowResult: p.previewShowResult === true,
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
      };
    }
  }

  /**
   * @param {number} diceCount
   * @param {number} sixCount
   * @param {boolean} strictSixCount
   * @param {boolean} panelVisible
   * @param {number} panelX
   * @param {number} panelY
   */
  function saveFabSettings(diceCount, sixCount, strictSixCount, panelVisible, panelX, panelY, previewShowResult) {
    localStorage.setItem(
      STORAGE_KEY_FAB,
      JSON.stringify({ diceCount, sixCount, strictSixCount, panelVisible, panelX, panelY, previewShowResult })
    );
  }

  /**
   * @param {DieSlotConfig[]} perDie
   * @param {number} diceCount
   * @param {boolean} advancedOpen
   * @param {SixPickMode} sixPickMode
   * @param {number} sixCount
   * @param {boolean} strictSixCount
   * @returns {string}
   */
  function formatConfigSummary(
    perDie,
    diceCount,
    advancedOpen,
    sixPickMode,
    sixCount,
    strictSixCount
  ) {
    if (!advancedOpen && sixPickMode === 'count') {
      const count = Math.min(sixCount, diceCount);

      if (count === 0) {
        return 'все случайные (1–6)';
      }

      if (strictSixCount) {
        return `⚅ × ${count} (случайные) · остальные только ⚀–⚄`;
      }

      return `⚅ × ≥${count} · остальные могут быть 1–6`;
    }

    const parts = [];

    for (let i = 0; i < diceCount; i += 1) {
      const slot = perDie[i];

      if (slot.enabled) {
        parts.push(`#${i + 1}=${faceByIndex(slot.faceIndex)}`);
      }
    }

    if (parts.length === 0) {
      return 'все случайные (1–6)';
    }

    if (!advancedOpen && hasForcedSixInRoll(diceCount, perDie)) {
      return `⚅: ${parts.join(', ')} · остальные только ⚀–⚄`;
    }

    return parts.join(', ');
  }

  /**
   * Случайно выбирает, какие кубики будут ⚅.
   * @param {number} diceCount
   * @param {number} sixCount
   * @returns {Set<number>}
   */
  function pickRandomSixPositions(diceCount, sixCount) {
    const count = Math.max(0, Math.min(diceCount, sixCount));
    const indices = Array.from({ length: diceCount }, (_, index) => index);

    for (let i = indices.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = indices[i];
      indices[i] = indices[j];
      indices[j] = temp;
    }

    return new Set(indices.slice(0, count));
  }

  /**
   * @param {number} diceCount
   * @param {SixPickMode} sixPickMode
   * @param {Set<number>} sixSlots
   * @param {number} sixCount
   * @returns {Set<number>}
   */
  function resolveSixSlotsForRoll(diceCount, sixPickMode, sixSlots, sixCount) {
    if (sixPickMode === 'count') {
      return pickRandomSixPositions(diceCount, sixCount);
    }

    return new Set([...sixSlots].filter((index) => index < diceCount));
  }

  /**
   * @param {DieSlotConfig[]} perDie
   * @param {number} diceCount
   * @returns {Set<number>}
   */
  function sixSlotsFromPerDie(perDie, diceCount) {
    const slots = new Set();

    for (let i = 0; i < diceCount; i += 1) {
      if (perDie[i]?.enabled && perDie[i].faceIndex === SIX_INDEX) {
        slots.add(i);
      }
    }

    return slots;
  }

  /**
   * Собирает perDie перед броском.
   * @param {number} diceCount
   * @param {DieSlotConfig[]} perDie
   * @param {boolean} advancedOpen
   * @param {Set<number>} resolvedSixSlots
   * @returns {DieSlotConfig[]}
   */
  function normalizePerDieForRoll(diceCount, perDie, advancedOpen, resolvedSixSlots) {
    const normalized = perDie.map((slot) => ({ ...slot }));

    if (advancedOpen) {
      for (let i = 0; i < MAX_DICE; i += 1) {
        if (i >= diceCount) {
          normalized[i].enabled = false;
        }
      }

      return normalized;
    }

    for (let i = 0; i < MAX_DICE; i += 1) {
      if (i < diceCount && resolvedSixSlots.has(i)) {
        normalized[i] = { enabled: true, faceIndex: SIX_INDEX };
      } else {
        normalized[i] = { enabled: false, faceIndex: 0 };
      }
    }

    return normalized;
  }

  function injectStyles() {
    const existing = document.getElementById(STYLE_ID);

    if (existing) {
      existing.remove();
    }

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      /* ====== F8 Modal ====== */
      #${MODAL_ROOT_ID} {
        position: fixed;
        inset: 0;
        z-index: 2147483646;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        font-family: "Inter", "Segoe UI", system-ui, sans-serif;
        pointer-events: auto;
      }

      #${MODAL_ROOT_ID} .mdr-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(12, 16, 28, 0.55);
        backdrop-filter: blur(4px);
        cursor: pointer;
      }

      #${MODAL_ROOT_ID} .mdr-card {
        position: relative;
        z-index: 1;
        width: min(480px, 100%);
        overflow: visible;
        border-radius: 16px;
        background: #fff;
        box-shadow: 0 24px 48px rgba(15, 23, 42, 0.22);
        padding: 18px;
        color: #0f172a;
      }

      #${MODAL_ROOT_ID} .mdr-title {
        margin: 0 0 4px;
        font-size: 20px;
        font-weight: 700;
      }

      #${MODAL_ROOT_ID} .mdr-subtitle {
        margin: 0 0 16px;
        font-size: 13px;
        color: #64748b;
      }

      #${MODAL_ROOT_ID} .mdr-label {
        margin: 0 0 8px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: #475569;
      }

      #${MODAL_ROOT_ID} .mdr-count-row,
      #${MODAL_ROOT_ID} .mdr-quick-row,
      #${MODAL_ROOT_ID} .mdr-mode-row {
        display: flex;
        gap: 8px;
        margin-bottom: 10px;
      }

      #${MODAL_ROOT_ID} .mdr-mode-btn {
        flex: 1;
        min-height: 34px;
        border: 2px solid #cbd5e1;
        border-radius: 8px;
        background: #fff;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        pointer-events: auto;
      }

      #${MODAL_ROOT_ID} .mdr-mode-btn.is-on {
        border-color: #4262ff;
        background: #eef2ff;
        color: #1d4ed8;
      }

      #${MODAL_ROOT_ID} .mdr-six-panel {
        margin-bottom: 10px;
      }

      #${MODAL_ROOT_ID} .mdr-label-sm {
        margin: 0 0 6px;
        font-size: 11px;
        font-weight: 600;
        color: #64748b;
      }

      #${MODAL_ROOT_ID} .mdr-chip {
        flex: 1;
        min-height: 42px;
        border: 2px solid #cbd5e1;
        border-radius: 10px;
        background: #fff;
        color: #334155;
        font-size: 16px;
        font-weight: 700;
        cursor: pointer;
        transition: 0.12s ease;
        pointer-events: auto;
      }

      #${MODAL_ROOT_ID} .mdr-chip.is-on {
        border-color: #4262ff;
        background: #eef2ff;
        color: #1d4ed8;
        box-shadow: 0 0 0 3px rgba(66, 98, 255, 0.2);
      }

      #${MODAL_ROOT_ID} .mdr-chip.is-six-on {
        border-color: #f59e0b;
        background: #fffbeb;
        color: #b45309;
        box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.25);
      }

      #${MODAL_ROOT_ID} .mdr-chip:disabled {
        opacity: 0.35;
        cursor: not-allowed;
      }

      #${MODAL_ROOT_ID} .mdr-advanced-toggle {
        width: 100%;
        min-height: 36px;
        margin-bottom: 10px;
        border: 2px dashed #cbd5e1;
        border-radius: 10px;
        background: #f8fafc;
        color: #475569;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        pointer-events: auto;
      }

      #${MODAL_ROOT_ID} .mdr-advanced-toggle.is-on {
        border-color: #4262ff;
        border-style: solid;
        background: #eef2ff;
        color: #1d4ed8;
      }

      #${MODAL_ROOT_ID} .mdr-advanced-wrap {
        display: none;
        margin-bottom: 10px;
      }

      #${MODAL_ROOT_ID} .mdr-advanced-wrap.is-open {
        display: block;
      }

      #${MODAL_ROOT_ID} .mdr-die-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      #${MODAL_ROOT_ID} .mdr-die-row {
        display: grid;
        grid-template-columns: 44px 72px 1fr;
        align-items: center;
        gap: 6px;
        padding: 4px 6px;
        border-radius: 8px;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
      }

      #${MODAL_ROOT_ID} .mdr-die-row.is-on {
        border-color: #93c5fd;
        background: #eff6ff;
      }

      #${MODAL_ROOT_ID} .mdr-die-title {
        font-size: 12px;
        font-weight: 700;
        color: #475569;
      }

      #${MODAL_ROOT_ID} .mdr-fix-btn {
        border: none;
        border-radius: 6px;
        padding: 4px 6px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        background: #e2e8f0;
        color: #334155;
        pointer-events: auto;
      }

      #${MODAL_ROOT_ID} .mdr-fix-btn.is-on {
        background: #4262ff;
        color: #fff;
      }

      #${MODAL_ROOT_ID} .mdr-face-row {
        display: grid;
        grid-template-columns: repeat(6, 1fr);
        gap: 4px;
      }

      #${MODAL_ROOT_ID} .mdr-face-btn {
        min-height: 30px;
        padding: 0;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        background: #fff;
        font-size: 17px;
        line-height: 1;
        cursor: pointer;
        pointer-events: auto;
      }

      #${MODAL_ROOT_ID} .mdr-face-btn:hover:not(:disabled) {
        border-color: #64748b;
      }

      #${MODAL_ROOT_ID} .mdr-face-btn.is-picked {
        border-color: #4262ff;
        background: #dbeafe;
        box-shadow: 0 0 0 2px rgba(66, 98, 255, 0.25);
      }

      #${MODAL_ROOT_ID} .mdr-face-btn:disabled {
        opacity: 0.35;
        cursor: not-allowed;
      }

      #${MODAL_ROOT_ID} .mdr-actions {
        display: flex;
        gap: 10px;
        justify-content: flex-end;
      }

      #${MODAL_ROOT_ID} .mdr-btn {
        min-width: 108px;
        height: 40px;
        border: none;
        border-radius: 10px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        pointer-events: auto;
      }

      #${MODAL_ROOT_ID} .mdr-btn-ghost { background: #f1f5f9; color: #475569; }
      #${MODAL_ROOT_ID} .mdr-btn-primary {
        background: linear-gradient(135deg, #4262ff, #3451d9);
        color: #fff;
      }

      /* ====== Floating Panel chip styles ====== */
      #${MODAL_ROOT_ID}-fab-chip {
        flex: 1;
        height: 32px;
        border: 1.5px solid #e2e8f0;
        border-radius: 7px;
        background: #fff;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        color: #475569;
        transition: border-color 0.13s, background 0.13s, color 0.13s;
      }

      #${MODAL_ROOT_ID}-fab-chip:hover:not(:disabled) {
        border-color: #94a3b8;
        color: #1e293b;
      }

      #${MODAL_ROOT_ID}-fab-chip:disabled {
        opacity: 0.35;
        cursor: not-allowed;
      }

      /* ====== Floating Panel ====== */
      #${MODAL_ROOT_ID}-panel {
        position: fixed;
        z-index: 2147483645;
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 14px;
        background: #fff;
        border-radius: 14px;
        box-shadow: 0 8px 32px rgba(15, 23, 42, 0.18), 0 0 0 1px rgba(0,0,0,0.06);
        width: 192px;
        font-family: "Inter", "Segoe UI", system-ui, sans-serif;
        user-select: none;
        cursor: default;
      }

      #${MODAL_ROOT_ID}-panel.is-hidden {
        display: none;
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

      #${MODAL_ROOT_ID}-panel-actions {
        display: flex;
        gap: 4px;
        flex-shrink: 0;
      }

      #${MODAL_ROOT_ID}-panel-collapse-btn,
      #${MODAL_ROOT_ID}-panel-close-btn {
        width: 22px;
        height: 22px;
        border: none;
        border-radius: 5px;
        background: #f1f5f9;
        color: #94a3b8;
        font-size: 11px;
        line-height: 1;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.12s, color 0.12s;
        padding: 0;
      }

      #${MODAL_ROOT_ID}-panel-collapse-btn:hover,
      #${MODAL_ROOT_ID}-panel-close-btn:hover {
        background: #e2e8f0;
        color: #475569;
      }

      #${MODAL_ROOT_ID}-panel-hide-btn {
        width: 22px;
        height: 22px;
        border: none;
        border-radius: 5px;
        background: #f1f5f9;
        color: #94a3b8;
        font-size: 12px;
        line-height: 1;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.12s, color 0.12s;
        flex-shrink: 0;
        padding: 0;
      }

      #${MODAL_ROOT_ID}-panel-hide-btn:hover {
        background: #e2e8f0;
        color: #475569;
      }

      #${MODAL_ROOT_ID}-panel .mdr-label {
        margin: 0 0 5px;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.07em;
        color: #64748b;
      }

      #${MODAL_ROOT_ID}-fab-row {
        display: flex;
        gap: 4px;
      }

      #${MODAL_ROOT_ID}-fab-count-row,
      #${MODAL_ROOT_ID}-fab-six-row {
        display: none;
      }

      #${MODAL_ROOT_ID}-fab-strict-row {
        display: none;
      }

      /* Slider row */
      .mdr-slider-wrap {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .mdr-slider {
        flex: 1;
        height: 4px;
        -webkit-appearance: none;
        appearance: none;
        background: #e2e8f0;
        border-radius: 4px;
        outline: none;
        cursor: pointer;
      }

      .mdr-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #4262ff;
        cursor: pointer;
        border: 2px solid #fff;
        box-shadow: 0 1px 4px rgba(66, 98, 255, 0.35);
        transition: transform 0.1s;
      }

      .mdr-slider::-webkit-slider-thumb:hover {
        transform: scale(1.15);
      }

      .mdr-slider::-moz-range-thumb {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #4262ff;
        cursor: pointer;
        border: 2px solid #fff;
        box-shadow: 0 1px 4px rgba(66, 98, 255, 0.35);
      }

      .mdr-slider-value {
        min-width: 20px;
        text-align: center;
        font-size: 13px;
        font-weight: 700;
        color: #1e293b;
      }

      /* Mode toggle row */
      .mdr-mode-wrap {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .mdr-mode-opt {
        font-size: 10px;
        font-weight: 600;
        color: #94a3b8;
        transition: color 0.13s;
        user-select: none;
      }

      .mdr-mode-opt.is-active {
        color: #1e293b;
      }

      .mdr-toggle {
        flex-shrink: 0;
        width: 36px;
        height: 20px;
        border-radius: 10px;
        border: none;
        background: #e2e8f0;
        cursor: pointer;
        position: relative;
        transition: background 0.15s;
        padding: 0;
      }

      .mdr-toggle::after {
        content: '';
        position: absolute;
        top: 2px;
        left: 2px;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #fff;
        box-shadow: 0 1px 3px rgba(0,0,0,0.18);
        transition: transform 0.15s;
      }

      .mdr-toggle.is-on {
        background: #4262ff;
      }

      .mdr-toggle.is-on::after {
        transform: translateX(16px);
      }

      /* Preview row — unified drag + preview block */
      #${MODAL_ROOT_ID}-preview-row {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1.5px solid #4262ff;
        border-radius: 11px;
        background: #f0f4ff;
        user-select: none;
        padding-top: 6px;
      }

      #${MODAL_ROOT_ID}-drag-area {
        display: flex;
        align-items: center;
        justify-content: center;
        flex: 1;
        padding: 12px 8px;
        cursor: grab;
        transition: background 0.14s;
        border-radius: 9px;
      }

      #${MODAL_ROOT_ID}-drag-area:hover {
        background: rgba(66, 98, 255, 0.06);
      }

      #${MODAL_ROOT_ID}-drag-area.is-dragging {
        cursor: grabbing;
        background: rgba(66, 98, 255, 0.1);
      }

      #${MODAL_ROOT_ID}-drag-preview {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
      }

      /* Preview row buttons — top corners, minimal */
      #${MODAL_ROOT_ID}-preview-toggle-btn,
      #${MODAL_ROOT_ID}-reroll-btn {
        position: absolute;
        top: 6px;
        width: 24px;
        height: 24px;
        border: none;
        background: transparent;
        color: #94a3b8;
        font-size: 14px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        transition: color 0.13s;
        line-height: 1;
      }

      #${MODAL_ROOT_ID}-preview-toggle-btn {
        left: 6px;
      }

      #${MODAL_ROOT_ID}-reroll-btn {
        right: 6px;
      }

      #${MODAL_ROOT_ID}-preview-toggle-btn:hover,
      #${MODAL_ROOT_ID}-reroll-btn:hover {
        color: #4262ff;
      }

      #${MODAL_ROOT_ID}-preview-toggle-btn.is-on {
        color: #4262ff;
      }

      /* Ghost dice following cursor during drag */
      #${MODAL_ROOT_ID}-ghost {
        position: fixed;
        pointer-events: none;
        z-index: 2147483647;
        display: none;
        transform: translate(-50%, -50%);
        filter: drop-shadow(0 4px 12px rgba(0,0,0,0.3));
      }

      #${MODAL_ROOT_ID}-ghost.is-active {
        display: flex;
      }

      #${MODAL_ROOT_ID}-ghost-inner {
        display: flex;
        gap: -12px;
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * @returns {Promise<RollConfig | null>}
   */
  function showRollDialog() {
    return new Promise((resolve) => {
      if (isDialogOpen) {
        resolve(null);
        return;
      }

      injectStyles();
      isDialogOpen = true;

      /** @type {HTMLElement | null} */
      let root = null;

      const saved = loadSettings();
      let diceCount = saved.diceCount;
      let advancedOpen = saved.advancedOpen;
      /** @type {DieSlotConfig[]} */
      const perDie = saved.perDie.map((slot) => ({ ...slot }));
      /** @type {Set<number>} Кубики с ⚅ в конце (базовый режим) */
      let sixSlots = sixSlotsFromPerDie(perDie, diceCount);

      root = document.createElement('div');
      root.id = MODAL_ROOT_ID;

      root.innerHTML = `
        <div class="mdr-backdrop" tabindex="-1"></div>
        <div class="mdr-card">
          <h2 class="mdr-title">Бросок кубиков</h2>
          <p class="mdr-subtitle">Esc — отмена · Enter — бросить</p>

          <p class="mdr-label">Количество кубиков</p>
          <div class="mdr-count-row" id="mdr-count-row"></div>

          <div id="mdr-basic-block">
            <p class="mdr-label">Шестёрки ⚅ в конце</p>
            <div class="mdr-mode-row" id="mdr-six-mode-row">
              <button type="button" class="mdr-mode-btn" data-six-mode="slots">Какие кубики</button>
              <button type="button" class="mdr-mode-btn" data-six-mode="count">Сколько ⚅</button>
            </div>
            <div class="mdr-six-panel" id="mdr-six-slots-panel">
              <p class="mdr-label-sm">Отметьте кубики (#1–#5)</p>
              <div class="mdr-quick-row" id="mdr-quick-row"></div>
            </div>
            <div class="mdr-six-panel" id="mdr-six-count-panel" hidden>
              <p class="mdr-label-sm">Сколько кубиков будут ⚅</p>
              <div class="mdr-quick-row" id="mdr-six-count-row"></div>
              <p class="mdr-label-sm" style="margin-top:8px">Правило для остальных</p>
              <div class="mdr-mode-row" id="mdr-strict-row">
                <button type="button" class="mdr-mode-btn" data-strict="true">Только 1–5</button>
                <button type="button" class="mdr-mode-btn" data-strict="false">Могут быть любые</button>
              </div>
            </div>
          </div>

          <button type="button" class="mdr-advanced-toggle" id="mdr-advanced-toggle">
            Дополнительные параметры: выкл
          </button>

          <div class="mdr-advanced-wrap" id="mdr-advanced-wrap">
            <p class="mdr-label">Грань в конце для каждого кубика</p>
            <div class="mdr-die-list" id="mdr-die-list"></div>
          </div>

          <div class="mdr-actions">
            <button type="button" class="mdr-btn mdr-btn-ghost" id="mdr-cancel">Отмена</button>
            <button type="button" class="mdr-btn mdr-btn-primary" id="mdr-confirm">Бросить</button>
          </div>
        </div>
      `;

      const backdrop = root.querySelector('.mdr-backdrop');
      const card = root.querySelector('.mdr-card');
      const countRow = root.querySelector('#mdr-count-row');
      const basicBlock = root.querySelector('#mdr-basic-block');
      const quickRow = root.querySelector('#mdr-quick-row');
      const sixModeRow = root.querySelector('#mdr-six-mode-row');
      const sixSlotsPanel = root.querySelector('#mdr-six-slots-panel');
      const sixCountPanel = root.querySelector('#mdr-six-count-panel');
      const sixCountRow = root.querySelector('#mdr-six-count-row');
      const strictRow = root.querySelector('#mdr-strict-row');
      const strictButtons = [...strictRow.querySelectorAll('.mdr-mode-btn')];
      const advancedToggle = root.querySelector('#mdr-advanced-toggle');
      const advancedWrap = root.querySelector('#mdr-advanced-wrap');
      const dieList = root.querySelector('#mdr-die-list');
      const cancelBtn = root.querySelector('#mdr-cancel');
      const confirmBtn = root.querySelector('#mdr-confirm');

      /** @type {HTMLButtonElement[]} */
      const countButtons = [];
      /** @type {HTMLButtonElement[]} */
      const quickButtons = [];
      /** @type {HTMLButtonElement[]} */
      const sixCountButtons = [];
      /** @type {HTMLButtonElement[]} */
      const sixModeButtons = [...sixModeRow.querySelectorAll('.mdr-mode-btn')];
      let sixPickMode = saved.sixPickMode;
      let sixCount = Math.min(saved.sixCount, diceCount);
      let strictSixCount = saved.strictSixCount;
      /** @type {{ slotIndex: number, row: HTMLElement, fixBtn: HTMLButtonElement, faceButtons: HTMLButtonElement[] }[]} */
      let dieRows = [];
      let advancedRowsBuiltFor = -1;
      let sixCountButtonsBuiltFor = -1;

      for (let n = MIN_DICE; n <= MAX_DICE; n += 1) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mdr-chip';
        btn.textContent = String(n);
        btn.setAttribute('data-count', String(n));
        countButtons.push(btn);
        countRow.appendChild(btn);
      }

      for (let i = 0; i < MAX_DICE; i += 1) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mdr-chip';
        btn.innerHTML = `<span>#${i + 1}</span><br><span style="font-size:22px">\u2685</span>`;
        btn.setAttribute('data-quick-six', String(i));
        quickButtons.push(btn);
        quickRow.appendChild(btn);
      }

      const rebuildSixCountButtons = () => {
        sixCountRow.replaceChildren();
        sixCountButtons.length = 0;

        for (let n = 0; n <= diceCount; n += 1) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'mdr-chip';
          btn.textContent = String(n);
          btn.setAttribute('data-six-count', String(n));
          sixCountButtons.push(btn);
          sixCountRow.appendChild(btn);
        }

        sixCountButtonsBuiltFor = diceCount;
      };

      const rebuildAdvancedRows = () => {
        dieList.replaceChildren();
        dieRows = [];

        for (let i = 0; i < diceCount; i += 1) {
          const row = document.createElement('div');
          row.className = 'mdr-die-row';
          row.setAttribute('data-die-row', String(i));

          const title = document.createElement('span');
          title.className = 'mdr-die-title';
          title.textContent = `#${i + 1}`;

          const fixBtn = document.createElement('button');
          fixBtn.type = 'button';
          fixBtn.className = 'mdr-fix-btn';
          fixBtn.textContent = 'Выкл';
          fixBtn.setAttribute('data-toggle-fix', String(i));

          const faceRow = document.createElement('div');
          faceRow.className = 'mdr-face-row';

          /** @type {HTMLButtonElement[]} */
          const faceButtons = [];

          for (let f = 0; f < DICE_FACES.length; f += 1) {
            const faceBtn = document.createElement('button');
            faceBtn.type = 'button';
            faceBtn.className = 'mdr-face-btn';
            faceBtn.textContent = DICE_FACES[f];
            faceBtn.setAttribute('data-slot', String(i));
            faceBtn.setAttribute('data-face', String(f));
            faceButtons.push(faceBtn);
            faceRow.appendChild(faceBtn);
          }

          row.appendChild(title);
          row.appendChild(fixBtn);
          row.appendChild(faceRow);
          dieList.appendChild(row);

          dieRows.push({ slotIndex: i, row, fixBtn, faceButtons });
        }
      };

      const closeDialog = (result) => {
        isDialogOpen = false;
        document.removeEventListener('keydown', onKeyDown, true);
        root?.remove();
        resolve(result);
      };

      const refreshUi = () => {
        for (const btn of countButtons) {
          btn.classList.toggle('is-on', Number(btn.getAttribute('data-count')) === diceCount);
        }

        advancedToggle.classList.toggle('is-on', advancedOpen);
        advancedToggle.textContent = advancedOpen
          ? 'Дополнительные параметры: вкл'
          : 'Дополнительные параметры: выкл';

        advancedWrap.classList.toggle('is-open', advancedOpen);
        basicBlock.style.display = advancedOpen ? 'none' : 'block';

        if (advancedOpen) {
          if (advancedRowsBuiltFor !== diceCount) {
            rebuildAdvancedRows();
            advancedRowsBuiltFor = diceCount;
          }

          for (const { slotIndex, row, fixBtn, faceButtons } of dieRows) {
            const slot = perDie[slotIndex];

            row.classList.toggle('is-on', slot.enabled);
            fixBtn.classList.toggle('is-on', slot.enabled);
            fixBtn.textContent = slot.enabled ? 'Вкл' : 'Выкл';

            for (let f = 0; f < faceButtons.length; f += 1) {
              const faceBtn = faceButtons[f];
              const canPick = slot.enabled;
              faceBtn.disabled = !canPick;
              faceBtn.classList.toggle('is-picked', canPick && slot.faceIndex === f);
            }
          }
        } else {
          advancedRowsBuiltFor = -1;
          sixCount = Math.min(sixCount, diceCount);

          for (const btn of sixModeButtons) {
            const mode = btn.getAttribute('data-six-mode');
            btn.classList.toggle('is-on', mode === sixPickMode);
          }

          sixSlotsPanel.hidden = sixPickMode !== 'slots';
          sixCountPanel.hidden = sixPickMode !== 'count';

          for (const btn of strictButtons) {
            const val = btn.getAttribute('data-strict');
            btn.classList.toggle('is-on', val === String(strictSixCount));
          }

          if (sixCountButtonsBuiltFor !== diceCount) {
            rebuildSixCountButtons();
          }

          for (const btn of sixCountButtons) {
            const value = Number.parseInt(btn.getAttribute('data-six-count') ?? '', 10);
            btn.classList.toggle('is-on', value === sixCount);
          }

          for (let i = 0; i < MAX_DICE; i += 1) {
            const inRoll = i < diceCount;
            const quickBtn = quickButtons[i];

            quickBtn.disabled = !inRoll;
            quickBtn.classList.toggle('is-six-on', inRoll && sixSlots.has(i));

            if (!inRoll) {
              sixSlots.delete(i);
            }
          }
        }
      };

      const onCardClick = (event) => {
        event.stopPropagation();

        const target = event.target;

        if (!(target instanceof HTMLElement)) {
          return;
        }

        const button = target.closest('button');

        if (!button || button.disabled) {
          return;
        }

        if (button.hasAttribute('data-count')) {
          diceCount = Number.parseInt(button.getAttribute('data-count') ?? '', 10);
          sixCount = Math.min(sixCount, diceCount);
          refreshUi();
          return;
        }

        if (button.hasAttribute('data-six-mode')) {
          const nextMode =
            button.getAttribute('data-six-mode') === 'count' ? 'count' : 'slots';
          sixPickMode = nextMode;

          if (nextMode === 'count' && sixSlots.size > 0) {
            sixCount = Math.min(sixSlots.size, diceCount);
          }

          refreshUi();
          return;
        }

        if (!advancedOpen && button.hasAttribute('data-six-count')) {
          sixCount = Number.parseInt(button.getAttribute('data-six-count') ?? '', 10);
          refreshUi();
          return;
        }

        if (!advancedOpen && button.hasAttribute('data-strict')) {
          strictSixCount = button.getAttribute('data-strict') === 'true';
          refreshUi();
          return;
        }

        if (button.id === 'mdr-advanced-toggle') {
          advancedOpen = !advancedOpen;

          if (advancedOpen) {
            advancedRowsBuiltFor = -1;
          }

          refreshUi();
          return;
        }

        if (!advancedOpen && button.hasAttribute('data-quick-six')) {
          const slotIndex = Number.parseInt(
            button.getAttribute('data-quick-six') ?? '',
            10
          );

          if (sixSlots.has(slotIndex)) {
            sixSlots.delete(slotIndex);
          } else {
            sixSlots.add(slotIndex);
          }

          refreshUi();
          return;
        }

        if (button.hasAttribute('data-toggle-fix')) {
          const slotIndex = Number.parseInt(
            button.getAttribute('data-toggle-fix') ?? '',
            10
          );
          perDie[slotIndex].enabled = !perDie[slotIndex].enabled;
          refreshUi();
          return;
        }

        if (
          button.hasAttribute('data-face') &&
          button.hasAttribute('data-slot')
        ) {
          const slotIndex = Number.parseInt(
            button.getAttribute('data-slot') ?? '',
            10
          );
          const faceIndex = Number.parseInt(
            button.getAttribute('data-face') ?? '',
            10
          );

          perDie[slotIndex].enabled = true;
          perDie[slotIndex].faceIndex = faceIndex;
          refreshUi();
        }
      };

      backdrop.addEventListener('click', () => closeDialog(null));
      card.addEventListener('click', onCardClick);
      const submitRoll = () => {
        const resolvedSixSlots = resolveSixSlotsForRoll(
          diceCount,
          sixPickMode,
          sixSlots,
          sixCount
        );

        const normalizedPerDie = normalizePerDieForRoll(
          diceCount,
          perDie,
          advancedOpen,
          resolvedSixSlots
        );

        const config = {
          diceCount,
          perDie: normalizedPerDie,
          advancedOpen,
          sixPickMode,
          sixCount,
          strictSixCount,
        };

        saveSettings(
          config.diceCount,
          config.perDie,
          config.advancedOpen,
          config.sixPickMode,
          config.sixCount,
          config.strictSixCount
        );
        closeDialog(config);
      };

      cancelBtn.addEventListener('click', () => closeDialog(null));
      confirmBtn.addEventListener('click', submitRoll);

      const onKeyDown = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopImmediatePropagation();
          closeDialog(null);
          return;
        }

        if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.altKey) {
          event.preventDefault();
          event.stopImmediatePropagation();
          submitRoll();
        }
      };

      document.addEventListener('keydown', onKeyDown, true);
      document.body.appendChild(root);
      refreshUi();
      confirmBtn.focus();
    });
  }

  /**
   * Фиксирует точку броска по курсору в момент нажатия F8 (до окна настроек).
   * @returns {Promise<{ x: number, y: number } | null>}
   */
  async function captureRollAnchor() {
    rollAnchorPoint = null;

    if (typeof window.miro === 'undefined' || !window.miro?.board) {
      if (lastCursorBoardPoint) {
        rollAnchorPoint = { ...lastCursorBoardPoint };
      }

      return rollAnchorPoint;
    }

    if (lastClientX !== null && lastClientY !== null) {
      const fresh = await clientToBoardPoint(
        window.miro,
        lastClientX,
        lastClientY
      );

      if (fresh) {
        rollAnchorPoint = fresh;
        return rollAnchorPoint;
      }
    }

    if (lastCursorBoardPoint) {
      rollAnchorPoint = { ...lastCursorBoardPoint };
      return rollAnchorPoint;
    }

    const viewport = await getCachedViewport();
    if (viewport) {
      rollAnchorPoint = {
        x: viewport.x + viewport.width / 2,
        y: viewport.y + viewport.height / 2,
      };
    }

    return rollAnchorPoint;
  }

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

  /**
   * Случайная грань 1–5 (без ⚅).
   * @returns {number}
   */
  function randomDieIndexExcludingSix() {
    return Math.floor(Math.random() * SIX_INDEX);
  }

  function faceByIndex(index) {
    return DICE_FACES[index] ?? DICE_FACES[0];
  }

  /**
   * @param {number} diceCount
   * @param {number} sixCount
   * @returns {DieSlotConfig[]}
   */
  function buildPerDieForFab(diceCount, sixCount) {
    const resolvedSixSlots = pickRandomSixPositions(diceCount, sixCount);
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

  /**
   * Есть ли в броске кубик с принудительной шестёркой в финале.
   * @param {number} diceCount
   * @param {DieSlotConfig[]} perDie
   * @returns {boolean}
   */
  function hasForcedSixInRoll(diceCount, perDie) {
    for (let i = 0; i < diceCount; i += 1) {
      const slot = perDie[i];

      if (slot?.enabled && slot.faceIndex === SIX_INDEX) {
        return true;
      }
    }

    return false;
  }

  /**
   * @param {number} diceCount
   * @param {DieSlotConfig[]} perDie
   * @param {boolean} strictSixCount
   * @returns {number[]}
   */
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

  function getRowWidth(diceCount) {
    return diceCount * DICE_BLOCK_WIDTH + (diceCount - 1) * DICE_GAP;
  }

  function getDieBlockPosition(anchorX, anchorY, dieIndex, diceCount) {
    return {
      x: anchorX + dieIndex * (DICE_BLOCK_WIDTH + DICE_GAP),
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

  /**
   * Returns a cached viewport, refreshing it no more than once per VIEWPORT_CACHE_TTL ms.
   * Falls back to null if the Miro API call fails.
   * @returns {Promise<{ x: number, y: number, width: number, height: number } | null>}
   */
  async function getCachedViewport() {
    const now = Date.now();
    if (cachedViewport && cachedViewportTime && now - cachedViewportTime < VIEWPORT_CACHE_TTL) {
      return cachedViewport;
    }
    try {
      cachedViewport = await window.miro.board.viewport.get();
      cachedViewportTime = now;
      return cachedViewport;
    } catch {
      return cachedViewport; // return stale cache on error
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

  /**
   * @param {PointerEvent} event
   */
  function trackPointerPosition(event) {
    lastClientX = event.clientX;
    lastClientY = event.clientY;

    if (isDialogOpen) {
      return;
    }

    if (typeof window.miro === 'undefined' || !window.miro?.board) {
      return;
    }

    void clientToBoardPoint(window.miro, event.clientX, event.clientY).then(
      (point) => {
        if (point && !isDialogOpen) {
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

  /**
   * @param {typeof miro} miroSdk
   * @param {{ x: number, y: number } | null} anchorPoint
   * @returns {Promise<{ x: number, y: number }>}
   */
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

  async function spawnDiceBlocksSequentially(
    miroSdk,
    diceCount,
    anchorPoint,
    initialIndices
  ) {
    /** @type {MiroTextItem[]} */
    const widgets = [];

    for (let i = 0; i < diceCount; i += 1) {
      if (i > 0) {
        await sleep(SPAWN_DELAY_MS);
      }

      const { x, y } = getDieBlockPosition(
        anchorPoint.x,
        anchorPoint.y,
        i,
        diceCount
      );

      widgets.push(await createDieTextBlock(miroSdk, initialIndices[i], x, y));
    }

    return widgets;
  }

  async function runSequentialSpinAnimation(widgets, finalIndices) {
    const diceCount = widgets.length;
    const displayIndices = Array.from({ length: diceCount }, () => randomDieIndex());
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
        displayIndices[dieIndex] = randomDieIndex();
        spinChangesDone[dieIndex] += 1;
      } else {
        displayIndices[dieIndex] = finalIndices[dieIndex];
        frozen[dieIndex] = true;
      }

      await updateDieBlock(widgets[dieIndex], displayIndices[dieIndex]);

      cyclePointer += 1;
      safetyTicks += 1;
      await sleep(SPIN_INTERVAL_MS);
    }
  }

  /**
   * @param {number} diceCount
   * @param {DieSlotConfig[]} perDie
   * @param {{ x: number, y: number } | null} anchorPoint
   * @param {boolean} advancedOpen
   * @param {SixPickMode} sixPickMode
   * @param {number} sixCount
   * @param {boolean} strictSixCount
   */
  async function runDiceRollAnimation(
    diceCount,
    perDie,
    anchorPoint,
    advancedOpen,
    sixPickMode,
    sixCount,
    strictSixCount,
    finalIndicesOverride
  ) {
    const miroSdk = await waitForMiroSdk();
    const groupCenter = await resolveGroupCenter(miroSdk, anchorPoint);
    const finalIndices = finalIndicesOverride ?? buildFinalIndices(diceCount, perDie, strictSixCount);
    const initialIndices = Array.from({ length: diceCount }, () => randomDieIndex());

    const widgets = await spawnDiceBlocksSequentially(
      miroSdk,
      diceCount,
      groupCenter,
      initialIndices
    );

    await runSequentialSpinAnimation(widgets, finalIndices);

    console.log(
      `[Miro Dice] ${finalIndices.map((i) => faceByIndex(i)).join('  ')}`
    );
  }

  async function handleRollKey() {
    if (rollRequestInFlight) {
      console.log('[Miro Dice] Диалог уже открыт…');
      return;
    }

    rollRequestInFlight = true;

    try {
      await captureRollAnchor();

      const config = await showRollDialog();

      if (!config) {
        console.log('[Miro Dice] Бросок отменён');
        return;
      }

      activePerDie = config.perDie.map((slot) => ({ ...slot }));

      void runDiceRollAnimation(
        config.diceCount,
        activePerDie,
        rollAnchorPoint,
        config.advancedOpen,
        config.sixPickMode,
        config.sixCount,
        config.strictSixCount
      ).catch((error) => {
        console.error('[Miro Dice] Ошибка броска:', error);
      });
    } finally {
      rollRequestInFlight = false;
    }
  }

  function registerHotkeys() {
    document.addEventListener(
      'keydown',
      (event) => {
        if (event.key !== 'F8') {
          return;
        }

        if (isDialogOpen && !document.getElementById(MODAL_ROOT_ID)) {
          isDialogOpen = false;
        }

        if (isDialogOpen || rollRequestInFlight) {
          return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();
        void handleRollKey();
      },
      { capture: true }
    );

    console.log('[Miro Dice] F8 — бросок (точка = курсор до F8)');
  }

  // ============================================================
  //  FLOATING PANEL (drag-to-board)
  // ============================================================

  function buildFloatingLauncher() {
    injectStyles();

    const saved = loadFabSettings();

    // --- Panel DOM ---
    const panel = document.createElement('div');
    panel.id = `${MODAL_ROOT_ID}-panel`;
    panel.innerHTML = `
      <div id="${MODAL_ROOT_ID}-panel-header">
        <span id="${MODAL_ROOT_ID}-panel-title">Бросок кубиков</span>
        <button type="button" id="${MODAL_ROOT_ID}-panel-close-btn" title="Закрыть">✕</button>
      </div>

      <p class="mdr-label">Количество</p>
      <div class="mdr-slider-wrap">
        <input type="range" class="mdr-slider" id="${MODAL_ROOT_ID}-fab-count-slider" min="${MIN_DICE}" max="${MAX_DICE}" value="${saved.diceCount}">
        <span class="mdr-slider-value" id="${MODAL_ROOT_ID}-fab-count-value">${saved.diceCount}</span>
      </div>

      <p class="mdr-label">Шестёрки</p>
      <div class="mdr-slider-wrap">
        <input type="range" class="mdr-slider" id="${MODAL_ROOT_ID}-fab-six-slider" min="0" max="${saved.diceCount}" value="${saved.sixCount ?? 0}">
        <span class="mdr-slider-value" id="${MODAL_ROOT_ID}-fab-six-value">${saved.sixCount ?? 0}</span>
      </div>

      <p class="mdr-label">Остальные</p>
      <div class="mdr-mode-wrap">
        <span class="mdr-mode-opt" id="${MODAL_ROOT_ID}-fab-mode-1-5">Только 1–5</span>
        <button type="button" class="mdr-toggle" id="${MODAL_ROOT_ID}-fab-strict-toggle"></button>
        <span class="mdr-mode-opt" id="${MODAL_ROOT_ID}-fab-mode-1-6">Могут быть 1–6</span>
      </div>

      <div id="${MODAL_ROOT_ID}-preview-row">
        <button type="button" id="${MODAL_ROOT_ID}-preview-toggle-btn" title="Показать итог">
          <span id="${MODAL_ROOT_ID}-preview-toggle-icon">&#x25CB;</span>
        </button>
        <div id="${MODAL_ROOT_ID}-drag-area">
          <div id="${MODAL_ROOT_ID}-drag-preview"></div>
        </div>
        <button type="button" id="${MODAL_ROOT_ID}-reroll-btn" title="Новая комбинация">&#x27F3;</button>
      </div>
    `;

    document.body.appendChild(panel);

    const preview = panel.querySelector(`#${MODAL_ROOT_ID}-drag-preview`);
    const dragArea = panel.querySelector(`#${MODAL_ROOT_ID}-drag-area`);
    const rerollBtn = panel.querySelector(`#${MODAL_ROOT_ID}-reroll-btn`);
    const header = panel.querySelector(`#${MODAL_ROOT_ID}-panel-header`);
    const closeBtn = panel.querySelector(`#${MODAL_ROOT_ID}-panel-close-btn`);

    const countSlider = /** @type {HTMLInputElement} */ (panel.querySelector(`#${MODAL_ROOT_ID}-fab-count-slider`));
    const countValue = panel.querySelector(`#${MODAL_ROOT_ID}-fab-count-value`);
    const sixSlider = /** @type {HTMLInputElement} */ (panel.querySelector(`#${MODAL_ROOT_ID}-fab-six-slider`));
    const sixValue = panel.querySelector(`#${MODAL_ROOT_ID}-fab-six-value`);
    const strictToggle = panel.querySelector(`#${MODAL_ROOT_ID}-fab-strict-toggle`);
    const mode15Label = panel.querySelector(`#${MODAL_ROOT_ID}-fab-mode-1-5`);
    const mode16Label = panel.querySelector(`#${MODAL_ROOT_ID}-fab-mode-1-6`);

    let fabDiceCount = saved.diceCount;
    let fabSixCount = Math.max(0, Math.min(saved.sixCount ?? 0, fabDiceCount));
    let fabStrict = saved.strictSixCount;
    let fabPreviewShowResult = saved.previewShowResult ?? false;
    let panelX = saved.panelX;
    let panelY = saved.panelY;
    let isVisible = saved.panelVisible;

    // Update toggle visual state
    const refreshToggleState = () => {
      if (fabStrict) {
        strictToggle.classList.remove('is-on');
        mode15Label.classList.add('is-active');
        mode16Label.classList.remove('is-active');
      } else {
        strictToggle.classList.add('is-on');
        mode15Label.classList.remove('is-active');
        mode16Label.classList.add('is-active');
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
      refreshFabPreview();
      saveAndPersist();
    });

    // --- Dice drag state ---
    let isDiceDragging = false;
    let dragMoved = false;
    /** @type {{ x: number, y: number } | null} */
    let diceBoardPoint = null;
    /** @type {DieSlotConfig[]} */
    let fabPerDie = buildPerDieForFab(saved.diceCount, saved.sixCount ?? 0);
    /** @type {number[]} */
    let fabFinalIndices = buildFinalIndices(saved.diceCount, fabPerDie, saved.strict);

    /**
     * Converts a board coordinate to screen (client) coordinates.
     * @param {{ x: number, y: number }} boardPoint
     * @param {{ width: number, height: number }} viewport
     * @param {DOMRect} canvasRect
     * @returns {{ x: number, y: number }}
     */
    const boardToScreen = (boardPoint, viewport, canvasRect) => {
      const relX = (boardPoint.x - viewport.x) / viewport.width;
      const relY = (boardPoint.y - viewport.y) / viewport.height;
      return {
        x: canvasRect.left + relX * canvasRect.width,
        y: canvasRect.top + relY * canvasRect.height,
      };
    };

    let diceScreenX = 0;
    let diceScreenY = 0;

    // --- Ghost element ---
    const ghost = document.createElement('div');
    ghost.id = `${MODAL_ROOT_ID}-ghost`;

    const ghostInner = document.createElement('div');
    ghostInner.id = `${MODAL_ROOT_ID}-ghost-inner`;
    ghost.appendChild(ghostInner);
    document.body.appendChild(ghost);

    const refreshGhost = () => {
      const faces = fabFinalIndices.map((i) => faceByIndex(i));
      ghostInner.innerHTML = faces
        .map((f) => `<span style="font-size:54px;line-height:1;display:inline-block">${f}</span>`)
        .join('');
    };

    const GHOST_OFFSETS = {
      1: 0,
      2: 23,
      3: 43,
      4: 63,
      5: 83,
    };

    const updateGhostPos = (clientX, clientY) => {
      ghost.style.left = `${clientX}px`;
      ghost.style.top = `${clientY}px`;
      ghost.style.transform = `translate(calc(-50% + ${GHOST_OFFSETS[fabDiceCount] ?? 0}px), -50%)`;
    };

    /**
     * Refreshes the dice preview inside the floating panel.
     * When result-preview is on — shows actual dice faces.
     * When off — shows placeholder dice icons (greyed out).
     */
    const refreshFabPreview = () => {
      const icon = panel.querySelector(`#${MODAL_ROOT_ID}-preview-toggle-icon`);
      if (!icon) return;

      if (fabPreviewShowResult) {
        icon.textContent = '\u25C9'; // filled circle
      } else {
        icon.textContent = '\u25CB'; // empty circle
      }

      const diceEls = preview.querySelectorAll('span');
      if (fabPreviewShowResult) {
        const faces = fabFinalIndices.map((i) => faceByIndex(i));
        preview.innerHTML = faces
          .map((f) => `<span style="font-size:34px;line-height:1;display:inline-block">${f}</span>`)
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
          .map((f) => `<span style="font-size:34px;line-height:1;display:inline-block">${f}</span>`)
          .join('');
      }
    };

    // --- Full UI refresh ---
    const refreshFabUi = () => {
      fabDiceCount = Math.max(MIN_DICE, Math.min(MAX_DICE, fabDiceCount));
      fabSixCount = Math.max(0, Math.min(fabSixCount, fabDiceCount));

      // Sync slider positions
      countSlider.value = String(fabDiceCount);
      countSlider.max = String(MAX_DICE);
      countValue.textContent = String(fabDiceCount);

      sixSlider.max = String(fabDiceCount);
      sixSlider.value = String(fabSixCount);
      sixValue.textContent = String(fabSixCount);

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
    };

    applyVisibility();

    // --- Persistence ---
    const saveAndPersist = () => {
      saveFabSettings(fabDiceCount, fabSixCount, fabStrict, isVisible, panelX, panelY, fabPreviewShowResult);
    };

    // --- Close button ---
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      isVisible = false;
      applyVisibility();
      saveAndPersist();
    });

    // --- Slider events ---
    countSlider.addEventListener('input', () => {
      fabDiceCount = Number(countSlider.value);
      fabSixCount = Math.min(fabSixCount, fabDiceCount);
      sixSlider.max = String(fabDiceCount);
      sixSlider.value = String(fabSixCount);
      sixValue.textContent = String(fabSixCount);
      countValue.textContent = String(fabDiceCount);
      fabPerDie = buildPerDieForFab(fabDiceCount, fabSixCount);
      fabFinalIndices = buildFinalIndices(fabDiceCount, fabPerDie, fabStrict);
      refreshFabPreview();
      refreshGhost();
      saveAndPersist();
    });

    sixSlider.addEventListener('input', () => {
      fabSixCount = Number(sixSlider.value);
      sixValue.textContent = String(fabSixCount);
      fabPerDie = buildPerDieForFab(fabDiceCount, fabSixCount);
      fabFinalIndices = buildFinalIndices(fabDiceCount, fabPerDie, fabStrict);
      refreshFabPreview();
      refreshGhost();
      saveAndPersist();
    });

    strictToggle.addEventListener('click', () => {
      fabStrict = !fabStrict;
      refreshToggleState();
      fabPerDie = buildPerDieForFab(fabDiceCount, fabSixCount);
      fabFinalIndices = buildFinalIndices(fabDiceCount, fabPerDie, fabStrict);
      refreshFabPreview();
      refreshGhost();
      saveAndPersist();
    });

    rerollBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      fabPerDie = buildPerDieForFab(fabDiceCount, fabSixCount);
      fabFinalIndices = buildFinalIndices(fabDiceCount, fabPerDie, fabStrict);
      refreshFabPreview();
      refreshGhost();
    });

    // --- Panel drag (move by header) ---
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
    });

    // --- Dice drag (drag area → board) ---
    const startDiceDrag = (e) => {
      if (e.button !== 0) return;

      isDiceDragging = true;
      fabPerDie = buildPerDieForFab(fabDiceCount, fabSixCount);
      diceBoardPoint = null;

      dragArea.classList.add('is-dragging');
      refreshGhost();
      ghost.classList.add('is-active');
      updateGhostPos(e.clientX, e.clientY);

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

      if (!dragMoved) {
        dragMoved = false;
        return;
      }
      dragMoved = false;

      const doRoll = () => {
        if (!diceBoardPoint || fabPerDie.length === 0) return;

        const previewEls = preview.querySelectorAll('span');
        const faces = Array.from(previewEls, (el) => el.textContent ?? '');
        console.log(`[Miro Dice] Panel drag → ${faces.join(' ')}`);

        void runDiceRollAnimation(
          fabDiceCount,
          fabPerDie,
          diceBoardPoint,
          false,
          'count',
          fabSixCount,
          fabStrict,
          fabFinalIndices
        ).catch((err) => console.error('[Miro Dice] Drag roll error:', err));
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

    dragArea.addEventListener('pointerdown', startDiceDrag);
    document.addEventListener('pointermove', moveDiceDrag, { capture: true });
    document.addEventListener('pointerup', endDiceDrag, { capture: true });
    document.addEventListener('pointercancel', () => {
      if (!isDiceDragging) return;
      isDiceDragging = false;
      dragMoved = false;
      dragArea.classList.remove('is-dragging');
      ghost.classList.remove('is-active');
    }, { capture: true });

    // --- F9: show panel ---
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'F9') return;
      if (isDialogOpen || rollRequestInFlight) return;

      e.preventDefault();
      e.stopImmediatePropagation();

      isVisible = true;
      applyVisibility();
      saveAndPersist();
    }, { capture: true });

    // --- Initial state ---
    refreshFabUi();
  }

  // ============================================================
  //  INIT
  // ============================================================

  const initial = loadSettings();
  activePerDie = initial.perDie.map((slot) => ({ ...slot }));

  startCursorTracking();
  registerHotkeys();
  buildFloatingLauncher();
})();
