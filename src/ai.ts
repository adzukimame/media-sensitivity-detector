import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as tf from '@tensorflow/tfjs-node';
import * as nsfw from 'nsfwjs';
import si from 'systeminformation';
import { Mutex } from 'async-mutex';

const _filename = fileURLToPath(import.meta.url);
const _dirname = dirname(_filename);

const REQUIRED_CPU_FLAGS = ['avx2', 'fma'];
let isSupportedCpu: undefined | boolean = undefined;

let model: nsfw.NSFWJS | null = null;
const modelLoadMutex: Mutex = new Mutex();

export async function detectSensitive(buffer: ArrayBufferLike): Promise<nsfw.predictionType[] | null> {
  try {
    if (isSupportedCpu === undefined) {
      const cpuFlags = await getCpuFlags();
      isSupportedCpu = REQUIRED_CPU_FLAGS.every(required => cpuFlags.includes(required));
    }

    if (!isSupportedCpu) {
      console.error('CPU does not support required instructions');
      return null;
    }

    if (model == null) {
      await modelLoadMutex.runExclusive(async () => {
        model ??= await nsfw.load(`file://${_dirname}/../nsfw-model/`, { size: 299 });
      });
    }

    if (model == null) {
      console.error(`Failed to load model: (file://${_dirname}/../nsfw-model/)`);
      return null;
    }

    const image = tf.node.decodeImage(new Uint8Array(buffer), 3);
    try {
      const predictions = await model.classify(image);
      return predictions;
    }
    finally {
      image.dispose();
    }
  }
  catch (err) {
    console.error('An error occured:', err);
    return null;
  }
}

async function getCpuFlags(): Promise<string[]> {
  const str = await si.cpuFlags();
  return str.split(/\s+/);
}
