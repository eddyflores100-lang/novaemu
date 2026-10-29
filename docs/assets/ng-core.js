/* ============================================================
   NovaEmu NG — núcleo de emulación de NUEVA GENERACIÓN
   Pipeline reimplementado de la escena real (ver /estudio/ESTUDIO.md):
   - Command buffer + tabla de dispatch  (SharpEmu: GpuCommandInterpreter.cs / PacketDispatchTable.cs)
   - Conformance GPU vs referencia CPU   (SharpEmu: sentinela 0xCAFEBABE)
   - Golden frames / hash de frame       (KytyPS5: comparación byte a byte en tests)
   - Cadena de backends con fallback     (AnyPS5: libSceSysmodule ModuleTable)
   - Frame dumps para depuración         (AnyPS5: APS5_DUMP_FRAMES)
   ============================================================ */
(function () {
'use strict';
const NG = (window.NG = window.NG || {});

/* ---------------- mat4 (column-major, estilo WebGL) ---------------- */
const M = NG.m4 = {};
M.ident = function () { return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); };
M.mul = function (a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c*4+r] = a[r]*b[c*4] + a[4+r]*b[c*4+1] + a[8+r]*b[c*4+2] + a[12+r]*b[c*4+3];
  }
  return o;
};
M.nmul = function () { let m = arguments[0]; for (let i = 1; i < arguments.length; i++) m = M.mul(m, arguments[i]); return m; };
M.perspective = function (fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  const o = new Float32Array(16);
  o[0] = f / aspect; o[5] = f; o[10] = (far + near) * nf; o[11] = -1;
  o[14] = 2 * far * near * nf;
  return o;
};
M.lookAt = function (e, c, u) {
  let zx = e[0]-c[0], zy = e[1]-c[1], zz = e[2]-c[2];
  let l = Math.hypot(zx, zy, zz) || 1; zx/=l; zy/=l; zz/=l;
  let xx = u[1]*zz - u[2]*zy, xy = u[2]*zx - u[0]*zz, xz = u[0]*zy - u[1]*zx;
  l = Math.hypot(xx, xy, xz) || 1; xx/=l; xy/=l; xz/=l;
  const yx = zy*xz - zz*xy, yy = zz*xx - zx*xz, yz = zx*xy - zy*xx;
  const o = new Float32Array(16);
  o[0]=xx; o[1]=yx; o[2]=zx; o[4]=xy; o[5]=yy; o[6]=zy; o[8]=xz; o[9]=yz; o[10]=zz;
  o[12] = -(xx*e[0]+xy*e[1]+xz*e[2]); o[13] = -(yx*e[0]+yy*e[1]+yz*e[2]); o[14] = -(zx*e[0]+zy*e[1]+zz*e[2]); o[15]=1;
  return o;
};
M.trans = function (x, y, z) { const m = M.ident(); m[12]=x; m[13]=y; m[14]=z; return m; };
M.scaleM = function (x, y, z) { const m = M.ident(); m[0]=x; m[5]=y; m[10]=z; return m; };
M.rotX = function (a) { const c=Math.cos(a), s=Math.sin(a), m=M.ident(); m[5]=c; m[6]=s; m[9]=-s; m[10]=c; return m; };
M.rotY = function (a) { const c=Math.cos(a), s=Math.sin(a), m=M.ident(); m[0]=c; m[2]=-s; m[8]=s; m[10]=c; return m; };
M.rotZ = function (a) { const c=Math.cos(a), s=Math.sin(a), m=M.ident(); m[0]=c; m[1]=s; m[4]=-s; m[5]=c; return m; };
M.trs = function (p, ry, s) { return M.nmul(M.trans(p[0],p[1],p[2]), M.rotY(ry||0), M.scaleM(s||1, s||1, s||1)); };

/* ---------------- vec3 ---------------- */
const v3 = NG.v3 = {};
v3.add = (a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
v3.sub = (a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
v3.mul = (a,s)=>[a[0]*s,a[1]*s,a[2]*s];
v3.dot = (a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
v3.cross = (a,b)=>[a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
v3.len = a=>Math.hypot(a[0],a[1],a[2]);
v3.norm = a=>{ const l=v3.len(a)||1; return [a[0]/l,a[1]/l,a[2]/l]; };
v3.lerp = (a,b,t)=>[a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t];

/* ---------------- RNG determinista (mulberry32) ---------------- */
NG.RNG = function (seed) { this.s = (seed >>> 0) || 0x9E3779B9; };
NG.RNG.prototype.next = function () {
  let t = (this.s += 0x6D2B79F5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
NG.RNG.prototype.range = function (a, b) { return a + (b - a) * this.next(); };
NG.RNG.prototype.int = function (a, b) { return Math.floor(this.range(a, b + 1)); };
NG.RNG.prototype.pick = function (arr) { return arr[Math.floor(this.next()*arr.length)]; };
NG.RNG.prototype.save = function () { return this.s; };
NG.RNG.prototype.load = function (s) { this.s = s >>> 0; };

/* ---------------- color ---------------- */
NG.c = {
  hex: function (h) {
    if (Array.isArray(h)) return h;
    const n = typeof h === 'number' ? h : parseInt(String(h).replace('#',''), 16);
    return [((n>>16)&255)/255, ((n>>8)&255)/255, (n&255)/255];
  },
  mul: (c, f) => [c[0]*f, c[1]*f, c[2]*f],
  mix: (a, b, t) => [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t]
};

/* ---------------- constructores de mallas ---------------- */
const B = NG.mesh = {};
function pushTri(idx, a, b, c) { idx.push(a, b, c); }
B.box = function (w, h, d, col, topCol) {
  const x=w/2, y=h/2, z=d/2, c=NG.c.hex(col), t=NG.c.hex(topCol||col);
  const P=[], N=[], C=[], I=[];
  function face(vs, n, cc) {
    const base = P.length/3;
    for (const v of vs) { P.push(v[0],v[1],v[2]); N.push(n[0],n[1],n[2]); C.push(cc[0],cc[1],cc[2]); }
    pushTri(I, base, base+1, base+2); pushTri(I, base, base+2, base+3);
  }
  face([[-x,-y, z],[x,-y, z],[x, y, z],[-x, y, z]], [0,0,1], c);
  face([[ x,-y,-z],[-x,-y,-z],[-x, y,-z],[ x, y,-z]], [0,0,-1], c);
  face([[ x,-y, z],[ x,-y,-z],[ x, y,-z],[ x, y, z]], [1,0,0], c);
  face([[-x,-y,-z],[-x,-y, z],[-x, y, z],[-x, y,-z]], [-1,0,0], c);
  face([[-x, y, z],[ x, y, z],[ x, y,-z],[-x, y,-z]], [0,1,0], t);
  face([[-x,-y,-z],[ x,-y,-z],[ x,-y, z],[-x,-y, z]], [0,-1,0], c);
  return { pos:P, nrm:N, col:C, idx:I };
};
B.plane = function (w, d, segX, segZ, col) {
  const c = NG.c.hex(col), P=[], N=[], C=[], I=[];
  for (let iz=0; iz<=segZ; iz++) for (let ix=0; ix<=segX; ix++) {
    P.push(-w/2 + w*ix/segX, 0, -d/2 + d*iz/segZ);
    N.push(0,1,0); C.push(c[0],c[1],c[2]);
  }
  const row = segX+1;
  for (let iz=0; iz<segZ; iz++) for (let ix=0; ix<segX; ix++) {
    const a=iz*row+ix, b=a+1, cc=a+row, dd=cc+1;
    pushTri(I, a, cc, b); pushTri(I, b, cc, dd);
  }
  return { pos:P, nrm:N, col:C, idx:I };
};
B.sphere = function (r, latN, lonN, col) {
  const c = NG.c.hex(col), P=[], N=[], C=[], I=[];
  for (let la=0; la<=latN; la++) {
    const th = la/latN*Math.PI, st=Math.sin(th), ct=Math.cos(th);
    for (let lo=0; lo<=lonN; lo++) {
      const ph = lo/lonN*2*Math.PI;
      const n=[st*Math.cos(ph), ct, st*Math.sin(ph)];
      P.push(n[0]*r, n[1]*r, n[2]*r); N.push(n[0],n[1],n[2]); C.push(c[0],c[1],c[2]);
    }
  }
  for (let la=0; la<latN; la++) for (let lo=0; lo<lonN; lo++) {
    const a=la*(lonN+1)+lo, b=a+lonN+1;
    pushTri(I, a, b, a+1); pushTri(I, b, b+1, a+1);
  }
  return { pos:P, nrm:N, col:C, idx:I };
};
B.cylinder = function (rT, rB, h, seg, col) {
  const c = NG.c.hex(col), P=[], N=[], C=[], I=[];
  for (let i=0; i<=seg; i++) {
    const a = i/seg*2*Math.PI, cx=Math.cos(a), sz=Math.sin(a);
    P.push(cx*rT, h/2, sz*rT); N.push(cx,0,sz); C.push(c[0],c[1],c[2]);
    P.push(cx*rB,-h/2, sz*rB); N.push(cx,0,sz); C.push(c[0],c[1],c[2]);
  }
  for (let i=0; i<seg; i++) { const a=i*2; pushTri(I, a, a+1, a+2); pushTri(I, a+2, a+1, a+3); }
  const bT = P.length/3;
  P.push(0,h/2,0); N.push(0,1,0); C.push(c[0],c[1],c[2]);
  for (let i=0; i<=seg; i++) { const a=i/seg*2*Math.PI; P.push(Math.cos(a)*rT,h/2,Math.sin(a)*rT); N.push(0,1,0); C.push(c[0],c[1],c[2]); }
  for (let i=0; i<seg; i++) pushTri(I, bT, bT+1+i, bT+2+i);
  const bB = P.length/3;
  P.push(0,-h/2,0); N.push(0,-1,0); C.push(c[0],c[1],c[2]);
  for (let i=0; i<=seg; i++) { const a=i/seg*2*Math.PI; P.push(Math.cos(a)*rB,-h/2,Math.sin(a)*rB); N.push(0,-1,0); C.push(c[0],c[1],c[2]); }
  for (let i=0; i<seg; i++) pushTri(I, bB, bB+2+i, bB+1+i);
  return { pos:P, nrm:N, col:C, idx:I };
};
B.torus = function (R, r, segR, segT, col) {
  const c = NG.c.hex(col), P=[], N=[], C=[], I=[];
  for (let i=0; i<=segR; i++) {
    const u = i/segR*2*Math.PI, cu=Math.cos(u), su=Math.sin(u);
    for (let j=0; j<=segT; j++) {
      const v = j/segT*2*Math.PI, cv=Math.cos(v), sv=Math.sin(v);
      P.push((R+r*cv)*cu, r*sv, (R+r*cv)*su);
      N.push(cv*cu, sv, cv*su); C.push(c[0],c[1],c[2]);
    }
  }
  for (let i=0; i<segR; i++) for (let j=0; j<segT; j++) {
    const a=i*(segT+1)+j, b=a+segT+1;
    pushTri(I, a, b, a+1); pushTri(I, b, b+1, a+1);
  }
  return { pos:P, nrm:N, col:C, idx:I };
};
B.ribbon = function (samples, half, colFn) {
  // samples: [{p:[x,y,z], n:[x,y,z]}] a lo largo de una curva; colFn(i) → color del anillo
  const P=[], N=[], C=[], I=[];
  for (let i=0; i<samples.length; i++) {
    const s = samples[i], col = NG.c.hex(colFn(i));
    for (const side of [-1, 1]) {
      P.push(s.p[0]+s.n[0]*half*side, s.p[1]+s.n[1]*half*side, s.p[2]+s.n[2]*half*side);
      N.push(0,1,0); C.push(col[0],col[1],col[2]);
    }
    if (i>0) {
      const a=(i-1)*2;
      pushTri(I, a, a+1, a+2); pushTri(I, a+2, a+1, a+3);
    }
  }
  return { pos:P, nrm:N, col:C, idx:I };
};
B.merge = function (parts) {
  // parts: [{mesh, at:[x,y,z], ry?, scale?, recol?}]
  const P=[], N=[], C=[], I=[];
  for (const part of parts) {
    let m = part.mesh;
    const rot = part.ry ? M.rotY(part.ry) : null;
    const sc = part.scale || 1;
    const base = P.length/3;
    for (let i=0; i<m.pos.length; i+=3) {
      let x=m.pos[i]*sc, y=m.pos[i+1]*sc, z=m.pos[i+2]*sc;
      if (rot) { const nx=rot[0]*x+rot[4]*y+rot[8]*z, ny=rot[1]*x+rot[5]*y+rot[9]*z, nz=rot[2]*x+rot[6]*y+rot[10]*z; x=nx; y=ny; z=nz; }
      P.push(x+(part.at?part.at[0]:0), y+(part.at?part.at[1]:0), z+(part.at?part.at[2]:0));
      N.push(m.nrm[i], m.nrm[i+1], m.nrm[i+2]);
      const col = part.recol ? NG.c.hex(part.recol) : [m.col[i], m.col[i+1], m.col[i+2]];
      C.push(col[0], col[1], col[2]);
    }
    for (const i of m.idx) I.push(base + i);
  }
  return { pos:P, nrm:N, col:C, idx:I };
};

/* ---------------- Catmull-Rom (para circuito y rutas) ---------------- */
NG.splineCR = function (pts, samples, closed) {
  // devuelve {p:[x,y,z], t:[x,y,z], n:[x,y,z]} × samples  (n = perpendicular en XZ)
  const out = [], n = pts.length;
  const get = i => pts[((i % n) + n) % n];
  const total = closed ? samples : samples - 1;
  for (let s = 0; s < samples; s++) {
    const g = s / total * (closed ? n : n - 1);
    const i = Math.floor(g), f = g - i;
    const p0=get(i-1), p1=get(i), p2=get(i+1), p3=get(i+2);
    const cr = (a,b,c,d,t) => {
      const t2=t*t, t3=t2*t;
      return 0.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t2+(-a+3*b-3*c+d)*t3);
    };
    const p = [
      cr(p0[0],p1[0],p2[0],p3[0],f),
      cr(p0[1],p1[1],p2[1],p3[1],f),
      cr(p0[2],p1[2],p2[2],p3[2],f)
    ];
    const dt = 0.001, pa = [
      cr(p0[0],p1[0],p2[0],p3[0],Math.max(0,f-dt)),
      cr(p0[1],p1[1],p2[1],p3[1],Math.max(0,f-dt)),
      cr(p0[2],p1[2],p2[2],p3[2],Math.max(0,f-dt))
    ];
    const pb = [
      cr(p0[0],p1[0],p2[0],p3[0],Math.min(1,f+dt)),
      cr(p0[1],p1[1],p2[1],p3[1],Math.min(1,f+dt)),
      cr(p0[2],p1[2],p2[2],p3[2],Math.min(1,f+dt))
    ];
    let t = v3.norm(v3.sub(pb, pa));
    if (!isFinite(t[0])) t = [0,0,1];
    const nn = v3.norm([-t[2], 0, t[0]]);
    out.push({ p, t, n: nn });
  }
  return out;
};

/* ============================================================
   NGGPU — GPU virtual con command buffer (estilo GNM/AGC)
   ============================================================ */
const VERT_STD = [
  'attribute vec3 aPos; attribute vec3 aNrm; attribute vec3 aCol;',
  'uniform mat4 uProj, uView, uModel; uniform vec3 uTint;',
  'varying vec3 vCol; varying vec3 vNrm; varying vec3 vWorld;',
  'void main(){',
  '  vec4 w = uModel * vec4(aPos, 1.0);',
  '  vWorld = w.xyz;',
  '  gl_Position = uProj * uView * w;',
  '  vNrm = mat3(uModel[0].xyz, uModel[1].xyz, uModel[2].xyz) * aNrm;',
  '  vCol = aCol * uTint;',
  '}'
].join('\n');

const FRAG_STD = [
  'precision mediump float;',
  'varying vec3 vCol; varying vec3 vNrm; varying vec3 vWorld;',
  'uniform vec3 uLightDir, uLightCol, uAmbient, uFogCol, uCamPos;',
  'uniform float uFogNear, uFogFar, uUnlit;',
  'void main(){',
  '  vec3 n = normalize(vNrm);',
  '  float lam = max(dot(n, -uLightDir), 0.0);',
  '  vec3 c = uUnlit > 0.5 ? vCol : vCol * (uAmbient + uLightCol * lam);',
  '  float f = clamp((distance(vWorld, uCamPos) - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);',
  '  gl_FragColor = vec4(mix(c, uFogCol, f), 1.0);',
  '}'
].join('\n');

const VERT_PT = [
  'attribute vec3 aPos; attribute vec3 aCol; attribute float aSize;',
  'uniform mat4 uProj, uView; uniform float uPtScale;',
  'varying vec3 vCol;',
  'void main(){',
  '  vec4 mv = uView * vec4(aPos, 1.0);',
  '  gl_Position = uProj * mv;',
  '  gl_PointSize = clamp(uPtScale * aSize / max(0.2, -mv.z), 1.0, 64.0);',
  '  vCol = aCol;',
  '}'
].join('\n');

const FRAG_PT = [
  'precision mediump float; varying vec3 vCol;',
  'void main(){',
  '  vec2 d = gl_PointCoord - 0.5;',
  '  if (dot(d, d) > 0.25) discard;',
  '  gl_FragColor = vec4(vCol, 1.0);',
  '}'
].join('\n');

function compile(gl, vsSrc, fsSrc) {
  function sh(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error('shader: ' + gl.getShaderInfoLog(s));
    }
    return s;
  }
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error('link: ' + gl.getProgramInfoLog(p));
  }
  return p;
}

NG.NGGPU = function (canvas) {
  this.canvas = canvas;
  this.log = [];
  this.backend = null;
  this.drawCalls = 0;
  this.warned = {};
  this._meshes = {};
  this._gl = null;
  const opts = { antialias: false, preserveDrawingBuffer: true, powerPreference: 'low-power' };
  try {
    this._gl = canvas.getContext('webgl2', opts);
    if (this._gl) { this.backend = 'webgl2'; }
  } catch (e) { /* fallback abajo */ }
  if (!this._gl) {
    try {
      this._gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
      if (this._gl) this.backend = 'webgl1';
    } catch (e) { /* sin GPU */ }
  }
  if (this._gl) {
    const gl = this._gl;
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    try {
      this._progStd = compile(gl, VERT_STD, FRAG_STD);
      this._progPt  = compile(gl, VERT_PT, FRAG_PT);
    } catch (e) {
      this.logLine('GPU', 'fallo compilando shaders: ' + e.message);
      this._gl = null; this.backend = null;
    }
  }
  if (!this._gl) { this.backend = 'null'; this.logLine('GPU', 'sin GPU → backend nulo (la VM sigue funcionando)'); }
  else this.logLine('GPU', 'backend activo: ' + this.backend);

  const cv = canvas;
  const self = this;
  cv.addEventListener('webglcontextlost', function (e) {
    e.preventDefault(); self._lost = true; self.logLine('GPU', 'contexto perdido — recuperando');
  }, false);
  cv.addEventListener('webglcontextrestored', function () {
    self._lost = false; self.logLine('GPU', 'contexto restaurado');
  }, false);

  // Tabla de dispatch (equivalente a PacketDispatchTable de SharpEmu)
  this.ops = {
    clear:   this._opClear.bind(this),
    camera:  this._opCamera.bind(this),
    light:   this._opLight.bind(this),
    fog:     this._opFog.bind(this),
    mesh:    this._opMesh.bind(this),
    points:  this._opPoints.bind(this)
  };

  this._view = M.ident(); this._proj = M.ident(); this._camPos = [0,0,0];
  this._lightDir = v3.norm([0.5, -1, 0.3]);
  this._lightCol = [1,1,1]; this._ambient = [0.35,0.35,0.4];
  this._fogCol = [0.5,0.6,0.75]; this._fogNear = 60; this._fogFar = 260;
  this._ptScale = 300;
  this._ptBuf = null; this._ptCap = 0;
  this.setViewport(canvas.width || 640, canvas.height || 360);
};
NG.NGGPU.prototype.logLine = function (tag, msg) { this.log.push('[' + tag + '] ' + msg); if (window.NGLog) NGLog.push(tag, msg); };
NG.NGGPU.prototype.setViewport = function (w, h) {
  this.width = Math.max(2, w | 0); this.height = Math.max(2, h | 0);
  if (this.canvas.width !== this.width) this.canvas.width = this.width;
  if (this.canvas.height !== this.height) this.canvas.height = this.height;
  if (this._gl) this._gl.viewport(0, 0, this.width, this.height);
};
NG.NGGPU.prototype.uploadMesh = function (id, m) {
  if (!this._gl) { this._meshes[id] = { count: m.idx.length }; return; }
  const gl = this._gl;
  const n = m.pos.length / 3;
  const inter = new Float32Array(n * 9);
  for (let i = 0; i < n; i++) {
    inter[i*9]   = m.pos[i*3];   inter[i*9+1] = m.pos[i*3+1]; inter[i*9+2] = m.pos[i*3+2];
    inter[i*9+3] = m.nrm[i*3];   inter[i*9+4] = m.nrm[i*3+1]; inter[i*9+5] = m.nrm[i*3+2];
    inter[i*9+6] = m.col[i*3];   inter[i*9+7] = m.col[i*3+1]; inter[i*9+8] = m.col[i*3+2];
  }
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, inter, gl.STATIC_DRAW);
  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(m.idx), gl.STATIC_DRAW);
  this._meshes[id] = { vbo, ibo, count: m.idx.length };
};
NG.NGGPU.prototype._bindStd = function () {
  const gl = this._gl, p = this._progStd;
  gl.useProgram(p);
  const aPos = gl.getAttribLocation(p, 'aPos');
  const aNrm = gl.getAttribLocation(p, 'aNrm');
  const aCol = gl.getAttribLocation(p, 'aCol');
  gl.enableVertexAttribArray(aPos); gl.enableVertexAttribArray(aNrm); gl.enableVertexAttribArray(aCol);
  gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 36, 0);
  gl.vertexAttribPointer(aNrm, 3, gl.FLOAT, false, 36, 12);
  gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 36, 24);
  this._uStd = {
    proj: gl.getUniformLocation(p, 'uProj'), view: gl.getUniformLocation(p, 'uView'),
    model: gl.getUniformLocation(p, 'uModel'), tint: gl.getUniformLocation(p, 'uTint'),
    ld: gl.getUniformLocation(p, 'uLightDir'), lc: gl.getUniformLocation(p, 'uLightCol'),
    am: gl.getUniformLocation(p, 'uAmbient'), fc: gl.getUniformLocation(p, 'uFogCol'),
    cp: gl.getUniformLocation(p, 'uCamPos'), fn: gl.getUniformLocation(p, 'uFogNear'),
    ff: gl.getUniformLocation(p, 'uFogFar'), un: gl.getUniformLocation(p, 'uUnlit')
  };
};
NG.NGGPU.prototype._opClear = function (c) {
  if (!this._gl) return;
  const gl = this._gl;
  gl.clearColor(c.col[0], c.col[1], c.col[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
};
NG.NGGPU.prototype._opCamera = function (c) {
  this._view = c.view; this._proj = c.proj; this._camPos = c.pos || [0,0,0];
};
NG.NGGPU.prototype._opLight = function (c) {
  if (c.dir) this._lightDir = v3.norm(c.dir);
  if (c.col) this._lightCol = c.col;
  if (c.ambient) this._ambient = c.ambient;
};
NG.NGGPU.prototype._opFog = function (c) {
  if (c.col) this._fogCol = c.col;
  if (c.near !== undefined) this._fogNear = c.near;
  if (c.far !== undefined) this._fogFar = c.far;
};
NG.NGGPU.prototype._opMesh = function (c) {
  if (!this._gl) return;
  const gl = this._gl, m = this._meshes[c.id];
  if (!m) { this.logLine('GPU', 'malla no subida: ' + c.id); return; }
  if (!this._uStd) this._bindStd();
  const gl2 = this._gl, u = this._uStd;
  gl2.useProgram(this._progStd);
  gl2.bindBuffer(gl2.ARRAY_BUFFER, m.vbo);
  gl2.bindBuffer(gl2.ELEMENT_ARRAY_BUFFER, m.ibo);
  const aPos = gl2.getAttribLocation(this._progStd, 'aPos');
  const aNrm = gl2.getAttribLocation(this._progStd, 'aNrm');
  const aCol = gl2.getAttribLocation(this._progStd, 'aCol');
  gl2.enableVertexAttribArray(aPos); gl2.enableVertexAttribArray(aNrm); gl2.enableVertexAttribArray(aCol);
  gl2.vertexAttribPointer(aPos, 3, gl2.FLOAT, false, 36, 0);
  gl2.vertexAttribPointer(aNrm, 3, gl2.FLOAT, false, 36, 12);
  gl2.vertexAttribPointer(aCol, 3, gl2.FLOAT, false, 36, 24);
  gl2.uniformMatrix4fv(u.proj, false, this._proj);
  gl2.uniformMatrix4fv(u.view, false, this._view);
  gl2.uniformMatrix4fv(u.model, false, c.model || M.ident());
  const tint = c.tint ? NG.c.hex(c.tint) : [1,1,1];
  gl2.uniform3f(u.tint, tint[0], tint[1], tint[2]);
  gl2.uniform3f(u.ld, this._lightDir[0], this._lightDir[1], this._lightDir[2]);
  gl2.uniform3f(u.lc, this._lightCol[0], this._lightCol[1], this._lightCol[2]);
  gl2.uniform3f(u.am, this._ambient[0], this._ambient[1], this._ambient[2]);
  gl2.uniform3f(u.fc, this._fogCol[0], this._fogCol[1], this._fogCol[2]);
  gl2.uniform3f(u.cp, this._camPos[0], this._camPos[1], this._camPos[2]);
  gl2.uniform1f(u.fn, this._fogNear);
  gl2.uniform1f(u.ff, this._fogFar);
  gl2.uniform1f(u.un, c.unlit ? 1 : 0);
  gl2.drawElements(gl2.TRIANGLES, m.count, gl2.UNSIGNED_SHORT, 0);
  this.drawCalls++;
};
NG.NGGPU.prototype._opPoints = function (c) {
  if (!this._gl) return;
  const gl = this._gl, arr = c.arr;
  if (!arr || !arr.length) return;
  if (!this._progPt) return;
  const n = arr.length / 7;
  if (!this._ptBuf || this._ptCap < n) {
    this._ptBuf = gl.createBuffer();
    this._ptCap = n;
  }
  gl.useProgram(this._progPt);
  gl.bindBuffer(gl.ARRAY_BUFFER, this._ptBuf);
  gl.bufferData(gl.ARRAY_BUFFER, arr, gl.DYNAMIC_DRAW);
  const p = this._progPt;
  const aPos = gl.getAttribLocation(p, 'aPos');
  const aCol = gl.getAttribLocation(p, 'aCol');
  const aSize = gl.getAttribLocation(p, 'aSize');
  gl.enableVertexAttribArray(aPos); gl.enableVertexAttribArray(aCol); gl.enableVertexAttribArray(aSize);
  gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 28, 0);
  gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 28, 12);
  gl.vertexAttribPointer(aSize, 1, gl.FLOAT, false, 28, 24);
  gl.uniformMatrix4fv(gl.getUniformLocation(p, 'uProj'), false, this._proj);
  gl.uniformMatrix4fv(gl.getUniformLocation(p, 'uView'), false, this._view);
  gl.uniform1f(gl.getUniformLocation(p, 'uPtScale'), this._ptScale);
  gl.depthMask(false);
  gl.drawArrays(gl.POINTS, 0, n);
  gl.depthMask(true);
  this.drawCalls++;
};
NG.NGGPU.prototype.submit = function (cmds) {
  // Ejecuta la lista de comandos vía tabla de dispatch; op desconocido → aviso, el frame continúa
  this.drawCalls = 0;
  for (let i = 0; i < cmds.length; i++) {
    const c = cmds[i];
    const fn = this.ops[c.op];
    if (fn) { try { fn(c); } catch (e) { this.logLine('GPU', 'error en op ' + c.op + ': ' + e.message); } }
    else if (!this.warned[c.op]) { this.warned[c.op] = 1; this.logLine('GPU', 'op desconocido ignorado: ' + c.op); }
  }
};
NG.NGGPU.prototype.readPixelsHash = function () {
  // Golden frame: hash FNV-1a del framebuffer (KytyPS5 compara bytes; aquí hash estable por entorno)
  if (!this._gl) return 'null';
  const gl = this._gl;
  const w = this.width, h = this.height;
  const buf = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  let hsh = 0x811c9dc5;
  for (let i = 0; i < buf.length; i++) {
    hsh ^= buf[i];
    hsh = Math.imul(hsh, 0x01000193);
  }
  return ('00000000' + (hsh >>> 0).toString(16)).slice(-8);
};
NG.NGGPU.prototype.frameDump = function () {
  // Equivalente a APS5_DUMP_FRAMES de AnyPS5
  try { return this.canvas.toDataURL('image/png'); } catch (e) { return null; }
};
NG.NGGPU.prototype.stats = function () { return { backend: this.backend, drawCalls: this.drawCalls, w: this.width, h: this.height }; };
})();
