// In development, never install a worker that could cache stale application code.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(
      `${import.meta.env.BASE_URL}sw.js`,
      { scope: import.meta.env.BASE_URL },
    ).catch(() => {
      // Offline installation is optional: failures must not block correction.
    });
  }, { once: true });
}
