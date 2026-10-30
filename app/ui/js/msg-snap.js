// Blockly's message files write straight into Blockly.Msg. index.html loads the
// Norwegian file, then this script, then the English file, then this script again,
// so we end up with a copy of each language and can switch between them later.
(function () {
  var lang = document.currentScript.dataset.lang;
  window.CQ_BLOCKLY_MSG = window.CQ_BLOCKLY_MSG || {};
  window.CQ_BLOCKLY_MSG[lang] = Object.assign({}, Blockly.Msg);
})();
