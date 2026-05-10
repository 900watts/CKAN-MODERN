// ==========================================================================
// RoomLayout.ts  —  Mission Control 2.5D room layout definitions
// ==========================================================================
//
// The coordinate system uses percentage-of-canvas (0–100) for both axes.
// The canvas is rendered at 16:9 aspect ratio.
// --------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Desk positions
// ---------------------------------------------------------------------------

export interface DeskPosition {
  id: string;
  /** Horizontal position as percentage of canvas width */
  x: number;
  /** Vertical position as percentage of canvas height */
  y: number;
  /** Which Kerbal is assigned to this desk (null if empty) */
  assignedKerbal: string | null;
  /** Whether the desk has an active monitor */
  hasMonitor: boolean;
  /** Which direction the Kerbal faces when seated */
  facing: 'left' | 'right' | 'front';
}

/**
 * Desk layout inspired by KSP's Mission Control:
 *
 *   - Row 1 (front): 3 desks closest to the big screen, faces front
 *   - Row 2 (middle): 3 desks, slightly elevated (slightly higher Y so they
 *     appear farther back in a top-down-ish 2.5D view), face front
 *   - Row 3 (back): 2 desks for senior staff / admin, faces front
 *
 * All positions are percentages of the canvas dimensions.
 */
export const DESK_POSITIONS: DeskPosition[] = [
  // ---------- Back Row (near wall) ----------
  {
    id: 'desk-back-left',
    x: 22,
    y: 76,
    assignedKerbal: 'Gene',
    hasMonitor: true,
    facing: 'front',
  },
  {
    id: 'desk-back-center',
    x: 38,
    y: 76,
    assignedKerbal: 'Walt',
    hasMonitor: true,
    facing: 'front',
  },
  {
    id: 'desk-back-right',
    x: 54,
    y: 76,
    assignedKerbal: 'Wernher',
    hasMonitor: true,
    facing: 'front',
  },

  // ---------- Middle Row ----------
  {
    id: 'desk-mid-left',
    x: 18,
    y: 82,
    assignedKerbal: 'Linus',
    hasMonitor: true,
    facing: 'front',
  },
  {
    id: 'desk-mid-center',
    x: 36,
    y: 82,
    assignedKerbal: 'Jebediah',
    hasMonitor: true,
    facing: 'front',
  },
  {
    id: 'desk-mid-right',
    x: 54,
    y: 82,
    assignedKerbal: 'Valentina',
    hasMonitor: true,
    facing: 'front',
  },

  // ---------- Front Row (closest to camera) ----------
  {
    id: 'desk-front-left',
    x: 22,
    y: 88,
    assignedKerbal: 'Bill',
    hasMonitor: true,
    facing: 'front',
  },
  {
    id: 'desk-front-center',
    x: 38,
    y: 88,
    assignedKerbal: 'Bob',
    hasMonitor: true,
    facing: 'front',
  },
  {
    id: 'desk-front-right',
    x: 54,
    y: 88,
    assignedKerbal: 'Mortimer',
    hasMonitor: true,
    facing: 'front',
  },
];

// ---------------------------------------------------------------------------
// Room zones
// ---------------------------------------------------------------------------

export interface RoomZone {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'desk-area' | 'coffee-station' | 'entrance' | 'hangout' | 'briefing';
}

export const ROOM_ZONES: RoomZone[] = [
  {
    id: 'zone-desk-back',
    x: 16,
    y: 72,
    width: 44,
    height: 8,
    type: 'desk-area',
  },
  {
    id: 'zone-desk-mid',
    x: 12,
    y: 78,
    width: 50,
    height: 8,
    type: 'desk-area',
  },
  {
    id: 'zone-desk-front',
    x: 22,
    y: 84,
    width: 32,
    height: 8,
    type: 'desk-area',
  },
  {
    id: 'zone-coffee',
    x: 76,
    y: 82,
    width: 14,
    height: 12,
    type: 'coffee-station',
  },
  {
    id: 'zone-entrance',
    x: 80,
    y: 68,
    width: 14,
    height: 10,
    type: 'entrance',
  },
  {
    id: 'zone-briefing',
    x: 62,
    y: 74,
    width: 16,
    height: 18,
    type: 'briefing',
  },
  {
    id: 'zone-hangout',
    x: 66,
    y: 80,
    width: 14,
    height: 14,
    type: 'hangout',
  },
];

// ---------------------------------------------------------------------------
// Named waypoints
// ---------------------------------------------------------------------------

/** Where Kerbals walk to for a fresh cup of space-grade coffee. */
export const COFFEE_POSITION = { x: 82, y: 86 };

/** The door through which Kerbals enter and leave the room. */
export const ENTRANCE_POSITION = { x: 86, y: 72 };

/** Gathering point for mission briefings. */
export const BRIEFING_POSITION = { x: 70, y: 80 };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find the desk assigned to a particular Kerbal by name.
 * Returns `undefined` if no desk is assigned to that Kerbal.
 */
export function getDeskForKerbal(name: string): DeskPosition | undefined {
  return DESK_POSITIONS.find((d) => d.assignedKerbal === name);
}

/**
 * Look up a room zone by its string id.
 */
export function getZoneById(id: string): RoomZone | undefined {
  return ROOM_ZONES.find((z) => z.id === id);
}
