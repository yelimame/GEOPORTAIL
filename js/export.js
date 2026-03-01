/**
 * export.js — Export des données SIG (GeoJSON, KML, CSV, DXF, SHP)
 * Géoportail Maroc
 *
 * Export des couches dessinées, marqueurs et couches importées.
 * Reprojection optionnelle vers WGS84 ou Merchich.
 */

// ============================================================
// Initialisation du panel export
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-do-export")?.addEventListener("click", doExport);
});

/**
 * Construit la liste des couches importées dans le modal export.
 */
function buildExportLayersList() {
  const container = document.getElementById("export-imported-layers");
  if (!container) return;

  container.innerHTML = APP.importedLayers.map((layer, idx) => `
    <label class="checkbox-row">
      <input type="checkbox" class="export-imported-cb" data-idx="${idx}" checked>
      ${layer.name} <span style="color:var(--text-muted);font-size:10px;">(${layer.featureCount} entités)</span>
    </label>
  `).join("");
}

// ============================================================
// Déclenchement de l'export
// ============================================================

/**
 * Lance l'export selon le format sélectionné.
 */
async function doExport() {
  const format = document.querySelector('input[name="export-format"]:checked')?.value;
  const outProjection = document.getElementById("export-projection")?.value || "EPSG:4326";
  const exportDrawn = document.getElementById("export-drawn")?.checked;
  const exportMarkers = document.getElementById("export-markers")?.checked;

  if (!format) {
    showToast("Sélectionnez un format d'export", "warning");
    return;
  }

  // Collecter toutes les features à exporter
  const allFeatures = collectFeaturesForExport(exportDrawn, exportMarkers);

  if (allFeatures.length === 0) {
    showToast("Aucune donnée à exporter", "warning");
    return;
  }

  try {
    switch (format) {
      case "geojson": exportGeoJSON(allFeatures, outProjection); break;
      case "kml":     exportKML(allFeatures, outProjection);     break;
      case "csv":     exportCSV(allFeatures, outProjection);     break;
      case "dxf":     exportDXF(allFeatures, outProjection);     break;
      case "shp":     await exportSHP(allFeatures, outProjection); break;
    }

    closeModal("modal-export");
    showToast(`Export ${format.toUpperCase()} terminé`, "success");

  } catch (err) {
    console.error("[Export] Erreur :", err);
    showToast("Erreur d'export : " + err.message, "error");
  }
}

/**
 * Collecte les features à exporter selon les options cochées.
 *
 * @param {boolean} includeDrawn
 * @param {boolean} includeMarkers
 * @returns {Array<{type: string, feature: ol.Feature}>}
 */
function collectFeaturesForExport(includeDrawn, includeMarkers) {
  const result = [];

  // Géométries dessinées
  if (includeDrawn && APP.drawSource) {
    const drawn = APP.drawSource.getFeatures().filter(
      f => f.get("featureType") !== "measure"
    );
    drawn.forEach(f => result.push({ type: "drawn", feature: f }));
  }

  // Marqueurs
  if (includeMarkers && APP.markerSource) {
    APP.markerSource.getFeatures().forEach(f => {
      result.push({ type: "marker", feature: f });
    });
  }

  // Couches importées cochées
  document.querySelectorAll(".export-imported-cb:checked").forEach(cb => {
    const idx = parseInt(cb.dataset.idx);
    const layer = APP.importedLayers[idx];
    if (layer && layer.source) {
      layer.source.getFeatures().forEach(f => {
        result.push({ type: "imported", feature: f });
      });
    }
  });

  return result;
}

// ============================================================
// Export GeoJSON
// ============================================================

/**
 * Exporte les features en GeoJSON.
 *
 * @param {Array} items
 * @param {string} outProjection
 */
function exportGeoJSON(items, outProjection) {
  const format = new ol.format.GeoJSON();

  const olFeatures = items.map(item => {
    const clone = item.feature.clone();
    // De Mercator vers projection cible
    clone.getGeometry().transform("EPSG:3857", "EPSG:4326");
    if (outProjection !== "EPSG:4326") {
      // Re-transformer vers projection cible
      const geom = clone.getGeometry();
      transformGeometryToProjection(geom, "EPSG:4326", outProjection);
    }
    return clone;
  });

  const geojson = format.writeFeaturesObject(olFeatures, {
    featureProjection: outProjection !== "EPSG:4326" ? outProjection : "EPSG:4326",
    dataProjection: outProjection !== "EPSG:4326" ? outProjection : "EPSG:4326",
  });

  geojson._crs = { type: "name", properties: { name: outProjection } };

  downloadFile(
    JSON.stringify(geojson, null, 2),
    "export_geoportail.geojson",
    "application/geo+json"
  );
}

// ============================================================
// Export KML
// ============================================================

/**
 * Exporte les features en KML (WGS84 obligatoire).
 * @param {Array} items
 * @param {string} outProjection - KML est toujours en WGS84
 */
function exportKML(items, outProjection) {
  const format = new ol.format.KML({ writeStyles: true });

  const olFeatures = items.map(item => {
    const clone = item.feature.clone();
    clone.getGeometry().transform("EPSG:3857", "EPSG:4326");
    return clone;
  });

  const kml = format.writeFeatures(olFeatures, {
    featureProjection: "EPSG:4326",
    dataProjection: "EPSG:4326",
  });

  downloadFile(kml, "export_geoportail.kml", "application/vnd.google-earth.kml+xml");
}

// ============================================================
// Export CSV
// ============================================================

/**
 * Exporte les features en CSV (X, Y + attributs).
 * @param {Array}  items
 * @param {string} outProjection
 */
function exportCSV(items, outProjection) {
  const rows = ["ID,Type,X,Y,Nom,Couleur,Attributs"];

  items.forEach((item, idx) => {
    const f = item.feature;
    const geom = f.getGeometry();
    if (!geom) return;

    // Centroïde de la géométrie
    let centroidCoord = getGeomCentroid(geom);

    // Conversion de Mercator vers WGS84 puis vers projection cible
    const wgs = mercatorToWGS84(centroidCoord[0], centroidCoord[1]);
    let finalX = wgs.lon;
    let finalY = wgs.lat;

    if (outProjection !== "EPSG:4326") {
      const res = convertCoords(wgs.lon, wgs.lat, "EPSG:4326", outProjection);
      finalX = res.x;
      finalY = res.y;
    }

    const name = f.get("name") || f.get("nom") || "";
    const color = f.get("color") || "";
    const attrs = JSON.stringify(f.getProperties()).replace(/"/g, '""');

    rows.push(`${idx + 1},"${item.type}",${finalX.toFixed(6)},${finalY.toFixed(6)},"${name}","${color}","${attrs}"`);
  });

  downloadFile(rows.join("\n"), "export_geoportail.csv", "text/csv;charset=utf-8");
}

// ============================================================
// Export DXF
// ============================================================

/**
 * Exporte les features au format DXF (AutoCAD).
 * Génère un DXF R2000 minimal avec les entités géométriques.
 *
 * @param {Array}  items
 * @param {string} outProjection
 */
function exportDXF(items, outProjection) {
  const layers = new Set(["0"]);
  const entities = [];

  items.forEach((item, idx) => {
    const f = item.feature;
    const geom = f.getGeometry();
    if (!geom) return;

    const layerName = (f.get("layer") || item.type || "0").replace(/[^a-zA-Z0-9_-]/g, "_");
    layers.add(layerName);

    const name = f.get("name") || "";
    const dxfEntities = geometryToDXF(geom, layerName, outProjection);
    entities.push(...dxfEntities);
  });

  const dxf = buildDXFFile(layers, entities);
  downloadFile(dxf, "export_geoportail.dxf", "application/dxf");
}

/**
 * Convertit une géométrie OL en entités DXF.
 *
 * @param {ol.geom.Geometry} geom
 * @param {string}           layer
 * @param {string}           outProjection
 * @returns {string[]}       Tableau de blocs d'entités DXF
 */
function geometryToDXF(geom, layer, outProjection) {
  const entities = [];
  const type = geom.getType();

  /**
   * Convertit des coordonnées Mercator vers la projection de sortie.
   * @param {number} mx
   * @param {number} my
   * @returns {[number, number]}
   */
  function toOut(mx, my) {
    const wgs = mercatorToWGS84(mx, my);
    if (outProjection === "EPSG:4326") {
      return [wgs.lon, wgs.lat];
    }
    const res = convertCoords(wgs.lon, wgs.lat, "EPSG:4326", outProjection);
    return [res.x, res.y];
  }

  if (type === "Point") {
    const [mx, my] = geom.getCoordinates();
    const [x, y] = toOut(mx, my);
    entities.push(dxfPoint(x, y, layer));

  } else if (type === "LineString") {
    const coords = geom.getCoordinates().map(([mx, my]) => toOut(mx, my));
    entities.push(dxfLWPolyline(coords, false, layer));

  } else if (type === "Polygon") {
    const rings = geom.getCoordinates();
    rings.forEach(ring => {
      const coords = ring.map(([mx, my]) => toOut(mx, my));
      entities.push(dxfLWPolyline(coords, true, layer));
    });

  } else if (type === "MultiPoint") {
    geom.getPoints().forEach(pt => {
      const [mx, my] = pt.getCoordinates();
      const [x, y] = toOut(mx, my);
      entities.push(dxfPoint(x, y, layer));
    });

  } else if (type === "MultiLineString") {
    geom.getLineStrings().forEach(ls => {
      const coords = ls.getCoordinates().map(([mx, my]) => toOut(mx, my));
      entities.push(dxfLWPolyline(coords, false, layer));
    });

  } else if (type === "MultiPolygon") {
    geom.getPolygons().forEach(poly => {
      poly.getCoordinates().forEach(ring => {
        const coords = ring.map(([mx, my]) => toOut(mx, my));
        entities.push(dxfLWPolyline(coords, true, layer));
      });
    });

  } else if (type === "Circle") {
    // Exporter le cercle comme LWPOLYLINE approximatif
    const center = geom.getCenter();
    const radiusMerc = geom.getRadius();
    const circleCoords = [];
    for (let a = 0; a <= 360; a += 5) {
      const rad = a * Math.PI / 180;
      circleCoords.push(toOut(
        center[0] + radiusMerc * Math.cos(rad),
        center[1] + radiusMerc * Math.sin(rad)
      ));
    }
    entities.push(dxfLWPolyline(circleCoords, true, layer));
  }

  return entities;
}

// ---- Générateurs d'entités DXF ----

function dxfPoint(x, y, layer) {
  return `0\nPOINT\n8\n${layer}\n10\n${x.toFixed(6)}\n20\n${y.toFixed(6)}\n30\n0.0\n`;
}

function dxfLWPolyline(coords, closed, layer) {
  const flag = closed ? 1 : 0;
  let entity = `0\nLWPOLYLINE\n8\n${layer}\n90\n${coords.length}\n70\n${flag}\n`;
  coords.forEach(([x, y]) => {
    entity += `10\n${x.toFixed(6)}\n20\n${y.toFixed(6)}\n`;
  });
  return entity;
}

/**
 * Assemble le fichier DXF complet.
 *
 * @param {Set<string>} layers   - Noms des layers
 * @param {string[]}    entities - Blocs d'entités
 * @returns {string}
 */
function buildDXFFile(layers, entities) {
  // En-tête DXF minimal
  let dxf = `0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1015\n0\nENDSEC\n`;

  // Section TABLES (layers)
  dxf += `0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n${layers.size}\n`;
  layers.forEach(name => {
    dxf += `0\nLAYER\n2\n${name}\n70\n0\n62\n7\n6\nCONTINUOUS\n`;
  });
  dxf += `0\nENDTAB\n0\nENDSEC\n`;

  // Section ENTITIES
  dxf += `0\nSECTION\n2\nENTITIES\n`;
  entities.forEach(e => { dxf += e; });
  dxf += `0\nENDSEC\n0\nEOF\n`;

  return dxf;
}

// ============================================================
// Export Shapefile (ZIP)
// ============================================================

/**
 * Exporte les features en Shapefile ZIP (shp + shx + dbf + prj).
 * Implémentation manuelle du format Shapefile binaire.
 *
 * @param {Array}  items
 * @param {string} outProjection
 */
async function exportSHP(items, outProjection) {
  if (typeof JSZip === "undefined") {
    throw new Error("JSZip non chargé — impossible de créer l'archive ZIP");
  }

  // Séparer les points, lignes, polygones
  const points = [], lines = [], polys = [];

  items.forEach(item => {
    const f = item.feature;
    const geom = f.getGeometry();
    if (!geom) return;

    const type = geom.getType();
    const coordsWGS = getGeomCoordsWGS84(geom, outProjection);

    if (type === "Point" || type === "MultiPoint") {
      points.push({ f, coordsWGS, type });
    } else if (type === "LineString" || type === "MultiLineString") {
      lines.push({ f, coordsWGS, type });
    } else if (type === "Polygon" || type === "MultiPolygon" || type === "Circle") {
      polys.push({ f, coordsWGS, type });
    }
  });

  const zip = new JSZip();

  // Exporter chaque type dans un SHP séparé si non vide
  const groups = [
    { name: "points", items: points, shpType: 1 },
    { name: "lines",  items: lines,  shpType: 3 },
    { name: "polys",  items: polys,  shpType: 5 },
  ];

  for (const group of groups) {
    if (group.items.length === 0) continue;

    try {
      const { shpBuf, shxBuf } = buildSHPBuffers(group.items, group.shpType);
      const dbfBuf = buildDBFBuffer(group.items);
      const prjContent = getPRJContent(outProjection);

      zip.file(`${group.name}.shp`, shpBuf);
      zip.file(`${group.name}.shx`, shxBuf);
      zip.file(`${group.name}.dbf`, dbfBuf);
      zip.file(`${group.name}.prj`, prjContent);
    } catch (err) {
      console.warn(`[Export SHP] Erreur groupe ${group.name}:`, err);
    }
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  downloadFile(zipBlob, "export_geoportail.zip", "application/zip");
}

/**
 * Construit les buffers .shp et .shx pour un ensemble de features.
 * Format Shapefile ESRI binaire (Big-endian / Little-endian mixte).
 *
 * @param {Array}  items
 * @param {number} shpType - 1=Point, 3=PolyLine, 5=Polygon
 * @returns {{ shpBuf: ArrayBuffer, shxBuf: ArrayBuffer }}
 */
function buildSHPBuffers(items, shpType) {
  const records = [];
  let totalContentBytes = 0;

  // Construire les enregistrements
  items.forEach((item, idx) => {
    const { coordsWGS } = item;
    let recBytes;

    if (shpType === 1) {
      // Point (5 * 8 bytes = 40 bytes: type + x + y)
      const pt = Array.isArray(coordsWGS[0]) ? coordsWGS[0] : coordsWGS;
      recBytes = new ArrayBuffer(20); // type(4) + x(8) + y(8)
      const view = new DataView(recBytes);
      view.setInt32(0, 1, true);  // shape type
      view.setFloat64(4, pt[0], true);  // x
      view.setFloat64(12, pt[1], true); // y

    } else if (shpType === 3 || shpType === 5) {
      // PolyLine / Polygon
      // Structure : type(4) + bbox(32) + numParts(4) + numPoints(4) + parts(4*np) + points(16*n)
      const parts = Array.isArray(coordsWGS[0][0]) ? coordsWGS : [coordsWGS];
      const numParts = parts.length;
      const numPoints = parts.reduce((sum, p) => sum + p.length, 0);
      const recSize = 4 + 32 + 4 + 4 + numParts * 4 + numPoints * 16;
      recBytes = new ArrayBuffer(recSize);
      const view = new DataView(recBytes);

      // Bounding box
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      parts.forEach(ring => ring.forEach(([x, y]) => {
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }));

      let offset = 0;
      view.setInt32(offset, shpType, true); offset += 4;
      view.setFloat64(offset, minX, true); offset += 8;
      view.setFloat64(offset, minY, true); offset += 8;
      view.setFloat64(offset, maxX, true); offset += 8;
      view.setFloat64(offset, maxY, true); offset += 8;
      view.setInt32(offset, numParts, true); offset += 4;
      view.setInt32(offset, numPoints, true); offset += 4;

      // Parts index
      let ptIdx = 0;
      parts.forEach(ring => {
        view.setInt32(offset, ptIdx, true); offset += 4;
        ptIdx += ring.length;
      });

      // Points
      parts.forEach(ring => {
        ring.forEach(([x, y]) => {
          view.setFloat64(offset, x, true); offset += 8;
          view.setFloat64(offset, y, true); offset += 8;
        });
      });
    } else {
      recBytes = new ArrayBuffer(0);
    }

    records.push({ bytes: recBytes, recordNumber: idx + 1 });
    totalContentBytes += 8 + recBytes.byteLength; // header(8) + content
  });

  // Fichier SHP : header(100) + records
  const shpSize = 100 + totalContentBytes;
  const shpBuf = new ArrayBuffer(shpSize);
  const shpView = new DataView(shpBuf);

  // Bounding box globale
  let gMinX = Infinity, gMinY = Infinity, gMaxX = -Infinity, gMaxY = -Infinity;
  items.forEach(item => {
    const coords = item.coordsWGS;
    const flat = Array.isArray(coords[0][0]) ? coords.flat() : coords;
    flat.forEach(([x, y]) => {
      gMinX = Math.min(gMinX, x); gMinY = Math.min(gMinY, y);
      gMaxX = Math.max(gMaxX, x); gMaxY = Math.max(gMaxY, y);
    });
  });

  // En-tête SHP (100 bytes)
  shpView.setInt32(0, 9994, false); // File code (Big-endian)
  shpView.setInt32(24, shpSize / 2, false); // File length en mots 16-bits
  shpView.setInt32(28, 1000, true); // Version
  shpView.setInt32(32, shpType, true); // Shape type
  shpView.setFloat64(36, gMinX, true); // Bbox Xmin
  shpView.setFloat64(44, gMinY, true); // Bbox Ymin
  shpView.setFloat64(52, gMaxX, true); // Bbox Xmax
  shpView.setFloat64(60, gMaxY, true); // Bbox Ymax

  // Fichier SHX : header(100) + index(8 * n)
  const shxBuf = new ArrayBuffer(100 + records.length * 8);
  const shxView = new DataView(shxBuf);
  shxView.setInt32(0, 9994, false);
  shxView.setInt32(24, (100 + records.length * 8) / 2, false);
  shxView.setInt32(28, 1000, true);
  shxView.setInt32(32, shpType, true);
  shxView.setFloat64(36, gMinX, true);
  shxView.setFloat64(44, gMinY, true);
  shxView.setFloat64(52, gMaxX, true);
  shxView.setFloat64(60, gMaxY, true);

  // Écriture des records
  let shpOffset = 100;
  records.forEach((rec, i) => {
    const contentLen = rec.bytes.byteLength;

    // SHX index
    shxView.setInt32(100 + i * 8, shpOffset / 2, false);       // Offset en mots
    shxView.setInt32(100 + i * 8 + 4, contentLen / 2, false);  // Longueur en mots

    // SHP record header
    shpView.setInt32(shpOffset, rec.recordNumber, false); // Record number
    shpView.setInt32(shpOffset + 4, contentLen / 2, false); // Content length
    shpOffset += 8;

    // SHP record content
    const src = new Uint8Array(rec.bytes);
    const dst = new Uint8Array(shpBuf, shpOffset, contentLen);
    dst.set(src);
    shpOffset += contentLen;
  });

  return { shpBuf, shxBuf };
}

/**
 * Construit le fichier DBF avec les attributs des features.
 * @param {Array} items
 * @returns {ArrayBuffer}
 */
function buildDBFBuffer(items) {
  // Champs : ID, NOM, TYPE (champs minimaux)
  const fields = [
    { name: "ID",   type: "N", length: 10, decimals: 0 },
    { name: "NOM",  type: "C", length: 50, decimals: 0 },
    { name: "TYPE", type: "C", length: 20, decimals: 0 },
  ];

  const fieldCount = fields.length;
  const recordSize = 1 + fields.reduce((sum, f) => sum + f.length, 0);
  const headerSize = 32 + fieldCount * 32 + 1;
  const dbfSize = headerSize + items.length * recordSize + 1;

  const buf = new ArrayBuffer(dbfSize);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  // En-tête DBF
  view.setUint8(0, 3); // Version dBASE III
  const now = new Date();
  view.setUint8(1, now.getFullYear() - 1900);
  view.setUint8(2, now.getMonth() + 1);
  view.setUint8(3, now.getDate());
  view.setInt32(4, items.length, true);       // Nb records
  view.setInt16(8, headerSize, true);          // Taille header
  view.setInt16(10, recordSize, true);         // Taille record

  // Définition des champs
  fields.forEach((field, i) => {
    const base = 32 + i * 32;
    writeASCII(bytes, base, field.name.padEnd(11, "\0"), 11);
    bytes[base + 11] = field.type.charCodeAt(0);
    bytes[base + 16] = field.length;
    bytes[base + 17] = field.decimals;
  });

  // Fin d'en-tête
  bytes[headerSize - 1] = 0x0D;

  // Records
  items.forEach((item, i) => {
    const base = headerSize + i * recordSize;
    bytes[base] = 0x20; // Espace = non supprimé

    let offset = base + 1;
    const f = item.feature;

    // ID
    const idStr = String(i + 1).padStart(fields[0].length, " ");
    writeASCII(bytes, offset, idStr, fields[0].length);
    offset += fields[0].length;

    // NOM
    const nom = (f.get("name") || f.get("nom") || "").substring(0, 50).padEnd(50, " ");
    writeASCII(bytes, offset, nom, 50);
    offset += 50;

    // TYPE
    const type = (item.type || "").substring(0, 20).padEnd(20, " ");
    writeASCII(bytes, offset, type, 20);
    offset += 20;
  });

  // EOF marker
  bytes[dbfSize - 1] = 0x1A;

  return buf;
}

/**
 * Retourne le contenu .PRJ pour une projection donnée.
 * @param {string} epsg
 * @returns {string}
 */
function getPRJContent(epsg) {
  const prjStrings = {
    "EPSG:4326":
      'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],' +
      'PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]',
    "EPSG:26191":
      'PROJCS["Merchich_Zone_1",GEOGCS["GCS_Merchich",...],PROJECTION["Lambert_Conformal_Conic"],' +
      'PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",300000.0]]',
    "EPSG:26192":
      'PROJCS["Merchich_Zone_2",GEOGCS["GCS_Merchich",...],PROJECTION["Lambert_Conformal_Conic"],' +
      'PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",300000.0]]',
    "EPSG:26193":
      'PROJCS["Merchich_Zone_3",GEOGCS["GCS_Merchich",...],PROJECTION["Lambert_Conformal_Conic"],' +
      'PARAMETER["False_Easting",1200000.0],PARAMETER["False_Northing",400000.0]]',
    "EPSG:26194":
      'PROJCS["Merchich_Zone_4",GEOGCS["GCS_Merchich",...],PROJECTION["Lambert_Conformal_Conic"],' +
      'PARAMETER["False_Easting",1500000.0],PARAMETER["False_Northing",400000.0]]',
  };
  return prjStrings[epsg] || prjStrings["EPSG:4326"];
}

// ============================================================
// Utilitaires
// ============================================================

/**
 * Écrit une chaîne ASCII dans un Uint8Array.
 * @param {Uint8Array} buf
 * @param {number}     offset
 * @param {string}     str
 * @param {number}     maxLen
 */
function writeASCII(buf, offset, str, maxLen) {
  for (let i = 0; i < Math.min(str.length, maxLen); i++) {
    buf[offset + i] = str.charCodeAt(i) & 0xFF;
  }
}

/**
 * Calcule le centroïde d'une géométrie OL.
 * @param {ol.geom.Geometry} geom
 * @returns {Array<number>} [x, y] EPSG:3857
 */
function getGeomCentroid(geom) {
  const type = geom.getType();
  if (type === "Point") return geom.getCoordinates();

  const extent = geom.getExtent();
  return [
    (extent[0] + extent[2]) / 2,
    (extent[1] + extent[3]) / 2,
  ];
}

/**
 * Retourne les coordonnées WGS84 (ou dans outProjection) d'une géométrie.
 * @param {ol.geom.Geometry} geom
 * @param {string}           outProjection
 * @returns {Array}
 */
function getGeomCoordsWGS84(geom, outProjection) {
  const type = geom.getType();

  function mercToOut(mx, my) {
    const wgs = mercatorToWGS84(mx, my);
    if (outProjection === "EPSG:4326") return [wgs.lon, wgs.lat];
    const res = convertCoords(wgs.lon, wgs.lat, "EPSG:4326", outProjection);
    return [res.x, res.y];
  }

  if (type === "Point") {
    const [mx, my] = geom.getCoordinates();
    return [mercToOut(mx, my)];
  } else if (type === "LineString") {
    return geom.getCoordinates().map(([mx, my]) => mercToOut(mx, my));
  } else if (type === "Polygon") {
    return geom.getCoordinates().map(ring =>
      ring.map(([mx, my]) => mercToOut(mx, my))
    );
  } else if (type === "Circle") {
    const center = geom.getCenter();
    const radius = geom.getRadius();
    const points = [];
    for (let a = 0; a <= 360; a += 5) {
      const rad = a * Math.PI / 180;
      points.push(mercToOut(
        center[0] + radius * Math.cos(rad),
        center[1] + radius * Math.sin(rad)
      ));
    }
    return [points];
  }
  return [[mercToOut(...geom.getFirstCoordinate())]];
}

/**
 * Transforme une géométrie OL d'une projection vers une autre (in-place).
 * @param {ol.geom.Geometry} geom
 * @param {string}           from
 * @param {string}           to
 */
function transformGeometryToProjection(geom, from, to) {
  geom.applyTransform((input, output, dimension) => {
    for (let i = 0; i < input.length; i += dimension) {
      const res = proj4(from, to, [input[i], input[i + 1]]);
      output[i] = res[0];
      output[i + 1] = res[1];
    }
    return output;
  });
}
