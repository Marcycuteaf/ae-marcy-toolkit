/* MARCY — 面板主程式 (CEP / CEF JavaScript) */
(function () {
  'use strict';

  var cs = (typeof CSInterface !== 'undefined') ? new CSInterface() : null;
  var $ = function (id) { return document.getElementById(id); };
  var statusEl = $('status');

  function setStatus(msg, type) {
    statusEl.textContent = msg;
    statusEl.className = type || '';
  }

  // 將 JS 值轉成可安全嵌入 ExtendScript 呼叫的字面值
  function q(v) {
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    return "'" + String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  }

  function call(fnName, args, label) {
    if (!cs) { setStatus('未偵測到 After Effects 環境', 'err'); return; }
    var script = fnName + '(' + (args || []).map(q).join(',') + ')';
    cs.evalScript(script, function (ret) {
      ret = String(ret == null ? '' : ret);
      if (ret.indexOf('OK') === 0) {
        setStatus((label || '完成') + ' ✓', 'ok');
      } else if (ret.indexOf('ERR') === 0) {
        setStatus(ret.replace(/^ERR:?/, '') || '發生錯誤', 'err');
      } else if (ret === 'EvalScript error.') {
        setStatus('ExtendScript 執行錯誤', 'err');
      } else {
        setStatus(ret || (label || '完成'), '');
      }
    });
  }

  // 目前 UI 設定
  function colorIdx() { return parseInt($('colorIdx').value, 10) || 0; }
  function qty() { return parseInt($('qty').value, 10) || 1; }
  function alignToComp() { return $('alignTo').value === 'comp'; }
  function sep() { return $('sep').checked; }
  function singleMode() { return $('singleMode').checked; }

  // 將按鈕動作對應到 host 函式
  function dispatch(btn) {
    var fn = btn.getAttribute('data-fn');
    var a = btn.getAttribute('data-a');
    var label = btn.textContent.trim();
    switch (fn) {
      case 'text':
        call('mcyCreateText',
          [btn.getAttribute('data-a'), btn.getAttribute('data-b'),
           parseInt(btn.getAttribute('data-c'), 10)], '建立文字');
        break;
      case 'fx': call('mcyAddFx', [a], a); break;
      case 'align': call('mcyAlign', [a, alignToComp()], '對齊'); break;
      case 'dist': call('mcyDistribute', [a], '分佈'); break;
      case 'anchor': call('mcySetAnchor', [a], '錨點'); break;
      case 'para': call('mcySetParagraph', [a], '段落'); break;
      case 'precomp': call('mcyPrecompose', [sep()], '預合成'); break;
      case 'null': call('mcyAddNull', [qty(), colorIdx(), singleMode()], 'Null'); break;
      case 'adj': call('mcyAddAdj', [qty(), colorIdx(), singleMode()], '調整圖層'); break;
      case 'sepxy': call('mcyToggleSepXY', [], 'Sep XY'); break;
      case 'solid': call('mcyAddSolid', [qty(), colorIdx(), singleMode()], 'Solid'); break;
      case 'camera': call('mcyAddCamera', [qty()], '攝影機'); break;
      case 'light': call('mcyAddLight', [qty()], '燈光'); break;
      case 'crop': call('mcyAutoCrop', [], 'Auto Crop'); break;
      case 'inpoint': call('mcySetInPoint', [], '設定進點'); break;
      case 'outpoint': call('mcySetOutPoint', [], '設定出點'); break;
      default: break;
    }
  }

  var btns = document.querySelectorAll('.btn');
  for (var i = 0; i < btns.length; i++) {
    btns[i].addEventListener('click', function () { dispatch(this); });
  }

  setStatus('準備就緒', '');
})();
