import { LayoutList, Lightbulb, Shield, User, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; short: string; Icon: LucideIcon; match: (path: string) => boolean };

/** The app's sections, shared by the desktop side nav and the phone bottom bar. */
export function navItems({ isMod, profile }: { isMod: boolean; profile: boolean }): NavItem[] {
  return [
    { href: "/", label: "Board", short: "Board", Icon: LayoutList, match: (p) => p === "/" || p.startsWith("/r/") },
    { href: "/ideas", label: "Idées", short: "Idées", Icon: Lightbulb, match: (p) => p.startsWith("/ideas") },
    ...(isMod ? [{ href: "/mod", label: "Modération", short: "Mod", Icon: Shield, match: (p: string) => p.startsWith("/mod") }] : []),
    // desktop: the profile is the card at the bottom of the side nav
    ...(profile ? [{ href: "/profile", label: "Profil", short: "Profil", Icon: User, match: (p: string) => p.startsWith("/profile") }] : []),
  ];
}
