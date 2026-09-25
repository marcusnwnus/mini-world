# Mini World: Evolution

A lightweight 3D browser survival game built with **Babylon.js** and deployed on GitHub Pages.

**Play:** https://marcusnwnus.github.io/mini-world/

## MVP gameplay

You start as a **Mouse** in a small 3D habitat.

- Move with **WASD / arrow keys** or the mobile virtual joystick.
- Attack nearby animals with **Space** or the on-screen Attack button.
- Defeating animals grants XP. Equal or stronger animals reward more XP than weak ones.
- When the XP bar is full, press **E** or tap **Evolve**.
- Evolution path: **Mouse → Rabbit → Fox → Wolf**.
- NPC animals roam, flee, hunt lower-tier creatures and attack the player.
- If you die, you respawn after a short delay as an animal **one tier lower**.
- Respawning grants a short spawn-protection shield.
- Tier, XP and kills are saved locally.

## Babylon.js architecture

Babylon.js owns the 3D scene, camera, lighting, shadows, meshes and render loop. The responsive game HUD remains normal HTML/CSS, which keeps touch controls and accessibility independent from the 3D renderer.

The browser MVP pins **Babylon.js 9.27.1** from jsDelivr. A future production build can move to `@babylonjs/core` with Vite for module-level imports and bundling.

## 3D mouse model

The mouse is a reusable Babylon.js procedural low-poly model defined in:

`src/mouse.js`

It is built from Babylon meshes for the body, belly, head, snout, ears, eyes, feet, nose and curved tube tail. It exposes a small animation hook for running/bobbing.

## Project structure

- `index.html` — game shell, Babylon bootstrap and HUD
- `styles.css` — responsive mobile/desktop interface
- `src/main-babylon.js` — Babylon scene, player, AI, combat, XP, evolution and camera
- `src/mouse.js` — Babylon low-poly mouse model
- `.github/workflows/pages.yml` — automatic GitHub Pages deployment

The older Three.js prototype files remain in git history but are no longer loaded by the site.

Every push to `main` deploys automatically to GitHub Pages.
