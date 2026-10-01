<div align="center">
  <img src="./assets/logo-transparent.png" alt="Questorr Logo" width="160"/>

  # Questorr

  **Un bot Discord auto-hébergé qui relie Jellyfin et Seerr — avec des notifications intelligentes, un routage automatique des salons et un tableau de bord web complet.**

  [![Version](https://img.shields.io/badge/version-2.4.5-brightgreen)](https://github.com/Jellyforge-Dev/Questorr/releases)
  [![Docker](https://img.shields.io/badge/Docker-jellyforge%2Fquestorr-blue?logo=docker)](https://hub.docker.com/r/jellyforge/questorr)
  [![License](https://img.shields.io/badge/License-AGPL--3.0-blue)](LICENSE)
  [![Discord](https://img.shields.io/badge/Discord-Rejoindre-5865F2?logo=discord&logoColor=white)](https://discord.gg/rXANrXJqVf)

  [🇬🇧 English](README.md) &nbsp;|&nbsp; [🇩🇪 Deutsch](README.de.md) &nbsp;|&nbsp; [🇫🇷 Français](README.fr.md) &nbsp;|&nbsp; [🇪🇸 Español](README.es.md) &nbsp;|&nbsp; [🇧🇷 Português (Brasil)](README.pt_br.md) &nbsp;|&nbsp; [🇸🇪 Svenska](README.sv.md)

  [💬 Communauté Discord](https://discord.gg/rXANrXJqVf) &nbsp;|&nbsp; [<img src="https://storage.ko-fi.com/cdn/cup-border.png" height="14" alt="Ko-fi"> Offre-moi un café](https://ko-fi.com/jellyforgedev) &nbsp;|&nbsp; [🐛 Signaler un bug](https://github.com/Jellyforge-Dev/Questorr/issues)

</div>

---

> **📸 Remarque sur la démo :** tous les GIF de ce README proviennent d'un serveur de test et ne montrent aucune donnée utilisateur réelle. La version en direct peut légèrement différer et afficher plus de contenu selon ta configuration.

<div align="center">
  <img src="GIFs/Request_Process-BotSetup.gif" alt="Recherche, demande, approbation admin et notification de disponibilité en action" width="100%"/>
</div>

---

## ✨ Fonctionnalités

| Fonctionnalité | Description |
|---|---|
| 🔍 `/search` | Rechercher des films et séries, demander directement depuis l'embed |
| 📤 `/request` | Demandes de média instantanées avec sélection optionnelle de tag, serveur et qualité |
| 🔥 `/trending` | Parcourir les films et séries tendance de la semaine |
| 🔎 `/status` | Vérifier le statut de demande Seerr d'un titre — avec affiche, résumé, genre, durée, note et classification d'âge. Affiche un bouton de demande si pas encore demandé |
| 🎲 `/random` | Obtenir un film ou une série aléatoire depuis ta bibliothèque Jellyfin — avec affiche, résumé, genre, durée et note. Visible uniquement par l'utilisateur ayant lancé la commande |
| 🐛 `/report` | Signaler un problème (vidéo / audio / sous-titres) sur un titre Jellyfin (`/report movie` · `/report series`). Ouvre un ticket Seerr ; les admins commentent et résolvent directement depuis Discord, et l'auteur du signalement reçoit des DM |
| 💡 `/recommend` | Obtenir des recommandations basées sur un film ou une série via TMDB |
| 🧭 `/discover` | Découvrir des médias par genre, année et note minimale |
| 📦 `/collection` | Voir tous les films d'une franchise/collection avec leur disponibilité |
| 🎭 `/cast` | Parcourir la filmographie complète d'un acteur avec pagination |
| 🔗 `/similar` | Trouver des titres similaires basés sur le genre et les mots-clés |
| 📥 `/queue` | Suivre le statut de **tes propres** demandes — regroupées par étape (en attente, en téléchargement, disponible, refusée, échouée) |
| 🔔 `/subscribe` | S'abonner à une série pour recevoir un DM à la sortie d'une nouvelle saison, plus une **recommandation hebdomadaire personnalisée par DM** en option |
| ✨ `/foryou` | Recommandations personnalisées basées sur ton historique de visionnage Jellyfin |
| 🔖 `/watchlist` | Voir les demandes de médias récentes depuis Seerr |
| 🕘 `/history` | Voir les films et séries récemment ajoutés à Jellyfin |
| 📅 `/upcoming` | Parcourir les sorties de films à venir et les nouvelles séries depuis TMDB |
| ❓ `/help` | Afficher toutes les commandes disponibles avec des boutons d'action rapide |
| 🆕 Résumé hebdomadaire | Publication hebdomadaire optionnelle des nouveaux films, séries **et épisodes** ajoutés à ta bibliothèque Jellyfin |
| 🚦 Quota par utilisateur | Limite glissante optionnelle de demandes sur 7 jours par utilisateur, avec rôles de contournement et utilisateurs illimités |
| 🔔 Notifications intelligentes | Embeds Discord riches pour tous les événements Seerr (en attente, approuvé, disponible, refusé, échoué, tickets) |
| 📺 Routage des salons | Notifications automatiquement routées vers le bon salon en fonction du dossier racine Radarr/Sonarr |
| 🔕 Événements privés | Les notifications de nouvelle demande et de refus vont directement au demandeur en DM — jamais dans le salon public |
| ✉️ DM privés | Les utilisateurs reçoivent un DM quand leur contenu demandé est approuvé, refusé ou devient disponible |
| 🔘 Boutons configurables | Choisir quels boutons (Voir sur Seerr, Regarder maintenant, Letterboxd, IMDb) apparaissent sur les embeds de notification |
| 👤 Association d'utilisateurs | Lier les comptes Discord aux comptes Seerr pour que les demandes apparaissent avec le bon utilisateur |
| 🔐 Permissions par rôle | Contrôler qui peut utiliser les commandes du bot via une liste d'autorisation/blocage de rôles Discord |
| 🌟 Recommandation du jour | Publier chaque jour une suggestion depuis ta bibliothèque Jellyfin existante |
| 🎲 Sélection aléatoire du jour | Publier chaque jour une suggestion aléatoire depuis TMDB |
| 🎨 Couleurs d'embed personnalisées | Personnaliser les couleurs des embeds de résultats de recherche et de confirmation de succès |
| ⚙️ Tableau de bord web | Configuration complète sur `http://ton-serveur:8282` — interface au style Tetris |
| 🎨 Thème sombre / clair | Thème rétro sombre par défaut plus un thème clair « Paper-Terminal » ; le choix est mémorisé par navigateur |
| 🛡️ Journal d'audit | Onglet **Audit** du tableau de bord : qui a approuvé/refusé une demande, modifié la config, démarré/arrêté le bot ou s'est connecté |
| 🚨 Alertes de santé | Optionnel : poste dans un salon admin quand Seerr ou Jellyfin **tombe en panne** ou **se rétablit** |
| ❤️ Vérification de santé du conteneur | `HEALTHCHECK` Docker intégré sur `/api/health` — Portainer / Docker / Uptime Kuma voient le conteneur comme sain |
| 📱 Adapté au mobile | Tableau de bord responsive, fonctionne sur smartphones et tablettes |
| ✅ Statut de disponibilité | Toutes les listes d'embed affichent le statut Seerr : ✅ disponible, ⏳ demandé, 📥 partiel |
| 🎬 Classifications d'âge | Classifications FSK/MPAA dans les embeds de recherche, configurables par pays |
| 📡 Plateformes de streaming | Affiche où un titre est disponible en streaming (Netflix, Disney+, etc.) |
| ▶️ Boutons de bande-annonce | Liens de bandes-annonces YouTube dans les embeds /search et /request |
| 💚 Barre de vérification de santé | Affichage en temps réel du statut des services dans le tableau de bord |
| 📊 Tableau de bord statistiques | Statistiques d'utilisation des commandes avec répartition par utilisateur |
| 🧩 Widget intégrable | Widget HTML pour Homarr/Homepage/Organizr avec statut et contrôles du bot |
| 🌍 Multilingue | Tableau de bord et bot entièrement traduits en anglais, allemand, français, espagnol, portugais brésilien et suédois |

> 📖 **Nouveau ici ?** Le [**Guide complet d'utilisation et de configuration**](docs/USAGE.md) (en anglais) explique
> **chaque** commande, fonctionnalité et paramètre en langage clair — y compris le voyant
> de statut du webhook Seerr et le piège classique de l'URL Docker.

---

## 📋 Prérequis

- Un serveur **[Jellyfin](https://jellyfin.org/)** en fonctionnement
- Une instance **[Seerr](https://github.com/seerr-team/seerr)** en fonctionnement (connectée à [Radarr](https://github.com/Radarr/Radarr)/[Sonarr](https://github.com/Sonarr/Sonarr))
- Un compte **Discord** avec un accès admin à un serveur
- **Docker** (recommandé) ou Node.js 20+
- Clés API : [TMDB](https://www.themoviedb.org/settings/api) (requise) · [OMDb](http://www.omdbapi.com/apikey.aspx) (optionnelle)

---

## 🚀 Démarrage rapide

### Docker Compose (recommandé)

**Configuration standard** — accès direct via IP et port :

```yaml
services:
  questorr:
    image: jellyforge/questorr:latest
    container_name: questorr
    restart: unless-stopped
    environment:
      - WEBHOOK_PORT=8282
      - NODE_ENV=production
    ports:
      - "8282:8282"
    volumes:
      - ./questorr-data:/usr/src/app/config
```

Ouvre ensuite `http://ip-de-ton-serveur:8282` et suis l'assistant de configuration.

**Avec un reverse proxy** ([Nginx Proxy Manager](https://github.com/NginxProxyManager/nginx-proxy-manager), [Traefik](https://github.com/traefik/traefik), [Caddy](https://github.com/caddyserver/caddy)) — supprime `ports` et ajoute plutôt le réseau partagé :

```yaml
services:
  questorr:
    image: jellyforge/questorr:latest
    container_name: questorr
    restart: unless-stopped
    environment:
      - WEBHOOK_PORT=8282
      - NODE_ENV=production
    volumes:
      - ./questorr-data:/usr/src/app/config
    networks:
      - proxy             # Doit correspondre au nom du réseau de ton reverse proxy

networks:
  proxy:                  # Doit correspondre au nom du réseau de ton reverse proxy
    external: true
```

Paramètres de transfert du reverse proxy : Schéma : `http` · Hôte / Forward hostname : `questorr` · Port : `8282`

### Tags Docker

| Tag | Description |
|---|---|
| `latest` | Dernière version stable |
| `dev` | Build de développement (peut être instable) |
| p. ex. `2.4.5` | Version précise fixée — voir les [Releases](https://github.com/Jellyforge-Dev/Questorr/releases) pour tous les tags |

### Manuel (développement)

```bash
git clone https://github.com/Jellyforge-Dev/Questorr.git
cd Questorr
npm install
node app.js
```

---

## ⚙️ Configuration

### 1. Créer un bot Discord

1. Aller sur le [Discord Developer Portal](https://discord.com/developers/applications) → New Application
2. **Bot** → Reset Token pour obtenir un token, puis activer `Server Members Intent` (requis pour l'association d'utilisateurs)
3. **OAuth2** → copier le **Client ID**
4. Coller les deux dans le tableau de bord de Questorr (étape 1) et cliquer sur **« Inviter le bot sur le serveur »** — le tableau de bord construit le lien d'invitation pour toi avec exactement les permissions nécessaires (`Send Messages`, `Embed Links`, `Pin Messages`), aucune étape manuelle avec le générateur d'URL OAuth2 requise

### 2. Configurer via le tableau de bord web

Ouvre `http://ip-de-ton-serveur:8282`, crée un compte et complète toutes les étapes :

| Étape | Ce qu'il faut configurer |
|---|---|
| 1. Discord | Token du bot, client ID, serveur, salon de notification par défaut |
| 2. Seerr | URL Seerr, clé API, URL du webhook, routage des salons, association des dossiers racine |
| 3. Bases de données média | Clé API TMDB (requise), clé API OMDb (optionnelle) |
| 4. Jellyfin | URL du serveur, clé API, ID du serveur, salon de notification |
| 5. Association d'utilisateurs | Lier les utilisateurs Discord aux comptes Seerr |
| 6. Permissions par rôle | Liste d'autorisation / de blocage pour les commandes du bot |
| 7. Divers | Démarrage automatique, DM, sélections quotidiennes, couleurs d'embed, options `/request`, commandes Discord, boutons de notification |

### 3. Configurer le webhook Seerr

Dans **Seerr → Paramètres → Notifications → Webhook**, configure ce qui suit :

| Champ | Valeur |
|---|---|
| URL du webhook | L'URL affichée dans Questorr sous **Étape 2 → URL du webhook Seerr** |
| En-tête d'autorisation | Coller le secret affiché sous **Étape 2 → Copier le secret** |

> Le secret est transmis via l'en-tête `Authorization` — il n'apparaît jamais dans l'URL ni dans les logs du serveur.

**Recommandé : activer tous les types de notification dans Seerr** pour que Questorr puisse transmettre l'intégralité du cycle de vie des demandes à Discord :

| Événement Seerr | Ce que fait Questorr |
|---|---|
| Demande en attente d'approbation | Poste dans le **salon admin** (avec boutons Approuver/Refuser) · envoie un DM au demandeur |
| Demande approuvée / auto-approuvée | Poste dans le salon par défaut · envoie un DM au demandeur |
| Média disponible | Poste dans le salon du dossier racine correspondant · envoie un DM au demandeur |
| Demande refusée | Envoie un DM au demandeur uniquement |
| Téléchargement échoué | Poste dans le salon admin |
| Ticket créé | Poste dans le **salon admin** (avec des boutons Commenter / Résoudre) |
| Ticket commenté / résolu / rouvert | Envoie un **DM au rapporteur** (pour les suivis de `/report`) |

> **Pour que `/report` fonctionne**, active les tickets dans **Seerr → Paramètres → Général**
> (*Activer le signalement de problèmes*) et coche les événements webhook **Issue** ci-dessus.
> Comme Questorr agit en tant qu'**utilisateur Seerr associé** (étape 5), cet utilisateur a besoin
> de la permission Seerr correspondante pour chaque action — **Request** pour demander,
> **Auto-Approve** pour l'approbation instantanée, **Report Issues** pour `/report`.

> ⚠️ **Rendez votre salon admin privé.** Les boutons Approuver/Refuser d'une
> demande en attente n'ont **aucune vérification de permission propre** —
> cliquer dessus appelle Seerr avec la clé API de Questorr, qui est autorisée
> à approuver ou refuser *n'importe quelle* demande. Quiconque peut voir ce
> salon peut effectivement agir avec le même pouvoir que votre clé API
> Seerr. Si vous n'utilisez pas l'auto-approbation de Seerr, restreignez les
> permissions Discord du salon admin pour que seuls les admins/modérateurs
> de confiance puissent le voir — sinon n'importe quel membre qui tombe sur
> ce salon peut approuver ses propres demandes (ou celles des autres).

### 4. Routage des salons

Sous **Étape 2 → Association Dossier racine → Salon**, clique sur **Charger les dossiers racine**, puis assigne un salon Discord à chaque dossier racine Radarr/Sonarr. Questorr routera automatiquement les notifications `MEDIA_AVAILABLE` vers le bon salon — par exemple, les demandes d'anime vont vers `#anime`, les films vers `#films`.

### 5. Boutons de notification

Sous **Étape 7 → Boutons de notification**, tu peux activer ou désactiver individuellement les boutons qui apparaissent sur les embeds de notification Discord :

| Bouton | Description |
|---|---|
| Voir sur Seerr | Lien vers la page du média dans Seerr |
| ▶ Regarder maintenant ! | Lien direct vers le lecteur Jellyfin (contenu disponible uniquement) |
| Letterboxd | Lien vers la page Letterboxd (films uniquement) |
| IMDb | Lien vers la page IMDb |

Utilise le bouton **Tester les boutons** pour envoyer une notification d'aperçu à ton salon admin montrant les boutons actuellement actifs.

---

## 🌐 Variables d'environnement

| Variable | Description | Par défaut |
|---|---|---|
| `WEBHOOK_PORT` | Port du serveur web | `8282` |
| `LOG_LEVEL` | `error` / `warn` / `info` / `verbose` / `debug` | `info` |
| `TRUST_PROXY` | Mettre à `false` pour désactiver le trust proxy (p. ex. sans reverse proxy) | `true` |

Tous les autres paramètres sont gérés via le tableau de bord web et enregistrés dans `config/config.json`.

---

## 🔒 Sécurité

Questorr inclut le durcissement de sécurité suivant :

| Fonctionnalité | Détails |
|---|---|
| Conteneur non-root | Le processus s'exécute en tant qu'utilisateur `app` via `entrypoint.sh` + `su-exec` |
| Content Security Policy | En-têtes CSP stricts via `helmet` — scripts inline bloqués, `frame-ancestors: none` |
| En-tête d'autorisation | Le secret du webhook est transmis via l'en-tête `Authorization`, jamais dans l'URL |
| Protection contre le brute-force | Les verrouillages de connexion persistent après les redémarrages du conteneur (écrits sur disque) |
| Limitation de débit | Les endpoints API, configuration et webhook sont limités en débit |
| Trust proxy configurable | `TRUST_PROXY=false` désactive le trust proxy pour les déploiements directs |
| Permissions de répertoire | Les répertoires de configuration sont créés avec `0o755` au lieu de `0o777` |
| Journalisation d'audit | Les accès au secret du webhook et à la clé API du widget sont journalisés |
| Mises à jour des dépendances | Toutes les dépendances npm mises à jour, 0 vulnérabilité connue |

---

## 🔮 Feuille de route

Les demandes de fonctionnalités approuvées sont suivies sur le tableau de projet public :

➡️ **[Feuille de route Questorr →](https://github.com/orgs/Jellyforge-Dev/projects/1)**

Tu as une idée ? [Ouvre une demande de fonctionnalité](https://github.com/Jellyforge-Dev/Questorr/issues/new?template=feature_request.yml) — une fois examinée et approuvée, elle rejoint le tableau.

---

## 🎬 En action

> Les GIF proviennent d'un serveur de test sans données réelles.

### Utiliser le bot

<details>
<summary><b>Le flux complet de demande — recherche, demande, approbation admin, "maintenant disponible"</b></summary>

![Flux de demande](GIFs/Request_Process-BotSetup.gif)

> `/search` trouve un titre via TMDB ; cliquer sur **Request** l'envoie à
> Seerr. Si **Auto-Approve Requests** de Seerr est désactivé, la demande
> atterrit dans le salon admin pour Approuver/Refuser (voir l'étape 7
> ci-dessous) — sinon elle est demandée immédiatement et Discord repostera
> une fois disponible.

</details>

<details>
<summary><b>L'assistant /help — boutons d'action rapide pour chaque fonctionnalité</b></summary>

![For You](GIFs/ForYou-BotSetup.gif)

> `/help` ouvre un assistant avec des boutons en un clic pour chaque
> fonctionnalité ci-dessous — pas besoin de mémoriser les commandes.
> **For You** construit des recommandations TMDB à partir de ton
> historique de visionnage Jellyfin réel.

</details>

<details>
<summary><b>Film / Série aléatoire</b></summary>

![Film / Série aléatoire](GIFs/Random_Movie_Series-BotSetup.gif)

> `/random` choisit un titre directement dans ta **bibliothèque Jellyfin**
> (pas TMDB) — pratique pour « qu'est-ce que je regarde ce soir » plutôt
> que pour découvrir quelque chose de nouveau à demander.

</details>

<details>
<summary><b>Recommandations quotidiennes & le widget de statut intégrable</b></summary>

![Recommandations](GIFs/Miscellaneous_Recommendation-BotSetup.gif)

> Daily Random Pick et Daily Recommendation postent automatiquement selon
> un horaire que tu définis à l'étape 7. Le **widget de statut**
> intégrable montré à la fin peut afficher des stats du bot en direct sur
> un tableau de bord externe comme Homarr ou Homepage.

</details>

---

### Configuration du tableau de bord

<details>
<summary><b>Étape 1 – Paramètres Discord</b></summary>

![Configuration Discord](GIFs/Discord-BotSetup.gif)

> Questorr téléverse automatiquement son propre logo comme avatar Discord
> du bot au premier démarrage — pas besoin d'en définir un manuellement,
> sauf si tu veux quelque chose de différent.

</details>

<details>
<summary><b>Étape 2 – Configuration Seerr</b></summary>

![Configuration Seerr](GIFs/Seerr-BotSetup.gif)

> **Root Folder → Channel Mapping** route les notifications « maintenant
> disponible » selon le dossier racine Radarr/Sonarr où le téléchargement a
> atterri (ex. ton dossier racine Anime → `#anime`). Cela nécessite que Seerr
> communique avec Radarr/Sonarr, et c'est le *premier* niveau de routage que
> Questorr essaie — voir l'étape 4 ci-dessous pour ce qui se passe quand ça
> ne correspond pas (ou n'est pas configuré du tout).

</details>

<details>
<summary><b>Étape 3 – Bases de données média (TMDB / OMDb)</b></summary>

![Configuration des bases de données média](GIFs/Media_Databases-BotSetup.gif)

> Obtiens une **clé API TMDB** gratuite sur
> [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api)
> (requise pour la recherche et les posters), et une **clé API OMDb**
> optionnelle sur
> [omdbapi.com/apikey.aspx](https://www.omdbapi.com/apikey.aspx) pour des
> données de notation plus riches.

</details>

<details>
<summary><b>Étape 4 – Connexion Jellyfin</b></summary>

![Configuration Jellyfin](GIFs/Jellyfin-BotSetup.gif)

> **Jellyfin Library → Channel Mapping** remplit deux rôles. D'abord, c'est
> le *deuxième* niveau de routage pour les notifications déclenchées par
> Seerr, utilisé quand le mapping par dossier racine ci-dessus (étape 2) ne
> correspond pas. Ensuite — et indépendamment — il alimente le propre
> détecteur de bibliothèque Jellyfin de Questorr, qui détecte le nouveau
> contenu directement dans Jellyfin (peu importe comment il y est arrivé)
> et poste dans le salon correspondant à cette bibliothèque. **Tu peux
> configurer uniquement cette étape et ignorer complètement Seerr/Radarr/
> Sonarr** si tout ce que tu veux, c'est que Discord annonce le nouveau
> contenu de la bibliothèque, sans aucun flux de demande/approbation.

</details>

<details>
<summary><b>Étape 5 – Association d'utilisateurs</b></summary>

![Configuration de l'association d'utilisateurs](GIFs/User_Mapping-BotSetup.gif)

> Associer un utilisateur Discord à son compte Seerr fait apparaître ses
> demandes sous son vrai nom dans Seerr (pas « Admin »), alimente la vue
> « mes demandes » de `/watchlist filter:mine`, et permet à **For You** de
> tirer des recommandations personnalisées de l'historique de visionnage
> Jellyfin de cet utilisateur.

</details>

<details>
<summary><b>Étape 6 – Permissions par rôle & quota de demandes</b></summary>

![Configuration des permissions par rôle](GIFs/Role_Permissions-BotSetup.gif)

> Restreins qui peut utiliser le bot via une liste d'autorisation/blocage
> de rôles Discord, et plafonne optionnellement le nombre de demandes que
> chaque utilisateur peut faire sur une fenêtre glissante de 7 jours —
> utile si tu partages ton serveur avec beaucoup de monde.

</details>

<details>
<summary><b>Étape 7 – Divers (Widget, abonnements, sélection quotidienne)</b></summary>

![Configuration divers](GIFs/Miscellaneous_Widget-BotSetup.gif)

> ⚠️ **Auto-Approve Requests** de Seerr (basculé ici) détermine si une
> demande est approuvée instantanément ou atterrit dans le salon admin que
> tu as assigné à l'étape 2, pour qu'un humain l'approuve/refuse. Avec
> l'auto-approbation désactivée, **assure-toi que les permissions Discord
> de ce salon admin sont restreintes aux admins/modérateurs de confiance
> uniquement** — les boutons Approuver/Refuser ont le même pouvoir que ta
> clé API Seerr, sans vérification de permission séparée.

</details>

---

## 🐳 Mise à jour

```bash
docker pull jellyforge/questorr:latest
docker compose up -d
```

---

## 📄 Licence

Ce projet est distribué sous la [GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE). Tu es libre d'utiliser, modifier et distribuer ce logiciel selon les termes de l'AGPL-3.0. Si tu exploites une version modifiée en tant que service web, tu dois rendre le code source accessible.

---

<div align="center">

Maintenu par [Jellyforge-Dev](https://github.com/Jellyforge-Dev) &nbsp;|&nbsp; [💬 Discord](https://discord.gg/rXANrXJqVf) &nbsp;|&nbsp; [<img src="https://storage.ko-fi.com/cdn/cup-border.png" height="14" alt="Ko-fi"> Offre-moi un café](https://ko-fi.com/jellyforgedev)

</div>
