const mockCompress = jest.fn();
const mockDescribeImage = jest.fn();
const mockExists = jest.fn();
const mockUnlink = jest.fn();

jest.mock('react-native-compressor', () => ({
  Image: {
    compress: (...args: unknown[]) => mockCompress(...args),
  },
}));

jest.mock('../rearview', () => ({
  describeImage: (...args: unknown[]) => mockDescribeImage(...args),
}));

jest.mock('react-native-fs', () => ({
  __esModule: true,
  default: {
    exists: (...args: unknown[]) => mockExists(...args),
    unlink: (...args: unknown[]) => mockUnlink(...args),
  },
}));

import { analyzeImage } from '../imageAnalysis';
import { Image as ReactNativeImage } from 'react-native';

beforeEach(() => {
  jest.clearAllMocks();
  mockCompress.mockResolvedValue('file:///tmp/resized.jpg');
  mockExists.mockResolvedValue(true);
  mockUnlink.mockResolvedValue(undefined);
  jest
    .spyOn(ReactNativeImage, 'getSize')
    .mockImplementation((_uri, success) => {
      success(256, 144);
    });
  mockDescribeImage.mockResolvedValue({
    text: 'Clear road',
    timings: { tokens: 2 },
    elapsedMilliseconds: 900,
  });
});

test('resizes images to a small JPEG before inference', async () => {
  const result = await analyzeImage('file:///tmp/source.jpg', 'Describe it.');

  expect(mockCompress).toHaveBeenCalledWith('file:///tmp/source.jpg', {
    compressionMethod: 'manual',
    maxWidth: 256,
    maxHeight: 256,
    quality: 0.55,
    output: 'jpg',
  });
  expect(mockDescribeImage).toHaveBeenCalledWith(
    'file:///tmp/resized.jpg',
    'Describe it.',
  );
  expect(result).toEqual(
    expect.objectContaining({
      imageURI: 'file:///tmp/resized.jpg',
      imageWidth: 256,
      imageHeight: 144,
      text: 'Clear road',
    }),
  );
});
