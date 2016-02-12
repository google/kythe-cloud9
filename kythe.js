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

/* global btoa */
/* global atob */

/**
 * Kythe language features.
 */
define(function(require, exports, module) {

  var baseLanguageHandler = require('plugins/c9.ide.language/base_handler');
  var handler = module.exports = Object.create(baseLanguageHandler);

  var KYTHE_SERVER = 'http://localhost:8081/';

  handler.handlesLanguage = function(language) {
    return language === "java";
  };

  handler.highlightOccurrences = function(doc, fullAst, cursorPos, currentNode, callback) {
    var filepath = this.path;
    kytheRequest('search', {
      'partial': {
        'path': filepath
      },
      'fact': [{
        'name': '/kythe/node/kind',
        'value': btoa('file')
      }],
      'partial_prefix': {}
    }, function(response) {
      if (!response || !response.ticket) {
        callback();
        return;
      }
      var fileTicket = response.ticket[0];
      kytheRequest('decorations', {
        "location": {
          "ticket": fileTicket
        },
        "dirty_buffer": btoa(doc.getValue()),
        "references": true,
      }, function(decorations) {
        var targetRefs = {};
        decorations.reference.forEach(function(r, i) {
          if (r.kind !== '/kythe/edge/documents' && r.kind !== '/kythe/edge/defines' &&
            (r.anchor_start.line_number === cursorPos.row + 1 ||
              r.anchor_end.line_number === cursorPos.row + 1)) {
            r.anchor_start.column_offset = getOffsetValueOrDefault(r.anchor_start.column_offset);
            r.anchor_end.column_offset = getOffsetValueOrDefault(r.anchor_end.column_offset);
            if (cursorPos.column < r.anchor_end.column_offset &&
              cursorPos.column >= r.anchor_start.column_offset) {
              if (!targetRefs[r.target_ticket]) {
                targetRefs[r.target_ticket] = [];
              }
              targetRefs[r.target_ticket].push(r);
            }
          }
        });
        var markers = [];
        decorations.reference.forEach(function(r, i) {
          if (targetRefs[r.target_ticket]) {
            markers.push({
              pos: {
                sl: r.anchor_start.line_number - 1,
                el: r.anchor_end.line_number - 1,
                sc: r.anchor_start.column_offset,
                ec: r.anchor_end.column_offset
              }
            });
          }
        });
        callback({
          'markers': markers
        });
      }, callback);
    }, callback);
  };

  handler.jumpToDefinition = function(doc, fullAst, pos, currentNode, callback) {
    var filepath = this.path;
    kytheRequest('search', {
      'partial': {
        'path': filepath
      },
      'fact': [{
        'name': '/kythe/node/kind',
        'value': btoa('file')
      }],
      'partial_prefix': {}
    }, function(response) {
      if (!response || !response.ticket) {
        callback();
        return;
      }
      var fileTicket = response.ticket[0];
      kytheRequest('decorations', {
        "location": {
          "ticket": fileTicket
        },
        "dirty_buffer": btoa(doc.getValue()),
        "references": true,
      }, function(decorations) {
        decorations.reference.forEach(function(r, i) {
          if (r.kind !== '/kythe/edge/documents' && r.kind !== '/kythe/edge/defines' &&
            r.anchor_start.line_number === pos.row + 1) {
            r.anchor_start.column_offset = getOffsetValueOrDefault(r.anchor_start.column_offset);
            r.anchor_end.column_offset = getOffsetValueOrDefault(r.anchor_end.column_offset);
            if (pos.column < r.anchor_end.column_offset &&
              pos.column >= r.anchor_start.column_offset) {
              kytheRequest('xrefs', {
                'ticket': [r.target_ticket],
                'definition_kind': 3,
                'reference_kind': 1,
                'documentation_kind': 1,
                'anchor_text': true
              }, function(xref) {
                if (!xref || !xref.cross_references[r.target_ticket]) {
                  callback();
                }
                else {
                  if (xref.cross_references[r.target_ticket].definition) {
                    var def = xref.cross_references[r.target_ticket].definition[0];
                    var targetFilePath = stripHash(getQueryVariable(def.parent, 'path'));
                    getSource(def.parent, function(source) {
                      var jumpLoc = byteOffsetToLineColumn(makeLineMap(source), def.start.byte_offset);
                      var results = [];
                      results.push({
                        path: targetFilePath,
                        row: jumpLoc.line - 1,
                        column: jumpLoc.column - 1
                      });
                      callback(results);
                    }, callback);
                  }
                }
              }, callback);
            }
          }
        });
      }, callback);
    }, callback);
  };

  handler.tooltip = function(doc, fullAst, cursorPos, currentNode, callback) {
    var filepath = this.path;
    kytheRequest('search', {
      'partial': {
        'path': filepath
      },
      'fact': [{
        'name': '/kythe/node/kind',
        'value': btoa('file')
      }],
      'partial_prefix': {}
    }, function(response) {
      if (!response || !response.ticket) {
        callback();
        return;
      }
      var fileTicket = response.ticket[0];
      kytheRequest('decorations', {
        "location": {
          "ticket": fileTicket
        },
        "dirty_buffer": btoa(doc.getValue()),
        "references": true,
      }, function(decorations) {
        var targetRefs = [];
        decorations.reference.forEach(function(r, i) {
          if (r.kind !== '/kythe/edge/documents' && r.kind !== '/kythe/edge/defines' &&
            (r.anchor_start.line_number === cursorPos.row + 1 ||
              r.anchor_end.line_number === cursorPos.row + 1)) {
            r.anchor_start.column_offset = getOffsetValueOrDefault(r.anchor_start.column_offset);
            r.anchor_end.column_offset = getOffsetValueOrDefault(r.anchor_end.column_offset);
            if (cursorPos.column < r.anchor_end.column_offset &&
              cursorPos.column >= r.anchor_start.column_offset) {
              targetRefs.push(r);
            }
          }
        });
        var minSpan = 10000000;
        var minTicket = "";
        var minRef;
        targetRefs.forEach(function(r) {
          if (r.anchor_end.column_offset - r.anchor_start.column_offset < minSpan) {
            minSpan = r.anchor_end.column_offset - r.anchor_start.column_offset;
            minTicket = r.target_ticket;
            minRef = r;
          }
        });
        if (minTicket) {
          kytheRequest('xrefs', {
            'ticket': [minTicket],
            'definition_kind': 3,
            'reference_kind': 1,
            'documentation_kind': 1,
            'anchor_text': true
          }, function(xref) {
            if (!xref || !xref.cross_references[minTicket]) {
              callback();
            }
            else {
              var html = '';
              var hasDefOrDoc = false;
              if (xref.cross_references[minTicket].definition) {
                hasDefOrDoc = true;
                var def = xref.cross_references[minTicket].definition[0];
                var filepath = stripHash(getQueryVariable(def.parent, 'path'));
                html += '<span style="font-weight: bold;">Defined in: </span><span>' +
                  filepath + '</span> : <div>' +
                  def.snippet.trim() + '</div>'; // TODO: encode html
              }
              if (xref.cross_references[minTicket].documentation) {
                hasDefOrDoc = true;
                var lang = getQueryVariable(xref.cross_references[minTicket].documentation[0].parent, 'lang');
                var outDoc = '';
                if (lang === 'java') {
                  var docText = xref.cross_references[minTicket].documentation[0].text.trim();
                  docText = docText.replace(/\/\*\*/m, "").replace(/\*\/$/, "").replace(/^\s*\*/mg, '').trim();
                  // javadoc tag pass
                  for (var i = 0; i < docText.length;) {
                    if (docText.substring(i, i + 6) === '{@code' || docText.substring(i, i + 6) === '{@link') {
                      i += 6;
                      var matchedBracket = i + matchingBracket(docText.substring(i));
                      if (matchedBracket == -1) {
                        matchedBracket = docText.length;
                      }
                      outDoc += '<code class="prettyprint">' + docText.substring(i, matchedBracket) + '</code>'; // TODO: encode html
                      i = matchedBracket + 1;
                    }
                    else if (/^\s*@see\s+/i.test(docText.substring(i))) {
                      var matches = docText.substring(i).match(/^\s*@see\s+/i);
                      i += matches[0].length;
                      outDoc += '<p><b>See: </b>';
                    }
                    else if (/^\s*@param\s+<\s*([$A-Z_][0-9A-Z_$]*)\s*>/i.test(docText.substring(i))) {
                      matches = docText.substring(i).match(/^\s*@param\s+<\s*([$A-Z_][0-9A-Z_$]*)\s*>\s*/i);
                      i += matches[0].length;
                      outDoc += '<p><b>Parameter: </b><code class="identifier">' + matches[1] + '</code> ';
                    }
                    else if (/^\s*@param\s+([$A-Z_][0-9A-Z_$]*)\s+/i.test(docText.substring(i))) {
                      matches = docText.substring(i).match(/^\s*@param\s+([$A-Z_][0-9A-Z_$]*)\s+/i);
                      i += matches[0].length;
                      outDoc += '<p><b>Parameter: </b><code class="identifier">' + matches[1] + '</code> ';
                    }
                    else if (/^\s*@throws\s+([$A-Z_][0-9A-Z_$]*)\s+/i.test(docText.substring(i))) {
                      matches = docText.substring(i).match(/^\s*@throws\s+([$A-Z_][0-9A-Z_$]*)\s+/i);
                      i += matches[0].length;
                      outDoc += '<p><b>Exception: </b><code class="identifier">' + matches[1] + '</code> ';
                    }
                    else if (/^\s*@author\s+/i.test(docText.substring(i))) {
                      matches = docText.substring(i).match(/^\s*@author\s+/i);
                      i += matches[0].length;
                      outDoc += '<p><b>Author: </b>';
                    }
                    else if (/^\s*@version\s+/i.test(docText.substring(i))) {
                      matches = docText.substring(i).match(/^\s*@version\s+/i);
                      i += matches[0].length;
                      outDoc += '<p><b>Version: </b>';
                    }
                    else if (/^\s*@since\s+/i.test(docText.substring(i))) {
                      matches = docText.substring(i).match(/^\s*@since\s+/i);
                      i += matches[0].length;
                      outDoc += '<p><b>Since: </b>';
                    }
                    else if (/^\s*@return\s+/i.test(docText.substring(i))) {
                      matches = docText.substring(i).match(/^\s*@return\s+/i);
                      i += matches[0].length;
                      outDoc += '<p><b>Returns: </b>';
                    }
                    else if (/^\s*@deprecated\s+/i.test(docText.substring(i))) {
                      matches = docText.substring(i).match(/^\s*@deprecated\s+/i);
                      i += matches[0].length;
                      outDoc += '<p><b>Deprecated: </b>';
                    }
                    else {
                      outDoc += docText[i];
                      i++;
                    }
                  }
                }
                else if (lang === 'c++') {
                  outDoc = '<pre>' + xref.cross_references[minTicket].documentation[0].text.replace(/\n\s*/g, '\n') + '</pre>';
                }
                html += '<div class="dialog-content"><span style="font-weight: bold;">Documentation: </span><div class="documentation">' +
                  outDoc + '</div></div>';
              }

              if (hasDefOrDoc) {
                console.log(html);
                callback({
                  'hint': html,
                  'pos': {
                    sl: minRef.anchor_start.line_number,
                    el: minRef.anchor_end.line_number,
                    sc: minRef.anchor_start.column_offset,
                    ec: minRef.anchor_end.column_offset
                  },
                  displayPos: {
                    row: minRef.anchor_start.line_number - 1,
                    column: minRef.anchor_start.column_offset
                  }
                });
              }
              else {
                callback();
                console.log('No definition or documentation was found for this element.');
              }
            }
          }, callback);
        }
      }, callback);
    }, callback);
  };

  function makeLineMap(source) {
    var map = [];
    for (var i = 0; i < source.length; i++) {
      if (source.charAt(i) === '\n') {
        map.push(i);
      }
    }
    return map;
  }

  function matchingBracket(str) {
    var open = 1;
    for (var i = 0; i < str.length; i++) {
      if (str[i] === '{') {
        open++;
      }
      if (str[i] === '}') {
        open--;
      }
      if (open === 0) {
        return i;
      }
    }
    return -1;
  }

  function byteOffsetToLineColumn(map, offset) {
    for (var i = 0; i < map.length; i++) {
      if (offset < map[i]) {
        return {
          line: i + 1,
          column: offset - map[i - 1]
        };
      }
    }
    return {
      line: map.length,
      column: 0
    };
  }


  function getSource(fileticket, callback, errorCallback) {
    kytheRequest('decorations', {
      "location": {
        "ticket": fileticket
      },
      "source_text": true,
      "references": false,
    }, function(decorations) {
      callback(atob(decorations.source_text));
    }, errorCallback);
  }


  function getOffsetValueOrDefault(o) {
    return o ? o : 0;
  }

  function getQueryVariable(query, variable) {
    var vars = query.split('?');
    for (var i = 0; i < vars.length; i++) {
      var pair = vars[i].split('=');
      if (decodeURIComponent(pair[0]) == variable) {
        return decodeURIComponent(pair[1]);
      }
    }
    return '';
  }

  function stripHash(path) {
    var i = path.lastIndexOf('#');
    return i >= 0 ? path.substring(0, i) : path;
  }


  function kytheRequest(service, request, callback, errorCallback) {
    var httpRequest = new XMLHttpRequest();
    if (!httpRequest) {
      alert('Giving up :( Cannot create an XMLHTTP instance');
      return false;
    }
    httpRequest.onreadystatechange = function() {
      if (httpRequest.readyState === XMLHttpRequest.DONE) {
        if (httpRequest.status === 200) {
          callback(JSON.parse(httpRequest.responseText));
        }
        else {
          console.log('There was a problem with the kythe request.');
          errorCallback();
        }
      }
    };
    httpRequest.open('POST', KYTHE_SERVER + service, true);
    httpRequest.send(JSON.stringify(request));
  }

});
