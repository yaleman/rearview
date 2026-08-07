import {
  BleManager,
  State,
  type Device,
  type Subscription,
} from 'react-native-ble-plx';

export const REARVIEW_DEVICE_NAME = 'Rearview Light';
export const REARVIEW_RGB_SERVICE_UUID = '898a0c20-6d38-4a49-9f84-f942b4cd9380';
export const REARVIEW_RGB_CHARACTERISTIC_UUID =
  '898a0c21-6d38-4a49-9f84-f942b4cd9380';

const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const SCAN_TIMEOUT_MS = 10_000;

export type RgbValue = {
  red: number;
  green: number;
  blue: number;
  brightness: number;
};

export enum RgbSendErrorKind {
  PermissionDenied = 'permission_denied',
  BluetoothUnavailable = 'bluetooth_unavailable',
  DeviceNotFound = 'device_not_found',
  ConnectionFailed = 'connection_failed',
  WriteFailed = 'write_failed',
}

export class RgbSendError extends Error {
  readonly cause?: unknown;

  constructor(
    readonly kind: RgbSendErrorKind,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message);
    this.name = 'RgbSendError';
    this.cause = options?.cause;
  }
}

function validatedChannel(name: string, value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new RangeError(`${name} must be an integer from 0 to 255`);
  }

  return value;
}

export function encodeRgbPayload(value: RgbValue): string {
  const bytes = [
    validatedChannel('red', value.red),
    validatedChannel('green', value.green),
    validatedChannel('blue', value.blue),
    validatedChannel('brightness', value.brightness),
  ];

  return [
    BASE64_ALPHABET[Math.floor(bytes[0] / 4)],
    BASE64_ALPHABET[(bytes[0] % 4) * 16 + Math.floor(bytes[1] / 16)],
    BASE64_ALPHABET[(bytes[1] % 16) * 4 + Math.floor(bytes[2] / 64)],
    BASE64_ALPHABET[bytes[2] % 64],
    BASE64_ALPHABET[Math.floor(bytes[3] / 4)],
    BASE64_ALPHABET[(bytes[3] % 4) * 16],
    '=',
    '=',
  ].join('');
}

function unavailableStateError(state: State): RgbSendError | null {
  switch (state) {
    case State.Unauthorized:
      return new RgbSendError(
        RgbSendErrorKind.PermissionDenied,
        'Bluetooth access is not authorised',
      );
    case State.PoweredOff:
      return new RgbSendError(
        RgbSendErrorKind.BluetoothUnavailable,
        'Bluetooth is turned off',
      );
    case State.Unsupported:
      return new RgbSendError(
        RgbSendErrorKind.BluetoothUnavailable,
        'Bluetooth Low Energy is not supported on this device',
      );
    default:
      return null;
  }
}

export class BluetoothRgbSender {
  private readonly manager = new BleManager();
  private device: Device | null = null;

  async send(value: RgbValue): Promise<void> {
    await this.waitForBluetooth();
    const device = await this.connectedDevice();

    try {
      await device.writeCharacteristicWithResponseForService(
        REARVIEW_RGB_SERVICE_UUID,
        REARVIEW_RGB_CHARACTERISTIC_UUID,
        encodeRgbPayload(value),
      );
    } catch (error) {
      throw new RgbSendError(
        RgbSendErrorKind.WriteFailed,
        'Could not write the RGB value to Rearview Light',
        { cause: error },
      );
    }
  }

  destroy(): void {
    this.manager.stopDeviceScan();
    this.manager.destroy();
    this.device = null;
  }

  private async waitForBluetooth(): Promise<void> {
    const currentState = await this.manager.state();

    if (currentState === State.PoweredOn) {
      return;
    }

    const unavailableError = unavailableStateError(currentState);
    if (unavailableError !== null) {
      throw unavailableError;
    }

    await new Promise<void>((resolve, reject) => {
      let subscription: Subscription | null = null;
      const timeout = setTimeout(() => {
        subscription?.remove();
        reject(
          new RgbSendError(
            RgbSendErrorKind.BluetoothUnavailable,
            'Bluetooth did not become ready',
          ),
        );
      }, SCAN_TIMEOUT_MS);

      subscription = this.manager.onStateChange(state => {
        if (state === State.PoweredOn) {
          clearTimeout(timeout);
          subscription?.remove();
          resolve();
          return;
        }

        const stateError = unavailableStateError(state);
        if (stateError !== null) {
          clearTimeout(timeout);
          subscription?.remove();
          reject(stateError);
        }
      }, true);
    });
  }

  private async connectedDevice(): Promise<Device> {
    if (this.device !== null) {
      try {
        if (await this.device.isConnected()) {
          return this.device;
        }
      } catch {
        this.device = null;
      }
    }

    const discoveredDevice = await this.scanForDevice();

    try {
      const connectedDevice = await discoveredDevice.connect();
      this.device =
        await connectedDevice.discoverAllServicesAndCharacteristics();
      return this.device;
    } catch (error) {
      this.device = null;
      throw new RgbSendError(
        RgbSendErrorKind.ConnectionFailed,
        'Could not connect to Rearview Light',
        { cause: error },
      );
    }
  }

  private scanForDevice(): Promise<Device> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);
        this.manager.stopDeviceScan();
        callback();
      };
      const timeout = setTimeout(
        () =>
          finish(() =>
            reject(
              new RgbSendError(
                RgbSendErrorKind.DeviceNotFound,
                'Rearview Light was not found nearby',
              ),
            ),
          ),
        SCAN_TIMEOUT_MS,
      );

      this.manager.startDeviceScan(
        [REARVIEW_RGB_SERVICE_UUID],
        { allowDuplicates: false },
        (error, device) => {
          if (error !== null) {
            finish(() =>
              reject(
                new RgbSendError(
                  RgbSendErrorKind.ConnectionFailed,
                  'Bluetooth scanning failed',
                  { cause: error },
                ),
              ),
            );
            return;
          }

          if (device?.name === REARVIEW_DEVICE_NAME) {
            finish(() => resolve(device));
          }
        },
      );
    });
  }
}
