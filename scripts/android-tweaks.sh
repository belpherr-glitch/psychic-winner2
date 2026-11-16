#!/usr/bin/env bash
# Landscape + fullscreen for the generated Android project.
set -euo pipefail
M=android/app/src/main/AndroidManifest.xml
grep -q screenOrientation "$M" || sed -i 's/<activity/<activity android:screenOrientation="sensorLandscape"/' "$M"
S=android/app/src/main/res/values/styles.xml
grep -q windowFullscreen "$S" || sed -i 's#<item name="windowActionBar">false</item>#<item name="windowActionBar">false</item>\n        <item name="android:windowFullscreen">true</item>\n        <item name="android:windowLayoutInDisplayCutoutMode">shortEdges</item>#g' "$S"
