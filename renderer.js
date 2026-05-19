// ============================================================
// 桌面音频可视化器 — 渲染进程
// ============================================================

const canvas = document.getElementById('visualizer');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const btnStyle = document.getElementById('btn-style');
const btnTheme = document.getElementById('btn-theme');
const btnPassthrough = document.getElementById('btn-passthrough');

// --- State ---
let audioCtx = null, analyser = null, source = null, animationId = null;
let audioReady = false, currentStyle = 0, currentTheme = 0, passthrough = false;
let particles = [];
const MAX_PARTICLES = 80;

// --- Themes (flatter, clean) ---
const themes = [
  { name: '霓虹紫', bar: '#b57bee', barGlow: '#a259ff', barLow: '#5c3d8f', particle: '#c9a0ff', bg: 'transparent' },
  { name: '青蓝',   bar: '#2dd4bf', barGlow: '#5eead4', barLow: '#115e59', particle: '#99f6e4', bg: 'transparent' },
  { name: '火焰',   bar: '#fb923c', barGlow: '#fdba74', barLow: '#7c2d12', particle: '#fed7aa', bg: 'transparent' },
  { name: '翠绿',   bar: '#4ade80', barGlow: '#86efac', barLow: '#14532d', particle: '#bbf7d0', bg: 'transparent' },
  { name: '粉金',   bar: '#f472b6', barGlow: '#fbcfe8', barLow: '#831843', particle: '#fce7f3', bg: 'transparent' },
];
const styleNames = ['经典频谱', '镜像频谱', '波形+粒子', '圆环频谱'];

// --- Resize ---
function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.addEventListener('resize', resize);
resize();

// --- Clean minimal particle ---
class StarParticle {
  constructor(x, y, color) {
    this.x = x; this.y = y;
    this.vx = (Math.random() - 0.5) * 1.6;
    this.vy = -Math.random() * 1.8 - 0.4;
    this.life = 1;
    this.decay = 0.006 + Math.random() * 0.018;
    this.size = 0.8 + Math.random() * 2.2;
    this.color = color;
    this.twinkle = Math.random() * Math.PI * 2;
    this.twinkleSpeed = 0.06 + Math.random() * 0.1;
  }
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += 0.004;
    this.twinkle += this.twinkleSpeed;
    this.life -= this.decay;
  }
  draw(ctx) {
    const a = this.life * (0.6 + 0.4 * Math.sin(this.twinkle));
    const sz = this.size * this.life;
    if (sz < 0.2 || a < 0.02) return;
    ctx.globalAlpha = a;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, sz, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  get dead() { return this.life <= 0; }
}

// --- Audio ---
async function startAudio() {
  if (audioReady) return;
  statusEl.innerHTML = '请求权限中…';
  try {
    let stream;
    if (window.electronAPI) {
      const sourceId = await window.electronAPI.getAudioSourceId();
      if (sourceId) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId } },
          video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId, minWidth: 1, maxWidth: 1, minHeight: 1, maxHeight: 1 } },
        });
      }
    }
    if (!stream) { stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }); }
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) throw new Error('无音频轨道');
    stream.getVideoTracks().forEach(t => t.stop());
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    source = audioCtx.createMediaStreamSource(new MediaStream(audioTracks));
    source.connect(analyser);
    audioReady = true;
    statusEl.classList.add('hidden');
  } catch (err) {
    statusEl.innerHTML = '获取失败，点击重试';
    console.error(err);
  }
}

// --- Animation ---
function animate() {
  animationId = requestAnimationFrame(animate);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!audioReady) return;

  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  const w = canvas.width, h = canvas.height, t = themes[currentTheme];

  switch (currentStyle) {
    case 0: drawCenteredSpectrum(data, w, h, t); break;
    case 1: drawMirroredSpectrum(data, w, h, t); break;
    case 2: drawWaveWithParticles(data, w, h, t); break;
    case 3: drawCircularSpectrum(data, w, h, t); break;
  }
  drawParticles();
}

// --- Style 0: Centered spectrum (middle = highest) ---
function drawCenteredSpectrum(data, w, h, t) {
  const n = 60;
  const step = Math.floor(data.length / n);
  const barW = (w / n) * 0.65;
  const gap = (w / n) * 0.35;
  const maxH = h * 0.75;
  const baseY = h - 10;
  const mid = Math.floor(n / 2);

  for (let i = 0; i < n; i++) {
    // Mirror: lower index = lower freq, map to center-symmetric
    const distFromCenter = Math.abs(i - mid);
    const freqIdx = distFromCenter * step;
    const val = data[Math.min(freqIdx, data.length - 1)] / 255;
    const barH = Math.max(1.5, val * maxH);

    const x = i * (barW + gap) + gap / 2;

    // Clean flat style: single color based on height
    ctx.fillStyle = val > 0.55 ? t.barGlow : val > 0.25 ? t.bar : t.barLow;
    ctx.beginPath();
    ctx.moveTo(x, baseY - barH);
    ctx.lineTo(x + barW, baseY - barH);
    ctx.lineTo(x + barW, baseY);
    ctx.lineTo(x, baseY);
    ctx.closePath();
    ctx.fill();

    if (val > 0.4) spawnStar(x + barW / 2, baseY - barH, t.particle, val);
  }
}

// --- Style 1: Mirrored (center-symmetric) ---
function drawMirroredSpectrum(data, w, h, t) {
  const n = 40;
  const step = Math.floor(data.length / n);
  const barW = (w / n) * 0.55;
  const gap = (w / n) * 0.45;
  const maxH = h * 0.38;
  const midY = h / 2;
  const mid = Math.floor(n / 2);

  for (let i = 0; i < n; i++) {
    const distFromCenter = Math.abs(i - mid);
    const freqIdx = distFromCenter * step;
    const val = data[Math.min(freqIdx, data.length - 1)] / 255;
    const barH = Math.max(1.5, val * maxH);
    const x = i * (barW + gap) + gap / 2;

    ctx.fillStyle = val > 0.55 ? t.barGlow : val > 0.25 ? t.bar : t.barLow;

    // Top
    ctx.fillRect(x, midY - barH - 2, barW, barH);
    // Bottom
    ctx.fillRect(x, midY + 2, barW, barH);

    if (val > 0.3) {
      spawnStar(x + barW / 2, midY - barH - 2, t.particle, val);
      spawnStar(x + barW / 2, midY + barH + 2, t.particle, val);
    }
  }
}

// --- Style 2: Waveform ---
function drawWaveWithParticles(data, w, h, t) {
  const midY = h / 2;
  const td = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(td);

  // Flat waveform line
  ctx.beginPath();
  ctx.strokeStyle = t.barGlow;
  ctx.lineWidth = 1.5;
  ctx.shadowBlur = 0;
  const sw = w / td.length;
  let x = 0;
  for (let i = 0; i < td.length; i++) {
    const y = ((td[i] / 128 - 1) * midY * 0.75) + midY;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    x += sw;
  }
  ctx.stroke();

  // Subtle under-line
  ctx.beginPath();
  ctx.strokeStyle = t.barGlow;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.12;
  x = 0;
  for (let i = 0; i < td.length; i++) {
    const y = ((td[i] / 128 - 1) * midY * 0.75) + midY;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    x += sw;
  }
  ctx.stroke();
  ctx.globalAlpha = 1;

  for (let i = 0; i < data.length; i += 2) {
    const val = data[i] / 255;
    if (val > 0.45 && Math.random() < val * 0.25) {
      spawnStar((i / data.length) * w, midY - (val * midY * 0.65), t.particle, val);
    }
  }
}

// --- Style 3: Circular ---
function drawCircularSpectrum(data, w, h, t) {
  const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.38;
  const n = 72;
  const step = Math.floor(data.length / n);
  const as = (Math.PI * 2) / n;

  for (let i = 0; i < n; i++) {
    const val = data[i * step] / 255;
    const barLen = 5 + val * r * 0.32;
    const a = i * as - Math.PI / 2;
    const x1 = cx + Math.cos(a) * (r * 0.28);
    const y1 = cy + Math.sin(a) * (r * 0.28);
    const x2 = cx + Math.cos(a) * (r * 0.28 + barLen);
    const y2 = cy + Math.sin(a) * (r * 0.28 + barLen);

    ctx.strokeStyle = val > 0.55 ? t.barGlow : val > 0.25 ? t.bar : t.barLow;
    ctx.lineWidth = val > 0.5 ? 2 : 1.5;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();

    if (val > 0.45 && Math.random() < val * 0.18) spawnStar(x2, y2, t.particle, val);
  }
  // Center dot
  ctx.fillStyle = t.barGlow;
  ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI * 2); ctx.fill();
  // Rings
  ctx.strokeStyle = t.barLow;
  ctx.globalAlpha = 0.25;
  ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.28, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.72, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;
}

// --- Stars ---
function spawnStar(x, y, color, intensity) {
  const count = Math.floor(intensity * 2) + 1;
  for (let i = 0; i < count; i++) {
    if (particles.length < MAX_PARTICLES) {
      particles.push(new StarParticle(
        Math.random() * canvas.width,
        canvas.height * 0.1 + Math.random() * canvas.height * 0.7,
        color
      ));
    }
  }
}

function drawParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.update();
    if (p.dead) { particles.splice(i, 1); continue; }
    p.draw(ctx);
  }
  ctx.globalAlpha = 1;
}

// --- Controls ---
btnStyle.addEventListener('click', () => {
  currentStyle = (currentStyle + 1) % styleNames.length;
  btnStyle.textContent = 'S' + (currentStyle + 1);
  btnStyle.title = '样式: ' + styleNames[currentStyle] + ' (S)';
  particles = [];
});

btnTheme.addEventListener('click', () => {
  currentTheme = (currentTheme + 1) % themes.length;
  btnTheme.title = '主题: ' + themes[currentTheme].name + ' (T)';
});

btnPassthrough.addEventListener('click', () => {
  passthrough = !passthrough;
  btnPassthrough.classList.toggle('active', passthrough);
  if (window.electronAPI) window.electronAPI.togglePassthrough(passthrough);
});

if (window.electronAPI && window.electronAPI.onPassthroughChanged) {
  window.electronAPI.onPassthroughChanged((enabled) => {
    passthrough = enabled;
    btnPassthrough.classList.toggle('active', enabled);
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key === 's' || e.key === 'S') btnStyle.click();
  if (e.key === 't' || e.key === 'T') btnTheme.click();
});

document.body.addEventListener('click', (e) => {
  if (!audioReady && e.target !== btnStyle && e.target !== btnTheme && e.target !== btnPassthrough) {
    startAudio();
  }
});
statusEl.addEventListener('click', (e) => {
  if (!audioReady) { e.stopPropagation(); startAudio(); }
});

animate();

