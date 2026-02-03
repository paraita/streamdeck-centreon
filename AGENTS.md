# AGENTS.md - Guide pour agents IA

Ce fichier decrit le projet pour les agents IA (Codex, Claude Code, Copilot, etc.) qui seraient amenes a travailler sur ce codebase.

## Vue d'ensemble

Plugin Elgato Stream Deck ecrit en TypeScript qui interroge une instance Centreon 24 via son API REST v1 pour afficher le nombre d'alertes (warning/critical) sur les touches du Stream Deck.

## Stack technique

- **Runtime** : Node.js >= 20 (embarque par Stream Deck)
- **Langage** : TypeScript 5.x avec decorateurs TC39 Stage 3 (PAS `experimentalDecorators`)
- **SDK** : `@elgato/streamdeck` v1.x (SDK v2)
- **Build** : Rollup avec `@rollup/plugin-typescript`, `@rollup/plugin-node-resolve`, `@rollup/plugin-commonjs`
- **UI** : HTML avec `sdpi-components` v4 (composants web pour les Property Inspectors)

## Architecture

### Fichiers sources (`src/`)

- **`plugin.ts`** : Point d'entree. Desactive la verification TLS (`NODE_TLS_REJECT_UNAUTHORIZED=0`) car les instances Centreon on-premise utilisent souvent des certificats auto-signes. Enregistre les 2 actions et appelle `streamDeck.connect()`.

- **`centreon-api.ts`** : Client HTTP pour l'API Centreon v1.
  - `CentreonAPI` : classe qui gere l'authentification (avec re-auth automatique si token expire) et la recuperation des services en temps reel.
  - `buildCentreonUrl()` : normalise l'URL de base (ajout de `https://` si absent, suppression du trailing slash).
  - `buildMonitoringUrl()` : construit l'URL de la page monitoring Centreon avec les filtres pre-appliques dans la barre de recherche.

- **`actions/single-alert.ts`** : Action affichant un seul compteur (warning OU critical). Genere une image SVG dynamique avec le nombre colore.

- **`actions/dual-alert.ts`** : Action affichant les deux compteurs (warning ET critical) empiles sur la meme touche.

### Fichiers du plugin (`com.io.paraita.centreon.alerts.sdPlugin/`)

- **`manifest.json`** : Manifest Stream Deck SDK v2. UUID: `io.paraita.centreon.alerts`.
- **`ui/single-alert.html`** et **`ui/dual-alert.html`** : Property Inspectors (formulaires de configuration des boutons).
- **`bin/plugin.js`** : Bundle compile (sortie de Rollup). Ne pas editer manuellement.
- **`imgs/`** : Icones PNG et SVG.

## API Centreon v1

### Authentification

```
POST {baseUrl}/centreon/api/index.php?action=authenticate
Content-Type: application/x-www-form-urlencoded
Body: username=xxx&password=xxx
Response: { "authToken": "..." }
```

### Liste des services temps reel

```
GET {baseUrl}/centreon/api/index.php?object=centreon_realtime_services&action=list&limit=100000
Header: centreon-auth-token: <token>
```

Retourne un tableau JSON de services. Chaque service a ces champs pertinents :
- `name` (string) : nom du host - utilise pour le filtre host regex cote plugin
- `description` (string) : nom du service - utilise pour le filtre service regex cote plugin
- `state` (number) : 0=OK, 1=WARNING, 2=CRITICAL, 3=UNKNOWN
- `acknowledged` (number) : 0 ou 1

### URL de monitoring (ouverture navigateur)

La page Centreon 24 monitoring resources accepte un parametre `filter` encode en JSON :

```
/centreon/monitoring/resources?filter=<encoded JSON>
```

Le JSON contient un tableau `criterias` avec une entree `search` dont la valeur est une chaine de recherche au format :

```
status:warning,critical parent_name:<hostFilter> <serviceFilter>
```

Points importants :
- Pas d'espace apres `status:` (sinon Centreon l'interprete mal)
- Le filtre host utilise le prefixe `parent_name:` dans la chaine de recherche (pas `name`)
- Le filtre service est un terme de recherche libre (pas de prefixe)

## Flux de donnees

1. `onWillAppear` : l'action demarre un timer de polling (60s)
2. A chaque tick : instanciation de `CentreonAPI` -> auth -> fetch services -> filtrage regex cote client -> comptage par state -> generation SVG -> `setImage()`
3. `onKeyDown` : construit l'URL monitoring filtree et appelle `streamDeck.system.openUrl()`
4. `onDidReceiveSettings` : redemarre le polling avec les nouveaux parametres
5. `onWillDisappear` : arrete le timer

## Commandes

```bash
npm install          # Installer les dependances
npm run build        # Compiler le plugin
npm run watch        # Compiler en mode watch
```

## Deploiement

Copier le dossier `.sdPlugin` dans :
```
~/Library/Application Support/com.elgato.StreamDeck/Plugins/
```
Puis redemarrer Stream Deck. Pour un deploiement rapide pendant le dev :
```bash
cp com.io.paraita.centreon.alerts.sdPlugin/bin/plugin.js ~/Library/Application\ Support/com.elgato.StreamDeck/Plugins/com.io.paraita.centreon.alerts.sdPlugin/bin/plugin.js
```

## Logs

```
~/Library/Application Support/com.elgato.StreamDeck/Plugins/com.io.paraita.centreon.alerts.sdPlugin/logs/
```

Le fichier `.0.log` est le log courant. Les numeros superieurs sont des rotations. Le logger utilise des scopes : `CentreonAPI`, `SingleAlert`, `DualAlert`.

## Pieges connus

- Les decorateurs utilisent la syntaxe TC39 Stage 3, pas `experimentalDecorators`. Ne pas ajouter `experimentalDecorators: true` dans tsconfig.
- Le champ `state` de l'API Centreon est un **number**, pas une string. Comparer avec `=== 1` et `=== 2`, pas `=== "1"`.
- L'API Centreon retourne 30 resultats par defaut. Toujours specifier `limit=100000` pour tout recuperer.
- Le champ host s'appelle `name` dans la reponse API mais `parent_name` dans la syntaxe de recherche du dashboard Centreon.
- Les instances Centreon on-premise utilisent souvent des certificats auto-signes. `NODE_TLS_REJECT_UNAUTHORIZED=0` est necessaire.
- Le `sdpi-components.js` est charge depuis un CDN. Pour une distribution hors-ligne, le telecharger localement dans `ui/`.
