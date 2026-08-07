import RNFS from 'react-native-fs';
import { initLlama } from 'llama.rn';

export const DEFAULT_PROMPT = "describe what's in this image";

const MODEL_NAME = 'SmolVLM-500M-Instruct-Q8_0.gguf';
const PROJECTOR_NAME = 'mmproj-SmolVLM-500M-Instruct-Q8_0.gguf';
const PROMPT_PATH = `${RNFS.DocumentDirectoryPath}/prompt.txt`;

let context: Awaited<ReturnType<typeof initLlama>> | null = null;
let loading: Promise<void> | null = null;

type StatusCallback = (message: string) => void;

export class EmptyPromptError extends Error {
  constructor() {
    super('Prompt cannot be empty');
    this.name = 'EmptyPromptError';
  }
}

function fileURL(path: string): string {
  return path.startsWith('file://') ? path : `file://${path}`;
}

export function supportsModelGpu(bundlePath: string): boolean {
  return !bundlePath.includes('/CoreSimulator/');
}

export async function loadSavedPrompt(): Promise<string> {
  if (!(await RNFS.exists(PROMPT_PATH))) {
    return DEFAULT_PROMPT;
  }

  const prompt = await RNFS.readFile(PROMPT_PATH, 'utf8');
  return prompt.trim() === '' ? DEFAULT_PROMPT : prompt;
}

export async function savePrompt(prompt: string): Promise<void> {
  if (prompt.trim() === '') {
    throw new EmptyPromptError();
  }

  await RNFS.writeFile(PROMPT_PATH, prompt, 'utf8');
}

async function initializeRearview(status: StatusCallback): Promise<void> {
  status('Loading bundled language model…');
  const useGpu = supportsModelGpu(RNFS.MainBundlePath);

  const nextContext = await initLlama({
    model: MODEL_NAME,
    is_model_asset: true,
    n_gpu_layers: useGpu ? 99 : 0,
    n_ctx: 512,
    ctx_shift: false,
    flash_attn: true,
  });

  try {
    status('Loading bundled vision projector…');

    const multimodalLoaded = await nextContext.initMultimodal({
      path: fileURL(`${RNFS.MainBundlePath}/${PROJECTOR_NAME}`),
      use_gpu: useGpu,
      image_min_tokens: 64,
      image_max_tokens: 256,
    });

    if (!multimodalLoaded) {
      throw new Error('Failed to initialise multimodal support');
    }

    const support = await nextContext.getMultimodalSupport();

    if (!support.vision) {
      throw new Error('Loaded projector does not report vision support');
    }

    context = nextContext;
    status('Model ready');
  } catch (error) {
    await nextContext.release();
    throw error;
  }
}

export async function loadRearview(
  status: StatusCallback = console.log,
): Promise<void> {
  if (context !== null) {
    status('Model ready');
    return;
  }

  if (loading === null) {
    loading = initializeRearview(status).finally(() => {
      loading = null;
    });
  }

  await loading;
}

export async function describeImage(
  imagePath: string,
  prompt: string,
): Promise<{
  text: string;
  timings: unknown;
  elapsedMilliseconds: number;
}> {
  if (context === null) {
    throw new Error('Model has not been loaded');
  }

  if (prompt.trim() === '') {
    throw new EmptyPromptError();
  }

  const started = Date.now();

  const result = await context.completion({
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: prompt,
          },
          {
            type: 'image_url',
            image_url: {
              url: fileURL(imagePath),
            },
          },
        ],
      },
    ],
    n_predict: 12,
    temperature: 0,
  });

  return {
    text: result.text.trim(),
    timings: result.timings,
    elapsedMilliseconds: Date.now() - started,
  };
}
