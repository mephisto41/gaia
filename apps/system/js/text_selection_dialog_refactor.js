/* global layoutManager, SettingsListener */
'use strict';
(function(exports) {
  var DEBUG = false;
  var _id = 0;
  /**
   * Text Selection Dialog of the AppWindow
   */

  var TextSelectionDialogRefactor = function (app) {
    this.app = app;
    this._shortcutTimeout = null;
    if (app) {
      this.containerElement = app.element;
      this.app.element.addEventListener('mozbrowsercaretstatechanged',
        this);
    } else {
      this.containerElement =
        document.getElementById('text-selection-dialog-root');
      window.addEventListener('mozChromeEvent', this);
    }
    this.instanceID = _id++;
    this._injected = false;
  };

  TextSelectionDialogRefactor.prototype = Object.create(window.BaseUI.prototype);

  TextSelectionDialogRefactor.prototype.TEXTDIALOG_HEIGHT = 52;

  TextSelectionDialogRefactor.prototype.TEXTDIALOG_WIDTH = 54;

  // Based on UX spec, there would be a temporary shortcut and only appears
  // after the action 'copy/cut'. In this use case, the utility bubble will be
  // time-out after 3 secs if no action is taken.
  TextSelectionDialogRefactor.prototype.SHORTCUT_TIMEOUT = 3000;

  // If text is not pasted immediately after copy/cut, the text will be viewed
  // as pasted after 15 seconds (count starting from the moment when there's no
  // action at all), and there will be no paste shortcut pop up when tapping on
  // edit field.
  TextSelectionDialogRefactor.prototype.RESET_CUT_OR_PASTE_TIMEOUT = 15000;

  // Distance between selected area and the bottom of menu when menu show on
  // the top of selected area.
  // By UI spec, 12px from the top of dialog to utility menu.
  TextSelectionDialogRefactor.prototype.DISTANCE_FROM_MENUBOTTOM_TO_SELECTEDAREA = 12;

  // Distance between selected area and the top of menu when menu show on
  // the bottom of selected area.
  // caret tile height is controlled by gecko, we estimate the height as
  // 22px. So 22px plus 12px which defined in UI spec, we get 34px from
  // the bottom of selected area to utility menu.
  TextSelectionDialogRefactor.prototype.DISTANCE_FROM_SELECTEDAREA_TO_MENUTOP = 34;

  TextSelectionDialogRefactor.prototype.ID_NAME = 'TextSelectionDialogRefactor';

  TextSelectionDialogRefactor.prototype.ELEMENT_PREFIX = 'textselection-dialog-';

  TextSelectionDialogRefactor.prototype.debug = function tsd_debug(msg) {
    // if (DEBUG || this._DEBUG) {
      dump('[Dump: ' + this.ID_NAME + ']' +
        JSON.stringify(msg));
    // }
  };

  TextSelectionDialogRefactor.prototype.handleEvent = function tsd_handleEvent(evt) {
    switch (evt.type) {
      case 'mozbrowsercaretstatechanged':
        evt.preventDefault();
        evt.stopPropagation();
        this._handleCaretStateChanged(evt.detail);
        break;
      case 'mozChromeEvent':
        if (evt.detail.type === 'caretstatechanged') {
          evt.preventDefault();
          evt.stopPropagation();
          this._handleCaretStateChanged(evt.detail.detail);
        }
        break;
    }
  };

  TextSelectionDialogRefactor.prototype._handleCaretStateChanged =
    function tsd__handleCaretStateChanged(detail) {
        dump("Morris gaia got caret state changed " +
             " instance:" + this.instanceID +
             " top:" + detail.rect.top +
             " bottom:" + detail.rect.bottom +
             " left:" + detail.rect.left +
             " right:" + detail.rect.right +
             " collapsed:" + detail.collapsed +
             " selVis:" + detail.selectionVisible +
             " caretVis:" + detail.caretVisible +
             " reason:" + detail.reason +
             "\n");
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

        if (!detail.selectionVisible && !detail.caretVisible) {
          this.hide();
          return;
        }

        if (detail.collapsed) {
          this._onCollapsedMode(detail);
        } else {
          this._onSelectionMode(detail);
        }
    };

  TextSelectionDialogRefactor.prototype._onCollapsedMode =
    function tsd__onCollapsedMode(detail) {
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

  TextSelectionDialogRefactor.prototype._onSelectionMode =
    function tsd__onSelectionMode(detail) {
      this._resetShortcutTimeout();
      this.show(detail);
    };

  TextSelectionDialogRefactor.prototype._resetShortcutTimeout =
    function tsd__resetShortcutTimeout() {
      window.clearTimeout(this._shortcutTimeout);
      this._shortcutTimeout = null;
    };

  TextSelectionDialogRefactor.prototype._triggerShortcutTimeout =
    function tsd__triggerShortcutTimeout() {
      this._resetShortcutTimeout();
      this._shortcutTimeout = window.setTimeout(function() {
        this.close();
      }.bind(this), this.SHORTCUT_TIMEOUT);
    };

  TextSelectionDialogRefactor.prototype._fetchElements = function tsd__fetchElements() {
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

  TextSelectionDialogRefactor.prototype._registerEvents =
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

  TextSelectionDialogRefactor.prototype._elementEventHandler =
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

  TextSelectionDialogRefactor.prototype._changeTransitionState =
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

  TextSelectionDialogRefactor.prototype._doCommand =
    function tsd_doCommand(evt, cmd, closed) {
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

        window.dispatchEvent(
          new CustomEvent('mozContentEvent', props));
      }

      if (closed) {
        this.close();
      }
      evt.preventDefault();
    };

  TextSelectionDialogRefactor.prototype.copyHandler =
    function tsd_copyHandler(evt) {
      this._doCommand(evt, 'copy', true);
      this._resetCutOrCopiedTimer();
      this._hasCutOrCopied = true;
  };

  TextSelectionDialogRefactor.prototype.cutHandler =
    function tsd_cutHandler(evt) {
      this._doCommand(evt, 'cut', true);
      this._resetCutOrCopiedTimer();
      this._hasCutOrCopied = true;
  };

  TextSelectionDialogRefactor.prototype.pasteHandler =
    function tsd_pasteHandler(evt) {
      this._doCommand(evt, 'paste', true);
      this._hasCutOrCopied = false;
      window.clearTimeout(this._resetCutOrCopiedTimeout);
  };

  TextSelectionDialogRefactor.prototype.selectallHandler =
    function tsd_selectallHandler(evt) {
      this._doCommand(evt, 'selectall', false);
  };

  TextSelectionDialogRefactor.prototype.view = function tsd_view() {
    var id = this.CLASS_NAME + this.instanceID;
    var temp = `
              <div class="textselection-dialog-refactor" id="${id}">
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

  TextSelectionDialogRefactor.prototype._resetCutOrCopiedTimer =
    function tsd_resetCutOrCopiedTimer() {
      window.clearTimeout(this._resetCutOrCopiedTimeout);
      this._resetCutOrCopiedTimeout = window.setTimeout(function() {
        this._hasCutOrCopied = false;
      }.bind(this), this.RESET_CUT_OR_PASTE_TIMEOUT);
  };


  TextSelectionDialogRefactor.prototype.show = function tsd_show(detail) {
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

  TextSelectionDialogRefactor.prototype.updateDialogPosition =
    function tsd_updateDialogPosition() {
      var pos = this.calculateDialogPostion();
      this.debug(pos);
      this.element.style.top = pos.top + 'px';
      this.element.style.left = pos.left + 'px';
      this._changeTransitionState('opened');
    };

  TextSelectionDialogRefactor.prototype.calculateDialogPostion =
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

      if (posLeft < 0) {
        posLeft = 0;
      }

      if ((posLeft + numOfSelectOptions * selectOptionWidth) > frameWidth) {
        posLeft = frameWidth - numOfSelectOptions * selectOptionWidth;
      }

      var offset = 0;
      if (this.app) {
        offset = this.app.appChrome.isMaximized() ? this.app.appChrome.height : StatusBar.height;
      }

      return {
        top: posTop + offset,
        left: posLeft
      };
    };

  TextSelectionDialogRefactor.prototype.hide = function tsd_hide() {
    if (!this.element) {
      return;
    }

    this._changeTransitionState('closing');
  };

  TextSelectionDialogRefactor.prototype.close = function tsd_close() {
    if (this._transitionState !== 'opened') {
      return;
    }
    this.hide();
    this.element.blur();
    this.textualmenuDetail = null;
  };

  exports.TextSelectionDialogRefactor = TextSelectionDialogRefactor;
}(window));
