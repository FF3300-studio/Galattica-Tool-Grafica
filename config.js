export const CONFIG = {
  pagePresets: {
    "1080x1440": {
      width: 1080,
      height: 1440,
      margins: { top: 200, right: 80, bottom: 200, left: 80 },
      overrides: {
        sizeRatio: {
          data: 1 / 24,
          luogo: 1 / 24,
        }
      }
    },
    "1080x1920": {
      width: 1080,
      height: 1920,
      // Instagram Stories: Margins reduced per user request
      margins: { top: 160, right: 80, bottom: 260, left: 80 },
      overrides: {
        sizeRatio: {
          data: 1 / 24,
          titolo: 1 / 11,
          sottotitolo: 1 / 20,
          descrizione: 1 / 28,
          luogo: 1 / 24,
        }
      }
    },
    "cover-web": {
      width: 686,
      height: 457,
      margins: { top: 0, right: 116, bottom: 0, left: 116 },
      overrides: {
        sizeRatio: {
          titolo: 50 / 686,
          sottotitolo: 38 / 686
        },
        lineHeightMult: {
          title: 1.0,  // 50px/50px
          sub: 0.95    // 36px/38px
        },
        spacingRatios: {
          groupGap: 7 / 686 // 7px gap
        },
        visibleFields: ["titolo", "sottotitolo"],
        disableLogos: true,
        disableLayoutSelect: true,
        bgMode: "fit-v" // Force vertical fit
      }
    },
    A3: {
      width: 3508,
      height: 4961,
      margins: { top: 500, right: 300, bottom: 500, left: 300 },
    },
    A4: {
      width: 2480,
      height: 3508,
      margins: { top: 350, right: 200, bottom: 350, left: 200 },
    },
  },
  typography: {
    baseRatios: {
      data: 1 / 26,
      titolo: 1 / 14,
      sottotitolo: 1 / 25,
      descrizione: 1 / 35,
      luogo: 1 / 26,
    },
    lineHeightMult: {
      data: 1.2,
      title: 1.05,
      sub: 1.1,
      desc: 1.3,
      luogo: 1.3
    },
    blockSpacingRatio: 1 / 40,
    spacingRatios: {
      groupGap: 1 / 30 // Unified gap for simplicity
    },
  },
  background: {
    defaultColor: "#FFFFFF",
    allowUserImage: true,
    aspectTolerance: 0.05,
    files: [
      "galattica_output_001.png",
      "galattica_output_002.png",
      "galattica_output_003.png",
      "galattica_output_004.png",
      "galattica_output_005.png",
      "galattica_output_006.png",
      "galattica_output_007.png",
      "galattica_output_008.png",
      "galattica_output_009.png",
      "galattica_output_010.png"
    ]
  },
  text: { defaultColor: "#111111" },
  logo: {
    enabledByDefault: true,
    defaultFile: "loghi-istituzionali-social.svg",
    files: {
      social: {
        black: "loghi-istituzionali-neri-social.svg",
        white: "loghi-istituzionali-bianchi-social.svg"
      },
      print: {
        black: "loghi-istituzionali-neri-stampa.svg",
        white: "loghi-istituzionali-bianchi-stampa.svg"
      }
    },
    sizeRatio: 0.25, // Wider default for multi-logo strip
    align: "bottom-center", // Default position? Or just let render logic decide.
  },
  export: { defaultScale: 2, maxScale: 4, fileName: "social-card.png" },
  palette: [
    { name: "White", hex: "#FFFFFF" },
    { name: "Black", hex: "#000000" },
    { name: "Navy", hex: "#111729" },
    { name: "Slate", hex: "#64748B" },
    { name: "Red", hex: "#EF4444" },
    { name: "Orange", hex: "#F97316" },
    { name: "Yellow", hex: "#EAB308" },
    { name: "Green", hex: "#22C55E" },
    { name: "Blue", hex: "#3B82F6" },
    { name: "Purple", hex: "#A855F7" },
  ],
  textPalette: [
    { name: "Black", hex: "#000000" },
    { name: "White", hex: "#FFFFFF" },
  ]
};
