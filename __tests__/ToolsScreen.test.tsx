import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

const mockSend = jest.fn<Promise<void>, [unknown]>();
const mockDestroy = jest.fn();

jest.mock('@react-native-community/slider', () => {
  const ReactModule = require('react');

  return function MockSlider(props: object) {
    return ReactModule.createElement('Slider', props);
  };
});

jest.mock('../bluetoothRgb', () => ({
  BluetoothRgbSender: jest.fn().mockImplementation(() => ({
    destroy: mockDestroy,
    send: mockSend,
  })),
  RgbSendError: class RgbSendError extends Error {},
}));

import ToolsScreen from '../ToolsScreen';

beforeEach(() => {
  jest.clearAllMocks();
  mockSend.mockResolvedValue();
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
    await renderer.root.findByProps({ title: 'Send' }).props.onPress();
  });

  expect(mockSend).toHaveBeenCalledWith({
    red: 255,
    green: 128,
    blue: 0,
    brightness: 128,
  });
});

test('destroys the Bluetooth sender when the tools screen closes', () => {
  const renderer = renderTools();

  act(() => renderer.unmount());

  expect(mockDestroy).toHaveBeenCalledTimes(1);
});
