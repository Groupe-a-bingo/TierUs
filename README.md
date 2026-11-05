# TierUs

La tier list quotidienne de la commu : chaque jour, une idée est tirée au hasard dans une banque secrète, chacun classe les membres (par leur photo) de S à F, puis la tier list moyenne est révélée.

## Démarrer en local

```bash
cp .env.example .env          # puis remplis POSTGRES_PASSWORD, BETTER_AUTH_SECRET, ADMIN_EMAIL
docker compose up -d db       # Postgres 16 sur 127.0.0.1:54329
npm install
npm run db:migrate
npm run db:seed               # 10 idées de départ
npm run dev                   # http://localhost:3010
npm run worker                # dans un autre terminal : tirage à minuit + révélation à 24h
```

Le compte inscrit avec `ADMIN_EMAIL` devient automatiquement admin et est validé. Les autres comptes restent `pending` jusqu'à ce qu'un modérateur les valide dans `/mod`, et une photo de profil est obligatoire pour être validé.

## Scripts

| Commande | Rôle |
| --- | --- |
| `npm run lint` | ESLint avec Next et `@shadcn/lint` (couleurs en dur, valeurs arbitraires, styles inline et restyles des composants shadcn interdits) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest : agrégation, visibilité, validation des placements, streaks |
| `npm run db:generate` | Génère une migration après une modification de `src/db/schema.ts` |
| `npx tsx --conditions react-server scripts/flow-check.ts partial\|bad\|finish` | Vérification du flux complet sur la base locale (dev uniquement) |

## Architecture

- `src/db/schema.ts` : le schéma Drizzle (tables Better Auth et tables de l'app).
- `src/server/rounds/` : le tirage (sans doublon, avec `SKIP LOCKED`), la soumission, l'agrégation, la révélation et les règles de visibilité.
- `src/worker/index.ts` : les jobs `pg-boss` (tirage à 00:00 Europe/Paris, puis vérification de la révélation à 24h chaque minute).
- `src/server/events.ts` : `LISTEN/NOTIFY` Postgres, puis SSE (`/api/rounds/[id]/stream`). Seul le type d'événement est poussé, la page se re-rend côté serveur.
- `src/lib/permissions.ts` : `requireActiveUser`, `requireModerator`, `requireAdmin`. Le rôle et le statut sont relus en base à chaque requête.
- `src/lib/rate-limit.ts` : `rate-limiter-flexible`, stocké dans Postgres.
- `src/lib/storage.ts` : avatars validés par `sharp`, ré-encodés en WebP 256×256 et stockés dans `./storage`.
- `src/middleware.ts` : CSP avec nonce et en-têtes de sécurité.

## Production

- Retirer le mapping de port de `db` dans `docker-compose.yml`.
- Renseigner `TRUSTED_PROXIES` avec les IP du reverse proxy.
- Passer `BETTER_AUTH_URL` en HTTPS.
- Lancer `next start` et le worker comme deux process séparés.
- Sauvegarder le volume `pgdata` et le dossier `./storage`.
