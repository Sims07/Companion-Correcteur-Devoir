export function downloadJson(report: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Safari may need the object URL to survive the current click task.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

