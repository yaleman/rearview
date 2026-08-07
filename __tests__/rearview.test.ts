const mockExists = jest.fn();
const mockReadFile = jest.fn();
const mockWriteFile = jest.fn();
const mockCompletion = jest.fn();
const mockGetMultimodalSupport = jest.fn();
const mockInitMultimodal = jest.fn();
const mockRelease = jest.fn();
const mockInitLlama = jest.fn();

jest.mock('react-native-fs', () => ({
  __esModule: true,
  default: {
    DocumentDirectoryPath: '/documents',
    MainBundlePath: '/bundle',
    exists: (...args: unknown[]) => mockExists(...args),
    readFile: (...args: unknown[]) => mockReadFile(...args),
    writeFile: (...args: unknown[]) => mockWriteFile(...args),
  },
}));

jest.mock('llama.rn', () => ({
  __esModule: true,
  initLlama: (...args: unknown[]) => mockInitLlama(...args),
}));

import {
  DEFAULT_PROMPT,
  EmptyPromptError,
  describeImage,
  loadRearview,
  loadSavedPrompt,
  savePrompt,
  supportsModelGpu,
} from '../rearview';

beforeEach(() => {
  jest.clearAllMocks();
  mockInitMultimodal.mockResolvedValue(true);
  mockGetMultimodalSupport.mockResolvedValue({ vision: true });
  mockRelease.mockResolvedValue(undefined);
  mockCompletion.mockResolvedValue({
    text: '  Clear road  ',
    timings: { tokens: 2 },
  });
  mockInitLlama.mockResolvedValue({
    completion: mockCompletion,
    getMultimodalSupport: mockGetMultimodalSupport,
    initMultimodal: mockInitMultimodal,
    release: mockRelease,
  });
});

test('uses the default prompt when no prompt has been saved', async () => {
  mockExists.mockResolvedValue(false);

  await expect(loadSavedPrompt()).resolves.toBe(
    "describe what's in this image",
  );
  expect(DEFAULT_PROMPT).toBe("describe what's in this image");
});

test('loads and saves prompt text in app documents', async () => {
  mockExists.mockResolvedValue(true);
  mockReadFile.mockResolvedValue('Saved prompt');

  await expect(loadSavedPrompt()).resolves.toBe('Saved prompt');
  await savePrompt('New prompt');

  expect(mockReadFile).toHaveBeenCalledWith('/documents/prompt.txt', 'utf8');
  expect(mockWriteFile).toHaveBeenCalledWith(
    '/documents/prompt.txt',
    'New prompt',
    'utf8',
  );
});

test('rejects an empty prompt', async () => {
  await expect(savePrompt('  ')).rejects.toBeInstanceOf(EmptyPromptError);
});

test('disables model GPU allocation in the iOS simulator', () => {
  expect(
    supportsModelGpu(
      '/Users/test/Library/Developer/CoreSimulator/Devices/device/rearview.app',
    ),
  ).toBe(false);
  expect(supportsModelGpu('/private/var/containers/Bundle/rearview.app')).toBe(
    true,
  );
});

test('loads bundled models and analyzes with the supplied prompt', async () => {
  const statuses: string[] = [];

  await loadRearview(message => statuses.push(message));
  const result = await describeImage('file:///photo.jpg', 'Describe it.');

  expect(mockInitLlama).toHaveBeenCalledWith(
    expect.objectContaining({
      is_model_asset: true,
      model: 'SmolVLM-500M-Instruct-Q8_0.gguf',
      n_gpu_layers: 99,
      n_ctx: 512,
      flash_attn: true,
    }),
  );
  expect(mockInitMultimodal).toHaveBeenCalledWith({
    path: 'file:///bundle/mmproj-SmolVLM-500M-Instruct-Q8_0.gguf',
    use_gpu: true,
    image_min_tokens: 64,
    image_max_tokens: 256,
  });
  expect(mockCompletion).toHaveBeenCalledWith(
    expect.objectContaining({
      messages: [
        expect.objectContaining({
          content: expect.arrayContaining([
            { type: 'text', text: 'Describe it.' },
          ]),
        }),
      ],
    }),
  );
  expect(result.text).toBe('Clear road');
  expect(statuses).toContain('Model ready');
});
