import RNFS from 'react-native-fs';
import {initLlama} from 'llama.rn';

const MODEL_NAME = 'SmolVLM-500M-Instruct-Q8_0.gguf';
const PROJECTOR_NAME = 'mmproj-SmolVLM-500M-Instruct-Q8_0.gguf';

const MODEL_URL =
  'https://huggingface.co/ggml-org/SmolVLM-500M-Instruct-GGUF/resolve/main/' +
  MODEL_NAME;

const PROJECTOR_URL =
  'https://huggingface.co/ggml-org/SmolVLM-500M-Instruct-GGUF/resolve/main/' +
  PROJECTOR_NAME;

const MODEL_PATH = `${RNFS.DocumentDirectoryPath}/${MODEL_NAME}`;
const PROJECTOR_PATH = `${RNFS.DocumentDirectoryPath}/${PROJECTOR_NAME}`;

let context: Awaited<ReturnType<typeof initLlama>> | null = null;

type StatusCallback = (message: string) => void;

async function ensureDownloaded(
  url: string,
  path: string,
  label: string,
  status: StatusCallback,
): Promise<void> {
  if (await RNFS.exists(path)) {
    const file = await RNFS.stat(path);
    status(`${label} already downloaded: ${file.size} bytes`);
    return;
  }

  status(`Downloading ${label}...`);

  const download = RNFS.downloadFile({
    fromUrl: url,
    toFile: path,
    progressDivider: 5,
    progress: event => {
      if (event.contentLength > 0) {
        const percent = Math.floor(
          (event.bytesWritten / event.contentLength) * 100,
        );
        status(`Downloading ${label}: ${percent}%`);
      }
    },
  });

  const result = await download.promise;

  if (result.statusCode < 200 || result.statusCode >= 300) {
    await RNFS.unlink(path).catch(() => undefined);
    throw new Error(
      `Downloading ${label} returned HTTP ${result.statusCode}`,
    );
  }
}

function fileURL(path: string): string {
  return path.startsWith('file://') ? path : `file://${path}`;
}

export async function loadRearview(
  status: StatusCallback = console.log,
): Promise<void> {
  if (context !== null) {
    status('Model already loaded');
    return;
  }

  await ensureDownloaded(MODEL_URL, MODEL_PATH, 'model', status);
  await ensureDownloaded(
    PROJECTOR_URL,
    PROJECTOR_PATH,
    'vision projector',
    status,
  );

  status('Loading language model on CPU...');

  context = await initLlama({
    model: fileURL(MODEL_PATH),

    // The A11/iPhone X cannot use llama.rn's current Metal backend.
    n_gpu_layers: 0,

    // Keep this modest while checking whether the phone survives.
    n_ctx: 1024,

    // Required for multimodal positioning.
    ctx_shift: false,
  });

  status('Loading vision projector on CPU...');

  const multimodalLoaded = await context.initMultimodal({
    path: fileURL(PROJECTOR_PATH),
    use_gpu: false,
  });

  if (!multimodalLoaded) {
    context = null;
    throw new Error('Failed to initialise multimodal support');
  }

  const support = await context.getMultimodalSupport();

  if (!support.vision) {
    context = null;
    throw new Error('Loaded projector does not report vision support');
  }

  status('Model and vision projector loaded');
}

export async function describeImage(imagePath: string): Promise<{
  text: string;
  timings: unknown;
  elapsedMilliseconds: number;
}> {
  if (context === null) {
    throw new Error('Model has not been loaded');
  }

  const started = performance.now();

  const result = await context.completion({
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Name the most important object or hazard ahead. Maximum six words.',
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

    // Six words can still consume more than six tokens.
    n_predict: 12,
    temperature: 0,
  });

  return {
    text: result.text.trim(),
    timings: result.timings,
    elapsedMilliseconds: performance.now() - started,
  };
}