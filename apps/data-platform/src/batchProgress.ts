// How a fermenting batch compares to its recipe's target sugar curve, and the
// counts the workspace reports. No JSX here, so Node can run it directly.
import type { InstanceRow } from "./api.ts";

/** Deviation from the curve, in specific gravity, that each band allows. */
export const ON_TRACK_LIMIT = 0.005;
export const BEHIND_LIMIT = 0.008;

/** Milliseconds in the maintenance look-back window. */
export const MAINTENANCE_WINDOW_DAYS = 7;

export type Band = "on-track" | "watch" | "behind" | "unknown";

export type BatchProgress = {
  id: string;
  recipeId: string;
  recipeName: string;
  status: string;
  tankId: string | null;
  daysFermenting: number | null;
  sugarLevel: number | null;
  target: number | null;
  /** current − target. Positive means sugar has not dropped as far as planned. */
  delta: number | null;
  band: Band;
};

type CurvePoint = { day: number; value: number };

/** `{"day_1": 1.050, "day_4": 1.035}` in ascending day order. */
function curvePoints(curve: unknown): CurvePoint[] {
  if (typeof curve !== "object" || curve === null || Array.isArray(curve)) return [];
  return Object.entries(curve as Record<string, unknown>)
    .map(([key, value]) => ({ day: Number(key.replace(/^day_/, "")), value: Number(value) }))
    .filter((point) => Number.isFinite(point.day) && Number.isFinite(point.value))
    .sort((a, b) => a.day - b.day);
}

/**
 * The curve gives a handful of checkpoints, and a batch is rarely standing on
 * one, so days in between are read off the straight line joining them. Before
 * the first and after the last checkpoint the curve is held flat.
 */
export function targetAtDay(curve: unknown, day: number): number | null {
  const points = curvePoints(curve);
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last || !Number.isFinite(day)) return null;

  if (day <= first.day) return first.value;
  if (day >= last.day) return last.value;

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (!start || !end || day < start.day || day > end.day) continue;
    const span = end.day - start.day;
    return span === 0 ? start.value : start.value + ((day - start.day) * (end.value - start.value)) / span;
  }

  return last.value;
}

/**
 * Readings and limits alike carry three decimals, so comparisons are made at
 * that scale. Subtracting them in binary floating point does not: 1.018 - 1.013
 * lands on 0.005000000000000115, and comparing that exactly would paint one row
 * amber while an identical-looking one stayed green.
 */
function atReadingScale(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/** Colour band. Distance from the curve, in either direction. */
export function bandFor(delta: number | null): Band {
  if (delta === null) return "unknown";
  const distance = atReadingScale(Math.abs(delta));
  if (distance <= ON_TRACK_LIMIT) return "on-track";
  if (distance <= BEHIND_LIMIT) return "watch";
  return "behind";
}

/** Behind is directional: at or above the curve by the limit, fermenting too slowly. */
export function isBehindTarget(delta: number | null): boolean {
  return delta !== null && atReadingScale(delta) >= BEHIND_LIMIT;
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function textOrNull(value: unknown): string | null {
  return value === null || value === undefined || value === "" ? null : String(value);
}

export function buildProgress(batches: InstanceRow[], recipes: InstanceRow[]): BatchProgress[] {
  const byRecipe = new Map(recipes.map((recipe) => [String(recipe["id"]), recipe]));

  return batches.map((batch): BatchProgress => {
    const recipeId = String(batch["recipeId"] ?? "");
    const recipe = byRecipe.get(recipeId);
    const days = numberOrNull(batch["daysFermenting"]);
    const sugarLevel = numberOrNull(batch["currentSugarLevel"]);
    const target = days === null ? null : targetAtDay(recipe?.["targetSugarCurve"], days);
    const delta = sugarLevel === null || target === null ? null : sugarLevel - target;

    return {
      id: String(batch["id"]),
      recipeId,
      recipeName: recipe ? String(recipe["name"]) : recipeId,
      status: String(batch["status"] ?? ""),
      tankId: textOrNull(batch["assignedTankId"]),
      daysFermenting: days,
      sugarLevel,
      target,
      delta,
      band: bandFor(delta),
    };
  });
}

/**
 * Tanks serviced within the window ending at `now`. A log is dated by when the
 * work finished, falling back to when it started if it is still open.
 */
export function tanksServicedSince(logs: InstanceRow[], now: Date, days = MAINTENANCE_WINDOW_DAYS): Set<string> {
  const until = now.getTime();
  const from = until - days * 24 * 60 * 60 * 1000;
  const tanks = new Set<string>();

  for (const log of logs) {
    if (String(log["targetType"]) !== "tank") continue;
    const when = log["completedAt"] ?? log["startedAt"];
    const targetId = textOrNull(log["targetId"]);
    if (when === null || when === undefined || targetId === null) continue;

    const at = new Date(String(when)).getTime();
    if (Number.isFinite(at) && at >= from && at <= until) tanks.add(targetId);
  }

  return tanks;
}

export type WorkspaceMetrics = {
  fermenting: number;
  behindTarget: number;
  recentTankMaintenance: number;
};

export function metricsFor(rows: BatchProgress[], servicedTanks: Set<string>): WorkspaceMetrics {
  const fermenting = rows.filter((row) => row.status === "fermenting");
  return {
    fermenting: fermenting.length,
    behindTarget: fermenting.filter((row) => isBehindTarget(row.delta)).length,
    recentTankMaintenance: fermenting.filter((row) => row.tankId !== null && servicedTanks.has(row.tankId)).length,
  };
}

export type FermentationWindow = { from: Date; to: Date };

/**
 * From the planned start through the batch's current day. A batch with no day
 * count yet is measured up to now, so an event today still lands inside it.
 */
export function fermentationWindow(
  plannedStart: unknown,
  daysFermenting: number | null,
  now: Date,
): FermentationWindow | null {
  if (plannedStart === null || plannedStart === undefined || plannedStart === "") return null;

  const from = new Date(String(plannedStart));
  if (Number.isNaN(from.getTime())) return null;

  const to =
    daysFermenting === null ? now : new Date(from.getTime() + daysFermenting * 24 * 60 * 60 * 1000);
  return { from, to: to.getTime() < from.getTime() ? from : to };
}

/** Whether a timestamp falls inside the window, inclusive at both ends. */
export function fallsWithin(window: FermentationWindow | null, value: unknown): boolean {
  if (!window || value === null || value === undefined || value === "") return false;
  const at = new Date(String(value)).getTime();
  return Number.isFinite(at) && at >= window.from.getTime() && at <= window.to.getTime();
}
