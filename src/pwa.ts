export async function registerPwa() {
  if (!import.meta.env.PROD) return;
  const { registerSW } = await import("virtual:pwa-register");
  registerSW({ immediate: true });
}
