/**
 * ui.js — Gestion des panels, toolbar et événements UI
 * Géoportail Maroc
 */

// ============================================================
// Initialisation après le chargement de tous les modules
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  initSidebar();
  initTabs();
  initToolbar();
  initModalImport();
  initModalExport();
});

// ============================================================
// Sidebar
// ============================================================
function initSidebar() {
  const btn = document.getElementById("btn-toggle-sidebar");
  const sidebar = document.getElementById("sidebar");

  btn.addEventListener("click", () => {
    sidebar.classList.toggle("open");
    sidebar.classList.toggle("closed");
    // Déclencher un resize de la carte pour qu'elle se redimensionne
    setTimeout(() => APP.map && APP.map.updateSize(), 250);
  });
}

// ============================================================
// Onglets sidebar
// ============================================================
function initTabs() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const tabId = btn.dataset.tab;

      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

      btn.classList.add("active");
      document.getElementById(`tab-${tabId}`).classList.add("active");
    });
  });
}

// ============================================================
// Toolbar — Outils
// ============================================================
function initToolbar() {
  // Bouton Sélection
  document.getElementById("btn-select").addEventListener("click", () => {
    setActiveTool("select");
    removeDrawInteraction();
    closeFloatingPanel();
  });

  // Bouton Point
  document.getElementById("btn-point").addEventListener("click", () => {
    setActiveTool("point");
    removeDrawInteraction();
    if (typeof activatePointTool === "function") activatePointTool();
    closeFloatingPanel();
  });

  // Bouton Polyligne
  document.getElementById("btn-line").addEventListener("click", () => {
    setActiveTool("line");
    if (typeof startDraw === "function") startDraw("LineString");
    openFloatingPanel("Polyligne", buildDrawPanel("line"));
  });

  // Bouton Polygone
  document.getElementById("btn-polygon").addEventListener("click", () => {
    setActiveTool("polygon");
    if (typeof startDraw === "function") startDraw("Polygon");
    openFloatingPanel("Polygone", buildDrawPanel("polygon"));
  });

  // Bouton Rectangle
  document.getElementById("btn-rectangle").addEventListener("click", () => {
    setActiveTool("rectangle");
    if (typeof startDraw === "function") startDraw("Box");
    openFloatingPanel("Rectangle", buildDrawPanel("rectangle"));
  });

  // Bouton Cercle
  document.getElementById("btn-circle").addEventListener("click", () => {
    setActiveTool("circle");
    if (typeof startDraw === "function") startDraw("Circle");
    openFloatingPanel("Cercle", buildDrawPanel("circle"));
  });

  // Bouton Modifier
  document.getElementById("btn-modify").addEventListener("click", () => {
    setActiveTool("modify");
    removeDrawInteraction();
    if (typeof activateModify === "function") activateModify();
    closeFloatingPanel();
  });

  // Bouton Mesurer distance
  document.getElementById("btn-measure-dist").addEventListener("click", () => {
    setActiveTool("measure-dist");
    if (typeof startMeasureDistance === "function") startMeasureDistance();
    openFloatingPanel("Mesure de distance", buildMeasurePanel());
  });

  // Bouton Effacer tout
  document.getElementById("btn-clear-draw").addEventListener("click", () => {
    if (confirm("Effacer toutes les géométries dessinées ?")) {
      if (APP.drawSource) APP.drawSource.clear();
      APP.drawnFeatures = [];
      setActiveTool("select");
      removeDrawInteraction();
      closeFloatingPanel();
      showToast("Dessin effacé", "info");
    }
  });

  // Bouton Import
  document.getElementById("btn-import").addEventListener("click", () => {
    openModal("modal-import");
  });

  // Bouton Export
  document.getElementById("btn-export").addEventListener("click", () => {
    openModal("modal-export");
    if (typeof buildExportLayersList === "function") buildExportLayersList();
  });

  // Bouton Localiser (navigation par coordonnées)
  document.getElementById("btn-goto").addEventListener("click", () => {
    openFloatingPanel("Aller à un point", buildNavigationPanel());
    if (typeof initNavigationPanel === "function") initNavigationPanel();
  });

  // Bouton Convertir
  document.getElementById("btn-converter").addEventListener("click", () => {
    openFloatingPanel("Conversion de coordonnées", buildConverterPanel());
    if (typeof initConverterPanel === "function") initConverterPanel();
  });

  // Bouton Effacer toutes les couches (sidebar)
  document.getElementById("btn-clear-layers").addEventListener("click", () => {
    if (APP.importedLayers.length === 0) return;
    if (confirm("Supprimer toutes les couches importées ?")) {
      APP.importedLayers.forEach(l => APP.map.removeLayer(l.olLayer));
      APP.importedLayers = [];
      renderLayersList();
      showToast("Couches supprimées", "info");
    }
  });

  // Bouton Effacer tous les points
  document.getElementById("btn-clear-points").addEventListener("click", () => {
    if (typeof clearAllMarkers === "function") clearAllMarkers();
  });

  // Bouton Effacer historique
  document.getElementById("btn-clear-history").addEventListener("click", () => {
    if (typeof clearConversionHistory === "function") clearConversionHistory();
  });

  // Export points CSV / GeoJSON
  document.getElementById("btn-export-points-csv").addEventListener("click", () => {
    if (typeof exportMarkersCSV === "function") exportMarkersCSV();
  });
  document.getElementById("btn-export-points-geojson").addEventListener("click", () => {
    if (typeof exportMarkersGeoJSON === "function") exportMarkersGeoJSON();
  });
}

// ============================================================
// Panel flottant contextuel
// ============================================================

/**
 * Ouvre le panel flottant avec un titre et du contenu HTML.
 * @param {string} title
 * @param {string} htmlContent
 */
function openFloatingPanel(title, htmlContent) {
  document.getElementById("floating-panel-title").textContent = title;
  document.getElementById("floating-panel-content").innerHTML = htmlContent;
  document.getElementById("floating-panel").classList.remove("hidden");
}

/** Ferme le panel flottant. */
function closeFloatingPanel() {
  document.getElementById("floating-panel").classList.add("hidden");
}

// Bouton fermer panel
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-close-panel").addEventListener("click", () => {
    closeFloatingPanel();
    if (APP.currentTool !== "select") setActiveTool("select");
    removeDrawInteraction();
  });
});

// ============================================================
// Contenu HTML des panels contextuels
// ============================================================

/**
 * Construit le HTML du panel de dessin avec affichage des mesures.
 * @param {string} type - "line", "polygon", "rectangle", "circle"
 * @returns {string}
 */
function buildDrawPanel(type) {
  const isSurface = ["polygon", "rectangle", "circle"].includes(type);
  const isLength = ["line", "polygon", "rectangle"].includes(type);

  return `
    <div class="form-section">
      <label>Attributs</label>
      <div class="form-row">
        <label>Nom / Description</label>
        <input type="text" id="draw-attr-name" placeholder="Optionnel...">
      </div>
      <div class="form-row">
        <label>Couleur</label>
        <input type="color" id="draw-attr-color" value="#e94560" style="width:60px;height:28px;padding:2px;cursor:pointer;">
      </div>
    </div>
    ${isSurface ? `
    <div class="draw-info-box" id="draw-area-box">
      <div class="di-label">Surface</div>
      <div class="di-value" id="draw-area-value">—</div>
    </div>` : ""}
    ${isLength ? `
    <div class="draw-info-box" id="draw-length-box">
      <div class="di-label">Longueur / Périmètre</div>
      <div class="di-value" id="draw-length-value">—</div>
    </div>` : ""}
    ${type === "circle" ? `
    <div class="draw-info-box" id="draw-radius-box">
      <div class="di-label">Rayon</div>
      <div class="di-value" id="draw-radius-value">—</div>
    </div>` : ""}
    <p style="font-size:11px;color:var(--text-muted);margin-top:8px;">
      ${type === "line" ? "Cliquez pour ajouter des points. Double-clic pour terminer." : ""}
      ${type === "polygon" ? "Cliquez pour ajouter des sommets. Double-clic pour fermer." : ""}
      ${type === "rectangle" ? "Cliquez le 1er coin puis le coin opposé." : ""}
      ${type === "circle" ? "Cliquez le centre, faites glisser pour le rayon." : ""}
    </p>
    <button class="btn-secondary" onclick="removeDrawInteraction();setActiveTool('select');closeFloatingPanel();" style="margin-top:8px;">
      Terminer
    </button>
  `;
}

/**
 * Construit le HTML du panel de mesure de distance.
 * @returns {string}
 */
function buildMeasurePanel() {
  return `
    <p style="font-size:11px;color:var(--text-muted);margin-bottom:12px;">
      Cliquez sur la carte pour définir les points de mesure.<br>
      Double-clic pour terminer.
    </p>
    <div class="draw-info-box">
      <div class="di-label">Distance totale</div>
      <div class="di-value" id="measure-total-dist">—</div>
    </div>
    <div id="measure-segments" style="margin-top:8px;"></div>
    <button class="btn-secondary" id="btn-reset-measure" style="margin-top:8px;">
      Réinitialiser
    </button>
    <button class="btn-secondary" onclick="removeDrawInteraction();setActiveTool('select');closeFloatingPanel();" style="margin-top:4px;">
      Terminer
    </button>
  `;
}

/**
 * Construit le HTML du panel de navigation.
 * @returns {string}
 */
function buildNavigationPanel() {
  return `
    <div class="form-section">
      <label>Système de coordonnées</label>
      <select id="nav-epsg">
        <option value="EPSG:4326-DD">WGS84 Décimal (DD)</option>
        <option value="EPSG:4326-DMS">WGS84 DMS</option>
        <option value="EPSG:26191">Merchich Zone 1</option>
        <option value="EPSG:26192" selected>Merchich Zone 2</option>
        <option value="EPSG:26193">Merchich Zone 3</option>
        <option value="EPSG:26194">Merchich Zone 4</option>
      </select>
    </div>

    <div class="form-row-inline" id="nav-dd-fields">
      <div class="form-row">
        <label>Longitude / Est (X)</label>
        <input type="number" id="nav-x" step="any" placeholder="-7.5898">
      </div>
      <div class="form-row">
        <label>Latitude / Nord (Y)</label>
        <input type="number" id="nav-y" step="any" placeholder="33.5731">
      </div>
    </div>

    <div id="nav-dms-fields" style="display:none">
      <div class="form-row">
        <label>Longitude (D° M' S&quot; [E/O])</label>
        <input type="text" id="nav-dms-lon" placeholder="7°35'23.28&quot;O">
      </div>
      <div class="form-row">
        <label>Latitude (D° M' S&quot; [N/S])</label>
        <input type="text" id="nav-dms-lat" placeholder="33°34'23.16&quot;N">
      </div>
    </div>

    <button class="btn-primary" id="btn-nav-go">Centrer la carte</button>
    <button class="btn-secondary" id="btn-nav-add-marker" style="margin-top:4px;">
      Ajouter aux points marqués
    </button>

    <div id="nav-result" style="display:none;margin-top:12px;padding-top:10px;border-top:1px solid var(--border)">
      <p style="font-size:11px;font-weight:600;color:var(--text-muted);margin-bottom:6px;">Coordonnées du point :</p>
      <div id="nav-result-content"></div>
    </div>
  `;
}

/**
 * Construit le HTML du panel de conversion de coordonnées.
 * @returns {string}
 */
function buildConverterPanel() {
  return `
    <div class="conv-input-section">
      <div class="form-row">
        <label>Saisie (WGS84 décimal)</label>
        <div class="form-row-inline">
          <div class="form-row">
            <label>Longitude</label>
            <input type="number" id="conv-lon" step="any" placeholder="-7.5898">
          </div>
          <div class="form-row">
            <label>Latitude</label>
            <input type="number" id="conv-lat" step="any" placeholder="33.5731">
          </div>
        </div>
      </div>
      <div style="display:flex;gap:6px;">
        <button class="btn-primary" id="btn-conv-compute" style="flex:1;">Convertir</button>
        <button class="btn-secondary" id="btn-conv-pick" style="flex:1;" title="Cliquer sur la carte">
          📍 Carte
        </button>
      </div>
    </div>

    <table class="conv-table" id="conv-results-table">
      <thead>
        <tr>
          <th>Système</th>
          <th>Valeur</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="conv-results-body">
        <tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:12px;">
          Saisissez des coordonnées pour convertir
        </td></tr>
      </tbody>
    </table>
  `;
}

// ============================================================
// Modals
// ============================================================

/**
 * Ouvre une modal par son ID.
 * @param {string} modalId
 */
function openModal(modalId) {
  document.getElementById(modalId).classList.remove("hidden");
}

/**
 * Ferme une modal par son ID.
 * @param {string} modalId
 */
function closeModal(modalId) {
  document.getElementById(modalId).classList.add("hidden");
}

function initModalImport() {
  // Bouton fermer
  document.querySelectorAll("#modal-import .modal-close").forEach(btn => {
    btn.addEventListener("click", () => closeModal("modal-import"));
  });

  // Clic hors modal
  document.getElementById("modal-import").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeModal("modal-import");
  });
}

function initModalExport() {
  document.querySelectorAll("#modal-export .modal-close").forEach(btn => {
    btn.addEventListener("click", () => closeModal("modal-export"));
  });

  document.getElementById("modal-export").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeModal("modal-export");
  });
}

// ============================================================
// Rendu de la liste des couches (sidebar)
// ============================================================

/**
 * Met à jour l'affichage de la liste des couches importées.
 */
function renderLayersList() {
  const container = document.getElementById("layers-list");

  if (!APP.importedLayers || APP.importedLayers.length === 0) {
    container.innerHTML = '<div class="empty-state">Aucune couche importée</div>';
    return;
  }

  container.innerHTML = APP.importedLayers.map((layer, idx) => `
    <div class="layer-item" data-idx="${idx}">
      <span class="layer-visibility ${layer.olLayer.getVisible() ? "visible" : ""}"
            onclick="toggleLayerVisibility(${idx})" title="Basculer visibilité">
        ${layer.olLayer.getVisible() ? "●" : "○"}
      </span>
      <span class="layer-name" title="${layer.name}">${layer.name}</span>
      <span class="layer-type-badge">${layer.type}</span>
      <button class="icon-btn danger" onclick="removeImportedLayer(${idx})" title="Supprimer">✕</button>
    </div>
  `).join("");
}

/**
 * Bascule la visibilité d'une couche importée.
 * @param {number} idx
 */
function toggleLayerVisibility(idx) {
  const layer = APP.importedLayers[idx];
  if (!layer) return;
  const visible = !layer.olLayer.getVisible();
  layer.olLayer.setVisible(visible);
  renderLayersList();
}

/**
 * Supprime une couche importée.
 * @param {number} idx
 */
function removeImportedLayer(idx) {
  const layer = APP.importedLayers[idx];
  if (!layer) return;
  APP.map.removeLayer(layer.olLayer);
  APP.importedLayers.splice(idx, 1);
  renderLayersList();
  showToast(`Couche "${layer.name}" supprimée`, "info");
}
