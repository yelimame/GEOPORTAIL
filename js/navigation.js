/**
 * navigation.js — Navigation par coordonnées "Aller à un point"
 * Géoportail Maroc
 */

// ============================================================
// Initialisation du panel de navigation
// ============================================================

/**
 * Initialise les événements du panel de navigation une fois injecté dans le DOM.
 * Appelé par ui.js après openFloatingPanel().
 */
function initNavigationPanel() {
  const epsgSel = document.getElementById("nav-epsg");
  if (!epsgSel) return;

  epsgSel.addEventListener("change", onNavEpsgChange);
  document.getElementById("btn-nav-go").addEventListener("click", navigateToPoint);
  document.getElementById("btn-nav-add-marker").addEventListener("click", addNavPointToMarkers);

  // Initialisation du mode d'affichage
  onNavEpsgChange();
}

/**
 * Gère le changement de système de coordonnées dans le panel navigation.
 */
function onNavEpsgChange() {
  const epsg = document.getElementById("nav-epsg")?.value;
  const ddFields = document.getElementById("nav-dd-fields");
  const dmsFields = document.getElementById("nav-dms-fields");
  if (!ddFields || !dmsFields) return;

  const isDMS = epsg === "EPSG:4326-DMS";
  ddFields.style.display = isDMS ? "none" : "flex";
  dmsFields.style.display = isDMS ? "block" : "none";

  // Mise à jour des placeholders selon la projection
  const xInput = document.getElementById("nav-x");
  const yInput = document.getElementById("nav-y");
  if (!xInput || !yInput) return;

  if (epsg === "EPSG:4326-DD") {
    xInput.placeholder = "-7.5898 (Longitude)";
    yInput.placeholder = "33.5731 (Latitude)";
  } else if (epsg === "EPSG:26191") {
    xInput.placeholder = "Est (m) ex: 500000";
    yInput.placeholder = "Nord (m) ex: 375000";
  } else if (epsg === "EPSG:26192") {
    xInput.placeholder = "Est (m) ex: 168000";
    yInput.placeholder = "Nord (m) ex: 375000";
  } else if (epsg === "EPSG:26193") {
    xInput.placeholder = "Est (m)";
    yInput.placeholder = "Nord (m)";
  } else if (epsg === "EPSG:26194") {
    xInput.placeholder = "Est (m)";
    yInput.placeholder = "Nord (m)";
  }
}

// ============================================================
// Point de navigation courant (pour "Ajouter aux marqueurs")
// ============================================================
let _navCurrentWGS84 = null;

/**
 * Lit les coordonnées du panel et navigue vers le point.
 * Place un marqueur temporaire avec popup.
 */
function navigateToPoint() {
  const epsg = document.getElementById("nav-epsg")?.value;
  if (!epsg) return;

  let lon, lat;

  try {
    if (epsg === "EPSG:4326-DMS") {
      // Lecture DMS
      const lonStr = document.getElementById("nav-dms-lon")?.value?.trim();
      const latStr = document.getElementById("nav-dms-lat")?.value?.trim();

      if (!lonStr || !latStr) {
        showToast("Veuillez saisir les deux coordonnées DMS", "warning");
        return;
      }

      lon = DMSToDecimal(lonStr);
      lat = DMSToDecimal(latStr);

      if (lon === null || lat === null) {
        showToast("Format DMS invalide (ex: 7°35'23.28\"O)", "error");
        return;
      }
    } else {
      // Lecture décimale (WGS84 DD ou Merchich)
      const x = parseFloat(document.getElementById("nav-x")?.value);
      const y = parseFloat(document.getElementById("nav-y")?.value);

      if (isNaN(x) || isNaN(y)) {
        showToast("Coordonnées invalides", "warning");
        return;
      }

      if (epsg === "EPSG:4326-DD") {
        lon = x;
        lat = y;
      } else {
        // Conversion Merchich → WGS84
        const wgs = toWGS84(x, y, epsg);
        lon = wgs.lon;
        lat = wgs.lat;
      }
    }

    // Validation approximative pour le Maroc et sa région
    if (isNaN(lon) || isNaN(lat)) {
      showToast("Coordonnées invalides", "error");
      return;
    }

    // Avertissement si hors Maroc (non bloquant)
    if (!isInMoroccoArea(lon, lat)) {
      showToast("Attention : point hors de la zone Maroc", "warning", 4000);
    }

    _navCurrentWGS84 = { lon, lat };

    // Centrer la carte sur le point
    const mercCoord = wgs84ToMercator(lon, lat);
    APP.map.getView().animate({
      center: [mercCoord.x, mercCoord.y],
      zoom: 17,
      duration: 800,
    });

    // Marqueur temporaire
    APP.tempSource.clear();
    const feature = new ol.Feature({
      geometry: new ol.geom.Point([mercCoord.x, mercCoord.y]),
      featureType: "temp",
    });
    APP.tempSource.addFeature(feature);

    // Afficher le popup avec toutes les coordonnées
    const allCoords = convertFromWGS84(lon, lat);
    showPopup([mercCoord.x, mercCoord.y], buildNavPopupHTML(allCoords));

    // Afficher le résumé dans le panel
    showNavResult(allCoords);

  } catch (err) {
    console.error("[Navigation] Erreur :", err);
    showToast("Erreur de navigation : " + err.message, "error");
  }
}

/**
 * Construit le HTML du popup de navigation.
 * @param {Object} allCoords - Résultat de convertFromWGS84
 * @returns {string}
 */
function buildNavPopupHTML(allCoords) {
  const { wgs84, wgs84dms, z1, z2, z3, z4 } = allCoords;
  return `
    <h4>Point de navigation</h4>
    <div class="popup-coord-row">
      <span class="popup-coord-label">WGS84 (DD) :</span>
      <span class="popup-coord-value">${wgs84.lat.toFixed(6)}°N, ${Math.abs(wgs84.lon).toFixed(6)}°O</span>
      <button class="popup-copy-btn" onclick="copyToClipboard('${wgs84.lat.toFixed(6)}, ${wgs84.lon.toFixed(6)}')">⎘</button>
    </div>
    <div class="popup-coord-row">
      <span class="popup-coord-label">WGS84 (DMS) :</span>
      <span class="popup-coord-value">${wgs84dms.lat}, ${wgs84dms.lon}</span>
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
    <div class="popup-actions">
      <button class="btn-primary-sm" onclick="addNavPointToMarkers()">+ Ajouter marqueur</button>
      <button class="btn-secondary-sm" onclick="APP.tempSource.clear();hidePopup()">Fermer</button>
    </div>
  `;
}

/**
 * Affiche le résumé des coordonnées dans le panel navigation.
 * @param {Object} allCoords
 */
function showNavResult(allCoords) {
  const resultDiv = document.getElementById("nav-result");
  const contentDiv = document.getElementById("nav-result-content");
  if (!resultDiv || !contentDiv) return;

  const { wgs84, wgs84dms, z1, z2, z3, z4 } = allCoords;
  contentDiv.innerHTML = `
    <div class="popup-coord-row"><span class="popup-coord-label">WGS84 DD :</span>
      <span class="popup-coord-value">${wgs84.lat.toFixed(6)}°N, ${Math.abs(wgs84.lon).toFixed(6)}°O</span></div>
    <div class="popup-coord-row"><span class="popup-coord-label">WGS84 DMS :</span>
      <span class="popup-coord-value">${wgs84dms.lat}</span></div>
    <div class="popup-coord-row"><span class="popup-coord-label">Z2 :</span>
      <span class="popup-coord-value">E ${z2.x.toFixed(2)}, N ${z2.y.toFixed(2)}</span></div>
  `;
  resultDiv.style.display = "block";
}

/**
 * Ajoute le point de navigation courant à la liste des marqueurs.
 */
function addNavPointToMarkers() {
  if (!_navCurrentWGS84) {
    showToast("Naviguez d'abord vers un point", "warning");
    return;
  }
  if (typeof addMarker === "function") {
    addMarker(_navCurrentWGS84.lon, _navCurrentWGS84.lat);
    APP.tempSource.clear();
    hidePopup();
    showToast("Point ajouté aux marqueurs", "success");

    // Bascule vers l'onglet Points dans la sidebar
    const pointsTab = document.querySelector('.tab-btn[data-tab="points"]');
    if (pointsTab) pointsTab.click();
  }
}

// ============================================================
// Utilitaires
// ============================================================

/**
 * Copie une chaîne dans le presse-papiers.
 * @param {string} text
 */
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast("Copié !", "success", 1500);
  }).catch(() => {
    // Fallback pour navigateurs anciens
    const el = document.createElement("textarea");
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
    showToast("Copié !", "success", 1500);
  });
}
