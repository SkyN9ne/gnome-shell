/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */

const Lang = imports.lang;
const Shell = imports.gi.Shell;

const Main = imports.ui.main;
const MessageTray = imports.ui.messageTray;

function WindowAttentionHandler() {
    this._init();
}

WindowAttentionHandler.prototype = {
    _init : function() {
        this._startupIds = {};
        this._tracker = Shell.WindowTracker.get_default();
        this._tracker.connect('startup-sequence-changed', Lang.bind(this, this._onStartupSequenceChanged));

        global.display.connect('window-demands-attention', Lang.bind(this, this._onWindowDemandsAttention));
    },

    _onStartupSequenceChanged : function(tracker) {
        let sequences = tracker.get_startup_sequences();
        this._startupIds = {};
        for(let i = 0; i < sequences.length; i++) {
            this._startupIds[sequences[i].get_id()] = true;
        }
    },

    _getTitle : function(app, window) {
        if (this._startupIds[window.get_startup_id()])
            return app.get_name();
        else
            return window.title;
    },

    _getBanner : function(app, window) {
        if (this._startupIds[window.get_startup_id()])
            return _("%s has finished starting").format(app.get_name());
        else
            return _("'%s' is ready").format(window.title);
    },

    _onWindowDemandsAttention : function(display, window) {
        // We don't want to show the notification when the window is already focused,
        // because this is rather pointless.
        // Some apps (like GIMP) do things like setting the urgency hint on the
        // toolbar windows which would result into a notification even though GIMP itself is
        // focused.
        // We are just ignoring the hint on skip_taskbar windows for now.
        // (Which is the same behaviour as with metacity + panel)

        if (!window || window.has_focus() || window.is_skip_taskbar())
            return;

        let app = this._tracker.get_window_app(window);
        let source = new Source(app, window);
        Main.messageTray.add(source);

        let notification = new MessageTray.Notification(source, this._getTitle(app, window), this._getBanner(app, window));
        source.notify(notification);

        source.signalIDs.push(window.connect('notify::title', Lang.bind(this, function(win) {
                                    notification.update(this._getTitle(app, win), this._getBanner(app, win));
                              })));
    }
};

function Source(app, window) {
    this._init(app, window);
}

Source.prototype = {
    __proto__ : MessageTray.Source.prototype,

    _init: function(app, window) {
        MessageTray.Source.prototype._init.call(this, app.get_name());
        this._window = window;
        this._app = app;
        this._setSummaryIcon(this.createNotificationIcon());

        this.signalIDs = [];
        this.signalIDs.push(this._window.connect('notify::demands-attention', Lang.bind(this, function() { this.destroy(); })));
        this.signalIDs.push(this._window.connect('focus', Lang.bind(this, function() { this.destroy(); })));
        this.signalIDs.push(this._window.connect('unmanaged', Lang.bind(this, function() { this.destroy(); })));

        this.connect('destroy', Lang.bind(this, this._onDestroy));
    },

    _onDestroy : function() {
        for(let i = 0; i < this.signalIDs.length; i++) {
           this._window.disconnect(this.signalIDs[i]);
        }
        this.signalIDs = [];
    },

    createNotificationIcon : function() {
        return this._app.create_icon_texture(this.ICON_SIZE);
    },

    open : function(notification) {
        Main.activateWindow(this._window);
        this.destroy();
    }
};
