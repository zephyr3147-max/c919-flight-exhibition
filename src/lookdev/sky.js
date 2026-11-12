// Dynamic high-altitude sky for the exhibit. The cloudscape is generated
// locally at startup (no external HDRI, image or network request) and sampled
// by a back-side dome. The dome writes sRGB values directly, so it stays
// independent of the studio tone-mapping applied to the aircraft.
import * as THREE from 'three';

const CLOUD_SIZE = 512;
const CLOUD_TILES = 4;
const DOME_RADIUS = 300;

const smoothstep = (a, b, value) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Tileable value noise. Wrapping every octave's lattice at its own period keeps
// the equirectangular cloud map seamless when the plane projection repeats it.
function hash2(x, y, period) {
  const px = ((x % period) + period) % period;
  const py = ((y % period) + period) % period;
  let h = Math.imul(px, 374761393) + Math.imul(py, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(x, y, period) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, period), b = hash2(x0 + 1, y0, period);
  const c = hash2(x0, y0 + 1, period), d = hash2(x0 + 1, y0 + 1, period);
  return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
}

function fbm(x, y, basePeriod, octaves) {
  let sum = 0, amplitude = 0.5, frequency = 1, normal = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    sum += valueNoise(x * frequency, y * frequency, basePeriod * frequency) * amplitude;
    normal += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return sum / normal;
}

function createCloudTexture(renderer) {
  const width = CLOUD_SIZE, height = CLOUD_SIZE / 2;
  const data = new Uint8Array(width * height * 4);
  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    // v is unused by the shader's plane projection, but a vertically seamless
    // map keeps the texture reusable for any future spherical mapping.
    const v = y / (height - 1);
    for (let x = 0; x < width; x += 1) {
      const u = x / width;
      const px = u * CLOUD_TILES, py = v * CLOUD_TILES;
      const warpX = fbm(px + 0.37, py + 1.71, CLOUD_TILES, 4);
      const warpY = fbm(px + 5.19, py + 3.33, CLOUD_TILES, 4);
      const base = fbm(px + (warpX - 0.5) * 1.7, py + (warpY - 0.5) * 1.7, CLOUD_TILES, 5);
      const detail = fbm(px * 2 + 7.3, py * 2 + 3.1, CLOUD_TILES * 2, 4);
      const broad = fbm(px * 0.5 + 11.3, py * 0.5 + 7.9, CLOUD_TILES * 0.5, 3);
      data[offset++] = Math.round(Math.max(0, Math.min(1, base)) * 255);
      data[offset++] = Math.round(Math.max(0, Math.min(1, detail)) * 255);
      data[offset++] = Math.round(Math.max(0, Math.min(1, broad)) * 255);
      data[offset++] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = 'lookdev-cloud-map';
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.anisotropy = Math.min(4, renderer?.capabilities?.getMaxAnisotropy?.() ?? 1);
  texture.needsUpdate = true;
  return texture;
}

const vertexShader = /* glsl */`
  varying vec3 vWorldPosition;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPosition = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */`
  uniform sampler2D uCloudMap;
  uniform float uTime;
  uniform vec3 uSunDirection;
  varying vec3 vWorldPosition;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  void main() {
    vec3 direction = normalize(vWorldPosition - cameraPosition);
    float height = direction.y;

    // Blue hour above a sunlit cloud sea. The exhibit camera looks down at the
    // aircraft, so the clouds people actually see are the deck *below* the
    // horizon; the upper sky is only the narrow band at the top of the frame.
    // Values are authored directly in sRGB because this material opts out of
    // the aircraft's ACES tone-mapping.
    vec3 horizon = vec3(0.315, 0.455, 0.590);
    vec3 zenith = vec3(0.040, 0.120, 0.250);
    vec3 abyss = vec3(0.090, 0.165, 0.265);
    vec3 sky = mix(horizon, zenith, smoothstep(0.0, 0.70, height));
    sky = mix(abyss, sky, smoothstep(-0.45, 0.0, height));

    // A low sun warms the cloud tops on one side without becoming a visible
    // disc; it also anchors the palette to the aircraft's key light.
    vec3 sun = normalize(uSunDirection);
    float sunAmount = max(dot(direction, sun), 0.0);
    float sunGlow = pow(sunAmount, 14.0);
    float sunBand = pow(sunAmount, 3.0);
    sky += vec3(0.24, 0.19, 0.12) * sunGlow * 0.85;
    sky += vec3(0.060, 0.055, 0.045) * sunBand;

    // Cloud sea. Both decks are planar projections: direction.xz / depth gives
    // true perspective and a horizon-like compression near direction.y == 0.
    // Clamping the depth keeps the projection from tiling into alias noise at
    // the horizon. Deck A is large and slow, deck B finer and counter-drifting.
    float below = max(-height, 0.0);
    float seaDepth = 1.0 / max(below, 0.085);
    vec2 uvA = direction.xz * seaDepth * 0.34 + vec2(uTime * 0.0060, uTime * 0.0022);
    vec2 uvB = direction.xz * seaDepth * 0.72 + vec2(-uTime * 0.0034, uTime * 0.0046) + vec2(0.37, 0.61);

    vec4 a = texture2D(uCloudMap, uvA);
    vec4 b = texture2D(uCloudMap, uvB);

    // Macro channel picks the cloud masses; the detail channel breaks up their
    // edges so the deck reads as vapour rather than a flat cookie-cutter. The
    // broad channel is used first so the deck forms large, calm masses instead
    // of high-frequency marble.
    float coverA = smoothstep(0.420, 0.685, a.b + (a.r - 0.5) * 0.34 + (a.g - 0.5) * 0.025);
    float coverB = smoothstep(0.490, 0.755, b.b + (b.r - 0.5) * 0.28 + (b.g - 0.5) * 0.030);

    // Sea fades out in the horizon haze; the fade also hides the projection
    // singularly where the deck is infinitely far away. Keeping a wider fade
    // leaves a band of open sky at the top of a downward-looking frame.
    float seaMask = smoothstep(0.10, 0.42, below);

    // Lit tops, cool shadowed valleys, and a subtle sun-side lift. Whites stay
    // below the aircraft's tone-mapped highlights so the airframe still reads.
    float lightA = smoothstep(0.28, 0.64, a.g * 0.50 + a.r * 0.50);
    vec3 shadeA = mix(vec3(0.545, 0.630, 0.745), vec3(0.885, 0.925, 0.965), lightA);
    shadeA = mix(shadeA, vec3(1.000, 0.995, 0.985), smoothstep(0.62, 0.88, a.r) * 0.74);
    shadeA += vec3(0.075, 0.058, 0.032) * sunBand;
    float alphaA = coverA * seaMask * 0.93;

    float lightB = smoothstep(0.26, 0.68, b.g * 0.62 + b.r * 0.38);
    vec3 shadeB = mix(vec3(0.720, 0.790, 0.870), vec3(0.975, 0.985, 1.000), lightB);
    float alphaB = coverB * seaMask * 0.22;

    sky = mix(sky, shadeA, alphaA);
    sky = mix(sky, shadeB, alphaB);

    // A thin cirrus veil above the horizon keeps the top band alive when the
    // camera tilts up; it is intentionally much fainter than the cloud sea.
    float above = max(height, 0.0);
    float deckDepth = 1.0 / max(above, 0.140);
    vec2 uvHigh = direction.xz * deckDepth * 0.46 + vec2(uTime * 0.0022, -uTime * 0.0011);
    vec4 high = texture2D(uCloudMap, uvHigh + vec2(0.19, 0.43));
    float coverHigh = smoothstep(0.54, 0.74, high.r + (high.b - 0.5) * 0.30);
    float maskHigh = smoothstep(0.03, 0.18, above);
    vec3 shadeHigh = mix(vec3(0.40, 0.50, 0.61), vec3(0.86, 0.91, 0.96), high.g);
    sky = mix(sky, shadeHigh, coverHigh * maskHigh * 0.30);

    // Soft haze compresses the deck into the horizon and keeps the transition
    // from cloud tops to sky from reading as a hard cutout.
    float haze = exp(-abs(height) * 8.0);
    sky = mix(sky, vec3(0.285, 0.405, 0.535), haze * 0.38);

    // Grade the sky itself into a calm blue range. This bounds drifting cloud
    // highlights behind light typography without placing a veil over the plane.
    sky = mix(vec3(0.11, 0.18, 0.27), clamp(sky, 0.0, 1.0), 0.26);

    // A sub-LSB dither removes gradient banding on 8-bit displays.
    sky += (hash21(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;
    gl_FragColor = vec4(sky, 1.0);
  }
`;

export function createSky({ renderer, scene, level = 'balanced' } = {}) {
  if (!scene) return null;
  const cloudMap = createCloudTexture(renderer);
  const geometry = new THREE.SphereGeometry(DOME_RADIUS, 40, 24);
  geometry.name = 'lookdev-sky-dome';
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uCloudMap: { value: cloudMap },
      uTime: { value: 0 },
      uSunDirection: { value: new THREE.Vector3(-0.42, 0.10, 0.58).normalize() },
    },
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  material.name = 'lookdev-sky';
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'lookdev-sky';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  scene.add(mesh);

  let disposed = false;
  let lastCamera = null;
  let lastHostRender = -Infinity;
  let lastDriverRender = -Infinity;
  let driverFrame = 0;
  let reducedMotion = false;
  const driverInterval = level === 'low' ? 50 : 1000 / 24;

  // The host only schedules frames while the exhibit is moving. The sky is
  // lookdev-owned and must keep drifting after the camera settles, so lookdev
  // borrows the renderer's public render call when the host is idle. It never
  // advances host state, never adds frames to the host's counters, and skips
  // itself whenever a host frame happened in the last 50 ms.
  const hadOwnRender = Boolean(renderer) && Object.prototype.hasOwnProperty.call(renderer, 'render');
  const originalRender = renderer?.render;
  if (typeof originalRender === 'function') {
    renderer.render = function ambientRender(sceneArg, cameraArg) {
      if (sceneArg === scene && cameraArg?.isCamera) {
        lastCamera = cameraArg;
        lastHostRender = performance.now();
      }
      return originalRender.call(this, sceneArg, cameraArg);
    };
    const drive = now => {
      if (disposed) return;
      driverFrame = requestAnimationFrame(drive);
      if (reducedMotion || document.hidden || !lastCamera) return;
      if (now - lastHostRender < 50) return;
      if (now - lastDriverRender < driverInterval) return;
      lastDriverRender = now;
      material.uniforms.uTime.value = now / 1000;
      originalRender.call(renderer, scene, lastCamera);
    };
    driverFrame = requestAnimationFrame(drive);
  }

  return {
    mesh,
    update(now) {
      if (disposed) return;
      material.uniforms.uTime.value = Number(now) / 1000;
    },
    setReducedMotion(value) {
      reducedMotion = Boolean(value);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (driverFrame) cancelAnimationFrame(driverFrame);
      driverFrame = 0;
      lastCamera = null;
      if (typeof originalRender === 'function') {
        if (hadOwnRender) renderer.render = originalRender;
        else delete renderer.render;
      }
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
      cloudMap.dispose();
    },
  };
}
