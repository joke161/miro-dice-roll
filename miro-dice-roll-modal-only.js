// ==UserScript==
// @name         Miro Dice Roll — Modal Only (Unicode)
// @namespace    https://miro.com/
// @version      1.25.0-modal
// @description  Бросок кубиков (⚀–⚅) на доске Miro — только модальное окно (F8)
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
   * @typedef {{ diceCount: number, perDie: DieSlotConfig[], advancedOpen: boolean, sixPickMode: SixPickMode, sixCount: number, strictSixCount: boolean }} SavedSettings
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

  // =========================================================================
  //  SETTINGS (localStorage)
  // =========================================================================

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
      };
    } catch {
      return {
        diceCount: DEFAULT_DICE_COUNT,
        perDie: createDefaultPerDie(),
        advancedOpen: false,
        sixPickMode: 'slots',
        sixCount: 0,
        strictSixCount: true,
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
   */
  function saveSettings(diceCount, perDie, advancedOpen, sixPickMode, sixCount, strictSixCount) {
    const payload = {
      diceCount,
      advancedOpen,
      sixPickMode,
      sixCount: Math.max(0, Math.min(MAX_DICE, sixCount)),
      strictSixCount,
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

  // =========================================================================
  //  DICE LOGIC
  // =========================================================================

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

  // =========================================================================
  //  STYLES (only F8 modal)
  // =========================================================================

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
    `;

    document.head.appendChild(style);
  }

  // =========================================================================
  //  F8 MODAL DIALOG
  // =========================================================================

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
        btn.innerHTML = `<span>#${i + 1}</span><br><span style="font-size:22px">\\u2685</span>`;
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

  // =========================================================================
  //  MIRO SDK & UTILITIES
  // =========================================================================

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

  // =========================================================================
  //  GEOMETRY & COORDINATES
  // =========================================================================

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

  // =========================================================================
  //  CURSOR TRACKING
  // =========================================================================

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

  // =========================================================================
  //  DICE ANIMATION (Miro SDK)
  // =========================================================================

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

  // =========================================================================
  //  F8 HANDLER & HOTKEY
  // =========================================================================

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

    console.log('[Miro Dice] Modal-only: F8 — бросок (точка = курсор до F8)');
  }

  // ============================================================
  //  INIT
  // ============================================================

  const initial = loadSettings();
  activePerDie = initial.perDie.map((slot) => ({ ...slot }));

  startCursorTracking();
  registerHotkeys();
})();
