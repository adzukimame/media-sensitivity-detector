import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as tf from '@tensorflow/tfjs-node';
import * as nsfw from 'nsfwjs';
import si from 'systeminformation';
import { Mutex } from 'async-mutex';

const _filename = fileURLToPath(import.meta.url);
const _dirname = dirname(_filename);

const REQUIRED_CPU_FLAGS = ['avx2', 'fma'];

export class AiService {
  private static instance: AiService | undefined = undefined;
  private static instanceMutex: Mutex = new Mutex();

  private isSupportedCpu: undefined | boolean = undefined;

  private model: nsfw.NSFWJS | null = null;
  private modelLoadMutex: Mutex = new Mutex();

  private constructor() {
    // nop
  }

  private async init() {
    const cpuFlags = await this.getCpuFlags();
    this.isSupportedCpu = REQUIRED_CPU_FLAGS.every(required => cpuFlags.includes(required));

    if (!this.isSupportedCpu) {
      // eslint-disable-next-line no-console
      console.error('CPU does not support required instructions');
    }

    await this.modelLoadMutex.runExclusive(async () => {
      this.model ??= await nsfw.load(`file://${_dirname}/../nsfw-model/`, { size: 299 });
    });

    if (this.model == null) {
      // eslint-disable-next-line no-console
      console.error(`Failed to load model: (file://${_dirname}/../nsfw-model/)`);
    }
  }

  public static async getInstance(): Promise<AiService> {
    return AiService.instanceMutex.runExclusive(async () => {
      if (AiService.instance === undefined) {
        const newInstance = new AiService();
        await newInstance.init();
        AiService.instance = newInstance;
      }
      return AiService.instance;
    });
  }

  public async detectSensitive(buffer: ArrayBufferLike): Promise<nsfw.predictionType[] | null> {
    try {
      if (!this.isSupportedCpu) {
        return null;
      }

      if (this.model == null) {
        return null;
      }

      const image = tf.node.decodeImage(new Uint8Array(buffer), 3);
      try {
        const predictions = await this.model.classify(image);
        return predictions;
      }
      finally {
        image.dispose();
      }
    }
    catch (err) {
      // eslint-disable-next-line no-console
      console.error('An error occured:', err);
      return null;
    }
  }

  public async getCpuFlags(): Promise<string[]> {
    const str = await si.cpuFlags();
    return str.split(/\s+/);
  }
}
