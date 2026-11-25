import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./app/fonts.ts";
import "./index.css";
import { registerPwa } from "./pwa.ts";

void registerPwa();

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("CardCraft root element is missing");
const root = createRoot(rootElement);

void import("./App.tsx")
  .then(({ default: App }) => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  })
  .catch((error: unknown) => {
    console.error("CardCraft failed to load its application modules", error);
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    root.render(
      <div className="grid min-h-svh place-items-center bg-zinc-950 p-8 text-zinc-100">
        <div className="max-w-2xl rounded-xl border border-rose-500/30 bg-zinc-900 p-6 shadow-xl">
          <h1 className="text-lg font-semibold">CardCraft couldn’t start</h1>
          <p className="mt-2 text-sm text-zinc-300">The app module failed before the editor mounted.</p>
          <pre className="mt-4 whitespace-pre-wrap break-words rounded bg-black/40 p-3 text-xs text-rose-200">{message}</pre>
          <button className="mt-4 rounded bg-sky-600 px-3 py-2 text-sm" onClick={() => window.location.reload()}>Reload app</button>
        </div>
      </div>,
    );
  });
