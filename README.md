<div align="center">

# 🎨 CardCraft

**A fast, private, 100% browser-native studio for crafting high-fidelity social cards, carousels, and quote visuals.**

[![React 19](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS v4](https://img.shields.io/badge/TailwindCSS-v4-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Konva Canvas](https://img.shields.io/badge/Canvas-Konva-0D9488?style=flat-square)](https://konvajs.org/)
[![PWA Ready](https://img.shields.io/badge/PWA-Offline--Ready-5A67D8?style=flat-square)](https://vite-pwa-org.netlify.app/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

*Create pixel-perfect, publication-ready cards for Instagram, X (Twitter), and LinkedIn with zero backend, zero trackers, and zero image uploads.*

</div>

---

## Overview

**CardCraft** is a client-side graphic design tool engineered specifically for creators, developers, and founders who want to publish crisp, consistent visual content without the bloat, subscriptions, or privacy liabilities of traditional cloud-based design platforms.

Everything runs entirely in your browser using an HTML5 Canvas rendering pipeline (`react-konva`). What you design in the editor is mathematically identical to the exported asset — eliminating the font clipping, rendering discrepancies, and blurred text common to DOM-to-image screenshotting tools.

---

## Key Highlights

- **100% Client-Side & Privacy-First**: No servers, no signups, no cloud telemetry. Images, fonts, and project states are stored locally on your device via IndexedDB.
- **Pixel-Perfect Canvas Engine**: Built on HTML5 Canvas / Konva. Avoids DOM rasterization bugs; exports match preview pixel-for-pixel at up to **3× resolution (300 DPI equivalent)**.
- **Multi-Slide Carousel Studio**: Reorder, duplicate, and manage multi-slide sequences with native drag-and-drop (`dnd-kit`). Export complete decks as a single `.zip` archive or individual high-res PNGs.
- **Intelligent Contrast-Aware Watermarking**: Automatically evaluates canvas luminance beneath brand watermarks and dynamically toggles light/dark modes for maximum legibility.
- **Social-Optimized Aspect Presets**:
  - **Instagram Square** (1:1 · `1080 × 1080`)
  - **Instagram Portrait** (4:5 · `1080 × 1350`)
  - **Stories / Reels / TikTok** (9:16 · `1080 × 1920`)
  - **X / Twitter Post** (16:9 · `1200 × 675`)
  - **X Multi-Image Grid** (2:1 · `1200 × 600`)
- **Curated Self-Hosted Typography**: Bundled high-character typefaces (`Inter`, `DM Sans`, `Space Grotesk`, `Playfair Display`, `Libre Baskerville`, `Instrument Serif`, `IBM Plex Sans`) served locally with zero external Google Fonts requests.
- **Offline-Capable PWA**: Installable directly as a Progressive Web App (PWA) via Service Workers for offline workflows.
- **Non-Destructive State & History**: Immutable project document model powered by Zustand and Zundo with full Undo/Redo (`Ctrl+Z` / `Ctrl+Y`) and local persistence.

---

## Architecture & Technical Design

CardCraft treats design documents similarly to a compiler and print press:

```
┌─────────────────────────────────┐
│     JSON Document Model         │  ◄── Master State (Zustand + Zundo)
│  (Slides, Layers, BrandKit)     │
└──────────────┬──────────────────┘
               │
         Render Pipeline
               │
    ┌──────────▼──────────┐
    │  Konva / Stage API  │  ◄── Unified rendering engine
    └────┬──────────────┬─┘
         │              │
         ▼              ▼
   Interactive       High-Res PNG / ZIP
   Live Preview      Export Pipeline (fflate)
```

### Why HTML5 Canvas instead of DOM rasterizers (`html2canvas` / `html-to-image`)?
Tools that convert HTML/CSS elements to images often suffer from:
1. Subpixel antialiasing and blurriness at fractional scaling factors.
2. Missing or delayed web font rendering.
3. Unsupported modern CSS gradients, backdrop filters, or line-height quirks across Safari vs. Chrome.

By maintaining an explicit layer graph rendered through Konva, exports are deterministic, fast, and scalable to ultra-high resolutions (`pixelRatio: 1x, 2x, 3x`).

---

## Tech Stack

| Domain | Technology | Purpose |
| :--- | :--- | :--- |
| **Runtime & Core** | React 19, TypeScript, Vite | Fast HMR dev loop, modern React architecture, and strict type safety |
| **Graphics Engine** | Konva, React-Konva | High-performance 2D canvas scene graph, transformations, hit detection |
| **Styling & UI** | Tailwind CSS v4, Radix UI Primitives | Clean accessible interfaces, popovers, sliders, and design panels |
| **State Management** | Zustand + Zundo | Predictable document state with lightweight undo/redo history |
| **Interactions** | @dnd-kit | Smooth, accessible drag-and-drop filmstrip and layer controls |
| **Storage & Archive** | idb-keyval, fflate | High-throughput IndexedDB project caching and rapid in-memory ZIP compression |
| **Typography** | @fontsource | Self-hosted web fonts for privacy, speed, and offline consistency |
| **Quality & Tests** | Vitest, Oxlint | High-speed unit test runner and modern static analysis |

---

## Getting Started

### Prerequisites
- Node.js (v18 or newer recommended)
- npm or pnpm

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/Social-Card-Studio.git
   cd Social-Card-Studio/card-studio
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the local development server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Testing & Build

```bash
# Run unit tests (vitest)
npm test

# Run linter
npm run lint

# Compile and produce production build
npm run build

# Preview production build locally
npm run preview
```

<!---

## Project Structure

```text
card-studio/
├── public/                 # Static assets and PWA icons
├── src/
│   ├── app/                # Shell application layout and top navbar
│   ├── assets/             # Brand logos and iconography
│   ├── editor/             # Editor views & interactive controls
│   │   ├── canvas/         # Konva stage, slide renderer, layer transformers
│   │   ├── filmstrip/      # Multi-slide preview reel & dnd-kit ordering
│   │   ├── overlays/       # Interactive canvas guidelines and selectors
│   │   └── panels/         # Style inspector, background, typography, export panels
│   ├── export/             # PNG canvas rasterization, ZIP packaging & multi-res scaling
│   ├── lib/                # Utility helpers (color luminance, geometry, storage)
│   ├── model/              # Pure document schema, presets, layout math, and Zustand store
│   └── tests/              # Vitest test suites (luminance, layouts, pixel-ratio)
├── index.html              # Entry HTML
├── vite.config.ts          # Vite configuration with PWA and Tailwind plugins
└── package.json            # Scripts and dependency manifest
```

---

## Roadmap & Future Enhancements

- [ ] Customizable gradient stops and angle pickers
- [ ] SVG icon and asset sticker tray
- [ ] Custom font upload support (`.woff2`, `.ttf` via Local Font Access API)
- [ ] Preset style themes (Minimalist, Editorial, Tech, Neo-brutalist)
- [ ] Quick social media export profiles (one-click resize across all platforms)

--->

## License

Distributed under the [MIT License](LICENSE). Free for personal and commercial use.