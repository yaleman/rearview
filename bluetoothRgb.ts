import {
  BleManager,
  State,
  type Device,
  type Subscription,
} from 'react-native-ble-plx';

export const REARVIEW_DEVICE_NAME = 'Rearview Light';
export const REARVIEW_INDICATOR_SERVICE_UUID =
  '898a0c20-6d38-4a49-9f84-f942b4cd9380';
export const REARVIEW_INDICATOR_CHARACTERISTIC_UUID =
  '898a0c21-6d38-4a49-9f84-f942b4cd9380';

const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const SCAN_TIMEOUT_MS = 10_000;
const RGB_COMMAND = 0x01;
const TEXT_COMMAND = 0x02;
const FLASH_COMMAND = 0x03;
const CLEAR_COMMAND = 0x04;
export const MAX_TEXT_BYTES = 120;

export type RgbValue = {
  red: number;
  green: number;
  blue: number;
  brightness: number;
};

export type BluetoothConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected';

type ConnectionStateListener = (state: BluetoothConnectionState) => void;

export enum IndicatorSendErrorKind {
  PermissionDenied = 'permission_denied',
  BluetoothUnavailable = 'bluetooth_unavailable',
  DeviceNotFound = 'device_not_found',
  ConnectionFailed = 'connection_failed',
  WriteFailed = 'write_failed',
}

export class IndicatorSendError extends Error {
  readonly cause?: unknown;

  constructor(
    readonly kind: IndicatorSendErrorKind,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message);
    this.name = 'IndicatorSendError';
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
    RGB_COMMAND,
    validatedChannel('red', value.red),
    validatedChannel('green', value.green),
    validatedChannel('blue', value.blue),
    validatedChannel('brightness', value.brightness),
  ];

  return bytesToBase64(bytes);
}

export function encodeTextPayload(text: string): string {
  const bytes = utf8Bytes(text);
  if (bytes.length === 0) {
    throw new RangeError('text must not be empty');
  }
  if (bytes.length > MAX_TEXT_BYTES) {
    throw new RangeError(`text must be at most ${MAX_TEXT_BYTES} UTF-8 bytes`);
  }

  return bytesToBase64([TEXT_COMMAND, ...bytes]);
}

export function encodeFlashPayload(
  durationMilliseconds: number,
  intensity: number,
): string {
  if (
    !Number.isInteger(durationMilliseconds) ||
    durationMilliseconds < 1 ||
    durationMilliseconds > 60_000
  ) {
    throw new RangeError('duration must be an integer from 1 to 60000 ms');
  }

  return bytesToBase64([
    FLASH_COMMAND,
    durationMilliseconds % 256,
    Math.floor(durationMilliseconds / 256),
    validatedChannel('intensity', intensity),
  ]);
}

export function encodeClearPayload(): string {
  return bytesToBase64([CLEAR_COMMAND]);
}

function bytesToBase64(bytes: number[]): string {
  let encoded = '';
  for (let offset = 0; offset < bytes.length; offset += 3) {
    const first = bytes[offset];
    const second = bytes[offset + 1];
    const third = bytes[offset + 2];

    encoded += BASE64_ALPHABET[Math.floor(first / 4)];
    encoded +=
      BASE64_ALPHABET[(first % 4) * 16 + Math.floor((second ?? 0) / 16)];
    encoded +=
      second === undefined
        ? '='
        : BASE64_ALPHABET[(second % 16) * 4 + Math.floor((third ?? 0) / 64)];
    encoded += third === undefined ? '=' : BASE64_ALPHABET[third % 64];
  }
  return encoded;
}

function utf8Bytes(text: string): number[] {
  const bytes: number[] = [];
  for (const character of text) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) {
      continue;
    }
    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      bytes.push(0xc0 + Math.floor(codePoint / 64), 0x80 + (codePoint % 64));
    } else if (codePoint <= 0xffff) {
      bytes.push(
        0xe0 + Math.floor(codePoint / 4096),
        0x80 + (Math.floor(codePoint / 64) % 64),
        0x80 + (codePoint % 64),
      );
    } else {
      bytes.push(
        0xf0 + Math.floor(codePoint / 262144),
        0x80 + (Math.floor(codePoint / 4096) % 64),
        0x80 + (Math.floor(codePoint / 64) % 64),
        0x80 + (codePoint % 64),
      );
    }
  }
  return bytes;
}

function unavailableStateError(state: State): IndicatorSendError | null {
  switch (state) {
    case State.Unauthorized:
      return new IndicatorSendError(
        IndicatorSendErrorKind.PermissionDenied,
        'Bluetooth access is not authorised',
      );
    case State.PoweredOff:
      return new IndicatorSendError(
        IndicatorSendErrorKind.BluetoothUnavailable,
        'Bluetooth is turned off',
      );
    case State.Unsupported:
      return new IndicatorSendError(
        IndicatorSendErrorKind.BluetoothUnavailable,
        'Bluetooth Low Energy is not supported on this device',
      );
    default:
      return null;
  }
}

export class BluetoothIndicatorClient {
  private readonly manager = new BleManager();
  private device: Device | null = null;
  private disconnectSubscription: Subscription | null = null;
  private connectionState: BluetoothConnectionState = 'disconnected';
  private readonly connectionStateListeners =
    new Set<ConnectionStateListener>();

  async sendRgb(value: RgbValue): Promise<void> {
    await this.write(encodeRgbPayload(value));
  }

  async sendText(value: string): Promise<void> {
    await this.write(encodeTextPayload(value));
  }

  async sendFlash(
    durationMilliseconds: number,
    intensity: number,
  ): Promise<void> {
    await this.write(encodeFlashPayload(durationMilliseconds, intensity));
  }

  async sendClear(): Promise<void> {
    await this.write(encodeClearPayload());
  }

  private async write(payload: string): Promise<void> {
    try {
      await this.waitForBluetooth();
    } catch (error) {
      this.setConnectionState('disconnected');
      throw error;
    }
    const device = await this.connectedDevice();

    try {
      await device.writeCharacteristicWithResponseForService(
        REARVIEW_INDICATOR_SERVICE_UUID,
        REARVIEW_INDICATOR_CHARACTERISTIC_UUID,
        payload,
      );
    } catch (error) {
      throw new IndicatorSendError(
        IndicatorSendErrorKind.WriteFailed,
        'Could not write the command to Rearview Light',
        { cause: error },
      );
    }
  }

  subscribeToConnectionState(listener: ConnectionStateListener): () => void {
    this.connectionStateListeners.add(listener);
    listener(this.connectionState);

    return () => this.connectionStateListeners.delete(listener);
  }

  destroy(): void {
    this.manager.stopDeviceScan();
    this.disconnectSubscription?.remove();
    this.disconnectSubscription = null;
    this.manager.destroy();
    this.device = null;
    this.connectionStateListeners.clear();
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
          new IndicatorSendError(
            IndicatorSendErrorKind.BluetoothUnavailable,
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
          this.setConnectionState('connected');
          return this.device;
        }
      } catch {
        this.device = null;
      }
    }

    this.setConnectionState('connecting');

    try {
      const discoveredDevice = await this.scanForDevice();
      const connectedDevice = await discoveredDevice.connect();
      this.device =
        await connectedDevice.discoverAllServicesAndCharacteristics();
      this.watchForDisconnect(this.device);
      this.setConnectionState('connected');
      return this.device;
    } catch (error) {
      this.device = null;
      this.setConnectionState('disconnected');
      throw new IndicatorSendError(
        IndicatorSendErrorKind.ConnectionFailed,
        'Could not connect to Rearview Light',
        { cause: error },
      );
    }
  }

  private watchForDisconnect(device: Device): void {
    this.disconnectSubscription?.remove();
    this.disconnectSubscription = this.manager.onDeviceDisconnected(
      device.id,
      () => {
        if (this.device?.id !== device.id) {
          return;
        }

        const subscription = this.disconnectSubscription;
        this.device = null;
        this.disconnectSubscription = null;
        subscription?.remove();
        this.setConnectionState('disconnected');
      },
    );
  }

  private setConnectionState(state: BluetoothConnectionState): void {
    if (state === this.connectionState) {
      return;
    }

    this.connectionState = state;
    for (const listener of this.connectionStateListeners) {
      listener(state);
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
              new IndicatorSendError(
                IndicatorSendErrorKind.DeviceNotFound,
                'Rearview Light was not found nearby',
              ),
            ),
          ),
        SCAN_TIMEOUT_MS,
      );

      this.manager.startDeviceScan(
        [REARVIEW_INDICATOR_SERVICE_UUID],
        { allowDuplicates: false },
        (error, device) => {
          if (error !== null) {
            finish(() =>
              reject(
                new IndicatorSendError(
                  IndicatorSendErrorKind.ConnectionFailed,
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
