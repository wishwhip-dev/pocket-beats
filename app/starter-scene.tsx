"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CanvasStage } from "@/components/canvas-stage";

/** The placeholder drawing: a 2D loop, a Pause button wired to the stage, and nothing else. Delete it. */
export function StarterScene() {
  const [paused, setPaused] = useState(false);
  return (
    <div className="space-y-3">
      <CanvasStage
        label="Twelve dots orbiting the centre of the stage."
        fallback={<p>Twelve dots orbiting the centre of the stage.</p>}
        paused={paused}
        start={({ ctx, width, height }) => {
          let w = width;
          let h = height;
          const colour = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() || "#a9d977";
          return {
            resize: (nextWidth, nextHeight) => {
              w = nextWidth;
              h = nextHeight;
            },
            frame: (elapsed) => {
              ctx.clearRect(0, 0, w, h);
              ctx.fillStyle = colour;
              for (let i = 0; i < 12; i++) {
                const angle = elapsed * 0.6 + (i / 12) * Math.PI * 2;
                const radius = Math.min(w, h) * 0.3;
                ctx.beginPath();
                ctx.arc(w / 2 + Math.cos(angle) * radius, h / 2 + Math.sin(angle) * radius, 6, 0, Math.PI * 2);
                ctx.fill();
              }
            },
          };
        }}
      />
      <Button variant="outline" onClick={() => setPaused((value) => !value)}>
        {paused ? "Resume animation" : "Pause animation"}
      </Button>
    </div>
  );
}
