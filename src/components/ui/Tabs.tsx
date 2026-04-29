import { cn } from "@/lib/utils";

export interface TabItem<T extends string> {
  value: T;
  label: string;
}

interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}

export function Tabs<T extends string>({ items, value, onChange, className }: TabsProps<T>) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex items-center rounded-md bg-muted p-1 text-muted-foreground",
        className,
      )}
    >
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cn(
            "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === it.value
              ? "bg-background text-foreground shadow"
              : "hover:text-foreground",
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
