import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

/**
 * Soft, tinted pills. Colour carries meaning (success, warning, info, violet,
 * destructive) and the optional dot repeats it so it is never colour alone.
 */
const badgeVariants = cva(
  "group/badge inline-flex h-5.5 w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[background-color,color,border-color,box-shadow] duration-200 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default:
          "bg-primary/12 text-primary [--dot:var(--primary)] dark:bg-primary/18 [a]:hover:bg-primary/20",
        secondary:
          "bg-secondary text-secondary-foreground [--dot:var(--muted-foreground)] [a]:hover:bg-secondary/80",
        destructive:
          "bg-destructive/10 text-destructive [--dot:var(--destructive)] focus-visible:ring-destructive/20 dark:bg-destructive/18 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
        success:
          "bg-success/12 text-success [--dot:var(--success)] dark:bg-success/16",
        warning:
          "bg-warning/14 text-warning [--dot:var(--warning)] dark:bg-warning/16",
        info: "bg-info/12 text-info [--dot:var(--info)] dark:bg-info/16",
        violet:
          "bg-violet/12 text-violet [--dot:var(--violet)] dark:bg-violet/16",
        teal: "bg-teal/12 text-teal [--dot:var(--teal)] dark:bg-teal/16",
        outline:
          "border-border bg-card/60 text-muted-foreground [--dot:var(--muted-foreground)] [a]:hover:bg-muted [a]:hover:text-foreground",
        ghost:
          "text-muted-foreground hover:bg-muted hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  dot = false,
  render,
  children,
  ...props
}: useRender.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    /** Show a small status dot before the label. */
    dot?: boolean
  }) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
        children: dot ? (
          <>
            <span
              aria-hidden="true"
              className="size-1.5 shrink-0 rounded-full bg-(--dot,currentColor)"
            />
            {children}
          </>
        ) : (
          children
        ),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
