import { Component, type ErrorInfo, type ReactNode } from "react";
import { AppShell } from "./app/AppShell";
import { createProject } from "./model/document";
import { useEditorStore } from "./model/store";
import { saveProject } from "./lib/idb";

export default function App() {
  return <AppErrorBoundary><AppShell /></AppErrorBoundary>;
}

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("CardCraft editor render failed", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="grid min-h-svh place-items-center bg-zinc-950 p-8 text-zinc-100">
          <div className="max-w-2xl rounded-xl border border-rose-500/30 bg-zinc-900 p-6 shadow-xl">
            <h1 className="text-lg font-semibold">CardCraft hit an editor error</h1>
            <p className="mt-2 text-sm text-zinc-300">The page loaded, but a component failed while rendering.</p>
            <pre className="mt-4 whitespace-pre-wrap break-words rounded bg-black/40 p-3 text-xs text-rose-200">{this.state.error.stack ?? this.state.error.message}</pre>
            <button className="mt-4 rounded bg-sky-600 px-3 py-2 text-sm font-medium text-white" onClick={() => {
              const blank = createProject();
              useEditorStore.setState({ hydrated: true, hydrationAbandoned: true });
              useEditorStore.getState().replaceProject(blank);
              void saveProject(blank).catch((error) => console.error("Could not save the recovered blank project", error));
              this.setState({ error: null });
            }}>Recover with a blank project</button>
            <button className="mt-4 rounded bg-sky-600 px-3 py-2 text-sm" onClick={() => window.location.reload()}>Reload app</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
