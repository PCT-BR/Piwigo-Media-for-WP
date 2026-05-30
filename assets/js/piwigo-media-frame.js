/**
 * PiwigoMedia — custom tab in the WordPress media modal.
 *
 * Where to find it:
 *   Classic Editor  → "Add Media" → "Piwigo" tab in the top navigation
 *   Gutenberg       → Image block → "Media Library" → "Piwigo" tab
 *
 * Architecture note:
 *   Router tabs (Upload / Media Library / Piwigo) work at the *content-mode*
 *   level, not the state level.  Clicking a tab with id='piwigo-browser'
 *   fires content:create:piwigo-browser on the frame.  We listen for that
 *   event and inject our view.  No custom State needed.
 */
(function ($, wp) {
  'use strict';

  if (
    !wp || !wp.media || !wp.Backbone ||
    !wp.media.view || !wp.media.view.MediaFrame || !wp.media.view.MediaFrame.Post ||
    !wp.media.View || !wp.media.controller
  ) return;

  var cfg   = window.piwigoMediaConfig || {};
  var i18n  = cfg.i18n    || {};
  var api   = cfg.apiBase || '';
  var nonce = cfg.nonce   || '';

  // ── API fetch helper ──────────────────────────────────────────────────────
  function piwigoFetch(path, opts) {
    return $.ajax($.extend({
      url:        api + path,
      type:       'GET',
      beforeSend: function (xhr) { xhr.setRequestHeader('X-WP-Nonce', nonce); },
      dataType:   'json',
    }, opts || {}));
  }

  // ── Albums view ───────────────────────────────────────────────────────────
  var AlbumsView = wp.Backbone.View.extend({
    className: 'piwigo-albums-view',
    events: { 'click .piwigo-album-item': 'selectAlbum' },

    initialize: function () { this.render(); this.load(); },

    load: function () {
      var self = this;
      self.$el.html('<p class="piwigo-loading">' + (i18n.loading || 'Loading…') + '</p>');

      piwigoFetch('/albums').done(function (albums) {
        if (!albums || !albums.length) {
          self.$el.html('<p class="piwigo-empty">' + (i18n.noAlbums || 'No albums found.') + '</p>');
          return;
        }
        var html = '<ul class="piwigo-grid">';
        albums.forEach(function (a) {
          var thumb = a.thumbnail_url
            ? '<img src="' + _.escape(a.thumbnail_url) + '" alt="" loading="lazy">'
            : '<span class="piwigo-no-thumb"></span>';
          html += '<li class="piwigo-album-item" data-id="' + a.id + '" data-name="' + _.escape(a.name) + '">'
            + thumb
            + '<span class="piwigo-album-label">' + _.escape(a.name)
            + ' <small>(' + (a.total_nb_images || 0) + ')</small></span></li>';
        });
        self.$el.html(html + '</ul>');
      }).fail(function () {
        self.$el.html('<p class="piwigo-error">' + (i18n.error || 'Error') + ': could not load albums.</p>');
      });
    },

    selectAlbum: function (e) {
      var $item = $(e.currentTarget);
      this.trigger('album:select', +$item.data('id'), $item.data('name'));
    },
  });

  // ── Photos view ───────────────────────────────────────────────────────────
  var PhotosView = wp.Backbone.View.extend({
    className: 'piwigo-photos-view',
    events: {
      'click .piwigo-photo-item': 'selectPhoto',
      'click .piwigo-back':       'goBack',
      'click .piwigo-load-more':  'loadMore',
    },

    initialize: function (opts) {
      this.albumId   = opts.albumId;
      this.albumName = opts.albumName;
      this.page      = 1;
      this.perPage   = 24;
      this.total     = 0;
      this.photos    = [];
      this.render();
      this.load();
    },

    render: function () {
      this.$el.html(
        '<div class="piwigo-breadcrumb">'
        + '<button class="piwigo-back button">← Albums</button>'
        + ' / <strong>' + _.escape(this.albumName) + '</strong>'
        + '</div>'
        + '<ul class="piwigo-grid piwigo-photos-grid"></ul>'
        + '<p class="piwigo-loading piwigo-photos-loading" style="display:none">'
        + (i18n.loading || 'Loading…') + '</p>'
        + '<button class="piwigo-load-more button" style="display:none">Load more</button>'
      );
      return this;
    },

    load: function () {
      var self = this;
      self.$('.piwigo-photos-loading').show();

      piwigoFetch('/albums/' + self.albumId + '/photos', {
        data: { page: self.page, per_page: self.perPage },
      }).done(function (resp) {
        self.$('.piwigo-photos-loading').hide();
        self.total = resp.total || 0;

        if (!resp.photos || !resp.photos.length) {
          if (self.page === 1) {
            self.$('.piwigo-photos-grid').html('<li class="piwigo-empty-item">'
              + (i18n.noPhotos || 'No photos.') + '</li>');
          }
          return;
        }

        resp.photos.forEach(function (photo) {
          self.photos.push(photo);
          var badge = photo.wp_attachment_id
            ? '<span class="piwigo-already-imported">' + (i18n.alreadyImported || '✓') + '</span>' : '';
          var thumb = photo.thumb_url
            ? '<img src="' + _.escape(photo.thumb_url) + '" alt="" loading="lazy">'
            : '<span class="piwigo-no-thumb"></span>';
          self.$('.piwigo-photos-grid').append(
            '<li class="piwigo-photo-item" data-id="' + photo.id + '">' + thumb + badge + '</li>'
          );
        });

        var remaining = self.total - self.photos.length;
        self.$('.piwigo-load-more').toggle(remaining > 0).text('Load more (' + remaining + ' remaining)');
      }).fail(function () {
        self.$('.piwigo-photos-loading').hide();
        self.$('.piwigo-photos-grid').append('<li class="piwigo-error-item">' + (i18n.error || 'Error') + '</li>');
      });
    },

    loadMore: function ()    { this.page++; this.load(); },
    goBack:   function ()    { this.trigger('back'); },

    selectPhoto: function (e) {
      var $item = $(e.currentTarget);
      $('.piwigo-photo-item').removeClass('piwigo-selected');
      $item.addClass('piwigo-selected');
      var id = +$item.data('id');
      this.trigger('photo:select', this.photos.find(function (p) { return p.id === id; }) || { id: id });
    },
  });

  // ── Detail / insert view ──────────────────────────────────────────────────
  var PhotoDetailView = wp.Backbone.View.extend({
    className: 'piwigo-detail-view',
    events: {
      'click .piwigo-insert': 'insert',
      'click .piwigo-back':   'goBack',
      'change .piwigo-mode':  'changeMode',
    },

    initialize: function (opts) {
      this.photo     = opts.photo;
      this.albumName = opts.albumName;
      this.frame     = opts.frame;
      this.mode      = cfg.defaultMode || 'import';
      this.busy      = false;
      this.render();
      this.loadDetail();
    },

    render: function () {
      this.$el.html(
        '<div class="piwigo-breadcrumb">'
        + '<button class="piwigo-back button">← ' + _.escape(this.albumName) + '</button>'
        + '</div>'
        + '<div class="piwigo-detail-body">'
        +   '<div class="piwigo-detail-preview">'
        +     '<p class="piwigo-loading">' + (i18n.loading || 'Loading…') + '</p>'
        +   '</div>'
        +   '<div class="piwigo-detail-info">'
        +     '<h3 class="piwigo-detail-title"></h3>'
        +     '<p class="piwigo-detail-desc"></p>'
        +     '<div class="piwigo-mode-selector">'
        +       '<label><input type="radio" class="piwigo-mode" name="piwigo_insert_mode" value="import" '
        +         (this.mode === 'import' ? 'checked' : '') + '> Import to WP Media Library</label>'
        +       '<label><input type="radio" class="piwigo-mode" name="piwigo_insert_mode" value="link" '
        +         (this.mode === 'link' ? 'checked' : '') + '> Link (Piwigo URL)</label>'
        +     '</div>'
        +     '<p class="piwigo-detail-status"></p>'
        +     '<button class="piwigo-insert button button-primary">Insert into post</button>'
        +   '</div>'
        + '</div>'
      );
      return this;
    },

    loadDetail: function () {
      var self = this;
      piwigoFetch('/photos/' + self.photo.id).done(function (photo) {
        self.fullPhoto = photo;
        var src = photo.medium_url || photo.thumb_url || '';
        self.$('.piwigo-detail-preview').html(src ? '<img src="' + _.escape(src) + '" alt="">' : '');
        self.$('.piwigo-detail-title').text(photo.title || '');
        self.$('.piwigo-detail-desc').text(photo.description || '');
        if (photo.wp_attachment_id) {
          self.$('.piwigo-detail-status').html(
            '<span class="piwigo-already-badge">' + (i18n.alreadyImported || '✓ Already imported') + '</span>'
          );
        }
      }).fail(function () {
        self.$('.piwigo-detail-preview').html('<p class="piwigo-error">Could not load photo details.</p>');
      });
    },

    changeMode: function (e) { this.mode = e.target.value; },
    goBack:     function ()  { this.trigger('back'); },

    insert: function () {
      var self = this;
      if (self.busy) return;
      self.busy = true;
      self.$('.piwigo-insert').prop('disabled', true).text('Inserting…');
      self.$('.piwigo-detail-status').text('');

      piwigoFetch('/import', {
        type:        'POST',
        contentType: 'application/json',
        data:        JSON.stringify({ piwigo_photo_id: self.photo.id, mode: self.mode }),
      }).done(function (result) {
        self.busy = false;
        self.$('.piwigo-insert').prop('disabled', false).text('Insert into post');

        if (result && result.attachment_id) {
          self.trigger('photo:inserted', result.attachment_id, self.frame);
        } else {
          self.$('.piwigo-detail-status').text('Error: unexpected response.');
        }
      }).fail(function (xhr) {
        self.busy = false;
        self.$('.piwigo-insert').prop('disabled', false).text('Insert into post');
        var msg = xhr.responseJSON && xhr.responseJSON.message ? xhr.responseJSON.message : 'Request failed.';
        self.$('.piwigo-detail-status').text((i18n.error || 'Error: ') + msg);
      });
    },
  });

  // ── Browser content (navigation controller) ───────────────────────────────
  var PiwigoBrowserContent = wp.media.View.extend({
    className: 'piwigo-browser-content',

    initialize: function (opts) {
      this.frame       = opts.controller;
      this.currentView = null;
      this.showAlbums();
    },

    showAlbums: function () {
      var view = new AlbumsView();
      this.listenTo(view, 'album:select', this.showPhotos.bind(this));
      this.swap(view);
    },

    showPhotos: function (albumId, albumName) {
      var view = new PhotosView({ albumId: albumId, albumName: albumName });
      this.listenTo(view, 'back',         this.showAlbums.bind(this));
      this.listenTo(view, 'photo:select', this.showDetail.bind(this, albumName));
      this.swap(view);
    },

    showDetail: function (albumName, photo) {
      var view = new PhotoDetailView({ photo: photo, albumName: albumName, frame: this.frame });
      this.listenTo(view, 'back',           this.showAlbums.bind(this));
      this.listenTo(view, 'photo:inserted', this.onInserted.bind(this));
      this.swap(view);
    },

    onInserted: function (attachmentId, frame) {
      var attachment = wp.media.attachment(attachmentId);
      attachment.fetch().done(function () {
        // Put the attachment into the library state's selection so WordPress
        // editors (Classic + Gutenberg) receive it via the standard 'select' event.
        var libraryState = frame.state('library');
        if (libraryState) {
          var selection = libraryState.get('selection');
          if (selection) selection.reset([attachment]);
        }
        frame.close();
        frame.trigger('select');
      });
    },

    swap: function (view) {
      if (this.currentView) {
        this.stopListening(this.currentView);
        this.currentView.remove();
      }
      this.currentView = view;
      this.$el.empty().append(view.el);
      view.delegateEvents();
    },

    render: function () { return this; },
  });

  // ── Helper: add Piwigo tab to any router view that has .set() ────────────
  function addPiwigoTab(routerView) {
    // routerView can be a wp.media.view.Router OR a wp.media.controller.Region
    // (Region wraps the view in .view). Try both.
    var target = (routerView && routerView.view && typeof routerView.view.set === 'function')
      ? routerView.view
      : routerView;

    if (target && typeof target.set === 'function') {
      target.set({
        'piwigo-browser': {
          text:     i18n.tabLabel || 'Piwigo',
          priority: 200,
        },
      });
    }
  }

  // ── Patch MediaFrame.Post ─────────────────────────────────────────────────
  var OrigPost = wp.media.view.MediaFrame.Post;

  wp.media.view.MediaFrame.Post = OrigPost.extend({

    initialize: function () {
      OrigPost.prototype.initialize.apply(this, arguments);

      // Mechanism 1 (primary): clicked tab 'piwigo-browser' fires this event.
      this.on('content:create:piwigo-browser', this.piwigoContent, this);

      // Mechanism 2 (fallback): fired when the router is rendered with mode 'browse'.
      // Covers cases where browseRouter() is not called (e.g. WP version differences).
      this.on('router:create:browse', function (routerView) {
        addPiwigoTab(routerView);
      }, this);
    },

    // browseRouter is called by WordPress to populate the tab navigation.
    // We call the original (safe) then add our tab.
    browseRouter: function (routerView) {
      if (typeof OrigPost.prototype.browseRouter === 'function') {
        OrigPost.prototype.browseRouter.apply(this, arguments);
      }
      addPiwigoTab(routerView);
    },

    // Renders our Piwigo browser when the 'piwigo-browser' content mode is active.
    piwigoContent: function (content) {
      content.view = new PiwigoBrowserContent({ controller: this });
    },

  });

}(jQuery, wp));
