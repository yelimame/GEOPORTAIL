/**
 * projections.js — Définitions proj4 et fonctions de conversion géodésique
 * Géoportail Maroc
 *
 * Contient les définitions complètes des projections Merchich (EPSG:26191-26194)
 * et WGS84, ainsi que toutes les fonctions de conversion inter-projections.
 */

// ============================================================
// Enregistrement des définitions proj4
// ============================================================

/** Projection WGS84 géographique (EPSG:4326) */
proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs");

/** Web Mercator (EPSG:3857) — projection interne OpenLayers */
proj4.defs("EPSG:3857", "+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs");

/** Merchich Zone 1 (EPSG:26191) — Nord Maroc (Rif, Tétouan) */
proj4.defs("EPSG:26191",
  "+proj=lcc +lat_1=33.3 +lat_0=33.3 +lon_0=-5.4 " +
  "+k_0=0.999625769 +x_0=500000 +y_0=300000 " +
  "+a=6378249.2 +b=6356514.999904194 " +
  "+towgs84=31,-146,47,0,0,0,0 +units=m +no_defs"
);

/** Merchich Zone 2 (EPSG:26192) — Centre-Nord Maroc (Casablanca, Rabat, Fès) */
proj4.defs("EPSG:26192",
  "+proj=lcc +lat_1=29.7 +lat_0=29.7 +lon_0=-5.4 " +
  "+k_0=0.9996155960 +x_0=500000 +y_0=300000 " +
  "+a=6378249.2 +b=6356514.999904194 " +
  "+towgs84=31,-146,47,0,0,0,0 +units=m +no_defs"
);

/** Merchich Zone 3 (EPSG:26193) — Centre-Sud Maroc (Marrakech, Agadir) */
proj4.defs("EPSG:26193",
  "+proj=lcc +lat_1=26.1 +lat_0=26.1 +lon_0=-5.4 " +
  "+k_0=0.9996 +x_0=1200000 +y_0=400000 " +
  "+a=6378249.2 +b=6356514.999904194 " +
  "+towgs84=31,-146,47,0,0,0,0 +units=m +no_defs"
);

/** Merchich Zone 4 (EPSG:26194) — Sahara marocain */
proj4.defs("EPSG:26194",
  "+proj=lcc +lat_1=22.5 +lat_0=22.5 +lon_0=-5.4 " +
  "+k_0=0.999616304 +x_0=1500000 +y_0=400000 " +
  "+a=6378249.2 +b=6356514.999904194 " +
  "+towgs84=31,-146,47,0,0,0,0 +units=m +no_defs"
);

// Enregistrement dans OpenLayers (si ol/proj/proj4 est chargé)
if (window.ol && ol.proj && ol.proj.proj4 && ol.proj.proj4.register) {
  ol.proj.proj4.register(proj4);
}

// ============================================================
// Constantes
// ============================================================

/** Liste des systèmes de projection supportés */
const PROJECTIONS = {
  "EPSG:4326":  { label: "WGS84 (DD)",         unit: "°",  isGeographic: true  },
  "EPSG:26191": { label: "Merchich Zone 1",      unit: "m",  isGeographic: false },
  "EPSG:26192": { label: "Merchich Zone 2",      unit: "m",  isGeographic: false },
  "EPSG:26193": { label: "Merchich Zone 3",      unit: "m",  isGeographic: false },
  "EPSG:26194": { label: "Merchich Zone 4",      unit: "m",  isGeographic: false },
  "EPSG:3857":  { label: "Web Mercator",         unit: "m",  isGeographic: false },
};

// ============================================================
// Fonctions de conversion
// ============================================================

/**
 * Convertit des coordonnées d'un système de projection vers un autre.
 * Utilise exclusivement proj4js — aucune formule approchée.
 *
 * @param {number} x - Coordonnée X (longitude ou Est)
 * @param {number} y - Coordonnée Y (latitude ou Nord)
 * @param {string} fromEPSG - Code EPSG source (ex: "EPSG:4326")
 * @param {string} toEPSG   - Code EPSG cible  (ex: "EPSG:26192")
 * @returns {{ x: number, y: number }} Coordonnées converties
 */
function convertCoords(x, y, fromEPSG, toEPSG) {
  if (fromEPSG === toEPSG) return { x, y };
  try {
    const result = proj4(fromEPSG, toEPSG, [x, y]);
    return { x: result[0], y: result[1] };
  } catch (err) {
    console.error(`Erreur conversion ${fromEPSG} → ${toEPSG}:`, err);
    return { x: NaN, y: NaN };
  }
}

/**
 * Convertit depuis WGS84 decimal vers toutes les projections supportées.
 *
 * @param {number} lon - Longitude WGS84 (degrés décimaux, positif=Est)
 * @param {number} lat - Latitude WGS84 (degrés décimaux, positif=Nord)
 * @returns {Object} Objet avec toutes les coordonnées converties
 */
function convertFromWGS84(lon, lat) {
  const result = {
    wgs84: { lon, lat },
    wgs84dms: {
      lon: decimalToDMS(lon, true),
      lat: decimalToDMS(lat, false),
    },
    z1: convertCoords(lon, lat, "EPSG:4326", "EPSG:26191"),
    z2: convertCoords(lon, lat, "EPSG:4326", "EPSG:26192"),
    z3: convertCoords(lon, lat, "EPSG:4326", "EPSG:26193"),
    z4: convertCoords(lon, lat, "EPSG:4326", "EPSG:26194"),
    webMercator: convertCoords(lon, lat, "EPSG:4326", "EPSG:3857"),
  };
  return result;
}

/**
 * Convertit depuis une projection quelconque vers WGS84 DD.
 *
 * @param {number} x      - Coordonnée X (selon projection)
 * @param {number} y      - Coordonnée Y (selon projection)
 * @param {string} epsg   - Code EPSG source
 * @returns {{ lon: number, lat: number }} Coordonnées WGS84
 */
function toWGS84(x, y, epsg) {
  if (epsg === "EPSG:4326") return { lon: x, lat: y };
  const res = convertCoords(x, y, epsg, "EPSG:4326");
  return { lon: res.x, lat: res.y };
}

/**
 * Convertit depuis Web Mercator (EPSG:3857) vers WGS84 DD.
 * Utilisé pour traiter les coordonnées de la carte OpenLayers.
 *
 * @param {number} mx - X en mètres (Web Mercator)
 * @param {number} my - Y en mètres (Web Mercator)
 * @returns {{ lon: number, lat: number }}
 */
function mercatorToWGS84(mx, my) {
  const res = proj4("EPSG:3857", "EPSG:4326", [mx, my]);
  return { lon: res[0], lat: res[1] };
}

/**
 * Convertit WGS84 vers Web Mercator.
 *
 * @param {number} lon
 * @param {number} lat
 * @returns {{ x: number, y: number }}
 */
function wgs84ToMercator(lon, lat) {
  const res = proj4("EPSG:4326", "EPSG:3857", [lon, lat]);
  return { x: res[0], y: res[1] };
}

/**
 * Convertit depuis Web Mercator vers une projection cible.
 *
 * @param {number} mx   - X en mètres Web Mercator
 * @param {number} my   - Y en mètres Web Mercator
 * @param {string} epsg - EPSG cible
 * @returns {{ x: number, y: number }}
 */
function mercatorTo(mx, my, epsg) {
  if (epsg === "EPSG:3857") return { x: mx, y: my };
  const res = proj4("EPSG:3857", epsg, [mx, my]);
  return { x: res[0], y: res[1] };
}

// ============================================================
// Conversion DMS (Degrés Minutes Secondes)
// ============================================================

/**
 * Convertit un angle décimal en chaîne DMS (Degrés°Minutes'Secondes'').
 *
 * @param {number}  decimal  - Angle en degrés décimaux
 * @param {boolean} isLon    - true si longitude (affiche E/O), false si latitude (N/S)
 * @returns {string} Représentation DMS (ex: "33°34'23.16\"N")
 */
function decimalToDMS(decimal, isLon) {
  const abs = Math.abs(decimal);
  const deg = Math.floor(abs);
  const minFull = (abs - deg) * 60;
  const min = Math.floor(minFull);
  const sec = (minFull - min) * 60;

  let hemisphere;
  if (isLon) {
    hemisphere = decimal >= 0 ? "E" : "O";
  } else {
    hemisphere = decimal >= 0 ? "N" : "S";
  }

  return `${deg}°${String(min).padStart(2,'0')}'${sec.toFixed(2).padStart(5,'0')}"${hemisphere}`;
}

/**
 * Parse une chaîne DMS vers des degrés décimaux.
 * Formats acceptés : "33°34'23.16\"N", "33 34 23.16 N", "33-34-23.16N"
 *
 * @param {string} dmsStr - Chaîne DMS à parser
 * @returns {number|null} Valeur décimale ou null si parsing impossible
 */
function DMSToDecimal(dmsStr) {
  if (!dmsStr) return null;
  const str = dmsStr.trim().toUpperCase();

  // Regex flexible pour divers formats DMS
  const regex = /^(\d+)[°\s-](\d+)['\s-](\d+(?:\.\d+)?)["\s]?([NSEO])?$/;
  const match = str.match(regex);

  if (!match) {
    // Essai format décimal pur
    const num = parseFloat(str);
    return isNaN(num) ? null : num;
  }

  const deg = parseInt(match[1]);
  const min = parseInt(match[2]);
  const sec = parseFloat(match[3]);
  const hemi = match[4] || "";

  let decimal = deg + min / 60 + sec / 3600;
  if (hemi === "S" || hemi === "O") decimal = -decimal;

  return decimal;
}

/**
 * Formate des coordonnées WGS84 pour l'affichage dans la barre de statut.
 *
 * @param {number} lon
 * @param {number} lat
 * @returns {string} Format "33.5731°N, 7.5898°O"
 */
function formatWGS84(lon, lat) {
  const latStr = `${Math.abs(lat).toFixed(6)}°${lat >= 0 ? 'N' : 'S'}`;
  const lonStr = `${Math.abs(lon).toFixed(6)}°${lon >= 0 ? 'E' : 'O'}`;
  return `${latStr}, ${lonStr}`;
}

/**
 * Formate des coordonnées planes (Merchich) pour l'affichage.
 *
 * @param {number} x - Est (mètres)
 * @param {number} y - Nord (mètres)
 * @returns {string} Format "E: 168345.23 m, N: 375123.45 m"
 */
function formatPlane(x, y) {
  return `E: ${x.toFixed(2)} m, N: ${y.toFixed(2)} m`;
}

/**
 * Convertit un tableau de coordonnées [lon, lat] depuis une projection
 * vers une autre. Utilisé pour les géométries OL.
 *
 * @param {Array<Array<number>>} coords  - Tableau de [x, y]
 * @param {string} fromEPSG
 * @param {string} toEPSG
 * @returns {Array<Array<number>>}
 */
function transformCoordArray(coords, fromEPSG, toEPSG) {
  return coords.map(([x, y]) => {
    const res = proj4(fromEPSG, toEPSG, [x, y]);
    return [res[0], res[1]];
  });
}

/**
 * Retourne le label de la zone Merchich sélectionnée.
 *
 * @param {string} epsg - Code EPSG
 * @returns {string}
 */
function getZoneLabel(epsg) {
  const labels = {
    "EPSG:4326":  "WGS84",
    "EPSG:26191": "Merchich Z1",
    "EPSG:26192": "Merchich Z2",
    "EPSG:26193": "Merchich Z3",
    "EPSG:26194": "Merchich Z4",
    "EPSG:3857":  "Web Mercator",
  };
  return labels[epsg] || epsg;
}

/**
 * Valide si des coordonnées sont dans la plage du Maroc (approximatif).
 * Utile pour détecter des erreurs de saisie grossières.
 *
 * @param {number} lon
 * @param {number} lat
 * @returns {boolean}
 */
function isInMoroccoArea(lon, lat) {
  return lon >= -17 && lon <= 0 && lat >= 20 && lat <= 36;
}

// ============================================================
// Test de validation (exécuté au chargement)
// ============================================================
(function testConversions() {
  // Casablanca : 33.5731°N, 7.5898°O → Merchich Z2 ≈ E=168000, N=375000
  const lon = -7.5898;
  const lat = 33.5731;

  const z2 = convertCoords(lon, lat, "EPSG:4326", "EPSG:26192");
  console.log(
    `[Projections] Test Casablanca WGS84→Z2 : E=${z2.x.toFixed(0)}, N=${z2.y.toFixed(0)}`
  );

  // Retour inverse
  const back = convertCoords(z2.x, z2.y, "EPSG:26192", "EPSG:4326");
  const errLon = Math.abs(back.x - lon);
  const errLat = Math.abs(back.y - lat);
  console.log(
    `[Projections] Retour Z2→WGS84 : lon=${back.x.toFixed(6)}, lat=${back.y.toFixed(6)}`,
    `(erreur: ${(errLon * 111320).toFixed(3)} m lon, ${(errLat * 110540).toFixed(3)} m lat)`
  );
})();
