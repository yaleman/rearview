#!/bin/zsh

set -euo pipefail

readonly script_dir="${0:A:h}"
readonly repository_root="${script_dir:h}"
readonly workspace_path="$repository_root/ios/rearview.xcworkspace"
readonly development_team="${REARVIEW_DEVELOPMENT_TEAM:?Set REARVIEW_DEVELOPMENT_TEAM to the Apple team ID}"
readonly build_number="${REARVIEW_BUILD_NUMBER:-$(date -u '+%Y%m%d.%H%M.%S')}"

if [[ ! "$development_team" =~ ^[A-Z0-9]{10}$ ]]; then
  print -u2 "REARVIEW_DEVELOPMENT_TEAM must be a ten-character Apple team identifier"
  exit 64
fi
if [[ ! "$build_number" =~ ^[0-9]+([.][0-9]+){0,2}$ ]]; then
  print -u2 "REARVIEW_BUILD_NUMBER must contain one to three dot-separated integers"
  exit 64
fi

typeset build_settings
build_settings="$(
  xcodebuild \
    -workspace "$workspace_path" \
    -scheme rearview \
    -configuration Release \
    -showBuildSettings 2>/dev/null
)"
readonly build_settings
typeset version bundle_id
version="$(print -r -- "$build_settings" | awk -F ' = ' '/^[[:space:]]*MARKETING_VERSION = / { print $2; exit }')"
bundle_id="$(print -r -- "$build_settings" | awk -F ' = ' '/^[[:space:]]*PRODUCT_BUNDLE_IDENTIFIER = / { print $2; exit }')"
readonly version bundle_id

if [[ -z "$version" || -z "$bundle_id" ]]; then
  print -u2 "Could not read the app version and bundle identifier from Xcode"
  exit 1
fi

readonly relative_output_directory=".build/testflight-internal/${version}-${build_number}"
readonly output_directory="$repository_root/$relative_output_directory"
readonly archive_path="$output_directory/Rearview.xcarchive"
readonly export_options_path="$output_directory/ExportOptions.plist"
readonly local_export_options_path="$output_directory/LocalExportOptions.plist"
readonly archive_log_path="$output_directory/archive.log"
readonly local_export_log_path="$output_directory/local-export.log"
readonly delivery_log_path="$output_directory/delivery.log"
readonly report_plist_path="$output_directory/report.plist"
readonly report_path="$output_directory/report.json"

if [[ -e "$output_directory" ]]; then
  print -u2 "TestFlight output already exists for build $build_number"
  exit 1
fi
mkdir -p "$output_directory"

if security find-identity -v -p codesigning 2>/dev/null | grep -q '"Apple Distribution:'; then
  readonly distribution_identity_state="present"
else
  readonly distribution_identity_state="automatic-signing-required"
  print "No usable Apple Distribution identity is currently visible; Xcode will attempt to create or download one."
fi

"$script_dir/create-testflight-export-options.sh" \
  "$export_options_path" \
  "$bundle_id" \
  upload
"$script_dir/create-testflight-export-options.sh" \
  "$local_export_options_path" \
  "$bundle_id" \
  export

redact() {
  sed \
    -e "s/$development_team/<redacted-team>/g" \
    -e "s#$repository_root#.#g"
}

print "Archiving Rearview $version ($build_number)..."
xcodebuild \
  -quiet \
  -workspace "$workspace_path" \
  -scheme rearview \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$archive_path" \
  -allowProvisioningUpdates \
  CODE_SIGN_STYLE=Automatic \
  DEVELOPMENT_TEAM="$development_team" \
  CURRENT_PROJECT_VERSION="$build_number" \
  archive 2>&1 | redact | tee "$archive_log_path"

readonly app_info="$archive_path/Products/Applications/rearview.app/Info.plist"
if [[ ! -f "$app_info" ]]; then
  print -u2 "Archive did not contain the Rearview application"
  exit 1
fi
if [[ "$(plutil -extract CFBundleIdentifier raw "$app_info")" != "$bundle_id" \
  || "$(plutil -extract CFBundleShortVersionString raw "$app_info")" != "$version" \
  || "$(plutil -extract CFBundleVersion raw "$app_info")" != "$build_number" ]]; then
  print -u2 "Archive identity or version does not match the requested build"
  exit 1
fi

print "Exporting the distribution-signed IPA for inspection..."
xcodebuild \
  -quiet \
  -exportArchive \
  -archivePath "$archive_path" \
  -exportPath "$output_directory/export" \
  -exportOptionsPlist "$local_export_options_path" \
  -allowProvisioningUpdates 2>&1 | redact | tee "$local_export_log_path"

typeset -a exported_ipas
exported_ipas=("$output_directory/export"/*.ipa(N))
if [[ "${#exported_ipas[@]}" -ne 1 ]]; then
  print -u2 "App Store export did not produce exactly one IPA"
  exit 1
fi
readonly exported_ipa="${exported_ipas[1]}"
python3 "$script_dir/inspect-testflight-ipa.py" \
  --ipa "$exported_ipa" \
  --team "$development_team" \
  --bundle-id "$bundle_id" \
  --version "$version" \
  --build "$build_number"
typeset ipa_sha256
ipa_sha256="$(shasum -a 256 "$exported_ipa" | awk '{print $1}')"
readonly ipa_sha256
print "$ipa_sha256  export/${exported_ipa:t}" > "$output_directory/SHA256SUMS"

print "Uploading Rearview $version ($build_number) as TestFlight Internal Only..."
xcodebuild \
  -quiet \
  -exportArchive \
  -archivePath "$archive_path" \
  -exportPath "$output_directory/upload" \
  -exportOptionsPlist "$export_options_path" \
  -allowProvisioningUpdates 2>&1 | redact | tee "$delivery_log_path"
if ! grep -Fq "Upload succeeded." "$delivery_log_path"; then
  print -u2 "Xcode finished without confirming that the upload succeeded"
  exit 1
fi

typeset commit
commit="$(git -C "$repository_root" rev-parse HEAD)"
readonly commit
if [[ -n "$(git -C "$repository_root" status --short)" ]]; then
  readonly worktree_state="dirty"
else
  readonly worktree_state="clean"
fi
typeset uploaded_at
uploaded_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
readonly uploaded_at

plutil -create xml1 "$report_plist_path"
plutil -insert schemaVersion -integer 1 "$report_plist_path"
plutil -insert status -string uploaded "$report_plist_path"
plutil -insert processingStatus -string processing "$report_plist_path"
plutil -insert distribution -string testflight-internal-only "$report_plist_path"
plutil -insert version -string "$version" "$report_plist_path"
plutil -insert build -string "$build_number" "$report_plist_path"
plutil -insert bundleIdentifier -string "$bundle_id" "$report_plist_path"
plutil -insert gitCommit -string "$commit" "$report_plist_path"
plutil -insert worktreeState -string "$worktree_state" "$report_plist_path"
plutil -insert distributionIdentityPreflight -string "$distribution_identity_state" "$report_plist_path"
plutil -insert ipaSha256 -string "$ipa_sha256" "$report_plist_path"
plutil -insert uploadedAt -string "$uploaded_at" "$report_plist_path"
plutil -convert json -o "$report_path" "$report_plist_path"
rm "$report_plist_path"

print "TestFlight Internal Only upload completed for Rearview $version ($build_number)."
print "Local evidence: $relative_output_directory"
print "The build is uploaded but is not installable until App Store Connect finishes processing it."
