import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

/**
 * Chunky "arcade" buttons: hard ink shadow that collapses on press,
 * so every tap gives instant physical feedback (no waiting on the network).
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-ink font-display font-semibold whitespace-nowrap outline-none select-none transition-[transform,box-shadow,background-color] duration-100 ease-out focus-visible:ring-4 focus-visible:ring-ring/40 active:translate-y-1 active:shadow-none disabled:pointer-events-none disabled:opacity-40 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-pop hover:brightness-105",
        secondary: "bg-secondary text-secondary-foreground shadow-pop hover:bg-muted",
        outline: "border-board-edge bg-transparent text-foreground shadow-none hover:bg-secondary active:translate-y-0.5",
        ghost: "border-transparent bg-transparent text-muted-foreground shadow-none hover:bg-secondary hover:text-foreground active:translate-y-0",
        destructive: "bg-tier-s text-tier-foreground shadow-pop hover:brightness-105",
        link: "border-transparent bg-transparent text-primary underline-offset-4 shadow-none hover:underline active:translate-y-0",
      },
      size: {
        default: "h-11 px-4 text-base",
        xs: "h-7 gap-1 rounded-lg px-2 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-9 rounded-lg px-3 text-sm [&_svg:not([class*='size-'])]:size-4",
        lg: "h-14 px-6 text-lg",
        xl: "h-16 rounded-2xl px-6 text-xl",
        icon: "size-11",
        "icon-xs": "size-7 rounded-lg [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-9 rounded-lg",
        "icon-lg": "size-14",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
