#!/bin/zsh

set -euo pipefail

if [[ "$#" -ne 3 ]]; then
  print -u2 "usage: $0 OUTPUT_PATH BUNDLE_ID DESTINATION"
  exit 64
fi

readonly output_path="$1"
readonly bundle_id="$2"
readonly destination="$3"
readonly development_team="${REARVIEW_DEVELOPMENT_TEAM:?Set REARVIEW_DEVELOPMENT_TEAM to the Apple team ID}"

if [[ ! "$development_team" =~ ^[A-Z0-9]{10}$ ]]; then
  print -u2 "Development team must be a ten-character Apple team identifier"
  exit 64
fi
if [[ ! "$bundle_id" =~ ^[A-Za-z0-9.-]+$ ]]; then
  print -u2 "Bundle identifier contains unsupported characters"
  exit 64
fi
if [[ "$destination" != export && "$destination" != upload ]]; then
  print -u2 "Destination must be export or upload"
  exit 64
fi

mkdir -p "${output_path:h}"
plutil -create xml1 "$output_path"
plutil -insert destination -string "$destination" "$output_path"
plutil -insert distributionBundleIdentifier -string "$bundle_id" "$output_path"
plutil -insert manageAppVersionAndBuildNumber -bool NO "$output_path"
plutil -insert method -string app-store-connect "$output_path"
plutil -insert signingStyle -string automatic "$output_path"
plutil -insert teamID -string "$development_team" "$output_path"
plutil -insert testFlightInternalTestingOnly -bool YES "$output_path"
plutil -insert uploadSymbols -bool YES "$output_path"
plutil -lint "$output_path"
