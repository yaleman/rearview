import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

import LiveCameraScanner from '../LiveCameraScanner';
import { analyzeImage, deleteTemporaryImage } from '../imageAnalysis';

const mockTakePhoto = jest.fn();
const mockRequestPermission = jest.fn();
let mockHasPermission = true;

jest.mock('react-native-vision-camera', () => {
  const ReactModule: typeof import('react') = require('react');
  const { View }: typeof import('react-native') = require('react-native');

  class MockCamera extends ReactModule.Component<{
    onInitialized?: () => void;
  }> {
    componentDidMount(): void {
      this.props.onInitialized?.();
    }

    takePhoto(options?: unknown): Promise<unknown> {
      return mockTakePhoto(options);
    }

    render(): React.JSX.Element {
      return ReactModule.createElement(View, {
        accessibilityLabel: 'Live rear camera',
      });
    }
  }

  return {
    Camera: MockCamera,
    useCameraDevice: () => ({ id: 'back-camera' }),
    useCameraPermission: () => ({
      hasPermission: mockHasPermission,
      requestPermission: mockRequestPermission,
    }),
  };
});

jest.mock('../imageAnalysis', () => ({
  analyzeImage: jest.fn(),
  deleteTemporaryImage: jest.fn(),
}));

const mockAnalyzeImage = jest.mocked(analyzeImage);
const mockDeleteTemporaryImage = jest.mocked(deleteTemporaryImage);

async function renderScanner(
  overrides: { canAnalyze?: boolean } = {},
): Promise<{
  renderer: ReactTestRenderer.ReactTestRenderer;
  onActiveChange: jest.Mock;
  onBusyChange: jest.Mock;
  onResult: jest.Mock;
  onStatus: jest.Mock;
}> {
  const onActiveChange = jest.fn();
  const onBusyChange = jest.fn();
  const onResult = jest.fn();
  const onStatus = jest.fn();
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await act(async () => {
    renderer = ReactTestRenderer.create(
      <LiveCameraScanner
        canAnalyze={overrides.canAnalyze ?? true}
        onActiveChange={onActiveChange}
        onBusyChange={onBusyChange}
        onResult={onResult}
        onStatus={onStatus}
        prompt="Describe hazards."
      />,
    );
  });

  return {
    renderer: renderer as ReactTestRenderer.ReactTestRenderer,
    onActiveChange,
    onBusyChange,
    onResult,
    onStatus,
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockHasPermission = true;
  mockRequestPermission.mockResolvedValue(true);
  mockTakePhoto.mockResolvedValue({ path: '/tmp/frame.jpg' });
  mockAnalyzeImage.mockResolvedValue({
    imageURI: 'file:///tmp/resized.jpg',
    imageWidth: 256,
    imageHeight: 144,
    resizeMilliseconds: 12,
    elapsedMilliseconds: 800,
    text: 'Clear road',
    timings: { tokens: 2 },
  });
  mockDeleteTemporaryImage.mockResolvedValue();
});

afterEach(() => {
  jest.useRealTimers();
});

test('starts the rear camera and repeatedly analyzes snapshots', async () => {
  const { renderer, onActiveChange, onResult } = await renderScanner();

  await act(async () => {
    await renderer.root
      .findByProps({ title: 'Start continuous camera' })
      .props.onPress();
  });
  await act(async () => {
    jest.advanceTimersByTime(150);
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(onActiveChange).toHaveBeenLastCalledWith(true);
  expect(renderer.root.findByProps({ title: 'Pause' })).toBeDefined();
  expect(mockTakePhoto).toHaveBeenCalledWith({ enableShutterSound: false });
  expect(mockAnalyzeImage).toHaveBeenCalledWith(
    '/tmp/frame.jpg',
    'Describe hazards.',
  );
  expect(mockDeleteTemporaryImage).toHaveBeenCalledWith('/tmp/frame.jpg');
  expect(onResult).toHaveBeenCalledWith(
    expect.objectContaining({ text: 'Clear road' }),
  );

  act(() => renderer.unmount());
});

test('does not capture another frame while inference is running', async () => {
  let finishAnalysis:
    | ((value: Awaited<ReturnType<typeof analyzeImage>>) => void)
    | undefined;
  mockAnalyzeImage.mockImplementation(
    () =>
      new Promise(resolve => {
        finishAnalysis = resolve;
      }),
  );
  const { renderer } = await renderScanner();

  await act(async () => {
    await renderer.root
      .findByProps({ title: 'Start continuous camera' })
      .props.onPress();
  });
  await act(async () => {
    jest.advanceTimersByTime(2000);
    await Promise.resolve();
  });

  expect(mockTakePhoto).toHaveBeenCalledTimes(1);
  expect(mockAnalyzeImage).toHaveBeenCalledTimes(1);

  await act(async () => {
    finishAnalysis?.({
      imageURI: 'file:///tmp/resized.jpg',
      imageWidth: 256,
      imageHeight: 144,
      resizeMilliseconds: 12,
      elapsedMilliseconds: 800,
      text: 'Clear road',
      timings: {},
    });
    await Promise.resolve();
    renderer.unmount();
  });
});

test('reports denied camera permission without activating', async () => {
  mockHasPermission = false;
  mockRequestPermission.mockResolvedValue(false);
  const { renderer, onActiveChange, onStatus } = await renderScanner();

  await act(async () => {
    await renderer.root
      .findByProps({ title: 'Start continuous camera' })
      .props.onPress();
  });

  expect(mockRequestPermission).toHaveBeenCalledTimes(1);
  expect(onActiveChange).not.toHaveBeenCalledWith(true);
  expect(onStatus).toHaveBeenCalledWith('Error: Camera permission was denied');

  act(() => renderer.unmount());
});
