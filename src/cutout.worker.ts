// Runs the background-removal model off the main thread so the app stays responsive
// (inference takes a few seconds on a phone). See cutout.ts for the caller.
import { removeBackground } from '@imgly/background-removal';

type Request = { id: number; blob: Blob; device: 'gpu' | 'cpu' };

self.onmessage = async (e: MessageEvent<Request>) => {
  const { id, blob, device } = e.data;
  try {
    const result = await removeBackground(blob, {
      model: 'isnet_quint8',
      device,
      output: { format: 'image/png' },
      progress: (key, current, total) => self.postMessage({ id, progress: { key, current, total } }),
    });
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
