# PiwigoMedia for WordPress

Browse and import photos from your Piwigo gallery directly inside the WordPress media modal.

## What it does

**In WordPress:**
- Adds a **"Piwigo" tab** to the native WP media modal (works in Gutenberg and Classic Editor)
- Browse albums and photos from your Piwigo instance without leaving WordPress
- Insert images in **Link mode** (Piwigo URL) or **Import mode** (copy to WP Media Library)
- Automatically imports metadata: title, description, tags, EXIF (date, GPS, camera), alt text
- Detects photos already imported (shows "Already imported" badge)

**From Piwigo (via companion extension):**
- Accepts photo push requests from the [WPConnector Piwigo extension](https://github.com/tufferyromuald85-droid/WPConnector-for-Piwigo)
- Receives batch imports and associates photos with posts/pages

## Requirements

| Software | Version |
|----------|---------|
| WordPress | 6.5+   |
| PHP       | 8.1+   |
| Piwigo    | 16.1+  |

## Installation

1. Copy the `piwigo-media/` folder to `wp-content/plugins/`
2. Activate **PiwigoMedia** in *WP Admin → Plugins*
3. Go to **Settings → Piwigo Media** and configure:
   - **Piwigo server URL** — root URL of your Piwigo gallery
   - **Piwigo API Key** — generate one in *Piwigo Admin → Users → Profile → API Keys*
   - **Default insertion mode** — Import or Link
   - **Metadata mapping** — choose which fields to import

## REST API routes

All routes under `/wp-json/piwigo-media/v1/` — require `upload_files` capability.

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/albums` | List Piwigo albums |
| GET | `/albums/{id}/photos` | Photos in an album (paginated, 24/page) |
| GET | `/photos/{id}` | Photo detail + metadata |
| POST | `/import` | Import or link a single photo |
| POST | `/import/batch` | Import/link multiple photos (used by WPConnector) |
| GET | `/proxy/{id}` | Serve private Piwigo image through WP (optional) |

## Metadata mapping

| Piwigo field | WordPress field |
|---|---|
| `name` | Attachment title + alt text |
| `comment` | Caption / description |
| `tags[]` | `media_tag` taxonomy |
| `date_creation` | Attachment date |
| EXIF GPS | `_piwigo_lat`, `_piwigo_lng` |
| EXIF camera | `_piwigo_camera` |
| Piwigo ID | `_piwigo_photo_id` (dedup key) |

## Security

- The Piwigo API key is stored **AES-256-CBC encrypted** in `wp_options`, never exposed to the browser
- All REST routes require WordPress authentication (cookie + nonce, or Application Password)
- All Piwigo calls are server-to-server only

## Companion extension

Install **[WPConnector for Piwigo](https://github.com/tufferyromuald85-droid/WPConnector-for-Piwigo)** on your Piwigo instance to enable the "Send to WordPress" button in the Batch Manager.

## License

GPL v2 — see [COPYING.txt](https://www.gnu.org/licenses/gpl-2.0.txt)
