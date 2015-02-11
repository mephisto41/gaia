/* global layoutManager, SettingsListener */
'use strict';
(function(exports) {
  var DEBUG = false;
  var _id = 0;
  /**
   * Text Selection Dialog of the AppWindow
   */

  var TextSelectionDialog = function (app) {
    this.app = app;
    this.containerElement = app ? app.element :
      document.getElementById('text-selection-dialog-root');
    this.instanceID = _id++;
    this.event = null;
    this._enabled = false;
    this._shortcutTimeout = null;
    this._injected = false;
    this._hasCutOrCopied = false;
    this._ignoreSelectionChange = false;
    this._isCommandSendable = false;
    this._transitionState = 'closed';
    this._scrolling = false;
    this._isSelectionVisible = true;
    this.textualmenuDetail = null;
    SettingsListener.observe('copypaste.enabled', true,
      function onObserve(value) {
        if (value) {
          this.start();
        } else {
          this.stop();
        }
      }.bind(this));
  };

  TextSelectionDialog.prototype = Object.create(window.BaseUI.prototype);

  TextSelectionDialog.prototype.TEXTDIALOG_HEIGHT = 52;

  TextSelectionDialog.prototype.TEXTDIALOG_WIDTH = 54;

  // Based on UX spec, there would be a temporary shortcut and only appears
  // after the action 'copy/cut'. In this use case, the utility bubble will be
  // time-out after 3 secs if no action is taken.
  TextSelectionDialog.prototype.SHORTCUT_TIMEOUT = 3000;

  // If text is not pasted immediately after copy/cut, the text will be viewed
  // as pasted after 15 seconds (count starting from the moment when there's no
  // action at all), and there will be no paste shortcut pop up when tapping on
  // edit field.
  TextSelectionDialog.prototype.RESET_CUT_OR_PASTE_TIMEOUT = 15000;

  // Distance between selected area and the bottom of menu when menu show on
  // the top of selected area.
  // By UI spec, 12px from the top of dialog to utility menu.
  TextSelectionDialog.prototype.DISTANCE_FROM_MENUBOTTOM_TO_SELECTEDAREA = 12;

  // Distance between selected area and the top of menu when menu show on
  // the bottom of selected area.
  // caret tile height is controlled by gecko, we estimate the height as
  // 22px. So 22px plus 12px which defined in UI spec, we get 34px from
  // the bottom of selected area to utility menu.
  TextSelectionDialog.prototype.DISTANCE_FROM_SELECTEDAREA_TO_MENUTOP = 43;

  // Minimum distance between bubble and boundary.
  TextSelectionDialog.prototype.DISTANCE_FROM_BOUNDARY = 5;

  TextSelectionDialog.prototype.ID_NAME = 'TextSelectionDialog';

  TextSelectionDialog.prototype.ELEMENT_PREFIX = 'textselection-dialog-';

  TextSelectionDialog.prototype.start = function tsd_start() {
    if (this._enabled) {
      return;
    }
    this._enabled = true;
    window.addEventListener('hierarchychanged', this);
    window.addEventListener('activeappchanged', this);
    window.addEventListener('home', this);
    window.addEventListener('value-selector-shown', this);
    window.addEventListener('value-selector-hidden', this);
    if (this.app) {
      this.app.element.addEventListener('mozbrowsercaretstatechanged', this);
    } else {
      window.addEventListener('mozChromeEvent', this);
    }
  };

  TextSelectionDialog.prototype.stop = function tsd_stop() {
    if (!this._enabled) {
      return;
    }
    this._enabled = false;
    window.removeEventListener('hierachychanged', this);
    window.removeEventListener('activeappchanged', this);
    window.removeEventListener('home', this);
    window.removeEventListener('value-selector-shown', this);
    window.removeEventListener('value-selector-hidden', this);
    if (this.app) {
      this.app.element.removeEventListener('mozbrowsercaretstatechanged', this);
    } else {
      window.removeEventListener('mozChromeEvent', this);
    }
  };

  TextSelectionDialog.prototype.debug = function tsd_debug(msg) {
    if (DEBUG || this._DEBUG) {
      console.log('[Dump: ' + this.ID_NAME + ']' +
        JSON.stringify(msg));
    }
  };

  TextSelectionDialog.prototype.handleEvent = function tsd_handleEvent(evt) {
    switch (evt.type) {
      case 'home':
      case 'activeappchanged':
      case 'hierarchychanged':
        this.close();
        break;
      case 'value-selector-shown':
        this._ignoreSelectionChange = true;
        break;
      case 'value-selector-hidden':
        this._ignoreSelectionChange = false;
        break;
      case 'mozbrowsercaretstatechanged':
        if (this._ignoreSelectionChange) {
          return;
        }

        evt.preventDefault();
        evt.stopPropagation();
        this._handleCaretStateChanged(evt.detail);
        break;
      case 'mozChromeEvent':
        switch (evt.detail.type) {
          case 'caretstatechanged':
            if (this._ignoreSelectionChange) {
              return;
            }
            evt.preventDefault();
            evt.stopPropagation();
            this._handleCaretStateChanged(evt.detail.detail);
            break;
        }
    }
  };

  TextSelectionDialog.prototype._handleCaretStateChanged =
    function tsd__handleCaretStateChanged(detail) {
      if (!detail) {
        return;
      }
      this.debug('on receive caret state change event');
      this.debug(JSON.stringify(detail));

      if (!this._injected) {
        this.render();
        this._injected = true;
      }

      if (detail.reason === "visibilitychange" && !detail.caretVisibe) {
        this.hide();
        return;
      }

      if (detail.reason === "presscaret") {
        this.hide();
        return;
      }

      if (detail.collapsed) {
        this._onCollapsedMode(detail);
      } else {
        this._onSelectionMode(detail);
      }
    };

  TextSelectionDialog.prototype._onCollapsedMode =
    function tsd__onCollapsedMode(detail) {
      if (!detail.caretVisible) {
        this.hide();
        return;
      }

      switch (detail.reason) {
        case 'taponcaret':
        case 'longpressonemptycontent':
          // Always allow
          break;
        case 'updateposition':
          // Only allow when this._hasCutOrCopied is true
          if (!this._hasCutOrCopied) {
            this.hide();
            return;
          }
          break;
        default:
          // Not allow
          this.hide();
          return;
      }

      detail.commands.canSelectAll = false;
      this._triggerShortcutTimeout();
      this.show(detail);
    };

  TextSelectionDialog.prototype._onSelectionMode =
    function tsd__onSelectionMode(detail) {
      if (!detail.selectionVisible) {
        this.hide();
        return;
      }

      this._resetShortcutTimeout();
      this.show(detail);
    };

  TextSelectionDialog.prototype._resetShortcutTimeout =
    function tsd__resetShortcutTimeout() {
      window.clearTimeout(this._shortcutTimeout);
      this._shortcutTimeout = null;
    };

  TextSelectionDialog.prototype._triggerShortcutTimeout =
    function tsd__triggerShortcutTimeout() {
      this._resetShortcutTimeout();
      this._shortcutTimeout = window.setTimeout(function() {
        this.close();
      }.bind(this), this.SHORTCUT_TIMEOUT);
    };

  TextSelectionDialog.prototype._fetchElements = function tsd__fetchElements() {
    this.element = document.getElementById(this.CLASS_NAME + this.instanceID);
    this.elements = {};

    var toCamelCase = function toCamelCase(str) {
      return str.replace(/\-(.)/g, function replacer(str, p1) {
        return p1.toUpperCase();
      });
    };

    this.elementClasses = ['copy', 'cut', 'paste', 'selectall'];

    // Loop and add element with camel style name to Modal Dialog attribute.
    this.elementClasses.forEach(function createElementRef(name) {
      this.elements[toCamelCase(name)] =
        this.element.querySelector('.' + this.ELEMENT_PREFIX + name);
    }, this);
  };

  TextSelectionDialog.prototype._registerEvents =
    function tsd__registerEvents() {
      var elements = this.elements;
      for (var ele in elements) {
        elements[ele].addEventListener('mousedown',
          this._elementEventHandler.bind(this));

        // We should not send command to gecko if user move their finger out of
        // the original button.
        elements[ele].addEventListener('mouseout',
          this._elementEventHandler.bind(this));
        elements[ele].addEventListener('click',
          this._elementEventHandler.bind(this));
      }

      this.element.addEventListener('transitionend',
        this._elementEventHandler.bind(this));
    };

  TextSelectionDialog.prototype._elementEventHandler =
    function tsd__elementEventHandler(evt) {
      switch (evt.type) {
        case 'mousedown':
          this._isCommandSendable = true;
          evt.preventDefault();
          break;
        case 'transitionend':
          if (this._transitionState === 'closing') {
            this._changeTransitionState('closed');
          }
          break;
        case 'click':
          this[evt.target.dataset.action + 'Handler'] &&
            this[evt.target.dataset.action + 'Handler'](evt);
          break;
        case 'mouseout':
          this._isCommandSendable = false;
          break;
      }
    };

  TextSelectionDialog.prototype._changeTransitionState =
    function tsd__changeTransitionState(state) {
      if (!this.element) {
        return;
      }
      switch (state) {
        case 'opened':
          this.element.classList.add('active');
          this.element.classList.add('visible');
          break;
        case 'closing':
          this.element.classList.remove('visible');
          break;
        case 'closed':
          this.element.classList.remove('active');
          break;
      }

      this._transitionState = state;
    };

  TextSelectionDialog.prototype._doCommand =
    function tsd_doCommand(evt, cmd, closeDialog) {
      if (!this._isCommandSendable) {
        return;
      }

      if (this.app) {
        if (this.textualmenuDetail) {
          this.textualmenuDetail.sendDoCommandMsg(cmd);
        }
      } else {
        var props = {
          detail: {
            type: 'copypaste-do-command',
            cmd: cmd
          }
        };
        this.debug(JSON.stringify(props));

        window.dispatchEvent(
          new CustomEvent('mozContentEvent', props));
      }

      if (closeDialog) {
        this.close();
      }
      evt.preventDefault();
    };

  TextSelectionDialog.prototype.copyHandler =
    function tsd_copyHandler(evt) {
      this._doCommand(evt, 'copy', true);
      this._resetCutOrCopiedTimer();
      this._hasCutOrCopied = true;
  };

  TextSelectionDialog.prototype.cutHandler =
    function tsd_cutHandler(evt) {
      this._doCommand(evt, 'cut', true);
      this._resetCutOrCopiedTimer();
      this._hasCutOrCopied = true;
  };

  TextSelectionDialog.prototype.pasteHandler =
    function tsd_pasteHandler(evt) {
      this._doCommand(evt, 'paste', true);
      this._hasCutOrCopied = false;
      window.clearTimeout(this._resetCutOrCopiedTimeout);
  };

  TextSelectionDialog.prototype.selectallHandler =
    function tsd_selectallHandler(evt) {
      this._doCommand(evt, 'selectall', false);
  };

  TextSelectionDialog.prototype.view = function tsd_view() {
    var id = this.CLASS_NAME + this.instanceID;
    var temp = `<div class="textselection-dialog" id="${id}">
              <div data-action="selectall"
                class="textselection-dialog-selectall"></div>
              <div data-action="cut" class="textselection-dialog-cut"></div>
              <div data-action="copy" class="textselection-dialog-copy">
                </div>
              <div data-action="paste" class="textselection-dialog-paste">
                </div>
            </div>`;
    return temp;
  };

  TextSelectionDialog.prototype._resetCutOrCopiedTimer =
    function tsd_resetCutOrCopiedTimer() {
      window.clearTimeout(this._resetCutOrCopiedTimeout);
      this._resetCutOrCopiedTimeout = window.setTimeout(function() {
        this._hasCutOrCopied = false;
      }.bind(this), this.RESET_CUT_OR_PASTE_TIMEOUT);
  };


  TextSelectionDialog.prototype.show = function tsd_show(detail) {
    this._resetShortcutTimeout();
    var numOfSelectOptions = 0;
    var options = [ 'Paste', 'Copy', 'Cut', 'SelectAll' ];

    // Based on UI spec, we should have dividers ONLY between each select option
    // So, we use css to put divider in pseudo element and set the last visible
    // option without it.
    var lastVisibleOption;
    options.forEach(function(option) {
      if (detail.commands['can' + option]) {
        numOfSelectOptions++;
        lastVisibleOption = this.elements[option.toLowerCase()];
        lastVisibleOption.classList.remove('hidden', 'last-option');
      } else {
        this.elements[option.toLowerCase()].classList.add('hidden');
      }
    }, this);

    this.numOfSelectOptions = numOfSelectOptions;
    this.textualmenuDetail = detail;
    // Add last-option class to the last item of options array;
    if (lastVisibleOption) {
      lastVisibleOption.classList.add('last-option');
    }

    this.updateDialogPosition();
  };

  TextSelectionDialog.prototype.updateDialogPosition =
    function tsd_updateDialogPosition() {
      var pos = this.calculateDialogPostion();
      this.debug(pos);
      this.element.style.top = pos.top + 'px';
      this.element.style.left = pos.left + 'px';
      this._changeTransitionState('opened');
    };

  TextSelectionDialog.prototype.calculateDialogPostion =
    function tsd_calculateDialogPostion() {
      var numOfSelectOptions = this.numOfSelectOptions;
      var detail = this.textualmenuDetail;
      var frameHeight = layoutManager.height;
      var frameWidth = layoutManager.width;
      var selectOptionWidth = this.TEXTDIALOG_WIDTH;
      var selectOptionHeight = this.TEXTDIALOG_HEIGHT;

      var selectDialogTop = (detail.rect.top) *
        detail.zoomFactor;
      var selectDialogBottom =
        (detail.rect.bottom) * detail.zoomFactor;
      var selectDialogLeft = (detail.rect.left) *
        detail.zoomFactor;
      var selectDialogRight =
        (detail.rect.right) * detail.zoomFactor;
      var distanceFromBottom = this.DISTANCE_FROM_SELECTEDAREA_TO_MENUTOP;
      var distanceFromTop = this.DISTANCE_FROM_MENUBOTTOM_TO_SELECTEDAREA;


      var posTop = selectDialogTop - selectOptionHeight - distanceFromTop;
      // Dialog position align to the center of selected area.
      var posLeft = (selectDialogLeft + selectDialogRight -
        numOfSelectOptions * selectOptionWidth)/ 2;

      // Put dialog under selected area if it overlap statusbar.
      if (posTop < 0) {
        posTop = selectDialogBottom + distanceFromBottom;
      }

      // Put dialog in the center of selected area if it overlap keyboard.
      if (posTop >= (frameHeight - distanceFromBottom - selectOptionHeight)) {
        posTop = (((selectDialogTop >= 0) ? selectDialogTop : 0) +
          ((selectDialogBottom >= frameHeight) ? frameHeight :
            selectDialogBottom) - selectOptionHeight) / 2;
      }

      if (posLeft < this.DISTANCE_FROM_BOUNDARY) {
        posLeft = this.DISTANCE_FROM_BOUNDARY;
      }

      if ((posLeft + numOfSelectOptions * selectOptionWidth +
           this.DISTANCE_FROM_BOUNDARY) > frameWidth) {
        posLeft = frameWidth - numOfSelectOptions * selectOptionWidth -
          this.DISTANCE_FROM_BOUNDARY;
      }

      var offset = 0;
      if (this.app) {
        offset = this.app.appChrome.isMaximized() ?
                 this.app.appChrome.height :
                 StatusBar.height;
      }

      return {
        top: posTop + offset,
        left: posLeft
      };
    };

  TextSelectionDialog.prototype.hide = function tsd_hide() {
    if (!this.element) {
      return;
    }
    this._changeTransitionState('closing');
  };

  TextSelectionDialog.prototype.close = function tsd_close() {
    if (this._transitionState !== 'opened') {
      return;
    }
    this.hide();
    this.element.blur();
    this.textualmenuDetail = null;
    this._resetShortcutTimeout();
  };

  exports.TextSelectionDialog = TextSelectionDialog;
}(window));
