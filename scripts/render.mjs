// Fetches observations from the iNaturalist API for a given user, and
// renders them as a self-contained SVG image (thumbnail grid + labels).
//
// Works in two modes, both handled the same way under the hood:
//   - "recent": no date/place filter, just the latest N observations
//   - "trip":   filtered by date range (d1/d2) and/or a place_id

const API_BASE = "https://api.inaturalist.org/v1/observations";
const USERNAME = "ryber";

/**
 * @param {object} opts
 * @param {string} [opts.d1] - start date, "YYYY-MM-DD" (inclusive)
 * @param {string} [opts.d2] - end date, "YYYY-MM-DD" (inclusive)
 * @param {number|string} [opts.placeId] - iNaturalist numeric place ID
 * @param {number} [opts.limit] - max observations to fetch (default 10)
 */
export async function fetchObservations({ d1, d2, placeId, limit = 10 } = {}) {
  const params = new URLSearchParams({
    user_login: USERNAME,
    order_by: "observed_on",
    order: "desc",
    per_page: String(limit),
    photos: "true", // only return observations that have at least one photo
  });
  if (d1) params.set("d1", d1);
  if (d2) params.set("d2", d2);
  if (placeId) params.set("place_id", String(placeId));

  const url = `${API_BASE}?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`iNaturalist API error ${res.status} ${res.statusText} for ${url}`);
  }
  const data = await res.json();
  return data.results || [];
}

function escapeXml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function photoUrl(obs, size = "small") {
  const photo = obs.photos && obs.photos[0];
  if (!photo || !photo.url) return null;
  // iNaturalist photo URLs default to the tiny "square" crop - swap in a
  // larger size. Valid sizes: square, small, medium, large, original.
  return photo.url.replace("square", size);
}

function speciesName(obs) {
  const taxon = obs.taxon;
  if (!taxon) return "Unidentified";
  return taxon.preferred_common_name || taxon.name || "Unidentified";
}

function cell(obs, x, y, cellSize) {
  const img = photoUrl(obs);
  const name = escapeXml(speciesName(obs));
  const date = escapeXml(obs.observed_on || "");
  const imgTag = img
    ? `<image href="${escapeXml(img)}" width="${cellSize}" height="${cellSize}" preserveAspectRatio="xMidYMid slice" />`
    : `<rect width="${cellSize}" height="${cellSize}" fill="#e5e5e5" />`;
  const textY1 = cellSize + 16;
  const textY2 = cellSize + 32;
  const cx = cellSize / 2;
  return `
    <g transform="translate(${x}, ${y})">
      <rect width="${cellSize}" height="${cellSize}" rx="8" fill="none" stroke="#ddd" />
      ${imgTag}
      <text x="${cx}" y="${textY1}" font-size="12" text-anchor="middle" font-family="sans-serif" fill="#222">${name}</text>
      <text x="${cx}" y="${textY2}" font-size="10" text-anchor="middle" font-family="sans-serif" fill="#888">${date}</text>
    </g>`;
}

/**
 * @param {Array} observations
 * @param {object} opts
 * @param {string} [opts.title]
 * @param {number} [opts.columns]
 */
export function buildSvg(observations, { title = "Recent sightings", columns = 5 } = {}) {
  const cellSize = 120;
  const cellGap = 20;
  const cellW = cellSize + cellGap;
  const cellH = cellSize + 56;
  const padding = 16;
  const headerH = 40;

  const count = observations.length || 1;
  const cols = Math.min(columns, count);
  const rows = Math.ceil(observations.length / cols) || 1;

  const width = cols * cellW - cellGap + padding * 2;
  const height = headerH + rows * cellH + padding * 2;

  const cells = observations
    .map((obs, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = padding + col * cellW;
      const y = headerH + padding + row * cellH;
      return cell(obs, x, y, cellSize);
    })
    .join("");

  const emptyMsg = observations.length
    ? ""
    : `<text x="${padding}" y="${headerH + padding + 24}" font-size="13" font-family="sans-serif" fill="#888">No sightings found for this range yet.</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <rect width="${width}" height="${height}" fill="#ffffff" />
  <text x="${padding}" y="26" font-size="18" font-family="sans-serif" font-weight="bold" fill="#222">${escapeXml(title)}</text>
  ${cells}
  ${emptyMsg}
</svg>`;
}
