/**
 * import.js — Import de fichiers SIG (SHP, DXF, GeoJSON, KML, CSV)
 * Géoportail Maroc
 *
 * Support : Shapefile (ZIP), DXF, GeoJSON, KML, CSV avec X/Y.
 * Drag & drop + bouton parcourir.
 * Détection automatique de la projection depuis .PRJ.
 */

// ============================================================
// Initialisation de la zone d'import
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  initImportZone();
});

function initImportZone() {
  const dropZone = document.getElementById("drop-zone");
  const fileInput = document.getElementById("file-input");
  const browseBtn = document.getElementById("btn-browse");
  const doImportBtn = document.getElementById("btn-do-import");

  if (!dropZone) return;

  // Drag & drop
  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  });

  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("dragover");
  });

  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    const files = Array.from(e.dataTransfer.files);
    handleFilesSelected(files);
  });

  // Bouton parcourir
  browseBtn?.addEventListener("click", () => fileInput?.click());

  fileInput?.addEventListener("change", (e) => {
    const files = Array.from(e.target.files);
    handleFilesSelected(files);
    e.target.value = ""; // reset
  });

  // Bouton import
  doImportBtn?.addEventListener("click", doImport);
}

// ============================================================
// Gestion des fichiers sélectionnés
// ============================================================

let _pendingFiles = []; // Fichiers en attente d'import

/**
 * Traite les fichiers sélectionnés et affiche les options.
 * @param {File[]} files
 */
function handleFilesSelected(files) {
  _pendingFiles = files;

  const fileListEl = document.getElementById("import-file-list");
  const optionsEl = document.getElementById("import-options");
  if (!fileListEl || !optionsEl) return;

  // Afficher la liste des fichiers
  fileListEl.innerHTML = `
    <div style="margin-bottom:10px;">
      <p style="font-size:12px;font-weight:600;margin-bottom:6px;">Fichiers sélectionnés :</p>
      ${files.map(f => `
        <div style="display:flex;align-items:center;gap:6px;padding:4px 6px;background:var(--bg-dark);border-radius:3px;margin-bottom:3px;font-size:12px;">
          <span>${getFileTypeIcon(f.name)}</span>
          <span>${f.name}</span>
          <span style="color:var(--text-muted);margin-left:auto;">${formatFileSize(f.size)}</span>
        </div>
      `).join("")}
    </div>
  `;

  // Afficher les options
  optionsEl.classList.remove("hidden");
}

/**
 * Lance l'import des fichiers.
 */
async function doImport() {
  if (!_pendingFiles || _pendingFiles.length === 0) {
    showToast("Aucun fichier sélectionné", "warning");
    return;
  }

  const progressEl = document.getElementById("import-progress");
  const optionsEl = document.getElementById("import-options");
  const progressFill = document.getElementById("import-progress-fill");
  const statusText = document.getElementById("import-status-text");

  optionsEl.classList.add("hidden");
  progressEl.classList.remove("hidden");

  const userProjection = document.getElementById("import-projection")?.value || "auto";
  let imported = 0;

  for (let i = 0; i < _pendingFiles.length; i++) {
    const file = _pendingFiles[i];
    const pct = Math.round((i / _pendingFiles.length) * 100);

    progressFill.style.width = pct + "%";
    statusText.textContent = `Import de ${file.name}...`;

    try {
      await importFile(file, userProjection);
      imported++;
    } catch (err) {
      console.error(`[Import] Erreur ${file.name} :`, err);
      showToast(`Erreur : ${file.name} — ${err.message}`, "error", 5000);
    }
  }

  progressFill.style.width = "100%";
  statusText.textContent = `${imported} fichier(s) importé(s) avec succès.`;

  setTimeout(() => {
    progressEl.classList.add("hidden");
    document.getElementById("import-options").classList.add("hidden");
    document.getElementById("drop-zone").style.display = "";
    closeModal("modal-import");
    showToast(`${imported} couche(s) ajoutée(s)`, "success");
  }, 1500);
}

// ============================================================
// Dispatch selon le type de fichier
// ============================================================

/**
 * Importe un fichier selon son extension.
 * @param {File}   file
 * @param {string} userProjection - "auto" ou code EPSG
 */
async function importFile(file, userProjection) {
  const ext = getExtension(file.name).toLowerCase();

  if (ext === "zip") {
    await importShapefile(file, userProjection);
  } else if (ext === "geojson" || ext === "json") {
    await importGeoJSON(file, userProjection);
  } else if (ext === "kml") {
    await importKML(file);
  } else if (ext === "csv") {
    await importCSV(file, userProjection);
  } else if (ext === "dxf") {
    await importDXF(file, userProjection);
  } else {
    throw new Error(`Format non supporté : .${ext}`);
  }
}

// ============================================================
// Import Shapefile (ZIP)
// ============================================================

/**
 * Importe un Shapefile depuis un ZIP (shp + dbf + prj).
 * Utilise la bibliothèque shpjs.
 *
 * @param {File}   file
 * @param {string} userProjection
 */
async function importShapefile(file, userProjection) {
  if (typeof shp === "undefined") {
    throw new Error("La bibliothèque shpjs n'est pas chargée");
  }

  const arrayBuffer = await file.arrayBuffer();

  let geojson;
  try {
    geojson = await shp(arrayBuffer);
  } catch (err) {
    throw new Error("Lecture SHP échouée : " + err.message);
  }

  // shpjs peut retourner un tableau de FeatureCollection (multi-layer)
  const collections = Array.isArray(geojson) ? geojson : [geojson];

  for (const collection of collections) {
    // Détection de la projection
    const srcProj = userProjection !== "auto" ? userProjection : "EPSG:4326";

    addGeoJSONToMap(collection, file.name.replace(".zip", ""), srcProj);
  }
}

// ============================================================
// Import GeoJSON
// ============================================================

/**
 * Importe un fichier GeoJSON.
 *
 * @param {File}   file
 * @param {string} userProjection
 */
async function importGeoJSON(file, userProjection) {
  const text = await file.text();
  let geojson;

  try {
    geojson = JSON.parse(text);
  } catch (err) {
    throw new Error("JSON invalide : " + err.message);
  }

  if (!geojson.type) {
    throw new Error("GeoJSON invalide : propriété 'type' manquante");
  }

  const srcProj = userProjection !== "auto" ? userProjection : "EPSG:4326";
  addGeoJSONToMap(geojson, file.name, srcProj);
}

// ============================================================
// Import KML
// ============================================================

/**
 * Importe un fichier KML via le format OL.
 * @param {File} file
 */
async function importKML(file) {
  const text = await file.text();
  const format = new ol.format.KML({
    extractStyles: true,
    showPointNames: true,
  });

  let features;
  try {
    features = format.readFeatures(text, {
      dataProjection: "EPSG:4326",
      featureProjection: "EPSG:3857",
    });
  } catch (err) {
    throw new Error("KML invalide : " + err.message);
  }

  if (features.length === 0) {
    throw new Error("Aucune entité trouvée dans le KML");
  }

  addFeaturesToMap(features, file.name, "KML");
}

// ============================================================
// Import CSV (avec colonnes X, Y)
// ============================================================

/**
 * Importe un fichier CSV avec colonnes X/Y.
 * Détecte automatiquement les colonnes de coordonnées.
 *
 * @param {File}   file
 * @param {string} userProjection
 */
async function importCSV(file, userProjection) {
  const text = await file.text();
  const lines = text.trim().split(/\r?\n/);

  if (lines.length < 2) {
    throw new Error("CSV trop court (en-tête + au moins 1 ligne)");
  }

  // Détection du séparateur (virgule, point-virgule, tabulation)
  const header = lines[0];
  const sep = header.includes(";") ? ";" : header.includes("\t") ? "\t" : ",";
  const headers = header.split(sep).map(h => h.trim().toLowerCase().replace(/"/g, ""));

  // Détection des colonnes X/Y
  const xNames = ["x", "lon", "longitude", "lng", "east", "est"];
  const yNames = ["y", "lat", "latitude", "north", "nord"];

  const xCol = headers.findIndex(h => xNames.includes(h));
  const yCol = headers.findIndex(h => yNames.includes(h));

  if (xCol === -1 || yCol === -1) {
    throw new Error("Colonnes X/Y non trouvées. En-têtes attendus : x/lon/longitude, y/lat/latitude");
  }

  const srcProj = userProjection !== "auto" ? userProjection : "EPSG:4326";
  const features = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = lines[i].split(sep).map(c => c.trim().replace(/"/g, ""));

    const rawX = parseFloat(cells[xCol]);
    const rawY = parseFloat(cells[yCol]);

    if (isNaN(rawX) || isNaN(rawY)) continue;

    // Conversion vers WGS84 si nécessaire, puis vers Mercator pour OL
    let lon = rawX, lat = rawY;
    if (srcProj !== "EPSG:4326") {
      const wgs = toWGS84(rawX, rawY, srcProj);
      lon = wgs.lon;
      lat = wgs.lat;
    }

    const mercCoord = wgs84ToMercator(lon, lat);
    const feature = new ol.Feature({
      geometry: new ol.geom.Point([mercCoord.x, mercCoord.y]),
      featureType: "imported",
    });

    // Attributs
    const props = {};
    headers.forEach((h, j) => {
      if (j !== xCol && j !== yCol) {
        props[h] = cells[j];
      }
    });
    feature.setProperties(props);

    features.push(feature);
  }

  if (features.length === 0) {
    throw new Error("Aucune entité valide trouvée dans le CSV");
  }

  addFeaturesToMap(features, file.name, "CSV", `${features.length} points`);
  showToast(`${features.length} points importés depuis ${file.name}`, "success");
}

// ============================================================
// Import DXF
// ============================================================

/**
 * Importe un fichier DXF.
 * Parser DXF minimal intégré (LINE, LWPOLYLINE, POLYLINE, POINT, CIRCLE, ARC, TEXT, INSERT).
 *
 * @param {File} file
 */
async function importDXF(file, userProjection = "auto") {
  const text = await file.text();
  const srcProj = userProjection !== "auto" ? userProjection : "EPSG:4326";
  const features = parseDXF(text, srcProj);

  if (features.length === 0) {
    throw new Error("Aucune entité géométrique trouvée dans le DXF");
  }

  addFeaturesToMap(features, file.name, "DXF", `${features.length} entités`);
  showToast(`${features.length} entités DXF importées`, "success");
}

/**
 * Parse un fichier DXF et retourne des features OpenLayers (EPSG:3857).
 * Hypothèse : les coordonnées DXF sont en WGS84 ou Merchich selon la config.
 *
 * @param {string} dxfText
 * @returns {ol.Feature[]}
 */
function parseDXF(dxfText, srcProjection = "EPSG:4326") {
  const features = [];

  // Normalisation des fins de ligne
  const lines = dxfText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  let i = 0;

  /**
   * Lit la prochaine paire (code, valeur) du DXF.
   * @returns {{ code: number, value: string }|null}
   */
  function readPair() {
    if (i >= lines.length - 1) return null;
    const code = parseInt(lines[i++].trim());
    const value = lines[i++].trim();
    return { code, value };
  }

  // Passer à la section ENTITIES
  while (i < lines.length) {
    const pair = readPair();
    if (!pair) break;
    if (pair.code === 2 && pair.value === "ENTITIES") break;
  }

  // Parser les entités
  while (i < lines.length) {
    const pair = readPair();
    if (!pair) break;
    if (pair.code === 0) {
      const entityType = pair.value;
      if (entityType === "ENDSEC" || entityType === "EOF") break;

      // POLYLINE ancien style : lire les VERTEX qui suivent jusqu'à SEQEND
      if (entityType === "POLYLINE") {
        const result = parseDXFPolyline(lines, i, srcProjection);
        if (result) {
          features.push(result.feature);
          i = result.nextIndex;
        } else {
          // Avancer jusqu'au SEQEND
          while (i < lines.length) {
            const c = parseInt(lines[i]?.trim());
            const v = lines[i + 1]?.trim();
            i += 2;
            if (c === 0 && (v === "SEQEND" || v === "ENDSEC" || v === "EOF")) break;
          }
        }
        continue;
      }

      const feature = parseDXFEntity(entityType, lines, i, srcProjection);
      if (feature) {
        features.push(feature.feature);
        i = feature.nextIndex;
      }
    }
  }

  return features;
}

/**
 * Parse un POLYLINE ancien style (AutoCAD pré-2000).
 * Les sommets sont dans des entités VERTEX séparées jusqu'à SEQEND.
 *
 * @param {string[]} lines
 * @param {number}   startI  - Index après le 0\nPOLYLINE\n
 * @param {string}   srcProjection
 * @returns {{ feature: ol.Feature, nextIndex: number }|null}
 */
function parseDXFPolyline(lines, startI, srcProjection) {
  let i = startI;
  let layer = "0";
  let isClosed = false;
  const vertices = [];

  // Lire le header POLYLINE jusqu'au premier VERTEX ou SEQEND
  while (i < lines.length) {
    const code = parseInt(lines[i]?.trim());
    const value = lines[i + 1]?.trim();
    if (value === undefined) break;
    i += 2;
    if (code === 0) { i -= 2; break; }
    if (code === 8) layer = value;
    if (code === 70) isClosed = (parseInt(value) & 1) === 1;
  }

  // Lire les VERTEX
  while (i < lines.length) {
    const code = parseInt(lines[i]?.trim());
    const value = lines[i + 1]?.trim();
    if (value === undefined) break;
    if (code === 0 && value === "SEQEND") { i += 2; break; }
    if (code === 0 && value === "VERTEX") {
      i += 2;
      let vx = 0, vy = 0;
      while (i < lines.length) {
        const c = parseInt(lines[i]?.trim());
        const v = lines[i + 1]?.trim();
        if (v === undefined) break;
        i += 2;
        if (c === 0) { i -= 2; break; }
        if (c === 10) vx = parseFloat(v) || 0;
        if (c === 20) vy = parseFloat(v) || 0;
      }
      vertices.push({ x: vx, y: vy });
    } else {
      i += 2;
    }
  }

  if (vertices.length < 2) return null;

  const mercVerts = vertices.map(v => {
    const m = dxfCoordsToMerc(v.x, v.y, srcProjection);
    return [m.x, m.y];
  });

  let geom;
  if (isClosed) {
    mercVerts.push(mercVerts[0]);
    geom = new ol.geom.Polygon([mercVerts]);
  } else {
    geom = new ol.geom.LineString(mercVerts);
  }

  return {
    feature: new ol.Feature({ geometry: geom, featureType: "imported", layer }),
    nextIndex: i,
  };
}

/**
 * Parse une entité DXF et retourne la feature OL correspondante.
 *
 * @param {string}   type    - Type d'entité DXF (LINE, POINT, LWPOLYLINE, ...)
 * @param {string[]} lines   - Tableau des lignes du fichier
 * @param {number}   startI  - Index de départ
 * @returns {{ feature: ol.Feature, nextIndex: number }|null}
 */
function parseDXFEntity(type, lines, startI, srcProjection = "EPSG:4326") {
  let i = startI;
  const props = {};
  const vertices = [];
  let x = 0, y = 0, z = 0;
  let x1 = 0, y1 = 0, x2 = 0, y2 = 0;
  let radius = 0;
  let isClosed = false;
  let layer = "0";

  // Lire les propriétés jusqu'à la prochaine entité
  while (i < lines.length) {
    const codeStr = lines[i]?.trim();
    const value = lines[i + 1]?.trim();
    if (codeStr === undefined || value === undefined) break;

    const code = parseInt(codeStr);
    i += 2;

    if (code === 0) {
      // Prochaine entité — revenir 2 lignes en arrière
      i -= 2;
      break;
    }

    if (code === 8) layer = value;
    else if (code === 10) x = parseFloat(value) || 0;
    else if (code === 20) y = parseFloat(value) || 0;
    else if (code === 30) z = parseFloat(value) || 0;
    else if (code === 11) x2 = parseFloat(value) || 0;
    else if (code === 21) y2 = parseFloat(value) || 0;
    else if (code === 40) radius = parseFloat(value) || 0;
    else if (code === 70) isClosed = (parseInt(value) & 1) === 1;

    // LWPOLYLINE vertices
    if (type === "LWPOLYLINE" || type === "POLYLINE") {
      if (code === 10) {
        vertices.push({ x: parseFloat(value) || 0, y: y });
      } else if (code === 20 && vertices.length > 0) {
        vertices[vertices.length - 1].y = parseFloat(value) || 0;
      }
    }
  }

  let olFeature = null;

  try {
    switch (type) {
      case "POINT": {
        const merc = dxfCoordsToMerc(x, y, srcProjection);
        olFeature = new ol.Feature({
          geometry: new ol.geom.Point([merc.x, merc.y]),
          featureType: "imported",
          layer,
        });
        break;
      }

      case "LINE": {
        const p1 = dxfCoordsToMerc(x, y, srcProjection);
        const p2 = dxfCoordsToMerc(x2, y2, srcProjection);
        olFeature = new ol.Feature({
          geometry: new ol.geom.LineString([[p1.x, p1.y], [p2.x, p2.y]]),
          featureType: "imported",
          layer,
        });
        break;
      }

      case "LWPOLYLINE": {
        if (vertices.length < 2) break;
        const mercVerts = vertices.map(v => {
          const m = dxfCoordsToMerc(v.x, v.y, srcProjection);
          return [m.x, m.y];
        });

        if (isClosed) {
          mercVerts.push(mercVerts[0]); // Fermer le polygone
          olFeature = new ol.Feature({
            geometry: new ol.geom.Polygon([mercVerts]),
            featureType: "imported",
            layer,
          });
        } else {
          olFeature = new ol.Feature({
            geometry: new ol.geom.LineString(mercVerts),
            featureType: "imported",
            layer,
          });
        }
        break;
      }

      case "CIRCLE": {
        // Approximation du cercle par 64 points
        const center = dxfCoordsToMerc(x, y, srcProjection);
        const circlePoints = [];
        for (let a = 0; a <= 360; a += 360 / 64) {
          const rad = a * Math.PI / 180;
          circlePoints.push([
            center.x + radius * Math.cos(rad),
            center.y + radius * Math.sin(rad),
          ]);
        }
        olFeature = new ol.Feature({
          geometry: new ol.geom.Polygon([circlePoints]),
          featureType: "imported",
          layer,
        });
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.warn(`[DXF] Erreur entité ${type} :`, err);
  }

  return olFeature ? { feature: olFeature, nextIndex: i } : null;
}

/**
 * Convertit des coordonnées DXF vers Mercator (EPSG:3857).
 * Utilise proj4 avec la projection source spécifiée par l'utilisateur.
 *
 * @param {number} x            - Longitude/Est dans srcProjection
 * @param {number} y            - Latitude/Nord dans srcProjection
 * @param {string} srcProjection - Code EPSG source (ex: "EPSG:26191", "EPSG:4326")
 * @returns {{ x: number, y: number }} Coordonnées EPSG:3857
 */
function dxfCoordsToMerc(x, y, srcProjection = "EPSG:4326") {
  try {
    const [mx, my] = proj4(srcProjection, "EPSG:3857", [x, y]);
    return { x: mx, y: my };
  } catch (e) {
    // Fallback : si WGS84 détectable
    if (x >= -180 && x <= 180 && y >= -90 && y <= 90) {
      return wgs84ToMercator(x, y);
    }
    return { x, y };
  }
}

// ============================================================
// Ajout des features à la carte
// ============================================================

/**
 * Ajoute des features GeoJSON à la carte via OpenLayers.
 *
 * @param {Object} geojson       - FeatureCollection GeoJSON
 * @param {string} layerName     - Nom de la couche
 * @param {string} srcProjection - Code EPSG source
 */
function addGeoJSONToMap(geojson, layerName, srcProjection = "EPSG:4326") {
  const format = new ol.format.GeoJSON();

  let features;
  try {
    features = format.readFeatures(geojson, {
      dataProjection: srcProjection,
      featureProjection: "EPSG:3857",
    });
  } catch (err) {
    throw new Error("Lecture GeoJSON OpenLayers échouée : " + err.message);
  }

  if (features.length === 0) {
    throw new Error("Aucune entité dans le fichier");
  }

  features.forEach(f => f.set("featureType", "imported"));

  addFeaturesToMap(features, layerName, getGeomTypeBadge(features), `${features.length} entités`);
}

/**
 * Crée une couche vecteur avec les features et l'ajoute à la carte.
 *
 * @param {ol.Feature[]} features
 * @param {string}       layerName
 * @param {string}       typeLabel
 * @param {string}       [info]
 */
function addFeaturesToMap(features, layerName, typeLabel, info) {
  const source = new ol.source.Vector({ features });
  const olLayer = new ol.layer.Vector({
    source,
    style: (feature) => getImportedStyle(feature),
    zIndex: 5,
  });

  APP.map.addLayer(olLayer);

  // Enregistrement dans l'état
  const layerDef = {
    name: layerName,
    type: typeLabel,
    olLayer,
    source,
    featureCount: features.length,
  };
  APP.importedLayers.push(layerDef);

  // Zoom sur l'étendue
  try {
    const extent = source.getExtent();
    if (extent && isFinite(extent[0])) {
      APP.map.getView().fit(extent, {
        padding: [40, 40, 40, 40],
        maxZoom: 18,
        duration: 600,
      });
    }
  } catch (e) {}

  // Mise à jour de la sidebar
  renderLayersList();
}

// ============================================================
// Style des couches importées
// ============================================================

/**
 * Style pour les entités importées (auto-couleur par type).
 * @param {ol.Feature} feature
 * @returns {ol.style.Style}
 */
function getImportedStyle(feature) {
  const geomType = feature.getGeometry()?.getType();
  const layer = feature.get("layer") || "";

  // Couleur aléatoire stable basée sur le nom du layer
  const layerColor = stringToColor(layer || "default");

  const fill = new ol.style.Fill({ color: hexToRGBA(layerColor, 0.25) });
  const stroke = new ol.style.Stroke({ color: layerColor, width: 2 });

  if (geomType === "Point" || geomType === "MultiPoint") {
    return new ol.style.Style({
      image: new ol.style.Circle({ radius: 5, fill: new ol.style.Fill({ color: layerColor }), stroke }),
    });
  }

  return new ol.style.Style({ fill, stroke });
}

/**
 * Génère une couleur hex à partir d'une chaîne (stable).
 * @param {string} str
 * @returns {string} Code couleur hex
 */
function stringToColor(str) {
  const palette = [
    "#4caf50", "#2196f3", "#ff9800", "#9c27b0",
    "#00bcd4", "#ff5722", "#607d8b", "#8bc34a",
    "#3f51b5", "#e91e63",
  ];
  let hash = 0;
  for (let c of str) hash = (hash * 31 + c.charCodeAt(0)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

// ============================================================
// Utilitaires
// ============================================================

/**
 * Retourne l'extension d'un fichier (sans le point).
 * @param {string} filename
 * @returns {string}
 */
function getExtension(filename) {
  return filename.split(".").pop() || "";
}

/**
 * Retourne une icône emoji selon le type de fichier.
 * @param {string} filename
 * @returns {string}
 */
function getFileTypeIcon(filename) {
  const ext = getExtension(filename).toLowerCase();
  const icons = {
    zip: "🗜️", shp: "🗺️", geojson: "🌐", json: "🌐",
    kml: "📍", csv: "📊", dxf: "📐", dwg: "📐",
  };
  return icons[ext] || "📄";
}

/**
 * Formate une taille de fichier en format lisible.
 * @param {number} bytes
 * @returns {string}
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / 1048576).toFixed(1)} Mo`;
}

/**
 * Retourne un badge de type géométrique basé sur les features.
 * @param {ol.Feature[]} features
 * @returns {string}
 */
function getGeomTypeBadge(features) {
  if (!features.length) return "?";
  const types = new Set(features.map(f => f.getGeometry()?.getType()));
  if (types.size === 1) return [...types][0];
  return "Mixed";
}
