# Routing: Products world and product page

Every state you can see has its own URL, so refresh, Back and shared links land in the same place.
Mockups: `docs/mockups/products-world.html` (Products) and `docs/mockups/product-stage.html` (product page).

## Products (one world)

| URL | What you see |
|---|---|
| `/products` | The world, galaxy view (default) |
| `/products?view=skyline` | Skyline view |
| `/products?view=cards` | 3D cards view |
| `/products?view=skyline&focus=silk-tie` | Silk Tie in focus, detail card open |
| `/products?sort=sold&type=Shirts&q=linen` | Filters and search (combine with any view or focus) |

- `‹ ›` and the view buttons change `view` with a *replace* (no history entry per click), so Back leaves the page instead of stepping through views.
- Opening a focus *pushes* a history entry: browser Back closes the focus, just like Esc or "← Back to all products".
- "Open product page →" in the detail card goes to `/products/<handle>`.

## Product page

| URL | What you see |
|---|---|
| `/products/silk-tie` | Sales skyline (default) |
| `/products/silk-tie?view=together` | Bought together |
| `/products/silk-tie?view=track` | Track record |
| `/products/silk-tie?view=soon` | Not connected yet (sample data, local development only) |
| `/products/silk-tie?pop=stock` / `?pop=runout` | Ribbon pop-ups (stock per location, run-out chart) |

- Breadcrumb `← Products / Silk Tie` goes back to `/products` **with the last view and focus kept** (`/products?view=skyline&focus=silk-tie`), so you return where you were.
- Bought-together chips link to the other product's page: `/products/oxford-shirt?view=together`.

## Rules

- Product URLs use Shopify's product **handle** (`silk-tie`, unique per store). Needs one extra column and an importer change; old id links redirect.
- One `lib/routes.ts` builds every link (`routes.products({ view, focus })`, `routes.product(handle, { view })`), so no page builds URLs by hand.
- Unknown `view` or `focus` values fall back to the default; a `focus` hidden by the filter clears the filter.
- Later, for merchants with several stores: `/shop/<store>/products/...`.
