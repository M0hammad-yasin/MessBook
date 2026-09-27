import * as React from "react";
import { cn } from "@/lib/utils";
export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="relative w-full overflow-x-auto">
      <table className={cn("w-full text-left text-sm", className)} {...props} />
    </div>
  );
}
export function TableHeader(props: React.ComponentProps<"thead">) {
  return (
    <thead
      className="border-b border-stone-200 bg-stone-50/70 text-xs text-stone-500"
      {...props}
    />
  );
}
export function TableBody(props: React.ComponentProps<"tbody">) {
  return <tbody className="divide-y divide-stone-100" {...props} />;
}
export function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr className={cn("hover:bg-stone-50/70", className)} {...props} />;
}
export function TableHead(props: React.ComponentProps<"th">) {
  return (
    <th className="whitespace-nowrap px-5 py-3.5 font-medium" {...props} />
  );
}
export function TableCell(props: React.ComponentProps<"td">) {
  return <td className="whitespace-nowrap px-5 py-4" {...props} />;
}
