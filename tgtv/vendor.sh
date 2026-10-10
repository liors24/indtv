#!/bin/sh
# Fetches the pinned source of the open-source libraries INDTV Telegram is built from (MIT/Apache licensed).
# Used both locally and in CI so what is tested is what ships.
set -e
cd "$(dirname "$0")"
mkdir -p vendor && cd vendor
get() { # name repo commit
  if [ ! -d "$1" ]; then git clone -q "https://github.com/$2" "$1"; fi
  git -C "$1" fetch -q --depth 1 origin "$3" 2>/dev/null || git -C "$1" fetch -q origin
  git -C "$1" checkout -q "$3"
}
get gramjs gram-js/gramjs 3dc2346fb15ee5a73a03bce3bd191e7d28c76f06
get BigInteger.js peterolson/BigInteger.js 441f6bd73cef6a5029dd5600f17e3dd79eafeddb
get async-mutex DirtyHairy/async-mutex b0bb4c5aa0e42eb5ffc8d9342e56bb6de1b95554
get real-cancellable-promise srmagura/real-cancellable-promise c806db0527d902140866a3801c765521765487db
get ts-custom-error adriengibrat/ts-custom-error 95701edde75d906fc98b239e27db7bbe9a603394
get pako nodeca/pako 32be8f8e0ead1e6e8a74a1586a34f84734382d01
get cryptography spalt08/cryptography 3809cc8c81e1f1157326a912cb08852bdad7a1e0
get buffer feross/buffer d02bd0a30d9b0bbd0189d5a7c424b0ab165fe5ab
get base64-js beatgammit/base64-js 303e81353e21339da09adb1e2fc0da74626bd8b2
get ieee754 feross/ieee754 8a0041f3d5e41b7cfcf0e0158fcf84b071709bda
get path-browserify browserify/path-browserify 872fec31a8bac7b9b43be0e54ef3037e0202c5fb
get qrcode-generator kazuhikoarase/qrcode-generator 83b7e8fe3fddd3b0368dbafd6ce56995bd25e3c8
