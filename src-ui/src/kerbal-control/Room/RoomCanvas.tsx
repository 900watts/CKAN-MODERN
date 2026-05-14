import React, { useRef, useEffect, useCallback } from 'react';
import { KerbalSprite } from './KerbalSprite';
import { SoulLoader } from '../SoulLoader';
import type { KerbalSoul } from '../SoulLoader';
import {
  DESK_POSITIONS,
  ENTRANCE_POSITION,
} from './RoomLayout';
import type { DeskPosition } from './RoomLayout';
import { kerbalStore } from '../KerbalStore';
import type { KerbalState } from '../KerbalStore';
import { timeSystem } from '../TimeSystem';
import type { TimeState } from '../TimeSystem';
import { proactiveAgent } from '../ProactiveAgent';
import { t } from '../../services/i18n';

// ==========================================================================
// RoomCanvas  —  React component for the 2.5D Mission Control room
// ==========================================================================

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Target aspect ratio (width / height). */
const ASPECT_RATIO = 16 / 9;

/** How long a walk animation takes (ms). */
const WALK_DURATION = 1800;

/** Maximum number of coffee cups visible on desks at once. */
const MAX_COFFEE_CUPS = 4;

// ---------------------------------------------------------------------------
// Background rendering helpers
// ---------------------------------------------------------------------------

const FLOOR_Y_RATIO = 0.72;

/** Draw the room background: solid walls, flat floor, baseboard trim, big screen, posters. */
function drawBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  timeOfDay: number,
): void {
  const floorLine = h * FLOOR_Y_RATIO;

  // ----- Wall: solid flat colour -----
  const wallColor = lerpColor('#3d4450', '#1e2430', timeOfDay);
  ctx.fillStyle = wallColor;
  ctx.fillRect(0, 0, w, floorLine);

  // Subtle wall texture — faint vertical panel seams
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  for (let px = w * 0.04; px < w * 0.96; px += w * 0.08) {
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, floorLine);
    ctx.stroke();
  }

  // Horizontal chair rail at mid-wall
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, floorLine * 0.55);
  ctx.lineTo(w, floorLine * 0.55);
  ctx.stroke();

  // ----- Baseboard / trim -----
  const baseboardH = h * 0.02;
  ctx.fillStyle = '#2a2d35';
  ctx.fillRect(0, floorLine - baseboardH, w, baseboardH);
  // Baseboard top edge highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(0, floorLine - baseboardH);
  ctx.lineTo(w, floorLine - baseboardH);
  ctx.stroke();

  // ----- Flat floor (single solid colour, no gradient) -----
  const floorColor = lerpColor('#3d3c38', '#222120', timeOfDay);
  ctx.fillStyle = floorColor;
  ctx.fillRect(0, floorLine, w, h - floorLine);

  // Floor tile grid — flat checkerboard for scale reference
  const tileSize = h * 0.045;
  ctx.strokeStyle = 'rgba(255,255,255,0.025)';
  ctx.lineWidth = 0.6;
  for (let ty = floorLine + tileSize; ty < h; ty += tileSize) {
    ctx.beginPath();
    ctx.moveTo(0, ty);
    ctx.lineTo(w, ty);
    ctx.stroke();
  }
  for (let tx = tileSize; tx < w; tx += tileSize) {
    ctx.beginPath();
    ctx.moveTo(tx, floorLine);
    ctx.lineTo(tx, h);
    ctx.stroke();
  }

  // ----- Big Screen -----
  drawBigScreen(ctx, w, h, floorLine);

  // ----- Shift badge -----
  drawShiftBadge(ctx, w, h, timeOfDay);

  // ----- Posters / drawings -----
  drawPosters(ctx, w, h);
}

/** The large central Mission Control display. */
function drawBigScreen(ctx: CanvasRenderingContext2D, w: number, h: number, _floorLine: number): void {
  const sx = w * 0.18;
  const sy = h * 0.03;
  const sw = w * 0.38;
  const sh = Math.min(h * 0.18, h * FLOOR_Y_RATIO * 0.5);

  // Bezel
  ctx.fillStyle = '#1a1a24';
  ctx.strokeStyle = '#333344';
  ctx.lineWidth = 3;
  roundRect(ctx, sx - 3, sy - 3, sw + 6, sh + 6, 4);
  ctx.fill();
  ctx.stroke();

  // Screen glow
  const glowGrad = ctx.createLinearGradient(sx, sy, sx, sy + sh);
  glowGrad.addColorStop(0, '#0a3a2a');
  glowGrad.addColorStop(0.5, '#0d4d35');
  glowGrad.addColorStop(1, '#0a3a2a');
  ctx.fillStyle = glowGrad;
  roundRect(ctx, sx, sy, sw, sh, 2);
  ctx.fill();

  // Flicker effect — subtle static lines
  ctx.strokeStyle = 'rgba(50, 255, 180, 0.15)';
  ctx.lineWidth = 0.6;
  for (let i = 0; i < 6; i++) {
    const ly = sy + (sh / 7) * (i + 0.5) + Math.sin(Date.now() / 2000 + i) * 2;
    ctx.beginPath();
    ctx.moveTo(sx + 6, ly);
    ctx.lineTo(sx + sw - 6, ly);
    ctx.stroke();
  }

  // Title text
  ctx.fillStyle = 'rgba(80, 255, 200, 0.9)';
  ctx.font = `bold ${Math.round(h * 0.022)}px "Courier New", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(t('room.title'), sx + sw / 2, sy + sh * 0.4);

  // Subtitle
  ctx.fillStyle = 'rgba(80, 255, 200, 0.4)';
  ctx.font = `${Math.round(h * 0.013)}px "Courier New", monospace`;
  ctx.fillText(t('room.statusOk'), sx + sw / 2, sy + sh * 0.68);
}

/** Draw a few Kerbal-themed posters / drawings on the walls. */
function drawPosters(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const posterPositions = [
    { x: w * 0.62, y: h * 0.06, w: w * 0.06, h: h * 0.09 },
    { x: w * 0.70, y: h * 0.06, w: w * 0.06, h: h * 0.09 },
  ];

  for (const p of posterPositions) {
    // Frame
    ctx.fillStyle = '#222';
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    roundRect(ctx, p.x - 1, p.y - 1, p.w + 2, p.h + 2, 2);
    ctx.fill();
    ctx.stroke();

    // Simple rocket sketch inside
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    roundRect(ctx, p.x + 1, p.y + 1, p.w - 2, p.h - 2, 1);
    ctx.fill();

    // Crude Kerbal face doodle
    ctx.fillStyle = 'rgba(126, 200, 80, 0.5)';
    ctx.beginPath();
    ctx.arc(p.x + p.w / 2, p.y + p.h * 0.45, p.h * 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.arc(p.x + p.w * 0.4, p.y + p.h * 0.4, p.h * 0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p.x + p.w * 0.6, p.y + p.h * 0.4, p.h * 0.05, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Shift badge in the top-right corner showing current shift + crew count. */
function drawShiftBadge(ctx: CanvasRenderingContext2D, w: number, h: number, _timeOfDay: number): void {
  const timeState = timeSystem.getTime();
  const isDay = timeState.shiftType === 'day';
  const present = kerbalStore.getPresent();
  const count = present.length;

  const bx = w * 0.72;
  const by = h * 0.025;
  const bw = w * 0.18;
  const bh = h * 0.055;

  // Badge background
  const bgColor = isDay ? 'rgba(234, 179, 8, 0.25)' : 'rgba(99, 102, 241, 0.25)';
  const borderColor = isDay ? 'rgba(234, 179, 8, 0.5)' : 'rgba(99, 102, 241, 0.5)';
  ctx.fillStyle = bgColor;
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  roundRect(ctx, bx, by, bw, bh, 4);
  ctx.fill();
  ctx.stroke();

  // Label
  const shiftLabel = isDay ? t('room.dayShift') : t('room.nightShift');
  const labelColor = isDay ? '#fbbf24' : '#a5b4fc';
  ctx.fillStyle = labelColor;
  ctx.font = `bold ${Math.round(h * 0.016)}px "Courier New", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${shiftLabel}  ·  ${t('room.crew', { count })}`, bx + bw / 2, by + bh / 2);
}

// ---------------------------------------------------------------------------
// Furniture rendering
// ---------------------------------------------------------------------------

interface DrawDeskOptions {
  x: number;
  y: number;
  w: number;
  h: number;
  facing: 'left' | 'right' | 'front';
  hasMonitor: boolean;
  assignedName: string | null;
  timeOfDay: number;
}

/** Draw a single mission-control console desk. */
function drawDesk(ctx: CanvasRenderingContext2D, opts: DrawDeskOptions): void {
  const { x, y, w, h: height, hasMonitor, assignedName, timeOfDay } = opts;

  // Desk surface (dark gray industrial)
  ctx.fillStyle = '#3a3c40';
  ctx.strokeStyle = '#55575c';
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, height, 2);
  ctx.fill();
  ctx.stroke();

  // Front panel with slight highlight
  ctx.fillStyle = '#2e3035';
  ctx.fillRect(x + 2, y + height * 0.3, w - 4, height * 0.4);

  // Monitor if present
  if (hasMonitor) {
    drawMonitor(ctx, x + w * 0.08, y - height * 0.45, w * 0.84, height * 0.5, assignedName, timeOfDay);
  }

  // Nameplate
  if (assignedName) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = `${Math.round(height * 0.18)}px "Courier New", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(assignedName.toUpperCase(), x + w / 2, y + height * 0.55);
  }

  // Cables underneath
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    const cx = x + w * (0.2 + i * 0.25);
    ctx.moveTo(cx, y + height);
    ctx.bezierCurveTo(
      cx - 3, y + height + 4,
      cx + 3, y + height + 8,
      cx - 2, y + height + 12,
    );
    ctx.stroke();
  }
}

/** Draw a monitor on a desk with flickering data. */
function drawMonitor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  assignedName: string | null,
  timeOfDay: number,
): void {
  // Monitor casing
  ctx.fillStyle = '#1c1c24';
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 1;
  roundRect(ctx, x - 1, y - 1, w + 2, h * 0.9 + 2, 2);
  ctx.fill();
  ctx.stroke();

  // Screen surface
  const screenX = x + 2;
  const screenY = y + 2;
  const screenW = w - 4;
  const screenH = h * 0.9 - 4;

  const glowIntensity = 0.7 + 0.3 * (1 - timeOfDay); // brighter at night
  ctx.fillStyle = `rgba(20, 40, 30, ${glowIntensity})`;
  roundRect(ctx, screenX, screenY, screenW, screenH, 1);
  ctx.fill();

  // Flickering data lines on screen
  const now = Date.now();
  const seed = assignedName ? hashString(assignedName) : 0;

  ctx.strokeStyle = `rgba(80, 255, 180, ${0.25 + 0.1 * Math.sin(now / 1500)})`;
  ctx.lineWidth = 0.5;

  for (let i = 0; i < 3; i++) {
    const ly = screenY + screenH * (0.15 + i * 0.25) + Math.sin(now / 2000 + seed + i) * 1.5;
    const lineLen = screenW * (0.4 + 0.3 * Math.sin(now / 3000 + seed * 2 + i));

    ctx.beginPath();
    ctx.moveTo(screenX + 3, ly);
    ctx.lineTo(screenX + 3 + lineLen, ly);
    ctx.stroke();

    // Blinking dot at end of line
    if (Math.sin(now / 800 + seed + i * 3) > 0) {
      ctx.fillStyle = 'rgba(80, 255, 180, 0.8)';
      ctx.beginPath();
      ctx.arc(screenX + 3 + lineLen, ly, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Screen glow reflection onto desk
  const reflectionGrad = ctx.createLinearGradient(x, y + h * 0.9, x, y + h * 0.9 + 8);
  reflectionGrad.addColorStop(0, `rgba(80, 255, 180, ${0.12 * glowIntensity})`);
  reflectionGrad.addColorStop(1, 'rgba(80, 255, 180, 0)');
  ctx.fillStyle = reflectionGrad;
  ctx.fillRect(x, y + h * 0.9, w, 8);
}

/** Draw an office chair at a desk position (static, doesn't move with kerbal). */
function drawChairAtDesk(ctx: CanvasRenderingContext2D, deskX: number, deskY: number): void {
  const x = deskX;
  const seatY = deskY - 3;

  // Centre pillar + base
  ctx.fillStyle = '#222222';
  ctx.fillRect(x - 0.8, seatY, 1.6, deskY - seatY + 2);
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 2.5) {
    ctx.beginPath();
    ctx.moveTo(x, deskY + 1.5);
    ctx.lineTo(x + Math.cos(angle) * 5.5, deskY + 2.5);
    ctx.stroke();
  }
  ctx.fillStyle = '#1a1a1a';
  for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 2.5) {
    ctx.beginPath();
    ctx.arc(x + Math.cos(angle) * 5.5, deskY + 2.5, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }

  // Seat cushion
  ctx.fillStyle = '#3a3a3e';
  ctx.strokeStyle = '#1e1e22';
  ctx.lineWidth = 0.6;
  roundRect(ctx, x - 7, seatY - 1.5, 14, 3, 1.5);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  roundRect(ctx, x - 5.5, seatY - 1.2, 11, 1.2, 0.8);
  ctx.fill();

  // Armrests
  ctx.strokeStyle = '#2a2a2e';
  ctx.lineWidth = 1.2;
  ctx.lineCap = 'round';
  [-1, 1].forEach((side) => {
    ctx.beginPath();
    ctx.moveTo(x + side * 6, seatY - 1);
    ctx.lineTo(x + side * 6, deskY - 7);
    ctx.stroke();
  });
  ctx.fillStyle = '#2e2e32';
  [-1, 1].forEach((side) => {
    roundRect(ctx, x + side * 6 - 2, deskY - 7.5, 4, 1.8, 0.8);
    ctx.fill();
  });

  // Backrest
  ctx.strokeStyle = '#2a2a2e';
  ctx.lineWidth = 1;
  [-1, 1].forEach((side) => {
    ctx.beginPath();
    ctx.moveTo(x + side * 4.5, seatY - 1);
    ctx.lineTo(x + side * 4.5, deskY - 16);
    ctx.stroke();
  });
  ctx.fillStyle = '#3a3a3e';
  ctx.strokeStyle = '#1e1e22';
  ctx.lineWidth = 0.6;
  roundRect(ctx, x - 6.5, deskY - 17, 13, 10, 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 0.4;
  for (let ly = deskY - 16; ly < deskY - 8; ly += 1.8) {
    ctx.beginPath();
    ctx.moveTo(x - 5, ly);
    ctx.lineTo(x + 5, ly);
    ctx.stroke();
  }
}

/** Draw the coffee station on the floor in the right corner. */
function drawCoffeeStation(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const cx = w * 0.76;
  const cy = h * 0.80;

  // Counter
  ctx.fillStyle = '#4a4c50';
  ctx.strokeStyle = '#6a6c70';
  ctx.lineWidth = 1;
  roundRect(ctx, cx - w * 0.04, cy, w * 0.08, h * 0.04, 3);
  ctx.fill();
  ctx.stroke();

  // Coffee machine body
  ctx.fillStyle = '#2a2a30';
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1;
  roundRect(ctx, cx - w * 0.025, cy - h * 0.065, w * 0.05, h * 0.06, 2);
  ctx.fill();
  ctx.stroke();

  // Coffee pot
  ctx.fillStyle = 'rgba(60, 40, 20, 0.7)';
  roundRect(ctx, cx + w * 0.006, cy - h * 0.04, w * 0.012, h * 0.035, 1);
  ctx.fill();

  // Steam
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 0.7;
  for (let i = 0; i < 2; i++) {
    const sx = cx + w * 0.01 + i * w * 0.006;
    const sy = cy - h * 0.068 - Math.sin(Date.now() / 1200 + i) * 1.5;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(sx + 1, sy - 3, sx, sy - 5);
    ctx.stroke();
  }

  // "COFFEE" label
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = `${Math.round(h * 0.011)}px "Courier New", monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(t('room.coffee'), cx, cy + h * 0.065);
}

// ---------------------------------------------------------------------------
// Coffee cups on desks
// ---------------------------------------------------------------------------

interface CoffeeCup {
  deskId: string;
  deskX: number;
  deskY: number;
  deskW: number;
  deskH: number;
  placedAt: number; // timestamp
}

let coffeeCups: CoffeeCup[] = [];

/** Possibly add a coffee cup on a random occupied desk. */
function maybeAddCoffeeCup(deskRenderData: Array<{ deskId: string; deskX: number; deskY: number; deskW: number; deskH: number }>): void {
  if (coffeeCups.length >= MAX_COFFEE_CUPS) return;
  // Only occasionally add cups
  if (Math.random() > 0.003) return;

  const occupied = deskRenderData.filter(
    (d) => !coffeeCups.some((c) => c.deskId === d.deskId),
  );
  if (occupied.length === 0) return;

  const pick = occupied[Math.floor(Math.random() * occupied.length)];
  coffeeCups.push({ ...pick, placedAt: Date.now() });
}

/** Remove cups older than a threshold to keep things tidy. */
function evictOldCoffeeCups(): void {
  const now = Date.now();
  coffeeCups = coffeeCups.filter((c) => now - c.placedAt < 30000);
}

function drawCoffeeCups(ctx: CanvasRenderingContext2D): void {
  for (const cup of coffeeCups) {
    const cx = cup.deskX + cup.deskW * 0.75;
    const cy = cup.deskY + cup.deskH * 0.1;

    // Cup
    ctx.fillStyle = '#f0ede5';
    ctx.strokeStyle = '#bbb';
    ctx.lineWidth = 0.6;
    roundRect(ctx, cx, cy, cup.deskW * 0.1, cup.deskH * 0.22, 1.2);
    ctx.fill();
    ctx.stroke();

    // Handle
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.arc(cx + cup.deskW * 0.1, cy + cup.deskH * 0.08, cup.deskW * 0.03, 0, Math.PI * 1.3);
    ctx.stroke();

    // Steam
    const elapsed = (Date.now() - cup.placedAt) / 1000;
    if (elapsed < 15) {
      ctx.strokeStyle = `rgba(255,255,255,${0.15 * (1 - elapsed / 15)})`;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      const sy = cy - 2 - elapsed * 0.3;
      ctx.moveTo(cx + cup.deskW * 0.05, sy);
      ctx.quadraticCurveTo(cx + cup.deskW * 0.05 + 1, sy - 2, cx + cup.deskW * 0.05, sy - 3);
      ctx.stroke();
    }
  }
}

// ---------------------------------------------------------------------------
// Lighting overlay
// ---------------------------------------------------------------------------

function drawLightingOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, timeOfDay: number): void {
  // Day = warm, Night = cool blue
  const r = Math.round(lerp(20, 40, timeOfDay));  // red at night is low
  const g = Math.round(lerp(20, 45, timeOfDay));
  const b = Math.round(lerp(60, 30, timeOfDay));  // blue at night is high
  const alpha = 0.08 + 0.1 * (1 - timeOfDay); // stronger tint at night

  ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
  ctx.fillRect(0, 0, w, h);

  // Vignette
  const vignetteGrad = ctx.createRadialGradient(w / 2, h / 2, w * 0.35, w / 2, h / 2, w * 0.75);
  vignetteGrad.addColorStop(0, 'rgba(0,0,0,0)');
  vignetteGrad.addColorStop(1, `rgba(0,0,0,${0.25 + 0.15 * (1 - timeOfDay)})`);
  ctx.fillStyle = vignetteGrad;
  ctx.fillRect(0, 0, w, h);
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpColor(a: string, b: string, t: number): string {
  const parse = (hex: string) => {
    const v = parseInt(hex.slice(1), 16);
    return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
  };
  const ca = parse(a);
  const cb = parse(b);
  const r = Math.round(lerp(ca[0], cb[0], t));
  const g = Math.round(lerp(ca[1], cb[1], t));
  const bl = Math.round(lerp(ca[2], cb[2], t));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

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
// Autonomous kerbal activity system
// ---------------------------------------------------------------------------

type AwayActivity = 'coffee' | 'visit' | 'stretch' | 'wander' | 'bathroom' | 'lunch';

interface AwayState {
  activity: AwayActivity;
  deskX: number;
  deskY: number;
  targetX: number;
  targetY: number;
  arrivedAt: number;     // timestamp when they reached the target
  activityDuration: number; // ms to stay at target
}

const ACTIVITY_CHECK_INTERVAL = 45_000; // check every 45 seconds
const ACTIVITY_CHANCE = 0.12;           // 12% chance per eligible kerbal per check

function getCoffeeStationPos(displayW: number, displayH: number): { x: number; y: number } {
  return { x: displayW * 0.76, y: displayH * 0.80 };
}

function getRandomFloorPos(displayW: number, displayH: number): { x: number; y: number } {
  return {
    x: displayW * (0.25 + Math.random() * 0.45),
    y: displayH * (0.80 + Math.random() * 0.10),
  };
}

// ---------------------------------------------------------------------------
// Draw-item types for unified z-sorted rendering
// ---------------------------------------------------------------------------

type DrawItemType = 'desk' | 'sprite' | 'coffee-station' | 'coffee-cup';

interface DrawItem {
  y: number;
  itemType: DrawItemType;
  desk?: DeskPosition;
  sprite?: KerbalSprite;
}

// ---------------------------------------------------------------------------
// RoomCanvas Component
// ---------------------------------------------------------------------------

const RoomCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const spritesRef = useRef<Map<string, KerbalSprite>>(new Map());
  const rafIdRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const prevPresentRef = useRef<Set<string>>(new Set());
  /** True after the first sync — prevents walk-in animation on page load. */
  const initialisedRef = useRef(false);

  /**
   * Tracks kerbals that are currently in an entering or leaving transition,
   * so we don't re-trigger the same transition on every store update.
   */
  const transitioningRef = useRef<Map<string, 'entering' | 'leaving'>>(new Map());

  /** Tracks kerbals away from their desk doing autonomous activities. */
  const awayStatesRef = useRef<Map<string, AwayState>>(new Map());

  const sizesRef = useRef<{ w: number; h: number; displayW: number; displayH: number }>({
    w: 1280,
    h: 720,
    displayW: 1280,
    displayH: 720,
  });

  // -----------------------------------------------------------------------
  // Sizing
  // -----------------------------------------------------------------------

  const updateSizes = useCallback(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const rect = container.getBoundingClientRect();
    let displayW = rect.width;
    let displayH = rect.height;

    // Clamp to 16:9
    if (displayW / displayH > ASPECT_RATIO) {
      displayW = displayH * ASPECT_RATIO;
    } else {
      displayH = displayW / ASPECT_RATIO;
    }

    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(displayW * dpr);
    const h = Math.round(displayH * dpr);

    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${displayW}px`;
    canvas.style.height = `${displayH}px`;

    sizesRef.current = { w, h, displayW, displayH };
  }, []);

  // -----------------------------------------------------------------------
  // Look up assigned desk for a kerbal by name
  // -----------------------------------------------------------------------

  function getDeskForKerbalFromLayout(name: string): { x: number; y: number } | undefined {
    const desk = DESK_POSITIONS.find((d) => d.assignedKerbal === name);
    return desk ? { x: desk.x, y: desk.y } : undefined;
  }

  // -----------------------------------------------------------------------
  // Sync sprites with kerbalStore  (called only when store changes)
  // -----------------------------------------------------------------------

  const syncSprites = useCallback(() => {
    const present = kerbalStore.getPresent();
    const presentNames = new Set(present.map((k: KerbalState) => k.name));

    const { displayW, displayH } = sizesRef.current;
    const entranceX = (ENTRANCE_POSITION.x / 100) * displayW;
    const entranceY = (ENTRANCE_POSITION.y / 100) * displayH;

    const isInitial = !initialisedRef.current;
    initialisedRef.current = true;

    // --- New arrivals: kerbals who just became present ---
    for (const kerbal of present) {
      if (spritesRef.current.has(kerbal.name)) continue;
      if (transitioningRef.current.has(kerbal.name)) continue;

      const desk = getDeskForKerbalFromLayout(kerbal.name);
      const stubSoul: KerbalSoul = {
        name: kerbal.name,
        role: '',
        courage: 50,
        stupidity: 50,
        badS: false,
        personality: '',
        knowledgeDomain: [],
        speechStyle: '',
        catchphrases: [],
        rawMarkdown: '',
      };

      if (isInitial && desk) {
        // First load — spawn at desk already sitting, no walk-in
        const sx = (desk.x / 100) * displayW;
        const sy = (desk.y / 100) * displayH;
        const sprite = new KerbalSprite(kerbal.name, stubSoul, sx, sy);
        sprite.setState('sitting');
        spritesRef.current.set(kerbal.name, sprite);
      } else {
        // Actual arrival — walk in from entrance
        const targetX = desk ? (desk.x / 100) * displayW : entranceX;
        const targetY = desk ? (desk.y / 100) * displayH : entranceY;
        const sprite = new KerbalSprite(kerbal.name, stubSoul, entranceX, entranceY);
        sprite.setState('entering');
        sprite.moveTo(targetX, targetY, WALK_DURATION);
        spritesRef.current.set(kerbal.name, sprite);
        transitioningRef.current.set(kerbal.name, 'entering');
      }
    }

    // --- Departures: kerbals who just left ---
    for (const [name, sprite] of spritesRef.current.entries()) {
      if (!presentNames.has(name)) {
        if (!transitioningRef.current.has(name)) {
          sprite.setState('leaving');
          sprite.moveTo(entranceX, entranceY, WALK_DURATION);
          transitioningRef.current.set(name, 'leaving');
        }
      }
    }

    // --- "Coming back": kerbal was leaving but is now present again ---
    for (const kerbal of present) {
      if (transitioningRef.current.get(kerbal.name) === 'leaving') {
        const sprite = spritesRef.current.get(kerbal.name);
        if (sprite) {
          const desk = getDeskForKerbalFromLayout(kerbal.name);
          if (desk) {
            sprite.setState('entering');
            sprite.moveTo(
              (desk.x / 100) * displayW,
              (desk.y / 100) * displayH,
              WALK_DURATION * 0.5,
            );
            transitioningRef.current.set(kerbal.name, 'entering');
          }
        }
      }
    }

    prevPresentRef.current = presentNames;
  }, []);

  // -----------------------------------------------------------------------
  // Load real soul data into sprites (replaces stub souls used during init)
  // -----------------------------------------------------------------------

  const soulsLoadedRef = useRef<Set<string>>(new Set());

  const loadSoulsIntoSprites = useCallback(() => {
    for (const [name] of spritesRef.current.entries()) {
      if (soulsLoadedRef.current.has(name)) continue;
      SoulLoader.load(name).then((soul) => {
        if (spritesRef.current.has(name)) {
          spritesRef.current.get(name)!.updateSoul(soul);
          soulsLoadedRef.current.add(name);
        }
      }).catch(() => {
        // Soul file not found — keep stub soul
      });
    }
  }, []);

  // -----------------------------------------------------------------------
  // Main render loop
  // -----------------------------------------------------------------------

  const renderLoop = useCallback((timestamp: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { w, h, displayW, displayH } = sizesRef.current;
    const deltaTime = lastTimeRef.current ? timestamp - lastTimeRef.current : 16;
    lastTimeRef.current = timestamp;

    const timeState: TimeState = timeSystem.getTime();
    const timeOfDay = timeState.currentHour / 24; // 0..1, 0=midnight, 0.5=noon

    // ---- 1. Clear ----
    ctx.clearRect(0, 0, w, h);

    // ---- 2. Background (walls, floor, screen, posters) ----
    ctx.save();
    ctx.scale(w / displayW, h / displayH);
    drawBackground(ctx, displayW, displayH, timeOfDay);
    ctx.restore();

    // ---- 3. Update all sprites (once per frame) ----
    for (const sprite of spritesRef.current.values()) {
      sprite.update(deltaTime);
    }

    // ---- 3b. Check for bathroom/lunch kerbals ready to return ----
    const { displayW: dw, displayH: dh } = sizesRef.current;
    const entranceX = (ENTRANCE_POSITION.x / 100) * dw;
    const entranceY = (ENTRANCE_POSITION.y / 100) * dh;

    for (const [name, away] of awayStatesRef.current.entries()) {
      if ((away.activity === 'bathroom' || away.activity === 'lunch') && away.arrivedAt > 0) {
        if (!spritesRef.current.has(name) && Date.now() - away.arrivedAt >= away.activityDuration) {
          // Kerbal returns from bathroom/lunch — spawn at entrance and walk to desk
          const stubSoul: KerbalSoul = {
            name,
            role: '',
            courage: 50,
            stupidity: 50,
            badS: false,
            personality: '',
            knowledgeDomain: [],
            speechStyle: '',
            catchphrases: [],
            rawMarkdown: '',
          };
          const sprite = new KerbalSprite(name, stubSoul, entranceX, entranceY);
          sprite.setState('entering');
          const desk = getDeskForKerbalFromLayout(name);
          if (desk) {
            sprite.moveTo(
              (desk.x / 100) * dw,
              (desk.y / 100) * dh,
              WALK_DURATION + Math.random() * 1000,
            );
          }
          spritesRef.current.set(name, sprite);
          transitioningRef.current.set(name, 'entering');
          awayStatesRef.current.delete(name);
          kerbalStore.returnFromBreak(name);
        }
      }
    }

    // ---- 4. Build sorted draw-item list for correct z-ordering ----
    //
    // The room uses a 2.5D top-down perspective where lower Y (closer to
    // the wall) = farther back.  We collect desks, sprites, and the
    // coffee station into a single list, sort by Y ascending, and
    // render back-to-front so nearer objects occlude farther ones.

    const drawItems: DrawItem[] = [];

    // Desks
    for (const desk of DESK_POSITIONS) {
      drawItems.push({ y: desk.y, itemType: 'desk', desk });
    }

    // Sprites (use their assigned desk Y for correct row z-ordering)
    for (const sprite of spritesRef.current.values()) {
      const desk = getDeskForKerbalFromLayout(sprite.name);
      const spriteY = desk ? desk.y : sprite.getPosition().y;
      drawItems.push({ y: spriteY, itemType: 'sprite', sprite });
    }

    // Coffee station — on the floor to the right
    drawItems.push({ y: 80, itemType: 'coffee-station' });

    // Sort: lower Y first (back rows behind front rows);
    // Sitting sprites render before desks at same Y (kerbal sits behind desk);
    // non-sitting sprites render after desks (kerbal is in front of desk).
    drawItems.sort((a, b) => {
      if (a.y !== b.y) return a.y - b.y;
      return zPriority(a) - zPriority(b);
    });

    function zPriority(item: DrawItem): number {
      switch (item.itemType) {
        case 'sprite':
          return item.sprite?.state === 'sitting' ? -1 : 3;
        case 'desk':
          return 0;
        case 'coffee-station':
          return 1;
        case 'coffee-cup':
          return 2;
      }
    }

    // ---- 5. Render draw items and detect completed transitions ----
    const toRemove: string[] = [];

    ctx.save();
    ctx.scale(w / displayW, h / displayH);

    for (const item of drawItems) {
      switch (item.itemType) {
        case 'desk': {
          if (item.desk) {
            const dx = (item.desk.x / 100) * displayW;
            const dy = (item.desk.y / 100) * displayH;
            const dw = displayW * 0.09;
            const dh = displayH * 0.12;
            const deskY = dy - dh * 0.55;

            // Draw chair at desk if assigned kerbal is sitting
            if (item.desk.assignedKerbal) {
              const sprite = spritesRef.current.get(item.desk.assignedKerbal);
              if (sprite && sprite.state === 'sitting') {
                drawChairAtDesk(ctx, dx, dy);
              }
            }

            drawDesk(ctx, {
              x: dx,
              y: deskY,
              w: dw,
              h: dh,
              facing: item.desk.facing,
              hasMonitor: item.desk.hasMonitor,
              assignedName: item.desk.assignedKerbal,
              timeOfDay,
            });
          }
          break;
        }
        case 'sprite': {
          if (item.sprite) {
            item.sprite.render(ctx, timeOfDay);

            // Check if a transition has completed
            const transition = transitioningRef.current.get(item.sprite.name);
            if (transition === 'entering' && item.sprite.state === 'idle') {
              // Entering walk finished — sit at desk if assigned
              transitioningRef.current.delete(item.sprite.name);
              const desk = getDeskForKerbalFromLayout(item.sprite.name);
              if (desk) {
                item.sprite.setState('sitting');
              }
            } else if (transition === 'leaving' && item.sprite.state === 'idle') {
              // Leaving walk finished — kerbal has reached the exit, remove sprite
              toRemove.push(item.sprite.name);
              transitioningRef.current.delete(item.sprite.name);
            }

            // ---- Autonomous activity handling ----
            const away = awayStatesRef.current.get(item.sprite.name);
            if (away && !item.sprite.isMoving) {
              const now = Date.now();
              // First frame after arrival — record the time
              if (away.arrivedAt === 0) {
                away.arrivedAt = now;
              }
              const elapsed = now - away.arrivedAt;

              // Handle bathroom/lunch — kerbal leaves the room
              if (away.activity === 'bathroom' || away.activity === 'lunch') {
                // Kerbal arrived at entrance, remove sprite (they leave the room)
                if (elapsed < 100) {
                  toRemove.push(item.sprite.name);
                  kerbalStore.goOnBreak(item.sprite.name, away.activity as 'bathroom' | 'lunch', away.activityDuration);
                }
                // Do not do activity animations for bathroom/lunch
                // The return-from-away check earlier in the render loop handles re-entry
                continue;
              }

              if (item.sprite.state === 'idle' && elapsed < away.activityDuration) {
                // Just arrived at activity target — start the activity pose
                if (away.activity === 'coffee') {
                  item.sprite.setState('drinking');
                } else if (away.activity === 'stretch') {
                  item.sprite.setState('stretching');
                } else if (away.activity === 'visit') {
                  item.sprite.setState('typing');
                } else {
                  item.sprite.setState('idle');
                }
              }

              if (elapsed >= away.activityDuration && item.sprite.state !== 'walking') {
                // Activity done — walk back to desk
                const desk = getDeskForKerbalFromLayout(item.sprite.name);
                if (desk) {
                  const dx = (desk.x / 100) * displayW;
                  const dy = (desk.y / 100) * displayH;
                  item.sprite.moveTo(dx, dy, 2000 + Math.random() * 1500);
                  awayStatesRef.current.delete(item.sprite.name);
                  // Will sit after arriving back (handled below)
                }
              }
            }

            // Kerbal just walked back to desk from an activity — sit down
            if (!away && !item.sprite.isMoving && item.sprite.state === 'idle') {
              const desk = getDeskForKerbalFromLayout(item.sprite.name);
              if (desk) {
                const dx = (desk.x / 100) * displayW;
                const dy = (desk.y / 100) * displayH;
                const pos = item.sprite.getPosition();
                const nearDesk = Math.abs(pos.x - dx) < 12 && Math.abs(pos.y - dy) < 12;
                const isTransitioning = transitioningRef.current.has(item.sprite.name);
                if (nearDesk && !isTransitioning) {
                  item.sprite.setState('sitting');
                }
              }
            }
          }
          break;
        }
        case 'coffee-station': {
          drawCoffeeStation(ctx, displayW, displayH);
          break;
        }
      }
    }

    // Coffee cups (render on top of desks but under lighting)
    drawCoffeeCups(ctx);

    ctx.restore();

    // Clean up departed kerbals
    for (const name of toRemove) {
      spritesRef.current.delete(name);
    }

    // ---- 6. Lighting overlay ----
    ctx.save();
    ctx.scale(w / displayW, h / displayH);
    drawLightingOverlay(ctx, displayW, displayH, timeOfDay);
    ctx.restore();

    rafIdRef.current = requestAnimationFrame(renderLoop);
  }, []);

  // -----------------------------------------------------------------------
  // Effects
  // -----------------------------------------------------------------------

  useEffect(() => {
    updateSizes();
    // Defer first sync — the container may not have its final dimensions
    // until after the browser paints the layout.
    const frame = requestAnimationFrame(() => {
      updateSizes();
      syncSprites();
      // Load real soul data into sprites after initial sync
      loadSoulsIntoSprites();
    });

    rafIdRef.current = requestAnimationFrame(renderLoop);

    const handleResize = () => {
      updateSizes();
      // Reposition non-transitioning sprites proportionally
      const { displayW, displayH } = sizesRef.current;
      for (const [name, sprite] of spritesRef.current.entries()) {
        const transitioning = transitioningRef.current.has(name);
        if (!transitioning && !sprite.isMoving) {
          const desk = getDeskForKerbalFromLayout(name);
          if (desk) {
            sprite.setPosition(
              (desk.x / 100) * displayW,
              (desk.y / 100) * displayH,
            );
          }
        }
      }
    };

    // Autonomous activity timer — kerbals wander around
    const activityInterval = setInterval(() => {
      const { displayW, displayH } = sizesRef.current;
      const coffeePos = getCoffeeStationPos(displayW, displayH);
      const entranceX = (ENTRANCE_POSITION.x / 100) * displayW;
      const entranceY = (ENTRANCE_POSITION.y / 100) * displayH;

      for (const [name, sprite] of spritesRef.current.entries()) {
        // Skip kerbals already busy
        if (transitioningRef.current.has(name)) continue;
        if (awayStatesRef.current.has(name)) continue;
        if (sprite.isMoving) continue;
        if (sprite.state !== 'sitting') continue;
        if (Math.random() > ACTIVITY_CHANCE) continue;

        const desk = getDeskForKerbalFromLayout(name);
        if (!desk) continue;

        const dx = (desk.x / 100) * displayW;
        const dy = (desk.y / 100) * displayH;

        // Choose activity
        const roll = Math.random();
        let activity: AwayActivity;
        let targetX: number;
        let targetY: number;
        let duration: number;

        if (roll < 0.2) {
          // Coffee run
          activity = 'coffee';
          targetX = coffeePos.x + (Math.random() - 0.5) * 30;
          targetY = coffeePos.y;
          duration = 5000 + Math.random() * 7000;
        } else if (roll < 0.35) {
          // Visit another kerbal's desk
          activity = 'visit';
          const otherDesks = DESK_POSITIONS.filter(d => d.assignedKerbal !== name && d.assignedKerbal);
          if (otherDesks.length === 0) continue;
          const pick = otherDesks[Math.floor(Math.random() * otherDesks.length)];
          targetX = (pick.x / 100) * displayW;
          targetY = (pick.y / 100) * displayH;
          duration = 4000 + Math.random() * 5000;
        } else if (roll < 0.5) {
          // Stretch near desk
          activity = 'stretch';
          targetX = dx + (Math.random() - 0.5) * 40;
          targetY = dy;
          duration = 3000 + Math.random() * 4000;
        } else if (roll < 0.65) {
          // Bathroom break — walk to entrance, leave, return
          activity = 'bathroom';
          targetX = entranceX;
          targetY = entranceY;
          duration = 180_000 + Math.random() * 300_000; // 3-8 minutes
        } else if (roll < 0.75) {
          // Lunch break — walk to entrance, leave, return
          activity = 'lunch';
          targetX = entranceX;
          targetY = entranceY;
          duration = 900_000 + Math.random() * 900_000; // 15-30 minutes
        } else {
          // Wander to random floor spot
          activity = 'wander';
          const randPos = getRandomFloorPos(displayW, displayH);
          targetX = randPos.x;
          targetY = randPos.y;
          duration = 3000 + Math.random() * 5000;
        }

        // Send the kerbal on their way
        sprite.setState('walking');
        sprite.moveTo(targetX, targetY, 1500 + Math.random() * 2000);

        awayStatesRef.current.set(name, {
          activity,
          deskX: dx,
          deskY: dy,
          targetX,
          targetY,
          arrivedAt: 0, // set when they actually arrive
          activityDuration: duration,
        });
      }
    }, ACTIVITY_CHECK_INTERVAL);

    // Coffee cup timer
    const coffeeInterval = setInterval(() => {
      const { displayW, displayH } = sizesRef.current;
      const deskRenderData = DESK_POSITIONS.map((d) => ({
        deskId: d.id,
        deskX: (d.x / 100) * displayW,
        deskY: (d.y / 100) * displayH,
        deskW: displayW * 0.09,
        deskH: displayH * 0.12,
      }));
      maybeAddCoffeeCup(deskRenderData);
      evictOldCoffeeCups();
    }, 2000);

    window.addEventListener('resize', handleResize);

    // Subscribe to timeSystem ticks (rAF loop reads time on every frame,
    // but this ensures we catch shift changes promptly)
    const unsubTime = timeSystem.subscribe(() => {
      // The render loop already reads the current time each frame,
      // so nothing extra needed here.
    });

    // Subscribe to kerbalStore changes — sync sprites only when state changes
    const unsubStore = kerbalStore.subscribe(() => {
      syncSprites();
      loadSoulsIntoSprites();
    });

    // Subscribe to proactiveAgent — trigger 'reacting' animation on sprites
    const unsubProactive = proactiveAgent.onMessage((msg) => {
      const sprite = spritesRef.current.get(msg.kerbalName);
      if (sprite) {
        sprite.setState('reacting');
        // Revert to sitting after 2 seconds if still at desk
        setTimeout(() => {
          if (sprite.state === 'reacting') {
            const kerbal = kerbalStore.getByName(msg.kerbalName);
            if (kerbal && kerbal.position === 'desk') {
              sprite.setState('sitting');
            }
          }
        }, 2000);
      }
    });

    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(rafIdRef.current);
      clearInterval(activityInterval);
      clearInterval(coffeeInterval);
      window.removeEventListener('resize', handleResize);
      unsubTime();
      unsubStore();
      unsubProactive();
    };
  }, [updateSizes, syncSprites, loadSoulsIntoSprites, renderLoop]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-gray-950 flex items-center justify-center"
    >
      <canvas
        ref={canvasRef}
        className="block rounded shadow-2xl"
      />
    </div>
  );
};

export default RoomCanvas;
