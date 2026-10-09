"use client";

import { identity } from "@/app/identity";
import { wrapText } from "@/lib/share";

/**
 * The pattern card: a 1080×1920 story image showing the grid itself — four rows of sixteen
 * steps — with the pattern's name, the tempo and the app's name, so a beat can be posted to
 * Stories as a picture. Drawn only when the visitor presses Share, then handed to
 * `shareImage` from `lib/share`, which picks the share sheet or a download.
 */

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const WIDTH = 1080;
const HEIGHT = 1920;
const BAND = 28;
const PADDING = 88;
/** Kept clear at the top and bottom, where Stories apps put their own buttons. */
const SAFE_TOP = 250;
const SAFE_BOTTOM = 340;
const BACKGROUND = "#0b0b0c";
const FOREGROUND = "#f5f5f4";
const MUTED = "#a8a29e";
const EMPTY_CELL = "#232326";

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, r);
  } else {
    // Older canvas: a plain rectangle keeps the card honest even without the rounded corners.
    ctx.rect(x, y, w, h);
  }
  ctx.fill();
}

export type PatternCardRow = { label: string; steps: boolean[] };

export async function renderPatternCard(options: {
  name: string;
  tempo: number;
  rows: PatternCardRow[];
}): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot draw a share image.");

  const accent = identity.accent;

  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, WIDTH, BAND);

  const title = options.name.trim() || "Untitled pattern";

  // Measure the text blocks first, so the whole stack can be centred between the safe areas.
  ctx.textBaseline = "top";
  ctx.textAlign = "left";

  ctx.font = `800 96px ${FONT}`;
  const titleWidth = WIDTH - PADDING * 2;
  const titleLines = wrapText(title, (text) => ctx.measureText(text).width, titleWidth, 2);

  const subtitle = `${options.tempo} BPM · 16 steps · 4 tracks`;
  ctx.font = `400 44px ${FONT}`;
  const subtitleHeight = 44;

  const grid = options.rows.slice(0, 4);
  const labelWidth = 170;
  const cellGap = 8;
  const cellWidth = Math.floor((WIDTH - PADDING * 2 - labelWidth - cellGap * 15) / 16);
  const cellHeight = Math.max(40, cellWidth);
  const rowGap = 20;
  const rulerHeight = 44;
  const gridHeight = rulerHeight + grid.length * (cellHeight + rowGap) - rowGap;

  const titleBlockHeight = titleLines.length * 106;
  const stackGap = 56;
  const contentHeight = titleBlockHeight + stackGap + subtitleHeight + stackGap + gridHeight;
  const top = BAND + SAFE_TOP + Math.max(0, Math.floor((HEIGHT - BAND - SAFE_TOP - SAFE_BOTTOM - contentHeight) / 2));

  let y = top;
  ctx.fillStyle = FOREGROUND;
  for (const line of titleLines) {
    ctx.fillText(line, PADDING, y);
    y += 106;
  }

  y += stackGap;
  ctx.fillStyle = MUTED;
  ctx.fillText(subtitle, PADDING, y);
  y += subtitleHeight + stackGap;

  // The beat ruler: which columns are beats 1 to 4.
  ctx.font = `600 32px ${FONT}`;
  ctx.fillStyle = MUTED;
  for (let beat = 0; beat < 4; beat++) {
    const x = PADDING + labelWidth + beat * 4 * (cellWidth + cellGap);
    ctx.fillText(String(beat + 1), x, y);
  }
  y += rulerHeight;

  // The grid. Row labels to the left, active steps filled with the accent colour.
  const rows = [...grid];
  while (rows.length < 4) rows.push({ label: "", steps: [] });
  rows.forEach((row, rowIndex) => {
    const rowTop = y + rowIndex * (cellHeight + rowGap);
    ctx.font = `500 32px ${FONT}`;
    ctx.textAlign = "right";
    ctx.fillStyle = MUTED;
    ctx.fillText(row.label, PADDING + labelWidth - 18, rowTop + Math.floor((cellHeight - 32) / 2));
    ctx.textAlign = "left";
    for (let step = 0; step < 16; step++) {
      const x = PADDING + labelWidth + step * (cellWidth + cellGap);
      if (row.steps[step]) {
        ctx.fillStyle = accent;
        roundedRect(ctx, x, rowTop, cellWidth, cellHeight, 8);
      } else {
        ctx.fillStyle = EMPTY_CELL;
        roundedRect(ctx, x, rowTop, cellWidth, cellHeight, 8);
      }
    }
  });

  // The app's name at the bottom, inside the safe area.
  const mark = 36;
  const footerTop = HEIGHT - SAFE_BOTTOM - mark;
  ctx.fillStyle = accent;
  roundedRect(ctx, PADDING, footerTop, mark, mark, 6);
  ctx.font = `600 38px ${FONT}`;
  ctx.fillStyle = MUTED;
  ctx.fillText(identity.name, PADDING + mark + 20, footerTop + 1);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The share image could not be made."))), "image/png");
  });
}