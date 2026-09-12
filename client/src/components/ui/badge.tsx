import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        // A SOLID pair, not `bg-primary/10 text-primary`. That composite is why the *Suoritus*
        // badge sat in the browser walk's KNOWN_VIOLATIONS at 3.25:1: an alpha tint has no single
        // token behind it, so tokens-contrast.test.ts could not express the pair and only axe
        // could see it — and it then measured differently over a card than over the page.
        // `--accent` / `--accent-foreground` carry the same visual intent (the design system's
        // `primary-soft`) as two real tokens, gated in both themes. Spec 0006 slice 2.
        //
        // No hover state: these badges are non-interactive status labels on a <div>, so a colour
        // change on hover only suggested they could be clicked.
        default: "border-transparent bg-accent text-accent-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive/10 text-destructive hover:bg-destructive/15",
        outline: "text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
