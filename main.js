import { CONFIG } from "./config.js";
import { preloadFontsForPreview, fontData, blobToDataURL, probeImage, preloadGalatticaLogos, fetchAndProcessSVG, readAndProcessSVGFile } from "./assets.js";
import { buildSVG } from "./render.js";
import {
  buildSwatchGroup,
  setInputs,
  buildBgSelector,
  buildSizeSliders,
  buildSpacingSliders,
  aspectMatches,
  prettyAspect
} from "./ui.js";
import { initPreset } from "./preset.js";
import { addToLog } from "./log-export.js";

async function fetchDynamicBackgrounds() {
  const fallback = CONFIG.background.files || [];
  try {
    // 1. Try to fetch a potential JSON manifest or script (list.php)
    // This is the cleanest way if the user can upload a small script.
    const jsonResp = await fetch("sfondi/list.php");
    if (jsonResp.ok && jsonResp.headers.get("content-type")?.includes("application/json")) {
        const data = await jsonResp.json();
        if (Array.isArray(data)) return Array.from(new Set([...fallback, ...data]));
    }

    // 2. Try the directory itself (works if directory listing is enabled)
    const resp = await fetch("sfondi/");
    if (resp.ok) {
        const text = await resp.text();
        const regex = /href="([^" ]+\.(?:png|jpg|jpeg|webp))"/gi;
        const found = [];
        let match;
        while ((match = regex.exec(text)) !== null) {
          const filename = match[1];
          if (!found.includes(filename) && !filename.startsWith("..") && !filename.startsWith("/")) {
            found.push(filename);
          }
        }
        if (found.length > 0) return Array.from(new Set([...fallback, ...found]));
    }

    return fallback;
  } catch (e) {
    console.warn("Could not fetch dynamic backgrounds, using fallback.", e);
    return fallback;
  }
}

// ----- DOM refs -----
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d", { alpha: true });

const pageSizeSelect = document.getElementById("pageSize");
const layoutSelect = document.getElementById("layout");
const galatticaLogoSelect = document.getElementById("galatticaLogoSelect");
const institutionalLogoColorSelect = document.getElementById("institutionalLogoColorSelect");
const inputsDiv = document.getElementById("inputs");
const topLogoControls = document.getElementById("topLogoControls");
const bottomLogoControls = document.getElementById("bottomLogoControls");

const bgPicker = document.getElementById("bgPicker");
const textPicker = document.getElementById("textPicker");

const scaleInput = document.getElementById("scale");
const exportPngBtn = document.getElementById("exportPngBtn");
const exportPdfBtn = document.getElementById("exportPdfBtn");

const bgSelectorContainer = document.getElementById("bgSelectorContainer");

const logoInput = document.getElementById("logoInput");
const logoList = document.getElementById("logoList");

const artboard = document.getElementById("artboard");
const zoomRange = document.getElementById("zoomRange");
const resetZoomBtn = document.getElementById("resetZoom");

// Reference to the main container for touch events
const main = document.querySelector("main");

// ----- Stato -----
const state = {
  content: { tag:"", data:"", titolo:"", sottotitolo:"", descrizione:"", luogo:"", qrLink:"" },
  canvasW: 1080,
  canvasH: 1440,
  bgColor: CONFIG.background.defaultColor,
  textColor: CONFIG.text.defaultColor,
  userBgDataURL: null,
  userBgAR: null,
  logos: [],
  institutionalLogo: null,
  margins: { ...CONFIG.pagePresets["1080x1440"].margins },
  sizeRatio: { ...CONFIG.typography.baseRatios },
  layout: "evento",
  textAlign: "center",
  galatticaLogo: "black",
  institutionalLogoColor: "black",
  galatticaLogos: {},
  zoom: 1,
  pan: { x: 0, y: 0 },
  qrSizeRatioIndex: 1, // Default index for QR size (20%)
  customBgActive: false,
  customBgLayers: [],
  customBgFit: "cover"
};

const STATE_KEY = "galattica_tool_state";

function saveState() {
  const toSave = {
    layout: state.layout,
    bgColor: state.bgColor,
    textColor: state.textColor,
    content: state.content,
    galatticaLogo: state.galatticaLogo,
    institutionalLogoColor: state.institutionalLogoColor,
    customBgActive: state.customBgActive,
    customBgLayers: state.customBgLayers,
    customBgFit: state.customBgFit
  };
  localStorage.setItem(STATE_KEY, JSON.stringify(toSave));
}

function loadState() {
  const saved = localStorage.getItem(STATE_KEY);
  if (!saved) return;
  try {
    const data = JSON.parse(saved);
    if (data.layout) {
        state.layout = data.layout;
        if (layoutSelect) layoutSelect.value = data.layout;
    }
    if (data.bgColor) state.bgColor = data.bgColor;
    if (data.textColor) state.textColor = data.textColor;
    if (data.content) state.content = { ...state.content, ...data.content };
    if (data.galatticaLogo) {
        state.galatticaLogo = data.galatticaLogo;
        if (galatticaLogoSelect) galatticaLogoSelect.value = data.galatticaLogo;
    }
    if (data.institutionalLogoColor) {
        state.institutionalLogoColor = data.institutionalLogoColor;
        if (institutionalLogoColorSelect) institutionalLogoColorSelect.value = data.institutionalLogoColor;
    }
    if (typeof data.customBgActive !== 'undefined') {
        state.customBgActive = !!data.customBgActive;
    }
    if (data.customBgLayers) {
        state.customBgLayers = data.customBgLayers;
    }
    if (data.customBgFit) {
        state.customBgFit = data.customBgFit;
    }
  } catch (e) {
    console.warn("Could not load state from localStorage", e);
  }
}

// Override Helper
function applyOverrides(p) {
  state.sizeRatio = { ...CONFIG.typography.baseRatios };
  state.lineHeightMult = { ...CONFIG.typography.lineHeightMult };
  state.spacingRatios = { ...CONFIG.typography.spacingRatios };
  state.textAlign = "center"; // Reset to default

  if (p.overrides) {
    if (p.overrides.sizeRatio) {
      state.sizeRatio = { ...state.sizeRatio, ...p.overrides.sizeRatio };
    }
    if (p.overrides.lineHeightMult) {
      state.lineHeightMult = { ...state.lineHeightMult, ...p.overrides.lineHeightMult };
    }
    if (p.overrides.spacingRatios) {
      state.spacingRatios = { ...state.spacingRatios, ...p.overrides.spacingRatios };
    }
    state.bgMode = p.overrides.bgMode || "fit";
    state.textAlign = p.overrides.textAlign || "center";
  } else {
    state.bgMode = "fit";
  }

  const disableLogos = (p.overrides && p.overrides.disableLogos) || state.layout === "OPPORTUNITÀ/STRUMENTI";
  if(topLogoControls) topLogoControls.style.display = disableLogos ? 'none' : 'block';
  if(bottomLogoControls) bottomLogoControls.style.display = disableLogos ? 'none' : 'block';

  const disableLayoutSelect = p.overrides && p.overrides.disableLayoutSelect;
  if(layoutSelect) {
      layoutSelect.style.display = disableLayoutSelect ? 'none' : 'block';
      const label = layoutSelect.previousElementSibling;
      if(label && label.tagName === 'LABEL') {
         label.style.display = disableLayoutSelect ? 'none' : 'block';
      }
  }
}

// ----- Init dimensioni -----
function currentPreset() {
  const val = pageSizeSelect.value;
  if (state.layout === "OPPORTUNITÀ/STRUMENTI" && val === "1080x1440") {
    return CONFIG.pagePresets["1080x1440-opportunita"];
  }
  return CONFIG.pagePresets[val];
}
function setPageSize() {
  const p = currentPreset();
  canvas.width = state.canvasW = p.width;
  canvas.height = state.canvasH = p.height;
  state.margins = { ...p.margins };
  artboard.style.width = canvas.width + "px";
  artboard.style.height = canvas.height + "px";
  
  // Reset pan on page size change
  state.pan.x = 0;
  state.pan.y = 0;
  
  fitPreview();
  applyOverrides(p);
  syncContentToLayout();
  rebuildInputs();
  updateInstitutionalLogo();
}

function updatePageSizeOptions() {
  const currentLayout = state.layout;
  const options = pageSizeSelect.querySelectorAll("option");
  let sizeChanged = false;
  
  options.forEach(opt => {
    // Reset label for the 1080x1440 option first
    if (opt.value === "1080x1440") {
      opt.textContent = currentLayout === "OPPORTUNITÀ/STRUMENTI" 
        ? "1080×1350 px (Portrait)" 
        : "1080×1440 px (Portrait)";
    }

    if (currentLayout === "ACCENDIAMO I MOTORI") {
      const allowed = ["1080x1440", "1080x1920", "A4", "A3"];
      opt.style.display = allowed.includes(opt.value) ? "block" : "none";
      
      if (pageSizeSelect.value === opt.value && opt.style.display === "none") {
        pageSizeSelect.value = "1080x1440";
        sizeChanged = true;
      }
    } else if (currentLayout === "OPPORTUNITÀ/STRUMENTI") {
      const allowed = ["1080x1440", "cover-web"];
      opt.style.display = allowed.includes(opt.value) ? "block" : "none";

      if (pageSizeSelect.value === opt.value && opt.style.display === "none") {
        pageSizeSelect.value = "1080x1440";
        sizeChanged = true;
      }
    } else {
      opt.style.display = "block";
    }
  });

  if (sizeChanged) {
      setPageSize();
  }
}

function getGlyphCenterY(letter, ss) {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 10;
    canvas.height = 10;
    const ctx = canvas.getContext("2d");
    ctx.font = "1000px 'GalatticaGen'";
    if (ctx.fontFeatureSettings !== undefined) {
      ctx.fontFeatureSettings = `'${ss}' 1`;
    }
    const metrics = ctx.measureText ? ctx.measureText(letter) : null;
    if (metrics && metrics.actualBoundingBoxAscent !== undefined) {
      const ascent = metrics.actualBoundingBoxAscent;
      const descent = metrics.actualBoundingBoxDescent;
      if (ascent === 0 && descent === 0) {
        return 800; // Fallback if font not yet loaded
      }
      return 500 + (ascent - descent) / 2;
    }
    return 800; // Safe default fallback
  } catch (e) {
    console.warn("[Measure] Canvas measure failed:", e);
    return 800;
  }
}

// ----- Draw -----
function draw(showGuides = true) {
  if (state.customBgActive) {
    const layers = state.customBgLayers || [];
    const firstLayer = layers[0] || { letter: 'A', ss: 'ss02' };
    state.customBgY = getGlyphCenterY(firstLayer.letter, firstLayer.ss);
  }
  saveState();
  const p = currentPreset();
    const disableLogos = (p.overrides && p.overrides.disableLogos) || state.layout === "OPPORTUNITÀ/STRUMENTI";
  
    const effectiveState = { 
        ...state,
        canvasW: state.canvasW,
        canvasH: state.canvasH,
        logos: disableLogos ? [] : state.logos,
        institutionalLogo: disableLogos ? null : state.institutionalLogo,
        galatticaLogo: disableLogos ? 'none' : state.galatticaLogo
    };

  const svg = buildSVG(
    effectiveState,
    { showGuides, embedFonts: true }
  );
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  const img = new Image();
  img.onload = () => {
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  };
  img.src = url;
}

// ----- UI builders -----
function rebuildInputs() {
  const p = currentPreset();
  const visibleFields = p.overrides ? p.overrides.visibleFields : null;
  const labelOverrides = p.overrides ? p.overrides.labelOverrides : null;
  setInputs(state, inputsDiv, () => draw(true), visibleFields, labelOverrides);
}

function buildSwatches() {
  buildSwatchGroup(bgPicker, CONFIG.palette, state.bgColor, (hex) => {
    state.bgColor = hex;
    draw(true);
  });
  buildSwatchGroup(textPicker, CONFIG.textPalette || CONFIG.palette, state.textColor, (hex) => {
    state.textColor = hex;

    // Skip logo color sync for OPPORTUNITÀ/STRUMENTI
    if (state.layout === "OPPORTUNITÀ/STRUMENTI") {
        updateInstitutionalLogo();
        return;
    }

    const h = hex.toLowerCase();

    // Disable logo-sync logic for OPPORTUNITÀ/STRUMENTI
    if (state.layout !== 'OPPORTUNITÀ/STRUMENTI') {
      if (h === '#ffffff' || h === '#fff') {
         state.galatticaLogo = 'white';
         if(galatticaLogoSelect) galatticaLogoSelect.value = 'white';
         state.institutionalLogoColor = 'white';
         if(institutionalLogoColorSelect) institutionalLogoColorSelect.value = 'white';
      } else if (h === '#000000' || h === '#000') {
         state.galatticaLogo = 'black';
         if(galatticaLogoSelect) galatticaLogoSelect.value = 'black';
         state.institutionalLogoColor = 'black';
         if(institutionalLogoColorSelect) institutionalLogoColorSelect.value = 'black';
      }
      updateInstitutionalLogo();
    } else {
      draw(true);
    }
  });
}

// ----- Logo Handling -----
async function updateInstitutionalLogo() {
  try {
    if (state.institutionalLogoColor === 'none') {
      state.institutionalLogo = null;
      draw(true);
      return;
    }

    const isPrint = pageSizeSelect.value === 'A3' || pageSizeSelect.value === 'A4';
    const variant = state.institutionalLogoColor === 'white' ? 'white' : 'black';
    const files = isPrint ? CONFIG.logo.files.print : CONFIG.logo.files.social;
    const filename = files[variant];

    const url = await fetchAndProcessSVG(filename);
    const dim = await probeImage(url);
    state.institutionalLogo = {
      url: url,
      w: dim.width,
      h: dim.height,
      ratio: dim.height / dim.width
    };
    draw(true);
  } catch (e) {
    console.warn("Could not load institutional logo", e);
  }
}

async function initDefaultLogo() {
  await updateInstitutionalLogo();
}

function renderLogoList() {
  logoList.innerHTML = "";
  state.logos.forEach((l, idx) => {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "8px";
    row.style.marginBottom = "4px";
    
    const img = document.createElement("img");
    img.src = l.url;
    img.style.height = "24px";
    img.style.border = "1px solid #ddd";
    
    const info = document.createElement("span");
    info.className = "muted";
    info.textContent = `Logo ${idx+1}`;
    info.style.flex = "1";
    info.style.fontSize = "12px";

    const del = document.createElement("button");
    del.textContent = "✕";
    del.style.padding = "2px 6px";
    del.style.fontSize = "10px";
    del.onclick = () => {
      state.logos.splice(idx, 1);
      renderLogoList();
      draw(true);
    };

    row.appendChild(img);
    row.appendChild(info);
    row.appendChild(del);
    logoList.appendChild(row);
  });
}

logoInput.addEventListener("change", async (e) => {
  if (!e.target.files.length) return;
  for (const file of e.target.files) {
    try {
      let url;
      if (file.type === 'image/svg+xml' || file.name.endsWith('.svg')) {
          url = await readAndProcessSVGFile(file);
      } else {
          url = await blobToDataURL(file);
      }
      const dim = await probeImage(url);
      const w = dim.width || 100;
      const h = dim.height || 100;
      state.logos.push({
        id: Date.now() + Math.random(),
        url: url,
        w: w,
        h: h,
        ratio: h / w
      });
    } catch (err) {
      console.error(err);
    }
  }
  logoInput.value = "";
  renderLogoList();
  draw(true);
});

// ----- Export -----
async function exportPNG() {
  const scale = clamp(
    parseInt(scaleInput.value) || CONFIG.export.defaultScale,
    1,
    CONFIG.export.maxScale
  );
  const p = currentPreset();
  const disableLogos = p.overrides && p.overrides.disableLogos;
  const effectiveState = { 
      ...state,
      canvasW: state.canvasW,
      canvasH: state.canvasH,
      logos: disableLogos ? [] : state.logos,
      institutionalLogo: disableLogos ? null : state.institutionalLogo,
      galatticaLogo: disableLogos ? 'none' : state.galatticaLogo
  };

  const svg = buildSVG(effectiveState, { showGuides: false, embedFonts: true });
  const targetW = canvas.width * scale;
  const targetH = canvas.height * scale;
  const pngCanvas = await svgToCanvas(svg, targetW, targetH);
  const link = document.createElement("a");
  link.download = getFileName("png");
  link.href = pngCanvas.toDataURL("image/png");
  link.click();
  
  // Log export
  addToLog(state, "png");
}

async function exportPDF() {
  const { jsPDF } = window.jspdf;
  let pdfW = 210, pdfH = 297, orientation = "p", format = "a4";
  if (state.canvasW === 3508 && state.canvasH === 4961) {
      pdfW = 297; pdfH = 420; format = "a3";
  } else if (state.canvasW === 4961 && state.canvasH === 3508){
      pdfW = 420; pdfH = 297; orientation = "l"; format = "a3";
  } else {
      pdfW = state.canvasW / 11.811; 
      pdfH = state.canvasH / 11.811;
      format = [pdfW, pdfH];
  }
  const doc = new jsPDF({
    orientation: pdfW > pdfH ? 'l' : 'p',
    unit: 'mm',
    format: format,
    compress: true
  });
  const scale = (state.canvasW > 3000) ? 1 : 4;
  const p = currentPreset();
  const disableLogos = p.overrides && p.overrides.disableLogos;
  const effectiveState = { 
      ...state,
      canvasW: state.canvasW,
      canvasH: state.canvasH,
      logos: disableLogos ? [] : state.logos,
      institutionalLogo: disableLogos ? null : state.institutionalLogo,
      galatticaLogo: disableLogos ? 'none' : state.galatticaLogo
  };
  const svg = buildSVG(effectiveState, { showGuides: false, embedFonts: true });
  const targetW = state.canvasW * scale;
  const targetH = state.canvasH * scale;
  try {
    const canvasTmp = await svgToCanvas(svg, targetW, targetH);
    const imgData = canvasTmp.toDataURL('image/jpeg', 0.98); 
    doc.addImage(imgData, 'JPEG', 0, 0, pdfW, pdfH);
    doc.save(getFileName("pdf"));
    
    // Log export
    addToLog(state, "pdf");
  } catch (e) {
    console.error("PDF Export failed:", e);
    alert("Errore esportazione PDF: " + e.message);
  }
}

function svgToCanvas(svgString, w, h) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const cctx = c.getContext("2d");
      cctx.imageSmoothingEnabled = true;
      cctx.imageSmoothingQuality = "high";
      cctx.drawImage(img, 0, 0, w, h);
      resolve(c);
    };
    img.onerror = reject;
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgString);
  });
}

// ----- Zoom/fit -----
function fitPreview() {
  const sidebar = document.querySelector("aside");
  const artboard = document.getElementById("artboard");
  const zoomRange = document.getElementById("zoomRange");
  const sidebarFixed = getComputedStyle(sidebar).position === "fixed";
  const sidebarW = sidebarFixed ? 0 : sidebar.offsetWidth || 0;
  
  const maxH = window.innerHeight - 20;
  const maxW = window.innerWidth - sidebarW - 20;
  
  const scaleH = maxH / canvas.height;
  const scaleW = maxW / canvas.width;
  
  const auto = Math.min(scaleH, scaleW, 1);
  const manual = (zoomRange.value | 0) / 100 || 1;
  const finalScale = auto * manual;
  
  state.zoom = finalScale;
  artboard.style.transform = `translate(calc(-50% + ${state.pan.x}px), calc(-50% + ${state.pan.y}px)) scale(${finalScale})`;
}

// ----- Helpers -----
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

function getFileName(ext) {
  const t = (state.content.titolo || "evento").trim().replace(/[^a-z0-9àèìòù]+/gi, "_");
  const d = (state.content.data || "").trim().replace(/[^a-z0-9]+/gi, "_");
  const name = d ? `${t}_${d}` : t;
  return `${name}.${ext}`;
}

// ----- Events -----
pageSizeSelect.addEventListener("change", () => {
  setPageSize();
  draw(true);
});
function updateUrlParam(val) {
  const url = new URL(window.location);
  url.searchParams.set('tipologia', val);
  window.history.replaceState({}, '', url);
}

function syncContentToLayout() {
  const p = currentPreset();
  const layout = state.layout;
  const visible = p.overrides && p.overrides.visibleFields;
  
  const allKeys = ["tag", "data", "titolo", "sottotitolo", "descrizione", "luogo", "qrLink"];
  let keysToKeep = [];

  if (visible) {
    keysToKeep = visible;
  } else if (layout === "ACCENDIAMO I MOTORI") {
    keysToKeep = ["titolo", "descrizione", "qrLink", "luogo"];
  } else {
    // Default (EVENTO PLI)
    keysToKeep = ["data", "titolo", "sottotitolo", "descrizione", "luogo"];
  }

  allKeys.forEach(k => {
    if (!keysToKeep.includes(k)) {
      state.content[k] = "";
    }
  });
}

layoutSelect.addEventListener("change", () => {
  state.layout = layoutSelect.value;
  updateUrlParam(state.layout);
  
  // 1. Sync content (clear fields not present in the new layout)
  syncContentToLayout();
  
  // 2. Update available sizes (might trigger setPageSize)
  updatePageSizeOptions();
  
  // 3. Get the updated preset and apply it
  const p = currentPreset();
  applyOverrides(p);
  
  // 4. Rebuild inputs once
  rebuildInputs();

  // Logo visibility logic update
  const disableLogos = p.overrides && p.overrides.disableLogos;
  if (institutionalLogoColorSelect) {
    institutionalLogoColorSelect.style.display = disableLogos ? 'none' : 'block';
    const label = institutionalLogoColorSelect.previousElementSibling;
    if (label && label.tagName === 'LABEL') {
      label.style.display = disableLogos ? 'none' : 'block';
    }
  }

  draw(true);
});

function updateTextPickerUI(hex) {
  state.textColor = hex;
  const chips = textPicker.querySelectorAll(".swatch-chip");
  chips.forEach(chip => {
    if (chip.dataset.hex && chip.dataset.hex.toLowerCase() === hex.toLowerCase()) {
      chip.classList.add("selected");
    } else {
      chip.classList.remove("selected");
    }
  });
}

galatticaLogoSelect.addEventListener("change", () => {
  const val = galatticaLogoSelect.value;
  state.galatticaLogo = val;
  if (val === 'black' || val === 'white') {
      state.institutionalLogoColor = val;
      if (institutionalLogoColorSelect) institutionalLogoColorSelect.value = val;
      const newHex = (val === 'white') ? '#FFFFFF' : '#000000';
      updateTextPickerUI(newHex);
      updateInstitutionalLogo();
  } else {
      draw(true);
  }
});

institutionalLogoColorSelect.addEventListener("change", () => {
    const val = institutionalLogoColorSelect.value;
    state.institutionalLogoColor = val;
    if (val === 'black' || val === 'white') {
        state.galatticaLogo = val;
        if (galatticaLogoSelect) galatticaLogoSelect.value = val;
        const newHex = (val === 'white') ? '#FFFFFF' : '#000000';
        updateTextPickerUI(newHex);
    }
    updateInstitutionalLogo();
});

window.addEventListener("resize", fitPreview);
zoomRange.addEventListener("input", fitPreview);
resetZoomBtn.addEventListener("click", () => {
  zoomRange.value = 100;
  state.pan.x = 0;
  state.pan.y = 0;
  fitPreview();
});

exportPngBtn.addEventListener("click", exportPNG);
if(exportPdfBtn) exportPdfBtn.addEventListener("click", exportPDF);

// BG Selector will be initialized in boot after dynamic fetch
let bgSelectorController = null;

// ----- Interactive Canvas (Panning & Pinch) -----
(function setupCanvasInteractions() {
  let isDragging = false;
  let startX, startY;
  let lastDist = 0;
  
  const onStart = (x, y) => {
    isDragging = true;
    startX = x - state.pan.x;
    startY = y - state.pan.y;
  };

  const onMove = (x, y) => {
    if (!isDragging) return;
    state.pan.x = x - startX;
    state.pan.y = y - startY;
    fitPreview();
  };

  const onEnd = () => { isDragging = false; };

  // Mouse
  main.addEventListener("mousedown", (e) => onStart(e.clientX, e.clientY));
  window.addEventListener("mousemove", (e) => onMove(e.clientX, e.clientY));
  window.addEventListener("mouseup", onEnd);

  // Touch
  main.addEventListener("touchstart", (e) => {
    if (e.touches.length === 1) {
      onStart(e.touches[0].clientX, e.touches[0].clientY);
    } else if (e.touches.length === 2) {
      isDragging = false;
      lastDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    }
  }, { passive: false });

  main.addEventListener("touchmove", (e) => {
    if (e.touches.length === 1) {
      onMove(e.touches[0].clientX, e.touches[0].clientY);
    } else if (e.touches.length === 2) {
      e.preventDefault();
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      if (lastDist > 0) {
        const delta = dist / lastDist;
        const currentVal = parseInt(zoomRange.value);
        const newVal = clamp(currentVal * delta, 10, 200);
        zoomRange.value = newVal;
        fitPreview();
      }
      lastDist = dist;
    }
  }, { passive: false });

})();

// ----- Custom Character-Based Background Generator (galattica-gen) -----
function escapeXML(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function getPaletteGroups() {
  const light = [];
  const main = [];
  const dark = [];
  CONFIG.palette.forEach(c => {
    const name = c.name.toLowerCase();
    const hex = c.hex.toLowerCase();
    if (hex === '#ffffff' || hex === '#000000') return; // Skip white and black for backgrounds
    
    if (name.includes("light")) {
      light.push(c.hex);
    } else if (name.includes("dark") || name === "navy" || name === "teal") {
      dark.push(c.hex);
    } else {
      main.push(c.hex);
    }
  });
  return { light, main, dark };
}

function generateRandomCustomBg() {
  const groups = getPaletteGroups();
  const layersCount = Math.random() < 0.5 ? 2 : 3; // 2 or 3 layers
  const chosenColors = [];
  const otherGroup = Math.random() < 0.5 ? groups.light : groups.dark;
  const mainPool = [...groups.main];
  const otherPool = [...otherGroup];
  
  const pickRandomUnique = (pool, used) => {
    const avail = pool.filter(c => !used.includes(c));
    if (avail.length === 0) return null;
    const c = avail[Math.floor(Math.random() * avail.length)];
    used.push(c);
    return c;
  };
  
  const usedHex = [];
  if (mainPool.length > 0 && otherPool.length > 0 && layersCount >= 2) {
    const c1 = pickRandomUnique(mainPool, usedHex);
    if (c1) chosenColors.push(c1);
    const c2 = pickRandomUnique(otherPool, usedHex);
    if (c2) chosenColors.push(c2);
  }
  
  const combinedPool = Array.from(new Set([...mainPool, ...otherPool]));
  while (chosenColors.length < layersCount && combinedPool.length > 0) {
    const c = pickRandomUnique(combinedPool, usedHex);
    if (c) {
      chosenColors.push(c);
    } else {
      break;
    }
  }
  
  while (chosenColors.length < layersCount) {
    const nh = `#${Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')}`;
    chosenColors.push(nh);
  }
  
  const letters = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const usedPairs = new Set();
  const generatedLayers = [];
  
  for (let i = 0; i < layersCount; i++) {
    let letter = letters[Math.floor(Math.random() * letters.length)];
    const ssTags = Array.from({length: 9}, (_, idx) => `ss${String(idx + 2).padStart(2, '0')}`);
    let candidates = ssTags.filter(t => !usedPairs.has(`${letter}:${t}`));
    if (candidates.length === 0) candidates = ssTags;
    
    let ss = candidates[Math.floor(Math.random() * candidates.length)];
    usedPairs.add(`${letter}:${ss}`);
    
    generatedLayers.push({
      letter: letter,
      ss: ss,
      color: chosenColors[i],
      opacity: 1.0,
      blendMode: Math.random() < 0.25 ? "multiply" : "normal"
    });
  }
  
  return generatedLayers;
}

function updateCustomBgSummary() {
  const summary = document.getElementById("customBgSummary");
  if (!summary) return;
  const count = (state.customBgLayers || []).length;
  if (count === 0) {
    summary.textContent = "Nessun livello definito";
  } else if (count === 1) {
    summary.textContent = "1 livello definito";
  } else {
    summary.textContent = `${count} livelli definiti`;
  }
}
window.updateCustomBgSummary = updateCustomBgSummary;

(function setupCustomBgManager() {
  const modal = document.getElementById("customBgModal");
  const editBtn = document.getElementById("editCustomBgBtn");
  const closeModalBtn = document.getElementById("closeModalBtn");
  const cancelModalBtn = document.getElementById("cancelModalBtn");
  const saveModalBtn = document.getElementById("saveModalBtn");
  const addLayerBtn = document.getElementById("addLayerBtn");
  const modalRandomizeBtn = document.getElementById("modalRandomizeBtn");
  const modalClearBtn = document.getElementById("modalClearBtn");
  const sidebarRandomizeBtn = document.getElementById("randomizeCustomBgBtn");
  
  const bgTypeStandard = document.getElementById("bgTypeStandard");
  const bgTypeCustom = document.getElementById("bgTypeCustom");
  const standardBgSection = document.getElementById("standardBgSection");
  const customBgSection = document.getElementById("customBgSection");
  
  // Sizing radios
  const customBgFitWidth = document.getElementById("customBgFitWidth");
  const customBgFitHeight = document.getElementById("customBgFitHeight");
  const customBgFitCover = document.getElementById("customBgFitCover");
  
  const setBgType = (type) => {
    if (type === "custom") {
      state.customBgActive = true;
      if (standardBgSection) standardBgSection.classList.add("hidden");
      if (customBgSection) customBgSection.classList.remove("hidden");
      
      if (!state.customBgLayers || state.customBgLayers.length === 0) {
        state.customBgLayers = generateRandomCustomBg();
        updateCustomBgSummary();
      }
    } else {
      state.customBgActive = false;
      if (standardBgSection) standardBgSection.classList.remove("hidden");
      if (customBgSection) customBgSection.classList.add("hidden");
    }
    draw(true);
  };
  
  if (bgTypeStandard && bgTypeCustom) {
    bgTypeStandard.addEventListener("change", () => setBgType("standard"));
    bgTypeCustom.addEventListener("change", () => setBgType("custom"));
  }
  
  const setBgFit = (fitMode) => {
    state.customBgFit = fitMode;
    saveState();
    draw(true);
    if (modal && !modal.classList.contains("hidden")) {
      updateModalPreview();
    }
  };
  
  if (customBgFitWidth) customBgFitWidth.addEventListener("change", () => setBgFit("width"));
  if (customBgFitHeight) customBgFitHeight.addEventListener("change", () => setBgFit("height"));
  if (customBgFitCover) customBgFitCover.addEventListener("change", () => setBgFit("cover"));
  
  if (sidebarRandomizeBtn) {
    sidebarRandomizeBtn.addEventListener("click", () => {
      state.customBgLayers = generateRandomCustomBg();
      updateCustomBgSummary();
      draw(true);
    });
  }
  
  if (editBtn) {
    editBtn.addEventListener("click", () => {
      state.tempBgLayers = (state.customBgLayers || []).map(l => ({ ...l }));
      
      if (state.tempBgLayers.length === 0) {
        state.tempBgLayers.push({
          letter: "A",
          ss: "ss02",
          color: CONFIG.palette[0].hex,
          opacity: 1.0,
          blendMode: "normal"
        });
      }
      
      if (modal) modal.classList.remove("hidden");
      renderModalLayers();
      updateModalPreview();
    });
  }
  
  const closeModal = () => {
    if (modal) modal.classList.add("hidden");
    state.tempBgLayers = null;
  };
  
  if (closeModalBtn) closeModalBtn.addEventListener("click", closeModal);
  if (cancelModalBtn) cancelModalBtn.addEventListener("click", closeModal);
  
  if (saveModalBtn) {
    saveModalBtn.addEventListener("click", () => {
      state.customBgLayers = state.tempBgLayers.map(l => ({ ...l }));
      state.customBgActive = true;
      if (bgTypeCustom) bgTypeCustom.checked = true;
      if (standardBgSection) standardBgSection.classList.add("hidden");
      if (customBgSection) customBgSection.classList.remove("hidden");
      
      updateCustomBgSummary();
      closeModal();
      draw(true);
    });
  }
  
  if (addLayerBtn) {
    addLayerBtn.addEventListener("click", () => {
      const newLetter = ["A", "B", "C", "D", "E", "F", "G", "H"][Math.floor(Math.random() * 8)];
      const newSS = `ss${String(Math.floor(Math.random() * 9) + 2).padStart(2, '0')}`;
      const randomHex = CONFIG.palette[Math.floor(Math.random() * CONFIG.palette.length)].hex;
      
      state.tempBgLayers.push({
        letter: newLetter,
        ss: newSS,
        color: randomHex,
        opacity: 1.0,
        blendMode: "normal"
      });
      
      renderModalLayers();
      updateModalPreview();
      
      const list = document.getElementById("layersList");
      if (list) {
        setTimeout(() => { list.scrollTop = list.scrollHeight; }, 50);
      }
    });
  }
  
  if (modalRandomizeBtn) {
    modalRandomizeBtn.addEventListener("click", () => {
      state.tempBgLayers = generateRandomCustomBg();
      renderModalLayers();
      updateModalPreview();
    });
  }
  
  if (modalClearBtn) {
    modalClearBtn.addEventListener("click", () => {
      state.tempBgLayers = [];
      renderModalLayers();
      updateModalPreview();
    });
  }
  
  function renderModalLayers() {
    const list = document.getElementById("layersList");
    if (!list) return;
    list.innerHTML = "";
    
    if (state.tempBgLayers.length === 0) {
      list.innerHTML = `<div class="muted" style="text-align: center; margin-top: 40px; font-style: italic;">Nessun livello inserito. Clicca "+ Aggiungi Livello" per iniziare.</div>`;
      return;
    }
    
    state.tempBgLayers.forEach((layer, idx) => {
      const card = document.createElement("div");
      card.className = "layer-card";
      
      const letterOptions = ["A", "B", "C", "D", "E", "F", "G", "H"]
        .map(l => `<option value="${l}" ${layer.letter === l ? 'selected' : ''}>Lettera ${l}</option>`)
        .join("");
        
      const ssOptions = Array.from({length: 9}, (_, i) => i + 2)
        .map(n => {
          const ss = `ss${String(n).padStart(2, '0')}`;
          return `<option value="${ss}" ${layer.ss === ss ? 'selected' : ''}>Set ${n} (${ss})</option>`;
        })
        .join("");
      
      card.innerHTML = `
        <div class="layer-header">
          <div class="layer-title-group">
            <span class="layer-number">Livello ${idx + 1}</span>
          </div>
          <div class="layer-actions">
            <button type="button" class="layer-action-btn move-up" ${idx === 0 ? 'disabled' : ''}>▲ Sposta Su</button>
            <button type="button" class="layer-action-btn move-down" ${idx === state.tempBgLayers.length - 1 ? 'disabled' : ''}>▼ Sposta Giù</button>
            <button type="button" class="layer-action-btn delete">✕ Elimina</button>
          </div>
        </div>
        
        <div class="layer-row">
          <div>
            <label>Pezzo (Lettera)</label>
            <select class="layer-letter-select">
              ${letterOptions}
            </select>
          </div>
          <div>
            <label>Stile (Stylistic Set)</label>
            <select class="layer-ss-select">
              ${ssOptions}
            </select>
          </div>
        </div>
        
        <div class="modal-swatch-picker">
          <label>Colore del Livello</label>
          <div class="modal-swatches-grid"></div>
        </div>
        
        <div class="layer-extra-row">
          <div class="slider-group">
            <div class="slider-val-header">
              <label>Opacità</label>
              <span class="opacity-val">${Math.round(layer.opacity * 100)}%</span>
            </div>
            <input type="range" class="layer-opacity-slider" min="0" max="1" step="0.05" value="${layer.opacity}" />
          </div>
          <div>
            <label>Blend Mode</label>
            <select class="layer-blend-select">
              <option value="normal" ${layer.blendMode === 'normal' ? 'selected' : ''}>Normale</option>
              <option value="multiply" ${layer.blendMode === 'multiply' ? 'selected' : ''}>Moltiplica</option>
              <option value="screen" ${layer.blendMode === 'screen' ? 'selected' : ''}>Schiarisci</option>
              <option value="overlay" ${layer.blendMode === 'overlay' ? 'selected' : ''}>Sovrapponi</option>
            </select>
          </div>
        </div>
      `;
      
      card.querySelector(".move-up").addEventListener("click", () => {
        if (idx > 0) {
          const temp = state.tempBgLayers[idx];
          state.tempBgLayers[idx] = state.tempBgLayers[idx - 1];
          state.tempBgLayers[idx - 1] = temp;
          renderModalLayers();
          updateModalPreview();
        }
      });
      
      card.querySelector(".move-down").addEventListener("click", () => {
        if (idx < state.tempBgLayers.length - 1) {
          const temp = state.tempBgLayers[idx];
          state.tempBgLayers[idx] = state.tempBgLayers[idx + 1];
          state.tempBgLayers[idx + 1] = temp;
          renderModalLayers();
          updateModalPreview();
        }
      });
      
      card.querySelector(".delete").addEventListener("click", () => {
        state.tempBgLayers.splice(idx, 1);
        renderModalLayers();
        updateModalPreview();
      });
      
      card.querySelector(".layer-letter-select").addEventListener("change", (e) => {
        layer.letter = e.target.value;
        updateModalPreview();
      });
      
      card.querySelector(".layer-ss-select").addEventListener("change", (e) => {
        layer.ss = e.target.value;
        updateModalPreview();
      });
      
      card.querySelector(".layer-blend-select").addEventListener("change", (e) => {
        layer.blendMode = e.target.value;
        updateModalPreview();
      });
      
      const opacitySlider = card.querySelector(".layer-opacity-slider");
      opacitySlider.addEventListener("input", (e) => {
        const val = parseFloat(e.target.value);
        layer.opacity = val;
        card.querySelector(".opacity-val").textContent = `${Math.round(val * 100)}%`;
        updateModalPreview();
      });
      
      const grid = card.querySelector(".modal-swatches-grid");
      CONFIG.palette.forEach(c => {
        const chip = document.createElement("div");
        chip.className = "modal-swatch-chip";
        chip.style.backgroundColor = c.hex;
        chip.title = c.name;
        if (layer.color.toLowerCase() === c.hex.toLowerCase()) {
          chip.classList.add("selected");
        }
        
        chip.addEventListener("click", () => {
          card.querySelectorAll(".modal-swatch-chip").forEach(el => el.classList.remove("selected"));
          chip.classList.add("selected");
          layer.color = c.hex;
          updateModalPreview();
        });
        
        grid.appendChild(chip);
      });
      
      list.appendChild(card);
    });
  }
  
  function updateModalPreview() {
    const preview = document.getElementById("modalBgPreview");
    if (!preview) return;
    
    const layers = state.tempBgLayers || [];
    const firstLayer = layers[0] || { letter: 'A', ss: 'ss02' };
    const yBase = getGlyphCenterY(firstLayer.letter, firstLayer.ss);
    
    const layersContent = [...layers].reverse().map(layer => {
      const letter = escapeXML(layer.letter || 'A');
      const ss = escapeXML(layer.ss || 'ss02');
      const color = escapeXML(layer.color || '#000000');
      const opacity = layer.opacity !== undefined ? layer.opacity : 1.0;
      const blendMode = layer.blendMode || 'normal';
      
      return `<text x="500" y="${yBase}" font-family="'GalatticaGen', sans-serif" font-size="1000" style="font-feature-settings: '${ss}' 1; mix-blend-mode: ${blendMode};" fill="${color}" opacity="${opacity}" text-anchor="middle">${letter}</text>`;
    }).join("\n");
    
    preview.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="100%" height="100%" style="background-color: ${state.bgColor}; border-radius: 8px;">
        ${layersContent}
      </svg>
    `;
  }
})();


// ----- Boot -----
(async () => {
  scaleInput.value = CONFIG.export.defaultScale;
  scaleInput.max = CONFIG.export.maxScale;

  const bgFiles = await fetchDynamicBackgrounds();

  await preloadFontsForPreview();
  await preloadGalatticaLogos(state);
  await initDefaultLogo();
  loadState();

  // Initialize standard / custom panels based on state
  const bgTypeStandard = document.getElementById("bgTypeStandard");
  const bgTypeCustom = document.getElementById("bgTypeCustom");
  const standardBgSection = document.getElementById("standardBgSection");
  const customBgSection = document.getElementById("customBgSection");
  
  if (state.customBgActive) {
    if (bgTypeCustom) bgTypeCustom.checked = true;
    if (standardBgSection) standardBgSection.classList.add("hidden");
    if (customBgSection) customBgSection.classList.remove("hidden");
  } else {
    if (bgTypeStandard) bgTypeStandard.checked = true;
    if (standardBgSection) standardBgSection.classList.remove("hidden");
    if (customBgSection) customBgSection.classList.add("hidden");
  }
  
  // Set fit radios checked state
  const fitWidthRadio = document.getElementById("customBgFitWidth");
  const fitHeightRadio = document.getElementById("customBgFitHeight");
  const fitCoverRadio = document.getElementById("customBgFitCover");
  const fit = state.customBgFit || 'cover';
  if (fit === 'width' && fitWidthRadio) fitWidthRadio.checked = true;
  if (fit === 'height' && fitHeightRadio) fitHeightRadio.checked = true;
  if (fit === 'cover' && fitCoverRadio) fitCoverRadio.checked = true;

  updateCustomBgSummary();

  // URL Param support
  const urlParams = new URLSearchParams(window.location.search);
  const layoutParam = urlParams.get('tipologia');
  if (layoutParam === 'ACCENDIAMO I MOTORI' || layoutParam === 'EVENTO PLI' || layoutParam === 'OPPORTUNITÀ/STRUMENTI') {
    state.layout = layoutParam;
    if (layoutSelect) layoutSelect.value = layoutParam;
  } else {
    state.layout = "EVENTO PLI";
    if (layoutSelect) layoutSelect.value = "EVENTO PLI";
  }

  setPageSize();
  
  // Initial UI state for institutional logo color control
  if (institutionalLogoColorSelect) {
    institutionalLogoColorSelect.style.display = 'block';
    const label = institutionalLogoColorSelect.previousElementSibling;
    if (label && label.tagName === 'LABEL') {
      label.style.display = 'block';
    }
  }

  updatePageSizeOptions();
  syncContentToLayout();
  rebuildInputs();
  buildSwatches();

  draw(true);

  bgSelectorController = buildBgSelector(bgSelectorContainer, bgFiles, (res) => {
    if (res) {
      state.userBgDataURL = res.url;
      state.userBgAR = res.width / res.height;
      state.bgName = res.name || null;
    } else {
      state.userBgDataURL = null;
      state.userBgAR = null;
      state.bgName = null;
    }
    draw(true);
  });

  initPreset({
    state,
    CONFIG,
    pageSizeSelect,
    layoutSelect,
    toggleLogo: null,
    logoControls: null,
    draw,
    setPageSize,
    rebuildInputs: () => rebuildInputs(),
    buildSwatches,
    rebuildSizeSliders: buildSizeSliders,
    rebuildSpacingSliders: buildSpacingSliders,
    initLogoControls: () => renderLogoList(),
    getFileName,
    bgSelectorController,
    syncContentToLayout,
    updatePageSizeOptions,
    updateUrlParam
  });
})();

// ----- Panel toggle -----
(function setupPanelToggle() {
  const btn = document.getElementById("panelToggle");
  const backdrop = document.getElementById("backdrop");
  if (!btn) return;

  const root = document.documentElement;
  const body = document.body;
  const mq = window.matchMedia("(max-width: 900px)");
  let isMobile = mq.matches;

  function openPanel() {
    root.classList.add("aside-open");
    body.classList.add("aside-open");
    btn.setAttribute("aria-expanded", "true");
    setTimeout(fitPreview, 280);
  }
  function closePanel() {
    root.classList.remove("aside-open");
    body.classList.remove("aside-open");
    btn.setAttribute("aria-expanded", "false");
    setTimeout(fitPreview, 50);
  }
  function togglePanel() {
    if (root.classList.contains("aside-open") || body.classList.contains("aside-open"))
      closePanel();
    else openPanel();
  }

  btn.addEventListener("click", togglePanel, { passive: true });
  if (backdrop) backdrop.addEventListener("click", closePanel, { passive: true });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") closePanel(); }, { passive: true });

  const mqHandler = (e) => {
    isMobile = e.matches;
    if (!isMobile) closePanel();
    fitPreview();
  };
  if (typeof mq.addEventListener === "function") mq.addEventListener("change", mqHandler);
  else if (typeof mq.addListener === "function") mq.addListener(mqHandler);
})();
