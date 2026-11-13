#!/bin/sh
# Rebuild lib/three.min.js: a cut-down three.js holding only the parts Burn Rate's 3D stand uses (src/vis/stand3d.js).
#
# three.js (MIT, https://threejs.org) no longer ships a minified classic build, so this makes one: esbuild tree-shakes the
# official ES module down to the names listed below and wraps them as a classic script that sets window.THREE. The tools
# live in a throwaway folder; nothing here touches the repo except lib/three.min.js. Run it from the repo root:
#
#   sh tools/vendor-three.sh            (needs Node and network access to the npm registry)
#
# Then commit lib/three.min.js, run node build.js (sw.js precaches lib/), and update the version in CREDITS.md if it changed.
# Using a new three.js name in src/vis/? Add it to the export list below and rerun.
set -e
VER=0.187.0
OUT="$(pwd)/lib/three.min.js"
TMP="$(mktemp -d)"
cd "$TMP"
npm i --silent --no-save --no-package-lock "three@$VER" esbuild@0.24.2 >/dev/null
cat > entry.js <<'JS'
export { REVISION, WebGLRenderer, Scene, PerspectiveCamera, Color, Fog, HemisphereLight, DirectionalLight, AmbientLight,
  PointLight, Mesh, Group, Object3D, BufferGeometry, BufferAttribute, Float32BufferAttribute, PlaneGeometry, CylinderGeometry,
  ConeGeometry, BoxGeometry, SphereGeometry, LatheGeometry, CircleGeometry, RingGeometry, MeshStandardMaterial,
  MeshLambertMaterial, MeshBasicMaterial, ShaderMaterial, Points, LineSegments, LineBasicMaterial, CanvasTexture, Vector2,
  Vector3, Quaternion, Euler, Matrix4, MathUtils, AdditiveBlending, NormalBlending, DoubleSide, FrontSide, BackSide,
  SRGBColorSpace, LinearSRGBColorSpace, ACESFilmicToneMapping, NoToneMapping, PCFSoftShadowMap, RepeatWrapping,
  InstancedMesh, DynamicDrawUsage } from "three";
JS
./node_modules/.bin/esbuild entry.js --bundle --minify --format=iife --global-name=THREE --target=es2019 \
  --legal-comments=none --banner:js="/* three.js r$(echo $VER | cut -d. -f2) (MIT, (c) 2010-2026 three.js authors, https://threejs.org). Cut down for Burn Rate by tools/vendor-three.sh */" \
  --outfile="$OUT"
cd / && rm -rf "$TMP"
ls -l "$OUT"
