# DESIGN.md — TierUs

Le système visuel de TierUs : « arcade tier board ». À lire avant de toucher à l'UI.
La source de vérité reste `src/app/globals.css` (tokens) et les composants ; ce fichier explique les règles.

## Principes

- **Charbon chaud + six pastels de tiers.** Le fond est sombre et neutre ; les seules couleurs vives sont celles des tiers (S → F). Pas d'autre accent.
- **Contrôles « stickers » qu'on presse.** Bordure encre (`border-ink`), coins arrondis, ombre dure décalée (`shadow-pop*`) qui s'écrase au clic. Chaque tap donne un retour physique immédiat, sans attendre le réseau.
- **Mobile d'abord.** Navigation en bas sur mobile, barre latérale sur desktop (`lg:`). Les appuis longs sont des gestes, pas de la sélection de texte.
- **Pas de couleur ni de valeur en dur.** ESLint (`@shadcn/lint`) refuse les couleurs brutes, valeurs arbitraires, styles inline et restyles des composants `ui/`. Utilise les tokens.

## Couleurs (tokens)

| Rôle | Token Tailwind | Valeur |
| --- | --- | --- |
| Tier S / A / B / C / D / F | `bg-tier-s` … `bg-tier-f` | `#ff7f7f` `#ffbf7f` `#ffdf7f` `#ffff7f` `#bfff7f` `#7fbfff` |
| Texte sur un tier | `text-tier-foreground` | `#1a1a17` |
| Fond de page | `bg-background` | `#141412` |
| Carte | `bg-card` | `#1f1f1b` |
| Plateau / ligne / bord | `bg-board`, `bg-board-row`, `border-board-edge` | `#1a1a17` `#262621` `#34342d` |
| Encre (contours, ombres) | `border-ink` | `#0b0b09` |
| Primaire (= tier B) | `bg-primary` | `#ffdf7f` |
| Destructif (= tier S) | `bg-destructive` | `#ff7f7f` |
| Texte secondaire | `text-muted-foreground` | `#a8a497` |
| Série (compteur) | `text-streak` | `#ffbf7f` |

Une seule palette (sombre) : pas de thème clair.

## Typographie

- **Titres, boutons, chiffres** : Bricolage Grotesque (`font-display`), gras à extra-gras.
- **Texte courant** : Instrument Sans (`font-sans`).
- Les titres de section en liste : `text-sm font-semibold uppercase tracking-wide text-muted-foreground`.

## Formes et profondeur

- Rayon de base `--radius: 0.75rem` ; échelle `rounded-sm` → `rounded-4xl` dérivée.
- Ombres : `shadow-pop-sm` (3 px), `shadow-pop` (5 px), `shadow-pop-lg` (8 px), toujours couleur encre, sans flou.
- `pressable` : descend de 3 px et écrase l'ombre au `:active`.
- Les pastilles (statuts, chips, compteurs) sont en `rounded-full` ; **les avatars, jamais** (voir plus bas).

## Avatars

Toujours `AvatarTile` (`src/components/tier-board/avatar-tile.tsx`), **toujours carrés**, à toutes les tailles :

| Taille | Usage | Forme |
| --- | --- | --- |
| `sm` | listes (modération, file « Ensuite ») | 32 px, `rounded-lg`, contour encre |
| `md` | lignes de tier | 64 px, carré plein bord à bord (comme TierMaker) |
| `story` | stories | 64 px, `rounded-xl`, contour encre |
| `lg` | en-têtes | 80 px, `rounded-2xl`, contour encre |
| `xl` | profil | 144 px, `rounded-3xl`, contour 4 px + `shadow-pop-lg` |

Sans photo : initiales sur une couleur de tier déterministe (dérivée du nom). États : `selected` (anneau primaire), `dim` (grisé, pendant un glisser).
N'utilise pas `components/ui/avatar` (rond) pour un membre.

## Composants

- **Button** (`ui/button.tsx`) : `default` (jaune B + ombre), `secondary`, `outline` (bord plateau, sans ombre), `ghost`, `destructive` (rouge S), `link`. Tailles `xs` → `xl` et `icon*`.
- **Card** : `rounded-2xl`, bord `board-edge`, `shadow-pop`.
- **EmptyState** : le seul message « rien ici », centré, `text-muted-foreground`.
- **Éléments passés / inactifs** : `opacity-50` à `opacity-60` + texte `text-muted-foreground`, jamais masqués.

## Mouvement

- `animate-pop-in` (apparition), `animate-rise` (montée), `animate-slam` (avatar posé dans un tier), `animate-wiggle`.
- Courbes à rebond courtes (< 450 ms). `prefers-reduced-motion` coupe toutes les animations.

## Mise en page

- Mobile : en-tête + barre d'onglets en bas, `pb-safe` / `pt-safe` pour les encoches.
- Desktop : barre latérale, contenu à `w-content` (ratio mesuré en 1080p), `scrollbar-gutter: stable` pour éviter les sauts.
- Barres de défilement aux couleurs du thème : `scrollbar-theme`.

## Accessibilité

- Focus visible : `focus-visible:ring-4 ring-ring/40`.
- Boutons-icônes avec `aria-label`, avatars avec `alt` = nom.
- Les champs de saisie gardent toujours la sélection et le copier-coller.
