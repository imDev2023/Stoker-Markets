/**
 * The stoke (#133, hero candidate D): the heating ring drawn on a canvas, from dark coal through a dull red to the
 * heat ramp, with its bloom swelling as it heats and a few embers rising off it, then cooling back, in a slow loop.
 * The geometry is the mark's (`Mark.tsx`: a ring of radius 8.6 with a 4.2 stroke on a 32-unit box) and the ramp is
 * the mark's fixed one, so the ring at full heat is the `Ring` at the same size. Framework-free, so the review page
 * runs the same loop; `Stoke.tsx` mounts it and shows the still ring under `prefers-reduced-motion`.
 */

/** One stoke: the ring heats, holds at full heat, and cools, then again. */
export const STOKE_PERIOD_MS = 12_000;
/** Room above the ring for the embers to rise into, as a share of the ring's size. */
export const STOKE_HEADROOM = 0.3;

type Rgb = readonly [number, number, number];

/** The mark's ramp: amber at the top right, ember at the bottom left. */
const AMBER: Rgb = [0xff, 0xb0, 0x20];
const EMBER: Rgb = [0xff, 0x5a, 0x1f];
/** Coal, and the dull red it passes through on the way to heat. */
const COAL: Rgb = [0x2a, 0x22, 0x1f];
const GLOW: Rgb = [0x8a, 0x2c, 0x12];

const RING_RADIUS = 8.6 / 32;
const RING_STROKE = 4.2 / 32;

/** The three phases of one period, as shares of it: the heating, the hold at full heat, the cooling. */
const RISE = 0.36;
const HOLD = 0.4;

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rgba = ([r, g, b]: Rgb, alpha = 1) => `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
const smooth = (t: number) => t * t * (3 - 2 * t);

/** How hot the ring is at a point in the period, 0 coal to 1 the ramp. */
export function heatAt(phase: number) {
  if (phase < RISE) return smooth(phase / RISE);
  if (phase < RISE + HOLD) return 1;
  return 1 - smooth((phase - RISE - HOLD) / (1 - RISE - HOLD));
}

/** A ramp stop at a heat: coal, then the dull red, then the stop's own colour. */
function stopAt(stop: Rgb, heat: number): Rgb {
  return heat < 0.5 ? mix(COAL, GLOW, heat / 0.5) : mix(GLOW, stop, (heat - 0.5) / 0.5);
}

type Ember = { x: number; y: number; vx: number; vy: number; age: number; life: number; size: number; sway: number; tint: Rgb };

/**
 * Starts the loop on a canvas sized for a ring of `size` CSS pixels plus its headroom, and returns what stops it. The
 * clock is the frames' own (each step capped), so a tab brought back does not jump through the embers' lives.
 */
export function startStoke(canvas: HTMLCanvasElement, size: number): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = size;
  const height = Math.round(size * (1 + STOKE_HEADROOM));
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.scale(dpr, dpr);

  const cx = width / 2;
  const cy = height - size / 2;
  const radius = size * RING_RADIUS;
  const stroke = size * RING_STROKE;
  const outer = radius + stroke / 2;

  let embers: Ember[] = [];
  let elapsed = 0;
  let last: number | null = null;
  let spawnDebt = 0;
  let frame = 0;

  const spawn = (heat: number) => {
    const angle = -Math.PI * (0.15 + Math.random() * 0.7);
    const r = outer - stroke * Math.random() * 0.5;
    embers.push({
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
      vx: (Math.random() - 0.5) * size * 0.03,
      vy: -(0.05 + Math.random() * 0.06) * size * (0.7 + 0.3 * heat),
      age: 0,
      life: 2.2 + Math.random() * 1.8,
      size: size * (0.007 + Math.random() * 0.008),
      sway: Math.random() * Math.PI * 2,
      tint: Math.random() < 0.5 ? AMBER : EMBER,
    });
  };

  const draw = (dt: number) => {
    const phase = (elapsed % STOKE_PERIOD_MS) / STOKE_PERIOD_MS;
    const heat = heatAt(phase);
    ctx.clearRect(0, 0, width, height);

    // The ring: the ramp warms from coal; the bloom is the ring's own shadow, swelling with the heat.
    const ramp = ctx.createLinearGradient(cx - radius, cy + radius, cx + radius, cy - radius);
    ramp.addColorStop(0, rgba(stopAt(EMBER, heat)));
    ramp.addColorStop(1, rgba(stopAt(AMBER, heat)));
    ctx.lineWidth = stroke;
    ctx.strokeStyle = ramp;
    if (heat > 0.02) {
      ctx.save();
      ctx.shadowColor = rgba(mix(EMBER, AMBER, 0.35), 0.75 * heat);
      ctx.shadowBlur = stroke * 1.6 * heat;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = stroke * 0.6 * heat;
      ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    // The embers: a few at a time, rising off the top of the ring once it glows, swaying, fading out.
    if (heat > 0.35 && embers.length < 12) {
      spawnDebt += ((heat - 0.35) / 0.65) * 3 * dt;
      while (spawnDebt >= 1) {
        spawn(heat);
        spawnDebt -= 1;
      }
    } else spawnDebt = 0;
    embers = embers.filter((e) => e.age < e.life);
    for (const e of embers) {
      e.age += dt;
      e.x += (e.vx + Math.sin(e.sway + e.age * 2.2) * size * 0.012) * dt;
      e.y += e.vy * dt;
      const fade = 1 - e.age / e.life;
      const alpha = Math.min(1, e.age * 4) * fade * fade;
      ctx.save();
      ctx.fillStyle = rgba(e.tint, alpha);
      ctx.shadowColor = rgba(e.tint, alpha * 0.8);
      ctx.shadowBlur = e.size * 3;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.size * (0.7 + 0.3 * fade), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  };

  const tick = (now: number) => {
    const dt = last === null ? 0 : Math.min(0.05, (now - last) / 1000);
    last = now;
    elapsed += dt * 1000;
    draw(dt);
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}
