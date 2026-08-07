import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import App from '../App';
import { loadRearview, loadSavedPrompt, savePrompt } from '../rearview';
import { analyzeImage } from '../imageAnalysis';
import type { ImageAnalysisResult } from '../imageAnalysis';
import { launchImageLibrary } from 'react-native-image-picker';

let mockLiveCameraProps: {
  canAnalyze: boolean;
  onActiveChange: (active: boolean) => void;
  onResult: (result: ImageAnalysisResult) => void;
} | null = null;

jest.mock('../rearview', () => ({
  DEFAULT_PROMPT: "describe what's in this image",
  loadRearview: jest.fn(),
  loadSavedPrompt: jest.fn(),
  savePrompt: jest.fn(),
}));

jest.mock('../imageAnalysis', () => ({
  analyzeImage: jest.fn(),
  deleteTemporaryImage: jest.fn(),
}));

jest.mock('../ToolsScreen', () => {
  const ReactModule = require('react');
  const { Text: NativeText } = require('react-native');

  return function MockToolsScreen() {
    return ReactModule.createElement(NativeText, null, 'Tools screen');
  };
});

jest.mock('../LiveCameraScanner', () => {
  const ReactModule = require('react');
  const { Button } = require('react-native');

  return function MockLiveCameraScanner(props: {
    canAnalyze: boolean;
    onActiveChange: (active: boolean) => void;
    onResult: (result: ImageAnalysisResult) => void;
  }) {
    mockLiveCameraProps = props;
    return ReactModule.createElement(Button, {
      disabled: !props.canAnalyze,
      title: 'Start continuous camera',
    });
  };
});

jest.mock('react-native-image-picker', () => ({
  launchImageLibrary: jest.fn(),
}));

const mockAnalyzeImage = jest.mocked(analyzeImage);
const mockLoadRearview = jest.mocked(loadRearview);
const mockLoadSavedPrompt = jest.mocked(loadSavedPrompt);
const mockSavePrompt = jest.mocked(savePrompt);
const mockLaunchImageLibrary = jest.mocked(launchImageLibrary);

async function renderApp(): Promise<ReactTestRenderer.ReactTestRenderer> {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
    await Promise.resolve();
  });

  return renderer as ReactTestRenderer.ReactTestRenderer;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLiveCameraProps = null;
  mockLoadSavedPrompt.mockResolvedValue('Stored prompt');
  mockLoadRearview.mockImplementation(async status => {
    status?.('Model ready');
  });
  mockSavePrompt.mockResolvedValue();
  mockAnalyzeImage.mockResolvedValue({
    text: 'A stopped vehicle',
    timings: { tokens: 3 },
    elapsedMilliseconds: 1250,
    imageURI: 'file:///resized.jpg',
    imageWidth: 256,
    imageHeight: 192,
    resizeMilliseconds: 20,
  });
});

test('loads the saved prompt and bundled model on launch', async () => {
  const renderer = await renderApp();

  expect(mockLoadSavedPrompt).toHaveBeenCalledTimes(1);
  expect(mockLoadRearview).toHaveBeenCalledTimes(1);
  expect(
    renderer.root.findByProps({ accessibilityLabel: 'Analysis prompt' }).props
      .value,
  ).toBe('Stored prompt');
  expect(
    renderer.root.findByProps({ title: 'Start continuous camera' }).props
      .disabled,
  ).toBe(false);
});

test('opens the tools screen from the app navigation', async () => {
  const renderer = await renderApp();
  const tabs = renderer.root
    .findAllByProps({ accessibilityRole: 'tab' })
    .filter(node => typeof node.props.onPress === 'function');

  expect(tabs).toHaveLength(2);
  expect(tabs[0].props.accessibilityState).toEqual({ selected: true });

  act(() => tabs[1].props.onPress());

  expect(
    renderer.root
      .findAllByType(Text)
      .some(node => node.props.children === 'Tools screen'),
  ).toBe(true);
});

test('renders a visible prompt field in light and dark appearance', async () => {
  const renderer = await renderApp();
  const input = renderer.root.findByProps({
    accessibilityLabel: 'Analysis prompt',
  });
  const style = StyleSheet.flatten(input.props.style);

  expect(style).toEqual(
    expect.objectContaining({
      backgroundColor: expect.anything(),
      borderColor: expect.anything(),
      borderWidth: 1,
      color: expect.anything(),
    }),
  );
  expect(
    StyleSheet.flatten(renderer.root.findByType(SafeAreaView).props.style)
      .backgroundColor,
  ).toBeDefined();
  expect(renderer.root.findByType(SafeAreaView).props.edges).toEqual([
    'top',
    'right',
    'bottom',
    'left',
  ]);
  expect(
    StyleSheet.flatten(
      renderer.root
        .findAllByType(Text)
        .find(node => node.props.children === 'Rearview')?.props.style,
    ).color,
  ).toBeDefined();
});

test('shows only monitoring output and collapsed diagnostics while active', async () => {
  const renderer = await renderApp();

  act(() => mockLiveCameraProps?.onActiveChange(true));

  expect(
    renderer.root
      .findAllByType(Text)
      .some(node => node.props.children === 'Rearview'),
  ).toBe(false);
  expect(
    renderer.root.findAllByProps({ accessibilityLabel: 'Analysis prompt' }),
  ).toHaveLength(0);
  expect(
    renderer.root.findAllByProps({ title: 'Choose and analyse photo' }),
  ).toHaveLength(0);

  act(() =>
    mockLiveCameraProps?.onResult({
      text: 'A clear road',
      timings: { prompt_ms: 400 },
      elapsedMilliseconds: 900,
      imageURI: 'file:///resized.jpg',
      imageWidth: 256,
      imageHeight: 144,
      resizeMilliseconds: 10,
    }),
  );

  expect(
    renderer.root.findByProps({ title: 'Show diagnostics' }),
  ).toBeDefined();
  expect(
    renderer.root
      .findAllByType(Text)
      .some(node => node.props.children === 'llama.cpp timings'),
  ).toBe(false);

  act(() =>
    renderer.root.findByProps({ title: 'Show diagnostics' }).props.onPress(),
  );

  expect(
    renderer.root
      .findAllByType(Text)
      .some(node => node.props.children === 'llama.cpp timings'),
  ).toBe(true);
});

test('saves an edited prompt locally', async () => {
  const renderer = await renderApp();
  const input = renderer.root.findByProps({
    accessibilityLabel: 'Analysis prompt',
  });

  act(() => input.props.onChangeText('Describe the closest hazard.'));

  await act(async () => {
    await renderer.root.findByProps({ title: 'Save prompt' }).props.onPress();
  });

  expect(mockSavePrompt).toHaveBeenCalledWith('Describe the closest hazard.');
});

test('uses the current unsaved prompt for a library photo', async () => {
  mockLaunchImageLibrary.mockResolvedValue({
    assets: [{ uri: 'file:///photo.jpg' }],
  });
  const renderer = await renderApp();

  act(() =>
    renderer.root
      .findByProps({ accessibilityLabel: 'Analysis prompt' })
      .props.onChangeText('Read the road sign.'),
  );

  await act(async () => {
    await renderer.root
      .findByProps({ title: 'Choose and analyse photo' })
      .props.onPress();
  });

  expect(mockLaunchImageLibrary).toHaveBeenCalledWith(
    expect.objectContaining({
      maxHeight: 256,
      maxWidth: 256,
      quality: 0.5,
    }),
  );
  expect(mockAnalyzeImage).toHaveBeenCalledWith(
    'file:///photo.jpg',
    'Read the road sign.',
  );
});

test('retains library selection and ignores cancellation', async () => {
  mockLaunchImageLibrary.mockResolvedValue({ didCancel: true });
  const renderer = await renderApp();

  await act(async () => {
    await renderer.root
      .findByProps({ title: 'Choose and analyse photo' })
      .props.onPress();
  });

  expect(mockLaunchImageLibrary).toHaveBeenCalledTimes(1);
  expect(mockAnalyzeImage).not.toHaveBeenCalled();
});

test.each([
  [
    'library failures',
    { errorCode: 'others' as const, errorMessage: 'Library failed' },
    'Error: Library failed',
  ],
  [
    'missing image URIs',
    { assets: [] },
    'Error: Image picker returned no image URI',
  ],
])('shows %s', async (_name, response, expectedStatus) => {
  mockLaunchImageLibrary.mockResolvedValue(response);
  const consoleError = jest.spyOn(console, 'error').mockImplementation();
  const renderer = await renderApp();

  await act(async () => {
    await renderer.root
      .findByProps({ title: 'Choose and analyse photo' })
      .props.onPress();
  });

  expect(
    renderer.root
      .findAllByType(Text)
      .some(node => String(node.props.children).includes(expectedStatus)),
  ).toBe(true);
  expect(mockAnalyzeImage).not.toHaveBeenCalled();
  consoleError.mockRestore();
});

test('disables image actions for an empty prompt', async () => {
  const renderer = await renderApp();

  act(() =>
    renderer.root
      .findByProps({ accessibilityLabel: 'Analysis prompt' })
      .props.onChangeText('   '),
  );

  expect(
    renderer.root.findByProps({ title: 'Start continuous camera' }).props
      .disabled,
  ).toBe(true);
  expect(
    renderer.root.findByProps({ title: 'Save prompt' }).props.disabled,
  ).toBe(true);
});

test('shows typed model initialization failures', async () => {
  mockLoadRearview.mockRejectedValue(new Error('Projector unavailable'));
  const consoleError = jest.spyOn(console, 'error').mockImplementation();
  const renderer = await renderApp();

  expect(
    renderer.root.findByProps({ title: 'Start continuous camera' }).props
      .disabled,
  ).toBe(true);
  expect(
    renderer.root
      .findAllByType(Text)
      .some(node =>
        String(node.props.children).includes('Error: Projector unavailable'),
      ),
  ).toBe(true);
  consoleError.mockRestore();
});
