# Rearview indicator firmware

This directory contains ESPHome firmware for a small BLE-controlled indicator.
It runs on an ESP32-C3, accepts typed RGB, text, and flash commands over a custom
GATT service, and maps those commands to a 72 x 40 SSD1306 OLED.

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
The bus runs at standard-mode 100 kHz so a complete OLED framebuffer write stays
below ESPHome's fixed 50 ms script blocking-warning threshold; the previous
50 kHz default took about 76 ms per update.

## Firmware structure

`rearview-indicator.yaml` assembles the firmware:

- `esp32_ble` configures the Bluetooth device, pairing, bonding, and connection
  limit;
- the `esp32_ble_server` external component from
  `github.com/yaleman/esphome-components` builds the GATT server, advertised
  services, characteristics, descriptors, and write automations on top of
  ESP-IDF;
- `i2c` and `ssd1306_i2c` drive the display without a periodic refresh; and
- the characteristic's `on_write` lambda validates and applies each command.

The OLED is turned off after boot. After a valid command, its top half shows a
dithered greyscale preview calculated as `max(red, green, blue) * brightness /
255`, and its bottom half shows the requested RGB bytes as six hexadecimal
digits. Because the SSD1306 is physically one-bit, the preview uses a 4 x 4
ordered-dither pattern rather than true greyscale pixels.

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

To watch the INFO-level BLE and RGB diagnostics without rebuilding, keep the
board connected over USB and run:

```sh
uvx --from esphome==2026.7.4 esphome logs rearview-indicator.yaml \
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
finishes, the OLED returns to the most recent RGB or text command, or turns off
if no persistent command has been received.

### GATT service

| Item                       | UUID                                   | Properties |
| -------------------------- | -------------------------------------- | ---------- |
| Rearview indicator service | `898a0c20-6d38-4a49-9f84-f942b4cd9380` | Advertised |
| Command characteristic     | `898a0c21-6d38-4a49-9f84-f942b4cd9380` | Write      |

The command characteristic also exposes the standard Characteristic User
Description descriptor (`0x2901`) with the text `Indicator command`.
The local BLE component adds the standard Device Information service (`0x180A`)
with readable manufacturer (`Rearview`), model (`RGB Indicator`), and ESPHome
firmware-version characteristics.

### Command protocol

Every write starts with a one-byte opcode:

| Opcode | Command | Remaining payload                                |
| ------ | ------- | ------------------------------------------------ |
| `01`   | RGB     | Red, green, blue, brightness                     |
| `02`   | Text    | 1-120 bytes of UTF-8 text                        |
| `03`   | Flash   | Duration low byte, duration high byte, intensity |
| `04`   | Clear   | No remaining payload                             |

An RGB command is exactly five bytes. For example, `01 ff 00 00 80` requests red
at approximately half brightness. The top half of the monochrome OLED shows the
result as ordered-dithered intensity, while the bottom half shows `FF0000`.

A text command is the `02` opcode followed by UTF-8 text. The firmware measures
and wraps characters across up to four lines using the bundled 9-pixel font.
Glyphs outside the configured font set cannot be rendered even though the
transport remains UTF-8.

A flash command is exactly four bytes. Duration is an unsigned 16-bit
little-endian phase length from 1 to 60000 ms, and intensity is 0-255. For
example, `03 e8 03 80` repeatedly displays a full white framebuffer at half
contrast for 1000 ms, then turns it off for 1000 ms. Flashing continues until a
new RGB, text, flash, or clear command replaces it.

A clear command is the single byte `04`. It cancels active flashing, clears the
framebuffer, resets display contrast, and turns the OLED off.

Unknown opcodes, invalid lengths, empty text, and invalid flash phases are
ignored and logged as warnings. At INFO level, the serial console logs BLE
connections and disconnections, security requests, passkey notifications, GATT
write metadata, decoded command fields, and display actions. These events
distinguish a completed iPhone-side write from a write that actually reached the
firmware.
There is no application-level acknowledgement, readable current-state
characteristic, notification, or indication. The client should treat a
successful GATT write as transport completion only. A disconnect does not alter
the active display or flash timer; rebooting turns the OLED off.

### Client sequence

1. Scan for `Rearview Light` or the advertised service UUID.
2. Connect and pair with passkey `123456` if the operating system requests it.
3. Discover service `898a0c20-6d38-4a49-9f84-f942b4cd9380`.
4. Write an opcode-prefixed command to characteristic
   `898a0c21-6d38-4a49-9f84-f942b4cd9380`.
5. Keep the connection or disconnect. RGB and text remain displayed, and flash
   keeps repeating, until another command or reboot.
