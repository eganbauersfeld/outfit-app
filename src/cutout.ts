// Studio photos: cut the garment out of whatever it was shot on, then trim, center and scale it
// the same way every time. The result is a transparent PNG; the app draws it on one studio
// backdrop (see .studio in styles.css), so every piece in the closet and gallery matches.
//
// Background removal runs on the phone (@imgly/background-removal, ISNet quantized model,
// ~56 MB fetched once from its CDN and cached by the service worker). Cutouts made with
// iPhone Photos' "lift subject" already have a transparent background and skip the model.

const SIZE = 900; // output square
const FILL = 0.84; // garment's longest side as a share of the square

export type Progress = (label: string, fraction: number | null) => void;

function loadImage(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob);
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** True when an image already has a real transparent background (e.g. an iPhone "lift subject" copy). */
export async function hasTransparentBackground(blob: Blob): Promise<boolean> {
  if (blob.type && blob.type !== 'image/png' && blob.type !== 'image/webp' && blob.type !== 'image/heic') return false;
  const bmp = await loadImage(blob);
  const scale = Math.min(1, 200 / Math.max(bmp.width, bmp.height));
  const c = canvas(Math.max(1, Math.round(bmp.width * scale)), Math.max(1, Math.round(bmp.height * scale)));
  const ctx = c.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  let clear = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 20) clear++;
  return clear / (data.length / 4) > 0.08;
}

/** Downscale before inference: faster, and keeps iPhone memory in check. */
async function shrink(blob: Blob, max = 1024): Promise<Blob> {
  const bmp = await loadImage(blob);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  if (scale === 1 && blob.type === 'image/jpeg') {
    bmp.close();
    return blob;
  }
  const c = canvas(Math.round(bmp.width * scale), Math.round(bmp.height * scale));
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), 'image/jpeg', 0.92));
}

/** Trim to the garment, then center it on a transparent square at a consistent size. */
export async function normalize(cut: Blob): Promise<Blob | null> {
  const bmp = await loadImage(cut);
  const src = canvas(bmp.width, bmp.height);
  const sctx = src.getContext('2d')!;
  sctx.drawImage(bmp, 0, 0);
  bmp.close();
  const img = sctx.getImageData(0, 0, src.width, src.height);
  firmUpEdges(img);
  removeSpecks(img);
  keepMainPiece(img);
  sctx.putImageData(img, 0, 0);
  const { data, width, height } = img;

  let minX = width,
    minY = height,
    maxX = -1,
    maxY = -1,
    solid = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 24) {
        solid++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  // Nothing found, or the "cutout" is basically the whole frame: the model didn't find a garment.
  const share = solid / (width * height);
  if (maxX < 0 || share < 0.02 || share > 0.97) return null;

  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const scale = (SIZE * FILL) / Math.max(w, h);
  const out = canvas(SIZE, SIZE);
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  const dw = w * scale;
  const dh = h * scale;
  ctx.drawImage(src, minX, minY, w, h, (SIZE - dw) / 2, (SIZE - dh) / 2, dw, dh);
  return new Promise((res) => out.toBlob((b) => res(b), 'image/png'));
}

/**
 * The model leaves a faint, speckled haze of background around some garments. Drop anything
 * barely there and firm up the rest, keeping a soft (not jagged) edge.
 */
function firmUpEdges(img: ImageData) {
  const d = img.data;
  const lo = 48;
  const hi = 210;
  for (let i = 3; i < d.length; i += 4) {
    const a = d[i];
    d[i] = a <= lo ? 0 : a >= hi ? 255 : Math.round(((a - lo) / (hi - lo)) * 255);
  }
}

/**
 * Specks and thin wisps stuck to the garment's edge survive the step above. A morphological
 * "opening" (erode, then dilate) on the alpha mask removes anything thinner than ~2·r pixels
 * while leaving the garment's outline where it was.
 */
function removeSpecks(img: ImageData, r = Math.max(2, Math.round(Math.max(img.width, img.height) / 300))) {
  const { data, width: w, height: h } = img;
  const solid = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) solid[p] = data[p * 4 + 3] > 96 ? 1 : 0;
  // Separable min (erode) then max (dilate) with a square window.
  const pass = (src: Uint8Array, horizontal: boolean, op: 'min' | 'max') => {
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let v = op === 'min' ? 1 : 0;
        for (let k = -r; k <= r; k++) {
          const xx = horizontal ? x + k : x;
          const yy = horizontal ? y : y + k;
          const s = xx < 0 || yy < 0 || xx >= w || yy >= h ? 0 : src[yy * w + xx];
          if (op === 'min' ? s < v : s > v) v = s;
          if ((op === 'min' && v === 0) || (op === 'max' && v === 1)) break;
        }
        out[y * w + x] = v;
      }
    return out;
  };
  const eroded = pass(pass(solid, true, 'min'), false, 'min');
  const opened = pass(pass(eroded, true, 'max'), false, 'max');
  // Keep a 1px soft rim around what survived so edges don't turn jagged.
  const rim = (p: number) => {
    const x = p % w;
    return (x > 0 && opened[p - 1]) || (x < w - 1 && opened[p + 1]) || (p >= w && opened[p - w]) || (p < w * (h - 1) && opened[p + w]);
  };
  for (let p = 0; p < w * h; p++) if (!opened[p] && !rim(p)) data[p * 4 + 3] = 0;
}

/**
 * The model sometimes keeps stray bits (a sock at the edge, a hanger hook, a corner of a bag).
 * Keep the biggest shape plus anything close to it in size — so a pair of shoes stays a pair —
 * and clear the rest.
 */
function keepMainPiece(img: ImageData) {
  const { data, width, height } = img;
  const label = new Int32Array(width * height).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let start = 0; start < width * height; start++) {
    if (label[start] !== -1 || data[start * 4 + 3] <= 24) continue;
    const id = sizes.length;
    let size = 0;
    label[start] = id;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop()!;
      size++;
      const x = p % width;
      const y = (p - x) / width;
      const next = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1];
      for (const q of next) {
        if (q >= 0 && label[q] === -1 && data[q * 4 + 3] > 24) {
          label[q] = id;
          stack.push(q);
        }
      }
    }
    sizes.push(size);
  }
  if (sizes.length <= 1) return;
  const biggest = Math.max(...sizes);
  const keep = sizes.map((n) => n >= biggest * 0.35);
  for (let p = 0; p < width * height; p++) {
    const l = label[p];
    // Faint pixels (alpha ≤ 24) aren't labelled; clear them too unless they hug a kept shape's edge.
    if (l >= 0 ? !keep[l] : data[p * 4 + 3] > 0 && !nearKept(p)) data[p * 4 + 3] = 0;
  }
  function nearKept(p: number) {
    const x = p % width;
    for (const q of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p - width, p + width]) if (q >= 0 && q < width * height && label[q] >= 0 && keep[label[q]]) return true;
    return false;
  }
}

// ---------- The model, in a worker when possible ----------

type Device = 'gpu' | 'cpu';
type Reply = { id: number; progress?: { key: string; current: number; total: number }; result?: Blob; error?: string };

let worker: Worker | null | undefined;
let nextId = 0;

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./cutout.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    worker = null;
  }
  return worker;
}

function inWorker(w: Worker, blob: Blob, device: Device, onProgress?: Progress): Promise<Blob> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent<Reply>) => {
      if (e.data.id !== id) return;
      if (e.data.progress) return reportProgress(e.data.progress, onProgress);
      w.removeEventListener('message', onMessage);
      if (e.data.result) resolve(e.data.result);
      else reject(new Error(e.data.error ?? 'cutout failed'));
    };
    w.addEventListener('message', onMessage);
    w.postMessage({ id, blob, device });
  });
}

let mainThread: Promise<typeof import('@imgly/background-removal')> | null = null;

async function onMainThread(blob: Blob, device: Device, onProgress?: Progress): Promise<Blob> {
  mainThread ??= import('@imgly/background-removal');
  const { removeBackground } = await mainThread;
  return removeBackground(blob, {
    model: 'isnet_quint8',
    device,
    output: { format: 'image/png' },
    progress: (key, current, total) => reportProgress({ key, current, total }, onProgress),
  });
}

function reportProgress(p: { key: string; current: number; total: number }, onProgress?: Progress) {
  if (p.key.startsWith('fetch:')) onProgress?.('Downloading the cutout model (one time, ~56 MB)…', p.total ? p.current / p.total : null);
  else if (p.key.startsWith('compute')) onProgress?.('Cutting out…', null);
}

/** Cut a garment out of a photo. Returns null when it can't find a clear garment. */
export async function makeCutout(photo: Blob, onProgress?: Progress): Promise<Blob | null> {
  if (await hasTransparentBackground(photo)) {
    onProgress?.('Tidying up your cutout…', null);
    return normalize(photo);
  }
  onProgress?.('Loading the cutout model…', null);
  const input = await shrink(photo);
  // The graphics chip is several times faster where the browser offers it (recent iPhones do).
  const device: Device = 'gpu' in navigator ? 'gpu' : 'cpu';
  const attempts: (() => Promise<Blob>)[] = [];
  const w = getWorker();
  if (w) attempts.push(() => inWorker(w, input, device, onProgress));
  attempts.push(() => onMainThread(input, device, onProgress));
  if (device === 'gpu') attempts.push(() => onMainThread(input, 'cpu', onProgress));
  let cut: Blob | null = null;
  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      cut = await attempt();
      break;
    } catch (e) {
      lastError = e;
    }
  }
  if (!cut) throw lastError;
  onProgress?.('Tidying up…', null);
  return normalize(cut);
}
