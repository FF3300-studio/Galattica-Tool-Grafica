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

async function fetchDynamicBackgrounds() {
  const fallback = CONFIG.background.files || [];
  try {
    // 1. Try to fetch a potential JSON manifest or script (list.php)
    // This is the cleanest way if the user can upload a small script.
    const jsonResp = await fetch("sfondi/list.php");
    if (jsonResp.ok) {
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

    // 3. 403 Forbidden Fallback: Brute force scan for galattica_output_XXX.png
    // since the server blocks directory listing.
    console.warn("Directory listing blocked (403). Attempting brute-force scan...");
    const scanned = [];
    const scanPromises = [];
    // Scan up to 50 files in parallel
    for (let i = 1; i <= 50; i++) {
        const filename = `galattica_output_${String(i).padStart(3, '0')}.png`;
        if (fallback.includes(filename)) continue; // Skip already known
        
        scanPromises.push(
            fetch(`sfondi/${filename}`, { method: 'HEAD' })
                .then(r => { if(r.ok) scanned.push(filename); })
                .catch(() => {})
        );
    }
    await Promise.all(scanPromises);
    
    if (scanned.length > 0) {
        console.log(`Brute-force scan found ${scanned.length} new files.`);
        return Array.from(new Set([...fallback, ...scanned]));
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
  content: { data:"", titolo:"", sottotitolo:"", descrizione:"", luogo:"", qrLink:"" },
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
  galatticaLogo: "black",
  institutionalLogoColor: "black",
  galatticaLogos: {},
  zoom: 1,
  pan: { x: 0, y: 0 },
  qrSizeRatioIndex: 1, // Default index for QR size (20%)
};

// Override Helper
function applyOverrides(p) {
  state.sizeRatio = { ...CONFIG.typography.baseRatios };
  state.lineHeightMult = { ...CONFIG.typography.lineHeightMult };
  state.spacingRatios = { ...CONFIG.typography.spacingRatios };

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
  } else {
    state.bgMode = "fit";
  }

  const disableLogos = p.overrides && p.overrides.disableLogos;
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
  return CONFIG.pagePresets[pageSizeSelect.value];
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
  rebuildInputs();
  updateInstitutionalLogo();
}

function updatePageSizeOptions() {
  const currentLayout = state.layout;
  const options = pageSizeSelect.querySelectorAll("option");
  
  options.forEach(opt => {
    if (currentLayout === "ACCENDIAMO I MOTORI") {
      // For ACCENDIAMO I MOTORI: social (1080x1440), story (1080x1920), A4, A3
      const allowed = ["1080x1440", "1080x1920", "A4", "A3"];
      opt.style.display = allowed.includes(opt.value) ? "block" : "none";
      
      // If current selection is hidden, switch to a safe one
      if (pageSizeSelect.value === opt.value && opt.style.display === "none") {
        pageSizeSelect.value = "1080x1440";
        setPageSize();
      }
    } else {
      // For EVENTO PLI: show all
      opt.style.display = "block";
    }
  });
}

// ----- Draw -----
function draw(showGuides = true) {
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
  setInputs(state, inputsDiv, () => draw(true), visibleFields);
}

function buildSwatches() {
  buildSwatchGroup(bgPicker, CONFIG.palette, state.bgColor, (hex) => {
    state.bgColor = hex;
    draw(true);
  });
  buildSwatchGroup(textPicker, CONFIG.textPalette || CONFIG.palette, state.textColor, (hex) => {
    state.textColor = hex;
    const h = hex.toLowerCase();
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

layoutSelect.addEventListener("change", () => {
  state.layout = layoutSelect.value;
  updateUrlParam(state.layout);
  updatePageSizeOptions();
  
  // Hide institutional logo color control for ACCENDIAMO I MOTORI
  if (institutionalLogoColorSelect) {
    const isAitm = state.layout === 'ACCENDIAMO I MOTORI';
    // Logic to hide/show removed per user request to restore logos on AITM
    institutionalLogoColorSelect.style.display = 'block';
    
    // Also show the label
    const label = institutionalLogoColorSelect.previousElementSibling;
    if (label && label.tagName === 'LABEL') {
      label.style.display = 'block';
    }
  }

  rebuildInputs();
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

  main.addEventListener("touchend", (e) => {
    if (e.touches.length < 2) lastDist = 0;
    onEnd();
  });
})();

// ----- Boot -----
(async () => {
  scaleInput.value = CONFIG.export.defaultScale;
  scaleInput.max = CONFIG.export.maxScale;

  const bgFiles = await fetchDynamicBackgrounds();

  await preloadFontsForPreview();
  await preloadGalatticaLogos(state);
  await initDefaultLogo();

  setPageSize();
  
  // URL Param support
  const urlParams = new URLSearchParams(window.location.search);
  const layoutParam = urlParams.get('tipologia');
  if (layoutParam === 'ACCENDIAMO I MOTORI' || layoutParam === 'EVENTO PLI') {
    state.layout = layoutParam;
    if (layoutSelect) layoutSelect.value = layoutParam;
  } else {
    state.layout = "EVENTO PLI";
    if (layoutSelect) layoutSelect.value = "EVENTO PLI";
  }

  // Initial UI state for institutional logo color control
  if (institutionalLogoColorSelect) {
    institutionalLogoColorSelect.style.display = 'block';
    const label = institutionalLogoColorSelect.previousElementSibling;
    if (label && label.tagName === 'LABEL') {
      label.style.display = 'block';
    }
  }

  updatePageSizeOptions();
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
    bgSelectorController
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
