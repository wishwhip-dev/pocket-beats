"use client";

import { useId, useState, type ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { shareImage, shareLink, shareStatusText, type ShareOutcome } from "@/lib/share";
import { cn } from "@/lib/utils";

/**
 * The one share control: press it and the result goes to the device's share sheet, or is saved or
 * copied where there is none, with what happened written underneath.
 *
 * - With `makeImage`, it makes the picture when pressed (usually `() => renderShareCard({...})`) and
 *   shares that file; on a desktop without a share sheet the image is saved instead.
 * - Without it, it shares `url` (default: this page's address), or copies it.
 *
 * Every state is text under the button: "Preparing image…", "Shared", "Image saved", "Link
 * copied", "Not shared", "Sharing isn't available here" (with the link written out to copy by
 * hand). Nothing happens until the visitor presses it.
 *
 * The label says what is shared — "Share result", "Share score", "Share card". Never a word for
 * removing or replacing data: this control only sends a copy out.
 */
export type ShareButtonProps = {
  /** Makes the image to share, when pressed. Omit to share a link instead. */
  makeImage?: () => Promise<Blob>;
  /** The link to share when there is no `makeImage`. Default: the current page's address. */
  url?: string;
  /** Passed to the share sheet; some apps show it, some ignore it. */
  title: string;
  /** A sentence to go with it; some apps show it, some ignore it. */
  text?: string;
  /** The image's file name when saved or shared. Default "share.png". */
  filename?: string;
  /** The button's text. Default "Share result". */
  label?: string;
  variant?: ComponentProps<typeof Button>["variant"];
  disabled?: boolean;
  /** Called once each press has an outcome. */
  onShare?: (outcome: ShareOutcome) => void;
  className?: string;
};

export function ShareButton({ makeImage, url, title, text, filename = "share.png", label = "Share result", variant = "default", disabled = false, onShare, className }: ShareButtonProps) {
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<ShareOutcome | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [sharedUrl, setSharedUrl] = useState<string | null>(null);
  const statusId = useId();

  const share = async () => {
    setBusy(true);
    setProblem(null);
    setOutcome(null);
    let result: ShareOutcome;
    try {
      if (makeImage) {
        let image: Blob;
        try {
          image = await makeImage();
        } catch (error) {
          setProblem(`The image could not be made${error instanceof Error && error.message ? `: ${error.message}` : "."}`);
          result = "failed";
          setOutcome(result);
          onShare?.(result);
          return;
        }
        result = await shareImage(image, { title, text, filename });
      } else {
        const link = url ?? window.location.href;
        setSharedUrl(link);
        result = await shareLink(link, { title, text });
      }
      setOutcome(result);
      onShare?.(result);
    } finally {
      setBusy(false);
    }
  };

  const status = busy
    ? makeImage
      ? "Preparing image…"
      : "Opening share options…"
    : problem ?? shareStatusText(outcome);

  return (
    <div data-share-button="" className={cn("flex flex-col items-start gap-1.5", className)}>
      <Button type="button" variant={variant} disabled={disabled || busy} aria-describedby={statusId} onClick={() => void share()}>
        {label}
      </Button>
      {/* Always mounted, so screen readers announce each new state. */}
      <p id={statusId} aria-live="polite" className={cn("min-h-5 text-sm", problem ? "text-destructive" : "text-muted-foreground")}>
        {status}
        {!busy && outcome === "unsupported" && sharedUrl ? (
          <>
            {". Copy this link: "}
            <span className="select-all break-all font-mono text-foreground">{sharedUrl}</span>
          </>
        ) : null}
      </p>
    </div>
  );
}
