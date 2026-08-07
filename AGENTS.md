# Repository Guidelines

## Project Structure & Module Organization

`App.tsx` contains the main React Native screen. Continuous capture lives in `LiveCameraScanner.tsx`, image preparation in `imageAnalysis.ts`, and bundled-model initialization and inference in `rearview.ts`. The indicator controls live in `ToolsScreen.tsx`, with BLE discovery, connection, and protocol encoding in `bluetoothRgb.ts`. `index.js` is the application entry point. Jest tests live in `__tests__/` and use the `*.test.ts` or `*.test.tsx` suffix. Native projects and platform resources are under `ios/`. Device workflow scripts live in `scripts/`. Companion firmware is configured in `esphome/rearview-indicator.yaml`; its local BLE server component is under `esphome/components/`, and its hardware and protocol contract are documented in `esphome/README.md`.

Always update the README.md and AGENTS.md when there's something people or robots need to know.

## Build, Test, and Development Commands

Use Node.js 22.11 or newer and `pnpm` for JavaScript dependencies.

- `pnpm install` installs dependencies from `pnpm-lock.yaml`.
- `pnpm start` starts the Metro development server.
- `pnpm ios` builds and launches the iOS app.
- `pnpm test` runs the Jest suite.
- `pnpm lint` runs the React Native ESLint rules across the repository.
- `pnpm exec tsc --noEmit` performs a TypeScript type check without generating files.
- `mise models` downloads and checksum-verifies the bundled GGUF files.
- `mise device` builds, installs, and launches a signed Release build on the locally configured device.
- `cd esphome && uvx --from esphome==2026.7.4 esphome config rearview-indicator.yaml` validates the companion firmware configuration.

After changing iOS-native dependencies, run `pod install --project-directory=ios`.
Keep the React Native source-build overrides in `ios/Podfile`: the React Native
0.86.2 prebuilt framework does not export C++ symbols required by generated
components. Verify changes with a complete iOS link, not only `pod install`.

## Coding Style & Naming Conventions

Write TypeScript for application code. Follow the existing two-space indentation, single quotes, trailing commas, and omitted parentheses around single arrow-function parameters. Run `pnpm exec prettier --write <files>` for formatting. Use PascalCase for React components and types, camelCase for functions and variables, and UPPER_SNAKE_CASE for module constants. Keep asynchronous failures explicit, narrow `unknown` errors before reporting them, and avoid embedding model or filesystem logic in UI handlers.

## Testing Guidelines

Tests use Jest with `@react-native/jest-preset` and `react-test-renderer`. Add focused tests under `__tests__/`, named after the unit or screen (for example, `rearview.test.ts`). Cover camera permission and failure states, serialized scanning, resizing, model loading, and prompt persistence. Run tests, lint, and the TypeScript check before opening a pull request.

## Commit & Pull Request Guidelines

The current history uses short, lowercase subjects. Prefer concise imperative subjects that identify the change, such as `handle image picker cancellation`. Keep commits scoped and avoid committing generated build output, downloaded models, credentials, or local signing configuration. Pull requests should explain the user-visible behavior, list validation performed, link related issues, and include simulator or device screenshots for UI changes. Call out any native permission, dependency, or model-file changes explicitly.
