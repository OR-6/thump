/**
 * The waterfall's four shaders, each short: the light shapes (a glass capsule with a bright core and a fresnel rim,
 * a lens for a drum, a crescent for a cymbal, a closing ring, a key flooding with colour, a sweep across strings),
 * a soft halo (the fake bloom), a streak (comet trails, chord filaments, sparks), and the aurora behind the lane.
 * Every one only adds light (see art/light.ts): over passthrough nothing may darken the room.
 */
import { ShaderMaterial, Vector3 } from '@iwsdk/core';
import { asLight } from '../art/light.js';

const OUT = /* glsl */ `
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
`;

/**
 * Shapes: 0 capsule (stands on its axis, turned to you), 1 lens, 2 crescent, 3 ring, 4 key flood, 5 head flood, 6 sweep.
 * The others lie on the plane whose normal is the axis; with no axis (zero) a shape faces you.
 */
export function shapeMaterial(): ShaderMaterial {
  return asLight(
    new ShaderMaterial({
      uniforms: { uX: { value: new Vector3(1, 0, 0) } },
      vertexShader: /* glsl */ `
        attribute vec3 iPos; attribute vec3 iAxis; attribute vec2 iSize; attribute vec3 iCol; attribute vec4 iData;
        uniform vec3 uX;
        varying vec2 vUv; varying vec2 vSize; varying vec3 vCol; varying vec4 vData;
        void main() {
          vec3 u = iAxis; vec3 r;
          if (dot(iAxis, iAxis) < 0.25) { r = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]); u = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]); }
          else if (iData.x < 0.5) r = normalize(cross(u, cameraPosition - iPos));
          else { u = normalize(cross(uX, iAxis)); r = normalize(cross(iAxis, u)); }
          vUv = position.xy; vSize = iSize; vCol = iCol; vData = iData;
          gl_Position = projectionMatrix * viewMatrix * vec4(iPos + r * position.x * iSize.x + u * position.y * iSize.y, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv; varying vec2 vSize; varying vec3 vCol; varying vec4 vData;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main() {
          float s = vData.x; vec3 c = vCol; float d; float k;
          vec3 gold = vec3(1.0, 0.72, 0.3);
          if (s < 0.5) {
            // capsule: radius is the half-width; d is 0 on the centreline, 1 at the skin
            vec2 q = vUv * vSize; float r = vSize.x;
            d = length(vec2(q.x, max(abs(q.y) - (vSize.y - r), 0.0))) / r;
            if (d > 1.0) discard;
            float core = exp(-d * d * 7.0);
            float rim = pow(d, 5.0);
            c = vCol * (0.3 + 0.2 * (1.0 - d)) + mix(vCol, vec3(1.0), 0.55) * core * 1.3 + mix(vCol * 1.4, gold * 1.6, vData.w) * rim;
            c *= smoothstep(1.0, 0.92, d);
          } else if (s < 1.5) {
            d = length(vUv);
            if (d > 1.0) discard;
            float rim = smoothstep(0.72, 0.93, d) * smoothstep(1.0, 0.95, d);
            c = vCol * (0.22 + 0.9 * exp(-d * d * 5.0)) + mix(vCol, vec3(1.0), 0.6) * exp(-d * d * 30.0) + mix(vCol * 1.5, gold * 1.6, vData.w) * rim;
          } else if (s < 2.5) {
            // crescent: the disc less a disc set toward its back
            d = length(vUv); float e = length(vUv - vec2(0.0, -0.42)) / 0.78;
            if (d > 1.0 || e < 1.0) discard;
            float edge = min(1.0 - d, e - 1.0);
            c = vCol * (0.35 + 0.8 * smoothstep(0.0, 0.25, edge)) + mix(vCol * 1.5, gold * 1.6, vData.w) * smoothstep(0.08, 0.0, edge);
          } else if (s < 3.5) {
            // ring of width vData.z (in radii)
            d = length(vUv); k = (d - (1.0 - vData.z)) / vData.z;
            if (k < -1.0 || k > 1.0) discard;
            c = vCol * exp(-k * k * 4.0) * (1.0 - step(1.0, d));
          } else if (s < 4.5) {
            // a key flooding with colour, bleeding a little into the key either side (the quad is three keys wide)
            float x = abs(vUv.x) * 3.0; float y = abs(vUv.y);
            k = x < 1.0 ? 1.0 : 0.28 * (1.0 - (x - 1.0) / 2.0);
            c = vCol * k * smoothstep(1.0, 0.75, y) * (x < 1.0 ? smoothstep(1.0, 0.85, x) * 0.7 + 0.3 : 1.0);
          } else if (s < 5.5) {
            d = length(vUv);
            if (d > 1.0) discard;
            c = vCol * (0.55 + 0.45 * smoothstep(0.6, 0.95, d)) * smoothstep(1.0, 0.94, d);
          } else {
            // a band of light across the strings, at vData.z (0 to 1) of the way over
            k = (vUv.y * 0.5 + 0.5 - vData.z) * 7.0;
            c = vCol * exp(-k * k) * smoothstep(1.0, 0.8, abs(vUv.x));
          }
          // a miss turns to ash: grey, and crumbling away from the top
          if (vData.y > 0.0) {
            c = mix(c, vec3(dot(c, vec3(0.3, 0.5, 0.2))) * 0.6, min(1.0, vData.y * 2.0));
            if (hash(floor((vUv + 1.0) * vec2(6.0, 14.0))) < vData.y * 1.4 - (0.5 - vUv.y * 0.5) * 0.4) discard;
          }
          ${OUT}
        }`,
    }),
  );
}

/** A soft round glow turned to you (fake bloom). */
export function haloMaterial(): ShaderMaterial {
  return asLight(
    new ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute vec3 iPos; attribute vec2 iSize; attribute vec3 iCol;
        varying vec2 vUv; varying vec3 vCol;
        void main() {
          vec3 r = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 u = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          vUv = position.xy; vCol = iCol;
          gl_Position = projectionMatrix * viewMatrix * vec4(iPos + (r * position.x + u * position.y) * iSize.x, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv; varying vec3 vCol;
        void main() {
          float d2 = dot(vUv, vUv);
          if (d2 > 1.0) discard;
          vec3 c = vCol * (exp(-d2 * 6.0) * 0.8 + exp(-d2 * 30.0) * 0.6) * (1.0 - d2);
          ${OUT}
        }`,
    }),
  );
}

/** A streak from A to B, turned to you round its own line, its width and brightness running from A's to B's. */
export function streakMaterial(): ShaderMaterial {
  return asLight(
    new ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute vec3 iA; attribute vec3 iB; attribute vec2 iW; attribute vec3 iCol; attribute vec2 iAl;
        varying float vT; varying float vX; varying vec3 vCol; varying vec2 vAl;
        void main() {
          vec3 p = mix(iA, iB, position.y); vec3 ax = iB - iA;
          vec3 side = cross(ax, cameraPosition - p);
          float l = length(side);
          side = l > 1e-9 ? side / l : vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vT = position.y; vX = position.x; vCol = iCol; vAl = iAl;
          gl_Position = projectionMatrix * viewMatrix * vec4(p + side * position.x * mix(iW.x, iW.y, position.y), 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying float vT; varying float vX; varying vec3 vCol; varying vec2 vAl;
        void main() {
          float al = mix(vAl.x, vAl.y, vT);
          vec3 c = vCol * (al * al / max(1e-3, max(vAl.x, vAl.y))) * (1.0 - vX * vX);
          ${OUT}
        }`,
    }),
  );
}

/**
 * The aurora behind the lane: slow curtains in the song's two colours drifting upward, clear at the top and the
 * sides; a line of light sweeping up from the landing line every beat; a brighter band at each new section; during
 * the count-in it fills from the bottom up.
 */
export function auroraMaterial(): ShaderMaterial {
  return asLight(
    new ShaderMaterial({
      uniforms: {
        uT: { value: 0 },
        uBeat: { value: 0 },
        uOp: { value: 0 },
        uLines: { value: 0.5 },
        uBand: { value: -1 },
        uFill: { value: 1.2 },
        uBow: { value: 0 },
        uA: { value: new Vector3(0.2, 0.5, 1) },
        uB: { value: new Vector3(0.6, 0.2, 1) },
      },
      vertexShader: /* glsl */ `
        uniform float uBow; varying vec2 vUv;
        void main() {
          vUv = uv;
          vec3 p = position; p.z += uBow * uv.y * uv.y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uT, uBeat, uOp, uLines, uBand, uFill; uniform vec3 uA, uB; varying vec2 vUv;
        void main() {
          float x = vUv.x, y = vUv.y;
          float w = sin(x * 7.0 + uT * 0.6 + sin(y * 3.0 - uT * 0.9) * 1.6) * 0.5 + 0.5;
          float w2 = sin(x * 13.0 - uT * 0.35 + y * 4.0 - uT * 0.5) * 0.5 + 0.5;
          float rise = sin(y * 9.0 - uT * 1.2 + x * 2.0) * 0.5 + 0.5;
          vec3 col = mix(uA, uB, w * 0.65 + w2 * 0.35);
          float side = smoothstep(0.0, 0.14, x) * smoothstep(1.0, 0.86, x);
          float fade = pow(1.0 - y, 1.5) * side;
          float a = uOp * (0.45 + 0.55 * w * (0.6 + 0.4 * rise)) * fade;
          a *= smoothstep(uFill + 0.06, uFill - 0.06, y);
          float ph = fract(uBeat);
          float line = exp(-pow((y - ph * 0.9) * 70.0, 2.0)) * (1.0 - ph) * uLines;
          float band = uBand < 0.0 ? 0.0 : exp(-pow((y - uBand) * 7.0, 2.0)) * (1.0 - uBand) * 0.5;
          vec3 c = col * a + (col * 0.6 + 0.4) * (line + band) * side * (1.0 - y * 0.5) * min(1.0, uOp * 8.0);
          ${OUT}
        }`,
    }),
  );
}
