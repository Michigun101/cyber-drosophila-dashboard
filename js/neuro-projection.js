// Нейропроекция: мозг дрозофилы по данным FlyWire, группы нейронов модели, спайки и растр.
// Данные — data/flywire-brain.js (window.FLYWIRE_BRAIN); разметка панели — секция #neuro в index.html.
// index.html вызывает mountNeuroProjection() из своего модуля и получает setInputs(s) и play().
function mountNeuroProjection({ THREE, BRAIN, NEURONS, HZ_MIN, HZ_MAX, toHz, mn9Hz }) {
  const $ = id => document.getElementById(id);

  const NP_GROUPS = {
    vision: {
      color: '#22d3ee', short: 'Оптические доли', role: 'in', area: 'по бокам мозга',
      about: 'Первичная обработка зрения — самая большая часть мозга мухи. Сюда приходит канал «Зрение»: график цены или температуры. Подсвечивается вся зона, а не отдельные клетки.'
    },
    orn: {
      color: '#e879f9', short: 'Or56a · запах', role: 'in', area: 'антеннальная доля, гломерул DA2',
      about: 'Обонятельные нейроны Or56a чувствуют геосмин — запах плесени, которого муха избегает. Их аксоны сходятся в гломерул DA2, дальше сигнал несут проекционные нейроны DA2. Сюда приходит канал «Запах».'
    },
    hygro: {
      color: '#a3e635', short: 'Гигрорецепторы', role: 'in', area: 'антеннальная доля, гломерулы VP',
      about: 'Датчики влажности и температуры в антенне: сухой воздух (VP4), влажный (VP5), испарительное охлаждение (VP1d) и холод (VP1l). Сюда приходит канал «Влажность».'
    },
    mn9: {
      color: '#fbbf24', short: 'MN9 · хоботок', role: 'out', area: 'подглоточная зона (SEZ)',
      about: 'Мотонейрон мышцы хоботка: чем чаще спайки, тем сильнее выдвигается хоботок. Это выход модели: 0,4 · зрение + 0,35 · запах + 0,25 · влажность в шкале 10–200 Гц.'
    },
    sugar: {
      color: '#fb7185', short: 'Сахар · вкус', role: 'off', area: 'подглоточная зона (SEZ)',
      about: 'Вкусовые нейроны хоботка реагируют на сахар и запускают его выдвижение. В прогнозе пока не участвуют — их можно включить импульсом.'
    },
    jo: {
      color: '#a78bfa', short: 'Джонстонов орган', role: 'off', area: 'AMMC, механосенсорный центр антенны',
      about: 'Механорецепторы второго членика антенны, группы A и B: слышат звук и вибрацию, в том числе песню ухаживания самца. В прогнозе пока не участвуют.'
    },
    dn: {
      color: '#60a5fa', short: 'Нисходящие DN', role: 'off', area: 'из мозга в грудной ганглий',
      about: 'Командные нейроны, которые передают решения мозга в нервную цепочку: DNp01 — гигантское волокно прыжка-побега, DNa01 — повороты при ходьбе. В прогнозе пока не участвуют.'
    }
  };
  const NP_KEYS = Object.keys(NP_GROUPS);
  const NP_ROLE = { in: 'вход', out: 'выход', off: 'не в модели' };
  const NP_CHANNEL = { vision: 'канал «Зрение»', orn: 'канал «Запах»', hygro: 'канал «Влажность»', mn9: 'прогноз' };
  const NP_VIEWS = {
    front: { name: 'ВИД СПЕРЕДИ', dir: [0, 0, 1], up: [0, 1, 0] },
    top: { name: 'ВИД СВЕРХУ', dir: [0, 1, 0], up: [0, 0, 1] },
    side: { name: 'ВИД СБОКУ', dir: [1, 0, 0], up: [0, 1, 0] }
  };
  const NP_COLUMN = { orn: -1, hygro: -1, jo: -1, mn9: 1, sugar: 1, dn: 1 };
  const NP_SLOW = 20, NP_D = 2000, NP_RAD = 440;
  const plural = (n, one, few, many) => {
    const a = n % 10, b = n % 100;
    return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 10 || b >= 20) ? few : many;
  };
  const neuronsWord = n => `${n.toLocaleString('ru-RU')} ${plural(n, 'нейрон', 'нейрона', 'нейронов')}`;
  const npBytes = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  // Облако: коды Мортона по возрастанию, разности в коде Райса, длинные скачки — 24 бита после esc единиц.
  function npDecodeCloud({ n, first, k, esc, bits }) {
    const bytes = npBytes(bits), out = new Uint8Array((n[0] + n[1]) * 3);
    let at = 0, o = 0;
    const read = len => {
      let v = 0;
      for (let i = 0; i < len; i++, at++) v = v << 1 | bytes[at >> 3] >> (7 - (at & 7)) & 1;
      return v;
    };
    n.forEach((count, part) => {
      let code = first[part];
      for (let i = 0; i < count; i++) {
        if (i) {
          let q = 0;
          while (q < esc && read(1)) q++;
          code += 1 + (q < esc ? (q << k[part]) + read(k[part]) : read(24));
        }
        for (let a = 0; a < 3; a++) {
          let v = 0;
          for (let b = 0; b < 8; b++) v |= (code >> (3 * b + a) & 1) << b;
          out[o++] = v;
        }
      }
    });
    return out;
  }
  const npSpan = BRAIN.hi.map((h, i) => h - BRAIN.lo[i]);
  const npCenter = new THREE.Vector3(...BRAIN.lo.map((l, i) => l + npSpan[i] / 2));
  let npSeed = 7;
  const npRand = () => (npSeed = (npSeed * 16807) % 2147483647) / 2147483647;
  const avg = pts => pts.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(Math.max(1, pts.length));

  const npStage = $('np-stage');
  const npR = new THREE.WebGLRenderer({ antialias: false, alpha: true });
  npR.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  npStage.prepend(npR.domElement);
  const npScene = new THREE.Scene();
  const npCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, NP_D * 2);
  const npPR = npR.getPixelRatio();
  const glow = { transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending };
  const depthGlsl = 'clamp((mv.z + uD + uRad) / (2. * uRad), 0., 1.)';

  const cloudBytes = npDecodeCloud(BRAIN.cloud);
  const nCloud = cloudBytes.length / 3;
  const cloudPos = new Float32Array(nCloud * 3), cloudOptic = new Float32Array(nCloud), cloudSeed = new Float32Array(nCloud);
  for (let i = 0; i < nCloud * 3; i++) cloudPos[i] = BRAIN.lo[i % 3] + (cloudBytes[i] + npRand()) / 256 * npSpan[i % 3];
  for (let i = 0; i < nCloud; i++) {
    cloudOptic[i] = i < BRAIN.cloud.n[0] ? 1 : 0;
    cloudSeed[i] = npRand();
  }
  const cloudGeo = new THREE.BufferGeometry();
  cloudGeo.setAttribute('position', new THREE.BufferAttribute(cloudPos, 3));
  cloudGeo.setAttribute('aOptic', new THREE.BufferAttribute(cloudOptic, 1));
  cloudGeo.setAttribute('aSeed', new THREE.BufferAttribute(cloudSeed, 1));
  const cloudMat = new THREE.ShaderMaterial({
    ...glow,
    uniforms: {
      uPR: { value: npPR }, uD: { value: NP_D }, uRad: { value: NP_RAD },
      uTime: { value: 0 }, uVision: { value: 0 }, uDim: { value: 1 }, uOptic: { value: 0 }
    },
    vertexShader: `attribute float aOptic, aSeed;
      uniform float uPR, uD, uRad, uTime, uVision, uDim, uOptic;
      varying vec3 vC; varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.);
        gl_Position = projectionMatrix * mv;
        float k = ${depthGlsl};
        float wave = aOptic * uVision * (.5 + .5 * sin(uTime * 2.4 - abs(position.x) * .028 + aSeed * 2.));
        float hot = clamp(wave + aOptic * uOptic * .7, 0., 1.);
        vC = mix(mix(vec3(.47, .56, .86), vec3(.38, .72, .95), aOptic), vec3(.3, .92, 1.), hot);
        vA = (.85 + .9 * hot) * (.3 + .7 * k) * (.85 + .15 * sin(uTime * .8 + aSeed * 40.)) * mix(uDim, 1., aOptic * uOptic);
        gl_PointSize = (2.4 + 1.2 * hot) * uPR;
      }`,
    fragmentShader: `varying vec3 vC; varying float vA;
      void main() { float d = length(gl_PointCoord - .5) * 2.; gl_FragColor = vec4(vC, exp(-d * d * 4.) * vA); }`
  });
  npScene.add(new THREE.Points(cloudGeo, cloudMat));

  const sparkMat = () => new THREE.ShaderMaterial({
    ...glow,
    uniforms: { uPR: { value: npPR }, uD: { value: NP_D }, uRad: { value: NP_RAD } },
    vertexShader: `attribute vec3 aColor; attribute float aBright, aSize;
      uniform float uPR, uD, uRad;
      varying vec3 vC; varying float vB;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.);
        gl_Position = projectionMatrix * mv;
        vC = aColor;
        vB = aBright * (.55 + .45 * ${depthGlsl});
        gl_PointSize = aSize * uPR;
      }`,
    fragmentShader: `varying vec3 vC; varying float vB;
      void main() {
        float d = length(gl_PointCoord - .5) * 2.;
        float core = exp(-d * d * 28.), halo = exp(-d * d * 4.5) * .4;
        gl_FragColor = vec4(mix(vC, vec3(1.), core * clamp(vB - .7, 0., .6)), (core + halo) * vB);
      }`
  });

  function sparkPoints(n) {
    const geo = new THREE.BufferGeometry();
    const attr = (name, size) => {
      const a = new THREE.BufferAttribute(new Float32Array(n * size), size);
      a.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(name, a);
      return a.array;
    };
    const buf = { geo, pos: attr('position', 3), color: attr('aColor', 3), bright: attr('aBright', 1), size: attr('aSize', 1) };
    const pts = new THREE.Points(geo, sparkMat());
    pts.frustumCulled = false;
    npScene.add(pts);
    return buf;
  }

  const npCells = [];
  const npInfo = {};
  for (const g of NP_KEYS) {
    const src = BRAIN.groups[g];
    const cells = [];
    if (src) {
      const q = new Uint16Array(npBytes(src.pos).buffer);
      NEURONS[g].ids.forEach((id, i) => cells.push({
        g, id, flash: 0, row: -1,
        p: new THREE.Vector3(...[0, 1, 2].map(k => BRAIN.lo[k] + q[i * 3 + k] / 65535 * npSpan[k])),
        type: src.types[parseInt(src.meta[i * 2], 16)],
        side: src.meta[i * 2 + 1]
      }));
    }
    npCells.push(...cells);
    const pts = cells.length ? cells.map(c => c.p) : BRAIN.lobes.map(p => new THREE.Vector3(...p));
    npInfo[g] = { cells, pts, centroid: avg(pts), base: 0, hz: 0, level: 0, stim: null };
  }
  const sideOf = (pts, s) => avg(pts.filter(p => Math.sign(p.x) === s));

  const cellBuf = sparkPoints(npCells.length);
  const NP_SIZE = { jo: 7, mn9: 18, dn: 15 };
  npCells.forEach((c, i) => {
    c.p.toArray(cellBuf.pos, i * 3);
    new THREE.Color(NP_GROUPS[c.g].color).toArray(cellBuf.color, i * 3);
    c.size = NP_SIZE[c.g] || 11;
  });
  cellBuf.geo.attributes.position.needsUpdate = true;
  cellBuf.geo.attributes.aColor.needsUpdate = true;

  const mn9Cells = npInfo.mn9.cells;
  const mn9On = s => mn9Cells.find(c => Math.sign(c.p.x) === s) || mn9Cells[0];
  const npOutlet = new THREE.Vector3(0, BRAIN.lo[1] - 30, avg(mn9Cells.map(c => c.p)).z + 50);
  const npCorners = [0, 1, 2, 3, 4, 5, 6, 7].map(i => new THREE.Vector3(
    i & 1 ? BRAIN.hi[0] : BRAIN.lo[0], i & 2 ? BRAIN.hi[1] : BRAIN.lo[1], i & 4 ? BRAIN.hi[2] : BRAIN.lo[2]))
    .concat(npOutlet.clone().add(new THREE.Vector3(0, -30, 0)));
  const npPaths = [];
  for (const g of ['vision', 'orn', 'hygro']) {
    for (const s of [-1, 1]) {
      const a = sideOf(npInfo[g].pts, s), to = mn9On(s);
      const ctrl = a.clone().add(to.p).multiplyScalar(0.5).add(new THREE.Vector3(0, g === 'vision' ? 80 : 50, 60));
      npPaths.push({ g, to, acc: 0, curve: new THREE.QuadraticBezierCurve3(a, ctrl, to.p.clone()) });
    }
  }
  for (const c of mn9Cells) {
    const ctrl = c.p.clone().lerp(npOutlet, 0.5).add(new THREE.Vector3(0, 0, 40));
    npPaths.push({ g: 'mn9', out: true, acc: 0, curve: new THREE.QuadraticBezierCurve3(c.p.clone(), ctrl, npOutlet.clone()) });
  }
  for (const path of npPaths) {
    const pts = path.curve.getPoints(64);
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    geo.setAttribute('aT', new THREE.Float32BufferAttribute(pts.map((_, i) => i / 64), 1));
    path.mat = new THREE.ShaderMaterial({
      ...glow,
      uniforms: { uColor: { value: new THREE.Color(NP_GROUPS[path.g].color) }, uTime: { value: 0 }, uLevel: { value: 0 }, uDim: { value: 1 } },
      vertexShader: `attribute float aT; varying float vT;
        void main() { vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
      fragmentShader: `uniform vec3 uColor; uniform float uTime, uLevel, uDim; varying float vT;
        void main() {
          float dash = step(.55, fract(vT * 14. - uTime * 1.6));
          float fade = smoothstep(0., .1, vT) * smoothstep(1., .88, vT);
          gl_FragColor = vec4(uColor, (.08 + .3 * dash * uLevel) * fade * uDim);
        }`
    });
    npScene.add(new THREE.Line(geo, path.mat));
  }

  const NP_PMAX = 400;
  const partBuf = sparkPoints(NP_PMAX);
  const npParts = [];

  const npRows = [];
  for (const g of NP_KEYS) {
    const cells = npInfo[g].cells, n = Math.min(g === 'mn9' ? 2 : 4, cells.length || 4);
    for (let k = 0; k < n; k++) {
      if (cells.length) cells[Math.floor(k * cells.length / n)].row = npRows.length;
      npRows.push({ g, virtual: !cells.length, spikes: [] });
    }
  }

  const npHud = $('np-hud'), hctx = npHud.getContext('2d');
  const npRaster = $('np-raster'), rctx = npRaster.getContext('2d');
  const npTip = $('np-tip');
  const npReduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const npV = new THREE.Vector3();
  const np = {
    W: 1, H: 1, view: 'front', focus: null, hover: null, drag: null, rings: [],
    q: new THREE.Quaternion(), qT: new THREE.Quaternion(), camQ: new THREE.Quaternion(),
    c: npCenter.clone(), cT: npCenter.clone(), scale: 1, scaleT: 1, fit: 1, last: 0, ui: 0, ready: false
  };

  function viewQuat(v) {
    const z = new THREE.Vector3(...v.dir), y = new THREE.Vector3(...v.up);
    const x = new THREE.Vector3().crossVectors(y, z);
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  }

  function halfExtents(pts, c, q) {
    const inv = q.clone().invert();
    let ex = 1, ey = 1;
    for (const p of pts) {
      npV.copy(p).sub(c).applyQuaternion(inv);
      ex = Math.max(ex, Math.abs(npV.x));
      ey = Math.max(ey, Math.abs(npV.y));
    }
    return [ex, ey];
  }

  function npFrame() {
    const [ex, ey] = halfExtents(npCorners, npCenter, np.qT);
    np.fit = Math.min(np.W * 0.47 / ex, np.H * 0.45 / ey);
    const f = np.focus && np.focus !== 'vision' ? npInfo[np.focus] : null;
    if (f) {
      const [gx, gy] = halfExtents(f.pts, f.centroid, np.qT);
      np.scaleT = Math.min(np.fit * 1.8, Math.max(np.fit, Math.min(np.W * 0.3 / gx, np.H * 0.3 / gy)));
      np.cT.copy(f.centroid);
    } else {
      np.scaleT = np.fit;
      np.cT.copy(npCenter);
    }
  }

  function npSetView(name) {
    np.view = name;
    document.querySelectorAll('.np-view').forEach(b => {
      b.classList.toggle('is-on', b.dataset.view === name);
      b.setAttribute('aria-pressed', String(b.dataset.view === name));
    });
    if (name) np.qT.copy(viewQuat(NP_VIEWS[name]));
    npFrame();
  }

  function npFocus(g) {
    np.focus = g;
    document.querySelectorAll('.np-row').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.g === g)));
    npFrame();
    npRenderCard();
  }

  function npStim(g, t0, dur) {
    npInfo[g].stim = { t0, dur };
  }

  function npRing(p, color, t0) {
    np.rings.push({ p, color, t0 });
  }

  function npPlay() {
    const now = performance.now();
    for (const g of ['vision', 'orn', 'hygro']) npStim(g, now, 2.2);
    npStim('mn9', now + 1000, 2.4);
    mn9Cells.forEach(c => npRing(c.p, NP_GROUPS.mn9.color, now + 1000));
  }

  function npSetInputs(s) {
    npInfo.vision.base = toHz(s.vision);
    npInfo.orn.base = toHz(s.odor);
    npInfo.hygro.base = toHz(s.humidity);
    npInfo.mn9.base = mn9Hz(s);
    npUpdateHz(performance.now());
    npRenderRows();
  }

  function npUpdateHz(now) {
    for (const g of NP_KEYS) {
      const info = npInfo[g];
      let hz = info.base;
      if (info.stim) {
        const t = (now - info.stim.t0) / 1000;
        if (t > info.stim.dur * 2) info.stim = null;
        else if (t >= 0) {
          const hold = info.stim.dur * 0.55;
          const env = t < 0.15 ? t / 0.15 : t < hold ? 1 : Math.exp(-(t - hold) / (info.stim.dur * 0.25));
          if (env > 0.05) hz = Math.max(hz, HZ_MAX * env);
        }
      }
      info.hz = hz;
      info.level = hz > 0 ? Math.min(1, Math.max(0, (hz - HZ_MIN) / (HZ_MAX - HZ_MIN))) : 0;
    }
  }

  const hzLabel = g => (npInfo[g].hz > 0 ? Math.round(npInfo[g].hz) + ' Гц' : '—');

  function npSpikes(now, dt) {
    const eff = np.hover || np.focus;
    const decay = Math.exp(-dt / 0.12);
    npCells.forEach((c, i) => {
      const info = npInfo[c.g];
      if (info.hz > 0 && Math.random() < info.hz / NP_SLOW * dt) {
        c.flash = 1;
        if (c.row >= 0) npRows[c.row].spikes.push(now);
      }
      c.flash *= decay;
      const on = !eff || eff === c.g;
      const k = eff ? (on ? 1.25 : 0.14) : 1;
      cellBuf.bright[i] = (0.34 + 0.55 * info.level + 1.1 * c.flash) * k;
      cellBuf.size[i] = c.size * (1 + 0.6 * c.flash) * (eff && on ? 1.2 : 1);
    });
    for (const row of npRows) {
      if (row.virtual && Math.random() < npInfo[row.g].hz / NP_SLOW * dt) row.spikes.push(now);
      while (row.spikes.length && now - row.spikes[0] > 3200) row.spikes.shift();
    }
    cellBuf.geo.attributes.aBright.needsUpdate = true;
    cellBuf.geo.attributes.aSize.needsUpdate = true;
  }

  function npParticles(now, dt, t) {
    const eff = np.hover || np.focus;
    for (const path of npPaths) {
      const info = npInfo[path.g];
      const on = !eff || eff === path.g || (eff === 'mn9');
      path.mat.uniforms.uTime.value = t;
      path.mat.uniforms.uLevel.value = info.level;
      path.mat.uniforms.uDim.value = on ? 1 : 0.15;
      path.acc += (info.level * 3 + (info.stim ? 6 : 0)) * dt;
      while (path.acc >= 1 && npParts.length < NP_PMAX) {
        path.acc -= 1;
        npParts.push({ path, t: 0, v: 0.5 + Math.random() * 0.25 });
      }
      path.acc = Math.min(path.acc, 1);
    }
    let n = 0;
    for (let i = npParts.length - 1; i >= 0; i--) {
      const pt = npParts[i];
      pt.t += pt.v * dt;
      if (pt.t >= 1) {
        if (pt.path.to) pt.path.to.flash = Math.min(1, pt.path.to.flash + 0.3);
        npParts.splice(i, 1);
      }
    }
    for (const pt of npParts) {
      const on = !eff || eff === pt.path.g || eff === 'mn9';
      pt.path.curve.getPoint(pt.t, npV).toArray(partBuf.pos, n * 3);
      pt.path.mat.uniforms.uColor.value.toArray(partBuf.color, n * 3);
      partBuf.bright[n] = Math.sqrt(Math.sin(Math.PI * pt.t)) * (on ? 0.95 : 0.12);
      partBuf.size[n] = 9;
      n++;
    }
    const a = partBuf.geo.attributes;
    a.position.needsUpdate = a.aColor.needsUpdate = a.aBright.needsUpdate = a.aSize.needsUpdate = true;
    partBuf.geo.setDrawRange(0, n);
  }

  function npProject(p) {
    npV.copy(p).project(npCam);
    return [(npV.x + 1) / 2 * np.W, (1 - npV.y) / 2 * np.H];
  }

  const rrect = (x, y, w, h, r) => (hctx.roundRect ? hctx.roundRect(x, y, w, h, r) : hctx.rect(x, y, w, h));

  function pill(x, y, w, color, alpha) {
    hctx.beginPath();
    rrect(x, y - 11, w, 22, 11);
    hctx.fillStyle = `rgba(4, 7, 15, ${0.8 * alpha})`;
    hctx.fill();
    hctx.strokeStyle = color + Math.round(alpha * 110).toString(16).padStart(2, '0');
    hctx.stroke();
  }

  function npLayoutCallouts() {
    const cols = { '-1': [], '1': [] };
    if (np.W < 720) return [];
    const mid = np.W / 2;
    for (const g of NP_KEYS) {
      if (!NP_COLUMN[g] || (np.focus && g !== np.focus)) continue;
      const side = NP_COLUMN[g];
      const proj = npInfo[g].pts.map(npProject);
      const mine = proj.filter(([x]) => Math.sign(x - mid) === side);
      const use = mine.length ? mine : proj;
      const tx = use.reduce((s, p) => s + p[0], 0) / use.length, ty = use.reduce((s, p) => s + p[1], 0) / use.length;
      const name = NP_GROUPS[g].short, hz = npInfo[g].hz > 0 ? hzLabel(g) : '';
      hctx.font = '500 11px Inter, sans-serif';
      const wName = hctx.measureText(name).width;
      hctx.font = '600 11px Inter, sans-serif';
      const wHz = hz ? hctx.measureText(hz).width + 8 : 0;
      cols[side].push({ g, side, tx, ty, y: ty, name, hz, wName, w: 30 + wName + wHz });
    }
    for (const side of [-1, 1]) {
      const items = cols[side].sort((a, b) => a.ty - b.ty);
      const top = 58, bottom = np.H - 64;
      items.forEach((it, i) => { it.y = Math.max(Math.min(it.ty, bottom), i ? items[i - 1].y + 30 : top); });
      for (let i = items.length - 1; i >= 0; i--) {
        const lim = i === items.length - 1 ? bottom : items[i + 1].y - 30;
        if (items[i].y > lim) items[i].y = lim;
      }
      items.forEach(it => { it.x = side < 0 ? 24 : np.W - 24 - it.w; });
    }
    return [...cols['-1'], ...cols['1']];
  }

  function npDrawCallouts(items) {
    for (const it of items) {
      const color = NP_GROUPS[it.g].color, x = it.x;
      const ax = it.side < 0 ? x + it.w : x, ex = ax - it.side * 18;
      hctx.globalAlpha = !np.hover || np.hover === it.g ? 1 : 0.35;
      hctx.strokeStyle = color + '8c';
      hctx.lineWidth = 1;
      hctx.beginPath();
      hctx.moveTo(ax, it.y);
      hctx.lineTo(ex, it.y);
      hctx.lineTo(it.tx, it.ty);
      hctx.stroke();
      hctx.beginPath();
      hctx.arc(it.tx, it.ty, 4.5, 0, Math.PI * 2);
      hctx.stroke();
      pill(x, it.y, it.w, color, 1);
      hctx.fillStyle = color;
      hctx.beginPath();
      hctx.arc(x + 13, it.y, 3.5, 0, Math.PI * 2);
      hctx.fill();
      hctx.font = '500 11px Inter, sans-serif';
      hctx.fillStyle = '#e2e8f0';
      hctx.fillText(it.name, x + 23, it.y + 4);
      if (it.hz) {
        hctx.font = '600 11px Inter, sans-serif';
        hctx.fillStyle = color;
        hctx.fillText(it.hz, x + 31 + it.wName, it.y + 4);
      }
      hctx.globalAlpha = 1;
    }
  }

  function npLandmarks(boxes) {
    const dim = a => (np.hover && np.hover !== a ? 0.35 : 1);
    const free = (x, y, w) => !boxes.some(b => x - w / 2 < b.x + b.w + 8 && x + w / 2 > b.x - 8 && y - 14 < b.y + 13 && y + 20 > b.y - 13);
    hctx.textAlign = 'center';
    if (np.W >= 560 && (!np.focus || np.focus === 'vision')) {
      const placed = [];
      for (const p of npInfo.vision.pts) {
        const [x, y0] = npProject(p), off = 105 * np.scale;
        const y = [y0 - off, y0 + off, y0].find(c => free(x, c, 150)) ?? y0 - off;
        if (placed.some(([px, py]) => Math.hypot(px - x, py - y) < 160)) continue;
        placed.push([x, y]);
        hctx.globalAlpha = dim('vision');
        hctx.beginPath();
        rrect(x - 84, y - 15, 168, 38, 12);
        hctx.fillStyle = 'rgba(4, 7, 15, .6)';
        hctx.fill();
        hctx.strokeStyle = 'rgba(34, 211, 238, .22)';
        hctx.stroke();
        hctx.font = '600 9px Orbitron, sans-serif';
        hctx.letterSpacing = '2px';
        hctx.fillStyle = 'rgba(103, 232, 249, .8)';
        hctx.fillText('ОПТИЧЕСКАЯ ДОЛЯ', x, y);
        hctx.letterSpacing = '0px';
        hctx.font = '600 11px Inter, sans-serif';
        hctx.fillStyle = NP_GROUPS.vision.color;
        hctx.fillText(hzLabel('vision'), x, y + 16);
      }
    }
    if (!np.focus || np.focus === 'mn9') {
      const [x, y] = npProject(npOutlet), [cx, cy] = npProject(np.c);
      const len = Math.hypot(x - cx, y - cy) || 1, dx = (x - cx) / len, dy = (y - cy) / len;
      hctx.globalAlpha = dim('mn9');
      hctx.fillStyle = NP_GROUPS.mn9.color;
      hctx.beginPath();
      hctx.arc(x, y, 3, 0, Math.PI * 2);
      hctx.fill();
      hctx.font = '500 11px Inter, sans-serif';
      hctx.textAlign = Math.abs(dx) < 0.5 ? 'center' : dx > 0 ? 'left' : 'right';
      hctx.fillText('к хоботку → прогноз', x + dx * 14, y + dy * 16 + 4);
    }
    hctx.globalAlpha = 1;
    hctx.textAlign = 'start';
  }

  function npDrawHud(now, t) {
    const { W, H } = np;
    hctx.clearRect(0, 0, W, H);
    hctx.textBaseline = 'alphabetic';
    hctx.font = '600 10px Orbitron, sans-serif';
    hctx.letterSpacing = '2px';
    hctx.fillStyle = 'rgba(165, 243, 252, .85)';
    hctx.fillText(np.view ? NP_VIEWS[np.view].name : 'СВОБОДНЫЙ ВИД', 26, 32);
    const playing = NP_KEYS.some(g => npInfo[g].stim && now >= npInfo[g].stim.t0);
    npStage.classList.toggle('is-signal', playing);
    const live = playing ? 'СИГНАЛ' : 'LIVE';
    const lw = hctx.measureText(live).width;
    hctx.fillStyle = playing ? 'rgba(251, 191, 36, .95)' : 'rgba(165, 243, 252, .85)';
    hctx.fillText(live, W - 26 - lw, 32);
    hctx.letterSpacing = '0px';
    hctx.beginPath();
    hctx.arc(W - 36 - lw, 28.5, 3.5, 0, Math.PI * 2);
    hctx.globalAlpha = 0.45 + 0.55 * Math.abs(Math.sin(t * 2.2));
    hctx.fill();
    hctx.globalAlpha = 1;
    hctx.font = '400 11px Inter, sans-serif';
    hctx.fillStyle = 'rgba(148, 163, 184, .7)';
    hctx.fillText('FlyWire · FAFB', 26, 49);

    const um = [50, 100, 200].find(u => u * np.scale >= 60) || 200;
    const len = um * np.scale, by = H - 30;
    hctx.strokeStyle = 'rgba(203, 213, 225, .75)';
    hctx.lineWidth = 1;
    hctx.beginPath();
    hctx.moveTo(26, by - 4); hctx.lineTo(26, by); hctx.lineTo(26 + len, by); hctx.lineTo(26 + len, by - 4);
    hctx.stroke();
    hctx.fillStyle = 'rgba(203, 213, 225, .85)';
    hctx.fillText(`${um} мкм`, 26, by - 9);

    const gx = W - 60, gy = H - 52, inv = np.camQ.clone().invert();
    [['лев', [1, 0, 0]], ['верх', [0, 1, 0]], ['перед', [0, 0, 1]]]
      .map(([label, d]) => [label, npV.set(...d).applyQuaternion(inv).toArray()])
      .sort((a, b) => a[1][2] - b[1][2])
      .forEach(([label, [x, y, z]]) => {
        if (Math.hypot(x, y) < 0.3) return;
        const a = 0.35 + 0.65 * (z + 1) / 2;
        hctx.strokeStyle = `rgba(165, 243, 252, ${a})`;
        hctx.beginPath();
        hctx.moveTo(gx, gy);
        hctx.lineTo(gx + x * 22, gy - y * 22);
        hctx.stroke();
        hctx.fillStyle = `rgba(203, 213, 225, ${a})`;
        hctx.font = '500 10px Inter, sans-serif';
        const w = hctx.measureText(label).width;
        hctx.fillText(label, gx + x * 32 - w / 2, gy - y * 32 + 3);
      });

    const callouts = npLayoutCallouts();
    npLandmarks(callouts);
    npDrawCallouts(callouts);

    np.rings = np.rings.filter(r => now - r.t0 < 1100);
    for (const r of np.rings) {
      const k = (now - r.t0) / 1100;
      if (k < 0) continue;
      const [x, y] = npProject(r.p);
      hctx.strokeStyle = r.color;
      hctx.globalAlpha = 1 - k;
      hctx.lineWidth = 2 * (1 - k) + 0.5;
      hctx.beginPath();
      hctx.arc(x, y, 8 + 70 * k, 0, Math.PI * 2);
      hctx.stroke();
    }
    hctx.globalAlpha = 1;
    hctx.lineWidth = 1;
  }

  function npDrawRaster(now) {
    const w = npRaster.clientWidth, h = npRaster.clientHeight;
    rctx.clearRect(0, 0, w, h);
    const left = 128, right = 10, axis = 16, groups = NP_KEYS.length;
    const gap = 5, rowH = (h - axis - gap * (groups - 1)) / npRows.length;
    const tw = w - left - right;
    rctx.font = '400 10px Inter, sans-serif';
    rctx.fillStyle = 'rgba(100, 116, 139, .9)';
    [3, 2, 1, 0].forEach(s => {
      const x = left + tw - s / 3 * tw;
      const label = s ? `−${s} с` : 'сейчас';
      const lw = rctx.measureText(label).width;
      rctx.fillText(label, Math.min(x - lw / 2, w - lw), h - 3);
    });
    rctx.fillStyle = 'rgba(148, 163, 184, .06)';
    for (let k = 0; k <= 3; k++) rctx.fillRect(left + k / 3 * tw, 0, 1, h - axis);
    let y = 0, prev = null;
    npRows.forEach(row => {
      const color = NP_GROUPS[row.g].color;
      if (row.g !== prev) {
        if (prev) y += gap;
        const n = npRows.filter(r => r.g === row.g).length;
        const eff = np.hover || np.focus;
        rctx.globalAlpha = !eff || eff === row.g ? 1 : 0.35;
        rctx.fillStyle = 'rgba(148, 163, 184, .05)';
        rctx.fillRect(left, y, tw, n * rowH);
        rctx.fillStyle = color;
        rctx.beginPath();
        rctx.arc(6, y + n * rowH / 2, 3, 0, Math.PI * 2);
        rctx.fill();
        rctx.font = '500 11px Inter, sans-serif';
        rctx.fillStyle = '#cbd5e1';
        rctx.fillText(NP_GROUPS[row.g].short, 16, y + n * rowH / 2 + 4);
        prev = row.g;
      }
      rctx.fillStyle = color;
      for (const s of row.spikes) {
        const x = left + tw - (now - s) / 3000 * tw;
        if (x < left) continue;
        rctx.fillRect(x, y + 0.5, 1.6, Math.max(1, rowH - 1));
      }
      y += rowH;
    });
    rctx.globalAlpha = 1;
  }

  function npRenderRows() {
    for (const g of NP_KEYS) {
      const el = npRowEls[g], info = npInfo[g];
      el.hz.textContent = hzLabel(g);
      el.meter.style.width = (info.level * 100).toFixed(1) + '%';
      el.row.classList.toggle('is-off', NP_GROUPS[g].role === 'off' && !info.hz);
    }
  }

  function npLoop() {
    const now = performance.now(), t = now / 1000;
    const dt = Math.min(0.05, np.last ? (now - np.last) / 1000 : 0.016);
    np.last = now;
    const k = 1 - Math.exp(-dt * (np.drag ? 14 : 5));
    np.q.slerp(np.qT, k);
    np.scale += (np.scaleT - np.scale) * k;
    np.c.lerp(np.cT, k);
    const sway = npReduce || np.drag ? 0 : 0.13 * Math.sin(t * 0.32);
    np.camQ.copy(np.q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), sway));
    npCam.quaternion.copy(np.camQ);
    npCam.position.set(0, 0, NP_D).applyQuaternion(np.camQ).add(np.c);
    npCam.left = -np.W / 2 / np.scale;
    npCam.right = np.W / 2 / np.scale;
    npCam.top = np.H / 2 / np.scale;
    npCam.bottom = -np.H / 2 / np.scale;
    npCam.updateProjectionMatrix();
    npCam.updateMatrixWorld();

    npUpdateHz(now);
    const eff = np.hover || np.focus;
    cloudMat.uniforms.uTime.value = t;
    cloudMat.uniforms.uVision.value = npInfo.vision.level;
    cloudMat.uniforms.uOptic.value += ((eff === 'vision' ? 1 : 0) - cloudMat.uniforms.uOptic.value) * k;
    cloudMat.uniforms.uDim.value += ((eff ? 0.55 : 1) - cloudMat.uniforms.uDim.value) * k;
    npSpikes(now, dt);
    npParticles(now, dt, t);
    npR.render(npScene, npCam);
    npDrawHud(now, t);
    npDrawRaster(now);
    if (now - np.ui > 150) {
      np.ui = now;
      npRenderRows();
    }
  }

  function npResize() {
    const W = npStage.clientWidth, H = npStage.clientHeight;
    if (!W || !H) return;
    np.W = W;
    np.H = H;
    npR.setSize(W, H, false);
    const dpr = Math.min(window.devicePixelRatio, 2);
    npHud.width = W * dpr;
    npHud.height = H * dpr;
    hctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    npRaster.width = npRaster.clientWidth * dpr;
    npRaster.height = npRaster.clientHeight * dpr;
    rctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    npFrame();
    if (!np.ready) {
      np.ready = true;
      np.scale = np.scaleT;
    }
  }

  function npPick(mx, my) {
    let best = null, bd = 14 * 14;
    for (const c of npCells) {
      if (np.focus && c.g !== np.focus) continue;
      const [x, y] = npProject(c.p);
      const d = (x - mx) ** 2 + (y - my) ** 2;
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    if (best || (np.focus && np.focus !== 'vision')) return best;
    const r = 110 * np.scale;
    return npInfo.vision.pts.some(p => {
      const [x, y] = npProject(p);
      return (x - mx) ** 2 + (y - my) ** 2 < r * r;
    }) ? { g: 'vision' } : null;
  }

  function npShowTip(c, mx, my) {
    if (!c) {
      npTip.hidden = true;
      return;
    }
    const G = NP_GROUPS[c.g];
    const side = { L: 'левое полушарие', R: 'правое полушарие' }[c.side] || 'сторона не указана';
    npTip.innerHTML = c.id
      ? `<div class="flex items-center gap-2"><span class="np-dot" style="--c:${G.color}"></span><b class="text-slate-100">${c.type}</b></div>` +
        `<div class="text-slate-400 mt-1">${G.short} · ${side}</div>` +
        `<div class="text-slate-500 tabular-nums">root_id ${c.id}</div>` +
        `<div class="mt-1 font-semibold" style="color:${G.color}">${npInfo[c.g].hz > 0 ? hzLabel(c.g) : NP_ROLE.off}</div>`
      : `<div class="flex items-center gap-2"><span class="np-dot" style="--c:${G.color}"></span><b class="text-slate-100">Оптическая доля</b></div>` +
        `<div class="text-slate-400 mt-1">${neuronsWord(BRAIN.optic)} в двух долях</div>` +
        `<div class="mt-1 font-semibold" style="color:${G.color}">${hzLabel('vision')} · канал «Зрение»</div>`;
    npTip.hidden = false;
    const tw = npTip.offsetWidth, th = npTip.offsetHeight;
    const x = mx + 16 + tw > np.W ? mx - 16 - tw : mx + 16;
    const y = my + 16 + th > np.H ? my - 16 - th : my + 16;
    npTip.style.transform = `translate(${Math.max(4, x)}px, ${Math.max(4, y)}px)`;
  }

  const npRowEls = {};
  $('np-groups').innerHTML = NP_KEYS.map(g => {
    const G = NP_GROUPS[g];
    const n = g === 'vision' ? BRAIN.optic : npInfo[g].cells.length;
    return `<button class="np-row" data-g="${g}" aria-pressed="false" style="--c:${G.color}">` +
      `<span class="np-dot"></span>` +
      `<span class="min-w-0"><span class="np-name">${G.short}</span>` +
      `<span class="np-sub">${NP_ROLE[G.role]} · ${neuronsWord(n)}</span></span>` +
      `<span class="np-hz">—</span><span class="np-meter"><i></i></span></button>`;
  }).join('');
  document.querySelectorAll('.np-row').forEach(row => {
    const g = row.dataset.g;
    npRowEls[g] = { row, hz: row.querySelector('.np-hz'), meter: row.querySelector('.np-meter i') };
    row.addEventListener('click', () => npFocus(np.focus === g ? null : g));
    row.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') np.hover = g; });
    row.addEventListener('pointerleave', () => { np.hover = null; });
  });

  function npRenderCard() {
    const g = np.focus, card = $('np-card');
    const fact = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
    if (!g) {
      card.style.setProperty('--c', '#67e8f9');
      $('np-card-title').textContent = 'Как читать проекцию';
      $('np-card-text').textContent = 'Голубые точки — выборка нейронов мозга мухи в реальных координатах. ' +
        'Цветные — нейроны модели: чем выше частота в пульте, тем чаще они вспыхивают. ' +
        'Частицы несут сигнал входов к MN9, а MN9 решает прогноз. Тяни, чтобы повернуть мозг.';
      $('np-card-facts').innerHTML = fact('Нейронов в мозге', BRAIN.total.toLocaleString('ru-RU')) +
        fact('В модели', npCells.length.toLocaleString('ru-RU')) +
        fact('Входы', 'зрение, запах, влажность') + fact('Выход', 'MN9 → хоботок');
      $('np-stim').hidden = true;
      return;
    }
    const G = NP_GROUPS[g], info = npInfo[g];
    card.style.setProperty('--c', G.color);
    $('np-card-title').textContent = g === 'vision' ? 'Оптические доли · зрение' : NEURONS[g].name;
    $('np-card-text').textContent = G.about;
    const types = [...new Set(info.cells.map(c => c.type))];
    const nl = info.cells.filter(c => c.side === 'L').length, nr = info.cells.filter(c => c.side === 'R').length;
    $('np-card-facts').innerHTML =
      fact('Нейронов', (g === 'vision' ? BRAIN.optic : info.cells.length).toLocaleString('ru-RU')) +
      fact('Роль', NP_ROLE[G.role] + (NP_CHANNEL[g] ? ' · ' + NP_CHANNEL[g] : '')) +
      fact('Где', G.area) +
      fact(g === 'vision' ? 'Полушария' : 'Левое / правое', g === 'vision' ? 'обе доли' : `${nl} / ${nr}`) +
      (types.length ? `<div class="col-span-2"><dt>Типы клеток FlyWire</dt><dd>${types.length > 4 ? types.slice(0, 3).join(', ') + ` и ещё ${types.length - 3}` : types.join(', ')}</dd></div>` : '');
    $('np-stim').hidden = false;
  }

  $('np-stim').addEventListener('click', () => {
    const g = np.focus;
    if (!g) return;
    const now = performance.now();
    npStim(g, now, 2.2);
    const info = npInfo[g];
    for (const s of [-1, 1]) {
      const pts = info.pts.filter(p => Math.sign(p.x) === s);
      if (pts.length) npRing(avg(pts), NP_GROUPS[g].color, now);
    }
  });

  function npSnapshot() {
    npLoop();
    const src = npR.domElement, out = document.createElement('canvas');
    out.width = src.width;
    out.height = src.height;
    const c = out.getContext('2d');
    const bg = c.createRadialGradient(out.width / 2, out.height * 0.45, 0, out.width / 2, out.height * 0.45, out.width * 0.6);
    bg.addColorStop(0, '#0a1626');
    bg.addColorStop(1, '#04070f');
    c.fillStyle = bg;
    c.fillRect(0, 0, out.width, out.height);
    c.drawImage(src, 0, 0);
    c.drawImage(npHud, 0, 0, out.width, out.height);
    out.toBlob(blob => {
      const a = document.createElement('a');
      a.download = `cyber-drosophila-${np.view || 'free'}.png`;
      a.href = URL.createObjectURL(blob);
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, 'image/png');
  }

  $('np-play').addEventListener('click', npPlay);
  $('np-shot').addEventListener('click', npSnapshot);
  document.querySelectorAll('.np-view').forEach(b => b.addEventListener('click', () => npSetView(b.dataset.view)));

  npStage.addEventListener('pointerdown', e => {
    np.drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, id: e.pointerId, active: false, touch: e.pointerType === 'touch' };
  });
  npStage.addEventListener('pointermove', e => {
    const r = npStage.getBoundingClientRect();
    const d = np.drag;
    if (d) {
      if (!d.active && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 5) {
        d.active = true;
        npStage.setPointerCapture(d.id);
        npStage.classList.add('is-dragging');
        npShowTip(null);
        npSetView(null);
      }
      if (d.active) {
        const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -(e.clientX - d.x) * 0.007);
        const pitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), d.touch ? 0 : -(e.clientY - d.y) * 0.007);
        np.qT.multiply(yaw).multiply(pitch);
        d.x = e.clientX;
        d.y = e.clientY;
        return;
      }
    }
    if (e.pointerType === 'mouse') npShowTip(npPick(e.clientX - r.left, e.clientY - r.top), e.clientX - r.left, e.clientY - r.top);
  });
  const npEndDrag = e => {
    const d = np.drag;
    np.drag = null;
    npStage.classList.remove('is-dragging');
    if (!d || d.active || e.type === 'pointercancel') return;
    const r = npStage.getBoundingClientRect();
    const c = npPick(e.clientX - r.left, e.clientY - r.top);
    if (c) npFocus(c.g);
    else if (np.focus) npFocus(null);
    if (e.pointerType !== 'mouse') npShowTip(c, e.clientX - r.left, e.clientY - r.top);
  };
  npStage.addEventListener('pointerup', npEndDrag);
  npStage.addEventListener('pointercancel', npEndDrag);
  npStage.addEventListener('pointerleave', () => npShowTip(null));
  npStage.addEventListener('dblclick', () => {
    npFocus(null);
    npSetView('front');
  });

  $('np-total').textContent = neuronsWord(BRAIN.total);
  $('np-model').textContent = neuronsWord(npCells.length);
  np.qT.copy(viewQuat(NP_VIEWS.front));
  np.q.copy(np.qT);
  new ResizeObserver(npResize).observe(npStage);
  new IntersectionObserver(([e]) => {
    np.last = 0;
    npR.setAnimationLoop(e.isIntersecting ? npLoop : null);
  }).observe(npStage);
  npRenderCard();

  return { setInputs: npSetInputs, play: npPlay };
}
