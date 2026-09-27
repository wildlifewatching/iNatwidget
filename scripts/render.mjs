// Fetches observations from the iNaturalist API for a given user, and
// renders them as a self-contained SVG image (thumbnail grid + labels).
//
// Works in two modes, both handled the same way under the hood:
//   - "recent": no date/place filter, just the latest N observations
//   - "trip":   filtered by date range (d1/d2) and/or a place_id

const API_BASE = "https://api.inaturalist.org/v1/observations";
const USERNAME = "ryber";

// Some image CDNs quietly reject requests that don't look like they're
// coming from a real browser - Node's default fetch User-Agent is generic
// enough that this has been known to trip that up.
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
};

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
  const res = await fetch(url, { headers: BROWSER_HEADERS });
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

// iNaturalist gives dates as YYYY-MM-DD; re-order to DD-MM-YYYY for an
// Australian audience. Falls back to the raw string if it's not that shape.
function formatDateAU(dateStr) {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  return `${d}-${m}-${y}`;
}

// Greedy word-wrap onto lines of roughly `maxChars` characters each, so a
// long species name doesn't overflow into the next tile. If wrapping needs
// more than `maxLines` lines, the extra content is never silently dropped -
// the last kept line gets an ellipsis so it's visibly truncated instead.
function wrapName(name, maxChars = 16, maxLines = 2) {
  const words = String(name).split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);

  if (lines.length > maxLines) {
    lines.length = maxLines; // drop the overflow lines...
    let last = lines[maxLines - 1];
    if (last.length + 1 > maxChars) {
      last = last.slice(0, maxChars - 1);
    }
    lines[maxLines - 1] = last + "\u2026"; // ...but always flag the cut visibly
  }
  return lines;
}

async function toDataUri(url) {
  if (!url) return null;
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS });
    if (!res.ok) {
      console.warn(`Photo fetch failed (${res.status} ${res.statusText}): ${url}`);
      return null;
    }
    const contentType = res.headers.get("content-type") || "image/jpeg";
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${contentType};base64,${buf.toString("base64")}`;
  } catch (err) {
    // Log the real reason rather than silently falling back, so a broken
    // build shows up clearly in the Action log instead of just grey boxes.
    console.warn(`Photo fetch threw for ${url}:`, err.message || err);
    return null; // still fall back to a placeholder rather than fail the whole build
  }
}

/**
 * Turns raw iNaturalist observation objects into plain {name, date, dataUri}
 * records, downloading each photo and inlining it as base64. Needed because
 * an SVG loaded via <img src="..."> is blocked from fetching any external
 * resource at view time - the image bytes have to already be inside the file.
 */
export async function prepareObservations(observations, { photoSize = "small" } = {}) {
  return Promise.all(
    observations.map(async (obs) => ({
      name: speciesName(obs),
      date: formatDateAU(obs.observed_on || ""),
      dataUri: await toDataUri(photoUrl(obs, photoSize)),
    }))
  );
}

function cell(item, x, y, cellSize) {
  const nameLines = wrapName(item.name).map((line) => escapeXml(line));
  const date = escapeXml(item.date);
  const imgTag = item.dataUri
    ? `<image href="${item.dataUri}" width="${cellSize}" height="${cellSize}" preserveAspectRatio="xMidYMid slice" />`
    : `<rect width="${cellSize}" height="${cellSize}" fill="#e5e5e5" />`;
  const cx = cellSize / 2;
  const lineHeight = 14;
  const nameStartY = cellSize + 16;
  const nameText = nameLines
    .map(
      (line, i) =>
        `<text x="${cx}" y="${nameStartY + i * lineHeight}" font-size="12" text-anchor="middle" font-family="sans-serif" fill="#222">${line}</text>`
    )
    .join("");
  const dateY = nameStartY + nameLines.length * lineHeight;
  return `
    <g transform="translate(${x}, ${y})">
      <rect width="${cellSize}" height="${cellSize}" rx="8" fill="none" stroke="#ddd" />
      ${imgTag}
      ${nameText}
      <text x="${cx}" y="${dateY}" font-size="10" text-anchor="middle" font-family="sans-serif" fill="#888">${date}</text>
    </g>`;
}

/**
 * @param {Array} items - output of prepareObservations() - {name, date, dataUri}[]
 * @param {object} opts
 * @param {string} [opts.title]
 * @param {number} [opts.columns]
 */
export function buildSvg(items, { title = "Recent sightings", columns = 5 } = {}) {
  const cellSize = 120;
  const cellGap = 20;
  const cellW = cellSize + cellGap;
  const cellH = cellSize + 68; // room for up to 2 wrapped name lines + the date
  const padding = 16;
  const headerH = 40;

  const count = items.length || 1;
  const cols = Math.min(columns, count);
  const rows = Math.ceil(items.length / cols) || 1;

  const width = cols * cellW - cellGap + padding * 2;
  const height = headerH + rows * cellH + padding * 2;

  const cells = items
    .map((item, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = padding + col * cellW;
      const y = headerH + padding + row * cellH;
      return cell(item, x, y, cellSize);
    })
    .join("");

  const emptyMsg = items.length
    ? ""
    : `<text x="${padding}" y="${headerH + padding + 24}" font-size="13" font-family="sans-serif" fill="#888">No sightings found for this range yet.</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <rect width="${width}" height="${height}" fill="#ffffff" />
  <text x="${padding}" y="26" font-size="18" font-family="sans-serif" font-weight="bold" fill="#222">${escapeXml(title)}</text>
  ${cells}
  ${emptyMsg}
</svg>`;
}
