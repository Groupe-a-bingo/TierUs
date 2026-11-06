# TierUs

La tier list quotidienne de la commu : chaque jour à 8 h (heure de Paris), une idée est tirée au hasard dans une banque secrète et chacun classe les membres (par leur photo) de S à F. Dès qu'on a envoyé sa tier list, on voit la moyenne et celles des autres.

- Plusieurs tier lists peuvent être actives en même temps : la quotidienne, et celles qu'un modo ou un admin crée en plus depuis `/mod`.
- Chaque tier list a un TTL (24 h réelles par défaut, au choix pour les supplémentaires) : active tant que `starts_at <= now < expires_at`, puis dans les archives. Le TTL ne ferme pas les votes.
- Les résultats d'une tier list ne sont visibles qu'après y avoir répondu, archivée ou non.
- Compteur personnel : nombre de tier lists répondues avant leur archivage (une fois par tier list, jamais remis à zéro).
- Si la banque est vide à 8 h, la prochaine idée proposée déclenche le tirage du jour manquant (sans doublon).
- URL d'une tier list : `/r/<id>`. Les anciens liens `/r/AAAA-MM-JJ` redirigent vers la tier list quotidienne de ce jour.

## Démarrer en local

```bash
cp .env.example .env          # puis remplis POSTGRES_PASSWORD, BETTER_AUTH_SECRET, ADMIN_EMAIL
docker compose up -d db       # Postgres 16 sur 127.0.0.1:54329
npm install
npm run db:migrate
npm run db:seed               # 10 idées de départ
npm run dev                   # http://localhost:3010
npm run worker                # dans un autre terminal : tirage à 8 h + rattrapage toutes les 15 min
```

Tous les comptes s'inscrivent en `pending`. Pour créer le premier admin, inscris-toi puis, sur le serveur :

```bash
npm run admin:promote -- ton@email.fr
```

(Un admin n'est jamais attribué par l'inscription elle-même : sinon n'importe qui pourrait réclamer l'email admin en premier.) Ensuite, les modérateurs valident les nouveaux comptes dans `/mod` ; une photo de profil est obligatoire pour être validé.

**Derrière un proxy** (Cloudflare, nginx…), mets `CLIENT_IP_HEADER` sur l'en-tête qui porte la vraie IP du client (`cf-connecting-ip`, `x-real-ip`…), sinon le rate limit par IP peut être contourné en forgeant `X-Forwarded-For`. L'app fait confiance à cet en-tête : elle ne doit être joignable que par le proxy. Avec `docker compose`, le port 3010 est publié sur `127.0.0.1` par défaut (`APP_BIND`) ; ne passe `APP_BIND=0.0.0.0` que si le proxy tourne sur une autre machine et que le port est filtré.

**Mot de passe Postgres** : dans Docker, il n'est pas mis dans `DATABASE_URL` mais passé par `PGPASSWORD` (lu par `pg`, `pg-boss` et `drizzle-kit`), donc les caractères réservés (`@ : / # %`) ne cassent plus l'URI. Hors Docker, un mot de passe placé dans `DATABASE_URL` doit être encodé (`encodeURIComponent`).

## Scripts

| Commande | Rôle |
| --- | --- |
| `npm run lint` | ESLint avec Next et `@shadcn/lint` (couleurs en dur, valeurs arbitraires, styles inline et restyles des composants shadcn interdits) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest (unitaires) : agrégation, visibilité, validation des placements, créneau de 8 h et changements d'heure, TTL |
| `TEST_DATABASE_URL=postgres://…/tierus_test npm run test:integration` | Tests sur une base dédiée dont le nom contient `test` (refus sinon) : tirage, rattrapage, simultanéité, compteur, nouveaux membres |
| `npm run test:http` | Tests boîte noire contre `next start` ; même garde sur `TEST_DATABASE_URL` |
| `npm run db:generate` | Génère une migration après une modification de `src/db/schema.ts` |
| `npx tsx --conditions react-server scripts/flow-check.ts partial\|bad\|finish` | Vérification du flux complet sur la base locale (dev uniquement) |

## Architecture

- `src/db/schema.ts` : le schéma Drizzle (tables Better Auth et tables de l'app).
- `src/server/rounds/` : le tirage (quotidien unique par jour via un index unique partiel, supplémentaires illimités, sans doublon d'idée avec `SKIP LOCKED`), la soumission, l'agrégation et les règles de visibilité.
- `src/server/members.ts` : validation / bannissement d'un membre et mise à jour des tier lists actives dans la même transaction.
- `src/server/rounds/lock.ts` : verrou consultatif Postgres (portée transaction) pris par tout tirage et tout changement de statut d'un membre, pour qu'un membre validé pendant un tirage ne soit jamais oublié.
- `src/server/counter.ts` : le compteur personnel (dérivé des réponses, `submitted_at < expires_at`).
- `src/worker/index.ts` : le job `pg-boss` de tirage quotidien (cron `*/15 * * * *` en Europe/Paris : 8 h pile puis rattrapage le jour même ; idempotent).
- `src/server/live.ts` + `/api/live` : empreinte de version interrogée toutes les 2 s, la page se re-rend côté serveur quand elle change.
- `src/lib/permissions.ts` : `requireActiveUser`, `requireModerator`, `requireAdmin`. Le rôle et le statut sont relus en base à chaque requête.
- `src/lib/rate-limit.ts` : `rate-limiter-flexible`, stocké dans Postgres.
- `src/lib/storage.ts` : avatars validés par `sharp`, ré-encodés en WebP 256×256 et stockés dans `./storage`.
- `src/middleware.ts` : CSP avec nonce et en-têtes de sécurité.

## Production

- Retirer le mapping de port de `db` dans `docker-compose.yml`.
- Renseigner `CLIENT_IP_HEADER` (ou à défaut `TRUSTED_PROXIES`, IP exactes du reverse proxy).
- Passer `BETTER_AUTH_URL` en HTTPS.
- Lancer `next start` et le worker comme deux process séparés.
- Sauvegarder le volume `pgdata` et le dossier `./storage`.
