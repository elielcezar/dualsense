/* =========================================================
   DualSense — animation layer (GSAP + ScrollTrigger + Lenis)
   Drives DOM motion and writes the target state that gl.js renders.
   ========================================================= */
(() => {
  const root = document.documentElement;
  const NX = (window.NX = window.NX || {});
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];

  if (!window.gsap || !window.ScrollTrigger) {
    root.classList.remove('is-booting');
    window.NX_BOOTED = true;
    return;
  }

  gsap.registerPlugin(ScrollTrigger, CustomEase);
  CustomEase.create('nx', '0.16, 1, 0.3, 1');
  CustomEase.create('nxio', '0.76, 0, 0.24, 1');

  /* ---------- Shared 3D state ---------- */
  NX.target = { x: .21, y: 0, s: .9, rx: -.42, ry: .32, rz: -.1, ex: 0, a: 1, hapL: 0, hapR: 0, bom: -1 };
  NX.intro = reduce ? 1 : 0;
  NX.trig = 0;
  NX.anchors = NX.anchors || null;

  /* ---------- Lenis ---------- */
  let lenis = null;
  if (!reduce && window.Lenis) {
    lenis = new Lenis({ duration: 1.15, easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    if (root.classList.contains('is-booting')) lenis.stop();
  }
  NX.lenis = lenis;
  window.scrollTo(0, 0);

  const scrollToTarget = (hash) => {
    const el = hash === '#hero' ? 0 : $(hash);
    if (el === null) return;
    if (lenis) lenis.scrollTo(el, { duration: 1.6 });
    else (el === 0 ? window.scrollTo(0, 0) : el.scrollIntoView());
  };
  $$('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
    const hash = a.getAttribute('href');
    if (hash.length < 2) return;
    e.preventDefault();
    nav.classList.remove('is-open');
    menuBtn.setAttribute('aria-expanded', 'false');
    scrollToTarget(hash);
  }));

  /* ---------- Nav ---------- */
  const nav = $('.nav');
  const menuBtn = $('.nav__menu');
  menuBtn.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open');
    menuBtn.setAttribute('aria-expanded', String(open));
  });
  ScrollTrigger.create({
    start: 40,
    end: 'max',
    onToggle: self => nav.classList.toggle('is-scrolled', self.isActive)
  });
  const navLinks = $$('.nav__links a');
  navLinks.forEach(link => {
    const sec = $(link.getAttribute('href'));
    ScrollTrigger.create({
      trigger: sec,
      start: 'top 50%',
      end: 'bottom 50%',
      onToggle: self => link.classList.toggle('is-active', self.isActive)
    });
  });

  /* ---------- Model choreography: keyframes anchored to section ScrollTriggers ----------
     p = progress through the section's own scroll range (top at top → bottom at bottom). */
  const KEYS = [
    ['#hero',          0,   { x: .21, y: 0,    s: .9,   rx: -.42, ry: .32,  rz: -.1,  ex: 0, a: 1 }],
    ['#bridge',        0,   { x: .04, y: 0,    s: .8,   rx: -.25, ry: -.25, rz: .05 }],
    ['#bridge',        1,   { x: 0,   y: 0,    s: .76,  rx: .25,  ry: .55,  rz: -.04 }],
    ['#design',        .12, { x: -.17, y: 0,   s: 1.12, rx: -.12, ry: .04,  rz: 0 }],
    ['#design',        .9,  { x: -.17, y: 0,   s: 1.2,  rx: -.22, ry: -.1,  rz: 0 }],
    ['#anatomia',      .06, { x: -.02, y: -.1, s: .8,   rx: -.85, ry: -.45, rz: .1, ex: 0 }],
    ['#anatomia',      .78, { x: -.02, y: -.1, s: .76,  rx: -.9,  ry: -.62, rz: .06, ex: 1 }],
    ['#anatomia',      1,   { ex: 1, ry: -.66 }],
    ['#gatilhos',      .14, { x: -.05, y: -.06, s: .84,  rx: 1.18, ry: 3.14 - .6,  rz: -.06, ex: 0 }],
    ['#gatilhos',      .86, { x: -.05, y: -.06, s: .88,  rx: 1.12, ry: 3.14 + .35, rz: .04 }],
    ['#tatil',         .12, { x: 0,   y: -.06, s: .92,  rx: -.35, ry: 6.28, rz: 0, ex: .12 }],
    ['#tatil',         .9,  { x: 0,   y: -.06, s: .96,  rx: -.3,  ry: 6.33, rz: 0, ex: .12 }],
    ['#conectividade', 0,   { x: 0,   y: .25,  s: .62,  rx: .4,   ry: 7.1,  ex: 0, a: 0 }]
  ];
  {
    let prev = {};
    KEYS.forEach(k => { k[2] = Object.assign({}, prev, k[2]); prev = k[2]; });
  }
  const PROPS = Object.keys(KEYS[0][2]);
  const sectionST = {};
  [...new Set(KEYS.map(k => k[0]))].forEach(sel => {
    sectionST[sel] = ScrollTrigger.create({ trigger: sel, start: 'top top', end: 'bottom bottom' });
  });
  const keyY = k => {
    const st = sectionST[k[0]];
    return st.start + k[1] * Math.max(0, st.end - st.start);
  };
  const smooth = t => t * t * (3 - 2 * t);
  function sampleModel(y) {
    let i = 0;
    while (i < KEYS.length - 1 && keyY(KEYS[i + 1]) <= y) i++;
    const a = KEYS[i], b = KEYS[Math.min(i + 1, KEYS.length - 1)];
    const ya = keyY(a), yb = keyY(b);
    const t = yb > ya ? smooth(gsap.utils.clamp(0, 1, (y - ya) / (yb - ya))) : 0;
    for (const p of PROPS) NX.target[p] = a[2][p] + (b[2][p] - a[2][p]) * t;
  }
  const scrollY = () => (lenis ? lenis.scroll : window.scrollY);

  /* ---------- Hero intro (built paused so its from-states render under the boot screen) ---------- */
  const heroIntro = gsap.timeline({ paused: true, defaults: { ease: 'nx', duration: 1.3 } })
    .fromTo('.hero-v2 .mask > span', { yPercent: 112 }, { yPercent: 0, stagger: .1, duration: 1.5 }, 0)
    .fromTo('.hero-v2__eyebrow', { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 1 }, .25)
    .fromTo(['.hero-v2__lede', '.hero-v2__ctas', '.hero-v2__meta'], { autoAlpha: 0, y: 26 }, { autoAlpha: 1, y: 0, stagger: .09 }, .4)
    .fromTo('.nav', { yPercent: -100, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 1.1 }, .35)
    .fromTo('.scroll-ind', { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: .9 }, .9)
    .fromTo('.hero-v2__aura', { autoAlpha: 0, scale: .8 }, { autoAlpha: 1, scale: 1, duration: 2.4 }, 0)
    .to(NX, { intro: 1, duration: 2.6, ease: 'expo.out' }, 0);

  /* ---------- Boot ---------- */
  function finishBoot() {
    root.classList.remove('is-booting');
    window.NX_BOOTED = true;
    if (lenis) lenis.start();
    ScrollTrigger.refresh();
  }

  if (reduce || !root.classList.contains('is-booting')) {
    heroIntro.progress(1);
    finishBoot();
  } else {
    const pct = { v: 0 };
    const pctEl = $('#bootPct');
    const writePct = () => { pctEl.textContent = String(Math.round(pct.v)).padStart(3, '0'); };
    const markPath = $('#bootMark path');
    const len = markPath.getTotalLength();

    gsap.set(markPath, { strokeDasharray: len, strokeDashoffset: len, fillOpacity: 0 });
    gsap.set('#bootLine', { scaleX: 0 });

    const intro = gsap.timeline()
      .to(markPath, { strokeDashoffset: 0, duration: 1.4, ease: 'power2.inOut' }, 0)
      .to(markPath, { fillOpacity: 1, duration: .6, ease: 'power1.out' }, 1)
      .to('#bootLine', { scaleX: .82, duration: 1.6, ease: 'power2.out' }, 0)
      .to(pct, { v: 82, duration: 1.6, ease: 'power2.out', onUpdate: writePct }, 0);

    const glReady = new Promise(res => {
      if (NX.ready) res();
      else window.addEventListener('nx:ready', res, { once: true });
    });
    const timeout = new Promise(res => setTimeout(res, 4200));

    Promise.all([intro.then(), Promise.race([glReady, timeout])]).then(() => {
      gsap.timeline()
        .to('#bootLine', { scaleX: 1, duration: .5, ease: 'power3.inOut' })
        .to(pct, { v: 100, duration: .5, ease: 'power3.inOut', onUpdate: writePct }, '<')
        .to('.boot__meta', { autoAlpha: 0, duration: .3 }, '>-0.05')
        .to('#bootMark', { yPercent: -40, autoAlpha: 0, duration: .6, ease: 'power3.in' }, '<')
        .to('.boot__bar', { scaleX: 0, transformOrigin: '100% 50%', duration: .5, ease: 'power3.in' }, '<')
        .to('.boot', { clipPath: 'inset(0% 0% 100% 0%)', duration: 1.1, ease: 'nxio' }, '-=.15')
        .add(() => heroIntro.play(), '-=.6')
        .add(finishBoot);
    });
  }

  /* ---------- Bridge: per-character scrub ---------- */
  const bridgeChars = [];
  $$('.bridge__line').forEach(line => {
    const txt = line.textContent;
    line.textContent = '';
    [...txt].forEach(c => {
      const s = document.createElement('span');
      s.className = 'ch';
      s.textContent = c;
      line.appendChild(s);
      bridgeChars.push(s);
    });
  });
  gsap.timeline({
    scrollTrigger: { trigger: '#bridge', start: 'top 70%', end: 'bottom bottom', scrub: 1 },
    defaults: { ease: 'none' }
  })
    .fromTo(bridgeChars,
      { yPercent: 70, rotateX: -70, autoAlpha: 0 },
      { yPercent: 0, rotateX: 0, autoAlpha: 1, duration: .25, stagger: { each: .012, from: 'start' } }, 0)
    .to({}, { duration: .2 })
    .to(bridgeChars,
      { yPercent: -50, autoAlpha: 0, duration: .2, stagger: { each: .008, from: 'end' } }, '>');

  /* ---------- 02 Precision ---------- */
  const counters = $$('#design .count');
  counters.forEach(el => {
    const dec = +el.dataset.dec || 0;
    el.textContent = (+(el.dataset.from || 0)).toFixed(dec);
  });
  ScrollTrigger.create({
    trigger: '#design',
    start: 'top 35%',
    once: true,
    onEnter: () => counters.forEach((el, i) => {
      const dec = +el.dataset.dec || 0;
      const o = { v: +(el.dataset.from || 0) };
      gsap.to(o, {
        v: +el.dataset.to,
        duration: 1.8,
        delay: i * .12,
        ease: 'power3.out',
        onUpdate: () => { el.textContent = o.v.toFixed(dec); }
      });
    })
  });

  const rows = $$('.readout__row');
  ScrollTrigger.create({
    trigger: '#design',
    start: 'top top',
    end: 'bottom bottom',
    onUpdate: self => {
      const idx = Math.floor(gsap.utils.clamp(0, .999, (self.progress - .08) / .84) * rows.length);
      rows.forEach((r, i) => r.classList.toggle('is-active', self.progress > .06 && i <= idx));
    },
    onLeaveBack: () => rows.forEach(r => r.classList.remove('is-active'))
  });

  const reticleCircles = $$('.reticle .r-c--2, .reticle .r-c--3');
  reticleCircles.forEach(c => {
    const l = c.getTotalLength();
    gsap.set(c, { strokeDasharray: l, strokeDashoffset: l });
  });
  gsap.timeline({
    scrollTrigger: { trigger: '#design', start: 'top 60%', end: 'bottom bottom', scrub: 1 },
    defaults: { ease: 'none' }
  })
    .fromTo('.reticle', { autoAlpha: 0 }, { autoAlpha: 1, duration: .2 }, 0)
    .fromTo('.reticle__svg', { scale: 1.6 }, { scale: 1, duration: .2 }, 0)
    .to(reticleCircles, { strokeDashoffset: 0, duration: .25, stagger: .05 }, .05)
    .fromTo('.reticle .r-h, .reticle .r-v', { scale: 0, transformOrigin: '50px 50px' }, { scale: 1, duration: .2 }, .1)
    .to('.r-ring', { rotation: 180, duration: 1 }, 0)
    .to('.reticle', { autoAlpha: 0, duration: .1 }, .92);

  gsap.from('.prec__copy > *', {
    y: 40, autoAlpha: 0, stagger: .08, duration: 1.1, ease: 'nx',
    scrollTrigger: { trigger: '#design', start: 'top 45%', toggleActions: 'play none none reverse' }
  });

  /* ---------- 03 Engineering ---------- */
  const bom = $$('.engine__item');
  const xvBar = $('#xvBar');
  const xvPct = $('#xvPct');
  gsap.set(xvBar, { scaleX: 0 });
  ScrollTrigger.create({
    trigger: '#anatomia',
    start: 'top top',
    end: 'bottom bottom',
    onUpdate: self => {
      const p = self.progress;
      const idx = p < .1 || p > .97 ? -1 : Math.min(bom.length - 1, Math.floor(((p - .1) / .82) * bom.length));
      NX.target.bom = idx;
      bom.forEach((li, i) => li.classList.toggle('is-active', i === idx));
    },
    onLeave: () => { NX.target.bom = -1; bom.forEach(li => li.classList.remove('is-active')); },
    onLeaveBack: () => { NX.target.bom = -1; bom.forEach(li => li.classList.remove('is-active')); }
  });
  gsap.from(['.engine__copy > *', '.engine__item'], {
    y: 34, autoAlpha: 0, stagger: .05, duration: 1, ease: 'nx',
    scrollTrigger: { trigger: '#anatomia', start: 'top 45%', toggleActions: 'play none none reverse' }
  });

  /* ---------- 04 Triggers: resistance slider + force curve ---------- */
  const track = $('.force__track');
  const forceLine = $('.force__line');
  const forceArea = $('.force__area');
  const forceWall = $('.force__wall');
  const forceDot = $('.force__dot');
  const forceVal = $('#forceVal');
  const forcePeak = $('#forcePeak');
  const modeBtns = $$('.force__modes button');
  const GW = 400, GH = 220;
  const resist = { r: .4, view: .4 };

  // Trigger Resistance curve: a soft linear spring for the pre-travel, then a motorised wall
  // whose onset moves earlier and whose step grows with resistance r (0..1).
  const wallAt = r => .78 - .42 * r;
  function force(t, r) {
    const spring = t * (.22 + .18 * r);
    const k = gsap.utils.clamp(0, 1, (t - wallAt(r)) / .1);
    const wall = k * k * (3 - 2 * k) * (.12 + .66 * r);
    const fatigue = t > wallAt(r) + .1 ? (t - wallAt(r) - .1) * .12 * r : 0;
    return Math.min(1, spring + wall + fatigue);
  }
  function drawForce(r) {
    let d = '';
    for (let i = 0; i <= 80; i++) {
      const t = i / 80;
      d += (i ? 'L' : 'M') + (t * GW).toFixed(1) + ' ' + (GH - force(t, r) * (GH - 16)).toFixed(1);
    }
    forceLine.setAttribute('d', d);
    forceArea.setAttribute('d', d + `L${GW} ${GH}L0 ${GH}Z`);
    const wx = wallAt(r) * GW;
    forceWall.setAttribute('x1', wx);
    forceWall.setAttribute('x2', wx);
    forcePeak.textContent = Math.round(force(1, r) * 100) + '%';
  }
  function setResist(v, animate = true) {
    v = gsap.utils.clamp(0, 1, v);
    resist.r = v;
    const pctTxt = Math.round(v * 100);
    track.setAttribute('aria-valuenow', pctTxt);
    forceVal.textContent = pctTxt + '%';
    modeBtns.forEach(b => b.classList.toggle('is-on', Math.abs(+b.dataset.v - pctTxt) < 1));
    gsap.to(resist, {
      view: v,
      duration: animate ? .6 : 0,
      ease: 'power3.out',
      overwrite: true,
      onUpdate: () => {
        track.style.setProperty('--v', resist.view);
        drawForce(resist.view);
      }
    });
  }
  setResist(.4, false);
  drawForce(.4);

  const fromPointer = e => {
    const r = track.getBoundingClientRect();
    return (e.clientX - r.left) / r.width;
  };
  track.addEventListener('pointerdown', e => {
    track.setPointerCapture(e.pointerId);
    track.classList.add('is-drag');
    setResist(fromPointer(e));
  });
  track.addEventListener('pointermove', e => {
    if (track.classList.contains('is-drag')) setResist(fromPointer(e), false);
  });
  const endDrag = () => track.classList.remove('is-drag');
  track.addEventListener('pointerup', endDrag);
  track.addEventListener('pointercancel', endDrag);
  track.addEventListener('keydown', e => {
    const step = e.shiftKey ? .1 : .02;
    const map = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step };
    if (e.key in map) { e.preventDefault(); setResist(resist.r + map[e.key]); }
    if (e.key === 'Home') { e.preventDefault(); setResist(0); }
    if (e.key === 'End') { e.preventDefault(); setResist(1); }
  });
  modeBtns.forEach(b => b.addEventListener('click', () => setResist(+b.dataset.v / 100)));

  // A press loop runs along the curve; the 3D trigger depresses with it.
  const press = { t: 0 };
  gsap.timeline({ repeat: -1, repeatDelay: .5 })
    .to(press, { t: 1, duration: 1.6, ease: 'power2.inOut' })
    .to(press, { t: 0, duration: .9, ease: 'power3.out' }, '+=.25');
  let trigActive = false;
  ScrollTrigger.create({ trigger: '#gatilhos', start: 'top 60%', end: 'bottom 40%', onToggle: s => { trigActive = s.isActive; } });

  gsap.from(['.trig__copy > *', '.force'], {
    y: 40, autoAlpha: 0, stagger: .08, duration: 1.1, ease: 'nx',
    scrollTrigger: { trigger: '#gatilhos', start: 'top 45%', toggleActions: 'play none none reverse' }
  });

  /* ---------- 05 Haptics ---------- */
  const hapL = $('.haptic__ch--l');
  const hapR = $('.haptic__ch--r');
  const barsL = $$('i', hapL);
  const barsR = $$('i', hapR);
  const hapt = { p: 0 };
  ScrollTrigger.create({
    trigger: '#tatil',
    start: 'top top',
    end: 'bottom bottom',
    onUpdate: self => { hapt.p = self.progress; },
    onLeave: () => { hapt.p = 1; },
    onLeaveBack: () => { hapt.p = 0; }
  });
  const bump = (p, a, b) => {
    const k = gsap.utils.clamp(0, 1, (p - a) / .08) * gsap.utils.clamp(0, 1, (b - p) / .08);
    return k;
  };
  gsap.set([hapL, hapR], { autoAlpha: 0 });
  gsap.from(['.hapt__copy > *', '.hapt__lede'], {
    y: 40, autoAlpha: 0, stagger: .08, duration: 1.1, ease: 'nx',
    scrollTrigger: { trigger: '#tatil', start: 'top 45%', toggleActions: 'play none none reverse' }
  });

  /* ---------- 08 Range filter ---------- */
  const filterBtns = $$('.rangesec__filters button');
  const items = $$('.range__item');
  let filtering = null;
  filterBtns.forEach(btn => btn.addEventListener('click', () => {
    const f = btn.dataset.filter;
    filterBtns.forEach(b => {
      const on = b === btn;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    const show = items.filter(it => f === 'all' || it.dataset.cat.split(' ').includes(f));
    const hide = items.filter(it => !show.includes(it) && !it.classList.contains('is-hidden'));
    if (filtering) filtering.progress(1);
    filtering = gsap.timeline({ onComplete: () => ScrollTrigger.refresh() })
      .to(hide, { y: 24, autoAlpha: 0, duration: .35, stagger: .03, ease: 'power2.in' })
      .add(() => {
        hide.forEach(it => it.classList.add('is-hidden'));
        show.forEach(it => it.classList.remove('is-hidden'));
      })
      .fromTo(show, { y: 32, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: .7, stagger: .05, ease: 'nx' });
  }));

  gsap.from('.rangesec__head > *', {
    y: 40, autoAlpha: 0, stagger: .1, duration: 1.1, ease: 'nx',
    scrollTrigger: { trigger: '#edicoes', start: 'top 75%', toggleActions: 'play none none reverse' }
  });
  ScrollTrigger.batch(items, {
    start: 'top 88%',
    onEnter: batch => gsap.fromTo(batch, { y: 50, autoAlpha: 0 }, { y: 0, autoAlpha: 1, stagger: .08, duration: 1, ease: 'nx', overwrite: true }),
    onLeaveBack: batch => gsap.to(batch, { y: 50, autoAlpha: 0, stagger: .04, duration: .5, overwrite: true })
  });

  /* ---------- Footer: singularity + warped type field ---------- */
  const foot = $('.foot');
  const fm = { mx: 0, my: 0 };
  const writeFoot = () => {
    foot.style.setProperty('--mx', fm.mx.toFixed(3));
    foot.style.setProperty('--my', fm.my.toFixed(3));
  };
  if (!reduce) {
    foot.addEventListener('pointermove', e => {
      const r = foot.getBoundingClientRect();
      gsap.to(fm, {
        mx: ((e.clientX - r.left) / r.width) * 2 - 1,
        my: ((e.clientY - r.top) / r.height) * 2 - 1,
        duration: .9, ease: 'power3.out', overwrite: true, onUpdate: writeFoot
      });
    });
    foot.addEventListener('pointerleave', () => {
      gsap.to(fm, { mx: 0, my: 0, duration: 1.4, ease: 'elastic.out(1, .5)', overwrite: true, onUpdate: writeFoot });
    });
  }
  gsap.timeline({
    scrollTrigger: { trigger: '.foot__stage', start: 'top bottom', end: 'center center', scrub: 1 },
    defaults: { ease: 'none' }
  })
    .fromTo('.foot__row', { yPercent: (i) => (i - 3) * 60, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, stagger: { each: .04, from: 'center' } }, 0)
    .fromTo('.foot__singularity', { scale: 0 }, { scale: 1 }, .2);

  const form = $('.foot__form');
  form.addEventListener('submit', e => {
    e.preventDefault();
    const input = $('#nl');
    const msg = $('.foot__msg');
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value);
    msg.textContent = ok ? 'Pronto! Você vai saber dos próximos lançamentos.' : 'Digite um e-mail válido.';
    if (ok) input.value = '';
  });

  /* ---------- Cursor ---------- */
  const cursor = $('.cursor');
  if (finePointer && !reduce) {
    root.classList.add('has-cursor');
    const cx = gsap.quickTo(cursor, 'x', { duration: .35, ease: 'power3.out' });
    const cy = gsap.quickTo(cursor, 'y', { duration: .35, ease: 'power3.out' });
    let overLink = false;
    window.addEventListener('pointermove', e => {
      cx(e.clientX); cy(e.clientY);
      overLink = !!e.target.closest('a, button, .force__track, input');
      cursor.classList.toggle('is-link', overLink && !NX.dragging);
    }, { passive: true });
    window.addEventListener('pointerdown', () => cursor.classList.add('is-down'));
    window.addEventListener('pointerup', () => cursor.classList.remove('is-down'));
    const cursorTxt = $('.cursor__txt');
    let lastTxt = '';
    gsap.ticker.add(() => {
      cursor.classList.toggle('is-drag', (!!NX.hover && !overLink) || !!NX.dragging);
      const txt = NX.hoverPart === 'touchpad' && !NX.dragging ? 'TOQUE · BARRA DE LUZ' : 'ARRASTE';
      if (txt !== lastTxt) { cursorTxt.textContent = txt; lastTxt = txt; }
    });
  }

  /* ---------- Light bar colour (tap the touchpad in 3D) ---------- */
  const lightName = $('#lightName');
  window.addEventListener('nx:light', e => {
    const hex = '#' + e.detail.hex.toString(16).padStart(6, '0');
    root.style.setProperty('--light', hex);
    lightName.textContent = e.detail.name;
    gsap.fromTo('.hero-v2__swatch', { scale: 1.8 }, { scale: 1, duration: .6, ease: 'back.out(3)' });
  });

  /* ---------- 06 Conectividade + 07 Edge ---------- */
  gsap.from('.conn__head > *', {
    y: 40, autoAlpha: 0, stagger: .08, duration: 1.1, ease: 'nx',
    scrollTrigger: { trigger: '#conectividade', start: 'top 75%', toggleActions: 'play none none reverse' }
  });
  ScrollTrigger.batch('.conn__card, .conn__devices li', {
    start: 'top 90%',
    onEnter: b => gsap.fromTo(b, { y: 50, autoAlpha: 0 }, { y: 0, autoAlpha: 1, stagger: .07, duration: 1, ease: 'nx', overwrite: true }),
    onLeaveBack: b => gsap.to(b, { y: 50, autoAlpha: 0, stagger: .03, duration: .5, overwrite: true })
  });
  gsap.timeline({
    scrollTrigger: { trigger: '#edge', start: 'top 70%', toggleActions: 'play none none reverse' },
    defaults: { ease: 'nx', duration: 1.2 }
  })
    .from('.edge__media', { clipPath: 'inset(12% 12% 12% 12% round 24px)', autoAlpha: 0, scale: .94 }, 0)
    .from('.edge__copy > *', { y: 36, autoAlpha: 0, stagger: .08 }, .15);
  gsap.fromTo('.edge__media img', { yPercent: 6, rotate: -3 }, {
    yPercent: -6, rotate: 3, ease: 'none',
    scrollTrigger: { trigger: '#edge', start: 'top bottom', end: 'bottom top', scrub: 1 }
  });

  /* ---------- Per-frame sync (scroll → 3D target, 3D anchors → DOM) ---------- */
  const reticle = $('.reticle');
  const retX = $('#retX');
  const retY = $('#retY');
  const isMobile = () => innerWidth < 768;
  let frame = 0;

  gsap.ticker.add(() => {
    sampleModel(scrollY());

    // haptics drive
    const p = hapt.p;
    NX.target.hapL = bump(p, .12, .58);
    NX.target.hapR = bump(p, .42, .9);
    NX.trig = trigActive ? press.t * (.35 + .65 * (1 - resist.view * .5)) : 0;

    // trigger dot on the force curve
    if (trigActive) {
      const t = press.t;
      forceDot.setAttribute('cx', (t * GW).toFixed(1));
      forceDot.setAttribute('cy', (GH - force(t, resist.view) * (GH - 16)).toFixed(1));
    }

    const A = NX.anchors;
    if (A) {
      if (A.stickL) {
        reticle.style.setProperty('--ax', A.stickL.x.toFixed(1) + 'px');
        reticle.style.setProperty('--ay', A.stickL.y.toFixed(1) + 'px');
      }
      if (!isMobile()) {
        if (A.motorL) { hapL.style.setProperty('--ax', A.motorL.x.toFixed(1) + 'px'); hapL.style.setProperty('--ay', A.motorL.y.toFixed(1) + 'px'); }
        if (A.motorR) { hapR.style.setProperty('--ax', A.motorR.x.toFixed(1) + 'px'); hapR.style.setProperty('--ay', A.motorR.y.toFixed(1) + 'px'); }
      }
    }
    const ex = NX.cur ? NX.cur.ex : NX.target.ex;
    xvBar.style.transform = `scaleX(${ex.toFixed(3)})`;
    xvPct.textContent = String(Math.round(ex * 100)).padStart(3, '0') + '%';

    gsap.set(hapL, { autoAlpha: NX.target.hapL });
    gsap.set(hapR, { autoAlpha: NX.target.hapR });

    // bars + readouts at ~30fps
    if (++frame % 2 === 0) {
      const tm = performance.now() / 1000;
      barsL.forEach((b, i) => { b.style.transform = `scaleY(${(.15 + NX.target.hapL * (.45 + .4 * Math.abs(Math.sin(tm * 6 + i * .9)))).toFixed(3)})`; });
      barsR.forEach((b, i) => { b.style.transform = `scaleY(${(.15 + NX.target.hapR * (.3 + .6 * Math.abs(Math.sin(tm * 17 + i * 1.7)))).toFixed(3)})`; });
      const c = NX.cur || NX.target;
      const sx = Math.sin((c.ry || 0) * 2.2 + tm * .7) * .2 + (NX.dragY || 0) * .4;
      const sy = Math.sin((c.rx || 0) * 2.2 + tm * .5) * .2 + (NX.dragX || 0) * .4;
      retX.textContent = 'X ' + (sx >= 0 ? '+' : '-') + Math.abs(sx).toFixed(3);
      retY.textContent = 'Y ' + (sy >= 0 ? '+' : '-') + Math.abs(sy).toFixed(3);
    }
  });

  /* ---------- Refresh once fonts settle ---------- */
  document.fonts && document.fonts.ready.then(() => ScrollTrigger.refresh());
  window.addEventListener('load', () => ScrollTrigger.refresh());
})();
