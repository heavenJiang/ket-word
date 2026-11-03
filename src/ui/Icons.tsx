import type { ReactElement } from "react";

/**
 * Tab-bar icons drawn as one set: round strokes in the text colour with a soft tint inside, so they
 * look the same on every tablet (system emoji differ from device to device) and sit well beside Max.
 */
export type IconName = "home" | "map" | "stories" | "cards" | "parent";

const PATHS: Record<IconName, ReactElement> = {
  home: (
    <>
      <path className="tint" d="M6 10.5 12 5l6 5.5V19a1 1 0 0 1-1 1h-3.5v-5h-3v5H7a1 1 0 0 1-1-1Z" />
      <path d="M3.5 12 12 4.5l8.5 7.5" />
      <path d="M6 10.5V19a1 1 0 0 0 1 1h3.5v-5h3v5H17a1 1 0 0 0 1-1v-8.5" />
    </>
  ),
  map: (
    <>
      <path className="tint" d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20Z" />
      <path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20Z" />
      <path d="M9 4v13.5M15 6.5V20" />
    </>
  ),
  stories: (
    <>
      <path className="tint" d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5Z" />
      <path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5Z" />
      <path d="M12 6.5v13" />
    </>
  ),
  cards: (
    <>
      <rect x="3.5" y="6" width="10.5" height="14.5" rx="2.5" transform="rotate(-10 8.75 13.25)" />
      <rect className="tint-solid" x="9.5" y="3.5" width="11" height="15" rx="2.5" />
      <rect x="9.5" y="3.5" width="11" height="15" rx="2.5" />
      <path d="m15 8 1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3Z" />
    </>
  ),
  parent: (
    <>
      <circle className="tint" cx="9" cy="8" r="3.2" />
      <circle cx="9" cy="8" r="3.2" />
      <circle className="tint" cx="16.8" cy="10" r="2.4" />
      <circle cx="16.8" cy="10" r="2.4" />
      <path d="M3.5 19.5c0-3.4 2.5-6 5.5-6s5.5 2.6 5.5 6" />
      <path d="M14.3 15c.7-.4 1.5-.6 2.5-.6 2.4 0 4.2 2.1 4.2 5.1" />
    </>
  ),
};

export function Icon({ name, size = 26 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {PATHS[name]}
    </svg>
  );
}
