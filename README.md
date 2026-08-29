# Miro Dice Roll 🎲

*[🇷🇺 Русский](#руководство-на-русском) | [🇬🇧 English](#english-guide)*

---

## 🇬🇧 English Guide

A **Tampermonkey** userscript that adds a fully interactive dice-rolling panel directly to your Miro boards. Perfect for tabletop games, RPGs, or agile estimation sessions!

This repository contains a single, actively maintained script: **`miro-dice-roll-panel-only.js`**.

### ✨ Features
- **Native Miro Integration:** Rolls are simulated by spawning actual Miro shapes/text items (dice faces ⚀–⚅, or a Shape with a number for custom dice) directly on the board using the Miro Web SDK.
- **Roll Animation:** Simulates a roll by rapidly cycling through faces before landing on the final result, using pure CSS animations (no lag, no `startViewTransition`).
- **Floating Panel UI:** A draggable, glassmorphism-styled settings panel that can be minimized to a floating action button (FAB) and reopened anytime with **F9**.
- **Two Themes:** Solid or glass (frosted) panel background, with right-click access to advanced customization (accent color, glass color, opacity, blur).
- **Custom Dice:** Switch from standard D6 (⚀–⚅) to custom-faced dice (any number of faces).
- **Advanced Roll Logic:** Roll exact counts of a chosen face, or count how many dice landed at/above (or at/below) a threshold.
- **Interactive Mode:** A compact live-editing mode with +/− buttons and mouse-wheel support to add/remove dice on the fly.
- **Drag & Drop:** Panel position is draggable and persisted; dice can be dragged onto the board.
- **Persistence:** All settings (dice count, theme, colors, panel position, custom roll logic, etc.) are saved to `localStorage` and restored on reload.

### ⚙️ Installation (Tampermonkey)
1. Install the [Tampermonkey](https://www.tampermonkey.net/) extension for your browser.
2. Open the Tampermonkey dashboard and create a **New Script**.
3. Copy the contents of `miro-dice-roll-panel-only.js` from this repository.
4. Paste it into the Tampermonkey editor and save (`Ctrl+S` / `Cmd+S`).
5. Open any Miro board — a floating dice icon will appear in the bottom right corner!

### 🎮 How to Use
- **Roll Dice:** Click the reroll icon (or use the panel controls) to throw dice on the board.
- **Open/Close Panel:** Click the floating dice icon to expand the settings panel, or press **F9** to bring it back if it's hidden.
- **Switch Theme:** Click the theme (circle) icon to toggle solid/glass; right-click it to open advanced customization (colors, opacity, blur).
- **Interactive Mode:** Click the interactive-mode icon to switch to the compact live-editing view; use the **+**/**−** buttons or scroll the mouse wheel over the panel to change the dice count.
- **Custom Dice / Advanced Logic:** Use the panel's custom dice section to set a face count and configure exact-match or threshold roll logic.
- **Move Panel:** Drag the panel by its top handle anywhere on your screen.

---

## 🇷🇺 Руководство на русском

Пользовательский скрипт для **Tampermonkey**, который добавляет полноценную панель для интерактивного броска кубиков прямо на ваши доски в Miro. Идеально подходит для настольных игр, RPG или сессий планирования!

В этом репозитории находится один активно поддерживаемый скрипт: **`miro-dice-roll-panel-only.js`**.

### ✨ Особенности
- **Нативная интеграция с Miro:** Броски имитируются созданием реальных фигур/текстовых элементов Miro (грани кубика ⚀–⚅ или Shape с числом для кастомных кубиков) с помощью Miro Web SDK.
- **Анимация броска:** Бросок симулируется быстрым перебором граней перед показом финального результата — на чистых CSS-анимациях (без задержек, без `startViewTransition`).
- **Плавающая панель:** Перетаскиваемая панель настроек со стеклянным (glassmorphism) стилем, которую можно свернуть в кнопку (FAB) и снова открыть клавишей **F9**.
- **Две темы:** Сплошная или стеклянная (glass) панель, с доступом по ПКМ к продвинутым настройкам (акцентный цвет, цвет стекла, прозрачность, размытие).
- **Кастомные кубики:** Переключение со стандартного D6 (⚀–⚅) на кубики с произвольным числом граней.
- **Умная логика бросков:** Бросок точного количества выпадений выбранной грани, либо подсчёт кубиков, выпавших не ниже (или не выше) заданного порога.
- **Интерактивный режим:** Компактный режим с кнопками **+**/**−** и поддержкой колеса мыши для быстрого изменения количества кубиков.
- **Drag & Drop:** Позиция панели перетаскивается и сохраняется; кубики можно перетаскивать по доске.
- **Сохранение настроек:** Все настройки (количество кубиков, тема, цвета, позиция панели, логика бросков и т.д.) сохраняются в `localStorage` и восстанавливаются при перезагрузке.

### ⚙️ Установка (Tampermonkey)
1. Установите расширение [Tampermonkey](https://www.tampermonkey.net/) для вашего браузера.
2. Откройте панель управления Tampermonkey и создайте **Новый скрипт**.
3. Скопируйте код `miro-dice-roll-panel-only.js` из этого репозитория.
4. Вставьте его в редактор Tampermonkey и сохраните (`Ctrl+S` / `Cmd+S`).
5. Откройте любую доску Miro — в правом нижнем углу появится плавающая иконка кубика!

### 🎮 Использование
- **Бросок кубиков:** Нажмите на иконку переброса (или используйте элементы панели), чтобы бросить кубики на доску.
- **Открыть/закрыть панель:** Нажмите на плавающую иконку кубика, чтобы развернуть панель, либо нажмите **F9**, чтобы вернуть её, если она скрыта.
- **Смена темы:** Нажмите на иконку темы (кружок), чтобы переключить сплошной/стеклянный стиль; кликните по ней правой кнопкой мыши для продвинутых настроек (цвета, прозрачность, размытие).
- **Интерактивный режим:** Нажмите на иконку интерактивного режима, чтобы перейти в компактный режим; используйте кнопки **+**/**−** или колесо мыши над панелью, чтобы менять количество кубиков.
- **Кастомные кубики / продвинутая логика:** Используйте блок кастомных кубиков на панели, чтобы задать число граней и настроить логику точного совпадения или порога.
- **Перемещение панели:** Хватайтесь за верхнюю часть панели, чтобы перетащить её в любое удобное место экрана.
