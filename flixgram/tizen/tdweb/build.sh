#!/bin/bash
# Builds tdweb (TDLib 1.8.36 compiled to WebAssembly + its JavaScript wrapper) for the Samsung TV app.
# The same TDLib version as the Android app. Output: a .tgz of tdweb's dist/ folder.
#   ./build.sh <output.tgz>        (needs: cmake, gperf, python3, Node 16 for tdweb's webpack 4)
set -euo pipefail
OUT=$(realpath -m "$1")
HERE=$(cd "$(dirname "$0")" && pwd)
TD_COMMIT=87d881071fe514936bb17029e96761141287d2be   # "Update version to 1.8.36."
EMSDK_VERSION=3.1.1                                  # the version TDLib's web build is known to work with
WORK=${WORK:-$PWD/tdweb-work}
mkdir -p "$WORK" && cd "$WORK"

if [ ! -d emsdk ]; then git clone -q https://github.com/emscripten-core/emsdk.git; fi
./emsdk/emsdk install $EMSDK_VERSION >/dev/null
./emsdk/emsdk activate $EMSDK_VERSION >/dev/null
# shellcheck disable=SC1091
source ./emsdk/emsdk_env.sh >/dev/null

if [ ! -d td ]; then
  git init -q td && git -C td remote add origin https://github.com/tdlib/td.git
  git -C td fetch -q --depth 1 origin $TD_COMMIT && git -C td checkout -q FETCH_HEAD
fi
cd td/example/web
./build-openssl.sh
mkdir -p build/generate build/wasm
TD_ROOT=$(realpath ../../)
OSSL=$(realpath ./build/crypto)
(cd build/generate && cmake -DTD_GENERATE_SOURCE_FILES=ON "$TD_ROOT" >/dev/null)
(cd build/wasm && emcmake cmake -DCMAKE_BUILD_TYPE=MinSizeRel -DOPENSSL_FOUND=1 -DOPENSSL_ROOT_DIR="$OSSL" \
  -DOPENSSL_INCLUDE_DIR="$OSSL/include" -DOPENSSL_CRYPTO_LIBRARY="$OSSL/lib/libcrypto.a" -DOPENSSL_SSL_LIBRARY="$OSSL/lib/libssl.a" \
  -DOPENSSL_LIBRARIES="$OSSL/lib/libssl.a;$OSSL/lib/libcrypto.a" -DOPENSSL_VERSION=1.1.0l "$TD_ROOT" >/dev/null)
echo "Generating TDLib sources..."
cmake --build build/generate -j "$(nproc)" >/dev/null
echo "Compiling TDLib to WebAssembly (this takes a while)..."
cmake --build build/wasm --target td_wasm -j "$(nproc)" 2>&1 | grep -vE '^\[ *[0-9]+%\]|warning' || true
test -f build/wasm/td_wasm.wasm
mkdir -p tdweb/src/prebuilt/release
cp build/wasm/td_wasm.js build/wasm/td_wasm.wasm tdweb/src/prebuilt/release/
node "$HERE/patch.mjs" tdweb/src
cd tdweb
npm ci --ignore-scripts --no-audit --no-fund >/dev/null 2>&1 || npm install --ignore-scripts --no-audit --no-fund
npx webpack --mode production
ls -la dist
tar czf "$OUT" -C dist .
echo "built $OUT"
