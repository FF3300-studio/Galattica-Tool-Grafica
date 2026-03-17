import { CONFIG } from './config.js';

export const FONT_FILES = [
  { id: 'ibm-400', family: 'IBM Plex Sans', url: 'https://fonts.gstatic.com/s/ibmplexsans/v23/zYXGKVElMYYaJe8bpLHnCwDKr932-G7dytD-Dmu1swZSAXcomDVmadSD6llzAA.ttf', fmt: 'truetype', weight: '400' },
  { id: 'ibm-500', family: 'IBM Plex Sans', url: 'https://fonts.gstatic.com/s/ibmplexsans/v23/zYXGKVElMYYaJe8bpLHnCwDKr932-G7dytD-Dmu1swZSAXcomDVmadSD2FlzAA.ttf', fmt: 'truetype', weight: '500' },
  { id: 'ibm-700', family: 'IBM Plex Sans', url: 'https://fonts.gstatic.com/s/ibmplexsans/v23/zYXGKVElMYYaJe8bpLHnCwDKr932-G7dytD-Dmu1swZSAXcomDVmadSDDV5zAA.ttf', fmt: 'truetype', weight: '700' },
];

const fontData = new Map();
let fontStyleNode = null;

const arrayBufferToBase64 = (buf) => {
  let bin="", bytes = new Uint8Array(buf);
  for (let i=0;i<bytes.length;i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
};

export async function preloadFontsForPreview() {
  // Fetch and encode fonts for embedding in SVG (export)
  await Promise.all(FONT_FILES.map(async (f) => {
    try {
      const res = await fetch(f.url, { cache: 'force-cache' });
      const buf = await res.arrayBuffer();
      fontData.set(f.id, { 
        b64: arrayBufferToBase64(buf), 
        fmt: f.fmt, 
        weight: f.weight, 
        family: f.family 
      });
    } catch(e) {
      console.warn("Failed to fetch font for export:", f.url, e);
    }
  }));

  // Helper styles for on-screen preview are handled by Google Fonts Link in HTML, 
  // but we wait for them to be ready.
  await document.fonts.ready;
}

export async function preloadLogo(toggleLogoEl, logoControlsEl, logoStatusEl, state) {
  try {
    const res = await fetch('logo.png', { cache: 'reload' }); // Assume PNG for simple user logo for now, or check ext
    if (!res.ok) throw new Error('Logo non trovato');
    const blob = await res.blob();
    state.logoDataURL = await blobToDataURL(blob);
    const dim = await probeImage(state.logoDataURL);
    state.logoRatio = dim.height / dim.width;
    logoStatusEl.textContent = 'Logo caricato';
    toggleLogoEl.disabled = false;
    toggleLogoEl.checked = state.showLogo;
    logoControlsEl.style.display = toggleLogoEl.checked ? 'block' : 'none';
  } catch {
    state.logoDataURL = null;
    logoStatusEl.textContent = 'Logo non trovato (aggiungi logo.png)';
    toggleLogoEl.checked = false;
    toggleLogoEl.disabled = true;
    state.showLogo = false;
    logoControlsEl.style.display = 'none';
  }
}

// Helper to inject width/height into SVG to force specific raster size
function processSVGText(text, targetWidth = 3000) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "image/svg+xml");
    const svg = doc.querySelector("svg");
    if (!svg) return "data:image/svg+xml;base64," + btoa(text); // Fallback

    // Get aspect ratio from viewBox or width/height
    let w, h;
    if (svg.viewBox.baseVal && svg.viewBox.baseVal.width > 0) {
        w = svg.viewBox.baseVal.width;
        h = svg.viewBox.baseVal.height;
    } else if (svg.width.baseVal.value > 0 && svg.height.baseVal.value > 0) {
        w = svg.width.baseVal.value;
        h = svg.height.baseVal.value;
    } else {
        return "data:image/svg+xml;base64," + btoa(text); // Fallback
    }

    const ratio = h / w;
    const newH = Math.round(targetWidth * ratio);

    svg.setAttribute("width", targetWidth + "px");
    svg.setAttribute("height", newH + "px");

    const serializer = new XMLSerializer();
    const str = serializer.serializeToString(svg);
    return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(str)));
}

export async function fetchAndProcessSVG(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load ${url}`);
    const text = await res.text();
    return processSVGText(text);
}

export function readAndProcessSVGFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            resolve(processSVGText(text));
        };
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

export async function preloadGalatticaLogos(state) {
  state.galatticaLogos = {};
  const files = {
    white: 'logo-galattica-bianco.svg',
    black: 'logo-galattica-nero.svg'
  };

  await Promise.all(Object.entries(files).map(async ([key, url]) => {
    try {
      const dataURL = await fetchAndProcessSVG(url);
      const dim = await probeImage(dataURL);
      state.galatticaLogos[key] = {
        url: dataURL,
        w: dim.width,
        h: dim.height,
        ratio: dim.height / dim.width
      };
    } catch (e) {
      console.warn("Could not load Galattica logo:", key, e);
    }
  }));
}

export function blobToDataURL(blob){
  return new Promise((resolve)=>{
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.readAsDataURL(blob);
  });
}
export function probeImage(src){
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve({ width:i.naturalWidth, height:i.naturalHeight });
    i.onerror = reject;
    i.src = src;
  });
}

export { fontData };