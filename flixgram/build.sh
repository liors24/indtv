#!/bin/bash
# Builds Flixgram.apk. Used by GitHub Actions (.github/workflows/build-flixgram.yml).
#   ANDROID_HOME   Android SDK (preinstalled on GitHub runners)
#   TDLIB_LIBS     folder with <abi>/libtdjson.so (cloned from itxmoizdev/handy-tdlib-next)
#   VER_CODE / VER_NAME
# Optional overrides for building without the SDK: AAPT2, ANDROID_JAR, DX_JAR (old dx instead of d8), APKSIGNER_CMD
set -euo pipefail
cd "$(dirname "$0")"
VER_CODE=${VER_CODE:-1}
VER_NAME=${VER_NAME:-1.0.$VER_CODE}
if [ -n "${ANDROID_HOME:-}" ] && [ -d "$ANDROID_HOME/build-tools" ]; then
  BT="$ANDROID_HOME/build-tools/$(ls "$ANDROID_HOME/build-tools" | sort -V | tail -n 1)"
  PLAT="$(ls -d "$ANDROID_HOME"/platforms/android-* | sort -V | tail -n 1)"
fi
AAPT2=${AAPT2:-$BT/aapt2}
ANDROID_JAR=${ANDROID_JAR:-$PLAT/android.jar}
APKSIGNER_CMD=${APKSIGNER_CMD:-"$BT/apksigner"}
echo "aapt2=$AAPT2 android.jar=$ANDROID_JAR"

node tools/webbuild.mjs prod
B=build/apk
rm -rf $B && mkdir -p $B/classes $B/flat $B/dex $B/pkg/lib
# 1. resources + manifest + web assets
"$AAPT2" compile --dir res -o $B/flat/
"$AAPT2" link -o $B/base.apk -I "$ANDROID_JAR" --manifest AndroidManifest.xml -A build/assets \
  --rename-manifest-package tv.flixgram.app --min-sdk-version 21 --target-sdk-version 34 \
  --version-code "$VER_CODE" --version-name "$VER_NAME" $B/flat/*.flat
# 2. code (Java 8 bytecode, no lambdas: works with d8 and the old dx)
# EXO_LIBS: folder of runtime jars for the video engine (Media3 ExoPlayer + deps), see deps/build.gradle
EXO_LIBS=${EXO_LIBS:-deps/build/jars}
LIBJARS=$(ls "$EXO_LIBS"/*.jar 2>/dev/null | tr '\n' ':')
[ -n "$LIBJARS" ] || { echo "missing video engine jars in $EXO_LIBS (run: gradle -p deps copyDeps)"; exit 1; }
javac -nowarn -encoding UTF-8 -source 8 -target 8 -bootclasspath "$ANDROID_JAR" -cp "$LIBJARS" -d $B/classes $(find src -name "*.java") 2>&1 | grep -vE 'warning|deprecat|^Note|Picked up' || true
[ -f $B/classes/tv/nova/app/ExoEngine.class ] || { echo "javac failed"; exit 1; }
if [ -n "${DX_JAR:-}" ]; then
  java -jar "$DX_JAR" --dex --min-sdk-version=21 --output=$B/dex/classes.dex $B/classes 2>&1 | grep -v 'Picked up' || true
else
  "$BT/d8" --release --min-api 21 --lib "$ANDROID_JAR" --output $B/dex $(find $B/classes -name "*.class") "$EXO_LIBS"/*.jar
fi
[ -f $B/dex/classes.dex ] || { echo "dex failed"; exit 1; }
# 3. native libs: TDLib + our JNI shim
for abi in arm64-v8a armeabi-v7a; do
  mkdir -p $B/pkg/lib/$abi
  cp "$TDLIB_LIBS/$abi/libtdjson.so" jni/prebuilt/$abi/libnovajni.so $B/pkg/lib/$abi/
done
cp $B/base.apk $B/unsigned.apk
cp $B/dex/classes*.dex $B/pkg/
(cd $B/pkg && zip -q -r -9 ../unsigned.apk classes*.dex lib)
# 4. align + sign (v1 + v2 + v3)
python3 tools/zipalign.py $B/unsigned.apk $B/aligned.apk
mkdir -p build/out
$APKSIGNER_CMD sign --key keys/flixgram.pk8 --cert keys/flixgram.x509.der --min-sdk-version 21 --out build/out/Flixgram.apk $B/aligned.apk
$APKSIGNER_CMD verify --min-sdk-version 21 -v build/out/Flixgram.apk | head -4
ls -la build/out/Flixgram.apk
