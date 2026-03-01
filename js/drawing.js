/**
 * drawing.js — Outils de dessin OpenLayers
 * Géoportail Maroc
 *
 * Polyline, polygone, rectangle, cercle, modification, suppression.
 * Affichage temps réel des mesures (surface, longueur, rayon).
 */

// ============================================================
// Démarrage d'une interaction de dessin
// ============================================================

/**
 * Active un outil de dessin OpenLayers.
 *
 * @param {"LineString"|"Polygon"|"Box"|"Circle"} type - Type de géométrie à dessiner
 */
function startDraw(type) {
  // Retirer l'interaction précédente
  removeDrawInteraction();

  // Configuration selon le type
  let drawOptions = {
    source: APP.drawSource,
    freehand: false,
  };

  if (type === "Box") {
    // Rectangle = polygone avec géométrie "Box"
    drawOptions.type = "Circle";
    drawOptions.geometryFunction = ol.interaction.Draw.createBox();
  } else if (type === "Circle") {
    drawOptions.type = "Circle";
  } else {
    drawOptions.type = type;
  }

  const drawInteraction = new ol.interaction.Draw(drawOptions);
  APP.map.addInteraction(drawInteraction);
  APP.drawInteraction = drawInteraction;

  // Snap (accrochage aux géométries existantes)
  const snapInteraction = new ol.interaction.Snap({ source: APP.drawSource });
  APP.map.addInteraction(snapInteraction);
  APP.snapInteraction = snapInteraction;

  // Événement pendant le dessin (mesures temps réel)
  let sketchFeature = null;

  drawInteraction.on("drawstart", (evt) => {
    sketchFeature = evt.feature;
    sketchFeature.getGeometry().on("change", () => {
      updateDrawMeasures(sketchFeature, type);
    });
  });

  // Événement fin de dessin
  drawInteraction.on("drawend", (evt) => {
    const feature = evt.feature;

    // Appliquer les attributs du panel
    const nameInput = document.getElementById("draw-attr-name");
    const colorInput = document.getElementById("draw-attr-color");
    const name = nameInput?.value || "";
    const color = colorInput?.value || "#e94560";

    feature.set("featureType", "drawn");
    feature.set("name", name);
    feature.set("color", color);
    feature.set("opacity", 0.2);
    feature.set("geomType", type);

    // ID unique
    const drawId = `draw-${Date.now()}`;
    feature.setId(drawId);
    feature.set("drawId", drawId);

    // Enregistrement
    APP.drawnFeatures.push(feature);

    // Calculer et afficher les mesures finales
    const measures = getMeasures(feature, type);
    displayFinalMeasures(measures, type);

    showToast("Géométrie ajoutée", "success", 1500);
  });
}

// ============================================================
// Mesures en temps réel pendant le dessin
// ============================================================

/**
 * Calcule et affiche les mesures pendant le dessin (temps réel).
 *
 * @param {ol.Feature}  feature
 * @param {string}      type    - Type OL (LineString, Polygon, Box, Circle)
 */
function updateDrawMeasures(feature, type) {
  const geom = feature.getGeometry();
  if (!geom) return;

  const geomType = geom.getType();

  if (geomType === "LineString") {
    const coords = geom.getCoordinates();
    const len = calculateLengthFromMerc(coords);
    const el = document.getElementById("draw-length-value");
    if (el) el.textContent = formatLength(len.m);

  } else if (geomType === "Polygon") {
    const coords = geom.getCoordinates()[0];
    if (coords.length > 2) {
      const area = calculatePolygonAreaFromMerc(coords);
      const len = calculateLengthFromMerc(coords);

      const aEl = document.getElementById("draw-area-value");
      const lEl = document.getElementById("draw-length-value");
      if (aEl) aEl.textContent = formatArea(area.m2);
      if (lEl) lEl.textContent = formatLength(len.m);
    }

  } else if (geomType === "Circle") {
    const radiusMerc = geom.getRadius();
    // Conversion du rayon : Mercator → approximation métrique
    const center = geom.getCenter();
    const centerWGS = mercatorToWGS84(center[0], center[1]);
    const edgeMerc = [center[0] + radiusMerc, center[1]];
    const edgeWGS = mercatorToWGS84(edgeMerc[0], edgeMerc[1]);
    const radiusM = haversineDistance(
      [centerWGS.lon, centerWGS.lat],
      [edgeWGS.lon, edgeWGS.lat]
    );

    const area = calculateCircleArea(radiusM);
    const rEl = document.getElementById("draw-radius-value");
    const aEl = document.getElementById("draw-area-value");
    if (rEl) rEl.textContent = formatLength(radiusM);
    if (aEl) aEl.textContent = formatArea(area.m2);
  }
}

/**
 * Calcule les mesures d'une feature finalisée.
 *
 * @param {ol.Feature} feature
 * @param {string}     type
 * @returns {Object}   { area, length, radius, ... }
 */
function getMeasures(feature, type) {
  const geom = feature.getGeometry();
  const geomType = geom.getType();
  const result = {};

  if (geomType === "LineString") {
    const coords = geom.getCoordinates();
    result.length = calculateLengthFromMerc(coords);

  } else if (geomType === "Polygon") {
    const coords = geom.getCoordinates()[0];
    result.area = calculatePolygonAreaFromMerc(coords);
    result.perimeter = calculateLengthFromMerc(coords);

  } else if (geomType === "Circle") {
    const radiusMerc = geom.getRadius();
    const center = geom.getCenter();
    const centerWGS = mercatorToWGS84(center[0], center[1]);
    const edgeMerc = [center[0] + radiusMerc, center[1]];
    const edgeWGS = mercatorToWGS84(edgeMerc[0], edgeMerc[1]);
    const radiusM = haversineDistance(
      [centerWGS.lon, centerWGS.lat],
      [edgeWGS.lon, edgeWGS.lat]
    );

    result.radius = { m: radiusM, km: radiusM / 1000 };
    const areaObj = calculateCircleArea(radiusM);
    result.area = areaObj;
    result.perimeter = calculateCirclePerimeter(radiusM);
  }

  return result;
}

/**
 * Affiche les mesures finales dans le panel.
 * @param {Object} measures
 * @param {string} type
 */
function displayFinalMeasures(measures, type) {
  if (measures.area) {
    const el = document.getElementById("draw-area-value");
    if (el) el.textContent = formatArea(measures.area.m2);
  }
  if (measures.length) {
    const el = document.getElementById("draw-length-value");
    if (el) el.textContent = formatLength(measures.length.m);
  }
  if (measures.perimeter) {
    const el = document.getElementById("draw-length-value");
    if (el) el.textContent = `Périmètre : ${formatLength(measures.perimeter.m)}`;
  }
  if (measures.radius) {
    const el = document.getElementById("draw-radius-value");
    if (el) el.textContent = formatLength(measures.radius.m);
  }
}

// ============================================================
// Outil Modification
// ============================================================

/**
 * Active l'outil de modification des géométries dessinées.
 */
function activateModify() {
  removeDrawInteraction();

  const modifyInteraction = new ol.interaction.Modify({
    source: APP.drawSource,
    deleteCondition: ol.events.condition.altKeyOnly,
  });
  modifyInteraction._isDrawModify = true;

  APP.map.addInteraction(modifyInteraction);
  APP.modifyInteraction = modifyInteraction;

  modifyInteraction.on("modifyend", () => {
    showToast("Géométrie modifiée", "success", 1500);
  });

  const snapInteraction = new ol.interaction.Snap({ source: APP.drawSource });
  APP.map.addInteraction(snapInteraction);
  APP.snapInteraction = snapInteraction;

  showToast("Modification : faites glisser les sommets. Alt+clic pour supprimer un sommet.", "info", 4000);
}

// ============================================================
// Mesure de distance interactive
// ============================================================
let _measurePoints = [];
let _measureLine = null;

/**
 * Active l'outil de mesure de distance par clics successifs.
 */
function startMeasureDistance() {
  removeDrawInteraction();
  _measurePoints = [];

  // Supprimer l'ancienne ligne de mesure
  if (_measureLine) {
    APP.drawSource.removeFeature(_measureLine);
    _measureLine = null;
  }

  const drawInteraction = new ol.interaction.Draw({
    source: APP.drawSource,
    type: "LineString",
    stopClick: true,
  });
  APP.map.addInteraction(drawInteraction);
  APP.drawInteraction = drawInteraction;

  let sketchGeom = null;

  drawInteraction.on("drawstart", (evt) => {
    sketchGeom = evt.feature.getGeometry();
    sketchGeom.on("change", () => {
      const coords = sketchGeom.getCoordinates();
      updateMeasureDisplay(coords);
    });
  });

  drawInteraction.on("drawend", (evt) => {
    _measureLine = evt.feature;
    _measureLine.set("featureType", "measure");
    _measureLine.set("color", "#ff9800");
    const coords = _measureLine.getGeometry().getCoordinates();
    updateMeasureDisplay(coords, true);
  });

  // Bouton reset dans le panel
  setTimeout(() => {
    const resetBtn = document.getElementById("btn-reset-measure");
    if (resetBtn) {
      resetBtn.addEventListener("click", resetMeasure);
    }
  }, 100);
}

/**
 * Met à jour l'affichage de la mesure de distance dans le panel.
 * @param {Array<Array<number>>} mercCoords
 * @param {boolean}              [final=false]
 */
function updateMeasureDisplay(mercCoords, final = false) {
  if (mercCoords.length < 2) return;

  let totalM = 0;
  const segments = [];

  for (let i = 0; i < mercCoords.length - 1; i++) {
    const segM = distanceBetweenMercPoints(mercCoords[i], mercCoords[i + 1]);
    totalM += segM;
    segments.push(segM);
  }

  const totalEl = document.getElementById("measure-total-dist");
  if (totalEl) totalEl.textContent = formatLength(totalM);

  const segEl = document.getElementById("measure-segments");
  if (segEl && segments.length > 1) {
    segEl.innerHTML = segments.map((s, i) =>
      `<div style="font-size:11px;color:var(--text-muted);padding:2px 0;">
        Segment ${i + 1} : ${formatLength(s)}
      </div>`
    ).join("");
  }
}

/** Réinitialise la mesure de distance. */
function resetMeasure() {
  if (_measureLine) {
    APP.drawSource.removeFeature(_measureLine);
    _measureLine = null;
  }
  _measurePoints = [];
  removeDrawInteraction();
  startMeasureDistance();

  const totalEl = document.getElementById("measure-total-dist");
  if (totalEl) totalEl.textContent = "—";
  const segEl = document.getElementById("measure-segments");
  if (segEl) segEl.innerHTML = "";
}

// ============================================================
// Gestionnaire clic carte pour mesure (depuis main.js)
// ============================================================
function onMapClickMeasure(coord, wgs) {
  // La mesure est gérée par l'interaction Draw
}

// ============================================================
// Récupération des features dessinées pour export
// ============================================================

/**
 * Retourne toutes les features dessinées sous forme GeoJSON (WGS84).
 * @returns {Object} GeoJSON FeatureCollection
 */
function getDrawnFeaturesGeoJSON() {
  const format = new ol.format.GeoJSON();
  const features = APP.drawSource.getFeatures().filter(
    f => f.get("featureType") !== "measure"
  );

  if (features.length === 0) return null;

  // Transformer chaque feature de Mercator vers WGS84
  const wgs84Features = features.map(f => {
    const clone = f.clone();
    clone.getGeometry().transform("EPSG:3857", "EPSG:4326");
    return clone;
  });

  return JSON.parse(format.writeFeatures(wgs84Features, {
    featureProjection: "EPSG:4326",
    dataProjection: "EPSG:4326",
  }));
}
