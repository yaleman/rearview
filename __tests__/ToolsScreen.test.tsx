import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

const mockSendRgb = jest.fn<Promise<void>, [unknown]>();
const mockSendText = jest.fn<Promise<void>, [string]>();
const mockSendFlash = jest.fn<Promise<void>, [number, number]>();
const mockSendClear = jest.fn<Promise<void>, []>();
const mockDestroy = jest.fn();
const mockUnsubscribe = jest.fn();
let connectionStateListener: ((state: string) => void) | null = null;
const mockSubscribeToConnectionState = jest.fn(
  (listener: (state: string) => void) => {
    connectionStateListener = listener;
    listener('disconnected');
    return mockUnsubscribe;
  },
);

jest.mock('@react-native-community/slider', () => {
  const ReactModule = require('react');

  return function MockSlider(props: object) {
    return ReactModule.createElement('Slider', props);
  };
});

jest.mock('../bluetoothRgb', () => ({
  BluetoothIndicatorClient: jest.fn().mockImplementation(() => ({
    destroy: mockDestroy,
    sendClear: mockSendClear,
    sendFlash: mockSendFlash,
    sendRgb: mockSendRgb,
    sendText: mockSendText,
    subscribeToConnectionState: mockSubscribeToConnectionState,
  })),
  IndicatorSendError: class IndicatorSendError extends Error {},
}));

import ToolsScreen from '../ToolsScreen';

beforeEach(() => {
  jest.clearAllMocks();
  connectionStateListener = null;
  mockSendRgb.mockResolvedValue();
  mockSendText.mockResolvedValue();
  mockSendFlash.mockResolvedValue();
  mockSendClear.mockResolvedValue();
});

function renderTools(): ReactTestRenderer.ReactTestRenderer {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  act(() => {
    renderer = ReactTestRenderer.create(<ToolsScreen />);
  });

  return renderer as ReactTestRenderer.ReactTestRenderer;
}

test('renders four byte-range RGB controls and the expected colour', () => {
  const renderer = renderTools();

  for (const label of ['Red', 'Green', 'Blue', 'Brightness']) {
    const slider = renderer.root.findByProps({
      accessibilityLabel: `${label} slider`,
    });

    expect(slider.props.minimumValue).toBe(0);
    expect(slider.props.maximumValue).toBe(255);
    expect(slider.props.step).toBe(1);
  }

  const preview = renderer.root.findByProps({
    accessibilityLabel: 'Expected colour',
  });
  expect(preview.props.style).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ backgroundColor: 'rgb(255, 0, 0)' }),
    ]),
  );
});

test('updates the preview and sends the selected four-byte value', async () => {
  const renderer = renderTools();

  act(() =>
    renderer.root
      .findByProps({ accessibilityLabel: 'Green slider' })
      .props.onValueChange(128),
  );
  act(() =>
    renderer.root
      .findByProps({ accessibilityLabel: 'Brightness slider' })
      .props.onValueChange(128),
  );

  const preview = renderer.root.findByProps({
    accessibilityLabel: 'Expected colour',
  });
  expect(preview.props.style).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ backgroundColor: 'rgb(128, 64, 0)' }),
    ]),
  );

  await act(async () => {
    await renderer.root.findByProps({ title: 'Send RGB' }).props.onPress();
  });

  expect(mockSendRgb).toHaveBeenCalledWith({
    red: 255,
    green: 128,
    blue: 0,
    brightness: 128,
  });
});

test('sends text entered in the text tool', async () => {
  const renderer = renderTools();

  act(() =>
    renderer.root
      .findByProps({ accessibilityLabel: 'Indicator text' })
      .props.onChangeText('Watch behind'),
  );
  await act(async () => {
    await renderer.root.findByProps({ title: 'Send text' }).props.onPress();
  });

  expect(mockSendText).toHaveBeenCalledWith('Watch behind');
});

test('sends the selected flash duration and intensity', async () => {
  const renderer = renderTools();

  act(() =>
    renderer.root
      .findByProps({ accessibilityLabel: 'Duration (ms) slider' })
      .props.onValueChange(2400),
  );
  act(() =>
    renderer.root
      .findByProps({ accessibilityLabel: 'Intensity slider' })
      .props.onValueChange(128),
  );
  await act(async () => {
    await renderer.root.findByProps({ title: 'Flash' }).props.onPress();
  });

  expect(mockSendFlash).toHaveBeenCalledWith(2400, 128);
});

test('sends the clear-screen command', async () => {
  const renderer = renderTools();

  await act(async () => {
    await renderer.root.findByProps({ title: 'Clear' }).props.onPress();
  });

  expect(mockSendClear).toHaveBeenCalledTimes(1);
});

test('shows Bluetooth connection changes', () => {
  const renderer = renderTools();

  expect(
    renderer.root.findByProps({
      accessibilityLabel: 'Bluetooth status: Disconnected',
    }),
  ).toBeDefined();

  act(() => connectionStateListener?.('connected'));

  expect(
    renderer.root.findByProps({
      accessibilityLabel: 'Bluetooth status: Connected',
    }),
  ).toBeDefined();
});

test('destroys the Bluetooth sender when the tools screen closes', () => {
  const renderer = renderTools();

  act(() => renderer.unmount());

  expect(mockDestroy).toHaveBeenCalledTimes(1);
  expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
});
