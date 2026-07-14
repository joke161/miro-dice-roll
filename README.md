# Miro Dice Roll 🎲

*[🇷🇺 Русский](#руководство-на-русском) | [🇬🇧 English](#english-guide)*

---

## 🇬🇧 English Guide

A collection of **Tampermonkey** userscripts that add fully interactive, physics-based 3D dice rolling features directly to your Miro boards. Perfect for tabletop games, RPGs, or agile estimation sessions!

### ✨ Features
- **Interactive 3D Physics:** Roll physical 3D dice directly on top of your Miro board.
- **Glassmorphism UI:** A beautiful, responsive settings panel with glass themes, custom accent colors, and smooth interactive lighting effects.
- **Customizable Dice:** Support for standard D6 dice and custom-faced dice.
- **Advanced Roll Logic:** Need to roll exactly 5 dice? Or roll 10 dice and count how many scored above a 4? The custom logic panel handles it.
- **Performance Mode:** Easily toggle 3D effects on/off for smoother performance on low-end hardware.
- **Drag & Drop:** Fully draggable interface that can be minimized to a floating action button (FAB).

### 📦 Included Scripts
This repository contains three different versions of the script to suit your needs:
1. `miro-dice-roll.js` - **The Full Experience** (Recommended). Includes both the 3D dice rolling physics and the floating settings panel.
2. `miro-dice-roll-modal-only.js` - **Core 3D Only**. Contains just the 3D dice modal and physics engine, without the floating settings UI.
3. `miro-dice-roll-panel-only.js` - **UI Only**. Contains just the floating settings panel (UI/UX) without the underlying 3D physics.

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

Набор пользовательских скриптов для **Tampermonkey**, которые добавляют полноценный интерактивный 3D-бросок кубиков с физикой прямо на ваши доски в Miro. Идеально подходит для настольных игр, RPG или сессий планирования!

### ✨ Особенности
- **Интерактивная 3D-физика:** Бросайте физические 3D-кубики прямо поверх доски Miro.
- **Стеклянный интерфейс (Glassmorphism):** Красивая панель настроек со стеклянной темой, настраиваемыми цветами акцентов и плавными интерактивными эффектами подсветки.
- **Настраиваемые кубики:** Поддержка стандартных (D6) и кастомных кубиков.
- **Умная логика бросков:** Нужно бросить ровно 5 кубиков? Или бросить 10 и посчитать, сколько из них выпало больше 4? Кастомная логика легко с этим справится.
- **Режим производительности:** Возможность отключить 3D-эффекты для плавной работы на слабых устройствах.
- **Drag & Drop:** Полностью перетаскиваемый интерфейс, который можно свернуть в небольшую плавающую кнопку (FAB).

### 📦 Состав скриптов
В этом репозитории находятся три версии скрипта под разные задачи:
1. `miro-dice-roll.js` - **Полная версия** (Рекомендуется). Включает в себя как физику 3D-кубиков, так и плавающую панель настроек.
2. `miro-dice-roll-modal-only.js` - **Только 3D**. Содержит только физический движок и 3D-кубики, без плавающей панели настроек.
3. `miro-dice-roll-panel-only.js` - **Только интерфейс**. Содержит только плавающую панель настроек (UI/UX) без логики 3D-бросков.

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
