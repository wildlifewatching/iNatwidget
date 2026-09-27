import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fetchObservations, prepareObservations, buildSvg, buildHtmlCards } from "./render.mjs";

const OUTPUT_DIR = "docs";

// Writes both output styles for one set of observations:
//   - <baseName>.svg  - the auto-refreshing <img>-embeddable version
//   - <baseName>.html - the copy-paste card version with real links
async function writeBoth(baseName, prepared, title) {
  const svg = buildSvg(prepared, { title });
  await writeFile(`${OUTPUT_DIR}/${baseName}.svg`, svg, "utf8");

  const html = buildHtmlCards(prepared, { title });
  await writeFile(`${OUTPUT_DIR}/${baseName}.html`, html, "utf8");
}

async function generateRecent() {
  const observations = await fetchObservations({ limit: 10 });
  const prepared = await prepareObservations(observations);
  await writeBoth("inat-widget-recent", prepared, "Recent sightings");
  console.log(`Wrote recent sightings widget (${observations.length} observations)`);
}

async function generateTrips() {
  let raw;
  try {
    raw = await readFile("trips.json", "utf8");
  } catch {
    console.log("No trips.json found - skipping trip widgets");
    return;
  }
  const trips = JSON.parse(raw);
  for (const trip of trips) {
    const observations = await fetchObservations({
      d1: trip.d1,
      d2: trip.d2,
      placeId: trip.place_id,
      limit: trip.limit || 20,
    });
    const prepared = await prepareObservations(observations);
    // trip.output is the .svg filename from trips.json - reuse its base name
    const baseName = trip.output.replace(/\.svg$/, "");
    await writeBoth(baseName, prepared, trip.title || trip.id);
    console.log(`Wrote trip widget "${trip.id}" (${observations.length} observations)`);
  }
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  await generateRecent();
  await generateTrips();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
