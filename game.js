'use strict';

/* =========================================================
   倒带三消 / REWIND // MATCH
   Core loop: match-3 → spend 时砂 to rewind a step → branch.
   Each rewind adds a time crack; clearing a cracked gem
   freezes time for 3 seconds of free swapping.
   ========================================================= */

(() => {
  /* ---------------------------------------------------------
     Constants & data
     --------------------------------------------------------- */
  const N = 8;
  const SIZE = 840;
  const CELL = 62;
  const BOARD_PX = N * CELL;          // 496
  const BX = (SIZE - BOARD_PX) / 2;   // 172
  const BY = BX;
  const RING_R = 302;
  const MAX_SAND = 9;
  const SAND_START = 3;

  const LEVELS = [
    {
      id: 0,
      name: '校准',
      tutorial: true,
      target: 600,
      steps: 16,
      sand: 3,
      locks: [1],
      crystals: 0,
      timed: 0,
      tools: { shuffle: 1, col: 1, row: 1 },
      quote: '第一次循环。先学会呼吸，再学会倒带。',
    },
    {
      id: 1,
      name: '残响',
      target: 3200,
      steps: 30,
      sand: 3,
      locks: [1, 1, 1],
      crystals: 0,
      timed: 0,
      tools: { shuffle: 1, col: 1, row: 1 },
      quote: '第 7 次循环。你记得这条时间线会在第 19 步崩坏。',
    },
    {
      id: 2,
      name: '裂痕',
      target: 4300,
      steps: 30,
      sand: 3,
      locks: [1, 1, 2, 1, 1],
      crystals: 0,
      timed: 1,
      tools: { shuffle: 1, col: 1, row: 1 },
      quote: '裂缝不是伤口，是时间在呼吸。',
    },
    {
      id: 3,
      name: '坍缩',
      target: 5000,
      steps: 30,
      sand: 4,
      locks: [1, 2, 1, 2, 1, 1],
      crystals: 1,
      timed: 2,
      tools: { shuffle: 1, col: 1, row: 1 },
      quote: '所有分支都指向同一场爆炸——除非你不再向前。',
    },
  ];

  const TYPE_DEFS = [
    { name: '琥珀', color: '#ffb545', light: '#ffe7a8', dark: '#9c5a08', shape: 'diamond' },
    { name: '潮汐', color: '#38d6ff', light: '#c8f6ff', dark: '#08698c', shape: 'circle' },
    { name: '脉冲', color: '#ff5fbd', light: '#ffc8e8', dark: '#8f1a5d', shape: 'hex' },
    { name: '苔原', color: '#4df0a0', light: '#c7ffe4', dark: '#0b7347', shape: 'square' },
    { name: '暮光', color: '#a98bff', light: '#e2d8ff', dark: '#5130b0', shape: 'star' },
    { name: '熔核', color: '#ff7350', light: '#ffd3c6', dark: '#992b16', shape: 'drop' },
  ];

  const $ = (id) => document.getElementById(id);

  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = SIZE * DPR;
  canvas.height = SIZE * DPR;

  const els = {
    stage: $('stage'),
    score: $('score'),
    target: $('target'),
    progress: $('progress'),
    goalScoreRow: $('goal-score-row'),
    goalScoreVal: $('goal-score-val'),
    goalLockRow: $('goal-lock-row'),
    goalLockVal: $('goal-lock-val'),
    goalCrystalRow: $('goal-crystal-row'),
    goalCrystalVal: $('goal-crystal-val'),
    steps: $('steps'),
    sand: $('sand'),
    sandDots: $('sand-dots'),
    cracks: $('cracks'),
    rewindBtn: $('rewind-btn'),
    quote: $('quote'),
    branches: $('branches'),
    freezes: $('freezes'),
    maxchain: $('maxchain'),
    levelChip: $('level-chip'),
    missionLabel: $('mission-label'),
    bestChip: $('best-chip'),
    soundBtn: $('sound-btn'),
    helpBtn: $('help-btn'),
    tutorialBtn: $('tutorial-btn'),
    coach: $('coach'),
    coachTitle: $('coach-title'),
    coachText: $('coach-text'),
    coachOk: $('coach-ok'),
    toolShuffle: $('tool-shuffle'),
    toolCol: $('tool-col'),
    toolRow: $('tool-row'),
    toolNote: $('tool-note'),
    log: $('log'),
    banner: $('banner'),
    freezeHud: $('freeze-hud'),
    freezeSecs: $('freeze-secs'),
    freezeBar: $('freeze-bar'),
    toast: $('toast'),
    modal: $('modal'),
    modalCard: $('modal-card'),
    vhs: $('vhs'),
  };

  /* ---------------------------------------------------------
     Utilities
     --------------------------------------------------------- */
  let SPEED = 1;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const sdelay = (ms) => sleep(Math.max(24, ms * Math.min(1, SPEED)));
  const pad2 = (n) => String(n).padStart(2, '0');
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const pkey = (r, c) => r * N + c;
  const pref = (k) => ({ r: Math.floor(k / N), c: k % N });
  const isAdjacent = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;

  let seed = (Date.now() ^ 0x9e3779b9) >>> 0;
  function rnd() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  const rndInt = (n) => Math.floor(rnd() * n);
  const pick = (arr) => arr[rndInt(arr.length)];

  function shuffleArr(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = rndInt(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function roundRectPath(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function loadBests() {
    try {
      const data = JSON.parse(localStorage.getItem('rw_best_v1'));
      if (!data) return [];
      if (Array.isArray(data)) {
        // v1 had three levels; level 0 is now the tutorial
        return data.length === 3 ? [0, ...data] : data;
      }
      return [];
    } catch (e) {
      return [];
    }
  }
  function saveBests() {
    try {
      localStorage.setItem('rw_best_v1', JSON.stringify(bests));
    } catch (e) {
      /* storage can be unavailable on file:// in some browsers */
    }
  }

  const bests = loadBests();
  let logEntries = [];

  function tutorialDone() {
    try {
      return localStorage.getItem('rw_tut_done_v1') === '1';
    } catch (e) {
      return false;
    }
  }
  function markTutorialDone() {
    try {
      localStorage.setItem('rw_tut_done_v1', '1');
    } catch (e) {
      /* noop */
    }
  }

  /* ---------------------------------------------------------
     Sound (tiny WebAudio synth, no assets)
     --------------------------------------------------------- */
  const Sound = {
    enabled: true,
    ctx: null,
    noiseBuf: null,

    init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
      } catch (e) {
        this.ctx = null;
      }
    },

    ensure() {
      if (!this.enabled) return;
      this.init();
    },

    tone(freq, dur = 0.12, type = 'sine', vol = 0.045, slideTo = null, delay = 0) {
      if (!this.enabled) return;
      this.init();
      const ac = this.ctx;
      if (!ac) return;
      try {
        const t0 = ac.currentTime + delay;
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t0);
        if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(gain).connect(ac.destination);
        osc.start(t0);
        osc.stop(t0 + dur + 0.03);
      } catch (e) {
        /* audio is optional */
      }
    },

    noise(dur = 0.3, vol = 0.05, freq = 1200) {
      if (!this.enabled) return;
      this.init();
      const ac = this.ctx;
      if (!ac) return;
      try {
        if (!this.noiseBuf) {
          const len = Math.floor(ac.sampleRate * 0.6);
          this.noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
          const data = this.noiseBuf.getChannelData(0);
          for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        }
        const src = ac.createBufferSource();
        src.buffer = this.noiseBuf;
        const filter = ac.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = freq;
        filter.Q.value = 0.7;
        const gain = ac.createGain();
        const t0 = ac.currentTime;
        gain.gain.setValueAtTime(vol, t0);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        src.connect(filter).connect(gain).connect(ac.destination);
        src.start(t0);
        src.stop(t0 + dur);
      } catch (e) {
        /* noop */
      }
    },

    swap() {
      this.tone(520, 0.055, 'triangle', 0.035, 660);
    },
    invalid() {
      this.tone(150, 0.13, 'sawtooth', 0.035, 90);
    },
    match(chain) {
      const scale = [0, 2, 4, 7, 9, 12, 14];
      const semi = scale[Math.min(scale.length - 1, chain - 1)];
      const f = 392 * Math.pow(2, semi / 12);
      this.tone(f, 0.14, 'sine', 0.04, f * 1.01);
      this.tone(f * 1.5, 0.18, 'triangle', 0.022, f * 1.52, 0.045);
    },
    crystal() {
      this.tone(880, 0.22, 'sine', 0.04, 1320);
      this.tone(1320, 0.3, 'triangle', 0.018, 1760, 0.05);
    },
    crack() {
      this.noise(0.22, 0.05, 700);
      this.tone(110, 0.18, 'sawtooth', 0.03, 55);
    },
    freeze() {
      this.tone(1200, 0.5, 'sine', 0.04, 260);
      this.tone(1800, 0.35, 'triangle', 0.02, 420, 0.08);
      this.noise(0.4, 0.025, 2600);
    },
    rewind() {
      this.noise(0.55, 0.05, 900);
      this.tone(720, 0.55, 'sawtooth', 0.028, 90);
      this.tone(360, 0.4, 'triangle', 0.02, 60, 0.1);
    },
    win() {
      [523, 659, 784, 1047].forEach((f, i) =>
        this.tone(f, 0.4, 'triangle', 0.035, f, i * 0.1)
      );
    },
    lose() {
      [330, 247, 196].forEach((f, i) =>
        this.tone(f, 0.45, 'sine', 0.04, f * 0.98, i * 0.14)
      );
    },
    click() {
      this.tone(680, 0.05, 'square', 0.015, 760);
    },
  };

  /* ---------------------------------------------------------
     Mutable game state
     --------------------------------------------------------- */
  let S = null;
  let levelIndex = 0;
  let modalOpen = false;
  let bannerTimer = 0;
  let toastTimer = 0;
  let lastFrame = performance.now();

  const STARS = Array.from({ length: 90 }, () => ({
    x: rnd() * SIZE,
    y: rnd() * SIZE,
    r: rnd() * 1.3 + 0.25,
    a: rnd() * 0.35 + 0.06,
    p: rnd() * 6.28,
  }));

  function makeGem(type, x, y, special = false) {
    return {
      type,
      special,
      x,
      y,
      scale: 1,
      alpha: 1,
      rot: 0,
    };
  }

  function newState(li) {
    const lv = LEVELS[li];
    return {
      levelIndex: li,
      level: lv,
      board: [],
      cracks: Array.from({ length: N }, () => Array(N).fill(false)),
      crackArt: {},
      score: 0,
      stepsLeft: lv.steps,
      sand: lv.sand,
      tools: { ...(lv.tools || { shuffle: 1, col: 1, row: 1 }) },
      toolMode: null,
      tutorialStep: lv.tutorial ? 0 : -1,
      history: [],
      consecutiveRewinds: 0,
      branchPoints: new Set(),
      state: 'idle',
      busy: false,
      busySwap: false,
      selected: null,
      hover: null,
      drag: null,
      lastMove: null,
      pendingFreeze: 0,
      freeze: null,
      chain: 1,
      maxChain: 1,
      totalRewinds: 0,
      totalFreezes: 0,
      totalCrystals: 0,
      totalCollapses: 0,
      levelCrystals: 0,
      goalHinted: false,
      turnGain: 0,
      ringView: 0,
      hint: null,
      lastAction: performance.now(),
      started: false,
      displayScore: 0,
      shake: 0,
      resultShown: false,
    };
  }

  /* ---------------------------------------------------------
     Board generation & matching helpers
     --------------------------------------------------------- */
  function buildBoard() {
    let guard = 0;
    do {
      S.board = Array.from({ length: N }, () => Array(N).fill(null));
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const banned = new Set();
          if (
            c >= 2 &&
            S.board[r][c - 1] &&
            S.board[r][c - 2] &&
            S.board[r][c - 1].type === S.board[r][c - 2].type
          ) {
            banned.add(S.board[r][c - 1].type);
          }
          if (
            r >= 2 &&
            S.board[r - 1][c] &&
            S.board[r - 2][c] &&
            S.board[r - 1][c].type === S.board[r - 2][c].type
          ) {
            banned.add(S.board[r - 1][c].type);
          }
          let type;
          let tries = 0;
          do {
            type = rndInt(TYPE_DEFS.length);
            tries++;
          } while (banned.has(type) && tries < 40);
          S.board[r][c] = makeGem(type, c, r);
        }
      }
      guard++;
    } while (guard < 40 && !matrixHasMove(matrixFromBoard()));
    if (!matrixHasMove(matrixFromBoard())) {
      // extremely unlikely fallback: clear a cell pattern and try again
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          S.board[r][c].type = (r + c) % TYPE_DEFS.length;
        }
      }
    }
    placeLocks(S.level.locks);
  }

  function placeLocks(list) {
    if (!list || !list.length) return;
    const cells = [];
    for (let r = 1; r < N - 1; r++) {
      for (let c = 1; c < N - 1; c++) cells.push({ r, c });
    }
    for (let attempt = 0; attempt < 60; attempt++) {
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          if (S.board[r][c]) {
            S.board[r][c].lock = 0;
            S.board[r][c].lockTimer = 0;
          }
        }
      }
      shuffleArr(cells);
      const timed = S.level.timed || 0;
      for (let i = 0; i < list.length && i < cells.length; i++) {
        const p = cells[i];
        const g = S.board[p.r][p.c];
        if (g) {
          g.lock = list[i];
          g.lockTimer = i < timed ? 6 : 0;
        }
      }
      if (hasValidMove()) return;
    }
  }

  function matrixFromBoard() {
    return S.board.map((row) => row.map((g) => (g ? g.type : -1)));
  }

  function matrixHasMatch(m) {
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N - 2; c++) {
        const v = m[r][c];
        if (v >= 0 && v === m[r][c + 1] && v === m[r][c + 2]) return true;
      }
    }
    for (let c = 0; c < N; c++) {
      for (let r = 0; r < N - 2; r++) {
        const v = m[r][c];
        if (v >= 0 && v === m[r + 1][c] && v === m[r + 2][c]) return true;
      }
    }
    return false;
  }

  function matrixHasMove(m) {
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (c + 1 < N) {
          [m[r][c], m[r][c + 1]] = [m[r][c + 1], m[r][c]];
          const ok = matrixHasMatch(m);
          [m[r][c], m[r][c + 1]] = [m[r][c + 1], m[r][c]];
          if (ok) return true;
        }
        if (r + 1 < N) {
          [m[r][c], m[r + 1][c]] = [m[r + 1][c], m[r][c]];
          const ok = matrixHasMatch(m);
          [m[r][c], m[r + 1][c]] = [m[r + 1][c], m[r][c]];
          if (ok) return true;
        }
      }
    }
    return false;
  }

  function findMatches(board = S.board) {
    const runs = [];
    for (let r = 0; r < N; r++) {
      let c = 0;
      while (c < N) {
        const g = board[r][c];
        if (!g || g.lock) {
          c++;
          continue;
        }
        let e = c + 1;
        while (e < N && board[r][e] && !board[r][e].lock && board[r][e].type === g.type) e++;
        if (e - c >= 3) {
          const cells = [];
          for (let x = c; x < e; x++) cells.push({ r, c: x });
          runs.push({ dir: 'h', type: g.type, cells, len: e - c });
        }
        c = e;
      }
    }
    for (let c = 0; c < N; c++) {
      let r = 0;
      while (r < N) {
        const g = board[r][c];
        if (!g || g.lock) {
          r++;
          continue;
        }
        let e = r + 1;
        while (e < N && board[e][c] && !board[e][c].lock && board[e][c].type === g.type) e++;
        if (e - r >= 3) {
          const cells = [];
          for (let y = r; y < e; y++) cells.push({ r: y, c });
          runs.push({ dir: 'v', type: g.type, cells, len: e - r });
        }
        r = e;
      }
    }
    return runs;
  }

  function runsTouchLock(runs) {
    for (const run of runs) {
      for (const p of run.cells) {
        for (const [dr, dc] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nr = p.r + dr;
          const nc = p.c + dc;
          if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;
          const g = S.board[nr][nc];
          if (g && g.lock) return true;
        }
      }
    }
    return false;
  }

  function findAnyMove() {
    const b = S.board;
    let fallback = null;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const g = b[r][c];
        if (!g || g.lock) continue;
        if (c + 1 < N) {
          const h = b[r][c + 1];
          if (h && !h.lock) {
            b[r][c] = h;
            b[r][c + 1] = g;
            const runs = findMatches();
            const ok = runs.length > 0;
            const hitsLock = ok && runsTouchLock(runs);
            b[r][c] = g;
            b[r][c + 1] = h;
            if (ok) {
              if (hitsLock) return { a: { r, c }, b: { r, c: c + 1 } };
              if (!fallback) fallback = { a: { r, c }, b: { r, c: c + 1 } };
            }
          }
        }
        if (r + 1 < N) {
          const v = b[r + 1][c];
          if (v && !v.lock) {
            b[r][c] = v;
            b[r + 1][c] = g;
            const runs = findMatches();
            const ok = runs.length > 0;
            const hitsLock = ok && runsTouchLock(runs);
            b[r][c] = g;
            b[r + 1][c] = v;
            if (ok) {
              if (hitsLock) return { a: { r, c }, b: { r: r + 1, c } };
              if (!fallback) fallback = { a: { r, c }, b: { r: r + 1, c } };
            }
          }
        }
      }
    }
    return fallback;
  }

  function hasValidMove() {
    return !!findAnyMove();
  }

  function locksLeft() {
    let n = 0;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const g = S.board[r][c];
        if (g && g.lock) n++;
      }
    }
    return n;
  }

  function isLockedCell(p) {
    const g = S.board[p.r] && S.board[p.r][p.c];
    return !!(g && g.lock);
  }

  function goalsMet() {
    const lv = S.level;
    if (lv.tutorial && S.tutorialStep < 2) return false;
    return (
      S.score >= lv.target &&
      locksLeft() === 0 &&
      S.levelCrystals >= (lv.crystals || 0)
    );
  }

  /* ---------------------------------------------------------
     Snapshots / rewind
     --------------------------------------------------------- */
  function snapshot() {
    return {
      types: S.board.map((row) =>
        row.map((g) =>
          g ? { t: g.type, s: g.special, l: g.lock || 0, lt: g.lockTimer || 0 } : null
        )
      ),
      cracks: S.cracks.map((row) => row.slice()),
      score: S.score,
      stepsLeft: S.stepsLeft,
      sand: S.sand,
      levelCrystals: S.levelCrystals,
      lastMove: S.lastMove ? { a: { ...S.lastMove.a }, b: { ...S.lastMove.b } } : null,
    };
  }

  function restoreSnapshot(snap) {
    S.board = snap.types.map((row, r) =>
      row.map((v, c) => {
        if (!v) return null;
        const g = makeGem(v.t, c, r, !!v.s);
        g.lock = v.l || 0;
        g.lockTimer = v.lt || 0;
        return g;
      })
    );
    S.score = snap.score;
    S.stepsLeft = snap.stepsLeft;
    S.levelCrystals = snap.levelCrystals || 0;
    S.goalHinted = false;
    S.lastMove = snap.lastMove
      ? { a: { ...snap.lastMove.a }, b: { ...snap.lastMove.b } }
      : null;
    S.selected = null;
    S.hover = null;
    S.drag = null;
    S.freeze = null;
    S.pendingFreeze = 0;
  }

  function pushHistory() {
    S.history.push(snapshot());
    if (S.history.length > 80) S.history.shift();
  }

  let swapLock = false;

  async function animateSwap(a, b) {
    if (swapLock) return;
    swapLock = true;
    const g1 = S.board[a.r][a.c];
    const g2 = S.board[b.r][b.c];
    if (!g1 || !g2) {
      swapLock = false;
      return;
    }
    S.board[a.r][a.c] = g2;
    S.board[b.r][b.c] = g1;

    const speed = g1.y === g2.y ? 105 : 135;
    await Promise.all([
      tween(g1, { x: b.c, y: b.r }, speed),
      tween(g2, { x: a.c, y: a.r }, speed),
    ]);

    g1.x = b.c;
    g1.y = b.r;
    g2.x = a.c;
    g2.y = a.r;
    swapLock = false;
  }

  async function doRewind() {
    if (!S) return false;
    if (S.busy || !['idle', 'lost'].includes(S.state)) {
      toast('现在还不能倒带');
      return false;
    }
    if (S.sand <= 0) {
      toast('时砂不足 — 消掉时间晶体可以补充');
      return false;
    }
    if (!S.history.length) {
      toast('时间线上还没有可回溯的步骤');
      return false;
    }

    closeModal();
    Sound.ensure();
    Sound.rewind();

    const oldUsed = S.level.steps - S.stepsLeft;
    S.busy = true;
    S.state = 'rewind';
    S.selected = null;
    S.hint = null;
    S.resultShown = false;

    els.stage.classList.add('rewinding');
    showBanner('◀◀ REWIND', '时间正在倒放', 'magenta', 900);
    syncHUD();

    await sdelay(600);

    const snap = S.history.pop();
    restoreSnapshot(snap);
    S.sand = Math.max(0, S.sand - 1);
    S.consecutiveRewinds++;
    S.totalRewinds++;

    const newUsed = clamp(S.level.steps - S.stepsLeft, 0, S.level.steps);
    S.ringView = oldUsed;
    S.branchPoints.add(newUsed);

    addCracks(Math.min(3, S.consecutiveRewinds));

    S.state = 'idle';
    S.busy = false;
    S.lastAction = performance.now();
    els.stage.classList.remove('rewinding');

    addLog(`分支点 · 回到第 ${newUsed} 步 · 时砂 −1`, 'cyan');
    if (S.consecutiveRewinds > 1) {
      addLog(`连续倒带 ×${S.consecutiveRewinds} · 裂缝正在叠加`, 'magenta');
    }

    S.shake = 9;
    syncHUD();
    showBanner('分支已改写', `回到第 ${newUsed} 步 · 走另一条路`, 'cyan', 1200);
    if (S.level.tutorial && S.tutorialStep === 1) {
      S.tutorialStep = 2;
      showCoach('时砂 −1', '你回到了上一步。现在清掉挡路的时间锁：消除它旁边任意方块来震碎它。');
    }
    return true;
  }

  function addCracks(count) {
    if (!S || count <= 0) return 0;
    const free = [];
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const g = S.board[r][c];
        if (!S.cracks[r][c] && g && !g.lock) free.push({ r, c });
      }
    }
    shuffleArr(free);
    const add = free.slice(0, count);
    for (const p of add) {
      S.cracks[p.r][p.c] = true;
      ensureCrackArt(p.r, p.c);
      spawnBurst(p.r, p.c, '#ff4fd8', 14, 1.2);
      floatTextAt(p.r, p.c, '裂缝', '#ff4fd8', 15);
    }
    if (add.length) {
      Sound.crack();
      S.shake = Math.max(S.shake, 7);
      addLog(`时间裂缝 +${add.length} · 消除裂缝方块可冻结时间`, 'magenta');
    }
    return add.length;
  }

  /* ---------------------------------------------------------
     Turn resolution
     --------------------------------------------------------- */
  async function attemptMove(a, b) {
    if (!S || !a || !b || !isAdjacent(a, b)) return;
    if (S.state !== 'idle' || S.busy) return;
    if (isLockedCell(a) || isLockedCell(b)) return;

    S.busy = true;
    S.state = 'anim';
    S.selected = null;
    S.hint = null;
    S.lastAction = performance.now();
    S.turnGain = 0;
    swapLock = false;

    const before = snapshot();

    Sound.ensure();
    Sound.swap();
    await animateSwap(a, b);

    const runs = findMatches();
    if (!runs.length) {
      Sound.invalid();
      S.shake = 6;
      await animateSwap(b, a);
      S.state = 'idle';
      S.busy = false;
      S.lastAction = performance.now();
      toast('这次交换没有形成消除');
      syncHUD();
      return;
    }

    S.history.push(before);
    if (S.history.length > 80) S.history.shift();

    S.stepsLeft = Math.max(0, S.stepsLeft - 1);
    S.consecutiveRewinds = 0;
    S.lastMove = { a: { ...a }, b: { ...b } };
    S.state = 'anim';
    syncHUD();

    try {
      await resolveBoard(1);
      await settleTurn();
    } catch (err) {
      console.error('[rewind-match3] turn error', err);
      S.state = 'idle';
      S.busy = false;
      syncHUD();
    }
  }

  async function tickLockTimers() {
    const expired = [];
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const g = S.board[r][c];
        if (g && g.lock && g.lockTimer > 0) {
          g.lockTimer--;
          if (g.lockTimer <= 0) expired.push({ r, c, g });
        }
      }
    }
    if (!expired.length) return;

    S.busy = true;
    for (const p of expired) {
      p.g.lock = 0;
      p.g.lockTimer = 0;
      spawnBurst(p.r, p.c, '#ff6b6b', 20, 1.5);
      floatTextAt(p.r, p.c, '倒计时锁崩解', '#ff8f8f', 13);
    }
    addCracks(Math.min(4, expired.length * 2));
    addLog(`倒计时锁崩解 ×${expired.length} · 裂缝 +${Math.min(4, expired.length * 2)}`, 'magenta');
    showBanner('倒计时锁崩解', '时间反噬：裂缝增加', 'magenta', 1300);
    Sound.lose();
    S.shake = Math.max(S.shake, 8);
    syncHUD();
    await sdelay(420);

    // unlocking a timer can expose a fresh run on the board
    if (findMatches().length) {
      S.busy = true;
      S.state = 'anim';
      await resolveBoard(1);
    }
    S.busy = false;
  }

  async function settleTurn() {
    S.busy = false;

    await tickLockTimers();

    let rounds = 0;
    while (S.pendingFreeze > 0 && rounds < 3) {
      const n = S.pendingFreeze;
      S.pendingFreeze = 0;
      await runFreeze(3000 + Math.min(3000, (n - 1) * 1000));
      rounds++;
    }

    if (S.level.tutorial && S.tutorialStep === 0) {
      S.tutorialStep = 1;
      showCoach('第一步完成', '时砂是有限的。按 Z 或点左侧「倒带」，花 1 枚回到上一步——分数、步数、棋盘都会回来。');
    }

    if (goalsMet()) {
      winLevel();
      return;
    }
    if (S.stepsLeft <= 0) {
      loseLevel();
      return;
    }
    if (S.score >= S.level.target && !S.goalHinted) {
      S.goalHinted = true;
      if (S.level.tutorial && S.tutorialStep < 2) {
        toast('先按 Z 倒带一次 · 看看时砂怎么改写这一步');
      } else {
        const parts = [];
        if (locksLeft() > 0) parts.push(`还差 ${locksLeft()} 个时间锁`);
        const needCrystals = Math.max(0, (S.level.crystals || 0) - S.levelCrystals);
        if (needCrystals > 0) parts.push(`还差 ${needCrystals} 个时间晶体`);
        if (parts.length) toast(`分数已达标 · ${parts.join(' · ')}`);
      }
    }

    S.state = 'idle';
    S.lastAction = performance.now();
    if (S.turnGain > 0) {
      addLog(
        `第 ${S.level.steps - S.stepsLeft} 步 · +${fmt(S.turnGain)} 分${
          S.lastWaves > 1 ? ` · 连锁 ×${S.lastWaves}` : ''
        }`,
        'amber'
      );
    }
    syncHUD();
  }

  async function resolveBoard(startChain = 1) {
    let chain = startChain;
    let guard = 0;
    let waves = 0;
    S.chain = chain;
    S.lastWaves = 0;

    while (guard++ < 30) {
      const runs = findMatches();
      if (!runs.length) break;
      S.maxChain = Math.max(S.maxChain, chain);
      await resolveWave(runs, chain);
      waves++;
      chain++;
      S.chain = chain;
    }

    S.lastWaves = waves;
    S.chain = startChain + Math.max(0, waves - 1);

    if (!hasValidMove()) {
      await shuffleBoard();
    }
  }

  async function resolveWave(runs, chain) {
    const clear = new Set();
    const anchors = new Map();

    for (const run of runs) {
      if (run.len >= 4) {
        let anchor = null;
        if (S.lastMove) {
          for (const p of run.cells) {
            if (
              (p.r === S.lastMove.a.r && p.c === S.lastMove.a.c) ||
              (p.r === S.lastMove.b.r && p.c === S.lastMove.b.c)
            ) {
              anchor = p;
              break;
            }
          }
        }
        if (!anchor) anchor = run.cells[Math.floor(run.cells.length / 2)];
        const k = pkey(anchor.r, anchor.c);
        if (!anchors.has(k)) {
          anchors.set(k, { r: anchor.r, c: anchor.c, type: run.type });
        }
      }
      for (const p of run.cells) clear.add(pkey(p.r, p.c));
    }
    for (const k of anchors.keys()) clear.delete(k);

    // L / T 形交叉：同一次消除里横竖两条 run 共用一格 → 时间塌缩
    const collapseCells = new Set();
    const collapseAt = [];
    const hRuns = runs.filter((r) => r.dir === 'h');
    const vRuns = runs.filter((r) => r.dir === 'v');
    for (const h of hRuns) {
      for (const v of vRuns) {
        const hit = h.cells.find((p) => v.cells.some((q) => q.r === p.r && q.c === p.c));
        if (!hit) continue;
        if (
          collapseAt.some((p) => p.r === hit.r && p.c === hit.c) ||
          collapseAt.some((p) => Math.abs(p.r - hit.r) <= 1 && Math.abs(p.c - hit.c) <= 1)
        ) {
          continue;
        }
        collapseAt.push(hit);
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = hit.r + dr;
            const nc = hit.c + dc;
            if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;
            const ng = S.board[nr][nc];
            if (ng && !ng.lock) collapseCells.add(pkey(nr, nc));
          }
        }
      }
    }
    for (const k of collapseCells) clear.add(k);
    const collapses = collapseAt.length;
    if (collapses) {
      S.totalCollapses += collapses;
      for (const p of collapseAt) {
        spawnBurst(p.r, p.c, '#5ce1ff', 30, 2);
        floatTextAt(p.r, p.c, '时间塌缩', '#9df3ff', 15, -0.4);
      }
      Sound.crystal();
      S.shake = Math.max(S.shake, 11);
      showBanner('时间塌缩', 'L / T 形交叉 · 周围 3×3 清除', 'cyan', 1300);
      addLog(`时间塌缩 ×${collapses} · 交叉点周围清除`, 'cyan');
    }

    let cleared = 0;
    let cracked = 0;
    let crystals = 0;
    let locksBroken = 0;
    const removals = [];
    const anims = [];

    // A cleared gem shakes loose any time lock orthogonally next to it.
    const lockHits = new Set();
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    for (const k of clear) {
      const { r, c } = pref(k);
      for (const [dr, dc] of dirs) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;
        const ng = S.board[nr][nc];
        if (ng && ng.lock) lockHits.add(pkey(nr, nc));
      }
    }
    for (const k of lockHits) {
      const { r, c } = pref(k);
      const gem = S.board[r][c];
      if (!gem || !gem.lock) continue;
      gem.lock--;
      spawnBurst(r, c, '#9fe8ff', 10, 1.1);
      if (gem.lock > 0) {
        floatTextAt(r, c, '锁 -1', '#cfefff', 13);
        anims.push(tween(gem, { scale: 0.82 }, 90).then(() => tween(gem, { scale: 1 }, 130)));
      } else {
        gem.lock = 0;
        locksBroken++;
        cleared++;
        spawnBurst(r, c, '#e8fbff', 24, 1.6);
        floatTextAt(r, c, '时间锁破碎', '#9fe8ff', 14);
        removals.push({ r, c, gem });
        anims.push(tween(gem, { scale: 0, alpha: 0, rot: (gem.rot || 0) + 0.6 }, 190));
      }
    }

    for (const k of clear) {
      const { r, c } = pref(k);
      const gem = S.board[r][c];
      if (!gem) continue;

      if (S.cracks[r][c]) {
        S.cracks[r][c] = false;
        delete S.crackArt[k];
        S.pendingFreeze++;
        cracked++;
        spawnBurst(r, c, '#ff4fd8', 22, 1.6);
      }

      if (gem.special) {
        S.sand = Math.min(MAX_SAND, S.sand + 1);
        S.totalCrystals++;
        S.levelCrystals++;
        crystals++;
        Sound.crystal();
        spawnBurst(r, c, '#ffe9a8', 18, 1.4);
        floatTextAt(r, c, '时砂 +1', '#ffd76e', 15);
      }

      const def = TYPE_DEFS[gem.type];
      spawnBurst(r, c, def.color, 11, 1);
      cleared++;
      removals.push({ r, c, gem });
      anims.push(tween(gem, { scale: 0, alpha: 0, rot: (gem.rot || 0) + 0.5 }, 190));
    }

    const gain = Math.round(
      clear.size * 30 * chain + anchors.size * 100 + locksBroken * 80 + collapses * 120
    );
    S.score += gain;
    S.turnGain += gain;
    if (gain > 0) {
      const mid = removals.length
        ? removals[Math.floor(removals.length / 2)]
        : pref(Array.from(clear)[0]);
      if (mid) {
        floatTextAt(mid.r, mid.c, `+${gain}`, chain > 1 ? '#ffd76e' : '#ffffff', chain > 1 ? 23 : 19);
        if (chain > 1) floatTextAt(mid.r, mid.c, `连锁 ×${chain}`, '#5ce1ff', 13, -0.6);
      }
    }

    if (cleared > 0) {
      Sound.match(chain);
      S.shake = Math.max(S.shake, Math.min(10, 3 + cleared * 0.5));
    }

    await Promise.all(anims);
    for (const p of removals) {
      if (S.board[p.r][p.c] === p.gem) S.board[p.r][p.c] = null;
    }

    for (const [k, a] of anchors) {
      const gem = S.board[a.r][a.c];
      if (gem) {
        gem.special = true;
        spawnBurst(a.r, a.c, '#fff3c4', 18, 1.4);
        floatTextAt(a.r, a.c, '时间晶体', '#ffd76e', 14);
        anims.push(tween(gem, { scale: 1.35 }, 110).then(() => tween(gem, { scale: 1 }, 180)));
      }
    }
    if (anchors.size) {
      Sound.crystal();
      addLog('四连 · 时间晶体生成', 'amber');
    }
    if (crystals) {
      addLog(`消掉时间晶体 · 时砂 +${crystals}`, 'amber');
    }
    if (cracked) {
      addLog(`裂缝崩塌 ×${cracked} · 时间冻结充能`, 'cyan');
    }
    if (locksBroken) {
      addLog(`时间锁破碎 ×${locksBroken} · 剩余 ${locksLeft()}`, 'cyan');
      if (S.level.tutorial && S.tutorialStep === 2) {
        S.tutorialStep = 3;
        showCoach('时间锁碎了', '分数达标、锁也清完，这条时间线就会收束。剩下的步数可以用来冲更高分。');
      }
    }

    await applyGravity();
    syncHUD();
  }

  async function applyGravity() {
    const anims = [];
    for (let c = 0; c < N; c++) {
      let write = N - 1;
      for (let r = N - 1; r >= 0; r--) {
        const g = S.board[r][c];
        if (!g) continue;
        if (write !== r) {
          S.board[write][c] = g;
          S.board[r][c] = null;
          anims.push(tween(g, { x: c, y: write }, 240));
        }
        write--;
      }
      let spawn = 0;
      for (let r = write; r >= 0; r--) {
        const g = makeGem(rndInt(TYPE_DEFS.length), c, -1 - spawn);
        g.scale = 0.55;
        S.board[r][c] = g;
        anims.push(tween(g, { x: c, y: r, scale: 1 }, 280));
        spawn++;
      }
    }
    await Promise.all(anims);
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const g = S.board[r][c];
        if (g) {
          g.x = c;
          g.y = r;
          g.scale = 1;
          g.alpha = 1;
        }
      }
    }
  }

  async function shuffleBoard(auto = true) {
    if (auto) {
      showBanner('时间线校准', '没有可用交换 · 正在重排棋盘', 'cyan', 1400);
      addLog('无可交换步骤 · 时间线自动校准', 'dim');
    } else {
      showBanner('道具 · 洗牌', '重排棋盘 · 不消耗步数', 'cyan', 1200);
      addLog('道具 · 洗牌 · 不消耗步数', 'cyan');
    }
    const gems = [];
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (S.board[r][c]) gems.push(S.board[r][c]);
      }
    }
    if (!gems.length) return;

    let guard = 0;
    do {
      const types = gems.map((g) => g.type);
      shuffleArr(types);
      gems.forEach((g, i) => {
        g.type = types[i];
      });
      guard++;
    } while (guard < 60 && (matrixHasMatch(matrixFromBoard()) || !hasValidMove()));

    await Promise.all(gems.map((g) => tween(g, { scale: 0.25 }, 130)));
    await Promise.all(gems.map((g) => tween(g, { scale: 1 }, 220)));
  }

  /* ---------------------------------------------------------
     Freeze mode
     --------------------------------------------------------- */
  async function runFreeze(ms) {
    if (!S) return;
    const realMs = ms * (SPEED < 1 ? Math.max(0.08, SPEED * 2) : 1);
    S.state = 'freeze';
    S.busy = false;
    S.selected = null;
    S.freeze = {
      active: true,
      start: performance.now(),
      end: performance.now() + realMs,
      duration: realMs,
      swaps: 0,
    };
    S.totalFreezes++;
    S.lastAction = performance.now();
    Sound.freeze();
    showBanner('时间冻结', `${(realMs / 1000).toFixed(1)} 秒 · 在静止棋盘上随意交换`, 'cyan', 1500);
    addLog(`时间冻结 ${(realMs / 1000).toFixed(1)}s · 自由交换不计步数`, 'cyan');
    syncHUD();

    await new Promise((resolve) => {
      const check = () => {
        if (!S.freeze || !S.freeze.active || performance.now() >= S.freeze.end) {
          resolve();
        } else {
          setTimeout(check, 40);
        }
      };
      check();
    });

    if (S.freeze) S.freeze.active = false;
    while (S.busySwap) await sleep(25);

    const swaps = S.freeze ? S.freeze.swaps : 0;
    const boost = 1 + Math.min(4, Math.floor(swaps / 2));
    S.state = 'anim';
    if (swaps > 0) {
      showBanner('时停连携', `${swaps} 次自由交换 · 结算倍率 ×${boost}`, 'amber', 1400);
      addLog(`时停连携 ×${boost} · 开始结算`, 'amber');
    } else {
      showBanner('时间恢复流动', '冻结结束 · 开始结算', 'cyan', 900);
    }
    S.freeze = null;
    syncHUD();
    await resolveBoard(boost);
  }

  async function freezeSwap(a, b) {
    if (!S || S.state !== 'freeze' || !S.freeze || !S.freeze.active || S.busySwap) return;
    if (isLockedCell(a) || isLockedCell(b)) return;
    S.busySwap = true;
    S.selected = null;
    S.lastAction = performance.now();
    Sound.swap();
    await animateSwap(a, b);
    if (S.freeze) S.freeze.swaps++;
    S.busySwap = false;
  }

  /* ---------------------------------------------------------
     Input
     --------------------------------------------------------- */
  function canInteract() {
    return (
      S &&
      S.started &&
      !modalOpen &&
      !S.busy &&
      (S.state === 'idle' || S.state === 'freeze')
    );
  }

  function cellFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const x = ((e.clientX - rect.left) / rect.width) * SIZE;
    const y = ((e.clientY - rect.top) / rect.height) * SIZE;
    if (x < BX || y < BY || x >= BX + BOARD_PX || y >= BY + BOARD_PX) return null;
    const c = Math.floor((x - BX) / CELL);
    const r = Math.floor((y - BY) / CELL);
    if (r < 0 || r >= N || c < 0 || c >= N) return null;
    return { r, c };
  }

  function doSwap(a, b) {
    S.selected = null;
    S.hint = null;
    if (isLockedCell(a) || isLockedCell(b)) {
      Sound.invalid();
      toast('时间锁固定住了方块 · 先消除它旁边的方块');
      return;
    }
    if (S.state === 'freeze') {
      freezeSwap(a, b);
    } else {
      attemptMove(a, b);
    }
  }

  function handleTap(cell) {
    if (S.toolMode) {
      applyLineTool(cell);
      return;
    }
    if (isLockedCell(cell)) {
      Sound.invalid();
      toast('时间锁固定住了方块 · 先消除它旁边的方块');
      S.selected = null;
      return;
    }
    if (!S.selected) {
      S.selected = cell;
      Sound.click();
      return;
    }
    if (S.selected.r === cell.r && S.selected.c === cell.c) {
      S.selected = null;
      return;
    }
    if (isAdjacent(S.selected, cell)) {
      const a = S.selected;
      doSwap(a, cell);
    } else {
      S.selected = cell;
      Sound.click();
    }
  }

  function beginLineTool(kind) {
    if (!S || S.busy || S.state !== 'idle') return;
    if (!S.tools[kind]) {
      toast('这个道具已经用完了');
      return;
    }
    if (S.stepsLeft <= 0) {
      toast('没有步数了 · 先倒带');
      return;
    }
    if (S.toolMode === kind) {
      S.toolMode = null;
      syncHUD();
      return;
    }
    S.toolMode = kind;
    S.selected = null;
    S.hint = null;
    S.drag = null;
    Sound.click();
    toast(kind === 'col' ? '点击棋盘上任意方块，清除那一列' : '点击棋盘上任意方块，清除那一行');
    showBanner(kind === 'col' ? '清列 · 选择一列' : '清行 · 选择一行', '点击棋盘上的方块确定线路 · 消耗 1 步', 'cyan', 1800);
    syncHUD();
  }

  async function useShuffle() {
    if (!S || S.busy || S.state !== 'idle') return;
    if (!S.tools.shuffle) {
      toast('洗牌已经用完了');
      return;
    }
    S.toolMode = null;
    S.tools.shuffle--;
    S.busy = true;
    S.state = 'anim';
    Sound.click();
    syncHUD();
    try {
      await shuffleBoard(false);
      toast('棋盘已重排 · 不消耗步数');
    } finally {
      S.state = 'idle';
      S.busy = false;
      syncHUD();
    }
  }

  async function applyLineTool(cell) {
    if (!S || !S.toolMode || S.busy || S.state !== 'idle') return;
    const kind = S.toolMode;
    if (!S.tools[kind]) {
      S.toolMode = null;
      syncHUD();
      return;
    }

    S.toolMode = null;
    S.busy = true;
    S.state = 'anim';
    S.selected = null;
    S.hint = null;
    S.drag = null;
    S.turnGain = 0;

    const before = snapshot();
    S.tools[kind]--;
    S.stepsLeft = Math.max(0, S.stepsLeft - 1);
    S.consecutiveRewinds = 0;
    S.lastMove = null;

    S.history.push(before);
    if (S.history.length > 80) S.history.shift();

    const cells = [];
    for (let i = 0; i < N; i++) {
      cells.push(kind === 'col' ? { r: i, c: cell.c } : { r: cell.r, c: i });
    }

    const removals = [];
    const anims = [];
    let cleared = 0;
    let locksBroken = 0;

    for (const p of cells) {
      const g = S.board[p.r][p.c];
      if (!g) continue;
      if (g.lock) {
        g.lock--;
        spawnBurst(p.r, p.c, '#9fe8ff', 12, 1.2);
        if (g.lock > 0) {
          floatTextAt(p.r, p.c, '锁 -1', '#cfefff', 13);
          anims.push(tween(g, { scale: 0.82 }, 90).then(() => tween(g, { scale: 1 }, 130)));
        } else {
          g.lock = 0;
          g.lockTimer = 0;
          locksBroken++;
          cleared++;
          spawnBurst(p.r, p.c, '#e8fbff', 24, 1.6);
          floatTextAt(p.r, p.c, '时间锁破碎', '#9fe8ff', 14);
          removals.push({ r: p.r, c: p.c, gem: g });
          anims.push(tween(g, { scale: 0, alpha: 0, rot: (g.rot || 0) + 0.6 }, 190));
        }
        continue;
      }

      if (S.cracks[p.r][p.c]) {
        S.cracks[p.r][p.c] = false;
        delete S.crackArt[pkey(p.r, p.c)];
        S.pendingFreeze++;
        spawnBurst(p.r, p.c, '#ff4fd8', 20, 1.5);
      }
      if (g.special) {
        S.sand = Math.min(MAX_SAND, S.sand + 1);
        S.totalCrystals++;
        S.levelCrystals++;
        floatTextAt(p.r, p.c, '时砂 +1', '#ffd76e', 15);
      }
      spawnBurst(p.r, p.c, TYPE_DEFS[g.type].color, 10, 1);
      cleared++;
      removals.push({ r: p.r, c: p.c, gem: g });
      anims.push(tween(g, { scale: 0, alpha: 0, rot: (g.rot || 0) + 0.5 }, 180));
    }

    const gain = cleared * 30 + locksBroken * 80 + 50;
    S.score += gain;
    S.turnGain += gain;
    if (removals.length) {
      const mid = removals[Math.floor(removals.length / 2)];
      floatTextAt(mid.r, mid.c, `+${gain}`, '#ffffff', 22);
    }
    addLog(`道具 · ${kind === 'col' ? '清列' : '清行'} ${kind === 'col' ? cell.c + 1 : cell.r + 1} · +${fmt(gain)} 分`, 'cyan');
    if (locksBroken) addLog(`时间锁破碎 ×${locksBroken} · 剩余 ${locksLeft()}`, 'cyan');
    Sound.match(1);
    S.shake = Math.max(S.shake, 9);
    hideCoach();
    syncHUD();

    try {
      await Promise.all(anims);
      for (const p of removals) {
        if (S.board[p.r][p.c] === p.gem) S.board[p.r][p.c] = null;
      }
      await applyGravity();
      await resolveBoard(1);
      await settleTurn();
    } catch (err) {
      console.error('[rewind-match3] tool error', err);
      S.state = 'idle';
      S.busy = false;
      syncHUD();
    }
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!canInteract()) return;
    Sound.ensure();
    const cell = cellFromEvent(e);
    if (!cell) return;
    if (S.toolMode) {
      applyLineTool(cell);
      return;
    }
    S.drag = { start: cell, x: e.clientX, y: e.clientY, moved: false };
    S.lastAction = performance.now();
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (err) {
      /* noop */
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!canInteract()) {
      S.hover = null;
      return;
    }
    const cell = cellFromEvent(e);
    S.hover = cell;
    if (!S.drag) return;
    const dx = e.clientX - S.drag.x;
    const dy = e.clientY - S.drag.y;
    if (Math.hypot(dx, dy) < 12) return;
    S.drag.moved = true;
    if (cell && isAdjacent(S.drag.start, cell)) {
      const a = S.drag.start;
      S.drag = null;
      doSwap(a, cell);
    }
  });

  function endPointer(e) {
    if (!S || !S.drag) return;
    const drag = S.drag;
    S.drag = null;
    if (drag.moved) return;
    const cell = cellFromEvent(e);
    if (!cell) return;
    if (cell.r === drag.start.r && cell.c === drag.start.c) {
      handleTap(cell);
    }
  }

  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', () => {
    if (S) S.drag = null;
  });
  canvas.addEventListener('pointerleave', () => {
    if (S) S.hover = null;
  });

  /* ---------------------------------------------------------
     HUD / modal / log
     --------------------------------------------------------- */
  function syncHUD() {
    if (!S) return;
    els.score.textContent = fmt(S.displayScore);
    els.target.textContent = fmt(S.level.target);
    els.progress.style.width = `${clamp((S.score / S.level.target) * 100, 0, 100)}%`;
    els.steps.textContent = S.stepsLeft;
    els.steps.classList.toggle('low', S.stepsLeft <= 5);
    els.sand.textContent = S.sand;
    els.cracks.textContent = S.cracks.flat().filter(Boolean).length;

    const locksTotal = (S.level.locks || []).length;
    const locksDone = locksTotal - locksLeft();
    els.goalScoreVal.textContent = `${fmt(S.score)} / ${fmt(S.level.target)}`;
    els.goalScoreRow.classList.toggle('done', S.score >= S.level.target);
    els.goalLockRow.hidden = !locksTotal;
    els.goalLockVal.textContent = `${locksDone} / ${locksTotal}`;
    els.goalLockRow.classList.toggle('done', locksTotal > 0 && locksDone >= locksTotal);
    const cryNeed = S.level.crystals || 0;
    els.goalCrystalRow.hidden = !cryNeed;
    els.goalCrystalVal.textContent = `${Math.min(S.levelCrystals, cryNeed)} / ${cryNeed}`;
    els.goalCrystalRow.classList.toggle('done', cryNeed > 0 && S.levelCrystals >= cryNeed);
    els.branches.textContent = S.totalRewinds;
    els.freezes.textContent = S.totalFreezes;
    els.maxchain.textContent = S.maxChain;
    els.quote.textContent = S.level.quote;
    els.levelChip.textContent = `记忆碎片 ${pad2(S.level.id)} · ${S.level.name}`;
    els.missionLabel.textContent = `MISSION ${pad2(S.level.id)}`;
    els.bestChip.textContent = S.level.tutorial
      ? 'CALIBRATION'
      : `BEST ${fmt(bests[levelIndex] || 0)}`;

    const idle = !S.busy && S.state === 'idle';
    const toolDefs = [
      [els.toolShuffle, 'shuffle'],
      [els.toolCol, 'col'],
      [els.toolRow, 'row'],
    ];
    for (const [btn, key] of toolDefs) {
      if (!btn) continue;
      const count = S.tools[key] || 0;
      const em = btn.querySelector('em');
      if (em) em.textContent = `×${count}`;
      btn.disabled = !idle || count <= 0;
      btn.classList.toggle('active', S.toolMode === key);
    }
    if (els.toolNote) {
      els.toolNote.textContent = S.toolMode
        ? S.toolMode === 'col'
          ? '点击棋盘选择一列 · 再点一次「清列」取消'
          : '点击棋盘选择一行 · 再点一次「清行」取消'
        : '洗牌：重排全部棋子，免费。清列 / 清行：点选棋盘任意格，清掉整列 / 整行，各花 1 步，并震裂线上的锁。';
    }
    els.sandDots.innerHTML = '';
    for (let i = 0; i < MAX_SAND; i++) {
      const dot = document.createElement('i');
      if (i < S.sand) dot.className = 'on';
      els.sandDots.appendChild(dot);
    }

    const canRw =
      !S.busy &&
      ['idle', 'lost'].includes(S.state) &&
      S.sand > 0 &&
      S.history.length > 0;
    els.rewindBtn.disabled = !canRw;
  }

  function addLog(text, tone = '') {
    logEntries.unshift({ text, tone });
    if (logEntries.length > 8) logEntries.length = 8;
    const li = document.createElement('li');
    li.textContent = text;
    if (tone) li.className = tone;
    els.log.prepend(li);
    while (els.log.children.length > 8) els.log.lastElementChild.remove();
  }

  function clearLog() {
    logEntries = [];
    els.log.innerHTML = '';
  }

  function showBanner(title, sub = '', tone = 'amber', ms = 1200) {
    if (!els.banner) return;
    clearTimeout(bannerTimer);
    els.banner.className = `banner ${tone}`;
    els.banner.querySelector('strong').textContent = title;
    els.banner.querySelector('span').textContent = sub;
    void els.banner.offsetWidth;
    els.banner.classList.add('show');
    bannerTimer = setTimeout(() => {
      els.banner.classList.remove('show');
    }, ms * Math.min(1, SPEED));
  }

  function toast(msg) {
    if (!els.toast) return;
    clearTimeout(toastTimer);
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 1900);
  }

  function showCoach(title, text) {
    if (!els.coach) return;
    els.coachTitle.textContent = title;
    els.coachText.textContent = text;
    els.coach.classList.add('show');
  }

  function hideCoach() {
    if (els.coach) els.coach.classList.remove('show');
  }

  function openModal(html) {
    hideCoach();
    els.modalCard.innerHTML = html;
    els.modal.classList.add('open');
    modalOpen = true;
    document.body.style.overflow = 'hidden';
    if (S) S.selected = null;
    syncHUD();
  }

  function closeModal() {
    els.modal.classList.remove('open');
    modalOpen = false;
    document.body.style.overflow = '';
    syncHUD();
  }

  function openIntro() {
    const lv = LEVELS[levelIndex];
    const tut = !!lv.tutorial;
    openModal(`
      <p class="eyebrow">${tut ? 'CALIBRATION / 第一次循环' : 'A MATCH-3 ABOUT UNDOING'}</p>
      <h1 class="intro-title">倒带<span>三消</span></h1>
      <p class="intro-tag">
        ${
          tut
            ? '先花一分钟校准时间感：<b>交换、倒带、再拆掉挡路的时间锁。</b>'
            : '时间不是背景板，是你唯一的资源。交换、消除、得分——<b>但真正好玩的，是你随时可以按下倒带。</b>'
        }
      </p>
      <div class="intro-grid">
        <article><b>01 / 交换 · 消除</b><p>拖动相邻方块，凑齐三个。L / T 形交叉会触发时间塌缩，清掉周围一圈。</p></article>
        <article><b>02 / 倒带 · 时砂</b><p>时砂是有限的。花 1 枚倒回上一步，分数、步数、棋盘全部回退；连续倒带会留下裂缝。</p></article>
        <article><b>03 / 时间锁 · 路障</b><p>锁住的方块不能交换。消除它旁边的方块来震碎它——红色倒计时锁归零会崩解并留下裂缝。</p></article>
      </div>
      <div class="intro-foot">
        <button class="btn-primary" data-action="start" type="button">${tut ? '开始校准 ◀◀' : '开始操控时间 ◀◀'}</button>
        ${
          tut
            ? '<button class="btn-ghost" data-action="skip-tutorial" type="button">跳过教学</button>'
            : ''
        }
        <small>${lv.steps} 步 · ${fmt(lv.target)} 分 · ${(lv.locks || []).length} 把时间锁 · ${lv.sand} 枚时砂</small>
      </div>
    `);
  }

  function openHelp() {
    openModal(`
      <div class="help-modal">
        <p class="eyebrow">HOW TO PLAY</p>
        <h2>玩法 / 机制</h2>
        <p class="sub">目标：在步数耗尽前达到目标分数，并清掉所有时间锁。第三关额外需要收集 1 个时间晶体。</p>
        <ul class="help-list">
          <li><span class="k">01</span><div><b>交换与消除</b><p>拖动或点击两块<em>相邻</em>方块交换。横向或纵向三个同色即可消除，连锁消除会提高倍率。</p></div></li>
          <li><span class="k">02</span><div><b>倒带 = 花 1 时砂</b><p>按 <em>Z</em> 或点左侧按钮，回到上一步。分数、剩余步数、方块位置全部回退。倒带后可以换一种走法，形成分支。</p></div></li>
          <li><span class="k">03</span><div><b>时间裂缝</b><p>每连续倒带一次，棋盘上会叠加裂缝（第一次 1 个，第二次 2 个，最多 3 个）。裂缝覆盖在方块上，不会自己消失。</p></div></li>
          <li><span class="k">04</span><div><b>冻结时间 3 秒</b><p>消除带裂缝的方块，时间立刻冻结。倒计时内可以<em>无限次交换</em>，不消耗步数，也不会立即结算。倒计时结束时，棋盘上的所有消除一起结算，交换次数越多，倍率越高（每 2 次交换 +1 倍，最高 ×5）。</p></div></li>
          <li><span class="k">05</span><div><b>时间晶体</b><p>四连（或更长）会留下时间晶体。把晶体也消掉，可以补回 <em>1 时砂</em>，维持循环。</p></div></li>
          <li><span class="k">06</span><div><b>失败也可以倒带</b><p>步数耗尽时，如果还有时砂和上一步记录，可以直接倒带回到最后一步之前，改掉那个失误。</p></div></li>
          <li><span class="k">07</span><div><b>时间锁 · 路障</b><p>锁住的方块不能交换，也不参与消除。消除它<em>旁边</em>的方块可以震裂锁；1–2 次冲击后锁会破碎。<em>清掉所有时间锁</em>才算完成本关。红色倒计时锁每走一步减 1，归零会崩解并留下 2 道裂缝。</p></div></li>
          <li><span class="k">08</span><div><b>道具 · 洗牌 / 清列 / 清行</b><p>每关各 1 次。洗牌免费重排棋盘；清列、清行点击道具后<em>再点棋盘选一条线</em>，整条消除并震裂线上的锁，消耗 1 步。</p></div></li>
          <li><span class="k">09</span><div><b>交叉 · 时间塌缩</b><p>同一次消除中同时形成横排和竖排（L / T 形交叉），会触发时间塌缩：以交叉点为中心清除周围 <em>3×3</em> 方块，是拆锁和冲分的关键。</p></div></li>
        </ul>
        <div class="result-actions">
          <button class="btn-primary" data-action="close" type="button">回到时间线</button>
        </div>
      </div>
    `);
  }

  function openRestartConfirm() {
    if (!S || modalOpen) return;
    Sound.click();
    openModal(`
      <p class="eyebrow">RESET TIMELINE</p>
      <h2>重开这条时间线？</h2>
      <p class="result-kicker">当前分数与倒带记录都会清空。</p>
      <div class="result-actions">
        <button class="btn-primary" data-action="restart-confirm" type="button">确认重开</button>
        <button class="btn-ghost" data-action="close" type="button">取消</button>
      </div>
    `);
  }

  function winLevel() {
    if (S.state === 'won') return;
    S.state = 'won';
    S.busy = false;
    S.resultShown = false;
    if (S.level.tutorial) markTutorialDone();
    hideCoach();
    const prev = bests[levelIndex] || 0;
    if (S.score > prev) {
      bests[levelIndex] = S.score;
      saveBests();
    }
    Sound.win();
    confetti();
    syncHUD();
    setTimeout(() => {
      if (S && S.state === 'won' && !S.resultShown) showResult('win');
    }, Math.max(60, 620 * Math.min(1, SPEED)));
  }

  function loseLevel() {
    if (S.state === 'lost') return;
    S.state = 'lost';
    S.busy = false;
    S.resultShown = false;
    Sound.lose();
    S.shake = 10;
    syncHUD();
    setTimeout(() => {
      if (S && S.state === 'lost' && !S.resultShown) showResult('lose');
    }, Math.max(60, 600 * Math.min(1, SPEED)));
  }

  function showResult(kind) {
    if (!S) return;
    S.resultShown = true;
    const win = kind === 'win';
    const lv = S.level;
    const used = lv.steps - S.stepsLeft;
    const canRw = S.sand > 0 && S.history.length > 0;
    const next = levelIndex + 1 < LEVELS.length;
    const best = bests[levelIndex] || 0;
    const locksTotal = (lv.locks || []).length;
    const locksDone = locksTotal - locksLeft();
    const cryNeed = lv.crystals || 0;

    openModal(`
      <div class="result">
        <p class="eyebrow">${win ? 'TIMELINE STABILIZED' : 'TIMELINE COLLAPSED'}</p>
        <h2>${win ? '时间线收束' : '时间坍缩'}</h2>
        <p class="result-kicker">记忆碎片 ${pad2(lv.id)} · ${lv.name} — ${win ? '完成' : '未完成'} · 最佳 ${fmt(best)}</p>
        <div class="result-grid">
          <div><span>最终得分</span><b>${fmt(S.score)}</b></div>
          <div><span>使用步数</span><b>${used} / ${lv.steps}</b></div>
          <div><span>剩余时砂</span><b>${S.sand}</b></div>
          <div><span>倒带次数</span><b>${S.totalRewinds}</b></div>
          <div><span>时停次数</span><b>${S.totalFreezes}</b></div>
          <div><span>最高连锁</span><b>×${S.maxChain}</b></div>
        </div>
        <div class="result-goals">
          <span class="${S.score >= lv.target ? 'ok' : 'miss'}">分数 ${fmt(S.score)} / ${fmt(lv.target)}</span>
          ${
            locksTotal
              ? `<span class="${locksDone >= locksTotal ? 'ok' : 'miss'}">时间锁 ${locksDone} / ${locksTotal}</span>`
              : ''
          }
          ${
            cryNeed
              ? `<span class="${S.levelCrystals >= cryNeed ? 'ok' : 'miss'}">晶体 ${Math.min(S.levelCrystals, cryNeed)} / ${cryNeed}</span>`
              : ''
          }
        </div>
        <div class="result-actions">
          ${
            win && next
              ? '<button class="btn-primary" data-action="next" type="button">下一块碎片 →</button>'
              : ''
          }
          ${
            !win && canRw
              ? '<button class="btn-primary" data-action="rewind" type="button">◀◀ 倒带重来 · 1 时砂</button>'
              : ''
          }
          <button class="${win && !next ? 'btn-primary' : 'btn-ghost'}" data-action="${win && !next ? 'loop' : 'replay'}" type="button">
            ${win && !next ? '再走一次循环' : '重新开始'}
          </button>
        </div>
        <p class="result-note">
          ${
            win
              ? next
                ? '下一块记忆碎片会更紧。记得：倒带不是认输，是换一条时间线。'
                : '你走完了所有分支。时间线终于收束——或者说，你终于愿意停下来了。'
              : canRw
              ? '你还有时砂。倒带回到上一步，改掉那个失误——这是你唯一比时间更早知道的答案。'
              : '时砂耗尽，这条时间线到此为止。再来一次，把倒带留到真正需要的时候。'
          }
        </p>
      </div>
    `);
  }

  function initGame(li) {
    closeModal();
    levelIndex = clamp(li, 0, LEVELS.length - 1);
    S = newState(levelIndex);
    buildBoard();
    S.started = true;
    S.ringView = 0;
    S.displayScore = 0;
    hideCoach();
    clearLog();
    addLog(`记忆碎片 ${pad2(S.level.id)} · ${S.level.name}`, 'amber');
    addLog(`目标 ${fmt(S.level.target)} 分 / ${S.level.steps} 步 / ${(S.level.locks || []).length} 把锁`, 'dim');
    addLog('道具 · 洗牌 / 清列 / 清行 各 1 次', 'dim');
    syncHUD();
    showBanner(`记忆碎片 ${pad2(S.level.id)}`, `${S.level.name} · 目标 ${fmt(S.level.target)}`, 'amber', 1800);
    if (S.level.tutorial) {
      showCoach('校准开始', '先拖动两个相邻方块，凑齐三个同色。消除后我们再学时砂和倒带。');
    }
  }

  function restartLevel() {
    closeModal();
    const li = levelIndex;
    initGame(li);
    toast('时间线已重置');
  }

  function nextLevel() {
    if (levelIndex + 1 >= LEVELS.length) {
      restartLevel();
      return;
    }
    closeModal();
    initGame(levelIndex + 1);
  }

  function toggleSound() {
    Sound.enabled = !Sound.enabled;
    try {
      localStorage.setItem('rw_sound_v1', Sound.enabled ? '1' : '0');
    } catch (e) {
      /* noop */
    }
    els.soundBtn.classList.toggle('muted', !Sound.enabled);
    els.soundBtn.textContent = Sound.enabled ? '♪ 音效' : '♪ 静音';
    if (Sound.enabled) {
      Sound.ensure();
      Sound.click();
    }
  }

  /* ---------------------------------------------------------
     Canvas rendering
     --------------------------------------------------------- */
  function shapePath(type, s) {
    ctx.beginPath();
    if (type === 0) {
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.82, 0);
      ctx.lineTo(0, s);
      ctx.lineTo(-s * 0.82, 0);
      ctx.closePath();
    } else if (type === 1) {
      ctx.arc(0, 0, s * 0.94, 0, Math.PI * 2);
    } else if (type === 2) {
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        const x = Math.cos(a) * s;
        const y = Math.sin(a) * s;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    } else if (type === 3) {
      const q = s * 0.86;
      roundRectPath(-q, -q, q * 2, q * 2, s * 0.34);
    } else if (type === 4) {
      for (let i = 0; i < 10; i++) {
        const a = (Math.PI / 5) * i - Math.PI / 2;
        const rad = i % 2 === 0 ? s : s * 0.45;
        const x = Math.cos(a) * rad;
        const y = Math.sin(a) * rad;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    } else {
      const w = s * 0.9;
      ctx.moveTo(0, -s);
      ctx.bezierCurveTo(w * 0.95, -s * 0.12, w, s * 0.5, 0, s);
      ctx.bezierCurveTo(-w, s * 0.5, -w * 0.95, -s * 0.12, 0, -s);
      ctx.closePath();
    }
  }

  function drawStars(now) {
    for (const st of STARS) {
      const a = st.a * (0.65 + 0.35 * Math.sin(now / 1600 + st.p));
      ctx.beginPath();
      ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(190, 205, 255, ${a})`;
      ctx.fill();
    }
  }

  function drawBackground(now) {
    ctx.fillStyle = '#06070f';
    ctx.fillRect(0, 0, SIZE, SIZE);
    const g = ctx.createRadialGradient(SIZE * 0.5, SIZE * 0.44, 40, SIZE * 0.5, SIZE * 0.5, 560);
    g.addColorStop(0, 'rgba(65, 45, 120, 0.42)');
    g.addColorStop(0.55, 'rgba(20, 20, 46, 0.2)');
    g.addColorStop(1, 'rgba(3, 4, 9, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SIZE, SIZE);
    drawStars(now);

    ctx.save();
    ctx.strokeStyle = 'rgba(120, 145, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let r = 120; r < 430; r += 42) {
      ctx.beginPath();
      ctx.arc(SIZE / 2, SIZE / 2, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawTimeline(now) {
    const cx = SIZE / 2;
    const cy = SIZE / 2;
    const total = S.level.steps;
    const used = clamp(total - S.stepsLeft, 0, total);
    const view = clamp(S.ringView, 0, total);
    const a0 = -Math.PI / 2;

    ctx.save();

    // base ring
    ctx.beginPath();
    ctx.arc(cx, cy, RING_R, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(140, 158, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // inner faint ring
    ctx.beginPath();
    ctx.arc(cx, cy, RING_R - 8, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(140, 158, 255, 0.045)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // progress arc
    if (view > 0.01) {
      const a1 = a0 + (view / total) * Math.PI * 2;
      const arcGrad = ctx.createLinearGradient(cx - RING_R, cy, cx + RING_R, cy);
      arcGrad.addColorStop(0, 'rgba(255, 200, 87, 0.1)');
      arcGrad.addColorStop(0.5, 'rgba(255, 200, 87, 0.55)');
      arcGrad.addColorStop(1, 'rgba(255, 79, 216, 0.3)');
      ctx.beginPath();
      ctx.arc(cx, cy, RING_R, a0, a1);
      ctx.strokeStyle = arcGrad;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    for (let i = 0; i < total; i++) {
      const a = a0 + (i / total) * Math.PI * 2;
      const x = cx + Math.cos(a) * RING_R;
      const y = cy + Math.sin(a) * RING_R;
      const isPast = i < view - 0.35;
      const isCurrent = i === Math.round(view);

      if (isPast) {
        ctx.beginPath();
        ctx.arc(x, y, 3.4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 200, 87, 0.82)';
        ctx.shadowColor = 'rgba(255, 200, 87, 0.8)';
        ctx.shadowBlur = 9;
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        ctx.beginPath();
        ctx.arc(x, y, 2.6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(154, 169, 255, 0.22)';
        ctx.fill();
      }

      if (isCurrent && S.stepsLeft > 0) {
        const pulse = 0.5 + 0.5 * Math.sin(now / 280);
        ctx.beginPath();
        ctx.arc(x, y, 7 + pulse * 2, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(92, 225, 255, ${0.35 + pulse * 0.3})`;
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, 4.4, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#5ce1ff';
        ctx.shadowBlur = 16;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      if (S.branchPoints.has(i)) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.PI / 4);
        ctx.strokeStyle = 'rgba(255, 79, 216, 0.95)';
        ctx.lineWidth = 1.4;
        ctx.strokeRect(-5.5, -5.5, 11, 11);
        ctx.restore();
      }
    }

    // playhead flare
    const pa = a0 + (view / total) * Math.PI * 2;
    const px = cx + Math.cos(pa) * RING_R;
    const py = cy + Math.sin(pa) * RING_R;
    ctx.beginPath();
    ctx.arc(px, py, 11, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 200, 87, 0.1)';
    ctx.fill();

    // labels
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(139, 147, 182, 0.7)';
    ctx.font = '600 9px "Cascadia Code", Consolas, monospace';
    ctx.letterSpacing = '3px';
    ctx.fillText('T I M E L I N E', cx, 74);
    ctx.font = '600 10px "Cascadia Code", Consolas, monospace';
    ctx.fillStyle = 'rgba(238, 240, 255, 0.8)';
    ctx.fillText(`STEP ${String(used).padStart(2, '0')} / ${String(total).padStart(2, '0')}`, cx, SIZE - 56);
    ctx.fillStyle = 'rgba(139, 147, 182, 0.55)';
    ctx.font = '500 9px "Cascadia Code", Consolas, monospace';
    ctx.fillText('每一颗光点都是一步 · 往回走需要时砂', cx, SIZE - 36);

    ctx.restore();
  }

  function drawBoardBase() {
    const x = BX - 16;
    const y = BY - 16;
    const w = BOARD_PX + 32;
    const h = BOARD_PX + 32;

    ctx.save();
    roundRectPath(x, y, w, h, 20);
    ctx.fillStyle = 'rgba(7, 9, 19, 0.76)';
    ctx.fill();
    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, 'rgba(120, 140, 255, 0.35)');
    grad.addColorStop(0.5, 'rgba(120, 140, 255, 0.1)');
    grad.addColorStop(1, 'rgba(255, 79, 216, 0.22)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();

    // corner brackets
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 200, 87, 0.5)';
    ctx.lineWidth = 2;
    const L = 18;
    const corners = [
      [x, y, 1, 1],
      [x + w, y, -1, 1],
      [x, y + h, 1, -1],
      [x + w, y + h, -1, -1],
    ];
    for (const [cx, cy, sx, sy] of corners) {
      ctx.beginPath();
      ctx.moveTo(cx + sx * 4, cy + sy * (4 + L));
      ctx.lineTo(cx + sx * 4, cy + sy * 4);
      ctx.lineTo(cx + sx * (4 + L), cy + sy * 4);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCells(now) {
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const x = BX + c * CELL;
        const y = BY + r * CELL;
        roundRectPath(x + 3, y + 3, CELL - 6, CELL - 6, 10);
        ctx.fillStyle = (r + c) % 2 === 0 ? 'rgba(255,255,255,0.026)' : 'rgba(255,255,255,0.012)';
        ctx.fill();

        if (S.hover && S.hover.r === r && S.hover.c === c) {
          roundRectPath(x + 3, y + 3, CELL - 6, CELL - 6, 10);
          ctx.strokeStyle = 'rgba(92, 225, 255, 0.45)';
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }

        if (S.selected && S.selected.r === r && S.selected.c === c) {
          const pulse = 0.5 + 0.5 * Math.sin(now / 180);
          roundRectPath(x + 2, y + 2, CELL - 4, CELL - 4, 11);
          ctx.fillStyle = `rgba(255, 200, 87, ${0.08 + pulse * 0.06})`;
          ctx.fill();
          ctx.strokeStyle = `rgba(255, 200, 87, ${0.6 + pulse * 0.3})`;
          ctx.lineWidth = 1.6;
          ctx.stroke();
        }
      }
    }
  }

  function drawGem(g, now) {
    if (!g) return;
    const def = TYPE_DEFS[g.type];
    const px = BX + (g.x + 0.5) * CELL;
    const py = BY + (g.y + 0.5) * CELL;
    const isSel =
      S.selected &&
      Math.round(g.x) === S.selected.c &&
      Math.round(g.y) === S.selected.r;
    const pulse = isSel ? 0.05 * Math.sin(now / 150) : 0;
    const scale = (g.scale == null ? 1 : g.scale) * (1 + pulse);
    const s = 21.5;

    ctx.save();
    ctx.globalAlpha = g.alpha == null ? 1 : g.alpha;
    ctx.translate(px, py);
    ctx.rotate(g.rot || 0);
    ctx.scale(scale, scale);

    ctx.shadowColor = def.color;
    ctx.shadowBlur = isSel ? 22 : 9;

    shapePath(g.type, s);
    const grad = ctx.createLinearGradient(-s, -s, s, s);
    grad.addColorStop(0, def.light);
    grad.addColorStop(0.36, def.color);
    grad.addColorStop(1, def.dark);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.shadowBlur = 0;

    // glass gloss: clip to the gem, then lay sheen + bounce light inside
    ctx.save();
    shapePath(g.type, s);
    ctx.clip();

    const sheen = ctx.createLinearGradient(0, -s, 0, s * 0.55);
    sheen.addColorStop(0, 'rgba(255, 255, 255, 0.52)');
    sheen.addColorStop(0.34, 'rgba(255, 255, 255, 0.15)');
    sheen.addColorStop(0.72, 'rgba(255, 255, 255, 0.03)');
    sheen.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(-s, -s, s * 2, s * 2);

    const bloom = ctx.createRadialGradient(
      -s * 0.34, -s * 0.44, s * 0.04,
      -s * 0.34, -s * 0.44, s * 1.1
    );
    bloom.addColorStop(0, 'rgba(255, 255, 255, 0.34)');
    bloom.addColorStop(0.4, 'rgba(255, 255, 255, 0.05)');
    bloom.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = bloom;
    ctx.fillRect(-s, -s, s * 2, s * 2);

    const bounce = ctx.createLinearGradient(0, s * 0.25, 0, s);
    bounce.addColorStop(0, 'rgba(255, 255, 255, 0)');
    bounce.addColorStop(0.72, 'rgba(255, 255, 255, 0.015)');
    bounce.addColorStop(1, def.light + '2e');
    ctx.fillStyle = bounce;
    ctx.fillRect(-s, -s, s * 2, s * 2);

    // tight specular + pinpoint
    ctx.beginPath();
    ctx.ellipse(-s * 0.3, -s * 0.4, s * 0.28, s * 0.11, -0.55, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
    ctx.shadowColor = 'rgba(255, 255, 255, 0.7)';
    ctx.shadowBlur = 7;
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.beginPath();
    ctx.arc(-s * 0.5, -s * 0.5, s * 0.045, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.fill();
    ctx.restore();

    // polished rim, brightest along the top edge
    shapePath(g.type, s);
    const rim = ctx.createLinearGradient(0, -s, 0, s);
    rim.addColorStop(0, 'rgba(255, 255, 255, 0.72)');
    rim.addColorStop(0.42, 'rgba(255, 255, 255, 0.13)');
    rim.addColorStop(0.78, 'rgba(255, 255, 255, 0.2)');
    rim.addColorStop(1, 'rgba(255, 255, 255, 0.4)');
    ctx.strokeStyle = rim;
    ctx.lineWidth = 1.35;
    ctx.stroke();

    // inner glyph for readability
    ctx.strokeStyle = 'rgba(12, 12, 24, 0.28)';
    ctx.fillStyle = 'rgba(12, 12, 24, 0.28)';
    ctx.lineWidth = 1.4;
    if (g.type === 0) {
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(6, 0);
      ctx.lineTo(0, 7);
      ctx.lineTo(-6, 0);
      ctx.closePath();
      ctx.stroke();
    } else if (g.type === 1) {
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.stroke();
    } else if (g.type === 2) {
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.fill();
    } else if (g.type === 3) {
      ctx.save();
      ctx.rotate(Math.PI / 4);
      ctx.strokeRect(-5.5, -5.5, 11, 11);
      ctx.restore();
    } else if (g.type === 4) {
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.bezierCurveTo(5, -2, 5, 5, 0, 7);
      ctx.bezierCurveTo(-5, 5, -5, -2, 0, -8);
      ctx.stroke();
    }

    if (g.special) {
      ctx.save();
      ctx.rotate(now / 900);
      ctx.beginPath();
      ctx.arc(0, 0, s + 4.5, 0, Math.PI * 2);
      ctx.setLineDash([4, 5]);
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = 'rgba(255, 240, 190, 0.9)';
      ctx.shadowColor = '#ffd76e';
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.restore();
      ctx.setLineDash([]);

      // tiny hourglass
      ctx.save();
      ctx.fillStyle = 'rgba(255, 248, 220, 0.95)';
      ctx.beginPath();
      ctx.moveTo(-5, -7);
      ctx.lineTo(5, -7);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-5, 7);
      ctx.lineTo(5, 7);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(-5.6, -8.4, 11.2, 1.4);
      ctx.fillRect(-5.6, 7, 11.2, 1.4);
      ctx.restore();
    }

    ctx.restore();

    if (isSel) {
      ctx.save();
      ctx.translate(px, py);
      ctx.strokeStyle = 'rgba(255, 200, 87, 0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, s + 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawLocks(now) {
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const g = S.board[r][c];
        if (!g || !g.lock) continue;
        const px = BX + (g.x + 0.5) * CELL;
        const py = BY + (g.y + 0.5) * CELL;
        const pulse = 0.68 + 0.32 * Math.sin(now / 330 + r * 0.7 + c * 0.5);
        const half = CELL * 0.43;
        const q = half - 1;
        const arm = CELL * 0.17;

        ctx.save();
        ctx.translate(px, py);

        // frosted glass over the locked gem
        roundRectPath(-half, -half, half * 2, half * 2, 12);
        ctx.fillStyle = 'rgba(7, 20, 38, 0.4)';
        ctx.fill();
        ctx.strokeStyle = `rgba(190, 240, 255, ${0.42 + pulse * 0.22})`;
        ctx.lineWidth = 1.8;
        ctx.stroke();

        // icy corner brackets
        ctx.strokeStyle = `rgba(210, 246, 255, ${0.72 + pulse * 0.26})`;
        ctx.lineWidth = 3;
        ctx.lineCap = 'square';
        ctx.beginPath();
        ctx.moveTo(-q, -q + arm);
        ctx.lineTo(-q, -q);
        ctx.lineTo(-q + arm, -q);
        ctx.moveTo(q - arm, -q);
        ctx.lineTo(q, -q);
        ctx.lineTo(q, -q + arm);
        ctx.moveTo(q, q - arm);
        ctx.lineTo(q, q);
        ctx.lineTo(q - arm, q);
        ctx.moveTo(-q + arm, q);
        ctx.lineTo(-q, q);
        ctx.lineTo(-q, q - arm);
        ctx.stroke();

        // crossed chains, drawn as links
        ctx.strokeStyle = `rgba(214, 245, 255, ${0.42 + pulse * 0.2})`;
        ctx.lineWidth = 1.8;
        const steps = 5;
        for (let i = 0; i < steps; i++) {
          const t = (i + 0.5) / steps;
          const x = -CELL * 0.32 + t * CELL * 0.64;
          ctx.beginPath();
          ctx.ellipse(x, x, 4.4, 2.6, Math.PI / 4, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.ellipse(x, -x, 4.4, 2.6, -Math.PI / 4, 0, Math.PI * 2);
          ctx.stroke();
        }

        // large padlock badge in the middle
        const badge = Math.max(10, CELL * 0.21);
        ctx.beginPath();
        ctx.arc(0, 0, badge, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(5, 14, 26, 0.92)';
        ctx.fill();
        ctx.strokeStyle = `rgba(205, 246, 255, ${0.82 + pulse * 0.18})`;
        ctx.lineWidth = 1.8;
        ctx.stroke();

        ctx.strokeStyle = '#e9faff';
        ctx.lineWidth = Math.max(1.8, badge * 0.17);
        ctx.beginPath();
        ctx.arc(0, -badge * 0.26, badge * 0.4, Math.PI, 0);
        ctx.stroke();
        ctx.fillStyle = '#e9faff';
        roundRectPath(-badge * 0.52, -badge * 0.02, badge * 1.04, badge * 0.58, badge * 0.16);
        ctx.fill();
        ctx.fillStyle = '#07111e';
        ctx.beginPath();
        ctx.arc(0, badge * 0.26, badge * 0.12, 0, Math.PI * 2);
        ctx.fill();

        // remaining hp pips, top-left
        for (let i = 0; i < g.lock; i++) {
          ctx.beginPath();
          ctx.arc(-half + 8 + i * 7, -half + 8, 2.6, 0, Math.PI * 2);
          ctx.fillStyle = '#c9f1ff';
          ctx.fill();
        }

        // red countdown ring for timed locks
        if (g.lockTimer > 0) {
          const frac = clamp(g.lockTimer / 6, 0, 1);
          ctx.beginPath();
          ctx.arc(0, 0, half - 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
          ctx.strokeStyle = `rgba(255, 107, 107, ${0.75 + pulse * 0.25})`;
          ctx.lineWidth = 3;
          ctx.lineCap = 'butt';
          ctx.stroke();
          ctx.font = `700 ${Math.max(9, CELL * 0.18)}px "Bahnschrift", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#ffb1b1';
          ctx.shadowColor = '#ff4d4d';
          ctx.shadowBlur = 8;
          ctx.fillText(g.lockTimer, 0, half - 10);
          ctx.shadowBlur = 0;
        }

        ctx.restore();
      }
    }
  }

  function ensureCrackArt(r, c) {
    const k = pkey(r, c);
    if (!S.crackArt[k]) S.crackArt[k] = genCrackArt(r, c);
    return S.crackArt[k];
  }

  function genCrackArt(r, c) {
    let s = ((r * 97 + c * 57 + 13) >>> 0) || 7;
    const rand = () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
    const cx = CELL / 2;
    const cy = CELL / 2;
    const lines = [];
    for (let i = 0; i < 5; i++) {
      const ang = rand() * Math.PI * 2;
      const pts = [[cx + (rand() - 0.5) * 4, cy + (rand() - 0.5) * 4]];
      let x = pts[0][0];
      let y = pts[0][1];
      for (let k = 1; k <= 3; k++) {
        const a = ang + (rand() - 0.5) * 1.1;
        x += Math.cos(a) * (6 + rand() * 8);
        y += Math.sin(a) * (6 + rand() * 8);
        pts.push([x, y]);
      }
      lines.push(pts);
    }
    return lines;
  }

  function drawCracks(now) {
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (!S.cracks[r][c]) continue;
        const x = BX + c * CELL;
        const y = BY + r * CELL;
        const art = ensureCrackArt(r, c);
        const pulse = 0.65 + 0.35 * Math.sin(now / 420 + r * 0.7 + c * 0.5);

        ctx.save();
        ctx.translate(x, y);
        roundRectPath(4, 4, CELL - 8, CELL - 8, 10);
        ctx.clip();

        ctx.fillStyle = `rgba(26, 4, 34, ${0.26 + pulse * 0.12})`;
        ctx.fillRect(0, 0, CELL, CELL);

        ctx.shadowColor = '#ff4fd8';
        ctx.shadowBlur = 8 + pulse * 6;
        ctx.strokeStyle = `rgba(255, 92, 226, ${0.55 + pulse * 0.35})`;
        ctx.lineWidth = 1.25;
        for (const pts of art) {
          ctx.beginPath();
          ctx.moveTo(pts[0][0], pts[0][1]);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
          ctx.stroke();
        }
        ctx.shadowBlur = 0;

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.32)';
        ctx.lineWidth = 0.7;
        for (const pts of art) {
          ctx.beginPath();
          ctx.moveTo(pts[0][0], pts[0][1]);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
          ctx.stroke();
        }

        // warning tag
        ctx.fillStyle = `rgba(255, 79, 216, ${0.6 + pulse * 0.3})`;
        ctx.beginPath();
        ctx.arc(CELL - 12, 12, 2.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }
    }
  }

  function drawHint(now) {
    if (!S.hint || !S.hint.move || S.state !== 'idle') return;
    const { a, b } = S.hint.move;
    const pulse = 0.5 + 0.5 * Math.sin(now / 260);
    for (const cell of [a, b]) {
      const x = BX + (cell.c + 0.5) * CELL;
      const y = BY + (cell.r + 0.5) * CELL;
      ctx.beginPath();
      ctx.arc(x, y, 25 + pulse * 3, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 200, 87, ${0.16 + pulse * 0.22})`;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function drawFreezeOverlay(now) {
    if (!S.freeze || !S.freeze.active) return;
    const cx = SIZE / 2;
    const cy = SIZE / 2;
    const remain = clamp((S.freeze.end - now) / S.freeze.duration, 0, 1);

    ctx.save();
    ctx.beginPath();
    roundRectPath(BX - 12, BY - 12, BOARD_PX + 24, BOARD_PX + 24, 20);
    ctx.fillStyle = 'rgba(64, 180, 230, 0.055)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(140, 235, 255, 0.35)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, BOARD_PX / 2 + 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * remain);
    ctx.strokeStyle = 'rgba(92, 225, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#5ce1ff';
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // frost corners
    ctx.strokeStyle = 'rgba(190, 245, 255, 0.35)';
    ctx.lineWidth = 1;
    const corners = [
      [BX - 6, BY - 6, 1, 1],
      [BX + BOARD_PX + 6, BY - 6, -1, 1],
      [BX - 6, BY + BOARD_PX + 6, 1, -1],
      [BX + BOARD_PX + 6, BY + BOARD_PX + 6, -1, -1],
    ];
    for (const [x, y, sx, sy] of corners) {
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + sx * (16 + i * 9), y + sy * (30 - i * 7));
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawEffects() {
    for (const p of particles) {
      const alpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.5 + alpha * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const f of floats) {
      const alpha = clamp(f.life / f.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${f.size}px "Bahnschrift", "Arial Narrow", sans-serif`;
      ctx.fillStyle = f.color;
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 10;
      ctx.fillText(f.text, f.x, f.y);
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
  }

  function draw(now) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, SIZE, SIZE);

    drawBackground(now);

    ctx.save();
    if (S.shake > 0.2) {
      ctx.translate((Math.random() - 0.5) * S.shake, (Math.random() - 0.5) * S.shake);
    }

    drawTimeline(now);
    drawBoardBase();

    ctx.save();
    roundRectPath(BX, BY, BOARD_PX, BOARD_PX, 14);
    ctx.clip();
    drawCells(now);

    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const g = S.board[r][c];
        if (g) drawGem(g, now);
      }
    }

    drawCracks(now);
    drawLocks(now);
    drawHint(now);
    drawFreezeOverlay(now);
    ctx.restore();

    drawEffects();
    ctx.restore();
  }

  /* ---------------------------------------------------------
     Effects
     --------------------------------------------------------- */
  let particles = [];
  let floats = [];

  function spawnBurst(r, c, color, count = 10, power = 1) {
    const x = BX + (c + 0.5) * CELL;
    const y = BY + (r + 0.5) * CELL;
    for (let i = 0; i < count; i++) {
      const a = rnd() * Math.PI * 2;
      const sp = (40 + rnd() * 150) * power;
      particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 20,
        life: 0.35 + rnd() * 0.5,
        maxLife: 0.85,
        size: 1.5 + rnd() * 3,
        color,
      });
    }
    if (particles.length > 500) particles.splice(0, particles.length - 500);
  }

  function floatTextAt(r, c, text, color = '#fff', size = 18, dy = 0) {
    floats.push({
      x: BX + (c + 0.5) * CELL,
      y: BY + (r + 0.5) * CELL + dy * CELL,
      text,
      color,
      size,
      life: 0.9,
      maxLife: 0.9,
    });
    if (floats.length > 80) floats.splice(0, floats.length - 80);
  }

  function confetti() {
    for (let i = 0; i < 140; i++) {
      const x = SIZE * 0.5 + (rnd() - 0.5) * 300;
      const y = SIZE * 0.34 + rnd() * 80;
      const a = rnd() * Math.PI * 2;
      const sp = 80 + rnd() * 280;
      particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 140,
        life: 0.9 + rnd() * 1.1,
        maxLife: 2,
        size: 2 + rnd() * 4,
        color: pick(['#ffc857', '#ff4fd8', '#5ce1ff', '#9d7bff', '#ffffff']),
      });
    }
  }

  const tweens = [];

  function tween(obj, to, dur, ease = (t) => 1 - Math.pow(1 - t, 3)) {
    const d = Math.max(1, dur * Math.min(1, SPEED));
    if (SPEED <= 0.06 || d < 4) {
      Object.assign(obj, to);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      tweens.push({
        obj,
        from: { ...to },
        to,
        dur: d,
        t0: performance.now(),
        ease,
        resolve,
      });
      // from values must be captured after adding; fix below
      const tw = tweens[tweens.length - 1];
      tw.from = {};
      for (const k in to) tw.from[k] = obj[k] == null ? 0 : obj[k];
    });
  }

  function updateTweens(now) {
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      const t = clamp((now - tw.t0) / tw.dur, 0, 1);
      const e = tw.ease(t);
      for (const k in tw.to) {
        tw.obj[k] = lerp(tw.from[k], tw.to[k], e);
      }
      if (t >= 1) {
        for (const k in tw.to) tw.obj[k] = tw.to[k];
        tweens.splice(i, 1);
        tw.resolve();
      }
    }
  }

  function updateEffects(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 420 * dt;
      p.vx *= 0.985;
    }
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      f.life -= dt;
      if (f.life <= 0) {
        floats.splice(i, 1);
        continue;
      }
      f.y -= 26 * dt;
    }
  }

  /* ---------------------------------------------------------
     Live UI loop
     --------------------------------------------------------- */
  function updateLiveUI(now, dt) {
    if (!S) return;

    const diff = S.score - S.displayScore;
    if (Math.abs(diff) < 1) S.displayScore = S.score;
    else S.displayScore += diff * Math.min(1, dt * 10);
    els.score.textContent = fmt(S.displayScore);

    const used = clamp(S.level.steps - S.stepsLeft, 0, S.level.steps);
    S.ringView += (used - S.ringView) * (1 - Math.exp(-dt * 7));

    if (S.freeze && S.freeze.active) {
      const remain = Math.max(0, S.freeze.end - now);
      els.freezeHud.classList.add('show');
      els.freezeSecs.textContent = `${(remain / 1000).toFixed(1)}s`;
      els.freezeBar.style.width = `${clamp((remain / S.freeze.duration) * 100, 0, 100)}%`;
    } else {
      els.freezeHud.classList.remove('show');
    }

    if (S.shake > 0) S.shake = Math.max(0, S.shake - 55 * dt);

    if (
      S.started &&
      S.state === 'idle' &&
      !modalOpen &&
      !S.busy &&
      now - S.lastAction > 4600
    ) {
      if (!S.hint || now - S.hint.at > 4400) {
        const move = findAnyMove();
        S.hint = move ? { move, at: now } : null;
      }
    } else if (S.state !== 'idle') {
      S.hint = null;
    }
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    updateTweens(now);
    updateEffects(dt);
    updateLiveUI(now, dt);
    draw(now);
    requestAnimationFrame(loop);
  }

  /* ---------------------------------------------------------
     Wire up UI events
     --------------------------------------------------------- */
  els.rewindBtn.addEventListener('click', () => {
    Sound.ensure();
    doRewind();
  });

  els.soundBtn.addEventListener('click', () => {
    Sound.ensure();
    toggleSound();
  });

  els.helpBtn.addEventListener('click', () => {
    Sound.ensure();
    Sound.click();
    openHelp();
  });

  els.tutorialBtn.addEventListener('click', () => {
    Sound.ensure();
    Sound.click();
    closeModal();
    initGame(0);
    openIntro();
  });

  els.coachOk.addEventListener('click', () => {
    hideCoach();
  });

  els.toolShuffle.addEventListener('click', () => {
    Sound.ensure();
    useShuffle();
  });
  els.toolCol.addEventListener('click', () => {
    Sound.ensure();
    beginLineTool('col');
  });
  els.toolRow.addEventListener('click', () => {
    Sound.ensure();
    beginLineTool('row');
  });

  els.modalCard.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    Sound.ensure();
    Sound.click();
    if (action === 'start') {
      closeModal();
      S.started = true;
      S.lastAction = performance.now();
      if (S.level.tutorial) {
        showCoach('校准开始', '先拖动两个相邻方块，凑齐三个同色。消除后我们再学时砂和倒带。');
        showBanner('目标：完成校准', '交换、倒带、拆掉 1 把时间锁', 'amber', 2000);
      } else {
        showBanner('目标：活过这条时间线', `${S.level.steps} 步 · ${fmt(S.level.target)} 分`, 'amber', 1600);
      }
      syncHUD();
    } else if (action === 'skip-tutorial') {
      markTutorialDone();
      closeModal();
      initGame(1);
      toast('教学已跳过 · 进入记忆碎片 01');
    } else if (action === 'close') {
      closeModal();
    } else if (action === 'restart-confirm') {
      restartLevel();
    } else if (action === 'replay') {
      restartLevel();
    } else if (action === 'loop') {
      closeModal();
      initGame(1);
      toast('时间线重置 · 从第一块碎片重新开始');
    } else if (action === 'next') {
      nextLevel();
    } else if (action === 'rewind') {
      doRewind();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === 'z') {
      e.preventDefault();
      Sound.ensure();
      doRewind();
    } else if (k === 'r') {
      if (!modalOpen) openRestartConfirm();
    } else if (k === 'h') {
      if (!modalOpen) openHelp();
    } else if (k === 'm') {
      toggleSound();
    } else if (k === 'escape') {
      if (S && S.toolMode) {
        S.toolMode = null;
        syncHUD();
      } else if (modalOpen) {
        closeModal();
      }
    }
  });

  window.addEventListener('blur', () => {
    if (S) S.drag = null;
  });

  /* ---------------------------------------------------------
     Test / debug hooks
     --------------------------------------------------------- */
  async function waitIdle(timeout = 10000) {
    const t0 = performance.now();
    while (
      S &&
      (S.busy || S.state === 'anim' || S.state === 'rewind' || S.state === 'freeze') &&
      performance.now() - t0 < timeout
    ) {
      await sleep(25);
    }
    return S ? S.state : 'none';
  }

  window.__rw = {
    get state() {
      return S;
    },
    levels: LEVELS,
    initGame,
    setSpeed(v) {
      SPEED = clamp(Number(v) || 1, 0.04, 1);
    },
    snapshot,
    findMatches: () => findMatches(),
    findAnyMove,
    hasValidMove,
    locksLeft: () => (S ? locksLeft() : 0),
    goalsMet: () => (S ? goalsMet() : false),
    waitIdle,
    async move(a, b) {
      await attemptMove({ r: a.r, c: a.c }, { r: b.r, c: b.c });
      await waitIdle();
      return S ? S.state : 'none';
    },
    async autoMove() {
      if (!S || S.state !== 'idle' || S.busy) return false;
      const m = findAnyMove();
      if (!m) return false;
      await attemptMove(m.a, m.b);
      await waitIdle();
      return true;
    },
    rewind: doRewind,
    restart: restartLevel,
    result: showResult,
    async demoFreeze(ms = 3000) {
      if (!S) return;
      await runFreeze(ms);
      if (S.state === 'anim') {
        S.state = 'idle';
        S.busy = false;
        syncHUD();
      }
    },
    validate() {
      const errs = [];
      if (!S) return ['no state'];
      if (S.board.length !== N) errs.push('board rows');
      for (let r = 0; r < N; r++) {
        if (!S.board[r] || S.board[r].length !== N) errs.push(`row ${r} length`);
        for (let c = 0; c < N; c++) {
          const g = S.board[r] && S.board[r][c];
          if (!g) {
            errs.push(`empty cell ${r},${c}`);
            continue;
          }
          if (S.state === 'idle' && (Math.round(g.x) !== c || Math.round(g.y) !== r)) {
            errs.push(`coord mismatch ${r},${c}`);
          }
        }
      }
      if (['idle', 'won', 'lost'].includes(S.state) && findMatches().length) {
        errs.push(`matches on settled board: ${findMatches().length}`);
      }
      return errs;
    },
  };

  /* ---------------------------------------------------------
     Boot
     --------------------------------------------------------- */
  initGame(tutorialDone() ? 1 : 0);
  try {
    const savedSound = localStorage.getItem('rw_sound_v1');
    if (savedSound === '0') {
      Sound.enabled = false;
      els.soundBtn.classList.add('muted');
      els.soundBtn.textContent = '♪ 静音';
    }
  } catch (e) {
    /* noop */
  }
  openIntro();
  requestAnimationFrame(loop);

  // Warm the audio graph on the first real gesture (mobile autoplay rules).
  window.addEventListener(
    'pointerdown',
    () => {
      Sound.ensure();
    },
    { once: true }
  );
})();
