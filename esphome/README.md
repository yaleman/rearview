# Rearview indicator firmware

This directory contains ESPHome firmware for a small BLE-controlled indicator.
It runs on an ESP32-C3, accepts a four-byte colour command over a custom GATT
service, and maps that command to a 72 x 40 SSD1306 OLED.

The Rearview app implements the client in `bluetoothRgb.ts` and exposes it on the
Tools screen. It scans for the advertised service and device name, connects,
discovers the GATT table, and writes the slider values with a response.
The iOS simulator can render that UI but cannot discover or write to this BLE
device, so client integration must be tested on a physical iPhone.

## Hardware

The configuration targets `esp32-c3-devkitm-1` using the ESP-IDF framework.
The display is an SSD1306-compatible 72 x 40 monochrome OLED at I2C address
`0x3C`.

| OLED signal | ESP32-C3 pin |
| ----------- | ------------ |
| SDA         | GPIO5        |
| SCL         | GPIO6        |

Connect ground between the board and display, and power the display according
to the voltage requirements of the specific module. The firmware scans the I2C
bus during startup, which makes the detected address visible in serial logs.

## Firmware structure

`rearview-indicator.yaml` assembles the firmware:

- `esp32_ble` configures the Bluetooth device, pairing, bonding, and connection
  limit;
- the local `components/esp32_ble_server/` external component builds the GATT
  server, advertised services, characteristics, descriptors, and write
  automations on top of ESP-IDF;
- `i2c` and `ssd1306_i2c` drive the display without a periodic refresh; and
- the characteristic's `on_write` lambda validates and applies each command.

The OLED is turned off after boot. A valid non-zero command turns it on and
fills the framebuffer; an effective zero colour clears it and turns it off.
Because this display is monochrome, the current output is an all-on or all-off
panel. The RGB and brightness fields remain in the protocol, but the firmware
does not render distinct colours or brightness levels on this hardware.

There is no Wi-Fi, ESPHome native API, web server, or OTA configuration. Runtime
access is BLE, with serial logging available during development.

## Build and flash

Run ESPHome through `uvx` so it remains an isolated, package-managed tool. These
commands pin the version against which this configuration was last compiled:

```sh
cd esphome
uvx --from esphome==2026.7.4 esphome config rearview-indicator.yaml
uvx --from esphome==2026.7.4 esphome compile rearview-indicator.yaml
```

To compile and flash over USB, replace the example serial device with the board's
actual device:

```sh
uvx --from esphome==2026.7.4 esphome run rearview-indicator.yaml \
  --device /dev/cu.usbmodem-example
```

The ignored `.esphome/` directory contains generated build and validation state.
Do not commit it.

## BLE protocol

### Transport and security

| Field                  | Value                             |
| ---------------------- | --------------------------------- |
| Advertised device name | `Rearview Light`                  |
| Transport              | Bluetooth Low Energy GATT         |
| Connections            | One client maximum                |
| Pairing mode           | Secure Connections, MITM, bonding |
| I/O capability         | Display only                      |
| Static passkey         | `123456`                          |
| Encryption key size    | 16 bytes                          |

The static passkey is configured after the Bluetooth stack becomes ready. A
client must pair using `123456`; successful pairing may be retained through BLE
bonding. Treat the passkey as device access control, not as a secret unique to an
installation. When the ESP-IDF Bluetooth stack requests passkey display, the
firmware shows the actual six-digit value across the OLED and logs it as
`BLE pairing passkey: 123456` through the ESPHome logger. Once authentication
finishes, the OLED returns to the most recent RGB command, or turns off if no
command has been received.

### GATT service

| Item                       | UUID                                   | Properties |
| -------------------------- | -------------------------------------- | ---------- |
| Rearview indicator service | `898a0c20-6d38-4a49-9f84-f942b4cd9380` | Advertised |
| Colour characteristic      | `898a0c21-6d38-4a49-9f84-f942b4cd9380` | Write      |

The colour characteristic also exposes the standard Characteristic User
Description descriptor (`0x2901`) with the text `RGB colour and brightness`.
The local BLE component adds the standard Device Information service (`0x180A`)
with readable manufacturer (`Rearview`), model (`RGB Indicator`), and ESPHome
firmware-version characteristics.

### Colour command

Write exactly four bytes to the colour characteristic:

| Offset | Name       | Range | Meaning                             |
| ------ | ---------- | ----- | ----------------------------------- |
| 0      | Red        | 0-255 | Red channel intensity               |
| 1      | Green      | 0-255 | Green channel intensity             |
| 2      | Blue       | 0-255 | Blue channel intensity              |
| 3      | Brightness | 0-255 | Scale applied to all three channels |

The payload has no header, length field, version, checksum, or byte-order
concern: each field is a single unsigned byte. For example, the byte sequence
`ff 00 00 80` requests red at approximately half brightness. On the current
monochrome OLED this produces a filled, on display rather than visible red.

An effective colour of zero turns the display off. That includes `00 00 00 xx`,
`xx xx xx 00`, and any values whose scaled channels all become zero. Other valid
commands turn the display on and fill it.

Writes of any length other than four bytes are ignored and logged as a warning.
There is no application-level acknowledgement, readable current-state
characteristic, notification, or indication. The client should treat a
successful GATT write as transport completion only. A disconnect does not clear
the last displayed state; rebooting does, because the boot automation turns the
OLED off.

### Client sequence

1. Scan for `Rearview Light` or the advertised service UUID.
2. Connect and pair with passkey `123456` if the operating system requests it.
3. Discover service `898a0c20-6d38-4a49-9f84-f942b4cd9380`.
4. Write a four-byte value to characteristic
   `898a0c21-6d38-4a49-9f84-f942b4cd9380`.
5. Keep the connection or disconnect; the indicator retains the last command
   until another valid write or a reboot.
