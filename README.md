# iNaturalist widgets for Wildlife Watching Australia

Generates static SVG images of recent iNaturalist sightings (user `ryber`),
so they can be embedded on WordPress.com as a plain `<img>` tag - no
`<script>` or `<iframe>` needed, which means it works on the Premium plan.

There are two kinds of widget:

- **Recent** (`docs/inat-widget-recent.svg`) - a rolling feed of your latest
  10 sightings, regardless of trip or location. Good for a sidebar or a
  general "follow my sightings" section.
- **Trip** (`docs/inat-widget-<id>.svg`) - scoped to a date range and/or a
  place, for a specific blog post (e.g. the Tasmania trip report). Defined
  in `trips.json`.

Both are regenerated automatically once a day by a GitHub Action, and can
also be triggered manually at any time.

## One-time setup

1. Create a new GitHub repo and push these files to it (public is fine -
   there's no secret data involved, it only reads the public iNaturalist API).
2. Go to **Settings > Pages**, set source to **Deploy from a branch**,
   branch `main`, folder `/docs`. Save.
3. Go to the **Actions** tab, select "Update iNaturalist widgets", and click
   **Run workflow** to generate the first set of SVGs (otherwise you'll wait
   for the next scheduled run).
4. After a minute or two, your images will be live at:
   - `https://<your-username>.github.io/<repo-name>/inat-widget-recent.svg`
   - `https://<your-username>.github.io/<repo-name>/inat-widget-tasmania-part1.svg`
     (or whatever filename you set in `trips.json`)

## Embedding on WordPress.com

Add a **Custom HTML** block wherever you want the widget, with:

```html
<img
  src="https://<your-username>.github.io/<repo-name>/inat-widget-recent.svg?v=2026-09-27"
  alt="Recent iNaturalist sightings"
  style="max-width:100%;height:auto;"
/>
```

The `?v=...` bit is just a cache-buster - bump it (to a date, a number,
anything) whenever you want to force browsers/WordPress's CDN to fetch the
latest version rather than a cached one. With the daily auto-update this
matters less over time, but it's worth doing right after a manual rebuild.

## Adding a widget for a new blog post

Add an entry to `trips.json`:

```json
{
  "id": "mandurah-easter",
  "title": "Mandurah - Easter dolphin watching",
  "d1": "2026-04-18",
  "d2": "2026-04-21",
  "place_id": null,
  "output": "inat-widget-mandurah-easter.svg"
}
```

Fields:

- `id` - internal label, doesn't appear anywhere public.
- `title` - shown as the heading on the widget image itself.
- `d1` / `d2` - inclusive date range, `YYYY-MM-DD`. Leave both as `null` (or
  remove them) to skip date filtering entirely.
- `place_id` - iNaturalist's numeric place ID, if you want to filter by
  location instead of (or as well as) date. Find it by searching for the
  place on inaturalist.org, opening its place page, and reading the number
  out of the URL (e.g. `inaturalist.org/places/1234-somewhere` → `1234`).
  Leave as `null` to skip.
- `output` - the SVG filename that will be written to `docs/`. This is what
  goes in your `<img src="...">` on the blog.
- `limit` (optional) - max number of sightings to include, default 20.

Commit and push, then either wait for the next scheduled run or trigger the
workflow manually - it'll pick up the new entry and generate its SVG
immediately.

## Running locally (optional)

```bash
npm run generate
```

Writes into `docs/` locally so you can open the SVGs in a browser and check
they look right before pushing.
