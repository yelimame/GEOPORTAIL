/**
 * markers.js — Gestion des points marqués
 * Géoportail Maroc
 *
 * Ajout, suppression, édition, liste et export des marqueurs.
 */

// ============================================================
// État des marqueurs
// ============================================================
let _markers = [];          // Tableau de { id, lon, lat, name, color, feature }
let _markerIdCounter = 1;   // Auto-incrément ID
let _markerClickHandler = null; // Handler de clic carte pour l'outil point

/** Couleurs prédéfinies pour les marqueurs */
const MARKER_COLORS = [
  "#e94560", "#4caf50", "#2196f3", "#ff9800", "#9c27b0",
  "#00bcd4", "#ffeb3b", "#ff5722", "#607d8b", "#8bc34a",
];

// ============================================================
// Activation de l'outil "Point"
// ============================================================

/**
 * Active l'outil de marquage de points : le prochain clic sur la carte
 * crée un marqueur.
 */
function activatePointTool() {
  // Retirer l'interaction de dessin si active
  removeDrawInteraction();

  // Ajouter le handler de clic
  if (_markerClickHandler) {
    APP.map.un("click", _markerClickHandler);
  }

  _markerClickHandler = (evt) => {
    if (APP.currentTool !== "point") return;
    const coord = evt.coordinate;
    const wgs = mercatorToWGS84(coord[0], coord[1]);
    addMarker(wgs.lon, wgs.lat);
  };

  APP.map.on("click", _markerClickHandler);
}

// ============================================================
// Ajout de marqueur
// ============================================================

/**
 * Ajoute un nouveau marqueur sur la carte.
 *
 * @param {number}  lon     - Longitude WGS84
 * @param {number}  lat     - Latitude WGS84
 * @param {string}  [name]  - Nom/description (optionnel)
 * @param {string}  [color] - Couleur hex (optionnel, auto-cycle)
 * @returns {Object} Le marqueur créé
 */
function addMarker(lon, lat, name, color) {
  const id = _markerIdCounter++;
  const markerColor = color || MARKER_COLORS[(id - 1) % MARKER_COLORS.length];
  const markerName = name || `Point ${id}`;

  // Calcul de toutes les coordonnées
  const allCoords = convertFromWGS84(lon, lat);

  // Création de la feature OL
  const mercCoord = wgs84ToMercator(lon, lat);
  const feature = new ol.Feature({
    geometry: new ol.geom.Point([mercCoord.x, mercCoord.y]),
    featureType: "marker",
    markerId: id,
  });
  feature.setId(`marker-${id}`);

  // Propriétés
  feature.set("id", id);
  feature.set("name", markerName);
  feature.set("color", markerColor);
  feature.set("lon", lon);
  feature.set("lat", lat);

  APP.markerSource.addFeature(feature);

  // Enregistrement dans le tableau
  const marker = {
    id,
    lon,
    lat,
    name: markerName,
    color: markerColor,
    allCoords,
    feature,
  };
  _markers.push(marker);

  // Mise à jour UI
  renderMarkersList();
  showMarkerPopup(feature, [mercCoord.x, mercCoord.y]);

  return marker;
}

// ============================================================
// Popup de marqueur
// ============================================================

/**
 * Affiche le popup d'information d'un marqueur.
 *
 * @param {ol.Feature}      feature   - Feature OL du marqueur
 * @param {Array<number>}   coord     - Position EPSG:3857 du popup
 */
function showMarkerPopup(feature, coord) {
  const id = feature.get("id");
  const marker = _markers.find(m => m.id === id);
  if (!marker) return;

  const { allCoords, color, name } = marker;
  const { wgs84, wgs84dms, z1, z2, z3, z4 } = allCoords;

  const html = `
    <h4>
      <span style="display:inline-block;width:10px;height:10px;border-radius:50%;
        background:${color};margin-right:6px;"></span>
      ${escapeHTML(name)}
    </h4>
    <div style="margin-bottom:8px;">
      <input type="text" class="popup-edit-name" id="popup-name-${id}"
        value="${escapeHTML(name)}" placeholder="Nom du point"
        onchange="updateMarkerName(${id}, this.value)">
    </div>

    <div class="popup-coord-row">
      <span class="popup-coord-label">WGS84 (DD) :</span>
      <span class="popup-coord-value">${wgs84.lat.toFixed(6)}°N, ${Math.abs(wgs84.lon).toFixed(6)}°O</span>
      <button class="popup-copy-btn" onclick="copyToClipboard('${wgs84.lat.toFixed(6)}, ${wgs84.lon.toFixed(6)}')">⎘</button>
    </div>
    <div class="popup-coord-row">
      <span class="popup-coord-label">WGS84 DMS :</span>
      <span class="popup-coord-value">${wgs84dms.lat}</span>
    </div>
    <div class="popup-coord-row">
      <span class="popup-coord-label">Merchich Z1 :</span>
      <span class="popup-coord-value">E ${z1.x.toFixed(2)}, N ${z1.y.toFixed(2)}</span>
      <button class="popup-copy-btn" onclick="copyToClipboard('${z1.x.toFixed(2)} ${z1.y.toFixed(2)}')">⎘</button>
    </div>
    <div class="popup-coord-row">
      <span class="popup-coord-label">Merchich Z2 :</span>
      <span class="popup-coord-value">E ${z2.x.toFixed(2)}, N ${z2.y.toFixed(2)}</span>
      <button class="popup-copy-btn" onclick="copyToClipboard('${z2.x.toFixed(2)} ${z2.y.toFixed(2)}')">⎘</button>
    </div>
    <div class="popup-coord-row">
      <span class="popup-coord-label">Merchich Z3 :</span>
      <span class="popup-coord-value">E ${z3.x.toFixed(2)}, N ${z3.y.toFixed(2)}</span>
      <button class="popup-copy-btn" onclick="copyToClipboard('${z3.x.toFixed(2)} ${z3.y.toFixed(2)}')">⎘</button>
    </div>
    <div class="popup-coord-row">
      <span class="popup-coord-label">Merchich Z4 :</span>
      <span class="popup-coord-value">E ${z4.x.toFixed(2)}, N ${z4.y.toFixed(2)}</span>
      <button class="popup-copy-btn" onclick="copyToClipboard('${z4.x.toFixed(2)} ${z4.y.toFixed(2)}')">⎘</button>
    </div>

    <div class="color-picker-row" style="margin-top:8px;">
      <span style="font-size:11px;color:var(--text-muted);">Couleur :</span>
      ${MARKER_COLORS.map(c => `
        <span class="color-swatch ${c === color ? 'selected' : ''}"
          style="background:${c}"
          onclick="updateMarkerColor(${id}, '${c}', this)"></span>
      `).join("")}
    </div>

    <div class="popup-actions">
      <button class="btn-secondary-sm" onclick="zoomToMarker(${id})">Centrer</button>
      <button class="btn-secondary-sm danger" onclick="deleteMarker(${id});hidePopup();"
        style="color:#ff6b6b;">Supprimer</button>
    </div>
  `;

  showPopup(coord, html);
}

// ============================================================
// Mise à jour des marqueurs
// ============================================================

/**
 * Met à jour le nom d'un marqueur.
 * @param {number} id
 * @param {string} newName
 */
function updateMarkerName(id, newName) {
  const marker = _markers.find(m => m.id === id);
  if (!marker) return;
  marker.name = newName || `Point ${id}`;
  marker.feature.set("name", marker.name);
  renderMarkersList();
}

/**
 * Met à jour la couleur d'un marqueur.
 * @param {number}      id
 * @param {string}      color
 * @param {HTMLElement} swatchEl - Élément cliqué (pour mise à jour visuelle)
 */
function updateMarkerColor(id, color, swatchEl) {
  const marker = _markers.find(m => m.id === id);
  if (!marker) return;
  marker.color = color;
  marker.feature.set("color", color);

  // Forcer le rafraîchissement du style
  APP.markerLayer.changed();

  // Mise à jour visuelle du popup
  document.querySelectorAll(".color-swatch").forEach(s => s.classList.remove("selected"));
  swatchEl.classList.add("selected");

  renderMarkersList();
}

/**
 * Supprime un marqueur.
 * @param {number} id
 */
function deleteMarker(id) {
  const idx = _markers.findIndex(m => m.id === id);
  if (idx === -1) return;

  const marker = _markers[idx];
  APP.markerSource.removeFeature(marker.feature);
  _markers.splice(idx, 1);

  renderMarkersList();
  showToast(`Point ${id} supprimé`, "info");
}

/**
 * Supprime tous les marqueurs.
 */
function clearAllMarkers() {
  if (_markers.length === 0) return;
  if (!confirm("Supprimer tous les points marqués ?")) return;

  APP.markerSource.clear();
  _markers = [];
  hidePopup();
  renderMarkersList();
  showToast("Tous les points supprimés", "info");
}

/**
 * Centre la carte sur un marqueur.
 * @param {number} id
 */
function zoomToMarker(id) {
  const marker = _markers.find(m => m.id === id);
  if (!marker) return;

  const mercCoord = wgs84ToMercator(marker.lon, marker.lat);
  APP.map.getView().animate({
    center: [mercCoord.x, mercCoord.y],
    zoom: Math.max(APP.map.getView().getZoom(), 15),
    duration: 500,
  });
}

// ============================================================
// Rendu de la liste dans la sidebar
// ============================================================

/**
 * Met à jour l'affichage de la liste des marqueurs dans la sidebar.
 */
function renderMarkersList() {
  const container = document.getElementById("points-list");
  if (!container) return;

  if (_markers.length === 0) {
    container.innerHTML = '<div class="empty-state">Aucun point marqué.<br>Utilisez l\'outil Point (●) pour en ajouter.</div>';
    return;
  }

  container.innerHTML = _markers.map(m => {
    const { wgs84 } = m.allCoords;
    return `
      <div class="point-item" data-id="${m.id}" onclick="selectMarkerFromList(${m.id})">
        <span class="point-color-dot" style="background:${m.color}"></span>
        <div class="point-info">
          <div class="point-name">${escapeHTML(m.name)}</div>
          <div class="point-coords-mini">
            ${wgs84.lat.toFixed(5)}°N, ${Math.abs(wgs84.lon).toFixed(5)}°O
          </div>
        </div>
        <div class="point-actions">
          <button class="icon-btn" onclick="event.stopPropagation();zoomToMarker(${m.id})" title="Centrer">⊙</button>
          <button class="icon-btn danger" onclick="event.stopPropagation();deleteMarker(${m.id})" title="Supprimer">✕</button>
        </div>
      </div>
    `;
  }).join("");
}

/**
 * Sélectionne un marqueur depuis la liste (centre la carte + ouvre le popup).
 * @param {number} id
 */
function selectMarkerFromList(id) {
  const marker = _markers.find(m => m.id === id);
  if (!marker) return;

  const mercCoord = wgs84ToMercator(marker.lon, marker.lat);
  APP.map.getView().animate({
    center: [mercCoord.x, mercCoord.y],
    zoom: Math.max(APP.map.getView().getZoom(), 14),
    duration: 400,
  });

  setTimeout(() => showMarkerPopup(marker.feature, [mercCoord.x, mercCoord.y]), 200);

  // Highlight dans la liste
  document.querySelectorAll(".point-item").forEach(el => el.classList.remove("selected"));
  document.querySelector(`.point-item[data-id="${id}"]`)?.classList.add("selected");
}

// ============================================================
// Export des marqueurs
// ============================================================

/**
 * Exporte les marqueurs en CSV (X, Y WGS84 + attributs).
 */
function exportMarkersCSV() {
  if (_markers.length === 0) {
    showToast("Aucun point à exporter", "warning");
    return;
  }

  const headers = ["ID", "Nom", "Longitude_WGS84", "Latitude_WGS84",
    "Z1_Est", "Z1_Nord", "Z2_Est", "Z2_Nord",
    "Z3_Est", "Z3_Nord", "Z4_Est", "Z4_Nord", "Couleur"];

  const rows = _markers.map(m => {
    const { wgs84, z1, z2, z3, z4 } = m.allCoords;
    return [
      m.id, `"${m.name}"`,
      wgs84.lon.toFixed(8), wgs84.lat.toFixed(8),
      z1.x.toFixed(3), z1.y.toFixed(3),
      z2.x.toFixed(3), z2.y.toFixed(3),
      z3.x.toFixed(3), z3.y.toFixed(3),
      z4.x.toFixed(3), z4.y.toFixed(3),
      m.color,
    ].join(",");
  });

  const csv = [headers.join(","), ...rows].join("\n");
  downloadFile(csv, "points_marques.csv", "text/csv;charset=utf-8");
  showToast(`${_markers.length} point(s) exporté(s) en CSV`, "success");
}

/**
 * Exporte les marqueurs en GeoJSON (WGS84).
 */
function exportMarkersGeoJSON() {
  if (_markers.length === 0) {
    showToast("Aucun point à exporter", "warning");
    return;
  }

  const geojson = {
    type: "FeatureCollection",
    features: _markers.map(m => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [m.lon, m.lat],
      },
      properties: {
        id: m.id,
        nom: m.name,
        couleur: m.color,
        z1_est: m.allCoords.z1.x,
        z1_nord: m.allCoords.z1.y,
        z2_est: m.allCoords.z2.x,
        z2_nord: m.allCoords.z2.y,
        z3_est: m.allCoords.z3.x,
        z3_nord: m.allCoords.z3.y,
        z4_est: m.allCoords.z4.x,
        z4_nord: m.allCoords.z4.y,
      },
    })),
  };

  downloadFile(
    JSON.stringify(geojson, null, 2),
    "points_marques.geojson",
    "application/geo+json"
  );
  showToast(`${_markers.length} point(s) exporté(s) en GeoJSON`, "success");
}

/**
 * Retourne les marqueurs pour l'export global.
 * @returns {Array<Object>}
 */
function getMarkersForExport() {
  return _markers;
}

// ============================================================
// Utilitaires
// ============================================================

/**
 * Échappe les caractères HTML spéciaux.
 * @param {string} str
 * @returns {string}
 */
function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Déclenche le téléchargement d'un fichier côté client.
 * @param {string} content   - Contenu du fichier
 * @param {string} filename  - Nom du fichier
 * @param {string} mimeType  - Type MIME
 */
function downloadFile(content, filename, mimeType) {
  const blob = content instanceof Blob
    ? content
    : new Blob([content], { type: mimeType });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
