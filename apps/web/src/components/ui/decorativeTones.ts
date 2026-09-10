// A small, shared palette for category-only coloring — telling visually
// similar cards/avatars apart when there's no real status to report (e.g.
// "Male" vs "Female" summary cards, or one class section vs another).
// Never repurpose these for an actual status meaning — success/warning/
// danger (see Badge, StatCard) stay reserved for that.
export type DecorativeTone = "violet" | "teal" | "amber" | "rose";

export const DECORATIVE_TONE_CLASSES: Record<DecorativeTone, string> = {
  violet: "bg-violet-50 text-violet-600",
  teal: "bg-teal-50 text-teal-600",
  amber: "bg-amber-50 text-amber-600",
  rose: "bg-rose-50 text-rose-600",
};

// Split bg/text pieces, for a consumer that composes its own combination
// (e.g. a soft background on one element and a white-on-color avatar on
// another) rather than using DECORATIVE_TONE_CLASSES as one combined class.
export const DECORATIVE_TONE_PARTS: Record<DecorativeTone, { soft: string; text: string }> = {
  violet: { soft: "bg-violet-50", text: "text-violet-600" },
  teal: { soft: "bg-teal-50", text: "text-teal-600" },
  amber: { soft: "bg-amber-50", text: "text-amber-600" },
  rose: { soft: "bg-rose-50", text: "text-rose-600" },
};
