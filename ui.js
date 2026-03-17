import { CONFIG } from "./config.js";
import { blobToDataURL, probeImage } from "./assets.js";

export function buildSwatchGroup(root, palette, initialHex, onChange) {
  root.innerHTML = "";
  let current = (initialHex || "").toLowerCase();
  palette.forEach((c) => {
    const chip = document.createElement("div");
    chip.className = "swatch-chip";
    chip.dataset.hex = c.hex; // Add hex for easy selection
    if (c.hex.toLowerCase() === current) chip.classList.add("selected");
    
    const box = document.createElement("span");
    box.className = "swatch-box";
    box.style.backgroundColor = c.hex;

    const label = document.createElement("span");
    label.className = "swatch-name";
    label.textContent = c.name;

    chip.appendChild(box);
    chip.appendChild(label);
    chip.addEventListener("click", () => {
      root
        .querySelectorAll(".swatch-chip")
        .forEach((el) => el.classList.remove("selected"));
      chip.classList.add("selected");
      onChange(c.hex);
    });
    root.appendChild(chip);
  });
}

export function setInputs(state, inputsDiv, onChange, visibleFields = null) {
  const { layout, content } = state;
  inputsDiv.innerHTML = "";
  const add = (key, label, rows=2) => {
    // If visibleFields is provided, skip if key is not in it
    if (visibleFields && !visibleFields.includes(key)) return;

    const l = document.createElement("label");
    l.textContent = label;
    const ta = document.createElement("textarea");
    ta.rows = rows;
    ta.value = content[key] || "";
    ta.addEventListener("input", (e) => {
      content[key] = e.target.value;
      onChange();
    });
    inputsDiv.appendChild(l);
    inputsDiv.appendChild(ta);
  };
  
  // Inputs logic
  if (layout === "EVENTO PLI") {
    add("data", "Data", 1);
    add("titolo", "Titolo Evento", 2);
    add("luogo", "Nome Luogo e Indirizzo", 2);
    add("sottotitolo", "Sottotitolo", 2);
    add("descrizione", "Descrizione Eventuale", 3);
  } else if (layout === "ACCENDIAMO I MOTORI") {
    // ACCENDIAMO I MOTORI specific fields
    add("titolo", "Claim Campagna", 2);
    add("descrizione", "CTA", 3);
    add("luogo", "Dov'è il nodo (Indirizzo nodo)", 2);
    
    add("qrLink", "Link QR Code", 1);

    const qrL = document.createElement("label");
    qrL.textContent = "Dimensione QR";
    const qrS = document.createElement("input");
    qrS.type = "range";
    qrS.min = "0";
    qrS.max = "3";
    qrS.step = "1";
    qrS.value = state.qrSizeRatioIndex ?? 1;
    qrS.addEventListener("input", (e) => {
      state.qrSizeRatioIndex = parseInt(e.target.value);
      onChange();
    });
    inputsDiv.appendChild(qrL);
    inputsDiv.appendChild(qrS);
  }
}

// Sliders removed as requested
export function buildSizeSliders() {}
export function buildSpacingSliders() {}

export function buildBgSelector(container, bgFiles, onSelect) {
  container.innerHTML = "";
  
  // Create Custom Dropdown
  const wrapper = document.createElement("div");
  wrapper.className = "custom-select-wrapper";
  
  const selected = document.createElement("div");
  selected.className = "custom-select-trigger";
  selected.innerHTML = "<span>Seleziona Sfondo...</span> <span class='arrow'>▼</span>";
  
  const options = document.createElement("div");
  options.className = "custom-options";
  
  // Helper to trigger selection logic
  const triggerSelect = async (val, el) => {
    // Update UI
    selected.querySelector("span").textContent = val === "none" ? "Nessuno" : val;
    options.classList.remove("open");
    
    // Update internal state
    const allOpts = options.querySelectorAll(".custom-option");
    allOpts.forEach(o => o.classList.remove("selected"));
    if(el) el.classList.add("selected");
    
    // Logic
    if (val === "none" || !val) {
        onSelect(null);
    } else {
       try {
         const resp = await fetch("sfondi/" + val);
         const blob = await resp.blob();
         const url = await blobToDataURL(blob);
         const dim = await probeImage(url);
         // Pass name back so main can store it
         onSelect({ url, width: dim.width, height: dim.height, name: val });
       } catch(err) {
         console.error("Error loading background:", err);
         alert("Impossibile caricare lo sfondo.");
       }
    }
  };

  // Option: None
  const noneOption = document.createElement("div");
  noneOption.className = "custom-option";
  noneOption.dataset.value = "none";
  noneOption.textContent = "Nessuno";
  noneOption.addEventListener("click", () => triggerSelect("none", noneOption));
  options.appendChild(noneOption);

  // Options: Files from sfondi/
  bgFiles.forEach(file => {
    const opt = document.createElement("div");
    opt.className = "custom-option has-preview";
    opt.dataset.value = file;
    
    // Preview Image
    const img = document.createElement("img");
    img.src = "sfondi/" + file; 
    img.alt = file;
    
    const label = document.createElement("span");
    label.textContent = file;
    
    opt.appendChild(img);
    opt.appendChild(label);
    
    opt.addEventListener("click", () => triggerSelect(file, opt));
    options.appendChild(opt);
  });
  
  selected.addEventListener("click", (e) => {
      e.stopPropagation(); 
      options.classList.toggle("open");
  });
  
  // Close when clicking outside
  document.addEventListener("click", (e) => {
    if (!wrapper.contains(e.target)) {
      options.classList.remove("open");
    }
  });
  
  wrapper.appendChild(selected);
  wrapper.appendChild(options);
  container.appendChild(wrapper);

  return {
      setValue: (name) => {
          if (!name) {
              triggerSelect("none", noneOption);
              return;
          }
          const opt = Array.from(options.children).find(c => c.dataset.value === name);
          if (opt) {
              triggerSelect(name, opt);
          } else {
              console.warn(`Background ${name} not found in list.`);
              // Optional: triggerSelect("none", noneOption);
          }
      }
  };
}

export function aspectMatches(imgW, imgH, canvasW, canvasH, tol = 0.02) {
  const arImg = imgW / imgH,
    arCanvas = canvasW / canvasH;
  const diff = Math.abs(arImg - arCanvas) / arCanvas;
  return { ok: diff <= tol, arImg, arCanvas, diff };
}
export function prettyAspect(r) {
  return (Math.round(r * 1000) / 1000).toFixed(3);
}
