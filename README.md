# Centreon Alerts - Stream Deck Plugin

Plugin Stream Deck pour afficher le nombre d'alertes d'une instance Centreon directement sur vos touches.

## Compatibilite

| Composant | Version |
|-----------|---------|
| Stream Deck Software | >= 6.6 |
| Stream Deck SDK | 2 |
| macOS | >= 13 (Ventura) |
| Node.js (build) | >= 20 |
| Centreon | 24.x (API v1) |

## Actions

### Single Alert Count

Affiche le nombre d'alertes pour une criticite choisie (Warning **ou** Critical) sous forme d'un nombre colore sur la touche.

### Dual Alert Count

Affiche les deux compteurs (Warning et Critical) empiles sur la meme touche, separes par une ligne horizontale.

### Comportement commun

- Les compteurs se rafraichissent automatiquement toutes les **60 secondes**
- Un clic sur la touche ouvre la page de monitoring Centreon dans le navigateur avec les filtres correspondants pre-appliques
- Si un compteur depasse 100, il affiche **100+**
- En cas d'erreur de connexion, la touche affiche **ERR**

## Parametres

Chaque action se configure via le Property Inspector dans l'application Stream Deck :

| Parametre | Description |
|-----------|-------------|
| **Centreon URL** | URL de l'instance Centreon (ex: `https://192.168.250.250`) |
| **Username** | Nom d'utilisateur pour l'API Centreon |
| **Password** | Mot de passe (champ masque) |
| **Severity** | *(Single uniquement)* Warning ou Critical |
| **Host filter (regex)** | Expression reguliere pour filtrer par nom de host |
| **Service filter (regex)** | Expression reguliere pour filtrer par description de service |

Lorsque les deux filtres sont renseignes, ils fonctionnent en **ET logique** : seuls les services correspondant aux deux regex sont comptes.

## API Centreon

Le plugin utilise l'API v1 de Centreon :

- **Authentification** : `POST /centreon/api/index.php?action=authenticate`
- **Liste des services** : `GET /centreon/api/index.php?object=centreon_realtime_services&action=list`

Les certificats SSL auto-signes sont acceptes (courant pour les instances on-premise).

## Pre-requis

- [Node.js](https://nodejs.org/) >= 20
- npm

## Compilation

```bash
# Installer les dependances
npm install

# Compiler le plugin
npm run build

# Compiler en mode watch (recompile a chaque modification)
npm run watch
```

Le fichier compile est genere dans `com.io.paraita.centreon.alerts.sdPlugin/bin/plugin.js`.

## Installation

Copier le dossier `.sdPlugin` dans le repertoire des plugins Stream Deck :

```bash
cp -r com.io.paraita.centreon.alerts.sdPlugin ~/Library/Application\ Support/com.elgato.StreamDeck/Plugins/
```

Puis redemarrer l'application Stream Deck.

## Structure du projet

```
centreon-streamdeck/
├── com.io.paraita.centreon.alerts.sdPlugin/
│   ├── bin/plugin.js              # Code compile (sortie)
│   ├── imgs/                      # Icones du plugin et des actions
│   ├── ui/
│   │   ├── single-alert.html      # Property Inspector - Single
│   │   └── dual-alert.html        # Property Inspector - Dual
│   ├── logs/                      # Logs du plugin (genere au runtime)
│   └── manifest.json              # Manifest Stream Deck
├── src/
│   ├── plugin.ts                  # Point d'entree
│   ├── centreon-api.ts            # Client API Centreon
│   └── actions/
│       ├── single-alert.ts        # Action Single Alert Count
│       └── dual-alert.ts          # Action Dual Alert Count
├── package.json
├── rollup.config.mjs
└── tsconfig.json
```

## Logs

Les logs du plugin se trouvent dans :

```
~/Library/Application Support/com.elgato.StreamDeck/Plugins/com.io.paraita.centreon.alerts.sdPlugin/logs/
```

Le fichier courant est `com.io.paraita.centreon.alerts.0.log`. Les fichiers `.1.log`, `.2.log`, etc. sont des rotations de logs anterieures.
