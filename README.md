# Mini World

Mini World is a browser-based ecosystem balancing game. Plants feed herbivores, herbivores feed carnivores, and every population competes for a limited habitat.

## Play

Open `index.html` locally, or deploy the repository as a static site.

### Cloudflare Pages

1. Create a Pages project and connect this GitHub repository.
2. Framework preset: **None**.
3. Build command: leave blank.
4. Build output directory: `/` (repository root).

### GitHub Pages

If your GitHub plan/repository visibility supports Pages, publish from the `main` branch and repository root.

## How the ecosystem works

- Vegetation regrows on fertile land and can spread into nearby empty cells.
- Herbivores move toward food, eat plants, lose energy, reproduce, and can starve.
- Carnivores move toward herbivores, hunt, lose energy, reproduce, and can starve.
- The player can plant vegetation, introduce animals, trigger rain, remove animals, and pause the simulation.
- The Stability score rewards an ecosystem where all three trophic levels remain healthy.
- The game autosaves to the browser with `localStorage`.

No backend, build step, package manager, or paid service is required.
