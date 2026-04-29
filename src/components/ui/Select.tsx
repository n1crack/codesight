import { cn } from "@/lib/utils";

export interface SelectOption<T extends string | number = string> {
  value: T;
  label: string;
}

interface SelectProps<T extends string | number>
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange"> {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
}

export function Select<T extends string | number>({
  value,
  onChange,
  options,
  className,
  ...props
}: SelectProps<T>) {
  return (
    <select
      className={cn(
        "h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      value={value}
      onChange={(e) => {
        const next = e.target.value;
        const sample = options[0]?.value;
        if (typeof sample === "number") {
          onChange(Number(next) as T);
        } else {
          onChange(next as T);
        }
      }}
      {...props}
    >
      {options.map((o) => (
        <option key={String(o.value)} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
