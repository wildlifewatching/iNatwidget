import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fetchObservations, prepareObservations, buildSvg } from "./render.mjs";

const OUTPUT_DIR = "docs";

async function generateRecent() {
  const observations = await fetchObservations({ limit: 10 });
  const prepared = await prepareObservations(observations);
  const svg = buildSvg(prepared, { title: "Recent sightings" });
  await writeFile(`${OUTPUT_DIR}/inat-widget-recent.svg`, svg, "utf8");
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
    const svg = buildSvg(prepared, { title: trip.title || trip.id });
    await writeFile(`${OUTPUT_DIR}/${trip.output}`, svg, "utf8");
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
