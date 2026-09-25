# Mini World: Evolution

A lightweight 3D browser survival game built with Three.js and deployed on GitHub Pages.

**Play:** https://marcusnwnus.github.io/mini-world/

## MVP gameplay

You start as a **Mouse** in a small 3D habitat.

- Move with **WASD / arrow keys** or the mobile virtual joystick.
- Attack nearby animals with **Space** or the on-screen Attack button.
- Defeating animals grants XP. Fighting equal or stronger animals rewards more XP than farming weak ones.
- When your XP bar is full, press **E** or tap **Evolve**.
- Evolution path: **Mouse → Rabbit → Fox → Wolf**.
- Other animals roam, flee, hunt lower-tier creatures, and can attack the player.
- If you die, you respawn after a short delay as an animal **one tier lower**.
- Respawning grants a short spawn-protection shield.
- Progress (tier, XP and kills) is saved locally in the browser.

## 3D mouse model

The mouse is a reusable procedural low-poly model defined in:

`src/mouse.js`

It is built entirely from Three.js geometry: body, belly, head, snout, ears, eyes, feet, nose and a curved tube tail. It also exposes a small animation hook for running/bobbing.

Because the model is procedural, there is no binary asset or modeling pipeline required for the MVP. It can later be replaced by a GLB/GLTF model without changing the combat or evolution systems.

## Technology

- Three.js 0.186.0 loaded as an ES module from jsDelivr
- Static HTML/CSS/JavaScript
- No package manager or build step
- Responsive mobile HUD and virtual joystick
- Camera-relative controls
- Delta-time movement and animation
- Pixel ratio capped for better mobile GPU performance
- Low-poly geometry and limited NPC count for mobile performance
- Automatic pause when the browser tab is hidden

## Project structure

- `index.html` — game shell and HUD
- `styles.css` — responsive mobile/desktop interface
- `game.js` — world, player, AI, combat, XP, evolution and camera
- `src/mouse.js` — low-poly mouse 3D model
- `.github/workflows/pages.yml` — automatic GitHub Pages deployment

Every push to `main` deploys automatically to GitHub Pages.
