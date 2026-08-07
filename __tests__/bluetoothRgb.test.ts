jest.mock('react-native-ble-plx', () => ({
  BleManager: jest.fn(),
  State: {
    PoweredOn: 'PoweredOn',
    PoweredOff: 'PoweredOff',
    Unauthorized: 'Unauthorized',
    Unsupported: 'Unsupported',
  },
}));

import {
  encodeClearPayload,
  encodeFlashPayload,
  encodeRgbPayload,
  encodeTextPayload,
} from '../bluetoothRgb';

test('encodes RGB values with the RGB command opcode', () => {
  expect(
    encodeRgbPayload({
      red: 255,
      green: 128,
      blue: 1,
      brightness: 64,
    }),
  ).toBe('Af+AAUA=');
});

test('encodes UTF-8 text with the text opcode', () => {
  expect(encodeTextPayload('Go!')).toBe('AkdvIQ==');
  expect(encodeTextPayload('café')).toBe('AmNhZsOp');
});

test('encodes flash duration as little-endian milliseconds', () => {
  expect(encodeFlashPayload(1000, 128)).toBe('A+gDgA==');
});

test('encodes the clear-screen opcode', () => {
  expect(encodeClearPayload()).toBe('BA==');
});

test('rejects RGB channels outside the byte range', () => {
  expect(() =>
    encodeRgbPayload({ red: 256, green: 0, blue: 0, brightness: 255 }),
  ).toThrow('red must be an integer from 0 to 255');
});

test('rejects empty text and out-of-range flash values', () => {
  expect(() => encodeTextPayload('')).toThrow('text must not be empty');
  expect(() => encodeFlashPayload(0, 255)).toThrow(
    'duration must be an integer from 1 to 60000 ms',
  );
  expect(() => encodeFlashPayload(1000, 256)).toThrow(
    'intensity must be an integer from 0 to 255',
  );
});
