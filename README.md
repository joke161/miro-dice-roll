# Miro Dice Roll 🎲

*[🇷🇺 Русский](#руководство-на-русском) | [🇬🇧 English](#english-guide)*

---

## 🇬🇧 English Guide

A collection of **Tampermonkey** userscripts that add fully interactive dice rolling features directly to your Miro boards. Perfect for tabletop games, RPGs, or agile estimation sessions!

### ✨ Features
- **Native Miro Integration:** Rolls are simulated by spawning actual Miro shapes (like sticky notes) directly on the board using the Miro Web SDK.
- **Roll Animation:** Simulates a roll by rapidly cycling through numbers and colors before smoothly landing on the final result.
- **Glassmorphism UI:** A beautiful, responsive settings panel with glass themes, custom accent colors, and smooth interactive lighting effects.
- **Customizable Dice:** Support for standard D6 dice and custom-faced dice.
- **Advanced Roll Logic:** Need to roll exactly 5 dice? Or roll 10 dice and count how many scored above a 4? The custom logic panel handles it.
- **Performance Mode:** Easily toggle the visual rolling animation on/off for instant results.
- **Drag & Drop:** Fully draggable interface that can be minimized to a floating action button (FAB).

### 📦 Included Scripts
This repository contains three different versions of the script. **Note: `miro-dice-roll-panel-only.js` is the main and actively updated version.**
1. `miro-dice-roll-panel-only.js` - **Main Version (Actively Updated)**. The most polished version containing the modern floating settings panel, glassmorphism UI, and the complete feature set.
2. `miro-dice-roll.js` - **Older Version (Basic UI)**. An older but functional version containing the core rolling logic and a simpler HTML UI panel.
3. `miro-dice-roll-modal-only.js` - **Older Version (Logic Only)**. An older functional version containing just the core dice rolling logic without the floating settings UI.

### ⚙️ Installation (Tampermonkey)
1. Install the [Tampermonkey](https://www.tampermonkey.net/) extension for your browser.
2. Open the Tampermonkey dashboard and create a **New Script**.
3. Copy the contents of the desired script (e.g., `miro-dice-roll.js`) from this repository.
4. Paste it into the Tampermonkey editor and save (`Ctrl+S` / `Cmd+S`).
5. Open any Miro board — a floating dice icon will appear in the bottom right corner!

### 🎮 How to Use
- **Roll Dice:** Left-click on the dice icons to throw them on the board.
- **Open Settings:** Click the floating dice icon to expand the settings panel.
- **Customize Theme:** Right-click the theme (palette) icon to open advanced customization options (colors, opacity, blur).
- **Move Panel:** Drag the panel anywhere on your screen using the top handle.

---

## 🇷🇺 Руководство на русском

Набор пользовательских скриптов для **Tampermonkey**, которые добавляют полноценный интерактивный бросок кубиков прямо на ваши доски в Miro. Идеально подходит для настольных игр, RPG или сессий планирования!

### ✨ Особенности
- **Нативная интеграция с Miro:** Броски имитируются путем создания реальных фигур Miro (стикеров) прямо на доске с помощью Miro Web SDK.
- **Анимация броска:** Бросок симулируется за счет быстрого перебора чисел и цветов стикеров, прежде чем выдать финальный результат.
- **Стеклянный интерфейс (Glassmorphism):** Красивая панель настроек со стеклянной темой, настраиваемыми цветами акцентов и плавными интерактивными эффектами подсветки.
- **Настраиваемые кубики:** Поддержка стандартных (D6) и кастомных кубиков.
- **Умная логика бросков:** Нужно бросить ровно 5 кубиков? Или бросить 10 и посчитать, сколько из них выпало больше 4? Кастомная логика легко с этим справится.
- **Режим производительности:** Возможность отключить визуальную анимацию броска для мгновенной выдачи результатов.
- **Drag & Drop:** Полностью перетаскиваемый интерфейс, который можно свернуть в небольшую плавающую кнопку (FAB).

### 📦 Состав скриптов
В этом репозитории находятся три версии скрипта. **Внимание: `miro-dice-roll-panel-only.js` — это основная и активно обновляемая версия.**
1. `miro-dice-roll-panel-only.js` - **Основная версия (Актуальная)**. Самая проработанная версия, включающая современную плавающую панель настроек, стеклянный UI и весь актуальный функционал.
2. `miro-dice-roll.js` - **Старая версия (Базовый UI)**. Старая, но рабочая версия, включающая логику бросков и более простую HTML-панель настроек.
3. `miro-dice-roll-modal-only.js` - **Старая версия (Только логика)**. Старая рабочая версия, содержащая только логику бросков (создание стикеров с числами/символами) без плавающей панели настроек.

### ⚙️ Установка (Tampermonkey)
1. Установите расширение [Tampermonkey](https://www.tampermonkey.net/) для вашего браузера.
2. Откройте панель управления Tampermonkey и создайте **Новый скрипт** (New Script).
3. Скопируйте код нужного вам скрипта (например, `miro-dice-roll.js`) из этого репозитория.
4. Вставьте его в редактор Tampermonkey и сохраните (`Ctrl+S` / `Cmd+S`).
5. Откройте любую доску Miro — в правом нижнем углу появится плавающая иконка кубика!

### 🎮 Использование
- **Бросок кубиков:** Кликайте левой кнопкой мыши по иконкам кубиков, чтобы бросить их.
- **Настройки:** Нажмите на плавающую иконку кубика, чтобы развернуть панель управления.
- **Кастомизация темы:** Кликните правой кнопкой мыши (ПКМ) по иконке темы (палитра), чтобы открыть продвинутые настройки внешнего вида (цвета, прозрачность, размытие).
- **Перемещение панели:** Хватайтесь за верхнюю часть панели, чтобы перетащить её в любое удобное место экрана.
