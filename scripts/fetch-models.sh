#!/bin/bash
set -euo pipefail

project_root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
model_dir="$project_root/models"
base_url="https://huggingface.co/ggml-org/SmolVLM-500M-Instruct-GGUF/resolve/main"

mkdir -p "$model_dir"

fetch_model() {
  local name="$1"
  local expected_sha256="$2"
  local destination="$model_dir/$name"
  local temporary="$destination.part"
  local actual_sha256

  if [[ -f "$destination" ]]; then
    actual_sha256="$(shasum -a 256 "$destination" | awk '{print $1}')"
    if [[ "$actual_sha256" == "$expected_sha256" ]]; then
      echo "Verified $name"
      return
    fi
  fi

  echo "Downloading $name"
  curl --fail --location --retry 3 --output "$temporary" "$base_url/$name"
  actual_sha256="$(shasum -a 256 "$temporary" | awk '{print $1}')"

  if [[ "$actual_sha256" != "$expected_sha256" ]]; then
    rm -f "$temporary"
    echo "Checksum verification failed for $name" >&2
    return 1
  fi

  mv "$temporary" "$destination"
  echo "Verified $name"
}

fetch_model \
  "SmolVLM-500M-Instruct-Q8_0.gguf" \
  "9d4612de6a42214499e301494a3ecc2be0abdd9de44e663bda63f1152fad1bf4"
fetch_model \
  "mmproj-SmolVLM-500M-Instruct-Q8_0.gguf" \
  "d1eb8b6b23979205fdf63703ed10f788131a3f812c7b1f72e0119d5d81295150"
