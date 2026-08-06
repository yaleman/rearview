#!/bin/bash
set -euo pipefail

: "${REARVIEW_DEVICE_ID:?Set REARVIEW_DEVICE_ID in .envrc}"
: "${REARVIEW_DEVELOPMENT_TEAM:?Set REARVIEW_DEVELOPMENT_TEAM in .envrc}"

project_root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
derived_data="$project_root/.build/device-release"
app_path="$derived_data/Build/Products/Release-iphoneos/rearview.app"
bundle_id="com.yaleman.rearview"
action="${1:-}"

redact() {
  sed \
    -e "s/$REARVIEW_DEVICE_ID/<device>/g" \
    -e "s/$REARVIEW_DEVELOPMENT_TEAM/<team>/g"
}

build() {
  echo "Building signed Release app"
  xcodebuild \
    -quiet \
    -workspace "$project_root/ios/rearview.xcworkspace" \
    -scheme rearview \
    -configuration Release \
    -destination "platform=iOS,id=$REARVIEW_DEVICE_ID" \
    -derivedDataPath "$derived_data" \
    -allowProvisioningUpdates \
    CODE_SIGN_STYLE=Automatic \
    DEVELOPMENT_TEAM="$REARVIEW_DEVELOPMENT_TEAM" \
    build 2>&1 | redact

  if [[ ! -d "$app_path" ]]; then
    echo "Expected app artifact was not produced" >&2
    return 1
  fi

  local actual_bundle_id
  actual_bundle_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app_path/Info.plist")"

  if [[ "$actual_bundle_id" != "$bundle_id" ]]; then
    echo "Built app has unexpected bundle identifier: $actual_bundle_id" >&2
    return 1
  fi

  echo "Built and verified $bundle_id"
}

require_app() {
  if [[ ! -d "$app_path" ]]; then
    echo "No Release app found; run mise run device:build first" >&2
    return 1
  fi
}

install() {
  require_app
  echo "Installing $bundle_id"
  xcrun devicectl device install app \
    --device "$REARVIEW_DEVICE_ID" \
    "$app_path" 2>&1 | redact
}

launch() {
  echo "Launching $bundle_id"
  xcrun devicectl device process launch \
    --device "$REARVIEW_DEVICE_ID" \
    "$bundle_id" 2>&1 | redact
}

case "$action" in
  build)
    build
    ;;
  install)
    install
    ;;
  launch)
    launch
    ;;
  deploy)
    build
    install
    launch
    ;;
  *)
    echo "Usage: $0 {build|install|launch|deploy}" >&2
    exit 2
    ;;
esac
