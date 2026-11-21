// 3D-муха: анатомическая модель Drosophila melanogaster и светящиеся нейронные пути внутри неё.
// index.html вызывает mountFly3D({ THREE, wrap, organs }) из своего модуля.
// organs — уровни каналов от 0 до 1, их задают ползунки; модель читает их в каждом кадре.
function mountFly3D({ THREE, wrap, organs }) {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const UP = V(0, 1, 0);
  const smooth = (a, b, x) => {
    const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return k * k * (3 - 2 * k);
  };
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const GY = -0.62;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  wrap.appendChild(renderer.domElement);
  const cv = renderer.domElement;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
  const target = V(0, -0.05, 0);

  const room = new THREE.Scene();
  room.add(new THREE.Mesh(new THREE.BoxGeometry(12, 8, 12), new THREE.MeshBasicMaterial({ color: 0x0a0f1c, side: THREE.BackSide })));
  const lamp = (w, h, color, power, pos) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(power), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    room.add(m);
  };
  lamp(5, 3, 0xfff4e0, 4, [1, 5.5, 2]);
  lamp(3, 4, 0x22d3ee, 2.4, [-5.5, 1, -2]);
  lamp(3, 4, 0xd946ef, 1.8, [5.5, 0.5, -3]);
  lamp(4, 2, 0xffe4c4, 1.2, [0, 1, 5.5]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(room, 0.03).texture;
  scene.environmentIntensity = 0.75;
  pmrem.dispose();

  scene.add(new THREE.HemisphereLight(0xcfefff, 0x20183a, 0.5));
  const key = new THREE.DirectionalLight(0xfff0dc, 2.2);
  key.position.set(2.5, 6, 4);
  const rimA = new THREE.DirectionalLight(0x67e8f9, 1.4);
  rimA.position.set(-5, 2.5, -4);
  const rimB = new THREE.DirectionalLight(0xf0abfc, 0.9);
  rimB.position.set(5, 1.5, -5);
  scene.add(key, rimA, rimB);

  // Процедурные текстуры: шум, полосы тергитов брюшка, окраска груди, полоски лабеллума.
  const hash = (x, y) => {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  function noise(x, y, period) {
    const xi = Math.floor(x), yi = Math.floor(y), u = x - xi, v = y - yi;
    const w = i => ((i % period) + period) % period;
    const a = hash(w(xi), yi), b = hash(w(xi + 1), yi), c = hash(w(xi), yi + 1), d = hash(w(xi + 1), yi + 1);
    const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
    return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
  }
  function fbm(x, y, period, octaves = 4) {
    let f = 0, amp = 0.5, norm = 0;
    for (let i = 0; i < octaves; i++) {
      f += amp * noise(x, y, period);
      norm += amp;
      x *= 2; y *= 2; period *= 2; amp *= 0.5;
    }
    return f / norm;
  }
  function paint(w, h, fn, srgb = true) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d'), img = ctx.createImageData(w, h), px = img.data, col = [0, 0, 0];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        fn((x + 0.5) / w, 1 - (y + 0.5) / h, col);
        const i = (y * w + x) * 4;
        px[i] = col[0]; px[i + 1] = col[1]; px[i + 2] = col[2]; px[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }
  function radialTex(stops, size = 128) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d'), gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    stops.forEach(([at, color]) => gr.addColorStop(at, color));
    g.fillStyle = gr;
    g.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(c);
  }

  const segOf = v => (0.93 - v) / 0.86 * 6;
  const abdTex = paint(512, 256, (u, v, out) => {
    const dorsal = Math.sin(u * Math.PI * 2);
    const s = segOf(v), f = s - Math.floor(s), n = fbm(u * 20, v * 10, 20);
    let band = s > 0 && s < 6 ? smooth(0.42, 0.6, f) : 0;
    if (s > 4.2) band = Math.max(band, smooth(4.2, 4.7, s));
    band *= smooth(-0.45, 0.05, dorsal);
    const tergite = smooth(-0.62, -0.22, dorsal);
    const L = [206, 162, 98], D = [50, 30, 16], B = [224, 202, 152];
    for (let i = 0; i < 3; i++) {
      const c = L[i] + (D[i] - L[i]) * band;
      out[i] = Math.min(255, (B[i] + (c - B[i]) * tergite) * (0.84 + 0.32 * n));
    }
  });
  const thxTex = paint(512, 256, (u, v, out) => {
    const ang = (u - 0.25) * Math.PI * 2, dorsal = Math.cos(ang), n = fbm(u * 24, v * 12, 24);
    const vitta = smooth(0.55, 1, Math.cos(ang * 7)) * smooth(0.35, 0.85, dorsal) * smooth(0.12, 0.4, v) * 0.3;
    const side = smooth(0.35, -0.5, dorsal);
    const L = [138, 94, 54], P = [192, 150, 100];
    for (let i = 0; i < 3; i++) out[i] = (L[i] + (P[i] - L[i]) * side * 0.65) * (1 - vitta) * (0.84 + 0.32 * n);
  });
  const bumpTex = paint(512, 256, (u, v, out) => {
    out[0] = out[1] = out[2] = fbm(u * 96, v * 48, 96, 3) * 255;
  }, false);
  const labTex = paint(128, 64, (u, v, out) => {
    const c = 0.72 + 0.28 * smooth(0.2, 1, 0.5 + 0.5 * Math.cos(u * Math.PI * 28));
    out[0] = 216 * c; out[1] = 178 * c; out[2] = 122 * c;
  });
  const haloTex = radialTex([[0, 'rgba(255,255,255,1)'], [0.22, 'rgba(255,255,255,0.42)'], [1, 'rgba(255,255,255,0)']]);
  const shadowTex = radialTex([[0, 'rgba(0,0,0,0.78)'], [0.5, 'rgba(0,0,0,0.38)'], [1, 'rgba(0,0,0,0)']]);

  // Геометрия: тела вращения, деформированные сферы, членики ног.
  function smoothSeams(g) {
    const p = g.attributes.position, n = g.attributes.normal, groups = new Map();
    for (let i = 0; i < p.count; i++) {
      const key = `${p.getX(i).toFixed(4)}|${p.getY(i).toFixed(4)}|${p.getZ(i).toFixed(4)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(i);
    }
    const a = V(0, 0, 0), s = V(0, 0, 0);
    for (const ids of groups.values()) {
      if (ids.length < 2) continue;
      s.set(0, 0, 0);
      for (const i of ids) s.add(a.fromBufferAttribute(n, i));
      s.normalize();
      for (const i of ids) n.setXYZ(i, s.x, s.y, s.z);
    }
  }
  function gridGeo(nu, nv, fn) {
    const pos = [], uv = [], idx = [], p = V(0, 0, 0);
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++) {
        fn(i / nu, j / nv, p);
        pos.push(p.x, p.y, p.z);
        uv.push(i / nu, j / nv);
      }
    }
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const P = g.attributes.position, N = g.attributes.normal;
    let top = 0;
    for (let i = 1; i < P.count; i++) if (P.getY(i) > P.getY(top)) top = i;
    if (N.getY(top) < 0) {
      for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
      g.setIndex(idx);
      g.computeVertexNormals();
    }
    smoothSeams(g);
    return g;
  }
  function revolve({ x0, x1, y0, rY, rZ, prof, shape, droop, nu = 96, nv = 96 }) {
    const at = (v, ang, out = V(0, 0, 0)) => {
      const up = Math.sin(ang), side = Math.cos(ang);
      const r = prof(v) * (shape ? shape(v, up, side) : 1);
      return out.set(x0 + (x1 - x0) * v, y0 + (droop ? droop(v) : 0) + up * r * rY, side * r * rZ);
    };
    const surf = (v, ang) => {
      const p = at(v, ang);
      const a = at(v + 1e-3, ang).sub(at(v - 1e-3, ang)), b = at(v, ang + 1e-3).sub(at(v, ang - 1e-3));
      const n = a.cross(b).normalize();
      if (n.dot(V(0, p.y - y0 - (droop ? droop(v) : 0), p.z)) < 0) n.negate();
      return { p, n };
    };
    return { geo: gridGeo(nu, nv, (u, v, out) => at(v, u * Math.PI * 2, out)), at, surf };
  }
  function blobGeo(rx, ry, rz, shape, ws = 64, hs = 48) {
    const g = new THREE.SphereGeometry(1, ws, hs), p = g.attributes.position, d = V(0, 0, 0);
    for (let i = 0; i < p.count; i++) {
      d.fromBufferAttribute(p, i);
      const k = shape ? shape(d) : 1;
      p.setXYZ(i, d.x * rx * k, d.y * ry * k, d.z * rz * k);
    }
    g.computeVertexNormals();
    smoothSeams(g);
    return g;
  }
  function limb(a, b, r0, r1, mat, bulge = 0.12, seg = 14) {
    const dir = b.clone().sub(a), len = dir.length(), pts = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16, cap = Math.sqrt(Math.max(0, 1 - Math.pow(2 * t - 1, 10)));
      const r = (r0 + (r1 - r0) * t) * (1 + bulge * Math.sin(Math.PI * t)) * (0.4 + 0.6 * cap);
      pts.push(new THREE.Vector2(Math.max(r, 0.0015), t * len));
    }
    const m = new THREE.Mesh(new THREE.LatheGeometry(pts, seg), mat);
    m.position.copy(a);
    m.quaternion.setFromUnitVectors(UP, dir.normalize());
    return m;
  }
  const unitSphere = new THREE.SphereGeometry(1, 40, 28);
  function ell(mat, c, r, parent) {
    const m = new THREE.Mesh(unitSphere, mat);
    m.position.copy(c);
    m.scale.set(r[0], r[1], r[2]);
    parent.add(m);
    return m;
  }

  // Материалы: хитин с бархатистым блеском, глянцевые глаза, радужные крылья.
  const cuticle = o => new THREE.MeshPhysicalMaterial({
    roughness: 0.5, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.4,
    sheen: 0.5, sheenRoughness: 0.45, sheenColor: new THREE.Color(0xe9cf9f), ...o
  });
  const thoraxMat = cuticle({ map: thxTex, bumpMap: bumpTex, bumpScale: 0.45, roughness: 0.66, clearcoat: 0.12 });
  const abdMat = cuticle({ map: abdTex, bumpMap: bumpTex, bumpScale: 0.3, roughness: 0.42, clearcoat: 0.55 });
  const headMat = cuticle({ vertexColors: true, roughness: 0.5 });
  const neckMat = cuticle({ color: 0x6f4b2b });
  const legMat = cuticle({ color: 0xa97a45, roughness: 0.5, sheen: 0.35 });
  const coxaMat = cuticle({ color: 0x9c7243, roughness: 0.58, sheen: 0.25 });
  const tarsusMat = cuticle({ color: 0x8c5f33, sheen: 0.35, emissive: 0xbef264, emissiveIntensity: 0 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x17100a, roughness: 0.5 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x140d08, roughness: 0.45, metalness: 0.1 });
  const microMat = new THREE.MeshStandardMaterial({ color: 0x2b1a0d, roughness: 0.6 });
  const eyeMat = new THREE.MeshPhysicalMaterial({
    color: 0xa3111b, roughness: 0.34, clearcoat: 0.8, clearcoatRoughness: 0.2, sheen: 0.3, sheenColor: new THREE.Color(0xff6a5a)
  });
  // Псевдозрачок: омматидии, которые смотрят прямо в камеру, темнеют, как у живой мухи.
  eyeMat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vAxis;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAxis = normalize((modelViewMatrix * instanceMatrix * vec4(0., 1., 0., 0.)).xyz);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vAxis;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= 1. - .9 * smoothstep(.95, .992, dot(normalize(vAxis), normalize(vViewPosition)));');
  };
  const eyeBaseMat = new THREE.MeshStandardMaterial({ color: 0x3d0507, roughness: 0.7 });
  const ocellusMat = new THREE.MeshPhysicalMaterial({ color: 0x6b2a12, roughness: 0.12, clearcoat: 1 });
  const funMat = cuticle({
    color: 0xa8693a, sheen: 1, sheenRoughness: 0.3, sheenColor: new THREE.Color(0xf5deb3), emissive: 0xe879f9, emissiveIntensity: 0
  });
  const antBaseMat = cuticle({ color: 0x9a6331 });
  const aristaMat = new THREE.MeshStandardMaterial({ color: 0x3b2a1b, roughness: 0.5 });
  const probMat = cuticle({ color: 0xc79a63, roughness: 0.55 });
  const labMat = cuticle({ map: labTex, emissive: 0xfbbf24, emissiveIntensity: 0 });
  const veinMat = new THREE.MeshStandardMaterial({ color: 0x6e4524, roughness: 0.4 });
  // Крыло — прозрачная плёнка: цвет даёт интерференция в тонком слое хитина, как на снимках крыльев дрозофилы на тёмном фоне.
  const wingMat = new THREE.ShaderMaterial({
    transparent: true, premultipliedAlpha: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uKey: { value: key.position.clone().normalize() } },
    vertexShader: `varying vec3 vN, vW; varying vec2 vUv;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.);
        vW = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vUv = uv;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `uniform vec3 uKey; varying vec3 vN, vW; varying vec2 vUv;
      void main() {
        vec3 v = normalize(cameraPosition - vW), n = normalize(vN) * (gl_FrontFacing ? 1. : -1.);
        float c = clamp(dot(n, v), 0., 1.), ct = sqrt(1. - (1. - c * c) / 2.4);
        float u = vUv.x, k = vUv.y;
        float d = 200. + 320. * pow(1. - u, 1.7) + 40. * sin(k * 9. + u * 13.) * sin(u * 23. - k * 5.);
        vec3 ph = 6.2832 * 1.55 * d * ct / vec3(640., 540., 455.), film = sin(ph) * sin(ph);
        vec3 r = reflect(-v, n);
        float sky = .35 + .65 * smoothstep(-.3, .9, r.y), spec = pow(max(dot(r, uKey), 0.), 60.) * 3.;
        float fres = .06 + .94 * pow(1. - c, 4.);
        film = mix(vec3(dot(film, vec3(.333))), film, .6);
        gl_FragColor = vec4(film * (sky * .16 + spec * .5) * (.3 + fres) + vec3(.012, .015, .02), .05 + .3 * fres);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const haltereMat = cuticle({ color: 0xc8a466, roughness: 0.4 });

  const fly = new THREE.Group();
  const body = new THREE.Group();
  body.position.x = 0.28;
  fly.add(body);
  scene.add(fly);
  const hairs = [];
  const bristle = (list, p, d, len, w = 0.007) => list.push({ p: p.clone(), d: d.clone().normalize(), len, w });
  const lean = (n, toward, angle) => {
    const b = toward.clone().addScaledVector(n, -toward.dot(n)).normalize();
    return n.clone().multiplyScalar(Math.cos(angle)).addScaledVector(b, Math.sin(angle));
  };
  const BACK = V(-1, 0, 0);

  // Грудь со щитком и щетинками.
  const thorax = revolve({
    x0: -0.36, x1: 0.62, y0: 0.32, rY: 0.4, rZ: 0.385,
    prof: v => Math.sqrt(Math.sin(Math.PI * v)) * (1 - 0.22 * smooth(0.7, 1, v)),
    shape: (v, up) => 1 + 0.1 * up * Math.sin(Math.PI * v) + 0.05 * Math.max(0, -up) * Math.sin(Math.PI * v)
  });
  body.add(new THREE.Mesh(thorax.geo, thoraxMat));
  const S = V(-0.3, 0.56, 0), SR = [0.17, 0.085, 0.165];
  const scutShape = d => 1 + 0.08 * Math.max(0, -d.x);
  const scut = new THREE.Mesh(blobGeo(...SR, scutShape, 40, 24), thoraxMat);
  scut.position.copy(S);
  body.add(scut);
  const onScut = (x, y, z) => {
    const d = V(x, y, z).normalize(), k = scutShape(d);
    return V(S.x + d.x * SR[0] * k, S.y + d.y * SR[1] * k, d.z * SR[2] * k);
  };
  const macro = (v, dAng, angle, len) => {
    const { p, n } = thorax.surf(v, Math.PI / 2 - dAng);
    bristle(hairs, p, lean(n, BACK, angle), len, 0.008);
  };
  for (const s of [1, -1]) {
    macro(0.62, 0.36 * s, 0.78, 0.27);
    macro(0.36, 0.34 * s, 0.82, 0.34);
    macro(0.82, 1.05 * s, 0.75, 0.17);
    macro(0.66, 1.3 * s, 0.6, 0.19);
    macro(0.56, 1.34 * s, 0.6, 0.18);
    macro(0.3, 1.0 * s, 0.85, 0.24);
    macro(0.16, 0.8 * s, 0.9, 0.26);
    bristle(hairs, onScut(0.25, 0.5, 0.85 * s), V(-0.7, 0.45, 0.55 * s), 0.22);
    bristle(hairs, onScut(-0.85, 0.45, 0.28 * s), V(-0.95, 0.32, -0.14 * s), 0.34);
  }
  const microHairs = [];
  for (let i = 0; i < 24; i++) {
    for (let j = -12; j <= 12; j++) {
      const { p, n } = thorax.surf(0.2 + i * 0.03 + (rnd() - 0.5) * 0.012, Math.PI / 2 - (j * 0.07 + (rnd() - 0.5) * 0.03));
      bristle(microHairs, p, lean(n, BACK, 1.1), 0.026 + rnd() * 0.01, 0.0024);
    }
  }
  body.add(limb(V(0.54, 0.33, 0), V(0.68, 0.35, 0), 0.085, 0.08, neckMat, 0.05, 20));

  // Голова: капсула с окраской, фасеточные глаза, глазки, щетинки. Она строится в своих координатах
  // и масштабируется вокруг точки H: у дрозофилы голова почти шириной с грудь.
  const H = V(0.82, 0.36, 0), HR = [0.2, 0.29, 0.29], HSC = 1.2;
  const headG = new THREE.Group();
  headG.position.copy(H).multiplyScalar(1 - HSC);
  headG.scale.setScalar(HSC);
  body.add(headG);
  const toHead = p => p.clone().sub(H).multiplyScalar(HSC).add(H);
  const headHairs = [];
  const headShape = d => 1 - 0.12 * Math.max(0, -d.x) ** 2 + 0.03 * Math.max(0, d.y) - 0.05 * Math.max(0, d.x) ** 3;
  const headGeo = blobGeo(...HR, headShape);
  {
    const p = headGeo.attributes.position, col = [], d = V(0, 0, 0);
    const mix = (c, to, k) => c.map((x, i) => x + (to[i] - x) * k);
    for (let i = 0; i < p.count; i++) {
      d.set(p.getX(i) / HR[0], p.getY(i) / HR[1], p.getZ(i) / HR[2]).normalize();
      let c = [120, 80, 44];
      c = mix(c, [216, 126, 54], smooth(0.15, 0.75, d.x) * smooth(-0.35, 0.1, d.y));
      c = mix(c, [226, 196, 134], smooth(0.2, 0.7, d.x) * smooth(0, -0.45, d.y));
      c = mix(c, [72, 46, 26], smooth(0, 0.7, -d.x));
      c = mix(c, [30, 19, 12], smooth(0.86, 0.97, d.y) * smooth(0.35, 0.1, Math.abs(d.z)));
      const n = 0.86 + 0.28 * fbm(d.x * 5 + 9, d.y * 5 + d.z * 3 + 9, 1e6, 3);
      col.push(...c.map(x => Math.pow(x / 255, 2.2) * n));
    }
    headGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  }
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.copy(H);
  headG.add(head);
  const onHead = (x, y, z) => {
    const d = V(x, y, z).normalize(), k = headShape(d);
    return V(H.x + d.x * HR[0] * k, H.y + d.y * HR[1] * k, d.z * HR[2] * k);
  };
  [[0.1, 1, 0], [-0.14, 1, 0.17], [-0.14, 1, -0.17]].forEach(c => ell(ocellusMat, onHead(...c), [0.022, 0.015, 0.022], headG));
  for (const s of [1, -1]) {
    bristle(headHairs, onHead(-0.35, 0.85, 0.42 * s), V(-0.35, 0.85, 0.45 * s), 0.17);
    bristle(headHairs, onHead(-0.55, 0.7, 0.62 * s), V(-0.5, 0.6, 0.65 * s), 0.15);
    bristle(headHairs, onHead(-0.05, 0.98, 0.12 * s), V(0.55, 0.65, 0.5 * s), 0.12);
    bristle(headHairs, onHead(-0.75, 0.6, 0.12 * s), V(-0.8, 0.45, -0.35 * s), 0.1);
    for (let k = 0; k < 3; k++) {
      bristle(headHairs, onHead(0.3 + 0.14 * k, 0.82 - 0.14 * k, 0.4 * s), V(0.35 + 0.2 * k, 0.9, 0.12 * s), 0.11 - 0.012 * k, 0.006);
    }
    bristle(headHairs, onHead(0.78, -0.5, 0.3 * s), V(0.85, -0.3, 0.35 * s), 0.12, 0.006);
    for (let k = 0; k < 9; k++) {
      const a = -0.95 + k * 0.24;
      bristle(headHairs, onHead(-0.62, Math.sin(a) * 0.85, Math.cos(a) * 0.62 * s), V(-0.75, Math.sin(a) * 0.3, 0.45 * s), 0.05, 0.004);
    }
  }

  const facetGeo = new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  const glowFacetMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const eyes = [];
  for (const side of [1, -1]) {
    const E = V(H.x + 0.035, H.y + 0.02, side * 0.17), R = [0.21, 0.27, 0.16];
    ell(eyeBaseMat, E, R.map(r => r * 0.985), headG);
    // Омматидии (около 790 на глаз, как у дрозофилы) ставятся только на ту часть глаза, что выступает из головной капсулы.
    const dirs = [], N = 1100, ga = Math.PI * (3 - Math.sqrt(5)), hd = V(0, 0, 0);
    for (let i = 0; i < N; i++) {
      const y = 1 - 2 * (i + 0.5) / N, r = Math.sqrt(1 - y * y), th = ga * i;
      const d = V(Math.cos(th) * r, y, Math.sin(th) * r);
      hd.set((E.x + d.x * R[0] - H.x) / HR[0], (E.y + d.y * R[1] - H.y) / HR[1], (E.z + d.z * R[2]) / HR[2]);
      const len = hd.length();
      if (len > headShape(hd.normalize()) * 0.97) dirs.push(d);
    }
    const facets = new THREE.InstancedMesh(facetGeo, eyeMat, dirs.length);
    const glow = new THREE.InstancedMesh(facetGeo, glowFacetMat, dirs.length);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = V(0, 0, 0), n = V(0, 0, 0), P = V(0, 0, 0);
    const rf = 0.0142, black = new THREE.Color(0, 0, 0), phase = [];
    dirs.forEach((d, i) => {
      n.set(d.x / R[0], d.y / R[1], d.z / R[2]).normalize();
      P.set(E.x + d.x * R[0], E.y + d.y * R[1], E.z + d.z * R[2]).addScaledVector(n, -rf * 0.12);
      q.setFromUnitVectors(UP, n);
      facets.setMatrixAt(i, M.compose(P, q, sc.set(rf, rf * 0.42, rf)));
      glow.setMatrixAt(i, M.compose(P, q, sc.set(rf * 1.04, rf * 0.52, rf * 1.04)));
      glow.setColorAt(i, black);
      phase.push(d.y * 6 + d.x * 3);
    });
    glow.renderOrder = 2;
    headG.add(facets, glow);
    eyes.push({ glow, phase, E, side });
  }

  // Усики: скапус, педицель, бархатистый третий членик и перистая ариста.
  const antennas = [];
  for (const side of [1, -1]) {
    const g = new THREE.Group();
    g.position.set(H.x + 0.175, H.y + 0.07, side * 0.052);
    headG.add(g);
    g.add(limb(V(0, 0, 0), V(0.035, 0, side * 0.008), 0.024, 0.021, antBaseMat, 0.05));
    ell(antBaseMat, V(0.048, -0.008, side * 0.014), [0.032, 0.036, 0.03], g);
    const fun = ell(funMat, V(0.075, -0.075, side * 0.024), [0.044, 0.074, 0.04], g);
    fun.rotation.z = 0.35;
    const ar = new THREE.Group();
    g.add(ar);
    const curve = new THREE.CatmullRomCurve3([V(0.085, -0.04, side * 0.05), V(0.17, 0, side * 0.1), V(0.26, 0.03, side * 0.14), V(0.36, 0.045, side * 0.17)]);
    ar.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.0055, 5), aristaMat));
    for (let k = 0; k < 9; k++) {
      const tt = 0.22 + k * 0.085, p = curve.getPoint(tt), tan = curve.getTangent(tt);
      const dir = (k % 2 ? V(0.25, -1, 0) : V(0.25, 1, 0.1 * side)).addScaledVector(tan, 0.8).normalize();
      ar.add(limb(p, p.clone().addScaledVector(dir, 0.075 * (1 - k * 0.07)), 0.003, 0.0012, aristaMat, 0, 4));
    }
    antennas.push({ g, ar, fun, side });
  }

  // Хоботок с лабеллумом и щупики; выдвигается, когда растёт MN9.
  const prob = new THREE.Group();
  prob.position.set(H.x + 0.03, H.y - 0.235, 0);
  headG.add(prob);
  prob.add(limb(V(0, 0.03, 0), V(0.035, -0.11, 0), 0.06, 0.045, probMat, 0.12));
  const haus = new THREE.Group();
  haus.position.set(0.035, -0.11, 0);
  prob.add(haus);
  haus.add(limb(V(0, 0, 0), V(0.03, -0.15, 0), 0.036, 0.03, probMat, 0.06));
  for (const s of [1, -1]) {
    const lobe = ell(labMat, V(0.045, -0.185, s * 0.03), [0.055, 0.03, 0.042], haus);
    lobe.rotation.set(-s * 0.3, 0, 0.25);
    prob.add(limb(V(0.06, 0.06, s * 0.055), V(0.15, -0.02, s * 0.075), 0.012, 0.022, legMat, 0.25));
  }
  const labTip = new THREE.Object3D();
  labTip.position.set(0.05, -0.2, 0);
  haus.add(labTip);

  // Брюшко из шести тергитов с тёмными полосами; «дышит».
  const abdPivot = V(-0.3, 0.2, 0);
  const abd = revolve({
    x0: -1.44, x1: -0.22, y0: 0.2, rY: 0.335, rZ: 0.385, nv: 140,
    prof: v => {
      const e = (v < 0.55 ? Math.sqrt(Math.max(0, 1 - ((0.55 - v) / 0.55) ** 2)) : 1 - 0.5 * ((v - 0.55) / 0.45) ** 2)
        * Math.sqrt(Math.max(0, 1 - Math.max(0, (v - 0.9) / 0.1) ** 2));
      const s = segOf(v), f = s - Math.floor(s);
      return e * (1 + (s > 0 && s < 6 ? 0.03 * (f < 0.9 ? f / 0.9 - 0.5 : 0.5 - (f - 0.9) / 0.1) : 0));
    },
    droop: v => -0.16 * (1 - v) ** 1.6
  });
  const abdGroup = new THREE.Group();
  abdGroup.position.copy(abdPivot);
  body.add(abdGroup);
  abd.geo.translate(-abdPivot.x, -abdPivot.y, -abdPivot.z);
  abdGroup.add(new THREE.Mesh(abd.geo, abdMat));
  const abdHairs = [];
  const abdHair = (v, dAng, len, w) => {
    const { p, n } = abd.surf(v, Math.PI / 2 - dAng);
    bristle(abdHairs, p.sub(abdPivot), lean(n, BACK, 1.2), len, w);
  };
  for (let s = 0; s < 6; s++) {
    for (let j = -9; j <= 9; j++) abdHair(0.93 - (s + 0.9) / 6 * 0.86, j * 0.14 + (rnd() - 0.5) * 0.05, 0.05 + rnd() * 0.015, 0.0045);
  }
  for (let i = 0; i < 160; i++) abdHair(0.12 + rnd() * 0.78, (rnd() - 0.5) * 2.5, 0.032, 0.0032);

  // Крылья: контур дрозофилы, жилки L1–L6 с поперечными, бахрома, радужная плёнка.
  const WL = 1.95;
  const wA = u => 0.035 + 0.2 * Math.pow(u, 0.42) * Math.sqrt(Math.max(0, 1 - Math.pow(u, 8)));
  const wP = u => 0.5 * Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(u, 0.66))), 0.72) * Math.sqrt(Math.max(0, 1 - Math.pow(u, 12)))
    + 0.055 * Math.exp(-(((u - 0.1) / 0.05) ** 2));
  const VEINS = [
    [0.009, [[0.02, 0.99], [0.3, 0.995], [0.6, 0.995], [0.88, 0.99], [0.96, 0.88], [0.99, 0.55], [0.985, 0.3]]],
    [0.005, [[0.03, 0.93], [0.13, 0.96], [0.22, 0.99]]],
    [0.006, [[0.04, 0.88], [0.25, 0.94], [0.44, 0.995]]],
    [0.006, [[0.08, 0.8], [0.4, 0.86], [0.65, 0.92], [0.8, 0.995]]],
    [0.006, [[0.1, 0.72], [0.45, 0.7], [0.8, 0.66], [0.985, 0.62]]],
    [0.006, [[0.1, 0.6], [0.45, 0.5], [0.8, 0.36], [0.975, 0.22]]],
    [0.006, [[0.08, 0.48], [0.4, 0.33], [0.62, 0.2], [0.78, 0.005]]],
    [0.004, [[0.05, 0.3], [0.2, 0.17], [0.3, 0.1]]],
    [0.005, [[0.43, 0.705], [0.43, 0.515]]],
    [0.005, [[0.62, 0.43], [0.66, 0.24]]]
  ];
  const wings = [];
  for (const side of [1, -1]) {
    const s = V(-1, -0.055, side * 0.1).normalize();
    let n = V(0, 1, side * 0.16).normalize();
    const c = n.clone().cross(s).multiplyScalar(side).normalize();
    n = s.clone().cross(c).multiplyScalar(side).normalize();
    const lift = side > 0 ? 0.014 : 0;
    const at = (u, k, out = V(0, 0, 0)) => {
      const chord = -wP(u) + (wA(u) + wP(u)) * k;
      const camber = 0.035 * Math.sin(Math.PI * Math.min(1, u * 1.1)) * (1 - (2 * k - 1) ** 2) + lift;
      return out.set(0, 0, 0).addScaledVector(s, u * WL).addScaledVector(c, chord).addScaledVector(n, camber);
    };
    const g = new THREE.Group();
    g.position.set(-0.02, 0.63, side * 0.15);
    body.add(g);
    const mem = new THREE.Mesh(gridGeo(72, 14, (u, k, out) => at(u, k, out)), wingMat);
    mem.renderOrder = 3;
    g.add(mem);
    for (const [r, pts] of VEINS) {
      const curve = new THREE.CatmullRomCurve3(pts.map(([u, k]) => at(u, k).addScaledVector(n, 0.002)));
      g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, r, 5), veinMat));
    }
    const fringe = [];
    for (let i = 0; i < 140; i++) {
      const u = 0.22 + i / 139 * 0.77, p = at(u, 0), q = at(u, 0.06);
      fringe.push(p.x, p.y, p.z, ...p.clone().addScaledVector(p.clone().sub(q).normalize(), 0.024 + 0.008 * Math.sin(i * 1.7)).toArray());
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(fringe, 3));
    g.add(new THREE.LineSegments(fg, new THREE.LineBasicMaterial({ color: 0x8a6a48, transparent: true, opacity: 0.45 })));
    wings.push({ g, side });
  }

  // Жужжальца.
  const halteres = [];
  for (const side of [1, -1]) {
    const g = new THREE.Group();
    g.position.set(-0.2, 0.44, side * 0.27);
    body.add(g);
    const tip = V(-0.06, -0.12, side * 0.12);
    g.add(limb(V(0, 0, 0), tip, 0.01, 0.007, haltereMat, 0));
    ell(haltereMat, tip.clone().multiplyScalar(1.1), [0.026, 0.034, 0.026], g);
    halteres.push({ g, side });
  }

  // Ноги: тазик, бедро, голень, пять члеников лапки, коготки и щетинки.
  const LEGS = [
    { c0: [0.42, 0.1, 0.1], c1: [0.52, -0.17, 0.15], knee: [0.8, 0.02, 0.38], ankle: [1, -0.5, 0.5], toe: [1.2, -0.612, 0.56], fem: 0.037, tib: 0.024 },
    { c0: [0.2, 0.06, 0.14], c1: [0.22, -0.17, 0.22], knee: [0.28, 0.05, 0.64], ankle: [0.27, -0.5, 0.93], toe: [0.22, -0.612, 1.16], fem: 0.033, tib: 0.022 },
    { c0: [-0.02, 0.06, 0.13], c1: [-0.08, -0.16, 0.2], knee: [-0.3, 0.03, 0.56], ankle: [-0.62, -0.5, 0.8], toe: [-0.86, -0.612, 0.92], fem: 0.036, tib: 0.023 }
  ];
  const clawGeo = new THREE.ConeGeometry(0.006, 0.03, 5).translate(0, 0.015, 0);
  const legRoutes = [], toes = [];
  for (const L of LEGS) {
    for (const side of [1, -1]) {
      const P = k => V(L[k][0], L[k][1], L[k][2] * side);
      const c0 = P('c0'), c1 = P('c1'), knee = P('knee'), ankle = P('ankle'), toe = P('toe');
      body.add(limb(c0, c1, 0.052, 0.04, coxaMat, 0.1));
      ell(coxaMat, c1, [0.036, 0.036, 0.036], body);
      body.add(limb(c1, knee, L.fem, L.fem * 0.78, legMat, 0.16));
      ell(legMat, knee, [L.fem * 0.72, L.fem * 0.72, L.fem * 0.72], body);
      body.add(limb(knee, ankle, L.tib, L.tib * 0.92, legMat, 0.05));
      ell(tarsusMat, ankle, [L.tib * 0.85, L.tib * 0.85, L.tib * 0.85], body);
      const ctrl = ankle.clone().lerp(toe, 0.45);
      ctrl.y = GY + 0.035;
      const tc = new THREE.QuadraticBezierCurve3(ankle, ctrl, toe), cuts = [0, 0.36, 0.56, 0.72, 0.86, 1];
      for (let k = 0; k < 5; k++) {
        const r0 = 0.0165 - k * 0.0013, a = tc.getPoint(cuts[k]), b = tc.getPoint(cuts[k + 1]);
        body.add(limb(a, b, r0, r0 * 0.82, tarsusMat, 0.1, 10));
        const axis = b.clone().sub(a).normalize(), below = UP.clone().addScaledVector(axis, -axis.y).negate().normalize();
        for (let j = 0; j < 3; j++) {
          const p = a.clone().lerp(b, 0.3 + j * 0.25).addScaledVector(below, r0 * 0.8);
          bristle(hairs, p, axis.clone().addScaledVector(below, 0.8).addScaledVector(axis.clone().cross(UP), (j - 1) * 0.6), 0.03, 0.0025);
        }
      }
      const dir = toe.clone().sub(tc.getPoint(0.9)).normalize(), lat = dir.clone().cross(UP).normalize();
      for (const k of [1, -1]) {
        const claw = new THREE.Mesh(clawGeo, darkMat);
        claw.position.copy(toe).addScaledVector(lat, k * 0.008);
        claw.quaternion.setFromUnitVectors(UP, dir.clone().addScaledVector(UP, -0.6).addScaledVector(lat, k * 0.3).normalize());
        body.add(claw);
      }
      for (const [a, b, r] of [[c1, knee, L.fem * 0.9], [knee, ankle, L.tib]]) {
        const axis = b.clone().sub(a).normalize();
        for (let k = 0; k < 18; k++) {
          const t = 0.08 + k * 0.05, ang = k * 2.4 + rnd();
          const radial = V(Math.cos(ang), Math.sin(ang), 0.3).cross(axis).normalize();
          const p = a.clone().lerp(b, t).addScaledVector(radial, r * 0.9);
          bristle(hairs, p, axis.clone().addScaledVector(radial, 0.5), 0.035 + rnd() * 0.025, 0.0032);
        }
      }
      legRoutes.push([c1, knee, ankle, toe]);
      toes.push(toe);
    }
  }

  const hairGeo = new THREE.ConeGeometry(1, 1, 5, 1, true).translate(0, 0.5, 0);
  function hairMesh(list, parent, mat = hairMat) {
    const m = new THREE.InstancedMesh(hairGeo, mat, list.length), M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = V(0, 0, 0);
    list.forEach((h, i) => {
      q.setFromUnitVectors(UP, h.d);
      m.setMatrixAt(i, M.compose(h.p, q, s.set(h.w, h.len, h.w)));
    });
    parent.add(m);
  }
  hairMesh(hairs, body);
  hairMesh(microHairs, body, microMat);
  hairMesh(headHairs, headG);
  hairMesh(abdHairs, abdGroup);

  // Габарит мухи для кадра: радиус цилиндра вокруг оси вращения и верхняя точка.
  let reach = 0, top = GY;
  {
    const p = V(0, 0, 0);
    fly.updateMatrixWorld(true);
    body.traverse(o => {
      if (!o.isMesh || o.isInstancedMesh) return;
      const P = o.geometry.attributes.position;
      for (let i = 0; i < P.count; i++) {
        p.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld);
        reach = Math.max(reach, Math.hypot(p.x, p.z));
        top = Math.max(top, p.y);
      }
    });
  }

  // Тени под телом и лапками.
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 1.6), shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(-0.35, GY + 0.002, 0);
  shadow.renderOrder = 1;
  body.add(shadow);
  for (const toe of toes) {
    const spot = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), shadowMat);
    spot.rotation.x = -Math.PI / 2;
    spot.position.set(toe.x - 0.02, GY + 0.003, toe.z);
    spot.renderOrder = 1;
    body.add(spot);
  }

  // Голографическая подставка в цветах проекта.
  const padTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 1024;
    const g = c.getContext('2d');
    g.translate(512, 512);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 512);
    gr.addColorStop(0, 'rgba(34,211,238,0.16)');
    gr.addColorStop(0.6, 'rgba(34,211,238,0.05)');
    gr.addColorStop(1, 'rgba(34,211,238,0)');
    g.fillStyle = gr;
    g.fillRect(-512, -512, 1024, 1024);
    g.strokeStyle = '#67e8f9';
    g.lineWidth = 2;
    for (const [r, a] of [[230, 0.35], [360, 0.3], [470, 0.7]]) {
      g.globalAlpha = a;
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.stroke();
    }
    for (let a = 0; a < 360; a += 5) {
      const big = a % 30 === 0, rad = a * Math.PI / 180;
      g.globalAlpha = big ? 0.75 : 0.35;
      g.beginPath();
      g.moveTo(Math.cos(rad) * 470, Math.sin(rad) * 470);
      g.lineTo(Math.cos(rad) * (big ? 442 : 456), Math.sin(rad) * (big ? 442 : 456));
      g.stroke();
    }
    g.globalAlpha = 0.4;
    g.setLineDash([6, 12]);
    g.beginPath();
    g.arc(0, 0, 300, 0, Math.PI * 2);
    g.stroke();
    return new THREE.CanvasTexture(c);
  })();
  const arcTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 1024;
    const g = c.getContext('2d');
    g.translate(512, 512);
    g.lineCap = 'round';
    [['#e879f9', 400, 0.2, 1.1, 5], ['#22d3ee', 400, 2.3, 3.4, 5], ['#e879f9', 400, 4.4, 5.2, 5], ['#22d3ee', 415, 0.6, 2.9, 2]].forEach(([color, r, a0, a1, w]) => {
      g.strokeStyle = color;
      g.globalAlpha = 0.55;
      g.lineWidth = w;
      g.beginPath();
      g.arc(0, 0, r, a0, a1);
      g.stroke();
    });
    return new THREE.CanvasTexture(c);
  })();
  const pad = new THREE.Group();
  pad.position.y = GY - 0.004;
  scene.add(pad);
  const disc = (map, size, opacity) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({
      map, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    m.rotation.x = -Math.PI / 2;
    pad.add(m);
    return m;
  };
  const padRings = disc(padTex, 5.2, 0.85), padArcs = disc(arcTex, 5.2, 0.9);

  // Нейронные пути «на просвет»: зрительные доли, антеннальные доли, грибовидные тела, SEZ и брюшная нервная цепочка.
  // Нейропили светятся по краям, как стеклянные объёмы на рентгене.
  const xray = () => new THREE.ShaderMaterial({
    transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color() } },
    vertexShader: `varying vec3 vN, vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.);
        vN = normalize(normalMatrix * normal);
        vV = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform vec3 uColor; varying vec3 vN, vV;
      void main() {
        float f = 1. - abs(dot(normalize(vN), normalize(vV)));
        gl_FragColor = vec4(uColor * (.15 + 1.5 * f * f * f), 1.);
        #include <colorspace_fragment>
      }`
  });
  const CH = {
    vision: { base: new THREE.Color(0x22d3ee), flash: 0, gain: 0.5 },
    odor: { base: new THREE.Color(0xe879f9), flash: 0, gain: 0.6 },
    humidity: { base: new THREE.Color(0xa3e635), flash: 0, gain: 0.6 },
    mn9: { base: new THREE.Color(0xfbbf24), flash: 0, gain: 0.7 },
    legs: { base: new THREE.Color(0xd9f99d), flash: 0, gain: 0.35 }
  };
  for (const ch of Object.values(CH)) ch.mat = xray();
  const xr = (mesh, order = 5) => {
    mesh.renderOrder = order;
    return mesh;
  };
  const CB = V(H.x - 0.02, H.y + 0.06, 0), SEZ = V(H.x + 0.03, H.y - 0.13, 0), NK = V(0.6, 0.24, 0), TG = V(0.12, 0.07, 0);
  const funPos = [], aristaPos = [], AL = [], CA = [], LO = [], OL = [];
  for (const side of [1, -1]) {
    OL.push(V(H.x, H.y + 0.02, side * 0.13));
    AL.push(V(H.x + 0.1, H.y - 0.01, side * 0.045));
    CA.push(V(H.x - 0.09, H.y + 0.14, side * 0.075));
    LO.push(V(H.x + 0.07, H.y + 0.1, side * 0.04));
    funPos.push(V(H.x + 0.175 + 0.075, H.y + 0.07 - 0.075, side * (0.052 + 0.024)));
    aristaPos.push(V(H.x + 0.175 + 0.085, H.y + 0.07 - 0.04, side * (0.052 + 0.05)));
  }
  for (let i = 0; i < 2; i++) {
    ell(CH.vision.mat, OL[i], [0.06, 0.13, 0.035], headG).renderOrder = 5;
    ell(CH.odor.mat, AL[i], [0.035, 0.035, 0.035], headG).renderOrder = 5;
    ell(CH.humidity.mat, CA[i], [0.04, 0.04, 0.04], headG).renderOrder = 5;
    ell(CH.humidity.mat, LO[i], [0.022, 0.05, 0.022], headG).renderOrder = 5;
    headG.add(xr(limb(CA[i], LO[i], 0.012, 0.012, CH.humidity.mat, 0, 8)));
  }
  ell(CH.mn9.mat, SEZ, [0.06, 0.04, 0.07], headG).renderOrder = 5;
  ell(CH.humidity.mat, CB, [0.025, 0.02, 0.06], headG).renderOrder = 5;
  const sez = toHead(SEZ), cb = toHead(CB);
  body.add(xr(limb(sez, NK, 0.02, 0.02, CH.legs.mat, 0, 8)), xr(limb(NK, TG, 0.022, 0.022, CH.legs.mat, 0, 8)));
  ell(CH.legs.mat, TG, [0.15, 0.045, 0.06], body).renderOrder = 5;
  for (const r of legRoutes) body.add(xr(limb(TG, r[0], 0.008, 0.008, CH.legs.mat, 0, 6)));

  const path = pts => new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const ROUTES = { vision: [], odor: [], humidity: [], legs: [] };
  for (let i = 0; i < 2; i++) {
    const side = i ? -1 : 1, e = eyes[i].E;
    ROUTES.vision.push(path([V(e.x + 0.06, e.y + 0.03, side * 0.3), OL[i], CB].map(toHead)));
    ROUTES.odor.push(path([funPos[i], AL[i], CA[i]].map(toHead)));
    ROUTES.humidity.push(path([aristaPos[i], AL[i], CA[i], LO[i]].map(toHead)));
  }
  for (const r of legRoutes) ROUTES.legs.push(path([sez, NK, TG, ...r]));

  // Импульсы: светящиеся точки с хвостом, бегут по путям поверх тела.
  const MAXP = 360, TRAIL = 4;
  const pGeo = new THREE.BufferGeometry();
  const pBuf = (name, size) => {
    const a = new THREE.BufferAttribute(new Float32Array(MAXP * size), size);
    a.setUsage(THREE.DynamicDrawUsage);
    pGeo.setAttribute(name, a);
    return a;
  };
  const pPos = pBuf('position', 3), pCol = pBuf('aColor', 3), pSize = pBuf('aSize', 1), pAlpha = pBuf('aAlpha', 1);
  const pMat = new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uScale: { value: 400 } },
    vertexShader: `attribute vec3 aColor; attribute float aSize, aAlpha;
      uniform float uScale; varying vec3 vC; varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.);
        gl_Position = projectionMatrix * mv;
        vC = aColor; vA = aAlpha;
        gl_PointSize = aSize * uScale / -mv.z;
      }`,
    fragmentShader: `varying vec3 vC; varying float vA;
      void main() {
        float d = length(gl_PointCoord - .5) * 2.;
        float core = exp(-d * d * 14.), halo = exp(-d * d * 3.5) * .45;
        gl_FragColor = vec4(mix(vC, vec3(1.), core * .6), (core + halo) * vA);
        #include <colorspace_fragment>
      }`
  });
  const pPoints = new THREE.Points(pGeo, pMat);
  pPoints.frustumCulled = false;
  pPoints.renderOrder = 10;
  body.add(pPoints);
  const pulses = [];
  const spawn = (route, color, speed) => {
    if (pulses.length * TRAIL < MAXP - TRAIL) pulses.push({ route, color, t: 0, speed });
  };

  const halo = (color, size, parent, pos) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
    s.scale.setScalar(size);
    s.position.copy(pos);
    parent.add(s);
    return s;
  };
  const eyeHalos = eyes.map(e => halo(0x22d3ee, 0.8, headG, V(e.E.x + 0.04, e.E.y, e.E.z + e.side * 0.08)));
  const antHalos = antennas.map(a => halo(0xe879f9, 0.42, a.g, a.fun.position));
  const labHalo = halo(0xfbbf24, 0.5, haus, labTip.position);
  const mbHalo = halo(0xa3e635, 0.5, headG, V(H.x - 0.02, H.y + 0.16, 0));
  mbHalo.material.depthTest = false;
  mbHalo.renderOrder = 6;

  // Неподвижные детали с общим материалом сливаются в одну геометрию: так на кадр уходит меньше вызовов отрисовки.
  function mergeStatic(parent) {
    const groups = new Map(), v = V(0, 0, 0), nm = new THREE.Matrix3();
    for (const m of parent.children) {
      if (!m.isMesh || m.isInstancedMesh || m.renderOrder || !m.geometry.index) continue;
      if (!groups.has(m.material)) groups.set(m.material, []);
      groups.get(m.material).push(m);
    }
    for (const [mat, list] of groups) {
      if (list.length < 2) continue;
      const pos = [], nor = [], uv = [], idx = [];
      for (const m of list) {
        m.updateMatrix();
        nm.getNormalMatrix(m.matrix);
        const g = m.geometry, P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, base = pos.length / 3;
        for (let i = 0; i < P.count; i++) {
          v.fromBufferAttribute(P, i).applyMatrix4(m.matrix);
          pos.push(v.x, v.y, v.z);
          v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
          nor.push(v.x, v.y, v.z);
          uv.push(U.getX(i), U.getY(i));
        }
        for (let i = 0; i < g.index.count; i++) idx.push(base + g.index.getX(i));
        parent.remove(m);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      parent.add(new THREE.Mesh(geo, mat));
    }
  }
  [body, headG, prob, haus, ...antennas.flatMap(a => [a.g, a.ar]), ...wings.map(w => w.g), ...halteres.map(h => h.g)].forEach(mergeStatic);

  let rotTarget = -0.78, rotCur = -0.78, dragging = false, lastX = 0, lastDrag = -1e5, lastSpawn = 0, ext = 0, last = 0;
  const cTmp = new THREE.Color(), vTmp = V(0, 0, 0);

  function frame() {
    const now = performance.now(), t = now / 1000;
    const dt = Math.min(0.1, last ? (now - last) / 1000 : 0.016);
    last = now;
    const beat = f => 0.8 + 0.2 * Math.sin(t * f);
    const lv = { vision: organs.vision, odor: organs.odor, humidity: organs.humidity, mn9: organs.mn9, legs: organs.mn9 };

    rotCur += (rotTarget - rotCur) * (1 - Math.exp(-dt * 9));
    const idle = reduceMotion ? 0 : smooth(1.5, 4, (now - lastDrag) / 1000);
    fly.rotation.y = rotCur + idle * 0.2 * Math.sin(t * 0.32);

    if (!reduceMotion) {
      const br = Math.sin(t * 2.1);
      abdGroup.scale.set(1, 1 + 0.012 * br, 1 + 0.01 * br);
      for (const h of halteres) h.g.rotation.x = h.side * 0.12 * Math.sin(t * 9 + h.side);
      for (const a of antennas) a.ar.rotation.y = a.side * 0.05 * Math.sin(t * (2.5 + 5 * lv.odor) + a.side);
      const buzz = smooth(0.7, 1, lv.mn9) * 0.025;
      for (const w of wings) w.g.rotation.x = w.side * buzz * Math.sin(t * 40);
      padRings.rotation.z = t * 0.04;
      padArcs.rotation.z = -t * 0.12;
    }

    ext += (smooth(0.45, 0.72, lv.mn9) - ext) * (1 - Math.exp(-dt * 3));
    prob.rotation.z = -1.2 * (1 - ext);
    haus.scale.y = 0.55 + 0.45 * ext;

    for (const e of eyes) {
      e.glow.visible = lv.vision > 0.01;
      if (!e.glow.visible) continue;
      for (let i = 0; i < e.phase.length; i++) {
        const w = 0.5 + 0.5 * Math.sin(t * (2 + 4 * lv.vision) - e.phase[i]);
        e.glow.setColorAt(i, cTmp.copy(CH.vision.base).multiplyScalar(lv.vision * (0.03 + 0.5 * w ** 4)));
      }
      e.glow.instanceColor.needsUpdate = true;
    }
    funMat.emissiveIntensity = 2.4 * lv.odor * beat(2 + 4 * lv.odor);
    labMat.emissiveIntensity = 2.2 * lv.mn9 * beat(2 + 5 * lv.mn9);
    tarsusMat.emissiveIntensity = 0.25 * lv.mn9 * beat(1.6 + 3 * lv.mn9);
    eyeHalos.forEach(h => (h.material.opacity = 0.22 * lv.vision * beat(1.2 + 2 * lv.vision)));
    antHalos.forEach(h => (h.material.opacity = 0.5 * lv.odor * beat(1.5 + 3 * lv.odor)));
    labHalo.material.opacity = 0.6 * lv.mn9 * beat(2 + 4 * lv.mn9);
    mbHalo.material.opacity = 0.35 * lv.humidity * beat(1 + 2 * lv.humidity);
    for (const [name, ch] of Object.entries(CH)) {
      ch.flash *= Math.exp(-dt * 4);
      ch.mat.uniforms.uColor.value.copy(ch.base).multiplyScalar((0.006 + 0.6 * lv[name] * beat(1.3 + 2 * lv[name]) + ch.flash) * ch.gain);
    }

    if (now - lastSpawn > 520 / Math.max(0.3, organs.speed)) {
      lastSpawn = now;
      for (const name of ['vision', 'odor', 'humidity']) {
        if (lv[name] > 0.12 && Math.random() < lv[name]) ROUTES[name].forEach(r => spawn(r, CH[name].base, 0.6 + Math.random() * 0.3));
      }
      if (lv.mn9 > 0.12 && Math.random() < lv.mn9) {
        labTip.getWorldPosition(vTmp);
        body.worldToLocal(vTmp);
        spawn(path([cb, sez, vTmp.clone()]), CH.mn9.base, 0.7 + Math.random() * 0.3);
        for (let k = 0; k < 2; k++) spawn(ROUTES.legs[Math.floor(Math.random() * ROUTES.legs.length)], CH.legs.base, 0.32 + Math.random() * 0.12);
      }
    }
    let n = 0;
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      p.t += p.speed * dt * (0.6 + 0.4 * organs.speed);
      if (p.t >= 1) {
        const ch = Object.values(CH).find(c => c.base === p.color);
        if (ch) ch.flash = Math.min(0.6, ch.flash + 0.12);
        pulses.splice(i, 1);
      }
    }
    for (const p of pulses) {
      const fade = Math.min(1, p.t * 8) * Math.min(1, (1 - p.t) * 6);
      for (let k = 0; k < TRAIL; k++) {
        p.route.getPoint(Math.max(0, p.t - k * 0.035), vTmp);
        pPos.setXYZ(n, vTmp.x, vTmp.y, vTmp.z);
        pCol.setXYZ(n, p.color.r, p.color.g, p.color.b);
        pSize.setX(n, 0.09 * (1 - k * 0.18));
        pAlpha.setX(n, fade * (1 - k / TRAIL));
        n++;
      }
    }
    pGeo.setDrawRange(0, n);
    pPos.needsUpdate = pCol.needsUpdate = pSize.needsUpdate = pAlpha.needsUpdate = true;

    renderer.render(scene, camera);
  }

  function resize() {
    const w = wrap.clientWidth, h = wrap.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const vHalf = THREE.MathUtils.degToRad(camera.fov / 2), hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
    const elev = 0.42 + 0.2 * smooth(1.05, 0.7, camera.aspect);
    const halfH = ((top - GY) * Math.cos(elev) + 2 * reach * Math.sin(elev)) / 2;
    const dist = 1.06 * Math.max(reach / Math.sin(hHalf), halfH / Math.tan(vHalf));
    camera.position.set(0, Math.sin(elev) * dist, Math.cos(elev) * dist).add(target);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    pMat.uniforms.uScale.value = h * renderer.getPixelRatio() / (2 * Math.tan(vHalf));
  }
  new ResizeObserver(resize).observe(wrap);
  resize();

  cv.addEventListener('pointerdown', e => {
    dragging = true;
    lastX = e.clientX;
    lastDrag = performance.now();
    cv.setPointerCapture(e.pointerId);
    wrap.style.cursor = 'grabbing';
  });
  cv.addEventListener('pointermove', e => {
    if (!dragging) return;
    rotTarget += (e.clientX - lastX) * 0.01;
    lastX = e.clientX;
    lastDrag = performance.now();
  });
  const endDrag = () => {
    dragging = false;
    wrap.style.cursor = 'grab';
  };
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);

  new IntersectionObserver(([e]) => {
    last = 0;
    renderer.setAnimationLoop(e.isIntersecting ? frame : null);
  }).observe(wrap);
}
