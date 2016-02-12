// Copyright 2016 Google Inc. All Rights Reserved.

// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at

//     http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

define(function(require, exports, module) {
  main.consumes = [
    "Plugin", "language"
  ];
  main.provides = ["google.kythe.main"];
  return main;

  function main(options, imports, register) {
    /*
     * Imports
     */
    var Plugin = imports["Plugin"];
    var language = imports["language"];

    language.registerLanguageHandler('plugins/google.kythe/kythe');

    /*
     * Local variables
     */
    var loaded;

    /*
     * Plugin declaration
     */
    var plugin = new Plugin("Google, Inc.", main.consumes);

    function load() {
      if (loaded) return;
      loaded = true;

      // Initialize
    }

    function unload() {
      loaded = false;
    }

    plugin.on("load", load);
    plugin.on("unload", unload);

    plugin.freezePublicAPI({});

    register(null, {
      "google.kythe.main": plugin,
    });
  }
});
