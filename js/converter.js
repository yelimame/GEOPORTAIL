/**
 * converter.js — Panel de conversion de coordonnées
 * Géoportail Maroc
 *
 * Conversion simultanée WGS84 ↔ Merchich (toutes zones),
 * avec historique des 20 dernières conversions.
 */

// ============================================================
// État
// ============================================================
let _conversionHistory = [];   // Historique des 20 dernières conversions
const MAX_HISTORY = 20;

// ============================================================
// Initialisation du panel de conversion
// ============================================================

/**
 * Initialise les événements du panel de conversion une fois injecté.
 * Appelé par ui.js après openFloatingPanel().
 */
function initConverterPanel() {
  const computeBtn = document.getElementById("btn-conv-compute");
  const pickBtn = document.getElementById("btn-conv-pick");

  if (!computeBtn) return;

  computeBtn.addEventListener("click", performConversion);

  // Bouton "Cliquer sur la carte"
  pickBtn.addEventListener("click", () => {
    setActiveTool("convert-pick");
    showToast("Cliquez sur la carte pour capturer les coordonnées", "info", 3000);
  });

  // Calcul automatique au changement des champs
  ["conv-lon", "conv-lat"].forEach(id => {
    document.getElementById(id)?.addEventListener("input", debounce(performConversion, 500));
  });
}

/**
 * Effectue la conversion et affiche les résultats dans le tableau.
 */
function performConversion() {
  const lonInput = document.getElementById("conv-lon");
  const latInput = document.getElementById("conv-lat");
  if (!lonInput || !latInput) return;

  const lon = parseFloat(lonInput.value);
  const lat = parseFloat(latInput.value);

  if (isNaN(lon) || isNaN(lat)) {
    document.getElementById("conv-results-body").innerHTML = `
      <tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:12px;">
        Saisissez des coordonnées valides
      </td></tr>`;
    return;
  }

  const all = convertFromWGS84(lon, lat);
  renderConversionTable(all, lon, lat);

  // Enregistrement dans l'historique
  addToConversionHistory(lon, lat, all);
}

/**
 * Gestionnaire de clic sur la carte pour la conversion (depuis main.js).
 * @param {{ lon: number, lat: number }} wgs
 */
function onMapClickConvert(wgs) {
  // Remplir les champs
  const lonInput = document.getElementById("conv-lon");
  const latInput = document.getElementById("conv-lat");
  if (lonInput) lonInput.value = wgs.lon.toFixed(8);
  if (latInput) latInput.value = wgs.lat.toFixed(8);

  performConversion();

  // Revenir à l'outil de sélection
  setActiveTool("select");
}

// ============================================================
// Affichage du tableau de résultats
// ============================================================

/**
 * Remplit le tableau de conversion avec toutes les coordonnées.
 *
 * @param {Object} all   - Résultat de convertFromWGS84
 * @param {number} lon
 * @param {number} lat
 */
function renderConversionTable(all, lon, lat) {
  const tbody = document.getElementById("conv-results-body");
  if (!tbody) return;

  const { wgs84, wgs84dms, z1, z2, z3, z4, webMercator } = all;

  const rows = [
    {
      label: "WGS84 (DD)",
      value: `${lat.toFixed(8)}°, ${lon.toFixed(8)}°`,
      copy: `${lat.toFixed(8)}, ${lon.toFixed(8)}`,
    },
    {
      label: "WGS84 Lat DMS",
      value: wgs84dms.lat,
      copy: wgs84dms.lat,
    },
    {
      label: "WGS84 Lon DMS",
      value: wgs84dms.lon,
      copy: wgs84dms.lon,
    },
    {
      label: "Merchich Zone 1",
      value: `E: ${z1.x.toFixed(3)} m, N: ${z1.y.toFixed(3)} m`,
      copy: `${z1.x.toFixed(3)} ${z1.y.toFixed(3)}`,
    },
    {
      label: "Merchich Zone 2",
      value: `E: ${z2.x.toFixed(3)} m, N: ${z2.y.toFixed(3)} m`,
      copy: `${z2.x.toFixed(3)} ${z2.y.toFixed(3)}`,
    },
    {
      label: "Merchich Zone 3",
      value: `E: ${z3.x.toFixed(3)} m, N: ${z3.y.toFixed(3)} m`,
      copy: `${z3.x.toFixed(3)} ${z3.y.toFixed(3)}`,
    },
    {
      label: "Merchich Zone 4",
      value: `E: ${z4.x.toFixed(3)} m, N: ${z4.y.toFixed(3)} m`,
      copy: `${z4.x.toFixed(3)} ${z4.y.toFixed(3)}`,
    },
    {
      label: "Web Mercator",
      value: `X: ${webMercator.x.toFixed(2)}, Y: ${webMercator.y.toFixed(2)}`,
      copy: `${webMercator.x.toFixed(2)} ${webMercator.y.toFixed(2)}`,
    },
  ];

  tbody.innerHTML = rows.map(row => `
    <tr>
      <td style="color:var(--text-muted);font-size:11px;">${row.label}</td>
      <td class="conv-value">${row.value}</td>
      <td>
        <button class="conv-copy-btn" onclick="copyToClipboard('${row.copy.replace(/'/g, "\\'")}')">
          Copier
        </button>
      </td>
    </tr>
  `).join("");
}

// ============================================================
// Historique des conversions
// ============================================================

/**
 * Ajoute une conversion à l'historique.
 *
 * @param {number} lon
 * @param {number} lat
 * @param {Object} allCoords
 */
function addToConversionHistory(lon, lat, allCoords) {
  const entry = {
    lon,
    lat,
    allCoords,
    time: new Date(),
  };

  _conversionHistory.unshift(entry); // Plus récent en premier

  if (_conversionHistory.length > MAX_HISTORY) {
    _conversionHistory = _conversionHistory.slice(0, MAX_HISTORY);
  }

  renderConversionHistory();
}

/**
 * Efface l'historique des conversions.
 */
function clearConversionHistory() {
  _conversionHistory = [];
  renderConversionHistory();
  showToast("Historique effacé", "info");
}

/**
 * Affiche l'historique des conversions dans la sidebar.
 */
function renderConversionHistory() {
  const container = document.getElementById("history-list");
  if (!container) return;

  if (_conversionHistory.length === 0) {
    container.innerHTML = '<div class="empty-state">Aucune conversion enregistrée</div>';
    return;
  }

  container.innerHTML = _conversionHistory.map((entry, idx) => {
    const { lon, lat, allCoords, time } = entry;
    const { z2 } = allCoords;
    const timeStr = time.toLocaleTimeString("fr-FR");

    return `
      <div class="history-item" onclick="restoreConversion(${idx})">
        <div class="history-coords">
          WGS84 : ${lat.toFixed(5)}°N, ${Math.abs(lon).toFixed(5)}°O
        </div>
        <div class="history-coords">
          Merchich Z2 : E ${z2.x.toFixed(2)}, N ${z2.y.toFixed(2)}
        </div>
        <div class="history-time">${timeStr}</div>
      </div>
    `;
  }).join("");
}

/**
 * Restaure une conversion depuis l'historique dans le panel de conversion.
 * @param {number} idx - Index dans l'historique
 */
function restoreConversion(idx) {
  const entry = _conversionHistory[idx];
  if (!entry) return;

  // Ouvrir le panel de conversion si pas déjà ouvert
  openFloatingPanel("Conversion de coordonnées", buildConverterPanel());
  initConverterPanel();

  // Remplir les champs
  setTimeout(() => {
    const lonInput = document.getElementById("conv-lon");
    const latInput = document.getElementById("conv-lat");
    if (lonInput) lonInput.value = entry.lon.toFixed(8);
    if (latInput) latInput.value = entry.lat.toFixed(8);

    renderConversionTable(entry.allCoords, entry.lon, entry.lat);
  }, 50);
}

// ============================================================
// Conversion depuis une projection quelconque vers WGS84
// (entrée alternative dans le panel)
// ============================================================

/**
 * Construit le HTML du panel de conversion étendu (avec sélecteur de projection source).
 * Utilisé si l'on veut entrer en Merchich directement.
 * @returns {string}
 */
function buildExtendedConverterPanel() {
  return `
    <div class="conv-input-section">
      <div class="form-row">
        <label>Projection source</label>
        <select id="conv-src-proj">
          <option value="EPSG:4326">WGS84 (DD)</option>
          <option value="EPSG:26191">Merchich Zone 1</option>
          <option value="EPSG:26192">Merchich Zone 2</option>
          <option value="EPSG:26193">Merchich Zone 3</option>
          <option value="EPSG:26194">Merchich Zone 4</option>
        </select>
      </div>
      <div class="form-row-inline">
        <div class="form-row">
          <label id="conv-x-label">Longitude (X)</label>
          <input type="number" id="conv-x" step="any">
        </div>
        <div class="form-row">
          <label id="conv-y-label">Latitude (Y)</label>
          <input type="number" id="conv-y" step="any">
        </div>
      </div>
      <div style="display:flex;gap:6px;">
        <button class="btn-primary" id="btn-conv-ext-compute" style="flex:1;">Convertir</button>
        <button class="btn-secondary" id="btn-conv-pick" style="flex:1;">📍 Carte</button>
      </div>
    </div>
    <table class="conv-table">
      <thead><tr><th>Système</th><th>Valeur</th><th></th></tr></thead>
      <tbody id="conv-results-body">
        <tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:12px;">
          Saisissez des coordonnées pour convertir
        </td></tr>
      </tbody>
    </table>
  `;
}

// ============================================================
// Utilitaire debounce
// ============================================================

/**
 * Retarde l'exécution d'une fonction.
 * @param {Function} fn
 * @param {number}   delay - ms
 * @returns {Function}
 */
function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}
