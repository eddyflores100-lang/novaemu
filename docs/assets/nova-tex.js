/* ============================================================
 * NovaTex v3.0 — Texturas procedurales (albedo + normal) y
 * geometría para NovaEmu PS5 Edition. Todo generado en runtime,
 * cero descargas, calidad tipo PBR estilizado.
 * ============================================================ */
'use strict';

/* -------- Ruido de valor tileable + FBM -------- */
function makeNoise(seed = 1337) {
  const P = 256, mask = P - 1;
  const perm = new Uint8Array(P * 2);
  let s = seed >>> 0;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const base = new Uint8Array(P);
  for (let i = 0; i < P; i++) base[i] = i;
  for (let i = P - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; const t = base[i]; base[i] = base[j]; base[j] = t; }
  for (let i = 0; i < P * 2; i++) perm[i] = base[i & mask];
  const vals = new Float32Array(P);
  for (let i = 0; i < P; i++) vals[i] = rnd();
  const lat = (x, y) => vals[perm[(perm[x & mask] + y) & mask]]; // lattice con wrap
  const fade = t => t * t * (3 - 2 * t);
  function noise2(x, y, period) { // period: para tileado (0 = sin tile)
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const w = (v) => period ? ((v % period) + period) % period : v & mask;
    const x0 = w(xi), x1 = w(xi + 1), y0 = w(yi), y1 = w(yi + 1);
    const u = fade(xf), v = fade(yf);
    const a = lat(x0, y0), b = lat(x1, y0), c = lat(x0, y1), d = lat(x1, y1);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  }
  function fbm(x, y, oct = 4, lac = 2, gain = 0.5, period = 0) {
    let amp = 0.5, f = 1, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++) {
      sum += amp * noise2(x * f, y * f, period ? period * f : 0);
      norm += amp; amp *= gain; f *= lac;
    }
    return sum / norm;
  }
  return { noise2, fbm, rnd };
}

const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;

/* -------- Definición de materiales procedurales --------
   Cada uno devuelve {height(h), color(r,g,b por píxel)}  */
const TEX_KINDS = {
  asphalt(N, S) {
    const h = new Float32Array(S * S), col = new Float32Array(S * S * 3);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x;
      let hgt = N.fbm(x / S * 8, y / S * 8, 5, 2.1, 0.55, 8);
      const grit = N.noise2(x * 0.9, y * 0.9, S);
      hgt = hgt * 0.72 + grit * 0.28;
      h[i] = hgt;
      const sh = 0.06 + hgt * 0.16 + grit * 0.05;
      const g = 52 + hgt * 46 + grit * 26;
      col[i * 3] = g * 0.98; col[i * 3 + 1] = g; col[i * 3 + 2] = g * 1.08;
      if (grit > 0.9) { const d = 40; col[i * 3] += d; col[i * 3 + 1] += d; col[i * 3 + 2] += d; }
    }
    return { h, col, rough: 0.94, normalScale: 0.9 };
  },
  concrete(N, S) {
    const h = new Float32Array(S * S), col = new Float32Array(S * S * 3);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const base = N.fbm(x / S * 5, y / S * 5, 5, 2.2, 0.5, 5);
      const crack = 1 - Math.abs(N.fbm(x / S * 3 + 9, y / S * 3 + 9, 4, 2, 0.5, 3) * 2 - 1);
      h[i] = base * 0.85 + crack * crack * 0.35;
      const g = 128 + base * 42 - crack * crack * 60;
      col[i * 3] = g * 1.02; col[i * 3 + 1] = g; col[i * 3 + 2] = g * 0.97;
    }
    return { h, col, rough: 0.85, normalScale: 0.8 };
  },
  tiles(N, S) {
    const h = new Float32Array(S * S), col = new Float32Array(S * S * 3);
    const T = S / 4, groove = 2.2;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const tx = Math.floor(x / T), ty = Math.floor(y / T);
      const jit = N.noise2(tx * 7.3, ty * 3.1, 16);
      const fx = x % T, fy = y % T;
      const edge = Math.min(fx, fy, T - fx, T - fy);
      const gr = clamp01(1 - edge / groove);
      const tex = N.fbm(x / S * 10, y / S * 10, 4, 2, 0.5, 10) * 0.12;
      h[i] = tex + gr * 0.5;
      const g = 150 + jit * 30 + tex * 60;
      col[i * 3] = g; col[i * 3 + 1] = g * 1.02; col[i * 3 + 2] = g * 1.05;
      if (gr > 0.4) { const d = gr * 55; col[i * 3] -= d; col[i * 3 + 1] -= d; col[i * 3 + 2] -= d; }
    }
    return { h, col, rough: 0.42, normalScale: 1.15 };
  },
  brushed(N, S) {
    const h = new Float32Array(S * S), col = new Float32Array(S * S * 3);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const streak = N.noise2(x * 0.35, y * 0.02 + (y * 7919 % 13), S) * 0.6 + N.noise2(x * 2.1, y * 0.08, S) * 0.4;
      const pat = N.fbm(x / S * 3, y / S * 3, 3, 2, 0.5, 3);
      h[i] = streak * 0.7 + pat * 0.3;
      const g = 118 + streak * 42 + pat * 26;
      col[i * 3] = g * 0.94; col[i * 3 + 1] = g * 0.98; col[i * 3 + 2] = g * 1.06;
    }
    return { h, col, rough: 0.3, normalScale: 0.55 };
  },
  hull(N, S) { // placas de nave espacial
    const h = new Float32Array(S * S), col = new Float32Array(S * S * 3);
    const T = S / 4, seam = 2.6;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const px = x % T, py = y % T;
      const ex = Math.min(px, T - px), ey = Math.min(py, T - py);
      const sx = clamp01(1 - ex / seam), sy = clamp01(1 - ey / seam);
      const seamV = Math.max(sx, sy);
      const pat = N.fbm(x / S * 6, y / S * 6, 4, 2, 0.55, 6);
      // remaches en esquinas
      let rivet = 0;
      for (const [rx, ry] of [[7, 7], [T - 7, 7], [7, T - 7], [T - 7, T - 7]]) {
        const d = Math.hypot(px - rx, py - ry);
        rivet = Math.max(rivet, clamp01(1 - Math.abs(d - 2.2) / 1.8) * 0.55);
      }
      h[i] = pat * 0.3 + seamV * 0.55 + rivet * 0.6;
      const jit = N.noise2(Math.floor(x / T) * 5.7, Math.floor(y / T) * 9.2, 16);
      let g = 96 + pat * 26 + jit * 26 - seamV * 46 + rivet * 40;
      col[i * 3] = g * 0.96; col[i * 3 + 1] = g * 1.0; col[i * 3 + 2] = g * 1.1;
    }
    return { h, col, rough: 0.45, normalScale: 1.1 };
  },
  grass(N, S) {
    const h = new Float32Array(S * S), col = new Float32Array(S * S * 3);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const blades = N.noise2(x * 1.7, y * 1.7, S) * 0.5 + N.noise2(x * 3.3 + 40, y * 3.3 + 40, S) * 0.5;
      const patch = N.fbm(x / S * 4, y / S * 4, 4, 2, 0.5, 4);
      h[i] = blades * 0.6 + patch * 0.4;
      const g = blades * 0.5 + patch * 0.5;
      col[i * 3] = 18 + g * 26; col[i * 3 + 1] = 44 + g * 54; col[i * 3 + 2] = 16 + g * 20;
    }
    return { h, col, rough: 0.95, normalScale: 0.7 };
  },
  sand(N, S) {
    const h = new Float32Array(S * S), col = new Float32Array(S * S * 3);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const ripple = Math.sin((x + N.fbm(x / S * 3, y / S * 3, 3, 2, 0.5, 3) * 22) / S * 25) * 0.5 + 0.5;
      const grain = N.noise2(x * 1.3, y * 1.3, S);
      h[i] = ripple * 0.5 + grain * 0.3 + N.fbm(x / S * 6, y / S * 6, 3, 2, 0.5, 6) * 0.2;
      const g = grain * 0.4 + ripple * 0.6;
      col[i * 3] = 196 + g * 38; col[i * 3 + 1] = 172 + g * 40; col[i * 3 + 2] = 128 + g * 44;
    }
    return { h, col, rough: 0.9, normalScale: 0.55 };
  },
  hexpanel(N, S) { // panel hexagonal futurista
    const h = new Float32Array(S * S), col = new Float32Array(S * S * 3);
    const R = S / 5;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const rowH = R * 1.5;
      const row = Math.floor(y / rowH);
      const off = (row % 2) * R;
      const cx = Math.round((x - off) / (R * Math.sqrt(3))) * R * Math.sqrt(3) + off;
      const cy = row * rowH;
      const d = Math.hypot((x - cx) * 0.866, (y - cy));
      const edge = clamp01(1 - Math.abs(d - R * 0.92) / 2.4);
      const pat = N.fbm(x / S * 8, y / S * 8, 4, 2, 0.5, 8);
      h[i] = pat * 0.25 + edge * 0.75;
      let g = 58 + pat * 22 + edge * 90;
      col[i * 3] = g * 0.9; col[i * 3 + 1] = g * 1.04; col[i * 3 + 2] = g * 1.16;
    }
    return { h, col, rough: 0.5, normalScale: 1.2 };
  },
  marble(N, S) {
    const h = new Float32Array(S * S), col = new Float32Array(S * S * 3);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const vein = 1 - Math.abs(N.fbm(x / S * 4 + 3, y / S * 4 + 3, 5, 2.3, 0.55, 4) * 2 - 1);
      const pat = N.fbm(x / S * 7, y / S * 7, 4, 2, 0.5, 7);
      h[i] = pat * 0.6 + vein * vein * 0.5;
      const g = 190 + pat * 40 - vein * vein * 110;
      col[i * 3] = g; col[i * 3 + 1] = g * 0.99; col[i * 3 + 2] = g * 0.98;
    }
    return { h, col, rough: 0.22, normalScale: 0.6 };
  },
  neon(N, S) { // suelo neón para el racing nocturno
    const h = new Float32Array(S * S), col = new Float32Array(S * S * 3);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const pat = N.fbm(x / S * 6, y / S * 6, 4, 2, 0.5, 6);
      const gx = clamp01(1 - Math.abs((x % (S / 4)) - 2) / 1.6);
      const gy = clamp01(1 - Math.abs((y % (S / 4)) - 2) / 1.6);
      const line = Math.max(gx, gy);
      h[i] = pat * 0.4 + line * 0.6;
      col[i * 3] = 10 + pat * 14; col[i * 3 + 1] = 12 + pat * 16; col[i * 3 + 2] = 18 + pat * 22;
      if (line > 0.25) {
        const k = line * line;
        col[i * 3] += 30 * k; col[i * 3 + 1] += 210 * k; col[i * 3 + 2] += 255 * k;
      }
    }
    return { h, col, rough: 0.35, normalScale: 0.9, emissiveBoost: true };
  }
};

/* -------- Conversión altura → normal map (Sobel) -------- */
function heightToNormal(h, S, strength = 1) {
  const out = new Uint8Array(S * S * 4);
  const at = (x, y) => h[((y + S) % S) * S + ((x + S) % S)];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1)) -
               (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1));
    const dy = (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1)) -
               (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1));
    const nx = dx * strength * 2.2, ny = dy * strength * 2.2, nz = 1;
    const l = Math.hypot(nx, ny, nz) || 1;
    const i = (y * S + x) * 4;
    out[i] = (nx / l * 0.5 + 0.5) * 255;
    out[i + 1] = (ny / l * 0.5 + 0.5) * 255;
    out[i + 2] = (nz / l * 0.5 + 0.5) * 255;
    out[i + 3] = 255;
  }
  return out;
}

/* -------- Generador de sets de texturas GL -------- */
class TexFactory {
  constructor(renderer) { this.r = renderer; this.gl = renderer.gl; this.cache = {}; }
  _upload(data, S, repeat = true) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, S, S, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.generateMipmap(gl.TEXTURE_2D);
    const mode = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, mode);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, mode);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (this.r.aniso) {
      const max = gl.getParameter(this.r.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
      gl.texParameterf(gl.TEXTURE_2D, this.r.aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, max));
    }
    return tex;
  }
  get(kind, S = 256, seed = 1337) {
    const key = kind + '_' + S + '_' + seed;
    if (this.cache[key]) return this.cache[key];
    const def = TEX_KINDS[kind]; if (!def) throw new Error('TEX_KIND_UNKNOWN:' + kind);
    const N = makeNoise(seed);
    const { h, col, rough, normalScale } = def(N, S);
    const albedo = new Uint8Array(S * S * 4);
    for (let i = 0; i < S * S; i++) {
      albedo[i * 4] = clamp01(col[i * 3] / 255) * 255;
      albedo[i * 4 + 1] = clamp01(col[i * 3 + 1] / 255) * 255;
      albedo[i * 4 + 2] = clamp01(col[i * 3 + 2] / 255) * 255;
      albedo[i * 4 + 3] = 255;
    }
    const normal = heightToNormal(h, S, 1);
    const set = {
      albedo: { tex: this._upload(albedo, S), w: S, h: S },
      normal: { tex: this._upload(normal, S), w: S, h: S },
      rough, normalScale
    };
    this.cache[key] = set;
    return set;
  }
  solid(r, g, b, a = 255) {
    const key = `solid_${r}_${g}_${b}_${a}`;
    if (this.cache[key]) return this.cache[key];
    const d = new Uint8Array([r, g, b, a]);
    const tex = { tex: this._upload(d, 1, false), w: 1, h: 1 };
    this.cache[key] = tex;
    return tex;
  }
  /* gradiente vertical 1D para el cielo */
  skyGradient(stops) {
    const S = 256;
    const data = new Uint8Array(S * 4);
    for (let y = 0; y < S; y++) {
      const t = y / (S - 1); // 0 = arriba, 1 = horizonte
      let a = stops[0], b = stops[stops.length - 1];
      for (let s = 0; s < stops.length - 1; s++) {
        if (t >= stops[s].t && t <= stops[s + 1].t) {
          const k = (t - stops[s].t) / (stops[s + 1].t - stops[s].t || 1);
          a = stops[s]; b = stops[s + 1]; break;
        }
      }
      const k = clamp01((t - a.t) / ((b.t - a.t) || 1));
      data[y * 4] = lerp(a.c[0], b.c[0], k);
      data[y * 4 + 1] = lerp(a.c[1], b.c[1], k);
      data[y * 4 + 2] = lerp(a.c[2], b.c[2], k);
      data[y * 4 + 3] = 255;
    }
    return { tex: this._upload(data, 1, false), w: 1, h: S };
  }
}

/* -------- Geometría -------- */
class GeoFactory {
  constructor(renderer) { this.r = renderer; this.gl = renderer.gl; }
  _upload(geo) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    const stride = (3 + 3 + 2) * 4;
    const interleaved = new Float32Array(geo.count * 8);
    for (let i = 0; i < geo.count; i++) {
      interleaved[i * 8] = geo.pos[i * 3]; interleaved[i * 8 + 1] = geo.pos[i * 3 + 1]; interleaved[i * 8 + 2] = geo.pos[i * 3 + 2];
      interleaved[i * 8 + 3] = geo.nor[i * 3]; interleaved[i * 8 + 4] = geo.nor[i * 3 + 1]; interleaved[i * 8 + 5] = geo.nor[i * 3 + 2];
      interleaved[i * 8 + 6] = geo.uv[i * 2]; interleaved[i * 8 + 7] = geo.uv[i * 2 + 1];
    }
    gl.bufferData(gl.ARRAY_BUFFER, interleaved, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 24);
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(geo.idx), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, count: geo.idx.length };
  }
  box(sx = 1, sy = 1, sz = 1, uvS = 1) {
    const x = sx / 2, y = sy / 2, z = sz / 2;
    const pos = [], nor = [], uv = [], idx = [];
    const faces = [
      { n: [0, 0, 1], v: [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]] },
      { n: [0, 0, -1], v: [[x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]] },
      { n: [1, 0, 0], v: [[x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z]] },
      { n: [-1, 0, 0], v: [[-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z]] },
      { n: [0, 1, 0], v: [[-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z]] },
      { n: [0, -1, 0], v: [[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z]] }
    ];
    for (const f of faces) {
      const b = pos.length / 3;
      for (const p of f.v) { pos.push(p[0], p[1], p[2]); nor.push(f.n[0], f.n[1], f.n[2]); }
      uv.push(0, 0, uvS, 0, uvS, uvS, 0, uvS);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    return this._upload({ count: pos.length / 3, pos, nor, uv, idx });
  }
  sphere(r = 1, seg = 24, ring = 16, skyUV = false) {
    const pos = [], nor = [], uv = [], idx = [];
    for (let j = 0; j <= ring; j++) {
      const phi = j / ring * Math.PI;
      const sinP = Math.sin(phi), cosP = Math.cos(phi);
      for (let i = 0; i <= seg; i++) {
        const th = i / seg * Math.PI * 2;
        const nx = sinP * Math.cos(th), ny = cosP, nz = sinP * Math.sin(th);
        pos.push(nx * r, ny * r, nz * r); nor.push(nx, ny, nz);
        if (skyUV) uv.push(i / seg, clamp01(1 - (phi / Math.PI)));
        else uv.push(i / seg * 2, j / ring);
      }
    }
    for (let j = 0; j < ring; j++) for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i, b = a + seg + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    return this._upload({ count: pos.length / 3, pos, nor, uv, idx });
  }
  plane(w = 1, d = 1, sx = 1, sz = 1, uvS = 1, uvWorld = false) {
    const pos = [], nor = [], uv = [], idx = [];
    for (let j = 0; j <= sz; j++) for (let i = 0; i <= sx; i++) {
      const px = -w / 2 + w * i / sx, pz = -d / 2 + d * j / sz;
      pos.push(px, 0, pz); nor.push(0, 1, 0);
      uv.push(uvWorld ? (px * uvS / 4 + 0.5) : i / sx * uvS, uvWorld ? (pz * uvS / 4 + 0.5) : j / sz * uvS);
    }
    for (let j = 0; j < sz; j++) for (let i = 0; i < sx; i++) {
      const a = j * (sx + 1) + i, b = a + sx + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    return this._upload({ count: pos.length / 3, pos, nor, uv, idx });
  }
  cylinder(rT = 0.5, rB = 0.5, h = 1, seg = 20, cap = true) {
    const pos = [], nor = [], uv = [], idx = [];
    const half = h / 2;
    for (let i = 0; i <= seg; i++) {
      const th = i / seg * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
      const slope = (rB - rT) / h;
      pos.push(c * rT, half, s * rT); nor.push(c, slope, s); uv.push(i / seg, 1);
      pos.push(c * rB, -half, s * rB); nor.push(c, slope, s); uv.push(i / seg, 0);
    }
    for (let i = 0; i < seg; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    if (cap) {
      for (const [rr, yy, ny] of [[rT, half, 1], [rB, -half, -1]]) {
        const b = pos.length / 3;
        pos.push(0, yy, 0); nor.push(0, ny, 0); uv.push(0.5, 0.5);
        for (let i = 0; i <= seg; i++) {
          const th = i / seg * Math.PI * 2;
          pos.push(Math.cos(th) * rr, yy, Math.sin(th) * rr);
          nor.push(0, ny, 0); uv.push(Math.cos(th) * 0.5 + 0.5, Math.sin(th) * 0.5 + 0.5);
        }
        for (let i = 0; i < seg; i++) ny > 0 ? idx.push(b, b + 1 + i, b + 2 + i) : idx.push(b, b + 2 + i, b + 1 + i);
      }
    }
    return this._upload({ count: pos.length / 3, pos, nor, uv, idx });
  }
  /* une geometrías YA subidas (no puede: se hace a nivel de nodos con padres) */
}

if (typeof window !== 'undefined') window.NovaTex = { makeNoise, TexFactory, GeoFactory, TEX_KINDS, heightToNormal };
if (typeof module !== 'undefined') module.exports = { makeNoise, TexFactory, GeoFactory, TEX_KINDS, heightToNormal, lerp, clamp01 };
