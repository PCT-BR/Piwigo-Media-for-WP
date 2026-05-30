<?php
/**
 * Plugin Name:       PiwigoMedia
 * Plugin URI:        https://github.com/piwigo/piwigo-media-wp
 * Description:       Browse and import photos from your Piwigo gallery directly inside the WordPress media modal.
 * Version:           1.0.3
 * Author:            PiwigoMedia Project
 * Author URI:        https://piwigo.org
 * License:           GPL-2.0+
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       piwigo-media
 * Domain Path:       /languages
 * Requires at least: 6.5
 * Requires PHP:      8.1
 */

defined('ABSPATH') or die('No direct access.');

define('PIWIGO_MEDIA_VERSION', '1.0.3');
define('PIWIGO_MEDIA_DIR',     plugin_dir_path(__FILE__));
define('PIWIGO_MEDIA_URL',     plugin_dir_url(__FILE__));

require_once PIWIGO_MEDIA_DIR . 'includes/class-piwigo-api.php';
require_once PIWIGO_MEDIA_DIR . 'includes/class-piwigo-importer.php';
require_once PIWIGO_MEDIA_DIR . 'includes/class-piwigo-settings.php';
require_once PIWIGO_MEDIA_DIR . 'includes/class-piwigo-rest.php';
require_once PIWIGO_MEDIA_DIR . 'includes/class-piwigo-media-tab.php';

register_activation_hook(__FILE__,   array('Piwigo_Settings', 'activate'));
register_deactivation_hook(__FILE__, array('Piwigo_Settings', 'deactivate'));

add_action('init',            array('Piwigo_Settings',   'init'));
add_action('rest_api_init',   array('Piwigo_Rest',       'register_routes'));
add_action('admin_init',      array('Piwigo_Media_Tab',  'admin_init'));
add_action('admin_menu',      array('Piwigo_Settings',   'add_menu'));
