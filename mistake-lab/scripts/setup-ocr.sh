#!/usr/bin/env bash
set -euo pipefail
command -v tesseract >/dev/null || { echo '请先安装 Tesseract 5（Ubuntu: sudo apt-get install tesseract-ocr）。'; exit 1; }
ocr_data_dir="${MISTAKE_LAB_OCR_DATA:-/workspace/.environment-tools/mistake-lab-ocr/tessdata}"
mkdir -p "$ocr_data_dir"
cd "$ocr_data_dir"
for language in chi_sim eng; do
  if [ ! -f "$language.traineddata" ]; then
    curl --fail --location --show-error "https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/87416418657359cb625c412a48b6e1d6d41c29bd/$language.traineddata" --output "$language.traineddata.download"
    mv "$language.traineddata.download" "$language.traineddata"
  fi
done
printf '%s\n' 'a5fcb6f0db1e1d6d8522f39db4e848f05984669172e584e8d76b6b3141e1f730  chi_sim.traineddata' '7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2  eng.traineddata' | sha256sum --check
tesseract --tessdata-dir "$ocr_data_dir" --list-langs
