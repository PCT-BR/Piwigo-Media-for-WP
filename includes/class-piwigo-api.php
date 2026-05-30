<?php
defined('ABSPATH') or die('No direct access.');

/**
 * HTTP client for the Piwigo REST API (ws.php).
 * All calls are server-to-server using the API Key stored in WP options.
 * The API Key is never exposed to the browser.
 */
class Piwigo_Api
{
  private string $server_url;
  private string $api_key;

  public function __construct()
  {
    $this->server_url = rtrim(get_option('piwigo_media_server_url', ''), '/');
    $this->api_key    = Piwigo_Settings::get_api_auth(); // "{pkid}:{secret}"
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Test connectivity. Returns true or an error string. */
  public function test_connection(): bool|string
  {
    $data = $this->call('pwg.getVersion');
    if (is_wp_error($data)) {
      return $data->get_error_message();
    }
    return isset($data['result']) ? true : 'Unexpected Piwigo response';
  }

  /** List all accessible categories/albums. */
  public function get_albums(): array|WP_Error
  {
    return $this->call('pwg.categories.getList', array(
      'recursive'        => 1,
      'public'           => 1,
      'tree_output'      => 0,
      'thumbnail_size'   => 'thumb',
    ));
  }

  /** List photos in an album, paginated. */
  public function get_album_photos(int $album_id, int $page = 1, int $per_page = 24): array|WP_Error
  {
    return $this->call('pwg.categories.getImages', array(
      'cat_id'    => $album_id,
      'per_page'  => $per_page,
      'page'      => $page - 1,        // Piwigo pages are 0-indexed
      'order'     => 'date_creation DESC',
      'f_with_thumbnail' => 'true',
    ));
  }

  /** Fetch metadata for a single photo. */
  public function get_photo(int $photo_id): array|WP_Error
  {
    return $this->call('pwg.images.getInfo', array(
      'image_id'  => $photo_id,
      'comments_page' => 0,
    ));
  }

  /**
   * Return the direct URL to download a photo file.
   * Uses the 'original' derivative if available, otherwise 'large'.
   */
  public function get_photo_url(int $photo_id, string $size = 'original'): string|WP_Error
  {
    $data = $this->get_photo($photo_id);
    if (is_wp_error($data)) return $data;

    $info = $data['result'] ?? array();

    // Prefer original download URL
    if (!empty($info['file_url'])) {
      return $info['file_url'];
    }

    // Derivatives
    $derivatives = $info['derivatives'] ?? array();
    foreach (array($size, 'xxlarge', 'xlarge', 'large', 'medium') as $sz) {
      if (!empty($derivatives[$sz]['url'])) {
        return $derivatives[$sz]['url'];
      }
    }

    return new WP_Error('piwigo_no_url', 'Could not resolve photo URL for ID ' . $photo_id);
  }

  // ── Internal HTTP layer ────────────────────────────────────────────────────

  private function call(string $method, array $params = []): array|WP_Error
  {
    if (empty($this->server_url)) {
      return new WP_Error('piwigo_not_configured', 'Piwigo server URL is not set.');
    }

    // format must be a GET parameter — Piwigo only reads it from $_GET
    $url = $this->server_url . '/ws.php?format=json';

    $body = array_merge($params, array(
      'method' => $method,
    ));

    $response = wp_remote_post($url, array(
      'headers' => $this->headers(),
      'body'    => $body,
      'timeout' => 15,
    ));

    return $this->parse($response);
  }

  private function headers(): array
  {
    $h = array('Accept' => 'application/json');
    if ($this->api_key) {
      // Piwigo 16.1+ — header name is X-Piwigo-API, value is "{pkid}:{secret}"
      $h['X-Piwigo-API'] = $this->api_key;
    }
    return $h;
  }

  private function parse(array|WP_Error $response): array|WP_Error
  {
    if (is_wp_error($response)) {
      return $response;
    }

    $code = wp_remote_retrieve_response_code($response);
    if ($code !== 200) {
      return new WP_Error('piwigo_http', 'Piwigo returned HTTP ' . $code);
    }

    $body = wp_remote_retrieve_body($response);
    $data = json_decode($body, true);

    if (json_last_error() !== JSON_ERROR_NONE) {
      return new WP_Error('piwigo_json', 'Invalid JSON from Piwigo');
    }

    if (($data['stat'] ?? '') !== 'ok') {
      $msg = $data['message'] ?? 'Unknown Piwigo error (stat=' . ($data['stat'] ?? '?') . ')';
      return new WP_Error('piwigo_api', $msg);
    }

    return $data;
  }
}
