import type { Slide } from "./types";
import { createSlide, createTextLayer } from "./document";

export type TemplateCategory =
  | "Quote"
  | "Metric"
  | "Announcement"
  | "Carousel"
  | "Podcast"
  | "Review"
  | "Event";

export interface StarterTemplate {
  id: string;
  title: string;
  description: string;
  category: TemplateCategory;
  create: () => Slide;
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  // 1. Quote - Minimalist Editorial
  {
    id: "quote-minimal",
    title: "Minimalist Editorial Quote",
    description: "A quiet editorial quote card with refined serif type and generous spacing.",
    category: "Quote",
    create: () => {
      const slide = createSlide("ig-portrait");
      slide.background = { kind: "solid", color: "#141416" };
      slide.layoutId = "quote";
      slide.padding = 96;
      slide.layers = [
        createTextLayer({
          text: "“Make space for the ideas that matter.”",
          x: 96,
          y: 440,
          width: slide.width - 192,
          fontSize: 66,
          lineHeight: 1.35,
          fontWeight: 400,
          fontFamily: "Playfair Display",
          align: "center",
          color: "#FAFAF9",
          role: "title",
        }),
        createTextLayer({
          text: "YOUR NAME · YOUR SOURCE",
          x: 96,
          y: 800,
          width: slide.width - 192,
          fontSize: 22,
          letterSpacing: 4,
          fontWeight: 600,
          fontFamily: "Space Grotesk",
          align: "center",
          color: "#A1A1AA",
          role: "caption",
        }),
      ];
      return slide;
    },
  },

  // 2. Quote - Executive Leadership
  {
    id: "quote-executive",
    title: "Executive Leadership Insight",
    description: "A warm, high-contrast statement card for leadership and founder stories.",
    category: "Quote",
    create: () => {
      const slide = createSlide("ig-portrait");
      slide.background = {
        kind: "gradient",
        from: "#1C1917",
        to: "#292524",
        angle: 180,
      };
      slide.padding = 88;
      slide.layers = [
        createTextLayer({
          text: "LEADERSHIP NOTE",
          x: 88,
          y: 220,
          width: slide.width - 176,
          fontSize: 20,
          letterSpacing: 5,
          fontWeight: 700,
          fontFamily: "Space Grotesk",
          align: "left",
          color: "#E8C39A",
          role: "caption",
        }),
        createTextLayer({
          text: "Great work starts with a clear point of view—and the focus to follow it.",
          x: 88,
          y: 340,
          width: slide.width - 176,
          fontSize: 54,
          lineHeight: 1.4,
          fontWeight: 400,
          fontFamily: "Libre Baskerville",
          align: "left",
          color: "#FAFAF9",
          role: "title",
        }),
        createTextLayer({
          text: "A note on building with intention",
          x: 88,
          y: 920,
          width: slide.width - 176,
          fontSize: 24,
          fontWeight: 500,
          fontFamily: "DM Sans",
          align: "left",
          color: "#A8A29E",
          role: "body",
        }),
      ];
      return slide;
    },
  },

  // 3. Metric - Growth Stat
  {
    id: "stat-metric",
    title: "High-Impact Growth Metric",
    description: "A bold metric card with space for a verified result and its context.",
    category: "Metric",
    create: () => {
      const slide = createSlide("ig-square");
      slide.background = {
        kind: "gradient",
        from: "#090D16",
        to: "#131D31",
        angle: 145,
      };
      slide.padding = 80;
      slide.layers = [
        createTextLayer({
          text: "+24%",
          x: 80,
          y: 260,
          width: slide.width - 160,
          fontSize: 140,
          fontWeight: 700,
          fontFamily: "Space Grotesk",
          align: "center",
          color: "#38BDF8",
          role: "title",
        }),
        createTextLayer({
          text: "Growth in [key metric]",
          x: 80,
          y: 490,
          width: slide.width - 160,
          fontSize: 46,
          fontWeight: 700,
          fontFamily: "Inter",
          align: "center",
          color: "#F8FAFC",
          role: "body",
        }),
        createTextLayer({
          text: "Add the time period, comparison, and source behind this result before publishing.",
          x: 100,
          y: 590,
          width: slide.width - 200,
          fontSize: 28,
          lineHeight: 1.5,
          fontWeight: 400,
          fontFamily: "Inter",
          align: "center",
          color: "#94A3B8",
          role: "caption",
        }),
      ];
      return slide;
    },
  },

  // 4. Announcement - Milestone & Funding
  {
    id: "announcement-funding",
    title: "Funding & Company Milestone",
    description: "A polished company update for a launch, funding round, award, or milestone.",
    category: "Announcement",
    create: () => {
      const slide = createSlide("ig-portrait");
      slide.background = {
        kind: "gradient",
        from: "#0F172A",
        to: "#020617",
        angle: 160,
      };
      slide.padding = 88;
      slide.layers = [
        createTextLayer({
          text: "MILESTONE ANNOUNCEMENT",
          x: 88,
          y: 200,
          width: slide.width - 176,
          fontSize: 22,
          letterSpacing: 4,
          fontWeight: 700,
          fontFamily: "Space Grotesk",
          align: "center",
          color: "#38BDF8",
          role: "caption",
        }),
        createTextLayer({
          text: "A new chapter for [Company].",
          x: 88,
          y: 300,
          width: slide.width - 176,
          fontSize: 66,
          lineHeight: 1.25,
          fontWeight: 700,
          fontFamily: "DM Sans",
          align: "center",
          color: "#FFFFFF",
          role: "title",
        }),
        createTextLayer({
          text: "We’re excited to share [milestone]. Here’s what it means for our customers and what we’re building next.",
          x: 100,
          y: 620,
          width: slide.width - 200,
          fontSize: 32,
          lineHeight: 1.5,
          fontWeight: 400,
          fontFamily: "Inter",
          align: "center",
          color: "#94A3B8",
          role: "body",
        }),
      ];
      return slide;
    },
  },

  // 5. Announcement - Product Feature Drop
  {
    id: "announcement-badge",
    title: "Product Feature Release (v2.0)",
    description: "A crisp product announcement with a warm accent and strong headline hierarchy.",
    category: "Announcement",
    create: () => {
      const slide = createSlide("x-single");
      slide.background = {
        kind: "gradient",
        from: "#18181B",
        to: "#27272A",
        angle: 90,
      };
      slide.padding = 72;
      slide.layers = [
        createTextLayer({
          text: "PRODUCT UPDATE · [VERSION]",
          x: 72,
          y: 120,
          width: slide.width - 144,
          fontSize: 24,
          letterSpacing: 4,
          fontWeight: 700,
          fontFamily: "Space Grotesk",
          align: "left",
          color: "#F59E0B",
          role: "caption",
        }),
        createTextLayer({
          text: "Meet [Product Feature]",
          x: 72,
          y: 190,
          width: slide.width - 144,
          fontSize: 64,
          lineHeight: 1.15,
          fontWeight: 700,
          fontFamily: "DM Sans",
          align: "left",
          color: "#FFFFFF",
          role: "title",
        }),
        createTextLayer({
          text: "Describe what’s new, who it helps, and where customers can try it.",
          x: 72,
          y: 400,
          width: slide.width - 240,
          fontSize: 30,
          lineHeight: 1.45,
          fontWeight: 400,
          fontFamily: "Inter",
          align: "left",
          color: "#D4D4D8",
          role: "body",
        }),
      ];
      return slide;
    },
  },

  // 6. Carousel - Cover Hook
  {
    id: "carousel-cover-hook",
    title: "Carousel Cover Hook",
    description: "An editorial carousel opener with a clear hook and a simple swipe prompt.",
    category: "Carousel",
    create: () => {
      const slide = createSlide("ig-portrait");
      slide.background = {
        kind: "gradient",
        from: "#1E1B4B",
        to: "#0F172A",
        angle: 160,
      };
      slide.padding = 84;
      slide.layers = [
        createTextLayer({
          text: "A PRACTICAL GUIDE · [TOPIC]",
          x: 84,
          y: 200,
          width: slide.width - 168,
          fontSize: 22,
          letterSpacing: 4,
          fontWeight: 700,
          fontFamily: "Space Grotesk",
          align: "left",
          color: "#818CF8",
          role: "caption",
        }),
        createTextLayer({
          text: "[Number] ways to make [topic] work better",
          x: 84,
          y: 320,
          width: slide.width - 168,
          fontSize: 64,
          lineHeight: 1.25,
          fontWeight: 700,
          fontFamily: "DM Sans",
          align: "left",
          color: "#FFFFFF",
          role: "title",
        }),
        createTextLayer({
          text: "Swipe for the full guide →",
          x: 84,
          y: 980,
          width: slide.width - 168,
          fontSize: 26,
          fontWeight: 600,
          fontFamily: "Space Grotesk",
          align: "left",
          color: "#C7D2FE",
          role: "body",
        }),
      ];
      return slide;
    },
  },

  // 7. Carousel - Framework / 3-Step Guide
  {
    id: "carousel-framework",
    title: "Actionable 3-Step Framework",
    description: "A numbered teaching slide that gives one useful idea room to breathe.",
    category: "Carousel",
    create: () => {
      const slide = createSlide("ig-portrait");
      slide.background = {
        kind: "gradient",
        from: "#09090B",
        to: "#18181B",
        angle: 180,
      };
      slide.padding = 84;
      slide.layers = [
        createTextLayer({
          text: "STEP 01 · [PHASE OR THEME]",
          x: 84,
          y: 180,
          width: slide.width - 168,
          fontSize: 22,
          letterSpacing: 3,
          fontWeight: 700,
          fontFamily: "Space Grotesk",
          align: "left",
          color: "#34D399",
          role: "caption",
        }),
        createTextLayer({
          text: "Start by defining the real problem",
          x: 84,
          y: 270,
          width: slide.width - 168,
          fontSize: 54,
          lineHeight: 1.3,
          fontWeight: 700,
          fontFamily: "DM Sans",
          align: "left",
          color: "#FAFAFA",
          role: "title",
        }),
        createTextLayer({
          text: "Explain the first action in your framework. Add a concrete example or evidence your audience can apply.",
          x: 84,
          y: 570,
          width: slide.width - 168,
          fontSize: 32,
          lineHeight: 1.5,
          fontWeight: 400,
          fontFamily: "Inter",
          align: "left",
          color: "#A1A1AA",
          role: "body",
        }),
      ];
      return slide;
    },
  },

  // 8. Podcast - Audio Snippet
  {
    id: "podcast-snippet",
    title: "Podcast / Audio Pull-Quote",
    description: "A clean quote card for a podcast moment, with room for episode details and attribution.",
    category: "Podcast",
    create: () => {
      const slide = createSlide("ig-portrait");
      slide.background = {
        kind: "gradient",
        from: "#2E1065",
        to: "#0F172A",
        angle: 160,
      };
      slide.padding = 84;
      slide.layers = [
        createTextLayer({
          text: "[SHOW NAME] · EPISODE [NUMBER]",
          x: 84,
          y: 180,
          width: slide.width - 168,
          fontSize: 22,
          letterSpacing: 4,
          fontWeight: 600,
          fontFamily: "Space Grotesk",
          align: "center",
          color: "#C084FC",
          role: "caption",
        }),
        createTextLayer({
          text: "“[Add a short, memorable quote from this episode.]”",
          x: 96,
          y: 380,
          width: slide.width - 192,
          fontSize: 58,
          lineHeight: 1.35,
          fontWeight: 600,
          fontFamily: "DM Sans",
          align: "center",
          color: "#FFFFFF",
          role: "title",
        }),
        createTextLayer({
          text: "LISTEN NOW · [YOUR SHOW URL]",
          x: 84,
          y: 1040,
          width: slide.width - 168,
          fontSize: 24,
          fontWeight: 400,
          fontFamily: "Inter",
          align: "center",
          color: "#E2E8F0",
          role: "body",
        }),
      ];
      return slide;
    },
  },

  // 9. Review - Client Testimonial & Social Proof
  {
    id: "testimonial-review",
    title: "Client Testimonial & Rating",
    description: "A restrained testimonial layout with clear attribution and rating.",
    category: "Review",
    create: () => {
      const slide = createSlide("ig-square");
      slide.background = {
        kind: "gradient",
        from: "#18181B",
        to: "#09090B",
        angle: 150,
      };
      slide.padding = 80;
      slide.layers = [
        createTextLayer({
          text: "★ ★ ★ ★ ★",
          x: 80,
          y: 180,
          width: slide.width - 160,
          fontSize: 38,
          letterSpacing: 6,
          fontWeight: 700,
          fontFamily: "Inter",
          align: "center",
          color: "#FBBF24",
          role: "caption",
        }),
        createTextLayer({
          text: "“[Add an approved customer quote that describes a specific result.]”",
          x: 90,
          y: 290,
          width: slide.width - 180,
          fontSize: 44,
          lineHeight: 1.4,
          fontWeight: 400,
          fontFamily: "Instrument Serif",
          align: "center",
          color: "#F4F4F5",
          role: "title",
        }),
        createTextLayer({
          text: "[CUSTOMER NAME] · [ROLE, COMPANY]",
          x: 80,
          y: 720,
          width: slide.width - 160,
          fontSize: 22,
          letterSpacing: 3,
          fontWeight: 600,
          fontFamily: "Space Grotesk",
          align: "center",
          color: "#A1A1AA",
          role: "body",
        }),
      ];
      return slide;
    },
  },

  // 10. Event - Keynote / Webinar Invitation
  {
    id: "event-webinar",
    title: "Keynote / Webinar Invitation",
    description: "A clear event announcement with space for a date, promise, and registration callout.",
    category: "Event",
    create: () => {
      const slide = createSlide("x-single");
      slide.background = {
        kind: "gradient",
        from: "#030712",
        to: "#111827",
        angle: 135,
      };
      slide.padding = 72;
      slide.layers = [
        createTextLayer({
          text: "LIVE EVENT · [DATE AND TIME]",
          x: 72,
          y: 120,
          width: slide.width - 144,
          fontSize: 22,
          letterSpacing: 4,
          fontWeight: 700,
          fontFamily: "Space Grotesk",
          align: "left",
          color: "#60A5FA",
          role: "caption",
        }),
        createTextLayer({
          text: "[Event title]: a practical session on [topic]",
          x: 72,
          y: 200,
          width: slide.width - 144,
          fontSize: 60,
          lineHeight: 1.2,
          fontWeight: 700,
          fontFamily: "DM Sans",
          align: "left",
          color: "#F9FAFB",
          role: "title",
        }),
        createTextLayer({
          text: "Join [host] for [format or benefit]. Register at [URL].",
          x: 72,
          y: 420,
          width: slide.width - 240,
          fontSize: 28,
          lineHeight: 1.5,
          fontWeight: 400,
          fontFamily: "Inter",
          align: "left",
          color: "#9CA3AF",
          role: "body",
        }),
      ];
      return slide;
    },
  },
];
