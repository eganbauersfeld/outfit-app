// The garment-segmentation model: U²-Net-p (Apache-2.0, ~4.6 MB, 320×320 input), shipped with the
// app under /models. Runs on onnxruntime-web's plain WebAssembly build, one thread, no WebGPU —
// light enough for an iPhone home-screen app (the previous, much larger model crashed it).
import * as ort from 'onnxruntime-web/wasm';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';

ort.env.wasm.wasmPaths = { wasm: wasmUrl };
ort.env.wasm.numThreads = 1;

export const MODEL_SIZE = 320;

let session: Promise<ort.InferenceSession> | null = null;

/** Input: normalized RGB, NCHW, 1×3×320×320. Output: raw saliency mask, 320×320. */
export async function runSegmentation(modelUrl: string, input: Float32Array): Promise<Float32Array> {
  try {
    session ??= ort.InferenceSession.create(modelUrl, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    const s = await session;
    const out = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, MODEL_SIZE, MODEL_SIZE]) }, [s.outputNames[0]]);
    return new Float32Array(out[s.outputNames[0]].data as Float32Array);
  } catch (err) {
    session = null; // let the next attempt start clean
    throw err;
  }
}
