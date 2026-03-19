import { CONFIG } from './config.js';
import { fontData } from './assets.js';
import { wrapWithHardBreaks, escapeXML } from './wrap.js';

export function buildSVG(state, opts){
  const { margins, sizeRatio, spacingRatio, logoParams, content, textColor, bgColor, showLogo,
          canvasW, canvasH, userBgDataURL, logoDataURL, logoRatio } = state;
  const showGuides = !!opts.showGuides;
  const embedFonts = !!opts.embedFonts;

  const W = canvasW, H = canvasH;
  const contentW = W - margins.left - margins.right;
  const contentH = H - margins.top - margins.bottom;
  const cx = W/2;

  /* Embed fonts as Base64 if requested (for export), otherwise use @import for preview/consistency */
  let faceCSS = '';
  if (embedFonts) {
    faceCSS = Array.from(fontData.values()).map(d => 
      `@font-face {
        font-family: '${d.family}';
        src: url(data:font/${d.fmt};base64,${d.b64}) format('${d.fmt}');
        font-weight: ${d.weight};
        font-style: normal;
      }`
    ).join('\n');
  } else {
    faceCSS = `@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;700&display=swap');`;
  }

  // Extract EVENTO fields
  const { data, titolo, sottotitolo, descrizione, luogo } = content;
  
  // Font Sizes
  // Output updated logic dependent on state.lineHeightMult and state.spacingRatios
  // Font Sizes
  const fsData  = Math.round(W * sizeRatio.data);
  const fsTitle = Math.round(W * sizeRatio.titolo);
  const fsSub   = Math.round(W * sizeRatio.sottotitolo);
  const fsDesc  = state.layout === 'ACCENDIAMO I MOTORI' 
    ? Math.round(W * (1 / 20)) // Larger for CTA
    : Math.round(W * sizeRatio.descrizione);
  const fsLuogo = state.layout === 'ACCENDIAMO I MOTORI' 
    ? Math.round(W * sizeRatio.luogo * 0.8) // Slightly smaller for AITM
    : Math.round(W * sizeRatio.luogo);

  // Line Heights (Use state.lineHeightMult if available, else CONFIG default - wait, state should have it now)
  // Ensure state.lineHeightMult is populated by applyOverrides in main.js
  const lhMult = state.lineHeightMult || CONFIG.typography.lineHeightMult;

  const lhData  = Math.round(fsData  * lhMult.data);
  const lhTitle = Math.round(fsTitle * lhMult.title);
  const lhSub   = Math.round(fsSub   * lhMult.sub);
  const lhDesc  = Math.round(fsDesc  * lhMult.desc);
  const lhLuogo = Math.round(fsLuogo * lhMult.luogo);

  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
  parts.push(`<style><![CDATA[
${faceCSS}
.t-data  { font-family:'IBM Plex Sans', sans-serif; font-weight:500; fill:${textColor}; }
.t-title { font-family:'IBM Plex Sans', sans-serif; font-weight:700; fill:${textColor}; }
.t-sub   { font-family:'IBM Plex Sans', sans-serif; font-weight:${(state.bgMode === 'cover' || state.bgMode === 'fit-v') ? 500 : 600}; fill:${textColor}; } /* 500 for cover web */
.t-desc  { font-family:'IBM Plex Sans', sans-serif; font-weight:400; fill:${textColor}; }
.t-luogo { font-family:'IBM Plex Sans', sans-serif; font-weight:700; fill:${textColor}; }
.guide { fill:none; stroke:#00FFAA; stroke-width:2; stroke-dasharray: 4 4; }
]]></style>`);

  // Background
  // Background Color (Always drawn base)
  parts.push(`<rect width="100%" height="100%" fill="${bgColor}"/>`);

  // Background Image (Overlay)
  if (userBgDataURL) {
      if (state.bgMode === 'cover') {
         // Force cover behavior using preserveAspectRatio slice
         parts.push(`<image href="${userBgDataURL}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice" />`);
      } else if (state.bgMode === 'fit-v') {
         // Force Fit Vertical: Height = H, Width = scales
         if (state.userBgAR) {
             const imgH = H;
             const imgW = H * state.userBgAR;
             const imgX = (W - imgW) / 2;
             // Ensure we center and crop overflows nicely (SVG handles overflow)
             parts.push(`<image href="${userBgDataURL}" x="${imgX}" y="0" width="${imgW}" height="${imgH}" preserveAspectRatio="none" />`);
         } else {
             parts.push(`<image href="${userBgDataURL}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid meet" />`);
         }
      } else if (state.userBgAR) {
         // Fit Width (Legacy Default for social)
         // Width is always W (canvasW)
         // Height is calculated from AR. Centered vertically.
         const imgW = W;
         const imgH = W / state.userBgAR;
         const imgY = (H - imgH) / 2;
         parts.push(`<image href="${userBgDataURL}" x="0" y="${imgY}" width="${imgW}" height="${imgH}" preserveAspectRatio="none" />`);
      } else {
         // Fallback legacy
         parts.push(`<image href="${userBgDataURL}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice" />`);
      }
  }

  // --- Layout Implementation (EVENTO) ---
  
  // Prepare Text Blocks
  // We Wrap lines first - Filter out empty fields to ensure they are 0 height
  // Measured content area is between W margins
  const wrapW = contentW - 10;

  const lData  = data ? wrapWithHardBreaks(data, wrapW, 'IBM Plex Sans', fsData, null, 500) : [];
  const lTitle = titolo ? wrapWithHardBreaks(titolo, wrapW, 'IBM Plex Sans', fsTitle, null, 700) : [];
  const lSub   = sottotitolo ? wrapWithHardBreaks(sottotitolo, wrapW, 'IBM Plex Sans', fsSub, null, (state.bgMode === 'cover' || state.bgMode === 'fit-v') ? 500 : 600) : [];
  const lDesc  = descrizione ? wrapWithHardBreaks(descrizione, wrapW, 'IBM Plex Sans', fsDesc, null, 400) : [];
  const lLuogo = luogo ? wrapWithHardBreaks(luogo, wrapW, 'IBM Plex Sans', fsLuogo, null, 700) : [];

  // Helper to render text block
  const renderBlock = (lines, cls, fs, lh, yStart) => {
    if (!lines || !lines.length) return 0;
    const blockH = lines.length * lh;
    // Use dominant-baseline="central" for best vertical centering of caps/mixed text
    // yStart is top of block. Line center is at yStart + i*lh + lh/2
    parts.push(`<text class="${cls}" font-size="${fs}" text-anchor="middle" dominant-baseline="central">`);
    lines.forEach((line, i) => {
      const lineY = yStart + (i * lh) + (lh / 2);
      parts.push(`<tspan x="${cx}" y="${lineY}">${line === '' ? '&#160;' : escapeXML(line)}</tspan>`);
    });
    parts.push(`</text>`);
    return blockH;
  };

  // Measure content total height to center it vertically (excluding logos/footer maybe?)
  // Stack: Data -gap- Title -gap- Sub -gap- Desc -gap- Luogo
  // Footer: [Optionally User Logos] -> [Institutional Logo (Always)]

  // Header Setup (Galattica Logo)
  const galatticaKey = state.galatticaLogo;
  const hasHeaderLogo = galatticaKey && galatticaKey !== 'none' && state.galatticaLogos && state.galatticaLogos[galatticaKey];
  
  // Footer Setup
  const hasInst = !!state.institutionalLogo;
  const hasUser = state.logos.length > 0;

  // Header/Footer are now positioned INSIDE the margins to save space
  // We cap logo heights to fits comfortably in margins
  const maxHHeader = Math.round(margins.top * 0.85); // Increased to 85% of margin
  const maxHInst = Math.round(margins.bottom * 0.70); // Increased to 70% of margin
  const maxHUser = Math.round(margins.bottom * 0.60); // Increased to 60% of margin

  const hHeaderLogo = hasHeaderLogo ? Math.min(Math.round(H * 0.11), maxHHeader) : 0; 
  const hInst = hasInst ? Math.min(Math.round(H * 0.14), maxHInst) : 0;
  const hUser = hasUser ? Math.min(Math.round(H * 0.10), maxHUser) : 0; 
  const logoGap = Math.round(H * 0.015);
  
  // Available height for text is precisely the contentH area (between margins)
  const availableH = contentH;
  
  // Use spacingRatios from state if available, or fallback to sizeRatio (legacy) or default
  const spRatios = state.spacingRatios || {};
  const gapRatio = spRatios.groupGap || sizeRatio.groupGap || (20/W);
  const gap = Math.round(W * gapRatio);
  
  const hData  = lData.length ? lData.length * lhData : 0;
  const hTitle = lTitle.length ? lTitle.length * lhTitle : 0;
  const hSub   = lSub.length ? lSub.length * lhSub : 0;
  const hDesc  = lDesc.length ? lDesc.length * lhDesc : 0;
  const hLuogo = lLuogo.length ? lLuogo.length * lhLuogo : 0;

  const hasQR = state.layout === 'ACCENDIAMO I MOTORI' && content.qrLink;
  const qrRatios = [0.08, 0.12, 0.16, 0.20];
  const qrRatio = qrRatios[state.qrSizeRatioIndex ?? 1];
  const qrSize = hasQR ? Math.round(W * qrRatio) : 0;

  let totalTextH = 0;
  const blocks = [];
  if (lData.length) blocks.push(hData);
  if (lTitle.length) blocks.push(hTitle);
  if (lSub.length) blocks.push(hSub);
  if (lDesc.length) blocks.push(hDesc);
  if (state.layout !== 'ACCENDIAMO I MOTORI' && lLuogo.length) blocks.push(hLuogo);
  if (hasQR) blocks.push(qrSize);
  if (state.layout === 'ACCENDIAMO I MOTORI' && lLuogo.length) blocks.push(hLuogo);

  if (blocks.length > 0) {
    totalTextH = blocks.reduce((a, b) => a + b, 0) + (blocks.length - 1) * gap;
  }

  // Centering logic: y starts at margins.top + offset
  const offset = (availableH - totalTextH) / 2;
  let y = margins.top + offset;

  // Render Header Logo centered in the top margin area, but shifted slightly towards center
  if (hasHeaderLogo) {
     const l = state.galatticaLogos[galatticaKey];
     const renderH = hHeaderLogo;
     const renderW = renderH / l.ratio;
     const lx = cx - renderW / 2;
     // Shift it towards the content (bottom part of the top margin area)
     const ly = margins.top - renderH - Math.round(margins.top * 0.05); 
     parts.push(`<image href="${l.url}" x="${lx}" y="${ly}" width="${renderW}" height="${renderH}" preserveAspectRatio="xMidYMid meet"/>`);
  }

  if (lData.length) { y += renderBlock(lData, 't-data', fsData, lhData, y); y += gap; }
  if (lTitle.length) { y += renderBlock(lTitle, 't-title', fsTitle, lhTitle, y); y += gap; }
  if (lSub.length) { y += renderBlock(lSub, 't-sub', fsSub, lhSub, y); y += gap; }
  if (lDesc.length) { y += renderBlock(lDesc, 't-desc', fsDesc, lhDesc, y); y += gap; }
  if (state.layout !== 'ACCENDIAMO I MOTORI' && lLuogo.length) { y += renderBlock(lLuogo, 't-luogo', fsLuogo, lhLuogo, y); y += gap; }

  // --- QR Code for "Campagna" layout ---
  if (hasQR) {
    try {
      // @ts-ignore
      const qr = qrcode(0, 'M');
      qr.addData(content.qrLink);
      qr.make();
      const moduleCount = qr.getModuleCount();
      const cellSize = qrSize / moduleCount;
      const qrX = cx - qrSize / 2;
      const qrY = y;
      parts.push(`<g class="qr-code">`);
      for (let row = 0; row < moduleCount; row++) {
        for (let col = 0; col < moduleCount; col++) {
          if (qr.isDark(row, col)) {
            parts.push(`<rect x="${qrX + col * cellSize}" y="${qrY + row * cellSize}" width="${cellSize + 0.5}" height="${cellSize + 0.5}" fill="${textColor}"/>`);
          }
        }
      }
      parts.push(`</g>`);
      y += qrSize + gap;
    } catch (e) {
      console.warn("QR Generation failed", e);
    }
  }

  if (state.layout === 'ACCENDIAMO I MOTORI' && lLuogo.length) { y += renderBlock(lLuogo, 't-luogo', fsLuogo, lhLuogo, y); y += gap; }

  // Remove final hLuogo check as it was moved up

  // --- Render Footer Logos centered in the bottom margin area, shifted towards center ---
  const renderLogoRow = (logoList, rowH, rowYVal) => {
    const listGap = 40; 
    const maxLogoH = rowH * 0.9;
    const processed = logoList.map(l => ({ ...l, finH: maxLogoH, finW: maxLogoH / l.ratio }));
    const totalW = processed.reduce((acc, l) => acc + l.finW, 0) + (processed.length - 1) * listGap;
    let startX = cx - totalW / 2;
    const centerY = rowYVal + rowH / 2;
    processed.forEach(l => {
        parts.push(`<image href="${l.url}" x="${startX}" y="${centerY - l.finH / 2}" width="${l.finW}" height="${l.finH}" preserveAspectRatio="xMidYMid meet"/>`);
        startX += l.finW + listGap;
    });
  };

  if (hasInst || hasUser) {
    // Position it at the very top of the bottom margin area (closest to content)
    const footerYStart = H - margins.bottom + Math.round(margins.bottom * 0.05);
    
    const isEventoPli = state.layout === 'EVENTO PLI';
    const isAitm = state.layout === 'ACCENDIAMO I MOTORI';
    const isTargetFormat = (state.canvasW === 1080 && state.canvasH === 1440) || // PORTRAIT
                           (state.canvasW === 1080 && state.canvasH === 1920) || // STORIES
                           (state.canvasW === 2480 && state.canvasH === 3508) || // A4
                           (state.canvasW === 3508 && state.canvasH === 4961);   // A3
    
    if (isAitm) {
      // ACCENDIAMO I MOTORI: Institutional logos ARE included now
      if (hasInst && hasUser) {
        // Combine institutional and user logos in one row, institutional first
        const combinedRowH = Math.max(hInst, hUser);
        const combinedLogos = [state.institutionalLogo, ...state.logos];
        renderLogoRow(combinedLogos, combinedRowH, footerYStart);
      } else if (hasUser) {
        renderLogoRow(state.logos, hUser, footerYStart);
      } else if (hasInst) {
        renderLogoRow([state.institutionalLogo], hInst, footerYStart);
      }
    } else if (isEventoPli && isTargetFormat && hasInst && hasUser) {
      // Combine institutional and user logos in one row, institutional first
      const combinedRowH = Math.max(hInst, hUser);
      const combinedLogos = [state.institutionalLogo, ...state.logos];
      renderLogoRow(combinedLogos, combinedRowH, footerYStart);
    } else if (hasUser) {
      renderLogoRow(state.logos, hUser, footerYStart);
      if (hasInst) renderLogoRow([state.institutionalLogo], hInst, footerYStart + hUser + logoGap);
    } else if (hasInst) {
      renderLogoRow([state.institutionalLogo], hInst, footerYStart);
    }
  }

  if (showGuides) {
    parts.push(`<rect class="guide" x="${margins.left}" y="${margins.top}" width="${contentW}" height="${contentH}"/>`);
  }

  parts.push(`</svg>`);
  return parts.join('\n');
}
