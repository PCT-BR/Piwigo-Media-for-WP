<?php
defined('ABSPATH') or die('No direct access.');

/**
 * Enqueues PiwigoMedia JavaScript for both:
 *   - Gutenberg block inserter  (piwigo-gutenberg.js via registerInserterMediaCategory)
 *   - Classic Editor wp.media modal (piwigo-media-frame.js via wp.media factory wrap)
 */
class Piwigo_Media_Tab
{
  public static function admin_init(): void
  {
    add_action('admin_enqueue_scripts', array(self::class, 'enqueue'));
  }

  public static function enqueue(string $hook): void
  {
    $modal_hooks = array('post.php', 'post-new.php', 'upload.php', 'media.php');
    if (!in_array($hook, $modal_hooks, true)) {
      return;
    }

    $server_url = get_option('piwigo_media_server_url', '');
    if (empty($server_url)) {
      return;
    }

    // Shared config object passed to both scripts
    $config = array(
      'apiBase'     => esc_url(rest_url('piwigo-media/v1')),
      'nonce'       => wp_create_nonce('wp_rest'),
      'defaultMode' => get_option('piwigo_media_default_mode', 'import'),
      'serverUrl'   => esc_url($server_url),
      'i18n'        => array(
        'tabLabel'       => 'Piwigo',
        'searchItems'    => 'Search Piwigo',
        'loading'        => 'Loading…',
        'selectBtn'      => 'Insert from Piwigo',
        'alreadyImported'=> 'Already imported',
        'noPhotos'       => 'No photos in this album.',
        'noAlbums'       => 'No albums found.',
        'error'          => 'Error: ',
      ),
    );

    // ── Gutenberg "Piwigo Photo" block ────────────────────────────────────
    // Block that opens a full album browser modal and converts to core/image on insert.
    wp_enqueue_script(
      'piwigo-block',
      PIWIGO_MEDIA_URL . 'assets/js/piwigo-block.js',
      array('wp-blocks', 'wp-element', 'wp-components', 'wp-data', 'wp-api-fetch', 'wp-block-editor'),
      PIWIGO_MEDIA_VERSION,
      true
    );
    wp_localize_script('piwigo-block', 'piwigoMediaConfig', $config);

    // ── Gutenberg inserter (registerInserterMediaCategory, WP 6.4+) ────────
    // Dependencies: wp-data (for dispatch), wp-api-fetch, wp-blocks
    wp_enqueue_script(
      'piwigo-gutenberg',
      PIWIGO_MEDIA_URL . 'assets/js/piwigo-gutenberg.js',
      array('wp-data', 'wp-api-fetch', 'wp-blocks', 'wp-block-editor'),
      PIWIGO_MEDIA_VERSION,
      true
    );
    wp_localize_script('piwigo-gutenberg', 'piwigoMediaConfig', $config);

    // ── Classic Editor / wp.media modal ────────────────────────────────────
    wp_enqueue_media();
    wp_enqueue_style(
      'piwigo-media',
      PIWIGO_MEDIA_URL . 'assets/css/piwigo-media.css',
      array(),
      PIWIGO_MEDIA_VERSION
    );
    wp_enqueue_script(
      'piwigo-media-frame',
      PIWIGO_MEDIA_URL . 'assets/js/piwigo-media-frame.js',
      array('jquery', 'media-views', 'wp-api-fetch', 'wp-hooks', 'wp-element'),
      PIWIGO_MEDIA_VERSION,
      true
    );
    // piwigoMediaConfig already localized via piwigo-gutenberg above
  }
}
