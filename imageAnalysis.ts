import { Image as ReactNativeImage } from 'react-native';
import { Image as ImageCompressor } from 'react-native-compressor';
import RNFS from 'react-native-fs';

import { describeImage } from './rearview';

export const ANALYSIS_IMAGE_SIZE = 256;

export type ImageAnalysisResult = Awaited<ReturnType<typeof describeImage>> & {
  imageURI: string;
  imageWidth: number;
  imageHeight: number;
  resizeMilliseconds: number;
};

function fileURL(path: string): string {
  return path.startsWith('file://') ? path : `file://${path}`;
}

export async function deleteTemporaryImage(path: string): Promise<void> {
  const filesystemPath = path.startsWith('file://') ? path.slice(7) : path;

  if (await RNFS.exists(filesystemPath)) {
    await RNFS.unlink(filesystemPath);
  }
}

function imageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    ReactNativeImage.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      reject,
    );
  });
}

export async function analyzeImage(
  imagePath: string,
  prompt: string,
): Promise<ImageAnalysisResult> {
  const resizeStarted = Date.now();
  const imageURI = await ImageCompressor.compress(fileURL(imagePath), {
    compressionMethod: 'manual',
    maxWidth: ANALYSIS_IMAGE_SIZE,
    maxHeight: ANALYSIS_IMAGE_SIZE,
    quality: 0.55,
    output: 'jpg',
  });
  const dimensions = await imageSize(imageURI);
  const resizeMilliseconds = Date.now() - resizeStarted;
  try {
    const result = await describeImage(imageURI, prompt);

    return {
      ...result,
      imageURI,
      imageWidth: dimensions.width,
      imageHeight: dimensions.height,
      resizeMilliseconds,
    };
  } catch (error) {
    await deleteTemporaryImage(imageURI).catch(cleanupError => {
      console.error(cleanupError);
    });
    throw error;
  }
}
