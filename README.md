# Rearview

Rearview is a React Native app that uses a compact vision-language model to
describe what the device's rear camera can see. Image preparation and inference
run locally on the device; the app does not need a hosted inference service.

The app can:

- analyse a photo selected from the library;
- continuously capture and analyse frames from the rear camera;
- use an editable prompt that is saved in the app's documents directory;
- show the prepared image, generated description, and inference time; and
- expose detailed llama.cpp timings when diagnostics are expanded; and
- send RGB and brightness commands to the companion indicator over BLE.

Rearview currently targets iOS.

## How it works

`App.tsx` owns the screen and analysis state. Library photos and camera captures
both pass through `imageAnalysis.ts`, which resizes them to a JPEG no larger than
256 x 256 before inference. `rearview.ts` loads the bundled SmolVLM model and
vision projector through `llama.rn`, then submits the image with the current
prompt. Continuous camera captures are serialized so a new frame is not taken
while the previous frame is being processed. The Tools screen uses
`bluetoothRgb.ts` to discover the companion indicator, connect, and write the
selected RGB and brightness values.

All model inference is local. Selected and captured images are prepared in a
temporary file, and superseded temporary images are removed by the app.

## Set up the app

You need Node.js 22.11 or newer, `pnpm`, the React Native iOS prerequisites,
Xcode, and CocoaPods.

Install the JavaScript and iOS dependencies, then download the checksum-verified
model files:

```sh
pnpm install
bundle install
bundle exec pod install --project-directory=ios
mise run models
```

The model files are downloaded into the ignored `models/` directory and bundled
into the iOS app by the Xcode project.

Start Metro and launch the development build in separate terminals:

```sh
pnpm start
```

```sh
pnpm ios
```

Camera analysis requires a device or simulator with an available rear camera.
Photo-library analysis can still be used independently.

## Deploy to a physical iPhone

Copy `.envrc.example` to the ignored `.envrc` file and set
`REARVIEW_DEVICE_ID` and `REARVIEW_DEVELOPMENT_TEAM` from the local Xcode and
device configuration. Then build, install, and launch a signed Release build:

```sh
mise run device
```

The individual stages are also available as `mise run device:build`,
`mise run device:install`, and `mise run device:launch`.

## Use Rearview

Wait for the status to report that the model is ready. Edit and optionally save
the prompt, then either choose a photo or start the continuous camera. During
continuous monitoring the app keeps only one inference in flight and replaces
the displayed result when the next analysis completes.

The generated text is deliberately short: inference is currently limited to 12
predicted tokens to keep the monitoring loop responsive on a phone.

## Companion indicator

`esphome/` contains firmware for an ESP32-C3 and SSD1306 OLED that exposes a
small BLE colour-and-brightness protocol. Open the app's Tools screen, adjust the
four channel sliders, and tap **Send** to discover `Rearview Light` and write the
command. The first connection may prompt for the indicator's BLE passkey. Its
hardware layout, build instructions, security settings, and wire protocol are
documented in [`esphome/README.md`](esphome/README.md).

## Development checks

Run the repository checks before submitting changes:

```sh
pnpm test
pnpm lint
pnpm exec tsc --noEmit
```

The focused tests cover model initialization, prompt persistence, image
preparation, image-picker behavior, camera permission failures, and serialized
continuous capture.

## Project layout

| Path | Purpose |
| --- | --- |
| `App.tsx` | Main screen, saved prompt, library picker, and displayed results |
| `LiveCameraScanner.tsx` | Rear-camera permission, capture, and continuous analysis loop |
| `imageAnalysis.ts` | Image resize, temporary-file cleanup, and inference handoff |
| `rearview.ts` | Bundled model initialization, prompt storage, and multimodal inference |
| `ToolsScreen.tsx` | Companion-indicator controls and send status |
| `bluetoothRgb.ts` | BLE discovery, connection, payload encoding, and writes |
| `__tests__/` | Jest unit and component tests |
| `models/` | Downloaded GGUF model and projector files; ignored by Git |
| `scripts/` | Model download and signed iOS device deployment |
| `esphome/` | BLE indicator firmware and protocol documentation |
