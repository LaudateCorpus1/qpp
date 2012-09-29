// Google BSD license http://code.google.com/google_bsd_license.html
// Copyright 2012 Google Inc. johnjbarton@google.com

// The Querypoint UI controller. 
// The controller is live as soon as devtools loads. The UI is created 
// and updated when we get panel.onShown, see QuerypointDevtools.js

/**
 * @param panel {ExtensionPanel} devtools panel
 * @param panel_window {Window} the content window of the extension panel
 */

function QuerypointPanel(panel, panel_window, page, project) {
  this.panel = panel;
  this.panel_window = panel_window;
  this.document = panel_window.document;
  this.page = page;
  this.project = project;

  this._editors = {};
  this.userDirectedEditor = this.document.querySelector('.userDirectedEditor');

  this._initKeys();
  this._initMouse();
  this._initSyncToWebInspector();

  panel_window.onbeforeunload = this._beforeUnload.bind(this);
}

QuerypointPanel.prototype = {
  onShown: function() {
    this._isShowing = true;
    this.keybindings.enter();
    qpPanel.refresh();
  },

  onHidden: function() {
    this.keybindings.exit();
    this._isShowing = false;
  },

  // Apply any changes since the last onShown call
  refresh: function() {
     console.log("QuerypointPanel refresh "+this._isShowing, qpPanel);
  },
  
  _showEditor: function(name) {
    var editor = this._editors[name];
    if (this._currentEditor) {
      if (this._currentEditor == editor) {
        return;
      } else {
        this._currentEditor.hide();
      }
    }

    if (editor) {
      this._currentEditor = editor;
      this._currentEditor.show();
    }

    return editor;
  },
  
  _openEditor: function(name, getContent) {
      var editor = this._editors[name];

      if (!editor) {
        getContent(function (content, encoding) {
          this._editors[name] = new EditorByCodeMirror(this.panel_window, this.userDirectedEditor, name, content);
          this._showEditor(name);    
          var splash = this.userDirectedEditor.querySelector('.splash');
          if (splash) {
            splash.parentElement.removeChild(splash);
          }
          
        }.bind(this));
      } else {
        this._showEditor(name);
      }   
  },

  _openResource: function(resource, item) {
    console.log("onSelectedFile %o ", item);
    this._openEditor(resource.url, resource.getContent);
    return false; 
  },
  
  _openSourceFile: function(sourceFile, item) {
    this._openEditor(sourceFile.name, function(contentHandler) {
      contentHandler(sourceFile.contents);
    });
  },

  // These methods are bound to |this| panel
  commands: {  // KeyBindings must be kept in sync

    // Open a dialog filled with file names for user selection
    //
    selectFile: function() {
      console.log("selectFile");
      var uriItems = new URISelector(this.panel);
      this.project.getSourceFiles().forEach(function(sourceFile){
        uriItems.appendItem(sourceFile.name, this._openSourceFile.bind(this, sourceFile));
      }.bind(this));
      this.page.resources.forEach(function(resource, index) {
        uriItems.appendItem(resource.url, this._openResource.bind(this, resource));
      }.bind(this));
      uriItems.selectItem();
      return false;
    },

    saveFile: function() {
      // hack for now, 
      // Our sourceFile-s don't have Resources so we can't use Resource.setContent
      if (!this._currentEditor) {
        alert("Can't save, there is no current editor"); // alerts are bad.
      }
      var request = { 
        url: this._currentEditor.getName(), 
        content: this._currentEditor.getContent() 
      };
      // send directly to devtools-save
      chrome.extension.sendMessage('jmacddndcaceecmiinjnmkfmccipdphp', request, function maybeSaved(response){
        console.log("saveFile response ", response);
      });
      return false;
    }
  },

  _initKeys: function() {
    this.keybindings = new KeyBindings(this.panel_window);

    // rebind this.commands to create a subset of methods callable via user keys
    Object.keys(this.commands).forEach(function(key){
      this.commands[key] = this.commands[key].bind(this);
    }.bind(this));
    this.keybindings.apply(this.commands);
  },

  _openContextMenu: function(event) {
    console.log("_openContextMenu", event);
  },

  _takeContextMenu: function(event) {
    if (event.buttons === 2) {
      this._openContextMenu(event);
    }
  },

  _initMouse: function() {
    this.document.addEventListener('mousedown', this._takeContextMenu.bind(this));
  },
  
  _onResourceUpdate: function(resource, content) {
    var editor = this._editors[resource.url];
    if (editor) {
      if (editor.hasChanges()) {
        this._showEditor(resource.url);
        alert("This editor has changes and the file has changes");
      } else {
        editor.resetContent(content);
      }
    }
  },
  
  _initSyncToWebInspector: function() {
    chrome.devtools.inspectedWindow.onResourceContentCommitted.addListener(this._onResourceUpdate.bind(this));
  },

  _beforeUnload: function(event) {
    var remember = {
      openEditors: []
    };
    var editorWithChanges = [];
    Object.keys(this._editors).forEach(function(name){
      remember.openEditors.push(name);
      if (this._editors[name].hasChanges()) {
        editorWithChanges.push(name);
      }
    }.bind(this));
    var sure = '';
    if (editorWithChanges.length) {
      sure = "You have unsaved changes in " + editorWithChanges.length + " files: " + editorWithChanges.join(',');
      this._showEditor(editorWithChanges.pop());
    } else {
      localStorage.setItem('Querypoint.setup', JSON.stringify(remember));
    }
    event.returnValue = sure;
    return sure;  
  }

};