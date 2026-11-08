#!/usr/bin/env bash
# Verifica as natives dentro do APK:
#  1. libglfw.so exporta todas as funções que o LWJGL 3.3.3 exige.
#  2. Toda dependência (NEEDED) de cada .so é do sistema Android ou está no APK.
set -euo pipefail
APK="$1"
TOOLS=$(dirname "$(find "$ANDROID_HOME/ndk" -name llvm-readelf -path '*linux-x86_64*' | head -1)")
WORK=$(mktemp -d)
unzip -q -o "$APK" 'lib/arm64-v8a/*' -d "$WORK"
LIB="$WORK/lib/arm64-v8a"
echo "Natives no APK:"; ls -la "$LIB"

missing=$(comm -23 <(sort "$(dirname "$0")/glfw_required_lwjgl333.txt") \
  <("$TOOLS/llvm-nm" -D --defined-only "$LIB/libglfw.so" | awk '{print $3}' | sort))
if [ -n "$missing" ]; then echo "libglfw.so não exporta:"; echo "$missing"; exit 1; fi
echo "OK: libglfw.so exporta as $(wc -l < "$(dirname "$0")/glfw_required_lwjgl333.txt") funções GLFW exigidas"

SYSTEM="libc.so libm.so libdl.so liblog.so libandroid.so libEGL.so libGLESv1_CM.so libGLESv2.so libGLESv3.so libOpenSLES.so libaaudio.so libz.so libvulkan.so libjnigraphics.so libmediandk.so libnativewindow.so libsync.so"
fail=0
for so in "$LIB"/*.so; do
  for dep in $("$TOOLS/llvm-readelf" -d "$so" | sed -n 's/.*Shared library: \[\(.*\)\]/\1/p'); do
    if [[ " $SYSTEM " == *" $dep "* ]] || [ -f "$LIB/$dep" ]; then continue; fi
    echo "ERRO: $(basename "$so") precisa de $dep, que não está no APK"; fail=1
  done
done
[ $fail = 0 ] && echo "OK: todas as dependências nativas resolvidas"
exit $fail
