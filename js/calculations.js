/**
 * calculations.js — Calculs géométriques géodésiques
 * Géoportail Maroc
 *
 * Surface (Shoelace en coordonnées planes Merchich),
 * périmètre, longueur de polyline, distance entre points.
 * Tous les calculs utilisent proj4js via le module projections.js.
 */

// ============================================================
// Calcul de surface (algorithme de Gauss/Shoelace)
// ============================================================

/**
 * Calcule la surface d'un polygone par l'algorithme de Gauss (Shoelace formula)
 * en coordonnées planes projetées (Merchich). Précis pour les surfaces planes.
 *
 * @param {Array<Array<number>>} coordsWGS84 - Tableau [[lon, lat], ...] en WGS84
 * @param {string} [zoneEPSG="EPSG:26192"]  - Projection plane pour le calcul
 * @returns {{ m2: number, ha: number, km2: number }} Surface en m², ha, km²
 */
function calculatePolygonArea(coordsWGS84, zoneEPSG = "EPSG:26192") {
  if (!coordsWGS84 || coordsWGS84.length < 3) return { m2: 0, ha: 0, km2: 0 };

  // Conversion vers coordonnées planes Merchich
  const planCoords = coordsWGS84.map(([lon, lat]) => {
    const res = convertCoords(lon, lat, "EPSG:4326", zoneEPSG);
    return [res.x, res.y];
  });

  // Shoelace formula (Gauss)
  let area = 0;
  const n = planCoords.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = planCoords[i];
    const [x2, y2] = planCoords[(i + 1) % n];
    area += x1 * y2 - x2 * y1;
  }
  const m2 = Math.abs(area) / 2;

  return {
    m2,
    ha:  m2 / 10000,
    km2: m2 / 1e6,
  };
}

/**
 * Version pour coordonnées Web Mercator (EPSG:3857) — utilisation interne OL.
 *
 * @param {Array<Array<number>>} coordsMerc - [[x3857, y3857], ...]
 * @param {string} [zoneEPSG="EPSG:26192"]
 * @returns {{ m2: number, ha: number, km2: number }}
 */
function calculatePolygonAreaFromMerc(coordsMerc, zoneEPSG = "EPSG:26192") {
  const wgs84Coords = coordsMerc.map(([mx, my]) => {
    const wgs = mercatorToWGS84(mx, my);
    return [wgs.lon, wgs.lat];
  });
  return calculatePolygonArea(wgs84Coords, zoneEPSG);
}

// ============================================================
// Calcul de longueur / périmètre
// ============================================================

/**
 * Calcule la longueur d'une polyline (somme des segments) en mètres.
 * Utilise la distance géodésique (formule de Haversine) pour la précision.
 *
 * @param {Array<Array<number>>} coordsWGS84 - [[lon, lat], ...]
 * @returns {{ m: number, km: number }}
 */
function calculatePolylineLength(coordsWGS84) {
  if (!coordsWGS84 || coordsWGS84.length < 2) return { m: 0, km: 0 };

  let totalM = 0;
  for (let i = 0; i < coordsWGS84.length - 1; i++) {
    totalM += haversineDistance(coordsWGS84[i], coordsWGS84[i + 1]);
  }
  return { m: totalM, km: totalM / 1000 };
}

/**
 * Calcule le périmètre d'un polygone en mètres (ferme la boucle).
 *
 * @param {Array<Array<number>>} coordsWGS84 - [[lon, lat], ...]
 * @returns {{ m: number, km: number }}
 */
function calculatePolygonPerimeter(coordsWGS84) {
  if (!coordsWGS84 || coordsWGS84.length < 2) return { m: 0, km: 0 };

  const closed = [...coordsWGS84, coordsWGS84[0]]; // ferme le polygone
  return calculatePolylineLength(closed);
}

/**
 * Version depuis coordonnées Mercator.
 *
 * @param {Array<Array<number>>} coordsMerc
 * @returns {{ m: number, km: number }}
 */
function calculateLengthFromMerc(coordsMerc) {
  const wgs84 = coordsMerc.map(([mx, my]) => {
    const wgs = mercatorToWGS84(mx, my);
    return [wgs.lon, wgs.lat];
  });
  return calculatePolylineLength(wgs84);
}

// ============================================================
// Distance entre deux points (Haversine)
// ============================================================

/**
 * Distance géodésique entre deux points WGS84 (formule de Haversine).
 * Précision ~0.5% pour des distances courtes (<1000 km).
 *
 * @param {Array<number>} pt1 - [lon, lat] en degrés
 * @param {Array<number>} pt2 - [lon, lat] en degrés
 * @returns {number} Distance en mètres
 */
function haversineDistance(pt1, pt2) {
  const R = 6371008.8; // Rayon terrestre moyen en mètres
  const [lon1, lat1] = pt1;
  const [lon2, lat2] = pt2;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Distance entre deux points en coordonnées Mercator → WGS84 → Haversine.
 *
 * @param {Array<number>} pt1Merc - [x, y] EPSG:3857
 * @param {Array<number>} pt2Merc - [x, y] EPSG:3857
 * @returns {number} Distance en mètres
 */
function distanceBetweenMercPoints(pt1Merc, pt2Merc) {
  const p1 = mercatorToWGS84(pt1Merc[0], pt1Merc[1]);
  const p2 = mercatorToWGS84(pt2Merc[0], pt2Merc[1]);
  return haversineDistance([p1.lon, p1.lat], [p2.lon, p2.lat]);
}

// ============================================================
// Calcul de surface de cercle
// ============================================================

/**
 * Calcule la surface d'un cercle.
 *
 * @param {number} radiusM - Rayon en mètres
 * @returns {{ m2: number, ha: number, km2: number }}
 */
function calculateCircleArea(radiusM) {
  const m2 = Math.PI * radiusM ** 2;
  return { m2, ha: m2 / 10000, km2: m2 / 1e6 };
}

/**
 * Calcule la circonférence d'un cercle.
 *
 * @param {number} radiusM - Rayon en mètres
 * @returns {{ m: number, km: number }}
 */
function calculateCirclePerimeter(radiusM) {
  const m = 2 * Math.PI * radiusM;
  return { m, km: m / 1000 };
}

// ============================================================
// Formatage des résultats
// ============================================================

/**
 * Formate une surface en unités lisibles avec sélection automatique.
 *
 * @param {number} m2 - Surface en m²
 * @returns {string} Ex: "1.25 ha" ou "2 500 m²" ou "1.2 km²"
 */
function formatArea(m2) {
  if (m2 < 10000) {
    return `${m2.toFixed(1)} m²`;
  } else if (m2 < 1e6) {
    return `${(m2 / 10000).toFixed(4)} ha`;
  } else {
    return `${(m2 / 1e6).toFixed(6)} km²`;
  }
}

/**
 * Formate une longueur en unités lisibles.
 *
 * @param {number} m - Longueur en mètres
 * @returns {string} Ex: "350.4 m" ou "12.34 km"
 */
function formatLength(m) {
  if (m < 1000) {
    return `${m.toFixed(1)} m`;
  } else {
    return `${(m / 1000).toFixed(3)} km`;
  }
}

// ============================================================
// Utilitaires
// ============================================================

/** Convertit des degrés en radians */
function toRad(deg) {
  return deg * Math.PI / 180;
}

/**
 * Calcule le centre de masse (centroïde) d'un polygone.
 *
 * @param {Array<Array<number>>} coords - [[x, y], ...]
 * @returns {Array<number>} [cx, cy]
 */
function centroid(coords) {
  if (!coords || coords.length === 0) return [0, 0];
  const n = coords.length;
  let cx = 0, cy = 0;
  for (const [x, y] of coords) {
    cx += x;
    cy += y;
  }
  return [cx / n, cy / n];
}

/**
 * Calcule les statistiques d'un ensemble de distances (min, max, moyenne).
 *
 * @param {Array<number>} distances - En mètres
 * @returns {{ min: number, max: number, mean: number }}
 */
function distanceStats(distances) {
  if (!distances.length) return { min: 0, max: 0, mean: 0 };
  const min = Math.min(...distances);
  const max = Math.max(...distances);
  const mean = distances.reduce((s, v) => s + v, 0) / distances.length;
  return { min, max, mean };
}
