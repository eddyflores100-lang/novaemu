/* ============================================================
 * NovaCore v3.0 — Motor WebGL2 de NovaEmu PS5 Edition
 * Shadow mapping (PCF) · Texturas procedurales + normal maps
 * HDR + ACES tonemap + bloom · Fog · Sky dome · Partículas
 * Resolución dinámica para PCs viejas.
 * Conceptos reimplementados desde cero (sin código GPL).
 * ============================================================ */
'use strict';

/* ---------------- Matemática ---------------- */
const V3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: a => Math.hypot(a[0], a[1], a[2]),
  norm(a) { const l = this.len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
};

const M4 = {
  ident() { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); },
  mul(out, a, b) { // column-major: out = a * b
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    out.set(o); return out;
  },
  perspective(out, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    out.fill(0);
    out[0] = f / aspect; out[5] = f; out[10] = (far + near) * nf; out[11] = -1; out[14] = 2 * far * near * nf;
    return out;
  },
  ortho(out, l, r, b, t, n, f) {
    out.fill(0);
    out[0] = 2 / (r - l); out[5] = 2 / (t - b); out[10] = -2 / (f - n);
    out[12] = -(r + l) / (r - l); out[13] = -(t + b) / (t - b); out[14] = -(f + n) / (f - n); out[15] = 1;
    return out;
  },
  lookAt(out, eye, c, up) {
    let z = V3.norm(V3.sub(eye, c));
    let x = V3.norm(V3.cross(up, z));
    const y = V3.cross(z, x);
    out[0] = x[0]; out[1] = y[0]; out[2] = z[0]; out[3] = 0;
    out[4] = x[1]; out[5] = y[1]; out[6] = z[1]; out[7] = 0;
    out[8] = x[2]; out[9] = y[2]; out[10] = z[2]; out[11] = 0;
    out[12] = -V3.dot(x, eye); out[13] = -V3.dot(y, eye); out[14] = -V3.dot(z, eye); out[15] = 1;
    return out;
  },
  compose(out, pos, rotEuler, scl) { // T * Ry * Rx * Rz * S
    const [rx, ry, rz] = rotEuler;
    const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
    // Ry*Rx*Rz (matrices 3x3, column-major explícita)
    const r00 = cy * cz + sy * sx * sz, r01 = -cy * sz + sy * sx * cz, r02 = sy * cx;
    const r10 = cx * sz, r11 = cx * cz, r12 = -sx;
    const r20 = -sy * cz + cy * sx * sz, r21 = sy * sz + cy * sx * cz, r22 = cy * cx;
    out[0] = r00 * scl[0]; out[1] = r10 * scl[0]; out[2] = r20 * scl[0]; out[3] = 0;
    out[4] = r01 * scl[1]; out[5] = r11 * scl[1]; out[6] = r21 * scl[1]; out[7] = 0;
    out[8] = r02 * scl[2]; out[9] = r12 * scl[2]; out[10] = r22 * scl[2]; out[11] = 0;
    out[12] = pos[0]; out[13] = pos[1]; out[14] = pos[2]; out[15] = 1;
    return out;
  },
  normalMat3(out, m) { // inversa-traspuesta de la 3x3 superior
    const a = m[0], b = m[1], c = m[2], d = m[4], e = m[5], f = m[6], g = m[8], h = m[9], i = m[10];
    const A = e * i - f * h, B = f * g - d * i, C = d * h - e * g;
    let det = a * A + b * B + c * C; if (!det) { out.set([1, 0, 0, 0, 1, 0, 0, 0, 1]); return out; }
    det = 1 / det;
    out[0] = A * det; out[1] = B * det; out[2] = C * det;
    out[3] = (c * h - b * i) * det; out[4] = (a * i - c * g) * det; out[5] = (b * g - a * h) * det;
    out[6] = (b * f - c * e) * det; out[7] = (c * d - a * f) * det; out[8] = (a * e - b * d) * det;
    return out;
  },
  transformPoint(m, p) {
    const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15] || 1;
    return [
      (m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / w,
      (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / w,
      (m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]) / w
    ];
  }
};

/* clamp / lerp utilidades */
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));

/* ---------------- Shaders ---------------- */
const SH_MESH_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNor;
layout(location=2) in vec2 aUV;
uniform mat4 uProj, uView, uModel, uLightVP;
uniform mat3 uNormalMat;
uniform float uNorOffset;
out vec3 vWorld; out vec3 vNor; out vec2 vUV; out vec4 vShadow;
void main(){
  vec4 w = uModel * vec4(aPos, 1.0);
  vWorld = w.xyz;
  vNor = uNormalMat * aNor;
  vUV = aUV;
  // normal-offset: desplaza la posición de sombra a lo largo de la normal (mata el acne)
  vShadow = uLightVP * vec4(w.xyz + normalize(vNor) * uNorOffset, 1.0);
  gl_Position = uProj * uView * w;
}`;

const SH_MESH_FS = `#version 300 es
precision highp float;
in vec3 vWorld; in vec3 vNor; in vec2 vUV; in vec4 vShadow;
uniform sampler2D uAlbedo, uNormalMap, uShadowMap;
uniform vec3 uCamPos, uSunDir, uSunColor, uAmbSky, uAmbGround, uEmissive, uFogColor, uTint;
uniform vec3 uSkyTop, uSkyHor, uSkyGnd;
uniform float uRough, uMetal, uNormalScale, uFogDensity, uShadowStrength, uAlpha;
uniform float uCloudAmt, uStarsAmt, uTime;
uniform int uUnlit, uSky;
out vec4 fragColor;

/* ruido de valor 2D + FBM para nubes procedurales (técnica iq, reimplementada) */
float vhash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(vhash(i), vhash(i + vec2(1, 0)), u.x), mix(vhash(i + vec2(0, 1)), vhash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.55;
  for(int i = 0; i < 5; i++){ v += a * vnoise(p); p = p * 2.03 + vec2(17.3, 9.1); a *= 0.5; }
  return v;
}

float calcShadow(){
  vec3 p = vShadow.xyz / vShadow.w * 0.5 + 0.5;
  if(p.z >= 1.0 || p.x <= 0.0 || p.x >= 1.0 || p.y <= 0.0 || p.y >= 1.0) return 1.0;
  float ndl = max(dot(normalize(vNor), uSunDir), 0.0);
  float bias = clamp(0.0022 * (1.0 - ndl) + 0.0007, 0.0007, 0.0035);
  vec2 texel = 1.0 / vec2(textureSize(uShadowMap, 0));
  float s = 0.0;
  for(int i = -1; i <= 1; i++)
    for(int j = -1; j <= 1; j++){
      float d = texture(uShadowMap, p.xy + vec2(float(i), float(j)) * texel).r;
      s += (p.z - bias > d) ? 0.0 : 1.0;
    }
  return mix(1.0, s / 9.0, uShadowStrength);
}

void main(){
  vec4 base = texture(uAlbedo, vUV) * vec4(uTint, 1.0);
  if(uUnlit == 1){
    vec3 c = base.rgb * uEmissive;
    if(uSky == 1){
      /* CIELO PROCEDURAL: gradiente atmosférico + sol HDR + nubes FBM + estrellas */
      vec3 dir = normalize(vWorld - uCamPos);
      float h = clamp(dir.y, -1.0, 1.0);
      float horiz = pow(1.0 - max(h, 0.0), 3.2);
      vec3 col = mix(uSkyTop, uSkyHor, horiz);
      if(h < 0.0) col = mix(uSkyHor, uSkyGnd, clamp(-h * 5.0, 0.0, 1.0));
      float d = max(dot(dir, uSunDir), 0.0);
      col += uSunColor * (smoothstep(0.99930, 0.99985, d) * 9.0 + pow(d, 120.0) * 1.1 + pow(d, 7.0) * 0.30);
      if(h > 0.015){
        vec2 cp = dir.xz / (h + 0.14) * 1.35 + vec2(uTime * 0.006, uTime * 0.0023);
        float f = fbm(cp);
        float cl = smoothstep(0.46, 0.74, f) * uCloudAmt * smoothstep(0.015, 0.14, h);
        vec3 cc = col * 0.55 + uSunColor * 0.10 + vec3(0.28, 0.24, 0.26);
        cc += uSunColor * pow(d, 4.0) * 0.55; // borde iluminado hacia el sol
        col = mix(col, cc, cl * 0.92);
      }
      if(h > 0.22 && uStarsAmt > 0.0){
        vec2 sp = dir.xz / h * 1.0;
        float st = step(0.9982, vhash(floor(sp * 190.0)));
        float tw = 0.6 + 0.4 * vhash(floor(sp * 190.0) + floor(uTime * 0.7));
        col += vec3(0.9, 0.93, 1.0) * st * tw * smoothstep(0.22, 0.6, h) * uStarsAmt;
      }
      fragColor = vec4(col, 1.0);
      return;
    }
    fragColor = vec4(c, base.a * uAlpha);
    return;
  }
  vec3 N = normalize(vNor);
  vec3 nm = texture(uNormalMap, vUV).xyz * 2.0 - 1.0;
  if(uNormalScale > 0.0 && length(nm) > 0.1){
    vec3 dp1 = dFdx(vWorld), dp2 = dFdy(vWorld);
    vec2 duv1 = dFdx(vUV), duv2 = dFdy(vUV);
    vec3 dp2perp = cross(dp2, N);
    vec3 dp1perp = cross(N, dp1);
    vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;
    vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;
    float invmax = inversesqrt(max(dot(T, T), dot(B, B)) + 1e-8);
    T *= invmax; B *= invmax;
    N = normalize(mat3(T, B, N) * (nm * uNormalScale));
  }
  vec3 L = normalize(uSunDir);
  vec3 V = normalize(uCamPos - vWorld);
  vec3 H = normalize(L + V);
  float ndl = max(dot(N, L), 0.0);
  float sh = calcShadow();
  float shin = mix(8.0, 220.0, pow(clamp(1.0 - uRough, 0.0, 1.0), 2.0));
  float spec = pow(max(dot(N, H), 0.0), shin) * (shin + 8.0) / 32.0 * mix(0.06, 1.0, uMetal);
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 amb = mix(uAmbGround, uAmbSky, N.y * 0.5 + 0.5);
  vec3 col = base.rgb * (amb + uSunColor * ndl * sh);
  col += uSunColor * spec * sh * (0.35 + 0.65 * fres);
  col += base.rgb * fres * uSunColor * 0.06;
  col += uEmissive;
  float dist = length(uCamPos - vWorld);
  float fog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  col = mix(col, uFogColor, clamp(fog, 0.0, 1.0));
  fragColor = vec4(col, base.a * uAlpha);
}`;

const SH_DEPTH_VS = `#version 300 es
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP, uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`;
const SH_DEPTH_FS = `#version 300 es
precision mediump float;
void main(){}`;

const SH_PART_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aCorner;
layout(location=2) in vec4 aColor;
layout(location=3) in float aSize;
uniform mat4 uProj, uView;
out vec4 vColor; out vec2 vCorner;
void main(){
  vec4 vp = uView * vec4(aPos, 1.0);
  vp.xy += aCorner * aSize;
  gl_Position = uProj * vp;
  vColor = aColor; vCorner = aCorner;
}`;
const SH_PART_FS = `#version 300 es
precision mediump float;
in vec4 vColor; in vec2 vCorner;
out vec4 fragColor;
void main(){
  float r = length(vCorner);
  float a = smoothstep(1.0, 0.55, r) * vColor.a;
  if(a < 0.01) discard;
  fragColor = vec4(vColor.rgb * a, a);
}`;

const SH_BRIGHT_FS = `#version 300 es
precision mediump float;
in vec2 vUV; out vec4 fragColor;
uniform sampler2D uTex;
void main(){
  vec3 c = texture(uTex, vUV).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  fragColor = vec4(c * smoothstep(0.72, 1.15, l), 1.0);
}`;

const SH_BLUR_FS = `#version 300 es
precision mediump float;
in vec2 vUV; out vec4 fragColor;
uniform sampler2D uTex;
uniform vec2 uDir;
void main(){
  vec3 c = texture(uTex, vUV).rgb * 0.227;
  vec2 o1 = uDir * 1.3846, o2 = uDir * 3.2308;
  c += (texture(uTex, vUV + o1).rgb + texture(uTex, vUV - o1).rgb) * 0.316;
  c += (texture(uTex, vUV + o2).rgb + texture(uTex, vUV - o2).rgb) * 0.070;
  fragColor = vec4(c, 1.0);
}`;

const SH_POST_FS = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 fragColor;
uniform sampler2D uScene, uBloom;
uniform float uTime, uVignette, uGrain, uBloomAmt, uSat, uExposure;
vec3 aces(vec3 x){
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  vec3 col = texture(uScene, vUV).rgb;
  col += texture(uBloom, vUV).rgb * uBloomAmt;
  col *= uExposure;
  col = aces(col);
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(lum), col, uSat);
  vec2 q = vUV - 0.5;
  col *= 1.0 - dot(q, q) * uVignette;
  col += (hash(vUV * 917.0 + fract(uTime) * 61.7) - 0.5) * uGrain;
  fragColor = vec4(max(col, 0.0), 1.0); // ACES ya incluye la curva de display; sin gamma extra (evita look pastel)
}`;

const SH_QUAD_VS = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUV;
void main(){ vUV = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

/* ---------------- Nodos y escena ---------------- */
class Node {
  constructor(geo, mat) {
    this.geo = geo; this.mat = mat || {};
    this.pos = [0, 0, 0]; this.rot = [0, 0, 0]; this.scl = [1, 1, 1];
    this.visible = true; this.castShadow = true;
    this.parent = null; this._wm = M4.ident(); this._nm = new Float32Array(9);
  }
  world() {
    M4.compose(this._wm, this.pos, this.rot, this.scl);
    if (this.parent) M4.mul(this._wm, this.parent._wm, this._wm);
    return this._wm;
  }
  get x() { return this.pos[0]; } set x(v) { this.pos[0] = v; }
  get y() { return this.pos[1]; } set y(v) { this.pos[1] = v; }
  get z() { return this.pos[2]; } set z(v) { this.pos[2] = v; }
}

/* ---------------- Partículas ---------------- */
class Particles {
  constructor(renderer, max = 512) {
    this.r = renderer; this.max = max; this.list = [];
    const gl = renderer.gl;
    this.vbo = gl.createBuffer();
    this.data = new Float32Array(max * 10); // pos3 corner2 color4 size1 → 2 tris × 3 verts
    this.quad = new Float32Array([1, 1, -1, 1, 1, -1, -1, -1]); // orden por triángulo abajo
  }
  spawn(o) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push(Object.assign({ pos: [0, 0, 0], vel: [0, 0, 0], size: 0.3, grow: 0, color: [1, 1, 1, 1], fade: 1, grav: 0, drag: 0, life: 1, t: 0, add: true }, o));
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.t += dt;
      if (p.t >= p.life) { this.list.splice(i, 1); continue; }
      p.vel[1] -= p.grav * dt;
      const dr = Math.exp(-p.drag * dt);
      p.vel[0] *= dr; p.vel[1] *= dr; p.vel[2] *= dr;
      p.pos[0] += p.vel[0] * dt; p.pos[1] += p.vel[1] * dt; p.pos[2] += p.vel[2] * dt;
      p.size += p.grow * dt;
    }
  }
  draw(viewMat) {
    if (!this.list.length) return;
    const gl = this.r.gl, n = this.list.length;
    // base de cámara para billboards
    const right = [viewMat[0], viewMat[4], viewMat[8]];
    const up = [viewMat[1], viewMat[5], viewMat[9]];
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
    const d = this.data;
    let o = 0;
    for (const p of this.list) {
      const k = p.t / p.life;
      const a = p.color[3] * (1 - k * k * p.fade);
      if (a <= 0.01) continue;
      for (const c of corners) {
        const cx = right[0] * c[0] * p.size + up[0] * c[1] * p.size;
        const cy = right[1] * c[0] * p.size + up[1] * c[1] * p.size;
        const cz = right[2] * c[0] * p.size + up[2] * c[1] * p.size;
        d[o++] = p.pos[0] + cx; d[o++] = p.pos[1] + cy; d[o++] = p.pos[2] + cz;
        d[o++] = c[0]; d[o++] = c[1];
        d[o++] = p.color[0]; d[o++] = p.color[1]; d[o++] = p.color[2]; d[o++] = a;
        d[o++] = 0; // tamaño ya aplicado en CPU (offset en shader = 0)
      }
    }
    if (!o) return;
    gl.useProgram(this.r.part.prog);
    gl.bindVertexArray(this.r.vaoPart);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, d.subarray(0, o), gl.DYNAMIC_DRAW);
    gl.uniformMatrix4fv(this.r.uPart.uProj, false, this.r.proj);
    gl.uniformMatrix4fv(this.r.uPart.uView, false, viewMat);
    gl.uniform1f(this.r.uPart.uSize, 0);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // aditivo
    gl.drawArrays(gl.TRIANGLES, 0, o / 10);
    gl.depthMask(true);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }
}

/* ---------------- Renderer ---------------- */
class NovaRenderer {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.opts = opts;
    const gl = canvas.getContext('webgl2', {
      antialias: false, alpha: false, depth: true, stencil: false,
      powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserve
    });
    if (!gl) { const e = new Error('WEBGL2_UNAVAILABLE'); e.code = 'WEBGL2_UNAVAILABLE'; throw e; }
    this.gl = gl;
    this.hdrFloat = !!gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');
    this.aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    this.errCount = 0;
    this.resScale = 1; this.dprCap = 1.5;
    this.fpsEMA = 60; this._acc = 0; this._frames = 0; this.time = 0;
    this.shadowSize = opts.shadowSize || 2048;
    this.bloomOn = opts.bloom !== false;
    this.msaa = opts.msaa !== false;
    this._buildPrograms();
    this._buildTargets();
    this._buildQuad();
    // estado de iluminación por defecto
    this.sun = { dir: V3.norm([-0.55, -1.0, -0.35]), color: [1.35, 1.22, 1.02], ambSky: [0.34, 0.42, 0.55], ambGround: [0.18, 0.16, 0.14], range: 60, strength: 1 };
    this.fog = { color: [0.55, 0.65, 0.8], density: 0.012 };
    this.camera = { pos: [0, 3, 8], target: [0, 1, 0], fov: 60 * Math.PI / 180, near: 0.1, far: 400 };
    this.proj = M4.ident(); this.view = M4.ident();
    this._lightVP = M4.ident(); this._shadowBias = new Float32Array(16);
  }

  _compile(vsSrc, fsSrc, label) {
    const gl = this.gl;
    const mk = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(sh);
        throw new Error(`SHADER[${label}]: ${log}`);
      }
      return sh;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`LINK[${label}]: ${gl.getProgramInfoLog(p)}`);
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      u[info.name.replace('[0]', '')] = gl.getUniformLocation(p, info.name);
    }
    return { prog: p, u };
  }

  _buildPrograms() {
    this.mesh = this._compile(SH_MESH_VS, SH_MESH_FS, 'mesh');
    this.depth = this._compile(SH_DEPTH_VS, SH_DEPTH_FS, 'depth');
    this.part = this._compile(SH_PART_VS, SH_PART_FS, 'part');
    this.bright = this._compile(SH_QUAD_VS, SH_BRIGHT_FS, 'bright');
    this.blur = this._compile(SH_QUAD_VS, SH_BLUR_FS, 'blur');
    this.post = this._compile(SH_QUAD_VS, SH_POST_FS, 'post');
    this.uDepth = this.depth.u;
    // VAO de partículas
    const gl = this.gl;
    this.vaoPart = gl.createVertexArray();
    gl.bindVertexArray(this.vaoPart);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    const s = Float32Array.BYTES_PER_ELEMENT;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 10 * s, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 10 * s, 3 * s);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 10 * s, 5 * s);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 10 * s, 9 * s);
    gl.bindVertexArray(null);
    this.uPart = this.part.u;
  }

  _mkTex(w, h, internal, format, type, filter) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  _buildTargets() {
    const gl = this.gl;
    this._resizeTargets();
    // shadow map (depth texture)
    this.shadowTex = this._mkTex(this.shadowSize, this.shadowSize, gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, gl.NEAREST);
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); // OBLIGATORIO: LINEAR en depth = textura incompleta → muestrea 0
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.shadowFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowTex, 0);
    gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('SHADOW_FBO_INCOMPLETE');
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  _resizeTargets() {
    const gl = this.gl;
    const w = this.canvas.width, h = this.canvas.height;
    if (!w || !h) return;
    const fmt = this.hdrFloat ? gl.RGBA16F : gl.RGBA8;
    const type = this.hdrFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    // MSAA render target
    if (this.msaa) {
      if (this.msaaFbo) { gl.deleteFramebuffer(this.msaaFbo); gl.deleteRenderbuffer(this.msaaRb); gl.deleteRenderbuffer(this.msaaDepth); }
      this.msaaRb = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.msaaRb);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, 4, fmt, w, h);
      this.msaaDepth = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.msaaDepth);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, 4, gl.DEPTH_COMPONENT24, w, h);
      this.msaaFbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.msaaFbo);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, this.msaaRb);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.msaaDepth);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) this.msaa = false;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    // resolve target (textura)
    const rebuild = (old, w2, h2) => {
      if (old) { gl.deleteTexture(old.tex); gl.deleteFramebuffer(old.fbo); }
      const tex = this._mkTex(w2, h2, fmt, gl.RGBA, type, gl.LINEAR);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { tex, fbo, w: w2, h: h2 };
    };
    this.sceneRT = rebuild(this.sceneRT, w, h);
    const bw = Math.max(2, w >> 2), bh = Math.max(2, h >> 2);
    this.bloomA = rebuild(this.bloomA, bw, bh);
    this.bloomB = rebuild(this.bloomB, bw, bh);
  }

  _buildQuad() {
    const gl = this.gl;
    this.vaoQuad = gl.createVertexArray();
    gl.bindVertexArray(this.vaoQuad);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  resize() {
    const c = this.canvas;
    if (this.opts.fixedSize) return; // canvas fuera del DOM (portadas): respeta width/height manual
    const dpr = Math.min(window.devicePixelRatio || 1, this.dprCap) * this.resScale;
    const w = Math.max(2, Math.round(c.clientWidth * dpr));
    const h = Math.max(2, Math.round(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; this._resizeTargets(); }
  }

  updateStats(dt) {
    this.time += dt;
    this._acc += dt; this._frames++;
    if (this._acc >= 0.5) {
      this.fpsEMA = this._frames / this._acc;
      this._acc = 0; this._frames = 0;
      if (this.opts.autoRes !== false) {
        if (this.fpsEMA < 42 && this.resScale > 0.62) this.resScale = Math.max(0.62, this.resScale - 0.12);
        else if (this.fpsEMA > 56 && this.resScale < 1) this.resScale = Math.min(1, this.resScale + 0.06);
      }
    }
  }

  _lightMatrix() {
    const s = this.sun, r = s.range;
    const center = [this.camera.target[0], this.camera.target[1], this.camera.target[2]];
    // snap al grid de texels del shadow map: elimina el shimmer al mover la cámara
    const texel = (2 * r) / this.shadowSize;
    center[0] = Math.round(center[0] / texel) * texel;
    center[2] = Math.round(center[2] / texel) * texel;
    const dirN = V3.norm(s.dir); // dirN apunta HACIA el suelo; el sol está en el lado opuesto
    const eye = V3.add(center, V3.scale(dirN, -r * 1.6));
    const lightView = M4.lookAt(M4.ident(), eye, center, Math.abs(dirN[1]) > 0.98 ? [0, 0, 1] : [0, 1, 0]);
    const lightProj = M4.ortho(M4.ident(), -r, r, -r, r, 0.1, r * 3.6);
    M4.mul(this._lightVP, lightProj, lightView);
    return this._lightVP;
  }

  render(sceneNodes, particles, dt) {
    const gl = this.gl;
    this.resize();
    this.updateStats(dt);
    const w = this.canvas.width, h = this.canvas.height;
    const aspect = w / h;
    M4.perspective(this.proj, this.camera.fov, aspect, this.camera.near, this.camera.far);
    M4.lookAt(this.view, this.camera.pos, this.camera.target, [0, 1, 0]);
    const lightVP = this._lightMatrix();

    /* --- Pase 1: shadow map --- */
    if (this.sun.strength > 0 && this.shadowSize > 0) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
      gl.viewport(0, 0, this.shadowSize, this.shadowSize);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.useProgram(this.depth.prog);
      gl.uniformMatrix4fv(this.uDepth.uLightVP, false, lightVP);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
      gl.enable(gl.CULL_FACE); gl.cullFace(gl.FRONT); // reduce acne
      for (const n of sceneNodes) {
        if (!n.visible || !n.castShadow || !n.geo) continue;
        if (n.mat.unlit) continue;
        gl.uniformMatrix4fv(this.uDepth.uModel, false, n.world());
        gl.bindVertexArray(n.geo.vao);
        gl.drawElements(gl.TRIANGLES, n.geo.count, gl.UNSIGNED_SHORT, 0);
      }
      gl.cullFace(gl.BACK);
    }

    /* --- Pase 2: escena a MSAA FBO --- */
    const target = this.msaa ? this.msaaFbo : this.sceneRT.fbo;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.viewport(0, 0, w, h);
    gl.clearColor(this.fog.color[0], this.fog.color[1], this.fog.color[2], 1);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    gl.disable(gl.BLEND);

    gl.useProgram(this.mesh.prog);
    const u = this.mesh.u;
    gl.uniformMatrix4fv(u.uProj, false, this.proj);
    gl.uniformMatrix4fv(u.uView, false, this.view);
    gl.uniformMatrix4fv(u.uLightVP, false, lightVP);
    gl.uniform3fv(u.uCamPos, this.camera.pos);
    gl.uniform3fv(u.uSunDir, V3.scale(V3.norm(this.sun.dir), -1)); // hacia el SOL (N·L correcto); el shadow map usa la dirección de viaje
    gl.uniform3fv(u.uSunColor, this.sun.color);
    gl.uniform3fv(u.uAmbSky, this.sun.ambSky);
    gl.uniform3fv(u.uAmbGround, this.sun.ambGround);
    gl.uniform3fv(u.uFogColor, this.fog.color);
    gl.uniform1f(u.uFogDensity, this.fog.density);
    gl.uniform1f(u.uShadowStrength, this.sun.strength);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.uniform1i(u.uShadowMap, 2);
    gl.uniform1i(u.uAlbedo, 0);
    gl.uniform1i(u.uNormalMap, 1);
    gl.uniform1f(u.uNorOffset, 0.05);
    gl.uniform1f(u.uTime, this.time);
    gl.uniform3fv(u.uSkyTop, [0.10, 0.14, 0.34]);
    gl.uniform3fv(u.uSkyHor, [0.86, 0.52, 0.38]);
    gl.uniform3fv(u.uSkyGnd, [0.22, 0.18, 0.16]);
    gl.uniform1f(u.uCloudAmt, 0.6);
    gl.uniform1f(u.uStarsAmt, 0.25);

    const drawNode = (n) => {
      const m = n.mat;
      const wm = n.world();
      M4.normalMat3(n._nm, wm);
      gl.uniformMatrix4fv(u.uModel, false, wm);
      gl.uniformMatrix3fv(u.uNormalMat, false, n._nm);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, m.albedo ? m.albedo.tex : this.r.whiteTex);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, m.normal ? m.normal.tex : this.r.normalFlatTex);
      gl.uniform1f(u.uRough, m.rough !== undefined ? m.rough : 0.8);
      gl.uniform1f(u.uMetal, m.metal || 0);
      gl.uniform1f(u.uNormalScale, m.normalScale !== undefined ? m.normalScale : 0.85);
      gl.uniform3fv(u.uEmissive, m.emissive || [0, 0, 0]);
      gl.uniform3fv(u.uTint, m.tint || [1, 1, 1]);
      gl.uniform1f(u.uAlpha, m.alpha !== undefined ? m.alpha : 1);
      gl.uniform1i(u.uUnlit, m.unlit ? 1 : 0);
      gl.uniform1i(u.uSky, m.sky ? 1 : 0);
      if (m.sky) {
        gl.uniform3fv(u.uSkyTop, m.skyTop || [0.10, 0.14, 0.34]);
        gl.uniform3fv(u.uSkyHor, m.skyHor || [0.86, 0.52, 0.38]);
        gl.uniform3fv(u.uSkyGnd, m.skyGnd || [0.22, 0.18, 0.16]);
        gl.uniform1f(u.uCloudAmt, m.clouds !== undefined ? m.clouds : 0.6);
        gl.uniform1f(u.uStarsAmt, m.stars !== undefined ? m.stars : 0.25);
      }
      gl.bindVertexArray(n.geo.vao);
      gl.drawElements(gl.TRIANGLES, n.geo.count, gl.UNSIGNED_SHORT, 0);
    };

    const blended = [];
    for (const n of sceneNodes) {
      if (!n.visible || !n.geo) continue;
      if (n.mat.blend) { blended.push(n); continue; }
      drawNode(n);
    }

    /* --- Pase 2b: decals con blend (sombras de contacto, reflejos suaves) --- */
    if (blended.length) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.uniform1f(u.uNorOffset, 0.0);
      for (const n of blended) drawNode(n);
      gl.uniform1f(u.uNorOffset, 0.05);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    /* --- Partículas (aditivas) --- */
    if (particles) particles.draw(this.view);

    /* --- Resolve MSAA --- */
    if (this.msaa) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.msaaFbo);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.sceneRT.fbo);
      gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    }

    /* --- Bloom --- */
    let bloomTex = this.bloomA.tex;
    if (this.bloomOn) {
      gl.disable(gl.DEPTH_TEST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomA.fbo);
      gl.viewport(0, 0, this.bloomA.w, this.bloomA.h);
      gl.useProgram(this.bright.prog);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.sceneRT.tex);
      gl.uniform1i(this.bright.u.uTex, 0);
      gl.bindVertexArray(this.vaoQuad);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      // blur H
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomB.fbo);
      gl.useProgram(this.blur.prog);
      gl.bindTexture(gl.TEXTURE_2D, this.bloomA.tex);
      gl.uniform1i(this.blur.u.uTex, 0);
      gl.uniform2f(this.blur.u.uDir, 1 / this.bloomA.w, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      // blur V → bloomA
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomA.fbo);
      gl.bindTexture(gl.TEXTURE_2D, this.bloomB.tex);
      gl.uniform2f(this.blur.u.uDir, 0, 1 / this.bloomA.h);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      bloomTex = this.bloomA.tex;
    }

    /* --- Post final a pantalla --- */
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(this.post.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneRT.tex);
    gl.uniform1i(this.post.u.uScene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bloomTex);
    gl.uniform1i(this.post.u.uBloom, 1);
    gl.uniform1f(this.post.u.uTime, this.time);
    gl.uniform1f(this.post.u.uVignette, this.opts.vignette !== undefined ? this.opts.vignette : 0.55);
    gl.uniform1f(this.post.u.uGrain, this.opts.grain !== undefined ? this.opts.grain : 0.014);
    gl.uniform1f(this.post.u.uBloomAmt, this.bloomOn ? (this.opts.bloomAmt !== undefined ? this.opts.bloomAmt : 0.85) : 0);
    gl.uniform1f(this.post.u.uSat, this.opts.saturation !== undefined ? this.opts.saturation : 1.12);
    gl.uniform1f(this.post.u.uExposure, this.opts.exposure !== undefined ? this.opts.exposure : 1.0);
    gl.bindVertexArray(this.vaoQuad);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE0);
  }

  /* Verificación: errores GL acumulados + hash del frame (golden frames, técnica Kyty) */
  glErrors() {
    const gl = this.gl;
    let e, n = 0;
    while ((e = gl.getError()) !== gl.NO_ERROR) n++;
    this.errCount += n;
    return n;
  }
  frameHash() {
    const gl = this.gl;
    const w = this.canvas.width, h = this.canvas.height;
    const px = new Uint8Array(w * h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let hash = 0x811c9dc5;
    for (let i = 0; i < px.length; i += 16) {
      hash ^= px[i]; hash = (hash * 0x01000193) >>> 0;
    }
    return { hash: hash.toString(16), nonBlack: px.reduce((a, v, i) => a + (i % 4 < 3 && v > 8 ? 1 : 0), 0), w, h };
  }
}

/* texturas blancas planas por defecto (1px) */
NovaRenderer.prototype._defaultTextures = function () {
  const gl = this.gl;
  const mk = (data) => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    return t;
  };
  this.r = {};
  this.r.whiteTex = mk(new Uint8Array([255, 255, 255, 255]));
  this.r.normalFlatTex = mk(new Uint8Array([128, 128, 255, 255]));
};

/* boot seguro: inicializa texturas por defecto tras construir */
const _origNovaInit = NovaRenderer.prototype._buildTargets;
NovaRenderer.prototype._buildTargets = function () {
  _origNovaInit.call(this);
  this._defaultTextures();
};

if (typeof window !== 'undefined') window.NovaCore = { NovaRenderer, Node, Particles, M4, V3, clamp, lerp, damp };
if (typeof module !== 'undefined') module.exports = { NovaRenderer, Node, Particles, M4, V3, clamp, lerp, damp };
