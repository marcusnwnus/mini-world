# Mini World

Mini World is a mobile-first 2.5D ecosystem balancing game that runs entirely in the browser.

**Play:** https://marcusnwnus.github.io/mini-world/

## Game loop

Plants feed herbivores, herbivores feed carnivores, and the player spends limited **Eco Points** to intervene without destabilizing the food web.

Your first stewardship goal is to keep the ecosystem at **75%+ stability for 15 consecutive days** while all three trophic levels remain alive. After completing it, the simulation continues in endless mode.

### Systems

- 2.5D isometric ecosystem with touch-friendly tile interaction
- Vegetation growth, grazing, predation, reproduction, aging and starvation
- Four seasons that alter growth and moisture
- Random ecosystem events such as droughts, wild blooms and migration
- Eco Points that regenerate based on ecosystem health
- 1× / 2× simulation speed and pause controls
- Versioned local autosave
- Automatic pause when the browser tab becomes hidden
- Responsive portrait and landscape mobile layouts
- Reduced-motion accessibility support

## Project structure

- `index.html` — semantic HUD and game shell
- `styles.css` — responsive/mobile UI
- `game.js` — simulation state, fixed-step game loop, rendering and input
- `.github/workflows/pages.yml` — automatic GitHub Pages deployment

There are no runtime dependencies, package managers, build steps or backend services.

## Deployment

Every push to `main` automatically deploys through GitHub Actions to GitHub Pages.

For Cloudflare Pages, connect this repository with no build command and publish the repository root.
