# Mémoire projet — PiwigoMedia for WordPress + WPConnector for Piwigo
> Exportée le 2026-05-30 — session Claude Sonnet 4.6

---

## 1. Contexte et personnes

**Développeur :** Romuald Tuffery  
**Email Git/SSH :** toolbox@prudente-consulting.com.br  
**Serveur :** Scaleway — Piwigo 17.0.0 beta1 installé à `/var/www/html`  
**WordPress :** pas sur ce serveur — dans un Docker local de Romuald  
**Repos GitHub :** compte `tufferyromuald85-droid`

---

## 2. Deux composants livrés

### WPConnector — Extension Piwigo
| | |
|---|---|
| **Chemin** | `/var/www/html/plugins/WPConnector/` |
| **GitHub** | `git@github.com:tufferyromuald85-droid/WPConnector-for-Piwigo.git` |
| **Rôle** | Bouton "↗ Send to WordPress" dans le Batch Manager Piwigo |
| **Auth vers WP** | Application Password WP (Basic Auth), stocké dans `conf['wp_connector']` |
| **Endpoint custom** | `pwg.wp.getSuggestions` — retourne articles/pages WP récents |

**Fichiers clés :**
```
WPConnector/
├── main.inc.php              hooks: ws_add_methods, loc_begin_admin, loc_begin_admin_page
├── maintain.class.php        install/uninstall, stockage conf
├── admin.php                 page config (URL WP + App Password + mode)
├── include/functions.php     client HTTP vers WP REST API
├── include/ws_functions.php  handler pwg.wp.getSuggestions
├── js/wp-connector.js        panel batch manager, POST vers /import/batch
└── template/
    ├── configuration.tpl     page settings Smarty
    └── batch_panel.tpl       HTML/CSS du panel latéral
```

---

### piwigo-media — Plugin WordPress
| | |
|---|---|
| **Chemin** | `/var/www/piwigo-media/` (à zipper, installer dans WP) |
| **GitHub** | `git@github.com:tufferyromuald85-droid/Piwigo-Media-for-WP.git` |
| **Version** | 1.1.0 |
| **Requires** | WordPress 6.5+, PHP 8.1+, Piwigo 16.1+ |

**Fichiers clés :**
```
piwigo-media/
├── piwigo-media.php                    entry point, v1.1.0
├── uninstall.php
├── includes/
│   ├── class-piwigo-api.php            client HTTP Piwigo (X-Piwigo-API header)
│   ├── class-piwigo-importer.php       sideload + mapping métadonnées complet
│   ├── class-piwigo-settings.php       page admin + AES-256-CBC sur API key
│   ├── class-piwigo-rest.php           6 routes REST
│   └── class-piwigo-media-tab.php      enqueue des 3 scripts JS
├── assets/
│   ├── js/piwigo-gutenberg.js          registerInserterMediaCategory (✅ marche)
│   ├── js/piwigo-block.js              bloc Gutenberg "Piwigo Photo" (✅ marche)
│   └── js/piwigo-media-frame.js        wp.media tab + editor.MediaUpload filter (🔄 en test)
├── assets/css/piwigo-media.css
└── templates/settings-page.php
```

---

## 3. Routes REST WordPress

Base : `/wp-json/piwigo-media/v1/`

| Méthode | Route | Description |
|---|---|---|
| GET | `/albums` | Liste albums Piwigo |
| GET | `/albums/{id}/photos?page=&per_page=` | Photos paginées |
| GET | `/photos/{id}` | Détail + métadonnées |
| GET | `/inserter-photos?search=&per_page=&page=` | Pour Gutenberg inserter |
| POST | `/import` | Import/link une photo |
| POST | `/import/batch` | Import/link multiple (WPConnector) |
| GET | `/proxy/{id}` | Proxy image pour albums privés (optionnel) |

---

## 4. Points techniques critiques

### API Piwigo
- **Header** : `X-Piwigo-API` (PAS `X-Piwigo-API-Key`)
- **format=json** : GET param uniquement (`ws.php?format=json`), jamais dans le body POST — Piwigo lit `format` uniquement depuis `$_GET`
- **API Key** : deux champs — ID (`pkid-YYYYMMDD-xxxx`) + Secret (40 chars) — combinés `{id}:{secret}` dans le header
- **Search** : `pwg.images.search` avec query ; `pwg.categories.getImages` sans cat_id pour tout lister

### Chiffrement API Key WP
```php
// Stockage : AES-256-CBC, clé dérivée de AUTH_KEY WordPress
Piwigo_Settings::store_field('api_key_id', $id);
Piwigo_Settings::store_field('api_key_secret', $secret);
$auth = Piwigo_Settings::get_api_auth(); // retourne "{pkid}:{secret}"
```

---

## 5. Intégration Gutenberg — Leçons apprises

### Ce qui FONCTIONNE ✅

**`registerInserterMediaCategory()`** (WP 6.4+)  
→ Onglet "Piwigo" dans le bloc "+" comme Openverse  
→ `piwigo-gutenberg.js` — dépendances : `wp-data, wp-api-fetch, wp-blocks, wp-block-editor`

**Bloc custom "Piwigo Photo"** (`piwigo-media/photo`)  
→ `wp.components.Modal` avec arborescence Albums → Photos → Détail → Import  
→ Se remplace lui-même par `core/image` après sélection via `dispatch('core/block-editor').replaceBlock()`  
→ `piwigo-block.js` — dépendances : `wp-blocks, wp-element, wp-components, wp-data, wp-api-fetch, wp-block-editor`

### Ce qui NE FONCTIONNE PAS (et pourquoi) ❌

**`wp.media.view.MediaFrame.Post.extend({...})`**  
→ Gutenberg stocke une référence à la classe ORIGINALE avant notre patch. La nouvelle classe est invisible pour lui.

**`wp.media.view.MediaFrame.Post.prototype` patch direct**  
→ L'`initialize` n'est jamais appelée → Gutenberg ne passe PAS par `wp.media.view.MediaFrame.Post` pour ses frames

**`window.wp.media()` factory wrap**  
→ `wp.media factory wrapped` apparaît mais `frame created` jamais → Gutenberg n'appelle pas `window.wp.media()` du tout

**Raison fondamentale :** `MediaUpload` dans `@wordpress/block-editor` est un **slot-fill vide** qui ne fait rien. WordPress core enregistre l'implémentation réelle via `addFilter('editor.MediaUpload', 'core/edit-post/...', ..., 10)`. Gutenberg utilise le composant React enregistré par ce filtre, pas `window.wp.media` directement.

### Solution correcte (en cours de test) 🔄

```javascript
wp.hooks.addFilter(
    'editor.MediaUpload',
    'piwigo-media/intercept-media-upload',
    function(OriginalMediaUpload) {
        return function PiwigoMediaUpload(props) {
            var render = props.render;
            return wp.element.createElement(OriginalMediaUpload, Object.assign({}, props, {
                render: function(renderProps) {
                    var origOpen = renderProps.open;
                    function piwigoOpen() {
                        // Intercept wp.media() frame creation
                        var _orig = window.wp.media;
                        window.wp.media = function(attrs) {
                            var frame = _orig.apply(this, arguments);
                            frame.on('router:create:browse', addPiwigoTab);
                            frame.on('content:render:piwigo-browser', piwigoContent);
                            window.wp.media = _orig; // restore immediately
                            return frame;
                        };
                        _.extend(window.wp.media, _orig);
                        origOpen();
                    }
                    return render(Object.assign({}, renderProps, { open: piwigoOpen }));
                }
            }));
        };
    },
    100 // après core à ~10
);
```

### Autres leçons

| Erreur | Correct |
|---|---|
| `content:create:piwigo-browser` | `content:render:piwigo-browser` — WP core utilise `content:render:` |
| `routerView.set` dans `extend()` | Fonctionne mais `initialize` jamais appelée par Gutenberg |
| Enqueue sur `post.php`, `post-new.php` seulement | Suffisant — Gutenberg = même page hook |

---

## 6. Scripts JS — dépendances

| Script | Dépendances WP | Rôle |
|---|---|---|
| `piwigo-gutenberg.js` | wp-data, wp-api-fetch, wp-blocks, wp-block-editor | registerInserterMediaCategory |
| `piwigo-block.js` | wp-blocks, wp-element, wp-components, wp-data, wp-api-fetch, wp-block-editor | Bloc Gutenberg custom |
| `piwigo-media-frame.js` | jquery, media-views, wp-api-fetch, wp-hooks, wp-element | wp.media tab + editor.MediaUpload filter |

---

## 7. État des repos Git

```
WPConnector-for-Piwigo   main  — v1.0.0 tag
Piwigo-Media-for-WP      main  — v1.0.0 tag, courante 1.1.0 (commits après tag)
```

Commits notables Piwigo-Media-for-WP :
- `af8946b` initial v1.0.0
- `c0b6531` fix API key deux champs (ID + Secret)
- `e16e6c1` fix format=json en GET param
- `27df164` fix event content:create vs content:render
- `1d56bba` feat registerInserterMediaCategory (Gutenberg inserter ✅)
- `dfd5617` feat bloc Piwigo Photo + Gutenberg block ✅
- `54fe0df` feat editor.MediaUpload filter (en test)

---

## 8. Environnement serveur

- Piwigo 17.0.0 beta1 à `/var/www/html`
- PHP 8.5.4, MariaDB 11.8.6, Apache2
- Piwigo accessible sur `http://localhost` (vhost Apache port 80)
- WordPress : Docker local sur la machine de Romuald, pas sur ce serveur
- SSH GitHub : `git@github.com` via clé `id_ed25519` dans `/root/.ssh/`

---

## 9. Plugins de référence testés/analysés

| Plugin | Slug | Technique | Ajoute un onglet media modal ? |
|---|---|---|---|
| FileBird | `filebird` | Backbone views | Non — ajoute arborescence aux médias existants |
| Enhanced Media Library | `enhanced-media-library` | Taxonomy hooks | Non — ajoute filtres à la modal existante |
| Real Media Library Lite | `real-media-library-lite` | Hooks JS custom + REST API extensions | Non — injecte UI dossiers via ses propres hooks |
| Sirv | `sirv` | Modal séparé | Non — bouton externe |
| Openverse (core WP) | intégré | `registerInserterMediaCategory()` | Non — inserter seulement |

**Conclusion :** Aucun plugin actif en 2024-2025 n'ajoute une source externe comme onglet dans le modal wp.media de Gutenberg. Tous utilisent soit l'inserter, soit leur propre UI.
