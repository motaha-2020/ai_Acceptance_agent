/** Set while the camera screen is open, so a critical OTA update never reloads mid-capture. */
let busy = false;
const listeners = new Set<(b: boolean) => void>();

export function setCaptureBusy(b: boolean): void {
  busy = b;
  for (const fn of listeners) fn(b);
}

export function isCaptureBusy(): boolean {
  return busy;
}

export function onCaptureBusyChange(fn: (b: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
