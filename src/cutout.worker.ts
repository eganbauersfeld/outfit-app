// Runs the segmentation model off the main thread so the app stays responsive.
import { runSegmentation } from './segment';

type Request = { id: number; modelUrl: string; input: Float32Array };

self.onmessage = async (e: MessageEvent<Request>) => {
  const { id, modelUrl, input } = e.data;
  try {
    const mask = await runSegmentation(modelUrl, input);
    (self as unknown as Worker).postMessage({ id, mask }, [mask.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
