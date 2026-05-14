import type { KerbalSoul } from '../SoulLoader';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SpriteState =
  | 'idle'
  | 'walking'
  | 'typing'
  | 'stretching'
  | 'drinking'
  | 'entering'
  | 'leaving'
  | 'sleeping'
  | 'sitting'
  | 'reacting';

export interface SpriteFrame {
  state: SpriteState;
  frameIndex: number;
}

// Internal movement state
interface MovementState {
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  elapsed: number;
  duration: number;
}

// ---------------------------------------------------------------------------
// Suit colour by role
// ---------------------------------------------------------------------------

type SuitColor = 'orange' | 'white' | 'blue' | 'gray';

function getSuitColor(soul: KerbalSoul): SuitColor {
  const role = (soul.role ?? '').toLowerCase();
  if (role === 'pilot') return 'orange';
  if (role === 'scientist' || role === 'science') return 'white';
  if (role === 'engineer') return 'blue';
  return 'gray';
}

// ---------------------------------------------------------------------------
// Suit colour palette
// ---------------------------------------------------------------------------

const SUIT_FILLS: Record<SuitColor, string> = {
  orange: '#e88933',
  white: '#dde5ec',
  blue: '#4a7db5',
  gray: '#8c94a1',
};

const SUIT_DARKS: Record<SuitColor, string> = {
  orange: '#c07020',
  white: '#bcc4cc',
  blue: '#356090',
  gray: '#6e747f',
};

const SUIT_LIGHTS: Record<SuitColor, string> = {
  orange: '#f0a050',
  white: '#eef2f6',
  blue: '#5a90c8',
  gray: '#a0a8b2',
};

const SUIT_DETAIL: Record<SuitColor, string> = {
  orange: '#d47828',
  white: '#c8d2da',
  blue: '#4070a0',
  gray: '#7a808b',
};

// ---------------------------------------------------------------------------
// Procedural drawing helpers
// ---------------------------------------------------------------------------

interface RenderOpts {
  x: number;
  y: number;
  scale: number;
  frameIndex: number;
  state: SpriteState;
  suitColor: SuitColor;
  courage: number;   // 0..1
  stupidity: number; // 0..1
}

// ---------------------------------------------------------------------------
// Utility: rounded rectangle path
// ---------------------------------------------------------------------------

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// Floor shadow
// ---------------------------------------------------------------------------

function drawShadow(ctx: CanvasRenderingContext2D, opts: RenderOpts): void {
  const s = opts.scale;
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(opts.x, opts.y + 8 * s, 9 * s, 3.5 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  // Softer outer shadow
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  ctx.beginPath();
  ctx.ellipse(opts.x, opts.y + 8 * s, 12 * s, 5 * s, 0, 0, Math.PI * 2);
  ctx.fill();
}

// ---------------------------------------------------------------------------
// Backpack / life support (behind body)
// ---------------------------------------------------------------------------

function drawBackpack(ctx: CanvasRenderingContext2D, opts: RenderOpts): void {
  const s = opts.scale;
  const bx = opts.x;
  // Positioned behind the upper back / shoulders
  const by = opts.y - 24 * s;
  const bw = 12 * s;
  const bh = 15 * s;

  // Main pack body
  ctx.fillStyle = '#808080';
  ctx.strokeStyle = '#5a5a5a';
  ctx.lineWidth = 0.8 * s;
  roundRect(ctx, bx - bw / 2, by, bw, bh, 2.5 * s);
  ctx.fill();
  ctx.stroke();

  // Pack panel detail
  ctx.strokeStyle = '#6a6a6a';
  ctx.lineWidth = 0.4 * s;
  ctx.beginPath();
  ctx.moveTo(bx, by + 1.5 * s);
  ctx.lineTo(bx, by + bh - 1.5 * s);
  ctx.stroke();

  // Horizontal strap detail
  ctx.beginPath();
  ctx.moveTo(bx - bw / 2 + 2 * s, by + bh * 0.4);
  ctx.lineTo(bx + bw / 2 - 2 * s, by + bh * 0.4);
  ctx.stroke();

  // Small indicator light
  ctx.fillStyle = '#44cc44';
  ctx.beginPath();
  ctx.arc(bx - 2 * s, by + bh * 0.35, 1 * s, 0, Math.PI * 2);
  ctx.fill();

  // Indicator glow
  ctx.fillStyle = 'rgba(68,204,68,0.3)';
  ctx.beginPath();
  ctx.arc(bx - 2 * s, by + bh * 0.35, 2 * s, 0, Math.PI * 2);
  ctx.fill();
}

// ---------------------------------------------------------------------------
// Legs with chunky boots
// ---------------------------------------------------------------------------

function drawLegs(ctx: CanvasRenderingContext2D, opts: RenderOpts): void {
  const s = opts.scale;
  const x = opts.x;
  const legTopY = opts.y - 6 * s;
  const legLen = 8 * s;
  const legW = 3.5 * s;
  const gap = 3 * s;
  const legColor = '#5a5a5a';

  let leftShift = 0;
  let rightShift = 0;

  if (opts.state === 'walking') {
    const cycle = Math.sin(opts.frameIndex * 0.5);
    leftShift = cycle * 4 * s;
    rightShift = -cycle * 4 * s;
  }

  [-1, 1].forEach((side) => {
    const shift = side < 0 ? leftShift : rightShift;
    const legX = x + side * gap - legW / 2;

    // Leg (dark fabric)
    ctx.fillStyle = legColor;
    ctx.strokeStyle = '#3a3a3a';
    ctx.lineWidth = 0.5 * s;
    roundRect(ctx, legX + shift, legTopY, legW, legLen, 1.5 * s);
    ctx.fill();
    ctx.stroke();

    // Knee crease
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 0.3 * s;
    ctx.beginPath();
    ctx.moveTo(legX + shift + 0.5 * s, legTopY + legLen * 0.5);
    ctx.lineTo(legX + shift + legW - 0.5 * s, legTopY + legLen * 0.5);
    ctx.stroke();

    // Boot
    const bootX = legX - 1.2 * s + shift;
    const bootY = legTopY + legLen - 1 * s;
    const bootW = legW + 2.4 * s;
    const bootH = 4.5 * s;

    // Boot body
    ctx.fillStyle = '#3a3a3a';
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 0.5 * s;
    roundRect(ctx, bootX, bootY, bootW, bootH, 2 * s);
    ctx.fill();
    ctx.stroke();

    // Boot sole (thicker, darker)
    ctx.fillStyle = '#1a1a1a';
    roundRect(ctx, bootX + 0.3 * s, bootY + bootH - 1.8 * s, bootW - 0.6 * s, 1.8 * s, 1 * s);
    ctx.fill();

    // Boot top rim highlight
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 0.3 * s;
    ctx.beginPath();
    ctx.moveTo(bootX + 0.8 * s, bootY + 0.3 * s);
    ctx.lineTo(bootX + bootW - 0.8 * s, bootY + 0.3 * s);
    ctx.stroke();
  });
}

/** Bent-leg pose for sitting — thighs forward, shins down to floor. */
function drawSittingLegs(ctx: CanvasRenderingContext2D, opts: RenderOpts): void {
  const s = opts.scale;
  const x = opts.x;
  const hipY = opts.y - 3 * s;
  const thighLen = 6 * s;
  const shinLen = 6 * s;
  const legW = 3.5 * s;
  const legColor = '#5a5a5a';

  [-1, 1].forEach((side) => {
    // Thigh: forward (down-right)
    ctx.save();
    ctx.fillStyle = legColor;
    ctx.strokeStyle = '#3a3a3a';
    ctx.lineWidth = 0.5 * s;

    const hipX = x + side * 2.5 * s;
    const kneeX = hipX + side * 3 * s;
    const kneeY = hipY + thighLen;
    const footX = kneeX;

    // Thigh
    ctx.beginPath();
    ctx.moveTo(hipX - legW / 2, hipY);
    ctx.lineTo(kneeX + (side < 0 ? -legW / 2 : legW / 2), kneeY);
    ctx.lineTo(kneeX + (side < 0 ? legW / 2 : -legW / 2), kneeY);
    ctx.lineTo(hipX + legW / 2, hipY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Shin (vertical)
    roundRect(ctx, footX - legW / 2, kneeY, legW, shinLen, 1.5 * s);
    ctx.fill();
    ctx.stroke();

    // Boot
    const bootX = footX - 1.5 * s;
    const bootY = kneeY + shinLen - 1 * s;
    ctx.fillStyle = '#3a3a3a';
    ctx.strokeStyle = '#1a1a1a';
    roundRect(ctx, bootX, bootY, legW + 3 * s, 4 * s, 2 * s);
    ctx.fill();
    ctx.stroke();

    // Boot sole
    ctx.fillStyle = '#1a1a1a';
    roundRect(ctx, bootX + 0.3 * s, bootY + 2.2 * s, legW + 2.4 * s, 1.8 * s, 1 * s);
    ctx.fill();

    ctx.restore();
  });
}

// ---------------------------------------------------------------------------
// Body (torso with EVA suit details)
// ---------------------------------------------------------------------------

function drawBody(ctx: CanvasRenderingContext2D, opts: RenderOpts): void {
  const s = opts.scale;
  const x = opts.x;
  const fill = SUIT_FILLS[opts.suitColor];
  const dark = SUIT_DARKS[opts.suitColor];
  const light = SUIT_LIGHTS[opts.suitColor];
  const detail = SUIT_DETAIL[opts.suitColor];

  // Body stretches slightly when stretching
  const stretchFactor = opts.state === 'stretching' ? 1.12 : 1;
  const bodyTopY = opts.y - 20 * s - (opts.state === 'stretching' ? 1.5 * s : 0);
  const bodyW = 16 * s;
  const bodyH = 14 * s * stretchFactor;

  // Main torso
  ctx.fillStyle = fill;
  ctx.strokeStyle = dark;
  ctx.lineWidth = 0.8 * s;
  roundRect(ctx, x - bodyW / 2, bodyTopY, bodyW, bodyH, 4 * s);
  ctx.fill();
  ctx.stroke();

  // Shoulder pads (subtle curved extensions)
  ctx.fillStyle = light;
  ctx.strokeStyle = dark;
  ctx.lineWidth = 0.4 * s;
  [-1, 1].forEach((side) => {
    ctx.beginPath();
    const sx = x + side * (bodyW / 2 + 1.5 * s);
    const sy = bodyTopY + 2 * s;
    ctx.ellipse(sx, sy, 3 * s, 2 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });

  // Vertical suit seam (centre zipper line)
  ctx.strokeStyle = dark;
  ctx.lineWidth = 0.4 * s;
  ctx.setLineDash([2.5 * s, 2.5 * s]);
  ctx.beginPath();
  ctx.moveTo(x, bodyTopY + 2.5 * s);
  ctx.lineTo(x, bodyTopY + bodyH - 2.5 * s);
  ctx.stroke();
  ctx.setLineDash([]);

  // Chest control panel / equipment patch
  const panelW = 6.5 * s;
  const panelH = 4.5 * s;
  const panelX = x - panelW / 2;
  const panelY = bodyTopY + 2.5 * s;
  ctx.fillStyle = detail;
  ctx.globalAlpha = 0.5;
  roundRect(ctx, panelX, panelY, panelW, panelH, 2 * s);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Panel inner detail
  ctx.fillStyle = dark;
  ctx.globalAlpha = 0.35;
  roundRect(ctx, panelX + 1 * s, panelY + 1 * s, panelW - 2 * s, panelH - 2 * s, 1 * s);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Small coloured buttons on panel
  const btnY = panelY + panelH / 2;
  ctx.fillStyle = '#44cc44';
  ctx.beginPath();
  ctx.arc(x - 1.5 * s, btnY, 0.6 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#cc4444';
  ctx.beginPath();
  ctx.arc(x, btnY, 0.6 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#4488cc';
  ctx.beginPath();
  ctx.arc(x + 1.5 * s, btnY, 0.6 * s, 0, Math.PI * 2);
  ctx.fill();

  // Belt at waist
  const beltY = bodyTopY + bodyH - 3.5 * s;
  ctx.fillStyle = '#555';
  ctx.strokeStyle = '#2a2a2a';
  ctx.lineWidth = 0.5 * s;
  roundRect(ctx, x - bodyW / 2 + 0.8 * s, beltY, bodyW - 1.6 * s, 3 * s, 1.5 * s);
  ctx.fill();
  ctx.stroke();

  // Belt buckle
  ctx.fillStyle = '#c0a060';
  ctx.strokeStyle = '#8a7030';
  ctx.lineWidth = 0.4 * s;
  roundRect(ctx, x - 2 * s, beltY + 0.3 * s, 4 * s, 2.4 * s, 0.8 * s);
  ctx.fill();
  ctx.stroke();

  // Horizontal suit seam below chest
  ctx.strokeStyle = dark;
  ctx.lineWidth = 0.3 * s;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.moveTo(x - bodyW / 2 + 2 * s, panelY + panelH + 0.5 * s);
  ctx.lineTo(x + bodyW / 2 - 2 * s, panelY + panelH + 0.5 * s);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// Arms with gloves
// ---------------------------------------------------------------------------

function drawArms(ctx: CanvasRenderingContext2D, opts: RenderOpts): void {
  const s = opts.scale;
  const x = opts.x;
  const bodyW = 16 * s;
  const shoulderY = opts.y - 18 * s;
  const fill = SUIT_FILLS[opts.suitColor];
  const dark = SUIT_DARKS[opts.suitColor];

  // Determine arm angles based on animation state
  let leftAngle = -0.22;
  let rightAngle = 0.22;

  switch (opts.state) {
    case 'typing': {
      const osc = Math.sin(opts.frameIndex * 1.2) * 0.55;
      leftAngle = -0.3 + osc;
      rightAngle = 0.3 - osc;
      break;
    }
    case 'drinking': {
      // Right arm up to mouth
      rightAngle = -1.7;
      leftAngle = -0.08;
      break;
    }
    case 'stretching': {
      // Both arms straight up
      leftAngle = -2.7;
      rightAngle = 2.7;
      break;
    }
    case 'sleeping': {
      // Arms relaxed at sides
      leftAngle = 0.12;
      rightAngle = -0.12;
      break;
    }
    case 'walking': {
      // Swing opposite to legs
      const swing = Math.sin(opts.frameIndex * 0.5) * 0.45;
      leftAngle = -0.22 - swing;
      rightAngle = 0.22 + swing;
      break;
    }
    case 'entering': {
      // Cheerful wave with right arm
      const wave = Math.sin(opts.frameIndex * 2.2) * 0.4;
      rightAngle = -1.1 + wave;
      leftAngle = -0.15;
      break;
    }
    case 'leaving': {
      // Looking back — arms slightly back
      rightAngle = 0.08;
      leftAngle = -0.12;
      break;
    }
    default:
      break;
  }

  [-1, 1].forEach((side) => {
    const angle = side < 0 ? leftAngle : rightAngle;
    const shoulderX = x + side * (bodyW / 2 + 1 * s);

    ctx.save();
    ctx.translate(shoulderX, shoulderY);
    ctx.rotate(angle);

    // Arm segment (short and stumpy — KSP style)
    const armLen = 8.5 * s;
    const armW = 3.5 * s;

    ctx.fillStyle = fill;
    ctx.strokeStyle = dark;
    ctx.lineWidth = 0.6 * s;
    roundRect(ctx, 0, -armW / 2, armLen, armW, 1.8 * s);
    ctx.fill();
    ctx.stroke();

    // Elbow crease
    ctx.strokeStyle = dark;
    ctx.lineWidth = 0.3 * s;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.moveTo(armLen * 0.55, -armW / 2 + 0.4 * s);
    ctx.lineTo(armLen * 0.55, armW / 2 - 0.4 * s);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Glove (thicker, rounded, slightly darker)
    const gloveLen = 3 * s;
    const gloveW = 4.5 * s;
    const gloveX = armLen - 0.8 * s;

    ctx.fillStyle = '#6a6a6a';
    ctx.strokeStyle = '#3a3a3a';
    ctx.lineWidth = 0.5 * s;
    roundRect(ctx, gloveX, -gloveW / 2, gloveLen, gloveW, 2 * s);
    ctx.fill();
    ctx.stroke();

    // Glove finger division line
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 0.3 * s;
    ctx.beginPath();
    ctx.moveTo(gloveX + gloveLen * 0.6, -gloveW / 2 + 0.5 * s);
    ctx.lineTo(gloveX + gloveLen * 0.6, gloveW / 2 - 0.5 * s);
    ctx.stroke();

    ctx.restore();
  });
}

// ---------------------------------------------------------------------------
// Collar / neck ring
// ---------------------------------------------------------------------------

function drawCollar(ctx: CanvasRenderingContext2D, opts: RenderOpts): void {
  const s = opts.scale;
  const x = opts.x;
  const collarY = opts.y - 21 * s;
  const collarW = 11 * s;
  const collarH = 3 * s;

  // Collar ring base
  ctx.fillStyle = '#8a8a8a';
  ctx.strokeStyle = '#5a5a5a';
  ctx.lineWidth = 0.6 * s;
  roundRect(ctx, x - collarW / 2, collarY, collarW, collarH, 1.5 * s);
  ctx.fill();
  ctx.stroke();

  // Collar highlight ring (top)
  ctx.fillStyle = '#b0b0b0';
  roundRect(ctx, x - collarW / 2 + 0.8 * s, collarY, collarW - 1.6 * s, 1 * s, 0.5 * s);
  ctx.fill();

  // Collar shadow (bottom)
  ctx.fillStyle = '#5a5a5a';
  roundRect(ctx, x - collarW / 2 + 0.8 * s, collarY + collarH - 1 * s, collarW - 1.6 * s, 1 * s, 0.5 * s);
  ctx.fill();
}

// ---------------------------------------------------------------------------
// Head, helmet, face — the focal point of the character
// ---------------------------------------------------------------------------

function drawHead(ctx: CanvasRenderingContext2D, opts: RenderOpts): void {
  const s = opts.scale;

  // Compute head bob (idle breathing)
  let headBobY = 0;
  if (opts.state === 'idle') {
    headBobY = Math.sin(opts.frameIndex * 0.25) * 1.2 * s;
  }
  if (opts.state === 'walking') {
    headBobY = Math.abs(Math.sin(opts.frameIndex * 0.5)) * 1.5 * s;
  }

  // Head tilt
  let headTilt = 0;
  if (opts.state === 'drinking') headTilt = 0.18;
  if (opts.state === 'sleeping') headTilt = 0.35;
  if (opts.state === 'leaving') headTilt = -0.12;

  const headCenterX = opts.x;
  const headCenterY = opts.y - 32 * s + headBobY;
  const headRadiusX = 11.5 * s;
  const headRadiusY = 10.5 * s;

  ctx.save();
  ctx.translate(headCenterX, headCenterY);
  ctx.rotate(headTilt);

  // ---- Head skin (classic kerbal green, slightly egg-shaped) ----
  ctx.fillStyle = '#7ec850';
  ctx.strokeStyle = '#5a9a30';
  ctx.lineWidth = 0.8 * s;

  // Draw head with a subtly wider upper half
  ctx.beginPath();
  // Custom path: slightly wider at top, slightly narrower chin
  const topWidth = headRadiusX;
  const bottomWidth = headRadiusX * 0.92;
  // Top half
  ctx.ellipse(0, 0.5 * s, topWidth, headRadiusY, 0, Math.PI, 0, true);
  // Bottom half (slightly narrower)
  ctx.ellipse(0, 0.5 * s, bottomWidth, headRadiusY, 0, 0, Math.PI, true);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // ---- Subtle head highlight ----
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath();
  ctx.ellipse(-2 * s, -3 * s, 5 * s, 4 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  // ---- Helmet ----
  drawHelmet(ctx, opts, headRadiusX, s);

  // ---- Facial features ----
  drawFace(ctx, opts, headRadiusX, s);

  // ---- Hair tuft ----
  drawHairTuft(ctx, s);

  ctx.restore();
}

function drawHelmet(
  ctx: CanvasRenderingContext2D,
  _opts: RenderOpts,
  headRx: number,
  s: number,
): void {
  const helmRx = headRx + 1.8 * s;
  const helmRy = 10.5 * s + 1.8 * s;

  // Outer helmet dome (subtle — mostly clear "glass")
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 0.7 * s;
  ctx.beginPath();
  ctx.ellipse(0, 0, helmRx, helmRy, 0, Math.PI, 0);
  ctx.stroke();

  // Helmet rim/seal at the base of the dome
  ctx.strokeStyle = 'rgba(200,200,200,0.4)';
  ctx.lineWidth = 0.5 * s;
  ctx.beginPath();
  // Short arcs at the sides where helmet meets suit
  ctx.arc(-helmRx + 1 * s, 0.5 * s, 1.5 * s, -0.5, 0.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(helmRx - 1 * s, 0.5 * s, 1.5 * s, Math.PI - 0.5, Math.PI + 0.5);
  ctx.stroke();

  // ---- Visor (semi-transparent blue-tinted arc over upper face) ----
  const visorCenterY = -3 * s;
  const visorRx = headRx - 1.5 * s;
  const visorRy = 10.5 * s - 4 * s;

  // Visor fill — faint blue glass
  ctx.fillStyle = 'rgba(160, 210, 255, 0.15)';
  ctx.beginPath();
  ctx.ellipse(0, visorCenterY, visorRx, visorRy, 0, Math.PI, 0);
  ctx.closePath();
  ctx.fill();

  // Visor rim
  ctx.strokeStyle = 'rgba(200, 230, 255, 0.35)';
  ctx.lineWidth = 0.5 * s;
  ctx.beginPath();
  ctx.ellipse(0, visorCenterY, visorRx, visorRy, 0, Math.PI, 0);
  ctx.stroke();

  // ---- White reflection gleam on visor ----
  // Main gleam
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.beginPath();
  ctx.ellipse(-3.5 * s, -7.5 * s, 3 * s, 1.6 * s, -0.25, 0, Math.PI * 2);
  ctx.fill();

  // Secondary smaller gleam
  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.beginPath();
  ctx.ellipse(-5.5 * s, -5 * s, 1.4 * s, 0.9 * s, -0.35, 0, Math.PI * 2);
  ctx.fill();

  // Top edge gleam
  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.beginPath();
  ctx.ellipse(1 * s, -helmRy + 1 * s, 4 * s, 1 * s, 0.1, 0, Math.PI * 2);
  ctx.fill();
}

function drawFace(
  ctx: CanvasRenderingContext2D,
  opts: RenderOpts,
  _headRx: number,
  s: number,
): void {
  const { courage, stupidity } = opts;

  // ---- Eyes ----
  const eyeCenterY = -2 * s;
  const eyeOffsetX = 4.8 * s;
  const eyeW = 3.2 * s;
  const eyeH = 4 * s;

  // Blink timing: every ~60 frames, blink for 2 frames
  const isBlinking = opts.state === 'idle' && (opts.frameIndex % 60 >= 58);
  const isSleeping = opts.state === 'sleeping';
  const isStretching = opts.state === 'stretching';
  const eyesClosed = isSleeping || isBlinking || (isStretching && opts.frameIndex % 20 < 3);

  if (eyesClosed) {
    // Closed eyes — gentle curved lines
    ctx.strokeStyle = '#3a6a20';
    ctx.lineWidth = 0.9 * s;
    ctx.lineCap = 'round';
    [-1, 1].forEach((side) => {
      ctx.beginPath();
      ctx.arc(side * eyeOffsetX, eyeCenterY, eyeW * 0.75, 0.15, Math.PI - 0.15);
      ctx.stroke();
    });
  } else {
    // Open eyes — large white ovals
    [-1, 1].forEach((side) => {
      // Eye white
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#5a9a30';
      ctx.lineWidth = 0.4 * s;
      ctx.beginPath();
      ctx.ellipse(side * eyeOffsetX, eyeCenterY, eyeW, eyeH, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Subtle eye shadow (top of eye white)
      ctx.fillStyle = 'rgba(200,200,220,0.3)';
      ctx.beginPath();
      ctx.ellipse(side * eyeOffsetX, eyeCenterY - 1 * s, eyeW * 0.8, eyeH * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    // Pupils — shifted based on courage/stupidity personality
    const pupilShiftX = (courage - 0.5) * 1.6 * s;
    const pupilShiftY = (stupidity - 0.5) * 1.1 * s;
    const pupilR = 1.2 * s;

    [-1, 1].forEach((side) => {
      const px = side * eyeOffsetX + pupilShiftX;
      const py = eyeCenterY + pupilShiftY;

      // Pupil
      ctx.fillStyle = '#111111';
      ctx.beginPath();
      ctx.arc(px, py, pupilR, 0, Math.PI * 2);
      ctx.fill();

      // Pupil highlight (catch light)
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(px - 0.35 * s, py - 0.5 * s, 0.35 * s, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // ---- Eyebrows ----
  drawEyebrows(ctx, opts, s, eyesClosed);

  // ---- Mouth ----
  drawMouth(ctx, opts, s, isSleeping);

  // ---- Optional blush for happy/excited kerbals ----
  if (courage > 0.65 && !isSleeping) {
    ctx.fillStyle = 'rgba(255, 150, 150, 0.12)';
    [-1, 1].forEach((side) => {
      ctx.beginPath();
      ctx.ellipse(side * 6.5 * s, 1.5 * s, 2 * s, 1.2 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}

function drawEyebrows(
  ctx: CanvasRenderingContext2D,
  opts: RenderOpts,
  s: number,
  eyesClosed: boolean,
): void {
  const { courage } = opts;
  const browY = -6.5 * s;
  const browOffsetX = 4.8 * s;
  const browLen = 2.8 * s;

  ctx.strokeStyle = '#3a6020';
  ctx.lineWidth = 0.7 * s;
  ctx.lineCap = 'round';

  [-1, 1].forEach((side) => {
    const bx = side * browOffsetX;
    ctx.beginPath();

    if (eyesClosed && courage > 0.5) {
      // Relaxed, content
      ctx.moveTo(bx - browLen, browY);
      ctx.quadraticCurveTo(bx, browY - 0.5 * s, bx + browLen, browY);
    } else if (courage > 0.6) {
      // Raised, happy
      ctx.moveTo(bx - browLen, browY);
      ctx.quadraticCurveTo(bx, browY - 1.8 * s, bx + browLen, browY);
    } else if (courage < 0.35) {
      // Angled inward — worried
      ctx.moveTo(bx - browLen, browY + 0.8 * s);
      ctx.quadraticCurveTo(bx, browY + 0.3 * s, bx + browLen, browY - 0.2 * s);
    } else {
      // Neutral, flat
      ctx.moveTo(bx - browLen, browY);
      ctx.lineTo(bx + browLen, browY);
    }

    ctx.stroke();
  });
}

function drawMouth(
  ctx: CanvasRenderingContext2D,
  opts: RenderOpts,
  s: number,
  isSleeping: boolean,
): void {
  const { courage } = opts;
  const mouthY = 3.5 * s;

  ctx.strokeStyle = '#3a6a20';
  ctx.lineWidth = 0.7 * s;
  ctx.lineCap = 'round';
  ctx.beginPath();

  if (isSleeping) {
    // Small slightly open "o" mouth
    ctx.fillStyle = '#2a5010';
    ctx.ellipse(0, mouthY + 0.5 * s, 1.6 * s, 1.2 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#3a6a20';
    ctx.lineWidth = 0.5 * s;
    ctx.stroke();
  } else if (opts.state === 'stretching') {
    // Big yawn-like open mouth
    ctx.fillStyle = '#2a5010';
    ctx.ellipse(0, mouthY + 0.5 * s, 3.5 * s, 2.5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#3a6a20';
    ctx.lineWidth = 0.5 * s;
    ctx.stroke();
  } else if (courage > 0.6) {
    // Big happy grin
    ctx.arc(0, mouthY - 1 * s, 4.2 * s, 0.15, Math.PI - 0.15);
  } else if (courage < 0.35) {
    // Worried wavy mouth
    ctx.arc(0, mouthY + 4.5 * s, 4 * s, Math.PI + 0.35, -0.35);
  } else {
    // Neutral slight smile
    ctx.arc(0, mouthY - 0.2 * s, 3.2 * s, 0.2, Math.PI - 0.2);
  }

  if (!isSleeping && opts.state !== 'stretching') {
    ctx.stroke();
  }
}

function drawHairTuft(
  ctx: CanvasRenderingContext2D,
  s: number,
): void {
  ctx.fillStyle = '#3a3a2a';
  ctx.beginPath();
  ctx.moveTo(-1.2 * s, -10.5 * s);
  ctx.quadraticCurveTo(1.5 * s, -15.5 * s, 3.5 * s, -10 * s);
  ctx.quadraticCurveTo(0.5 * s, -8 * s, -1.2 * s, -10.5 * s);
  ctx.fill();

  // Hair tuft highlight
  ctx.fillStyle = 'rgba(80,80,50,0.4)';
  ctx.beginPath();
  ctx.moveTo(-0.3 * s, -10.5 * s);
  ctx.quadraticCurveTo(1.2 * s, -14 * s, 2.5 * s, -10.5 * s);
  ctx.quadraticCurveTo(1 * s, -9.5 * s, -0.3 * s, -10.5 * s);
  ctx.fill();
}

// ---------------------------------------------------------------------------
// Accessories (coffee cup, Zzz, etc.)
// ---------------------------------------------------------------------------

function drawAccessories(ctx: CanvasRenderingContext2D, opts: RenderOpts): void {
  const s = opts.scale;
  const x = opts.x;

  if (opts.state === 'drinking') {
    drawCoffeeCup(ctx, opts, x, s);
  }

  if (opts.state === 'sleeping') {
    drawSleepZzz(ctx, opts, x, s);
  }

  // Small name tag label
  // Disabled for cleanliness — uncomment to show names
  // if (opts.state === 'idle') {
  //   drawNameTag(ctx, opts, x, s);
  // }
}

function drawCoffeeCup(
  ctx: CanvasRenderingContext2D,
  opts: RenderOpts,
  x: number,
  s: number,
): void {
  // Cup held near mouth area by right hand
  const cupX = x + 8.5 * s;
  const cupY = opts.y - 27 * s - Math.sin(opts.frameIndex * 0.3) * 1 * s;

  // Cup shadow
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  roundRect(ctx, cupX - 3.2 * s, cupY + 0.5 * s, 6.4 * s, 5 * s, 1.5 * s);
  ctx.fill();

  // Cup body
  ctx.fillStyle = '#f5f0e8';
  ctx.strokeStyle = '#bbb';
  ctx.lineWidth = 0.6 * s;
  roundRect(ctx, cupX - 3 * s, cupY, 6 * s, 5.5 * s, 1.5 * s);
  ctx.fill();
  ctx.stroke();

  // Cup rim highlight
  ctx.strokeStyle = '#ddd';
  ctx.lineWidth = 0.4 * s;
  ctx.beginPath();
  ctx.moveTo(cupX - 2.5 * s, cupY + 0.3 * s);
  ctx.lineTo(cupX + 2.5 * s, cupY + 0.3 * s);
  ctx.stroke();

  // Cup handle
  ctx.strokeStyle = '#bbb';
  ctx.lineWidth = 0.8 * s;
  ctx.beginPath();
  ctx.arc(cupX + 3 * s, cupY + 2.8 * s, 1.8 * s, -0.6, 0.9);
  ctx.stroke();

  // Coffee liquid visible at top
  ctx.fillStyle = '#6b3a2a';
  ctx.fillRect(cupX - 2.2 * s, cupY + 0.5 * s, 4.4 * s, 1.2 * s);

  // Steam wisps
  const steamBaseY = cupY - 0.5 * s;
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 0.5 * s;
  ctx.lineCap = 'round';

  // Wisp 1
  ctx.beginPath();
  ctx.moveTo(cupX - 1 * s, steamBaseY);
  ctx.quadraticCurveTo(
    cupX - 0.5 * s + Math.sin(opts.frameIndex * 0.3) * 1.5 * s,
    steamBaseY - 3.5 * s,
    cupX - 1.5 * s + Math.sin(opts.frameIndex * 0.3 + 1) * 1.5 * s,
    steamBaseY - 6 * s,
  );
  ctx.stroke();

  // Wisp 2
  ctx.beginPath();
  ctx.moveTo(cupX + 1 * s, steamBaseY);
  ctx.quadraticCurveTo(
    cupX + 1.5 * s + Math.cos(opts.frameIndex * 0.35) * 1.5 * s,
    steamBaseY - 4 * s,
    cupX + 0.5 * s + Math.cos(opts.frameIndex * 0.35 + 1) * 1.5 * s,
    steamBaseY - 6.5 * s,
  );
  ctx.stroke();
}

function drawSleepZzz(
  ctx: CanvasRenderingContext2D,
  opts: RenderOpts,
  x: number,
  s: number,
): void {
  const zzX = x + 13 * s;
  const zzBaseY = opts.y - 42 * s;
  const floatOffset = Math.sin(opts.frameIndex * 0.08) * 2.5 * s;

  const zs = [
    { char: 'z', dx: 3, dy: 0, alpha: 0.3 },
    { char: 'z', dx: 6, dy: -6, alpha: 0.45 },
    { char: 'Z', dx: 9, dy: -12, alpha: 0.6 },
  ];

  zs.forEach((z, i) => {
    const phase = opts.frameIndex * 0.08 + i * 1.2;
    const alpha = z.alpha + Math.sin(phase) * 0.12;
    ctx.fillStyle = `rgba(120, 170, 240, ${alpha})`;
    ctx.font = `bold ${7 * s}px sans-serif`;
    ctx.fillText(z.char, zzX + z.dx * s, zzBaseY + z.dy * s + floatOffset);
  });
}

// ---------------------------------------------------------------------------
// Main render orchestrator — draws all body parts back-to-front
// ---------------------------------------------------------------------------

function drawKerbal(ctx: CanvasRenderingContext2D, opts: RenderOpts): void {
  // Walking body bounce (upper body only, legs stay planted)
  let bodyBob = 0;
  if (opts.state === 'walking') {
    bodyBob = Math.abs(Math.sin(opts.frameIndex * 0.5)) * 2 * opts.scale;
  }

  if (opts.state === 'sitting') {
    // Sitting pose: bent legs, lowered upper body (chair drawn at desk level)
    const loweredOpts: RenderOpts = { ...opts, y: opts.y - 5 * opts.scale };
    drawShadow(ctx, opts);
    drawSittingLegs(ctx, opts);
    drawBody(ctx, loweredOpts);
    drawArms(ctx, { ...loweredOpts, state: 'typing' as SpriteState });
    drawCollar(ctx, loweredOpts);
    drawHead(ctx, loweredOpts);
    drawAccessories(ctx, loweredOpts);
    return;
  }

  const upperOpts: RenderOpts = { ...opts, y: opts.y - bodyBob };

  // Back-to-front draw order
  drawShadow(ctx, opts);
  drawBackpack(ctx, upperOpts);
  drawLegs(ctx, opts);
  drawBody(ctx, upperOpts);
  drawArms(ctx, upperOpts);
  drawCollar(ctx, upperOpts);
  drawHead(ctx, upperOpts);
  drawAccessories(ctx, upperOpts);
}

// ---------------------------------------------------------------------------
// KerbalSprite
// ---------------------------------------------------------------------------

export class KerbalSprite {
  public name: string;
  public soul: KerbalSoul;
  public state: SpriteState;

  private x: number;
  private y: number;
  private scale: number;
  private frameIndex: number;
  private frameTimer: number;
  private suitColor: SuitColor;
  private movement: MovementState | null;

  private static readonly FRAME_INTERVAL = 120; // ms per animation frame

  constructor(name: string, soul: KerbalSoul, x: number, y: number) {
    this.name = name;
    this.soul = soul;
    this.x = x;
    this.y = y;
    this.scale = 1;
    this.state = 'idle';
    this.frameIndex = 0;
    this.frameTimer = 0;
    this.suitColor = getSuitColor(soul);
    this.movement = null;
  }

  /** Advance the animation clock. Call each frame with the elapsed ms. */
  update(deltaTime: number): void {
    this.frameTimer += deltaTime;

    const effectiveInterval =
      this.state === 'walking'
        ? KerbalSprite.FRAME_INTERVAL * 0.6
        : KerbalSprite.FRAME_INTERVAL;

    while (this.frameTimer >= effectiveInterval) {
      this.frameTimer -= effectiveInterval;
      this.frameIndex++;
    }

    // Smooth movement interpolation
    if (this.movement) {
      this.movement.elapsed += deltaTime;
      const t = Math.min(this.movement.elapsed / this.movement.duration, 1);
      // Ease in-out
      const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      this.x = this.movement.startX + (this.movement.targetX - this.movement.startX) * eased;
      this.y = this.movement.startY + (this.movement.targetY - this.movement.startY) * eased;

      if (t >= 1) {
        this.x = this.movement.targetX;
        this.y = this.movement.targetY;
        this.movement = null;
        // Revert walking to idle after reaching destination
        if (this.state === 'walking' || this.state === 'entering' || this.state === 'leaving') {
          this.state = 'idle';
        }
      }
    }

    // Auto-revert reacting state after 2 seconds
    if (this.state === 'reacting' && this.frameTimer > 120) {
      this.setState('sitting');
    }
  }

  /** Draw the Kerbal onto a Canvas 2D context. `timeOfDay` is 0..1 (0=midnight, 0.5=noon). */
  render(ctx: CanvasRenderingContext2D, _timeOfDay: number): void {
    const soul = this.soul;
    // Resolve courage / stupidity from soul; fallback to sensible defaults
    const courage = typeof soul.courage === 'number' ? soul.courage : 0.5;
    const stupidity = typeof soul.stupidity === 'number' ? soul.stupidity : 0.5;

    const opts: RenderOpts = {
      x: this.x,
      y: this.y,
      scale: this.scale,
      frameIndex: this.frameIndex,
      state: this.state,
      suitColor: this.suitColor,
      courage,
      stupidity,
    };

    drawKerbal(ctx, opts);
  }

  /** Change animation state, resetting the frame counter. */
  setState(state: SpriteState): void {
    if (this.state !== state) {
      this.state = state;
      this.frameIndex = 0;
      this.frameTimer = 0;
    }
  }

  /** Update the soul data (replaces stub with real loaded soul). */
  updateSoul(soul: KerbalSoul): void {
    this.soul = soul;
    this.suitColor = getSuitColor(soul);
  }

  /** Begin a smooth movement to (x, y) over `duration` ms. Sets state to 'walking'. */
  moveTo(x: number, y: number, duration: number): void {
    this.movement = {
      startX: this.x,
      startY: this.y,
      targetX: x,
      targetY: y,
      elapsed: 0,
      duration,
    };
    this.setState('walking');
  }

  /** Current world position. */
  getPosition(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }

  /** Check whether the sprite is currently in a movement animation. */
  get isMoving(): boolean {
    return this.movement !== null;
  }

  /** Teleport instantly (no animation). */
  setPosition(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.movement = null;
  }
}
