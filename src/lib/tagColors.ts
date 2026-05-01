import type { TagColor } from "@/types";

export const TAG_COLORS: TagColor[] = [
  "slate",
  "red",
  "orange",
  "amber",
  "emerald",
  "sky",
  "indigo",
  "fuchsia",
];

interface TagColorClasses {
  bg: string;
  text: string;
  dot: string;
  border: string;
  ring: string;
  bar: string;
}

// Full Tailwind class strings so v4 picks them up at scan time.
export const TAG_COLOR_CLASSES: Record<TagColor, TagColorClasses> = {
  slate: {
    bg: "bg-slate-500/15",
    text: "text-slate-700 dark:text-slate-300",
    dot: "bg-slate-500",
    border: "border-slate-500/30",
    ring: "ring-slate-500/40",
    bar: "bg-slate-500",
  },
  red: {
    bg: "bg-red-500/15",
    text: "text-red-700 dark:text-red-300",
    dot: "bg-red-500",
    border: "border-red-500/30",
    ring: "ring-red-500/40",
    bar: "bg-red-500",
  },
  orange: {
    bg: "bg-orange-500/15",
    text: "text-orange-700 dark:text-orange-300",
    dot: "bg-orange-500",
    border: "border-orange-500/30",
    ring: "ring-orange-500/40",
    bar: "bg-orange-500",
  },
  amber: {
    bg: "bg-amber-500/15",
    text: "text-amber-700 dark:text-amber-300",
    dot: "bg-amber-500",
    border: "border-amber-500/30",
    ring: "ring-amber-500/40",
    bar: "bg-amber-500",
  },
  emerald: {
    bg: "bg-emerald-500/15",
    text: "text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500",
    border: "border-emerald-500/30",
    ring: "ring-emerald-500/40",
    bar: "bg-emerald-500",
  },
  sky: {
    bg: "bg-sky-500/15",
    text: "text-sky-700 dark:text-sky-300",
    dot: "bg-sky-500",
    border: "border-sky-500/30",
    ring: "ring-sky-500/40",
    bar: "bg-sky-500",
  },
  indigo: {
    bg: "bg-indigo-500/15",
    text: "text-indigo-700 dark:text-indigo-300",
    dot: "bg-indigo-500",
    border: "border-indigo-500/30",
    ring: "ring-indigo-500/40",
    bar: "bg-indigo-500",
  },
  fuchsia: {
    bg: "bg-fuchsia-500/15",
    text: "text-fuchsia-700 dark:text-fuchsia-300",
    dot: "bg-fuchsia-500",
    border: "border-fuchsia-500/30",
    ring: "ring-fuchsia-500/40",
    bar: "bg-fuchsia-500",
  },
};

export function classesFor(color: TagColor): TagColorClasses {
  return TAG_COLOR_CLASSES[color] ?? TAG_COLOR_CLASSES.slate;
}
