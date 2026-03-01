/**
 * main.js — Initialisation de la carte OpenLayers et configuration globale
 * Géoportail Maroc
 */

// ============================================================
// État global de l'application
// ============================================================
const APP = {
  map: null,             // Instance ol.Map
  baseLayers: {},        // Couches de fond { satellite, osm }
  drawLayer: null,       // Couche vecteur pour le dessin
  markerLayer: null,     // Couche vecteur pour les marqueurs
  tempLayer: null,       // Couche temporaire (navigation, etc.)
  popup: null,           // Overlay popup
  currentTool: "select", // Outil actif
  currentZone: "EPSG:26192", // Zone Merchich pour affichage
  importedLayers: [],    // Couches importées
  drawnFeatures: [],     // Géométries dessinées (pour export)
  drawInteraction: null, // Interaction de dessin active
  modifyInteraction: null,
  selectInteraction: null,
};

// ============================================================
// Initialisation au chargement de la page
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  initProjections();   // Enregistre proj4 dans OL
  initMap();           // Crée la carte
  initPopup();         // Crée le popup OL
  initStatusBar();     // Bind curseur → coordonnées
  initBasemapSwitcher();
  initProjectionSelector();

  // Exposer APP globalement pour les autres modules
  window.APP = APP;

  console.log("[Main] Géoportail Maroc initialisé.");
});

// ============================================================
// Enregistrement proj4 dans OpenLayers
// ============================================================
function initProjections() {
  try {
    if (window.ol && ol.proj && ol.proj.proj4) {
      ol.proj.proj4.register(proj4);
    }
  } catch (e) {
    console.warn("[Main] ol.proj.proj4.register non disponible :", e);
  }

  // Méthode alternative : enregistrement via ol.proj.addProjection
  const projDefs = [
    { code: "EPSG:26191", extent: [-20037508.34, 2000000, 20037508.34, 8000000] },
    { code: "EPSG:26192", extent: [-20037508.34, 2000000, 20037508.34, 8000000] },
    { code: "EPSG:26193", extent: [-20037508.34, 2000000, 20037508.34, 8000000] },
    { code: "EPSG:26194", extent: [-20037508.34, 2000000, 20037508.34, 8000000] },
  ];

  projDefs.forEach(def => {
    try {
      if (!ol.proj.get(def.code)) {
        ol.proj.addProjection(new ol.proj.Projection({
          code: def.code,
          extent: def.extent,
          units: "m",
        }));
      }
    } catch (e) { /* Déjà enregistré */ }
  });
}

// ============================================================
// Initialisation de la carte
// ============================================================
function initMap() {
  // Couche satellite ESRI World Imagery
  const satelliteLayer = new ol.layer.Tile({
    source: new ol.source.XYZ({
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      attributions: "© Esri — Source : Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP et la communauté GIS",
      maxZoom: 20,
    }),
    visible: true,
  });

  // Couche OpenStreetMap
  const osmLayer = new ol.layer.Tile({
    source: new ol.source.OSM({
      attributions: "© OpenStreetMap contributors",
    }),
    visible: false,
  });

  // Couche vecteur pour le dessin
  const drawSource = new ol.source.Vector();
  const drawLayer = new ol.layer.Vector({
    source: drawSource,
    style: (feature) => getDrawStyle(feature),
    zIndex: 10,
  });

  // Couche vecteur pour les marqueurs
  const markerSource = new ol.source.Vector();
  const markerLayer = new ol.layer.Vector({
    source: markerSource,
    style: (feature) => getMarkerStyle(feature),
    zIndex: 20,
  });

  // Couche temporaire (navigation, etc.)
  const tempSource = new ol.source.Vector();
  const tempLayer = new ol.layer.Vector({
    source: tempSource,
    style: (feature) => getTempStyle(feature),
    zIndex: 30,
  });

  // Échelle graphique
  const scaleLine = new ol.control.ScaleLine({
    units: "metric",
    bar: false,
    minWidth: 80,
  });

  // Plein écran
  const fullScreen = new ol.control.FullScreen();

  // Rotation reset
  const rotate = new ol.control.Rotate({ autoHide: false });

  // Création de la carte
  const map = new ol.Map({
    target: "map",
    layers: [satelliteLayer, osmLayer, drawLayer, markerLayer, tempLayer],
    view: new ol.View({
      center: ol.proj.fromLonLat([-5.4, 31.5]), // Centre du Maroc
      zoom: 6,
      minZoom: 3,
      maxZoom: 21,
    }),
    controls: ol.control.defaults.defaults({
      attribution: false,
      rotate: false,
    }).extend([scaleLine, fullScreen, rotate]),
  });

  // Interaction de sélection par défaut
  const selectInteraction = new ol.interaction.Select({
    layers: [drawLayer, markerLayer],
    style: (feature) => getSelectStyle(feature),
  });
  map.addInteraction(selectInteraction);

  // Stockage dans l'état global
  APP.map = map;
  APP.baseLayers = { satellite: satelliteLayer, osm: osmLayer };
  APP.drawLayer = drawLayer;
  APP.drawSource = drawSource;
  APP.markerLayer = markerLayer;
  APP.markerSource = markerSource;
  APP.tempLayer = tempLayer;
  APP.tempSource = tempSource;
  APP.selectInteraction = selectInteraction;

  // Événement de clic sur la carte
  map.on("click", handleMapClick);

  // Mise à jour du zoom dans la barre de statut
  map.getView().on("change:resolution", updateStatusBar);
}

// ============================================================
// Styles des couches vecteur
// ============================================================

/**
 * Style pour les géométries dessinées.
 * @param {ol.Feature} feature
 * @returns {ol.style.Style}
 */
function getDrawStyle(feature) {
  const geomType = feature.getGeometry()?.getType();
  const color = feature.get("color") || "#e94560";
  const opacity = feature.get("opacity") || 0.2;

  const fill = new ol.style.Fill({
    color: hexToRGBA(color, opacity),
  });
  const stroke = new ol.style.Stroke({
    color: color,
    width: 2,
  });

  if (geomType === "Point") {
    return new ol.style.Style({
      image: new ol.style.Circle({ radius: 6, fill: new ol.style.Fill({ color }), stroke }),
    });
  }

  return new ol.style.Style({ fill, stroke });
}

/**
 * Style pour les marqueurs de points.
 * @param {ol.Feature} feature
 * @returns {ol.style.Style}
 */
function getMarkerStyle(feature) {
  const color = feature.get("color") || "#e94560";
  const id = feature.get("id") || "?";

  return [
    new ol.style.Style({
      image: new ol.style.RegularShape({
        points: 4,
        radius: 10,
        angle: Math.PI / 4,
        fill: new ol.style.Fill({ color }),
        stroke: new ol.style.Stroke({ color: "#fff", width: 1.5 }),
      }),
    }),
    new ol.style.Style({
      text: new ol.style.Text({
        text: String(id),
        fill: new ol.style.Fill({ color: "#fff" }),
        font: "bold 10px sans-serif",
        textAlign: "center",
        offsetY: 1,
      }),
    }),
  ];
}

/**
 * Style pour les éléments temporaires (navigation).
 * @param {ol.Feature} feature
 * @returns {ol.style.Style}
 */
function getTempStyle(feature) {
  return new ol.style.Style({
    image: new ol.style.Circle({
      radius: 8,
      fill: new ol.style.Fill({ color: "rgba(33, 150, 243, 0.8)" }),
      stroke: new ol.style.Stroke({ color: "#fff", width: 2 }),
    }),
  });
}

/**
 * Style pour les features sélectionnées.
 * @param {ol.Feature} feature
 * @returns {ol.style.Style}
 */
function getSelectStyle(feature) {
  return new ol.style.Style({
    image: new ol.style.Circle({
      radius: 8,
      fill: new ol.style.Fill({ color: "rgba(255, 215, 0, 0.8)" }),
      stroke: new ol.style.Stroke({ color: "#fff", width: 2 }),
    }),
    stroke: new ol.style.Stroke({ color: "#ffd700", width: 3 }),
    fill: new ol.style.Fill({ color: "rgba(255, 215, 0, 0.2)" }),
  });
}

// ============================================================
// Popup
// ============================================================
function initPopup() {
  const container = document.getElementById("map-popup");
  const closer = document.getElementById("popup-closer");

  const overlay = new ol.Overlay({
    element: container,
    autoPan: { animation: { duration: 250 } },
  });

  APP.map.addOverlay(overlay);
  APP.popupOverlay = overlay;

  closer.addEventListener("click", () => {
    overlay.setPosition(undefined);
    container.classList.remove("visible");
  });
}

/**
 * Affiche le popup à une position donnée avec un contenu HTML.
 *
 * @param {Array<number>} coord   - Coordonnées EPSG:3857
 * @param {string}        content - HTML du contenu
 */
function showPopup(coord, content) {
  const container = document.getElementById("map-popup");
  document.getElementById("popup-content").innerHTML = content;
  APP.popupOverlay.setPosition(coord);
  container.classList.add("visible");
}

/** Masque le popup. */
function hidePopup() {
  const container = document.getElementById("map-popup");
  APP.popupOverlay.setPosition(undefined);
  container.classList.remove("visible");
}

// ============================================================
// Gestionnaire de clic sur la carte
// ============================================================
function handleMapClick(evt) {
  const coord = evt.coordinate;
  const wgs = mercatorToWGS84(coord[0], coord[1]);

  // Vérifier s'il y a une feature cliquée
  const feature = APP.map.forEachFeatureAtPixel(evt.pixel, f => f, {
    hitTolerance: 6,
  });

  // Si outil "point" actif → on ne gère pas ici (géré par markers.js)
  if (APP.currentTool === "point") return;

  // Si outil mesure distance ou capture pour conversion
  if (APP.currentTool === "measure-dist") {
    if (typeof onMapClickMeasure === "function") onMapClickMeasure(coord, wgs);
    return;
  }

  if (APP.currentTool === "convert-pick") {
    if (typeof onMapClickConvert === "function") onMapClickConvert(wgs);
    return;
  }

  // Clic sur feature → afficher info
  if (feature) {
    const type = feature.get("featureType");
    if (type === "marker") {
      if (typeof showMarkerPopup === "function") showMarkerPopup(feature, coord);
    }
    return;
  }

  hidePopup();
}

// ============================================================
// Barre de statut — coordonnées curseur
// ============================================================
function initStatusBar() {
  const map = APP.map;
  const coordWGS84El = document.getElementById("coord-wgs84");
  const coordZoneEl = document.getElementById("coord-zone");
  const zoomEl = document.getElementById("status-zoom");
  const scaleEl = document.getElementById("status-scale");

  map.on("pointermove", (evt) => {
    if (evt.dragging) return;
    const coord = evt.coordinate;
    const wgs = mercatorToWGS84(coord[0], coord[1]);

    coordWGS84El.textContent = formatWGS84(wgs.lon, wgs.lat);

    // Coordonnées dans la zone Merchich sélectionnée
    const zone = APP.currentZone;
    if (zone === "EPSG:4326") {
      coordZoneEl.textContent = formatWGS84(wgs.lon, wgs.lat);
    } else {
      const res = convertCoords(wgs.lon, wgs.lat, "EPSG:4326", zone);
      coordZoneEl.textContent = formatPlane(res.x, res.y);
    }
  });

  // Mise à jour initiale du zoom
  updateStatusBar();
}

function updateStatusBar() {
  const view = APP.map.getView();
  const zoom = view.getZoom();
  const resolution = view.getResolution();

  document.getElementById("status-zoom").textContent =
    zoom ? zoom.toFixed(1) : "—";

  // Calcul de l'échelle approximative (1:x)
  if (resolution) {
    const dpi = 96;
    const mPerInch = 0.0254;
    const scale = Math.round(resolution * dpi / mPerInch);
    document.getElementById("status-scale").textContent =
      `1:${scale.toLocaleString("fr-FR")}`;
  }
}

// ============================================================
// Switcher de fond de carte
// ============================================================
function initBasemapSwitcher() {
  document.querySelectorAll(".basemap-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const basemap = btn.dataset.basemap;
      setBasemap(basemap);
      document.querySelectorAll(".basemap-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });
}

/**
 * Active le fond de carte sélectionné.
 * @param {"satellite"|"osm"|"none"} name
 */
function setBasemap(name) {
  APP.baseLayers.satellite.setVisible(name === "satellite");
  APP.baseLayers.osm.setVisible(name === "osm");
}

// ============================================================
// Sélecteur de zone Merchich
// ============================================================
function initProjectionSelector() {
  const sel = document.getElementById("select-zone");
  const label = document.getElementById("coord-zone-label");

  sel.addEventListener("change", () => {
    APP.currentZone = sel.value;
    label.textContent = getZoneLabel(sel.value) + " :";
  });
}

// ============================================================
// Utilitaires d'affichage
// ============================================================

/**
 * Convertit un code couleur hexadécimal en RGBA CSS.
 * @param {string} hex     - Ex: "#e94560"
 * @param {number} opacity - 0 à 1
 * @returns {string}       - "rgba(r, g, b, a)"
 */
function hexToRGBA(hex, opacity = 1) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Zoom sur une étendue géographique.
 * @param {Array<number>} extent - [minLon, minLat, maxLon, maxLat] WGS84
 * @param {number} [padding=50]
 */
function zoomToExtentWGS84(extent, padding = 50) {
  const mercExtent = ol.proj.transformExtent(extent, "EPSG:4326", "EPSG:3857");
  APP.map.getView().fit(mercExtent, {
    padding: [padding, padding, padding, padding],
    maxZoom: 18,
    duration: 500,
  });
}

/**
 * Affiche une notification toast.
 * @param {string} message
 * @param {"success"|"error"|"info"|"warning"} type
 * @param {number} [duration=3000]
 */
function showToast(message, type = "info", duration = 3000) {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;

  const icons = { success: "✓", error: "✕", info: "ℹ", warning: "⚠" };
  toast.innerHTML = `<span>${icons[type] || "ℹ"}</span><span>${message}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(20px)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Définit l'outil actif et met à jour l'UI.
 * @param {string} toolName
 */
function setActiveTool(toolName) {
  APP.currentTool = toolName;
  document.getElementById("status-tool").textContent = `Outil : ${getToolLabel(toolName)}`;

  // Mettre à jour les boutons toolbar
  document.querySelectorAll(".tool-btn[data-tool]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tool === toolName);
  });
}

function getToolLabel(tool) {
  const labels = {
    select: "Sélection",
    point: "Marquage point",
    line: "Polyligne",
    polygon: "Polygone",
    rectangle: "Rectangle",
    circle: "Cercle",
    modify: "Modification",
    "measure-dist": "Mesure distance",
    "convert-pick": "Capture coordonnées",
  };
  return labels[tool] || tool;
}

/**
 * Supprime l'interaction de dessin active.
 */
function removeDrawInteraction() {
  if (APP.drawInteraction) {
    APP.map.removeInteraction(APP.drawInteraction);
    APP.drawInteraction = null;
  }
  if (APP.modifyInteraction && APP.modifyInteraction._isDrawModify) {
    APP.map.removeInteraction(APP.modifyInteraction);
    APP.modifyInteraction = null;
  }
  if (APP.snapInteraction) {
    APP.map.removeInteraction(APP.snapInteraction);
    APP.snapInteraction = null;
  }
}
