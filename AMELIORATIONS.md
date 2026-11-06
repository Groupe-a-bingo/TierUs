# Améliorations à prévoir

> **État :** les points cochés sont implémentés dans la branche `feat/tierlist-lifecycle-and-ux`. Lint, typecheck, tests unitaires, tests d'intégration (base isolée), tests HTTP et build de production passent. Restent les contrôles manuels listés en bas de page.

## 1. Appui long sur mobile

- [x] Empêcher la sélection accidentelle du texte lorsqu'un appui long sert à interagir avec l'interface.
- **Comportement observé :** sur téléphone, le texte est parfois sélectionné pendant un appui long.
- **Résultat attendu :** le geste fonctionne sans faire apparaître la sélection de texte ni le menu de copie. Conserver la sélection là où elle est utile, notamment dans les champs de saisie.
- **Fait :** sur écran tactile (`hover: none`), boutons, liens, images, onglets et messages du chat (`data-gesture`) ne sont plus sélectionnables et n'ouvrent plus le menu iOS. `input`, `textarea` et `contenteditable` gardent la sélection, et « Copier le texte » reste disponible dans le menu du message. À la souris, la sélection est inchangée (`src/app/globals.css`, `src/components/board/comments.tsx`).

## 2. Navigation entre les tier lists des membres

- [x] Faire défiler le carrousel des comptes quand les flèches sélectionnent un compte situé hors de la zone visible.
- **Comportement observé :** le compte affiché change, mais sa vignette peut rester hors écran dans le carrousel.
- **Résultat attendu :** la vignette du compte sélectionné devient entièrement visible, idéalement centrée, à chaque changement par les flèches.
- **Fait :** le carrousel recentre la vignette sélectionnée à chaque changement (flèches, tap sur la tier list, tap sur une vignette), en défilement doux sauf si « réduire les animations » est actif (`src/components/tier-board/results-tabs.tsx`).

## 3. En-tête de l'application ajoutée à l'écran d'accueil

- [x] Corriger l'affichage de l'en-tête sur iPhone lorsque le site est ouvert depuis l'icône ajoutée à l'écran d'accueil.
- **Comportement observé :** dans la capture « Photo 1.jpg » (application ouverte depuis l'écran d'accueil), le logo TierUs et le compteur de série n'apparaissent pas. Dans « Photo 2.jpg » (Safari), ils sont visibles au-dessus du contenu.
- **Résultat attendu :** l'en-tête mobile affiche le logo et le compteur dans les deux modes, avec un espacement correct sous la barre d'état de l'iPhone.
- **Vérification :** comparer la page d'accueil dans Safari et depuis l'icône de l'écran d'accueil, puis contrôler aussi le défilement de la page.
- **Cause :** en mode écran d'accueil, `viewport-fit=cover` et la barre d'état `black-translucent` font commencer la page sous la barre d'état ; l'en-tête collant (`top-0`) était entièrement caché derrière. **Fait :** l'en-tête reçoit un `padding-top: env(safe-area-inset-top)` (utilitaire `pt-safe`), nul dans Safari (`src/components/board/mobile-header.tsx`, `src/app/globals.css`). **Reste à faire :** le contrôle sur iPhone dans les deux modes, défilement compris.

## 4. Explications au-dessus du chat

- [x] Retirer la ligne d'aide « Glisse un message → pour répondre · double-tap ❤️ · appui long pour plus » affichée au-dessus de la zone de saisie du chat sur téléphone.
- **Résultat attendu :** la discussion et la zone de saisie restent accessibles, sans cette explication permanente.

## 5. Plusieurs tier lists et archivage par TTL

- [x] Remplacer l'URL actuelle `/r/[date]` par une URL fondée sur un identifiant ou un slug unique à chaque tier list. Retirer la contrainte qui impose une seule tier list par date. Conserver les anciens liens ou les rediriger.
  - `/r/<uuid>`. Les anciens liens `/r/AAAA-MM-JJ` redirigent (redirection permanente) vers la quotidienne de ce jour (ou, à défaut, la première créée ce jour-là). L'index unique `rounds_date_uq` est remplacé par un index unique **partiel** sur la date des seules quotidiennes. Route `src/app/(app)/r/[slug]`.
- [x] Permettre plusieurs tier lists actives en même temps. La règle habituelle reste **un tirage automatique quotidien**, mais un modo ou un admin peut en créer une supplémentaire avec un bouton dans la page de modération et choisir son TTL.
  - Colonne `kind` (`daily` / `extra`) ; formulaire « Tier list supplémentaire » dans `/mod`, TTL de 1 à 168 h, 24 h par défaut ; action auditée `round.extra`.
- [x] Donner à chaque tier list un TTL configurable, de **24 heures réelles par défaut**. Enregistrer `starts_at` et `expires_at` à la création. Une tier list est active si `starts_at <= now < expires_at` ; elle passe dans les archives dès que `expires_at <= now`. Le TTL ne ferme pas les votes.
- [x] Afficher toutes les tier lists actives sur l'accueil et les autres dans les archives. Trier les listes par heure de création et cibler chaque action, lien et rafraîchissement par l'identifiant de la bonne tier list, même si plusieurs ont été créées le même jour.
- [x] Lorsqu'un compte est validé, ajouter le nouveau membre à **toutes** les tier lists encore actives. Conserver les réponses existantes et permettre aux personnes ayant déjà joué de classer seulement ce nouveau membre, comme aujourd'hui.
  - Le changement de statut et l'ajout aux tier lists actives se font dans **une seule transaction** (`src/server/members.ts`) : plus de membre actif absent après un échec. Un bannissement retire le membre des seules tier lists actives.
  - **Course validation / tirage :** toute transaction qui crée une tier list (quotidienne ou supplémentaire) et photographie les membres actifs, et toute transaction qui change le statut d'un membre (validation, réintégration, bannissement, `admin:promote`), prend d'abord le même verrou consultatif Postgres de portée transaction (`pg_advisory_xact_lock`, `src/server/rounds/lock.ts`). Elles s'exécutent donc l'une après l'autre : un membre validé pendant un tirage est soit dans la photographie, soit ajouté ensuite à la nouvelle tier list. L'ajout ne filtre plus sur `starts_at <= now`, pour inclure une tier list tirée pendant que la validation attendait le verrou. Le verrou ne couvre que ces écritures courtes (pas les votes ni les lectures).
- [x] Tirer la tier list quotidienne à **08:00, heure de Paris**, avec une tentative de rattrapage. Si la banque est vide à cette heure, lancer automatiquement le tirage quotidien manquant dès qu'une nouvelle idée est proposée, sans créer de doublon si le tirage a déjà eu lieu.
  - Worker : cron `*/15 * * * *` en Europe/Paris (08:00 pile, puis rattrapage toutes les 15 min) et tirage au démarrage. L'ajout d'une idée relance le même tirage idempotent.
  - **Sans doublon :** la vérification « la quotidienne du jour existe-t-elle ? » est faite sous le verrou consultatif, dans la transaction du tirage. Des tirages simultanés renvoient donc `exists` de façon fiable, même quand la banque ne contient qu'une idée (testé). L'index unique partiel reste en dernier recours.
  - **Rattrapage le jour même seulement :** une quotidienne est due à partir de 08:00 et jusqu'à minuit (heure de Paris), jamais avant 08:00. Une journée restée sans tier list (banque vide toute la journée) n'est pas rattrapée le lendemain avant 08:00. Sinon, une idée proposée à 3 h créerait une « quotidienne » datée de la veille, tirée à 3 h, qui chevaucherait celle de 08:00 pendant 19 h. Conséquence assumée : une idée proposée tard le soir d'une journée vide déclenche bien la quotidienne de ce jour, qui chevauchera celle du lendemain. Avant 08:00, le bouton « Tirer la tier list du jour » de `/mod` est masqué.
  - L'ancien planning `reveal-timed-out` est supprimé au démarrage du worker (nom de file conservé dans le code pour pouvoir le désinscrire).
- **Point à vérifier lors des changements d'heure :** le tirage reste à 08:00 heure locale et le TTL reste de 24 heures réelles. Cela peut laisser une heure entre deux quotidiennes ou faire chevaucher deux quotidiennes ; conserver ces deux règles et vérifier que l'accueil gère correctement ces cas.
  - Couvert par des tests unitaires et d'intégration : chevauchement d'une heure au printemps (les deux quotidiennes sont affichées), trou d'une heure à l'automne (l'accueil affiche « La prochaine tier list est tirée à 8 h »).
- **Optimisation directe :** indexer `expires_at` pour rechercher les tier lists encore actives sans parcourir toute la table. Reporter les autres optimisations de charge tant qu'elles ne sont pas nécessaires.
  - Index `rounds_expires_idx` ajouté.
- **Vérification :** créer deux tier lists le même jour, vérifier leurs URLs distinctes et leur présence simultanée sur l'accueil, puis contrôler l'archivage de chacune selon son TTL, l'ajout d'un membre aux deux et le tirage automatique à 08:00 ou après réapprovisionnement de la banque.

## 6. Résultats visibles après son propre vote, sans révélation

- [x] Supprimer le système de révélation : traitement automatique, bouton « Révéler maintenant », état et libellés « Révélé », et messages qui annoncent une future révélation.
  - Colonnes `revealed_at` / `reveal_reason` et type `reveal_reason` supprimés par la migration ; job de révélation retiré du worker et module serveur supprimé.
- [x] Pour chaque tier list, montrer les votes et résultats des autres dès que la personne a envoyé sa propre réponse, sans attendre que tout le monde ait joué. Masquer ces résultats à une personne qui n'a pas encore répondu, même si la tier list est archivée.
  - Même règle pour le podium du board et la discussion. Commenter ou réagir exige aussi d'avoir répondu (contrôle côté serveur).
- [x] Garder la possibilité de répondre à une tier list archivée : le TTL décide de son emplacement actif ou archive, pas du droit de voter. Une réponse après archivage donne accès aux résultats, mais ne fait pas progresser le compteur personnel décrit ci-dessous.
- **Vérification :** avec deux membres, le premier voit les résultats immédiatement après son vote ; le second ne les voit qu'après le sien. L'archivage ne révèle rien automatiquement et n'empêche pas de voter plus tard.

## 7. Compteur personnel de tier lists répondues à temps

- [x] Remplacer la série de jours consécutifs par un **compteur cumulé de tier lists auxquelles la personne a répondu avant leur archivage**. Il ne se remet pas à zéro lorsqu'une journée ou une tier list est manquée.
- [x] Compter au plus une fois par tier list, y compris les tier lists supplémentaires du même jour, si le premier vote a été envoyé avant `expires_at`. Un vote après archivage reste possible mais ne compte pas ; classer ensuite un nouveau membre ne compte pas une seconde fois.
  - Calculé à partir des réponses (`src/server/counter.ts`, `submitted_at < expires_at`, une réponse par membre et par tier list ; compléter pour un nouveau ne crée pas de seconde réponse). L'historique existant est donc repris tel quel. Colonnes `streak` et `last_played_round_date` supprimées.
- [x] Mettre à jour le compteur et son affichage dans l'en-tête, le profil et les autres emplacements où la série apparaît aujourd'hui.
  - En-tête mobile, barre latérale et profil (icône trophée, « tier lists répondues à temps »).
- **Vérification :** deux votes à temps sur deux tier lists du même jour donnent +2 ; un vote après archivage donne +0 ; une journée manquée ne retire aucun point.

## Corrections issues de la revue précédente

- [x] Validation d'un compte et ajout aux tier lists actives dans la même transaction (`src/server/members.ts`), sérialisée avec les tirages par un verrou consultatif partagé (voir section 5). Tests : tirages simultanés avec une seule idée, validations simultanées à des tirages.
- [x] Feuille d'actions du chat : focus déplacé dans la feuille à l'ouverture, Tab piégé, Échap ferme, focus rendu à l'élément d'origine (sauf si « Répondre » l'a placé dans le champ), bouton « Fermer » (`src/components/board/message-sheet.tsx`). L'effet capture l'élément du panneau au départ (plus d'avertissement React Hooks sur la ref au nettoyage).
- [x] Onglets des résultats : tabindex itinérant, flèches gauche/droite, Début/Fin, `aria-controls`, `tabpanel` relié par `aria-labelledby` (`src/components/tier-board/results-tabs.tsx`).
- [x] Tests HTTP : refus si `TEST_DATABASE_URL` est absente ou si le nom de la base ne contient pas « test », et si l'app pointe vers une autre base (`tests/http/app.test.ts`).
- [x] `docker-compose.yml` : le mot de passe Postgres passe par `PGPASSWORD` au lieu d'être interpolé dans l'URI.
- [x] `docker-compose.yml` : l'app est publiée sur `127.0.0.1` par défaut (`APP_BIND`), un proxy ou tunnel sur l'hôte continue de fonctionner ; avertissement au démarrage en production si `CLIENT_IP_HEADER` et `TRUSTED_PROXIES` sont vides.
- [ ] Version live du board (`src/server/live.ts`) : **laissé pour plus tard.** L'empreinte compte les commentaires, réactions et réponses de toutes les tier lists, car les cartes d'archives affichent ces compteurs. La restreindre demanderait un compteur d'activité maintenu en écriture (trigger ou table dédiée), ce qui n'est ni simple ni mesurable sans données de charge, et risquerait de rater des rafraîchissements. Le cache partagé de 1,5 s limite déjà la base à une requête par intervalle, quel que soit le nombre de clients. Seul ajout : un compteur des tier lists archivées (servi par l'index `expires_at`) pour que l'accueil bascule à l'expiration.

## Vérifications restantes

Contrôles manuels : en-tête iPhone (Safari et écran d'accueil, défilement compris), appui long sur les messages, flèches du carrousel, création de deux tier lists le même jour depuis `/mod`.
