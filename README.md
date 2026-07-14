# Miro Dice Roll

A set of custom userscripts/bookmarklets that add fully interactive 3D dice rolling features to Miro.

## Features

- **Interactive 3D Dice:** Roll a variety of dice (D6, custom faces) directly on top of your Miro boards.
- **Glass Theme:** A beautiful, responsive glassmorphism UI with interactive flow lighting effects on hover.
- **Customizable Experience:** Change themes, adjust opacity and blur, and set a custom accent color for the interface.
- **Drag & Drop:** Fully draggable interface that can be minimized to a floating action button.
- **Performance Mode:** Toggle 3D effects on/off for better performance on weaker hardware.
- **Custom Dice Logic:** Roll an exact number of dice, or use thresholds (e.g. roll N dice and count how many are above a certain value).

## Installation

You can use these scripts via a browser extension like Tampermonkey/Greasemonkey, or simply as bookmarklets.

### Available Scripts

1. `miro-dice-roll.js` - The complete experience. Includes both the 3D dice rolling view and the floating settings panel.
2. `miro-dice-roll-modal-only.js` - Contains only the 3D dice modal and physics engine, without the floating settings panel.
3. `miro-dice-roll-panel-only.js` - Contains only the floating settings panel (UI/UX) without the underlying 3D dice logic.

## Usage

1. Inject the script into your browser while on a Miro board.
2. A small floating dice icon will appear in the bottom right corner.
3. Click the icon to expand the settings panel.
4. **Left-click** on the dice buttons to roll them.
5. **Right-click** on the theme settings (palette icon) to open advanced UI customizations.
6. Drag the panel anywhere on the screen using the top handle.

## Customization (Right-Click Menu)

- **Theme Color:** Base color of the glass panel.
- **Accent Color:** Color used for buttons, active states, and hover flow effects.
- **Opacity & Blur:** Adjust the transparency and background blur of the glass effect.
