// 3D Earth, satellite and camera for the portfolio journey. Built on three.js (MIT licence).
import * as THREE from 'three';

const DEG = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Unit vector for a latitude/longitude, matching three's SphereGeometry UV layout
export function dirOf(lat, lon, out = new THREE.Vector3()) {
  const la = lat * DEG, lo = lon * DEG;
  return out.set(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo));
}
function latLonOf(v) {
  const n = v.clone().normalize();
  return { lat: Math.asin(clamp(n.y, -1, 1)) / DEG, lon: Math.atan2(-n.z, n.x) / DEG };
}

const EARTH_VERT = `
varying vec2 vUv; varying vec3 vN; varying vec3 vP;
void main(){ vUv=uv; vN=normalize(position); vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;

const EARTH_FRAG = `
precision highp float;
uniform sampler2D tDay,tNight,tRelief,tClouds,tHeight;
uniform vec3 uSun; uniform float uCloudShift,uCloudAmt,uRelief,uHasNight,uHasRelief,uHasClouds;
uniform vec3 uScanDir,uScanAlong; uniform float uScanT,uScanFade,uScanHalfW,uScanHalfL; uniform int uScanMode;
varying vec2 vUv; varying vec3 vN; varying vec3 vP;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
vec3 ramp3(vec3 a,vec3 b,vec3 c,float t){return t<.5?mix(a,b,t*2.):mix(b,c,(t-.5)*2.);}
void main(){
  vec3 n=normalize(vN);
  vec3 V=normalize(cameraPosition-vP);
  vec3 east=normalize(cross(vec3(0.,1.,0.),n)); vec3 north=cross(n,east);
  vec4 rl=mix(vec4(.5,.5,0.,1.),texture2D(tRelief,vUv),uHasRelief);
  vec2 nm=(rl.rg*2.-1.);
  vec3 N=normalize(n+(east*nm.x+north*nm.y)*uRelief);
  float water=rl.b;
  vec3 albedo=texture2D(tDay,vUv).rgb;
  float ndl=dot(N,uSun), ndlS=dot(n,uSun);
  float day=smoothstep(-0.14,0.3,ndlS);
  float diff=max(ndl,0.);
  vec3 col=albedo*(0.03+1.18*diff);
  vec3 H=normalize(uSun+V);
  col+=vec3(1.,.95,.85)*pow(max(dot(n,H),0.),70.)*water*.5*day;
  float c=texture2D(tClouds,vec2(vUv.x+uCloudShift,vUv.y)).r*uCloudAmt*uHasClouds;
  float cs=texture2D(tClouds,vec2(vUv.x+uCloudShift+.004,vUv.y+.002)).r*uCloudAmt*uHasClouds;
  col*=1.-.3*cs*day;
  col=mix(col,vec3(.03+.97*max(ndlS,0.)),c);
  vec3 lights=texture2D(tNight,vUv).rgb*uHasNight;
  col+=lights*vec3(1.,.78,.5)*1.5*(1.-day)*(1.-c);

  if(uScanFade>0.001){
    float facing=dot(n,uScanDir);
    vec3 cx=cross(uScanDir,uScanAlong);
    float al=dot(n,uScanAlong), ac=dot(n,cx);
    float inW=1.-smoothstep(uScanHalfW-.0015,uScanHalfW,abs(ac));
    float inL=1.-smoothstep(uScanHalfL-.0015,uScanHalfL,abs(al));
    float inS=step(.5,facing)*inW*inL;
    float edge=mix(-uScanHalfL,uScanHalfL,uScanT);
    float rev=inS*step(al,edge)*uScanFade;
    float lum=dot(albedo,vec3(.3,.59,.11));
    vec3 fc=albedo;
    if(uScanMode==0){
      float v=clamp((albedo.g-albedo.r)/(albedo.g+albedo.r+.02)*4.+.42,0.,1.);
      fc=ramp3(vec3(.52,.3,.16),vec3(.93,.84,.42),vec3(.08,.5,.2),v);
      fc=mix(fc,vec3(.05,.12,.25),water); fc*=.55+.6*diff;
    } else if(uScanMode==1){
      float sp=hash(floor(vUv*vec2(6144.,3072.)));
      float g=(lum*1.9+.1+nm.x*.9)*(.55+.9*sp);
      fc=vec3(mix(g,.025+.03*sp,water));
    } else if(uScanMode==2){
      float h=texture2D(tHeight,vUv).r;
      fc=ramp3(vec3(.2,.42,.25),vec3(.78,.66,.42),vec3(.98,.97,.95),smoothstep(.02,.72,h));
      fc*=clamp(.62+nm.x*1.7-nm.y*1.7,0.,1.45);
      fc=mix(fc,vec3(.08,.16,.3),water);
    } else if(uScanMode==3){
      vec2 cell=vec2(1440.,720.); vec2 q=(floor(vUv*cell)+.5)/cell;
      float L=dot(texture2D(tNight,q).rgb,vec3(.3333));
      float cls=floor(clamp(pow(L,.5)*1.7,0.,.999)*5.)/4.;
      fc=mix(vec3(.93,.96,.9),vec3(.03,.2,.42),cls);
      vec2 f=fract(vUv*cell); fc=mix(fc,vec3(.02,.05,.1),step(.93,max(f.x,f.y))*.6);
      fc=mix(fc,vec3(.04,.08,.14),water);
    } else if(uScanMode==4){
      float d=acos(clamp(facing,-1.,1.))*6371.;
      float t=fract(d/100.); float ring=1.-smoothstep(0.,.05,min(t,1.-t));
      fc=mix(albedo*(.25+.7*diff),vec3(1.),ring*.85);
    } else {
      vec3 lit=albedo*(.25+1.2*diff);
      float g=dot(lit,vec3(.3,.59,.11)); fc=clamp(mix(vec3(g),lit,1.55)*1.25,0.,1.);
      vec2 f=fract(vUv*vec2(1440.,720.)); fc=mix(fc,vec3(1.),step(.95,max(f.x,f.y))*.25);
    }
    col=mix(col,fc,rev*.95);
    float ln=inS*exp(-abs(al-edge)*260.)*step(uScanT,.999);
    float frame=step(.5,facing)*inW*inL*max(smoothstep(uScanHalfW-.0045,uScanHalfW-.002,abs(ac)),smoothstep(uScanHalfL-.0045,uScanHalfL-.002,abs(al)));
    col+=vec3(.62,.84,.93)*(ln*1.5+frame*.55)*uScanFade;
  }

  float fr=pow(1.-max(dot(n,V),0.),3.2);
  col+=vec3(.25,.5,1.)*fr*(.12+.88*day)*.9;
  gl_FragColor=vec4(col,1.);
  #include <colorspace_fragment>
}`;

const GLOW_VERT = `varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const GLOW_FRAG = `
precision highp float; uniform vec3 uSun; varying vec3 vP;
void main(){
  vec3 rd=normalize(vP-cameraPosition);
  float tc=dot(-cameraPosition,rd);
  vec3 q=cameraPosition+rd*tc; float d=length(q);
  float i=pow(clamp(1.-(d-1.)/.13,0.,1.),3.4)*step(1.,d);
  float lit=.14+.86*smoothstep(-.35,.55,dot(normalize(q),uSun));
  gl_FragColor=vec4(vec3(.3,.56,1.)*i*lit*1.25,1.);
  #include <colorspace_fragment>
}`;

export function createGlobe(canvas, opts = {}) {
  const base = opts.base || 'assets/earth/';
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch (e) { return null; }
  if (!renderer.getContext()) return null;
  renderer.setClearColor(0x04070c, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 120);
  const sun = new THREE.Vector3(1, 0.3, 0.6).normalize();

  // ---- textures (small first, sharper ones swapped in afterwards) ----
  const loader = new THREE.TextureLoader();
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const blank = new THREE.DataTexture(new Uint8Array([12, 22, 40, 255]), 1, 1); blank.colorSpace = THREE.SRGBColorSpace; blank.needsUpdate = true;
  const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); black.needsUpdate = true;
  function tex(file, { srgb = true, repeat = false } = {}) {
    return new Promise((resolve) => {
      loader.load(base + file, (t) => {
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = maxAniso; t.wrapS = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
        t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
        resolve(t);
      }, undefined, () => resolve(null));
    });
  }

  const U = {
    tDay: { value: blank }, tNight: { value: black }, tRelief: { value: black }, tClouds: { value: black }, tHeight: { value: black },
    uHasNight: { value: 0 }, uHasRelief: { value: 0 }, uHasClouds: { value: 0 },
    uSun: { value: sun }, uCloudShift: { value: 0 }, uCloudAmt: { value: 0.9 }, uRelief: { value: 1.6 },
    uScanDir: { value: new THREE.Vector3(1, 0, 0) }, uScanAlong: { value: new THREE.Vector3(0, -1, 0) },
    uScanT: { value: 0 }, uScanFade: { value: 0 }, uScanHalfW: { value: 0.07 }, uScanHalfL: { value: 0.12 }, uScanMode: { value: 0 },
  };
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), new THREE.ShaderMaterial({ uniforms: U, vertexShader: EARTH_VERT, fragmentShader: EARTH_FRAG }));
  scene.add(earth);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(1.14, 64, 32), new THREE.ShaderMaterial({
    uniforms: { uSun: { value: sun } }, vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG,
    side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  scene.add(glow);

  // ---- stars ----
  {
    const n = 2600, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < n; i++) {
      const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      pos[i * 3] = r * Math.cos(th) * 60; pos[i * 3 + 1] = u * 60; pos[i * 3 + 2] = r * Math.sin(th) * 60;
      const b = 0.35 + 0.65 * Math.pow(rnd(), 2.2), w = rnd();
      col[i * 3] = b * (0.85 + 0.15 * w); col[i * 3 + 1] = b * 0.92; col[i * 3 + 2] = b * (1 - 0.12 * w);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false })));
  }

  // ---- graticule + coastlines (vector, so they stay sharp when zoomed) ----
  const lineMat = (color, opacity) => new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const gratMat = lineMat(0xe5e4e2, 0.05);
  {
    const p = [], v = new THREE.Vector3(), R = 1.0012;
    for (let lon = -180; lon < 180; lon += 15) for (let lat = -80; lat < 80; lat += 2) { dirOf(lat, lon, v); p.push(v.x * R, v.y * R, v.z * R); dirOf(lat + 2, lon, v); p.push(v.x * R, v.y * R, v.z * R); }
    for (let lat = -75; lat <= 75; lat += 15) for (let lon = -180; lon < 180; lon += 2) { dirOf(lat, lon, v); p.push(v.x * R, v.y * R, v.z * R); dirOf(lat, lon + 2, v); p.push(v.x * R, v.y * R, v.z * R); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    scene.add(new THREE.LineSegments(g, gratMat));
  }
  const coastMat = lineMat(0xe5e4e2, 0.16);
  fetch(base + 'coast.bin').then((r) => (r.ok ? r.arrayBuffer() : null)).then((buf) => {
    if (!buf) return;
    const dv = new DataView(buf), nLines = dv.getUint32(0, true), lens = [];
    let o = 4; for (let i = 0; i < nLines; i++) { lens.push(dv.getUint16(o, true)); o += 2; }
    const total = lens.reduce((a, b) => a + Math.max(0, b - 1), 0), pos = new Float32Array(total * 6), v = new THREE.Vector3(), R = 1.0016;
    let k = 0;
    for (const len of lens) {
      let px = 0, py = 0, pz = 0;
      for (let i = 0; i < len; i++) {
        dirOf(dv.getInt16(o + 2, true) / 100, dv.getInt16(o, true) / 100, v); o += 4;
        if (i > 0) { pos[k++] = px; pos[k++] = py; pos[k++] = pz; pos[k++] = v.x * R; pos[k++] = v.y * R; pos[k++] = v.z * R; }
        px = v.x * R; py = v.y * R; pz = v.z * R;
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.LineSegments(g, coastMat)); needs = true;
  }).catch(() => {});

  // ---- route between the study sites ----
  const routeMat = lineMat(0xe8b15a, 0.5);
  function setRoute(points) {
    const p = [], a = new THREE.Vector3(), b = new THREE.Vector3(), v = new THREE.Vector3();
    for (let i = 0; i < points.length - 1; i++) {
      dirOf(points[i].lat, points[i].lon, a); dirOf(points[i + 1].lat, points[i + 1].lon, b);
      const ang = a.angleTo(b), steps = Math.max(8, Math.round(ang / DEG / 1.5));
      let prev = null;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps; v.copy(a).lerp(b, t).normalize().multiplyScalar(1.004 + Math.min(0.06, ang * 0.09) * Math.sin(Math.PI * t));
        if (prev) p.push(prev.x, prev.y, prev.z, v.x, v.y, v.z);
        prev = v.clone();
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    scene.add(new THREE.LineSegments(g, routeMat));
  }

  // ---- satellite ----
  scene.add(new THREE.AmbientLight(0x8fa3c0, 0.55));
  const sunLight = new THREE.DirectionalLight(0xfff2dc, 2.6); scene.add(sunLight);
  const sat = new THREE.Group();
  {
    const foil = new THREE.MeshStandardMaterial({ color: 0xc9a25a, metalness: 0.85, roughness: 0.38 });
    const white = new THREE.MeshStandardMaterial({ color: 0xdfe3e6, metalness: 0.3, roughness: 0.5 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a1f26, metalness: 0.6, roughness: 0.4 });
    const pc = document.createElement('canvas'); pc.width = 256; pc.height = 96;
    const c2 = pc.getContext('2d'); c2.fillStyle = '#0b2447'; c2.fillRect(0, 0, 256, 96);
    c2.strokeStyle = 'rgba(160,200,255,.55)'; c2.lineWidth = 1.5;
    for (let x = 0; x <= 256; x += 16) { c2.beginPath(); c2.moveTo(x, 0); c2.lineTo(x, 96); c2.stroke(); }
    for (let y = 0; y <= 96; y += 16) { c2.beginPath(); c2.moveTo(0, y); c2.lineTo(256, y); c2.stroke(); }
    const pt = new THREE.CanvasTexture(pc); pt.colorSpace = THREE.SRGBColorSpace;
    const panelMat = new THREE.MeshStandardMaterial({ map: pt, metalness: 0.5, roughness: 0.35, emissive: 0x0a1c3a, emissiveIntensity: 0.6 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, 0.034), foil); sat.add(body);
    const bus = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, 0.012), white); bus.position.z = 0.022; sat.add(bus);
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.02, 6), dark); arm.rotation.z = Math.PI / 2; arm.position.x = s * 0.021; sat.add(arm);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.0012, 0.026), panelMat); panel.position.x = s * 0.064; sat.add(panel);
    }
    // sensor barrel points at the Earth (-Y in satellite space), dish points away
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.016, 16), dark); barrel.position.y = -0.018; sat.add(barrel);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.0052, 16), new THREE.MeshBasicMaterial({ color: 0x9fd6ec })); lens.rotation.x = Math.PI / 2; lens.position.y = -0.0262; sat.add(lens);
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.011, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2.6), white); dish.material.side = THREE.DoubleSide; dish.rotation.x = Math.PI; dish.position.y = 0.024; sat.add(dish);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.0009, 0.0009, 0.014, 6), dark); mast.position.y = 0.016; sat.add(mast);
  }
  const satHit = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), new THREE.MeshBasicMaterial({ visible: false })); sat.add(satHit);
  scene.add(sat);
  const beamGeo = new THREE.BufferGeometry(); beamGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0x9fd6ec, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
  beam.frustumCulled = false; scene.add(beam);

  // orbit frame: position(theta) = (S cos + A sin) * r ; S = point overflown, A = direction of travel there
  const SAT_R = 1.17;
  const oS = dirOf(20, 60), oA = new THREE.Vector3(), tS = oS.clone(), tA = new THREE.Vector3();
  function alongAt(s, headingDeg, out) {
    const east = new THREE.Vector3(0, 1, 0).cross(s).normalize(), north = s.clone().cross(east);
    const h = headingDeg * DEG; return out.copy(north).multiplyScalar(Math.cos(h)).addScaledVector(east, Math.sin(h)).normalize();
  }
  alongAt(oS, 35, oA); tA.copy(oA);
  let theta = -1.2, satSpeed = (2 * Math.PI) / 80, wrapWindow = 0;
  const scan = { state: 'idle', t: 0, mode: 0, halfW: 0.07, halfL: 0.12, hasSite: false, from: 0 };
  let onStatus = () => {};

  // ---- camera pose ----
  const tgt = { lat: 20, lon: 60, dist: 3.6, tilt: 0, pitch: 0, cx: 0.5, cy: 0.5, spin: 0 };
  const cur = { dir: dirOf(20, 60), dist: 3.6, pitch: 0, cx: 0.5, cy: 0.5 };
  let spinAngle = 0, userLon = 0, userLat = 0, userHold = false, snapNext = true;
  let W = 1, H = 1, dpr = 1, quality = 'auto', reduced = false, paused = false, needs = true, time = 0, cloudBoost = 1;
  let frameAvg = 16, frameCount = 0;

  function resize() {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    if (!w || !h) return; W = w; H = h;
    const cap = quality === 'low' ? 1 : quality === 'high' ? 2.5 : 1.75;
    dpr = Math.min(window.devicePixelRatio || 1, cap);
    renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.fov = w / h < 0.8 ? 46 : 36; camera.updateProjectionMatrix(); needs = true;
  }
  // distance at which the whole globe fits the narrower screen dimension
  function fitDist(margin = 0.86) {
    const vHalf = (camera.fov * DEG) / 2, hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
    return 1 / Math.sin(Math.min(vHalf, hHalf) * margin);
  }

  const tmpDir = new THREE.Vector3(), tmpV = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3(), fwd = new THREE.Vector3();
  function updateCamera(dt) {
    if (tgt.spin > 0.001 && !reduced && !userHold) spinAngle += dt * 2.2 * tgt.spin;
    if (spinAngle > 180) spinAngle -= 360;
    if (tgt.spin < 0.999) { spinAngle *= Math.exp(-dt * (1 - tgt.spin) * 3); if (!userHold) { const k = Math.exp(-dt * (1 - tgt.spin) * 2.2); userLon *= k; userLat *= k; } }
    const lat = clamp(tgt.lat - tgt.tilt + userLat, -78, 78), lon = tgt.lon - spinAngle + userLon;
    dirOf(lat, lon, tmpDir);
    const k = snapNext || reduced ? 1 : 1 - Math.exp(-dt * 5.5);
    cur.dir.lerp(tmpDir, k).normalize();
    if (cur.dir.lengthSq() < 0.5) cur.dir.copy(tmpDir);
    cur.dist += (tgt.dist - cur.dist) * k; cur.pitch += (tgt.pitch - cur.pitch) * k;
    cur.cx += (tgt.cx - cur.cx) * k; cur.cy += (tgt.cy - cur.cy) * k; snapNext = false;
    camera.position.copy(cur.dir).multiplyScalar(cur.dist);
    camera.up.set(0, 1, 0); camera.lookAt(0, 0, 0); camera.rotateX(cur.pitch * DEG);
    camera.setViewOffset(W, H, -(cur.cx - 0.5) * W, -(cur.cy - 0.5) * H, W, H);
    camera.updateMatrixWorld();
    // sun rides with the camera so the lit side always faces the viewer, terminator to the right
    camera.matrixWorld.extractBasis(right, up, fwd);
    sun.copy(fwd).multiplyScalar(0.62).addScaledVector(right, -0.7).addScaledVector(up, 0.36).normalize();
    sunLight.position.copy(sun).multiplyScalar(10);
    const near = smooth(3.3, 2.1, cur.dist);
    U.uCloudAmt.value = (0.92 - 0.72 * near) * cloudBoost;
    U.uRelief.value = 1.2 + 1.4 * near;
    coastMat.opacity = 0.1 + 0.26 * near; gratMat.opacity = 0.035 + 0.05 * near; routeMat.opacity = 0.6 - 0.38 * near;
  }

  const gA = new THREE.Vector3(), gB = new THREE.Vector3(), gC = new THREE.Vector3(), cross = new THREE.Vector3();
  function satPos(th, out) { return out.copy(oS).multiplyScalar(Math.cos(th)).addScaledVector(oA, Math.sin(th)).normalize(); }
  function updateSatellite(dt) {
    // ease the orbit plane towards the active site
    const k = 1 - Math.exp(-dt * 2.2);
    if (scan.state === 'idle' || scan.state === 'slew') {
      oS.lerp(tS, k).normalize(); oA.lerp(tA, k); oA.addScaledVector(oS, -oA.dot(oS)).normalize();
    }
    if (scan.state === 'idle') {
      theta += satSpeed * dt * (reduced ? 0.25 : 1);
      if (wrapWindow > 0 && theta > wrapWindow) theta = -wrapWindow;
      if (theta > Math.PI) theta -= 2 * Math.PI;
    } else if (scan.state === 'slew') {
      scan.t += dt / 0.9; const e = smooth(0, 1, scan.t);
      theta = scan.from + (-scan.halfL - 0.015 - scan.from) * e;
      if (scan.t >= 1) { scan.state = 'scan'; scan.t = 0; U.uScanDir.value.copy(oS); U.uScanAlong.value.copy(oA); U.uScanT.value = 0; U.uScanFade.value = 1; onStatus('scan', scan.mode); }
    } else if (scan.state === 'scan') {
      scan.t += dt / (reduced ? 0.6 : 3.4); const e = clamp(scan.t, 0, 1);
      theta = -scan.halfL + 2 * scan.halfL * e; U.uScanT.value = e;
      if (scan.t >= 1) { scan.state = 'hold'; scan.t = 0; onStatus('done', scan.mode); }
    } else if (scan.state === 'hold') {
      theta += satSpeed * dt; scan.t += dt / 5.5;
      if (scan.t >= 1) { scan.state = 'fade'; scan.t = 0; }
    } else if (scan.state === 'fade') {
      theta += satSpeed * dt; scan.t += dt / 1.2; U.uScanFade.value = 1 - clamp(scan.t, 0, 1);
      if (scan.t >= 1) { scan.state = 'idle'; U.uScanFade.value = 0; onStatus('idle', scan.mode); }
    }
    satPos(theta, gA); sat.position.copy(gA).multiplyScalar(SAT_R);
    // nadir pointing: -Y to Earth, +Z along track
    satPos(theta + 0.01, gB); gB.sub(gA).normalize();
    const zAxis = gB, yAxis = gA.clone(), xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize();
    sat.matrixAutoUpdate = false; sat.matrix.makeBasis(xAxis, yAxis, zAxis.clone().crossVectors(xAxis, yAxis)).setPosition(sat.position); sat.matrixWorldNeedsUpdate = true;
    const beamOn = scan.state === 'scan' ? 1 : 0;
    beam.material.opacity += ((beamOn ? 0.2 : 0) - beam.material.opacity) * Math.min(1, dt * 8);
    if (beam.material.opacity > 0.004) {
      cross.crossVectors(oS, oA).normalize();
      gB.copy(gA).addScaledVector(cross, scan.halfW).normalize().multiplyScalar(1.002);
      gC.copy(gA).addScaledVector(cross, -scan.halfW).normalize().multiplyScalar(1.002);
      const p = beamGeo.attributes.position.array;
      p[0] = sat.position.x; p[1] = sat.position.y; p[2] = sat.position.z; p[3] = gB.x; p[4] = gB.y; p[5] = gB.z; p[6] = gC.x; p[7] = gC.y; p[8] = gC.z;
      beamGeo.attributes.position.needsUpdate = true;
    }
  }

  let raf = 0, last = 0, onFrame = () => {};
  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
    if (paused) return;
    time += dt;
    if (!reduced) U.uCloudShift.value = (time * 0.0011) % 1;
    updateCamera(dt); updateSatellite(dt);
    renderer.render(scene, camera);
    onFrame(dt);
    // automatic quality: step the pixel ratio down if frames are slow
    frameAvg += (dt * 1000 - frameAvg) * 0.05;
    if (quality === 'auto' && ++frameCount > 90 && frameAvg > 30 && dpr > 1) { dpr = Math.max(1, dpr - 0.25); renderer.setPixelRatio(dpr); renderer.setSize(W, H, false); frameCount = 0; }
  }

  const api = {
    renderer, camera,
    start() { resize(); last = performance.now(); raf = requestAnimationFrame(loop); },
    resize,
    fitDist,
    async loadTextures(level, onProgress = () => {}) {
      // level: 'base' (fast, 2k) | 'full' (4k day map)
      if (level === 'base') {
        const jobs = [tex('day-2k.webp'), tex('night-2k.webp'), tex('relief-2k.webp', { srgb: false }), tex('clouds-2k.webp', { srgb: false, repeat: true }), tex('height-1k.webp', { srgb: false })];
        let done = 0; jobs.forEach((j) => j.then(() => onProgress(++done / jobs.length)));
        const [d, n, r, c, h] = await Promise.all(jobs);
        if (d) U.tDay.value = d; if (n) { U.tNight.value = n; U.uHasNight.value = 1; }
        if (r) { U.tRelief.value = r; U.uHasRelief.value = 1; } if (c) { U.tClouds.value = c; U.uHasClouds.value = 1; } if (h) U.tHeight.value = h;
        return !!d;
      }
      const d = await tex('day-4k.webp'); if (d) { const old = U.tDay.value; U.tDay.value = d; if (old && old !== blank) old.dispose(); }
      return !!d;
    },
    setRoute,
    setPose(p, snap) { Object.assign(tgt, p); if (snap) snapNext = true; },
    snap() { snapNext = true; },
    // site: {lat, lon, heading} or null for a free orbit
    setSite(site, cfg = {}) {
      if (site) { dirOf(site.lat, site.lon, tS); alongAt(tS, site.heading ?? 192, tA); wrapWindow = 0.62; scan.hasSite = true; }
      else { dirOf(18, 62, tS); alongAt(tS, 32, tA); wrapWindow = 0; scan.hasSite = false; }
      scan.mode = cfg.mode ?? 0; scan.halfW = cfg.halfW ?? 0.07; scan.halfL = cfg.halfL ?? 0.12;
      if (scan.state !== 'idle') { scan.state = 'idle'; U.uScanFade.value = 0; onStatus('idle', scan.mode); }
    },
    capture() {
      if (scan.state !== 'idle' && scan.state !== 'hold' && scan.state !== 'fade') return false;
      U.uScanFade.value = 0; U.uScanMode.value = scan.mode; U.uScanHalfW.value = scan.halfW; U.uScanHalfL.value = scan.halfL;
      if (scan.hasSite) { oS.copy(tS); oA.copy(tA); if (Math.abs(theta) > 0.7) theta = -0.7; }
      else {
        // free orbit: scan the ground just ahead of the satellite
        const th = theta + scan.halfL + 0.015, s2 = satPos(th, new THREE.Vector3()), a2 = new THREE.Vector3().copy(oS).multiplyScalar(-Math.sin(th)).addScaledVector(oA, Math.cos(th)).normalize();
        oS.copy(s2); oA.copy(a2); tS.copy(s2); tA.copy(a2); theta = -scan.halfL - 0.015;
      }
      scan.from = theta; scan.state = 'slew'; scan.t = 0; onStatus('task', scan.mode); return true;
    },
    scanState: () => scan.state,
    onStatus(fn) { onStatus = fn; }, onFrame(fn) { onFrame = fn; },
    project(lat, lon, out = {}) {
      dirOf(lat, lon, tmpV); const facing = tmpV.dot(camera.position) / cur.dist;
      const limb = 1 / cur.dist; // surface points with facing > 1/dist are on the visible side
      tmpV.project(camera); out.x = (tmpV.x * 0.5 + 0.5) * W; out.y = (-tmpV.y * 0.5 + 0.5) * H; out.visible = facing > limb + 0.04 && tmpV.z < 1; return out;
    },
    satScreen(out = {}) {
      tmpV.copy(sat.position); const d = tmpV.dot(camera.position) / cur.dist;
      const hidden = d < 1 / cur.dist && tmpV.clone().sub(camera.position).length() > Math.sqrt(cur.dist * cur.dist - 1);
      tmpV.project(camera); out.x = (tmpV.x * 0.5 + 0.5) * W; out.y = (-tmpV.y * 0.5 + 0.5) * H; out.visible = !hidden && tmpV.z < 1 && out.x > -40 && out.x < W + 40 && out.y > -40 && out.y < H + 40; return out;
    },
    hitSatellite(clientX, clientY) {
      const r = canvas.getBoundingClientRect(), ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      const rc = new THREE.Raycaster(); rc.setFromCamera(ndc, camera);
      const hit = rc.intersectObject(satHit, false)[0]; if (!hit) return false;
      const e = rc.intersectObject(earth, false)[0]; return !e || e.distance > hit.distance;
    },
    hitEarth(clientX, clientY) {
      const r = canvas.getBoundingClientRect(), ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      const rc = new THREE.Raycaster(); rc.setFromCamera(ndc, camera); return rc.intersectObject(earth, false).length > 0;
    },
    drag(dx, dy) { const s = (cur.dist - 1) * 0.11; userLon -= dx * s; userLat = clamp(userLat + dy * s, -60, 60); },
    hold(v) { userHold = v; },
    view() { const ll = latLonOf(cur.dir); return { lat: ll.lat + tgt.tilt, lon: ((ll.lon + 540) % 360) - 180, alt: (cur.dist - 1) * 6371 }; },
    setQuality(q) { quality = q; frameCount = 0; cloudBoost = q === 'low' ? 0 : 1; resize(); },
    setReduced(v) { reduced = v; }, setPaused(v) { if (paused && !v) last = performance.now(); paused = v; },
    isPaused: () => paused,
    renderOnce() { updateCamera(0.016); updateSatellite(0); renderer.render(scene, camera); },
    stop() { cancelAnimationFrame(raf); },
  };
  return api;
}
