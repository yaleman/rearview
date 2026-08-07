jest.mock('react-native-ble-plx', () => ({
  BleManager: jest.fn(),
  State: {
    PoweredOn: 'PoweredOn',
    PoweredOff: 'PoweredOff',
    Unauthorized: 'Unauthorized',
    Unsupported: 'Unsupported',
  },
}));

import { encodeRgbPayload } from '../bluetoothRgb';

test('encodes RGBA values as the four-byte Bluetooth payload', () => {
  expect(
    encodeRgbPayload({
      red: 255,
      green: 128,
      blue: 1,
      brightness: 64,
    }),
  ).toBe('/4ABQA==');
});

test('rejects RGB channels outside the byte range', () => {
  expect(() =>
    encodeRgbPayload({ red: 256, green: 0, blue: 0, brightness: 255 }),
  ).toThrow('red must be an integer from 0 to 255');
});
