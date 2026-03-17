
// Non-invasive preset manager for the generator.
// Robust import (FileReader) + console logging.
export function initPreset(ctx){
  const {
    state, CONFIG,
    pageSizeSelect, layoutSelect, toggleLogo, logoControls,
    draw, setPageSize, rebuildInputs, buildSwatches, rebuildSizeSliders, rebuildSpacingSliders, initLogoControls
  } = ctx;

  const exportBtn = document.getElementById('exportPresetBtn');
  const importBtn = document.getElementById('importPresetBtn');
  const importInput = document.getElementById('importPresetInput');

  if (!exportBtn || !importBtn || !importInput){
    console.warn('[Preset] UI controls not found.');
    return;
  }

  function collectPreset(){
    const preset = {
      __version: 1,
      pageSize: pageSizeSelect?.value,
      layout: state.layout,
      content: { ...state.content },
      bgColor: state.bgColor,
      textColor: state.textColor,
      galatticaLogo: state.galatticaLogo || 'black',
      institutionalLogoColor: state.institutionalLogoColor || 'black', // New
      useSS16: !!state.useSS16,
      margins: { ...state.margins },
      sizeRatio: { ...state.sizeRatio },
      spacingRatio: state.spacingRatio ? { ...state.spacingRatio } : (state.spacingRatios ? { ...state.spacingRatios } : {}),

      // logoParams: { ...state.logoParams }, // Legacy
      logos: state.logos || [],
      showLogo: !!state.showLogo,
      userBgDataURL: state.userBgDataURL || null,
      userBgAR: state.userBgAR ?? null,
      bgName: state.bgName || null // New
    };
    console.debug('[Preset] collectPreset ->', preset);
    return preset;
  }

  function downloadJSON(obj, filename){
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type:'application/json' });
    const link = document.createElement('a');
    link.download = filename || 'preset.json';
    link.href = URL.createObjectURL(blob);
    link.click();
    setTimeout(()=>URL.revokeObjectURL(link.href), 1000);
  }

  async function applyPreset(preset){
    // --- Lazy boot: ensure canvas/state are initialized even if user hasn't touched anything ---
    try{
      const needBoot = !state.canvasW || !state.canvasH || !state.margins;
      if (needBoot){
        try{
          // Ensure page size has a value
          if (!pageSizeSelect?.value || !pageSizeSelect.value.trim()){
            const keys = Object.keys(CONFIG.pagePresets||{});
            if (keys.length){ pageSizeSelect.value = keys[0]; }
          }
        }catch{}

        if (pageSizeSelect?.value){ setPageSize(); }
        if (!state.layout){
          state.layout = (layoutSelect?.value && layoutSelect.value.trim()) ? layoutSelect.value : 'frase';
        }
        if (!state.sizeRatio){
          state.sizeRatio = { ...((CONFIG.typography||{}).baseRatios||{ titolo:1/12, sottotitolo:1/18, frase:1/8, data:1/20 }) };
        }
        if (!state.spacingRatio && !state.spacingRatios){
          state.spacingRatios = { ...((CONFIG.spacingRatios)||{ betweenDateTitle:0.02, betweenTitleSubtitle:0.015 }) };
        }
        // Build UI blocks once so subsequent updates work
        try{ rebuildInputs(); }catch{}
        try{ buildSwatches(); }catch{}
        try{ rebuildSizeSliders(); }catch{}
        try{ rebuildSpacingSliders(); }catch{}
        try{ initLogoControls(); }catch{}
        try{ draw(true); }catch{}
      }
    }catch(e){
      console.warn('[Preset] lazy boot warning:', e);
    }

    console.debug('[Preset] applyPreset start', preset);
    try{
      let pageSize = preset.pageSize;
      // Migration: Handle old 1080x1350 format
      if (pageSize === "1080x1350") {
        console.debug('[Preset] Migrating 1080x1350 to 1080x1440');
        pageSize = "1080x1440";
      }

      if (pageSize && CONFIG.pagePresets?.[pageSize]){
        pageSizeSelect.value = pageSize;
        setPageSize();
      }
      if (preset.layout){
        layoutSelect.value = preset.layout;
        state.layout = preset.layout;
      }

      state.content = { ...state.content, ...(preset.content||{}) };
      rebuildInputs();

      if (preset.bgColor) state.bgColor = preset.bgColor;
      if (preset.textColor) state.textColor = preset.textColor;
      buildSwatches();

      if (typeof preset.galatticaLogo !== 'undefined') {
          state.galatticaLogo = preset.galatticaLogo;
          const galatticaLogoSelect = document.getElementById('galatticaLogoSelect');
          if(galatticaLogoSelect) galatticaLogoSelect.value = state.galatticaLogo;
      }

      if (typeof preset.institutionalLogoColor !== 'undefined') {
          state.institutionalLogoColor = preset.institutionalLogoColor;
          const institutionalLogoColorSelect = document.getElementById('institutionalLogoColorSelect');
          if(institutionalLogoColorSelect) institutionalLogoColorSelect.value = state.institutionalLogoColor;
      }

      if (typeof preset.useSS16 !== 'undefined'){
        state.useSS16 = !!preset.useSS16;
        const useSS16Input = document.getElementById('useSS16');
        if (useSS16Input) useSS16Input.checked = state.useSS16;
      }

      if (preset.sizeRatio && state.sizeRatio)   state.sizeRatio   = { ...state.sizeRatio, ...preset.sizeRatio };
      if (preset.spacingRatio){
        if (state.spacingRatio)   state.spacingRatio   = { ...state.spacingRatio, ...preset.spacingRatio };
        if (state.spacingRatios)  state.spacingRatios  = { ...state.spacingRatios, ...preset.spacingRatio };
      }
      rebuildSizeSliders();
      rebuildSpacingSliders();

      if (typeof preset.showLogo !== 'undefined'){
        state.showLogo = !!preset.showLogo;
        if (toggleLogo){ toggleLogo.checked = state.showLogo; }
        if (logoControls){ logoControls.style.display = state.showLogo ? 'block' : 'none'; }
      }
      
      // New logo system
      if (preset.logos && Array.isArray(preset.logos)) {
        // Deep copy needed? usually objects in logos are plain {url, w, h...}
        state.logos = preset.logos.map(l => ({...l})); 
        initLogoControls(); // Calls renderLogoList()
      } else if (preset.logoParams){
        // Legacy fallback (optional, or just ignore)
        // state.logoParams = { ...state.logoParams, ...preset.logoParams };
        // initLogoControls(); 
      }

      // Restore Background by Name if available (Preferred)
      if (preset.bgName && ctx.bgSelectorController) {
          ctx.bgSelectorController.setValue(preset.bgName);
          // bgSelectorController.setValue triggers async fetch & draw.
          // We assume it works. We do NOT need to set userBgDataURL manually here because controller does it (via callback in main.js).
      } 
      // Fallback: Restore by DataURL (Legacy/Custom)
      else if (typeof preset.userBgDataURL === 'string' && preset.userBgDataURL){
        state.userBgDataURL = preset.userBgDataURL;
        state.userBgAR = typeof preset.userBgAR === 'number' ? preset.userBgAR : null;
        if (state.userBgDataURL && state.userBgAR != null){
          const arCanvas = state.canvasW / state.canvasH;
          const diff = Math.abs(state.userBgAR - arCanvas)/arCanvas;
          // Only enforce tolerance if we didn't just load by name (loading by name implies validity for that file)
          // Actually if we loaded by name above, we shouldn't be here.
          // But if we are here, it means custom upload.
          if (diff > (CONFIG.background?.aspectTolerance ?? 0.03)){
            state.userBgDataURL = null; state.userBgAR = null;
            // alert('Lo sfondo nel preset non rispetta le proporzioni del formato corrente ed è stato ignorato.');
            console.warn("Background AR mismatch ignored/cleared for imported preset (custom upload).");
          }
        }
      } else if (preset && 'userBgDataURL' in preset && !preset.userBgDataURL){
        // Explicit null in preset means clear background
        state.userBgDataURL = null; state.userBgAR = null;
        if(ctx.bgSelectorController) ctx.bgSelectorController.setValue(null);
      }

      draw(true);
      console.debug('[Preset] applyPreset done');
    }catch(err){
      console.error('[Preset] Errore nell\'applicare il preset:', err);
      alert('Preset non valido o non compatibile con questa versione.');
    }
  }

  exportBtn.addEventListener('click', ()=>{
    try {
      const preset = collectPreset();
      // Use getFileName from context if available (renaming ext to json)
      let filename = 'preset.json';
      if (ctx.getFileName) {
          filename = ctx.getFileName('json');
      } else {
          const safeTitle = (state.content?.titolo || 'preset').toString().trim().slice(0,64).replace(/[^a-z0-9-_]+/gi,'_');
          filename = `preset_${safeTitle || 'untitled'}.json`;
      }
      downloadJSON(preset, filename);
    } catch(e) {
      console.error("[Preset] Export failed:", e);
      alert("Errore esportazione preset: " + e.message);
    }
  });

  importBtn.addEventListener('click', ()=> importInput.click());
  importInput.addEventListener('change', (e)=>{
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try{
      const reader = new FileReader();
      reader.onload = async (ev)=>{
        try{
          const text = ev.target?.result || '';
          const obj = JSON.parse(text);
          await applyPreset(obj);
        }catch(err){
          console.error('[Preset] JSON parse/apply error', err);
          alert('Impossibile leggere il file preset. Assicurati che sia un JSON valido.');
        } finally {
          importInput.value = '';
        }
      };
      reader.onerror = (err)=>{
        console.error('[Preset] FileReader error', err);
        alert('Errore nella lettura del file.');
        importInput.value = '';
      };
      reader.readAsText(file, 'utf-8');
    }catch(err){
      console.error('[Preset] Import handler error', err);
      alert('Errore imprevisto durante l\'import.');
      importInput.value = '';
    }
  });
}
