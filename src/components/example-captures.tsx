"use client";

import { ui } from "./ui";

const EXAMPLES = [
  "Call Matt about the skid steer quote Friday",
  "Waiting on the parts quote from Bobcat",
  "Note: shop Wi-Fi password rotates Oct 1",
];

/** Tappable sample captures that fill the capture box, for first-run screens. */
export function ExampleCaptures() {
  function fill(text: string) {
    const el = document.getElementById("capture");
    if (!(el instanceof HTMLTextAreaElement)) return;
    el.value = text;
    el.focus();
    el.setSelectionRange(text.length, text.length);
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <span className={ui.sectionTitle}>Try one</span>
      <div className="flex flex-wrap justify-center gap-1.5">
        {EXAMPLES.map((text) => (
          <button
            key={text}
            type="button"
            onClick={() => fill(text)}
            className={`${ui.chip} max-w-full border border-line bg-surface text-left normal-case text-foreground hover:border-accent hover:opacity-100`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
