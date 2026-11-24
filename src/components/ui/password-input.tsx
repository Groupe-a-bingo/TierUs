"use client"

import * as React from "react"
import { flushSync } from "react-dom"
import { Eye, EyeOff } from "lucide-react"
import { cn } from "cn"
import { Input } from "@/components/ui/input"

function PasswordInput({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  const [visible, setVisible] = React.useState(false)
  const rootRef = React.useRef<HTMLDivElement>(null)

  // Back to type="password" before the form handles the submit, so browsers
  // and password managers still see a password field and offer to save it.
  React.useEffect(() => {
    const form = rootRef.current?.closest("form")
    if (!form) return
    const hide = () => flushSync(() => setVisible(false))
    form.addEventListener("submit", hide)
    return () => form.removeEventListener("submit", hide)
  }, [])

  return (
    <div ref={rootRef} data-slot="password-input" className={cn("relative", className)}>
      {/* ::-ms-reveal: Edge's own eye button, which would double ours */}
      <Input {...props} type={visible ? "text" : "password"} className="pr-12 [&::-ms-reveal]:hidden" />
      <button
        type="button"
        aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        aria-pressed={visible}
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:text-foreground"
      >
        {visible ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
      </button>
    </div>
  )
}

export { PasswordInput }
