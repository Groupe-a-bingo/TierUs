# TierUs

La tier list quotidienne de la commu : chaque jour à 8 h (heure de Paris), une idée est tirée au hasard dans une banque secrète et chacun classe les membres (par leur photo) de S à F. Dès qu'on a envoyé sa tier list, on voit la moyenne et celles des autres.

- Plusieurs tier lists peuvent être actives en même temps : la quotidienne, et celles qu'un modo ou un admin crée en plus depuis `/mod`.
- Chaque tier list a un TTL (24 h réelles par défaut, au choix pour les supplémentaires) : active tant que `starts_at <= now < expires_at`, puis dans les archives. Le TTL ne ferme pas les votes.
- Les résultats d'une tier list ne sont visibles qu'après y avoir répondu, archivée ou non. Seuls ses membres (ceux qui étaient validés pendant qu'elle était active) peuvent y répondre : un membre arrivé après son archivage ne change pas un résultat passé.
- Un membre banni disparaît de toutes les tier lists, archives comprises : il n'est plus listé ni compté, et ses votes (donnés comme reçus) ne comptent plus. Rien n'est supprimé : le réintégrer remet tout en place.
- La photo de profil est facultative : un membre sans photo apparaît sous une tuile colorée avec son initiale.
- Compteur personnel : nombre de tier lists répondues avant leur archivage (une fois par tier list, jamais remis à zéro).
- Si la banque est vide à 8 h, la prochaine idée proposée déclenche le tirage du jour manquant (sans doublon).
- Réglages admin dans `/mod` : heure du tirage quotidien (8 h par défaut) et validation des idées.
- Validation des idées (optionnelle, activée par un admin dans `/mod`) : les idées des membres attendent qu'un modo les valide avant d'entrer dans la banque ; une idée refusée revient à son auteur : elle ne repasse devant un modo que s'il la corrige (même validation désactivée). Un modo peut aussi la déplacer directement dans la banque depuis `/mod` (il change d'avis). Il peut aussi déplacer en validation une idée refusée ou une idée de la banque (qui sort alors du tirage). Désactiver la validation fait entrer toutes les idées en attente dans la banque.
- URL d'une tier list : `/r/<id>`. Les anciens liens `/r/AAAA-MM-JJ` redirigent (temporairement) vers la tier list quotidienne de ce jour.
- Le fuseau est fixé à Europe/Paris (`APP_TZ` dans `src/lib/dates.ts`) : le navigateur affiche les heures avec le même fuseau que le serveur.

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

(Un admin n'est jamais attribué par l'inscription elle-même : sinon n'importe qui pourrait réclamer l'email admin en premier.) Les emails ne sont pas vérifiés (aucun mail n'est envoyé) : le script affiche le compte trouvé (pseudo, date d'inscription, photo) et demande confirmation avant de le promouvoir. Vérifie que c'est bien le tien. Ensuite, les modérateurs valident les nouveaux comptes dans `/mod`.

**Derrière un proxy** (Cloudflare, nginx…), mets `CLIENT_IP_HEADER` sur l'en-tête qui porte la vraie IP du client (`cf-connecting-ip`, `x-real-ip`…), sinon le rate limit par IP peut être contourné en forgeant `X-Forwarded-For`. En production, l'app refuse de démarrer sans `CLIENT_IP_HEADER` (ou `TRUSTED_PROXIES`). L'app fait confiance à cet en-tête : elle ne doit être joignable que par le proxy. Avec `docker compose`, le port 3010 est publié sur `127.0.0.1` par défaut (`APP_BIND`) ; ne passe `APP_BIND=0.0.0.0` que si le proxy tourne sur une autre machine et que le port est filtré.

**Mot de passe Postgres** : dans Docker, il n'est pas mis dans `DATABASE_URL` mais passé par `PGPASSWORD` (lu par `pg`, `pg-boss` et `drizzle-kit`), donc les caractères réservés (`@ : / # %`) ne cassent plus l'URI. Hors Docker, un mot de passe placé dans `DATABASE_URL` doit être encodé (`encodeURIComponent`).

## Scripts

| Commande | Rôle |
| --- | --- |
| `npm run lint` | ESLint avec Next et `@shadcn/lint` (couleurs en dur, valeurs arbitraires, styles inline et restyles des composants shadcn interdits) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest (unitaires) : agrégation, visibilité, validation des placements, créneau de 8 h et changements d'heure, TTL |
| `TEST_DATABASE_URL=postgres://…/tierus_test npm run test:integration` | Tests sur une base locale dédiée dont le nom finit par `_test` (refus sinon) : tirage, rattrapage, simultanéité, compteur, nouveaux membres, actions serveur (droits) |
| `npm run test:http` | Tests boîte noire contre `next start` ; même garde sur `TEST_DATABASE_URL` |
| `npm run db:generate` | Génère une migration après une modification de `src/db/schema.ts` |
| `npx tsx --conditions react-server scripts/flow-check.ts partial\|bad\|finish` | Vérification du flux complet sur la base locale (dev uniquement) |

## Architecture

Système visuel (couleurs, typo, avatars, composants) : voir [`DESIGN.md`](DESIGN.md).


- `src/db/schema.ts` : le schéma Drizzle (tables Better Auth et tables de l'app).
- `src/server/rounds/` : le tirage (quotidien unique par jour via un index unique partiel, supplémentaires illimités, sans doublon d'idée avec `SKIP LOCKED`), la soumission, l'agrégation et les règles de visibilité.
- `src/server/members.ts` : validation / bannissement d'un membre et mise à jour des tier lists actives dans la même transaction.
- `src/server/rounds/lock.ts` : verrou consultatif Postgres (portée transaction) pris par tout tirage et tout changement de statut d'un membre, pour qu'un membre validé pendant un tirage ne soit jamais oublié.
- `src/server/counter.ts` : le compteur personnel (dérivé des réponses, `submitted_at < expires_at`).
- `src/worker/index.ts` : le job `pg-boss` de tirage quotidien (cron `*/15 * * * *` en Europe/Paris : 8 h pile puis rattrapage le jour même ; idempotent).
- `src/server/live.ts` + `/api/live` : empreinte de version interrogée toutes les 2 s, la page se re-rend côté serveur quand elle change.
- `src/lib/permissions.ts` : `requireActiveUser`, `requireModerator`, `requireAdmin`. Le rôle et le statut sont relus en base à chaque requête. `src/lib/guard.ts` : `guard(niveau, limite)`, l'ouverture de chaque action serveur (droits puis rate limit).
- `src/hooks/use-server-action.ts` : le seul moyen d'appeler une action depuis un composant (état en cours, toasts, coupure réseau signalée au lieu de faire planter la page).
- Journal d'audit : écrit dans la transaction du changement lui-même (`audit(…, tx)`), libellés dans `src/lib/audit-actions.ts`.
- `src/lib/rate-limit.ts` : `rate-limiter-flexible`, stocké dans Postgres.
- `src/lib/storage.ts` : avatars validés par `sharp`, ré-encodés en WebP 256×256 et stockés dans `./storage`.
- `src/middleware.ts` : CSP avec nonce et en-têtes de sécurité.

## Production

Prod : https://tierus.grpbingo.win, sur `vnic-docker`, derrière le Caddy en conteneur (`/opt/stacks/caddy`).

### Déploiement continu (GHCR + SSH)

Quand la CI passe sur un push sur `main`, `.github/workflows/deploy.yml` construit l'image en amd64 et arm64 (`image.yml`), la publie en `ghcr.io/groupe-a-bingo/tierus:<commit>` (et `:latest`), puis se connecte en SSH et lance `tierus-deploy <commit>` sur le serveur. Relance à la main : Actions → Deploy → Run workflow. Le serveur ne build jamais et n'a pas le code : il récupère l'image testée.

Le script (`deploy/tierus-deploy`) :
- récupère l'image avec le `GITHUB_TOKEN` du job, envoyé sur stdin et jamais stocké (le package est privé) ;
- refuse une image plus ancienne que celle en place (un run lent n'annule pas un déploiement plus récent ; retour en arrière voulu : `ALLOW_OLDER=1 tierus-deploy <commit>`) ;
- extrait `docker-compose.yml` de l'image, pour qu'il corresponde toujours à la version déployée ;
- écrit `APP_IMAGE=<image>:<commit>` dans `.env` (les commandes `docker compose` à la main l'utilisent aussi) ;
- lance `docker compose up -d` : `migrate` passe d'abord, puis `app` et `worker` ; échec si l'app ne répond pas en 3 min ;
- supprime les anciennes images de l'app (et seulement les siennes). Les volumes ne sont jamais touchés.

Mise en place du serveur, une fois :

```bash
docker network create tierus-proxy
docker network connect tierus-proxy caddy        # + l'ajouter dans /opt/stacks/caddy/docker-compose.yml
sudo install -d -o deploy -g deploy -m 750 /srv/tierus
sudo install -d -o 1000 -g 1000 /srv/tierus/storage   # l'image tourne en `node` (uid 1000)
sudo -u deploy install -m 600 /dev/null /srv/tierus/.env   # voir .env.example
sudo -u deploy cp deploy/docker-compose.override.yml /srv/tierus/
# Hors du dossier de l'app, appartient à root : un commit ne peut pas changer ce que la clé exécute.
sudo install -o root -g root -m 755 deploy/tierus-deploy /usr/local/bin/
# /home/deploy/.ssh/authorized_keys :
restrict,command="/usr/local/bin/tierus-deploy" ssh-ed25519 AAAA… tierus-github-deploy
```

`.env` du serveur : `BETTER_AUTH_URL=https://tierus.grpbingo.win`, `CLIENT_IP_HEADER=x-real-ip` (posé par Caddy), un `POSTGRES_PASSWORD` et un `BETTER_AUTH_SECRET` aléatoires.

Caddy :

```
tierus.grpbingo.win {
    tls {
        dns cloudflare {env.CF_API_TOKEN}
    }
    encode zstd gzip
    reverse_proxy tierus-app:3010 {
        header_up X-Real-IP {remote_host}
    }
}
```

GitHub (Settings → Secrets and variables → Actions, au niveau du repo : les environnements ne sont pas disponibles sur un repo privé en plan gratuit) : secret `DEPLOY_SSH_KEY` (la clé privée), variables `DEPLOY_HOST`, `DEPLOY_KNOWN_HOSTS` (lignes `ssh-keyscan`), `DEPLOY_USER` (défaut `deploy`), `DEPLOY_PORT` (défaut 22).

- La commande forcée ignore tout sauf l'id de commit, et `restrict` coupe shell, PTY et forwarding. `deploy` est dans le groupe `docker`, donc équivalent root : c'est cette commande forcée qui empêche une clé fuitée de devenir un shell root.
- Après une modification de `deploy/tierus-deploy`, le réinstaller (ligne `install` ci-dessus) : le serveur ne l'exécute jamais depuis le repo.
- Seuls Caddy et l'app doivent être sur `tierus-proxy` : l'app fait confiance à `X-Real-IP`. L'override ne publie aucun port de l'app sur l'hôte (Caddy passe par le réseau) : après une mise à jour de `deploy/docker-compose.override.yml`, le recopier dans `/srv/tierus/`.
- Sauvegarder le volume `tierus_pgdata` et `/srv/tierus/storage`.
