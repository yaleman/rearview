#!/bin/zsh

set -euo pipefail

readonly script_dir="${0:A:h}"
typeset test_directory
test_directory="$(mktemp -d "${TMPDIR:-/tmp}/rearview-testflight-options.XXXXXX")"
readonly test_directory
trap 'rm -rf "$test_directory"' EXIT

readonly options_path="$test_directory/ExportOptions.plist"
REARVIEW_DEVELOPMENT_TEAM=ABCDE12345 "$script_dir/create-testflight-export-options.sh" \
  "$options_path" \
  com.example.rearview \
  upload

[[ "$(plutil -extract destination raw "$options_path")" == upload ]]
[[ "$(plutil -extract distributionBundleIdentifier raw "$options_path")" == com.example.rearview ]]
[[ "$(plutil -extract manageAppVersionAndBuildNumber raw "$options_path")" == false ]]
[[ "$(plutil -extract method raw "$options_path")" == app-store-connect ]]
[[ "$(plutil -extract signingStyle raw "$options_path")" == automatic ]]
[[ "$(plutil -extract teamID raw "$options_path")" == ABCDE12345 ]]
[[ "$(plutil -extract testFlightInternalTestingOnly raw "$options_path")" == true ]]
[[ "$(plutil -extract uploadSymbols raw "$options_path")" == true ]]

typeset key_count
key_count="$(plutil -convert json -o - "$options_path" | python3 -c 'import json, sys; print(len(json.load(sys.stdin)))')"
readonly key_count
[[ "$key_count" == 8 ]]

if REARVIEW_DEVELOPMENT_TEAM=invalid "$script_dir/create-testflight-export-options.sh" \
  "$test_directory/invalid-team.plist" \
  com.example.rearview \
  upload >/dev/null 2>&1; then
  print -u2 "Invalid team identifier unexpectedly passed"
  exit 1
fi

if REARVIEW_DEVELOPMENT_TEAM=ABCDE12345 "$script_dir/create-testflight-export-options.sh" \
  "$test_directory/invalid-bundle.plist" \
  'com.example.$(id)' \
  upload >/dev/null 2>&1; then
  print -u2 "Invalid bundle identifier unexpectedly passed"
  exit 1
fi

readonly local_options_path="$test_directory/LocalExportOptions.plist"
REARVIEW_DEVELOPMENT_TEAM=ABCDE12345 "$script_dir/create-testflight-export-options.sh" \
  "$local_options_path" \
  com.example.rearview \
  export
[[ "$(plutil -extract destination raw "$local_options_path")" == export ]]

if REARVIEW_DEVELOPMENT_TEAM=ABCDE12345 "$script_dir/create-testflight-export-options.sh" \
  "$test_directory/invalid-destination.plist" \
  com.example.rearview \
  invalid >/dev/null 2>&1; then
  print -u2 "Invalid export destination unexpectedly passed"
  exit 1
fi

if env -u REARVIEW_DEVELOPMENT_TEAM "$script_dir/create-testflight-export-options.sh" \
  "$test_directory/missing-team.plist" \
  com.example.rearview \
  upload >/dev/null 2>&1; then
  print -u2 "Missing development team unexpectedly passed"
  exit 1
fi

print "TestFlight export-options validation passed."
