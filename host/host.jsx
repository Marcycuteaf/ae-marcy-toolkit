/**
 * MARCY — After Effects toolkit (CEP host / ExtendScript)
 * 由 ScriptUI 面板 marcy.jsx 移植。所有 UI 狀態改由前端以參數傳入。
 * 每個對外函式回傳 "OK" 或 "ERR:訊息" 字串給前端顯示。
 */

// =====================================================================
//  基礎工具
// =====================================================================
function mcyGetComp() {
  return app.project.activeItem;
}

function getCleanBaseName(n) {
  while (n.match(/^(Null for |Adj for |Solid_for_|Camera for |Light for )/))
    n = n.replace(
      /^(Null for |Adj for |Solid_for_|Camera for |Light for )/g,
      ""
    );
  return n.replace(/(\s\d+)+$/g, "").replace(/^\s+|\s+$/g, "");
}

function getUniqueName(c, p) {
  if (c.layer(p) == null) return p;
  var i = 2;
  while (c.layer(p + " " + i) != null) i++;
  return p + " " + i;
}

// colorIndex: 0 = None(用預設 label d)，其餘為色票編號
function getTargetLabel(colorIndex, d) {
  return colorIndex === 0 ? d : colorIndex;
}

function getSelectedTargets(comp) {
  var sel = comp.selectedLayers;
  var targets = [];
  if (!sel) return targets;
  for (var i = 0; i < sel.length; i++) targets.push(sel[i]);
  targets.sort(function (a, b) {
    return a.index - b.index;
  });
  return targets;
}

function addLockedEaseKeys(l, mn) {
  function apply(p) {
    if (!p || p.numKeys > 0) return;
    var k1 = p.addKey(l.inPoint),
      k2 = p.addKey(l.outPoint);
    p.setValueAtKey(k1, p.value);
    p.setValueAtKey(k2, p.value);
    var e = new KeyframeEase(0, 33.33);
    var a = p.propertyValueType === PropertyValueType.ThreeD ? [e, e, e] : [e];
    try {
      p.setTemporalEaseAtKey(k1, a, a);
      p.setTemporalEaseAtKey(k2, a, a);
    } catch (z) {}
  }
  if (mn === "Position") {
    var pos = l.transform.position;
    if (pos.dimensionsSeparated) {
      apply(l.transform.xPosition);
      apply(l.transform.yPosition);
      if (l.threeDLayer) apply(l.transform.zPosition);
      return;
    }
  }
  var prop = l.property(mn);
  if (!prop) prop = l.property("ADBE Transform Group").property(mn);
  if (prop) apply(prop);
}

// =====================================================================
//  文字 / 效果
// =====================================================================
function mcyCreateText(font, text, size) {
  try {
    var c = mcyGetComp();
    if (!c || !(c instanceof CompItem)) return "ERR:請先開啟合成";
    app.beginUndoGroup("MARCY Text");
    var l = c.layers.addText(text);
    var p = l.property("Source Text").value;
    p.font = font;
    p.fontSize = size;
    p.applyFill = true;
    p.fillColor = [1, 1, 1];
    p.justification = ParagraphJustification.CENTER_JUSTIFY;
    l.property("Source Text").setValue(p);
    var r = l.sourceRectAtTime(c.time, false);
    l.property("Anchor Point").setValue([
      r.left + r.width / 2,
      r.top + r.height / 2,
    ]);
    l.property("Position").setValue([c.width / 2, c.height / 2]);
    l.property("Effects")
      .addProperty("ADBE Fill")
      .property("Color")
      .setValue([1, 1, 1]);
    l.selected = true;
    app.endUndoGroup();
    return "OK";
  } catch (e) {
    return "ERR:" + e.toString();
  }
}

function mcyAddFx(n) {
  try {
    var c = mcyGetComp();
    if (!c || !(c instanceof CompItem)) return "ERR:請先開啟合成";
    if (c.selectedLayers.length === 0) return "ERR:請先選取圖層";
    app.beginUndoGroup("MARCY Fx " + n);
    for (var i = 0; i < c.selectedLayers.length; i++) {
      var l = c.selectedLayers[i];
      var fx = l.property("Effects");
      if (n === "Clean") {
        for (var j = fx.numProperties; j >= 1; j--)
          if (fx.property(j).matchName.match(/Fill|Ramp|TextBox/))
            fx.property(j).remove();
        continue;
      }
      for (var j = fx.numProperties; j >= 1; j--)
        if (fx.property(j).matchName.match(/Fill|Ramp/)) fx.property(j).remove();
      if (n === "Fill")
        fx.addProperty("ADBE Fill").property("Color").setValue([1, 1, 1]);
      if (n === "Gradient") fx.addProperty("ADBE Ramp");
      if (n === "Box") {
        for (var j = fx.numProperties; j >= 1; j--)
          if (fx.property(j).name === "TextBox 2") fx.property(j).remove();
        try {
          var b = fx.addProperty("TextBox 2");
          if (b.property("Color")) b.property("Color").setValue([0, 0, 0]);
        } catch (e) {}
      }
    }
    app.endUndoGroup();
    return "OK";
  } catch (e) {
    return "ERR:" + e.toString();
  }
}

// =====================================================================
//  段落對齊 (justification: "left" | "center" | "right")
// =====================================================================
function mcySetParagraph(which) {
  try {
    var comp = mcyGetComp();
    if (!comp || comp.selectedLayers.length === 0) return "ERR:請先選取文字圖層";
    var just =
      which === "left"
        ? ParagraphJustification.LEFT_JUSTIFY
        : which === "right"
        ? ParagraphJustification.RIGHT_JUSTIFY
        : ParagraphJustification.CENTER_JUSTIFY;
    app.beginUndoGroup("MARCY Paragraph");
    for (var i = 0; i < comp.selectedLayers.length; i++) {
      var layer = comp.selectedLayers[i];
      if (layer instanceof TextLayer) {
        var textProp = layer.property("Source Text");
        var textDoc = textProp.value;
        textDoc.justification = just;
        textProp.setValue(textDoc);
      }
    }
    app.endUndoGroup();
    return "OK";
  } catch (e) {
    return "ERR:" + e.toString();
  }
}

// =====================================================================
//  錨點
// =====================================================================
function moveAnchorVisualLock(layer, targetAnchor) {
  var comp = layer.containingComp;
  var time = comp ? comp.time : 0;
  var t = layer.transform;
  var curAnchor = t.anchorPoint.value;
  var curPos = t.position.value;

  // 3D / 有父層 / 有 Orientation 時，用 toComp 補償位置最可靠
  if (layer.threeDLayer || layer.parent) {
    var compRef = layer.toComp(curAnchor, time);
    t.anchorPoint.setValue(targetAnchor);
    var compAfter = layer.toComp(curAnchor, time);
    var dx = compRef[0] - compAfter[0];
    var dy = compRef[1] - compAfter[1];
    var dz =
      compRef.length > 2 && compAfter.length > 2
        ? compRef[2] - compAfter[2]
        : 0;
    if (t.position.dimensionsSeparated) {
      t.property(0).setValue(curPos[0] + dx);
      t.property(1).setValue(curPos[1] + dy);
      if (curPos.length > 2 && t.property(2))
        t.property(2).setValue(curPos[2] + dz);
    } else if (curPos.length === 2) {
      t.position.setValue([curPos[0] + dx, curPos[1] + dy]);
    } else {
      t.position.setValue([curPos[0] + dx, curPos[1] + dy, curPos[2] + dz]);
    }
    return;
  }

  // 2D：沿用輕量算法
  var delta = [
    targetAnchor[0] - curAnchor[0],
    targetAnchor[1] - curAnchor[1],
  ];
  var s = t.scale.value;
  var sx = s[0] / 100;
  var sy = s[1] / 100;
  var dx = delta[0] * sx;
  var dy = delta[1] * sy;
  var ang = t.rotation.value;
  var rad = ang * (Math.PI / 180);
  var cos = Math.cos(rad);
  var sin = Math.sin(rad);
  var moveX = dx * cos - dy * sin;
  var moveY = dx * sin + dy * cos;
  var p = t.position;
  if (p.dimensionsSeparated) {
    p.property(0).setValue(curPos[0] + moveX);
    p.property(1).setValue(curPos[1] + moveY);
  } else if (curPos.length === 2) {
    p.setValue([curPos[0] + moveX, curPos[1] + moveY]);
  } else {
    p.setValue([curPos[0] + moveX, curPos[1] + moveY, curPos[2]]);
  }
  t.anchorPoint.setValue(targetAnchor);
}

function mcySetAnchor(pos) {
  try {
    var comp = mcyGetComp();
    if (!comp || comp.selectedLayers.length === 0) return "ERR:請先選取圖層";
    app.beginUndoGroup("MARCY Anchor");
    for (var i = 0; i < comp.selectedLayers.length; i++) {
      var layer = comp.selectedLayers[i];
      if (
        !(layer instanceof AVLayer) &&
        !(layer instanceof ShapeLayer) &&
        !(layer instanceof TextLayer)
      )
        continue;
      var r = layer.sourceRectAtTime(comp.time, false);
      var newX = 0,
        newY = 0;
      if (pos.indexOf("L") !== -1) newX = r.left;
      else if (pos.indexOf("R") !== -1) newX = r.left + r.width;
      else newX = r.left + r.width / 2;
      if (pos.indexOf("T") !== -1) newY = r.top;
      else if (pos.indexOf("B") !== -1) newY = r.top + r.height;
      else newY = r.top + r.height / 2;
      var newAnchor = [newX, newY];
      if (layer.transform.anchorPoint.value.length > 2)
        newAnchor.push(layer.transform.anchorPoint.value[2]);
      moveAnchorVisualLock(layer, newAnchor);
    }
    app.endUndoGroup();
    return "OK";
  } catch (e) {
    return "ERR:" + e.toString();
  }
}

// =====================================================================
//  對齊 / 分佈
// =====================================================================
function getLayerEdge(layer, type) {
  if (
    !(layer instanceof AVLayer) &&
    !(layer instanceof ShapeLayer) &&
    !(layer instanceof TextLayer)
  ) {
    var p = layer.transform.position.value;
    if (type.match(/left|right|hCenter/)) return p[0];
    else return p[1];
  }
  var r = layer.sourceRectAtTime(layer.containingComp.time, false);
  var s = layer.transform.scale.value;
  var sx = s[0] / 100;
  var sy = s[1] / 100;
  var p = layer.transform.position.value;
  var a = layer.transform.anchorPoint.value;
  var left = p[0] - a[0] * sx + r.left * sx;
  var top = p[1] - a[1] * sy + r.top * sy;
  var right = left + r.width * sx;
  var bottom = top + r.height * sy;
  var hCenter = left + (r.width * sx) / 2;
  var vCenter = top + (r.height * sy) / 2;
  switch (type) {
    case "left":
      return left;
    case "right":
      return right;
    case "top":
      return top;
    case "bottom":
      return bottom;
    case "hCenter":
      return hCenter;
    case "vCenter":
      return vCenter;
    default:
      return 0;
  }
}

function shiftLayer(layer, dx, dy) {
  var p = layer.transform.position;
  if (p.dimensionsSeparated) {
    if (dx !== 0) {
      var px = p.property(0);
      if (px.numKeys > 0)
        for (var k = 1; k <= px.numKeys; k++)
          px.setValueAtKey(k, px.keyValue(k) + dx);
      else px.setValue(px.value + dx);
    }
    if (dy !== 0) {
      var py = p.property(1);
      if (py.numKeys > 0)
        for (var k = 1; k <= py.numKeys; k++)
          py.setValueAtKey(k, py.keyValue(k) + dy);
      else py.setValue(py.value + dy);
    }
  } else {
    if (p.numKeys > 0)
      for (var k = 1; k <= p.numKeys; k++) {
        var v = p.keyValue(k);
        p.setValueAtKey(k, [v[0] + dx, v[1] + dy, v[2]]);
      }
    else {
      var cur = p.value;
      p.setValue([cur[0] + dx, cur[1] + dy, cur[2]]);
    }
  }
}

// useComp: true = 對齊合成；false = 對齊選取範圍
function mcyAlign(mode, useComp) {
  try {
    var comp = mcyGetComp();
    if (!comp || comp.selectedLayers.length === 0) return "ERR:請先選取圖層";
    app.beginUndoGroup("MARCY Align");
    var sel = comp.selectedLayers;
    var target = 0;
    if (!useComp) {
      var values = [];
      for (var i = 0; i < sel.length; i++)
        values.push(getLayerEdge(sel[i], mode));
      if (mode === "left" || mode === "top")
        target = Math.min.apply(null, values);
      else if (mode === "right" || mode === "bottom")
        target = Math.max.apply(null, values);
      else {
        var minE = Infinity,
          maxE = -Infinity;
        for (var i = 0; i < sel.length; i++) {
          var e1, e2;
          if (mode === "hCenter") {
            e1 = getLayerEdge(sel[i], "left");
            e2 = getLayerEdge(sel[i], "right");
          } else {
            e1 = getLayerEdge(sel[i], "top");
            e2 = getLayerEdge(sel[i], "bottom");
          }
          if (e1 < minE) minE = e1;
          if (e2 > maxE) maxE = e2;
        }
        target = (minE + maxE) / 2;
      }
    } else {
      if (mode === "left" || mode === "top") target = 0;
      else if (mode === "right") target = comp.width;
      else if (mode === "bottom") target = comp.height;
      else if (mode === "hCenter") target = comp.width / 2;
      else if (mode === "vCenter") target = comp.height / 2;
    }
    for (var i = 0; i < sel.length; i++) {
      var diff = target - getLayerEdge(sel[i], mode);
      if (mode.match(/left|right|hCenter/)) shiftLayer(sel[i], diff, 0);
      else shiftLayer(sel[i], 0, diff);
    }
    app.endUndoGroup();
    return "OK";
  } catch (e) {
    return "ERR:" + e.toString();
  }
}

function mcyDistribute(axis) {
  try {
    var comp = mcyGetComp();
    if (!comp || comp.selectedLayers.length < 3)
      return "ERR:需選取至少 3 個圖層";
    app.beginUndoGroup("MARCY Distribute");
    var sel = [];
    for (var i = 0; i < comp.selectedLayers.length; i++)
      sel.push(comp.selectedLayers[i]);
    sel.sort(function (a, b) {
      var ea =
        axis === "H" ? getLayerEdge(a, "hCenter") : getLayerEdge(a, "vCenter");
      var eb =
        axis === "H" ? getLayerEdge(b, "hCenter") : getLayerEdge(b, "vCenter");
      return ea - eb;
    });
    var start =
      axis === "H"
        ? getLayerEdge(sel[0], "hCenter")
        : getLayerEdge(sel[0], "vCenter");
    var end =
      axis === "H"
        ? getLayerEdge(sel[sel.length - 1], "hCenter")
        : getLayerEdge(sel[sel.length - 1], "vCenter");
    var step = (end - start) / (sel.length - 1);
    for (var i = 1; i < sel.length - 1; i++) {
      var t = start + step * i;
      var cc =
        axis === "H"
          ? getLayerEdge(sel[i], "hCenter")
          : getLayerEdge(sel[i], "vCenter");
      if (axis === "H") shiftLayer(sel[i], t - cc, 0);
      else shiftLayer(sel[i], 0, t - cc);
    }
    app.endUndoGroup();
    return "OK";
  } catch (e) {
    return "ERR:" + e.toString();
  }
}

// =====================================================================
//  Auto Crop
// =====================================================================
function getCompContentBounds(comp, specificLayers, scanAnimation) {
  var minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  var layersToCheck = specificLayers.length > 0 ? specificLayers : [];
  if (layersToCheck.length === 0)
    for (var i = 1; i <= comp.numLayers; i++)
      layersToCheck.push(comp.layer(i));
  var found = false;
  var duration = comp.duration;
  var step = scanAnimation ? comp.frameDuration * 10 : duration + 1;
  for (var t = 0; t <= duration; t += step) {
    var ct = t > duration ? duration : t;
    for (var i = 0; i < layersToCheck.length; i++) {
      var l = layersToCheck[i];
      if (!l.active && specificLayers.length === 0) continue;
      if (ct < l.inPoint || ct > l.outPoint) continue;
      try {
        var r = l.sourceRectAtTime(ct, false);
        if (r.width === 0) continue;
        var pos = l.property("Position").valueAtTime(ct, false);
        var anc = l.property("Anchor Point").valueAtTime(ct, false);
        var sc = l.property("Scale").valueAtTime(ct, false);
        var sx = sc[0] / 100;
        var sy = sc[1] / 100;
        var left = pos[0] + (r.left - anc[0]) * sx;
        var top = pos[1] + (r.top - anc[1]) * sy;
        var right = left + r.width * sx;
        var bottom = top + r.height * sy;
        if (left < minX) minX = left;
        if (top < minY) minY = top;
        if (right > maxX) maxX = right;
        if (bottom > maxY) maxY = bottom;
        found = true;
      } catch (e) {}
    }
    if (!scanAnimation) break;
  }
  if (!found) return { left: 0, top: 0, width: 0, height: 0 };
  var pad = 2;
  return {
    left: minX - pad,
    top: minY - pad,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
  };
}

function shiftCompLayers(comp, x, y) {
  for (var i = 1; i <= comp.numLayers; i++) {
    var l = comp.layer(i);
    if (l.parent == null && !l.locked && l.transform.position) {
      var p = l.transform.position;
      if (p.dimensionsSeparated) {
        if (p.property(0).numKeys > 0)
          for (var k = 1; k <= p.property(0).numKeys; k++)
            p.property(0).setValueAtKey(k, p.property(0).keyValue(k) + x);
        else p.property(0).setValue(p.property(0).value + x);
        if (p.property(1).numKeys > 0)
          for (var k = 1; k <= p.property(1).numKeys; k++)
            p.property(1).setValueAtKey(k, p.property(1).keyValue(k) + y);
        else p.property(1).setValue(p.property(1).value + y);
      } else {
        if (p.numKeys > 0)
          for (var k = 1; k <= p.numKeys; k++) {
            var v = p.keyValue(k);
            p.setValueAtKey(k, [v[0] + x, v[1] + y, v[2]]);
          }
        else {
          var v = p.value;
          p.setValue([v[0] + x, v[1] + y, v[2]]);
        }
      }
    }
  }
}

function cropExternalPrecomp(layer) {
  var sourceComp = layer.source;
  var bounds = getCompContentBounds(sourceComp, [], true);
  if (bounds.width === 0) return;
  var newW = Math.max(4, Math.ceil(bounds.width));
  var newH = Math.max(4, Math.ceil(bounds.height));

  // 裁切前先記下變換，並算出內容中心在「原始來源座標」的位置
  var tr = layer.transform;
  var pOld = tr.position.value;
  var aOld = tr.anchorPoint.value;
  var s = tr.scale.value;
  var sx = s[0] / 100,
    sy = s[1] / 100;
  var rot = tr.rotation.value * (Math.PI / 180);
  var cos = Math.cos(rot),
    sin = Math.sin(rot);
  var cOldX = bounds.left + bounds.width / 2;
  var cOldY = bounds.top + bounds.height / 2;

  // 縮小來源合成，並把內容移到原點 (內容中心會落在新合成正中央)
  sourceComp.width = newW;
  sourceComp.height = newH;
  shiftCompLayers(sourceComp, -bounds.left, -bounds.top);

  // 內容中心相對舊錨點的世界位移 (含縮放/旋轉)
  var dx = (cOldX - aOld[0]) * sx;
  var dy = (cOldY - aOld[1]) * sy;
  var wx = dx * cos - dy * sin;
  var wy = dx * sin + dy * cos;

  // 錨點置中於裁切後內容；位置補償，使畫面維持在原本世界位置 (不跑掉)
  var anchor = [newW / 2, newH / 2];
  var pos = [pOld[0] + wx, pOld[1] + wy];
  if (aOld.length > 2) {
    anchor.push(aOld[2]);
    pos.push(pOld.length > 2 ? pOld[2] : 0);
  }
  tr.anchorPoint.setValue(anchor);
  if (tr.position.dimensionsSeparated) {
    tr.position.property(0).setValue(pos[0]);
    tr.position.property(1).setValue(pos[1]);
    if (pos.length > 2 && tr.position.property(2))
      tr.position.property(2).setValue(pos[2]);
  } else {
    tr.position.setValue(pos);
  }
}

function cropActiveComp(comp) {
  var targetLayers = [];
  if (comp.selectedLayers.length > 0)
    for (var i = 0; i < comp.selectedLayers.length; i++)
      targetLayers.push(comp.selectedLayers[i]);
  var bounds = getCompContentBounds(comp, targetLayers, true);
  if (bounds.width === 0) return "ERR:偵測不到內容邊界";
  comp.width = Math.max(4, Math.ceil(bounds.width));
  comp.height = Math.max(4, Math.ceil(bounds.height));
  shiftCompLayers(comp, -bounds.left, -bounds.top);
  return "OK";
}

function mcyAutoCrop() {
  try {
    var comp = mcyGetComp();
    if (!comp || !(comp instanceof CompItem)) return "ERR:請先開啟合成";
    app.beginUndoGroup("MARCY Auto Crop");
    var precompsToCrop = [];
    for (var i = 0; i < comp.selectedLayers.length; i++) {
      var l = comp.selectedLayers[i];
      if (l.source instanceof CompItem) precompsToCrop.push(l);
    }
    var res = "OK";
    if (precompsToCrop.length > 0) {
      for (var j = 0; j < precompsToCrop.length; j++)
        cropExternalPrecomp(precompsToCrop[j]);
    } else {
      res = cropActiveComp(comp);
    }
    app.endUndoGroup();
    return res;
  } catch (err) {
    return "ERR:" + err.toString();
  }
}

// =====================================================================
//  圖層工具
// =====================================================================
function mcyPrecompose(sep) {
  try {
    var c = mcyGetComp();
    if (!c || c.selectedLayers.length === 0) return "ERR:請先選取圖層";
    app.beginUndoGroup("MARCY Precomp");
    var sel = [];
    for (var i = 0; i < c.selectedLayers.length; i++)
      sel.push(c.selectedLayers[i]);
    sel.sort(function (a, b) {
      return b.index - a.index;
    });
    if (sep) {
      var cnt = 1;
      for (var i = 0; i < sel.length; i++) {
        var l = sel[i];
        // 先存下需要的值：precompose 後 l 會失效 (Object is invalid)
        var lin = l.inPoint;
        var lout = l.outPoint;
        var lname = l.name;
        var lindex = l.index;
        var dur = lout - lin;
        var nc = c.layers.precompose(
          [lindex],
          getUniqueName(c, cnt + "_marcy_" + lname),
          true
        );
        nc.duration = dur;
        nc.layer(1).startTime -= lin;
        var newLayer = c.selectedLayers[0]; // precompose 後選取的新預合成圖層
        newLayer.startTime = lin;
        newLayer.outPoint = lin + dur;
        cnt++;
      }
    } else {
      var idxs = [];
      var min = 99999,
        max = -99999;
      for (var i = 0; i < sel.length; i++) {
        idxs.push(sel[i].index);
        if (sel[i].inPoint < min) min = sel[i].inPoint;
        if (sel[i].outPoint > max) max = sel[i].outPoint;
      }
      var nc = c.layers.precompose(
        idxs,
        getUniqueName(c, "1_marcy_" + sel[0].name),
        true
      );
      nc.duration = max - min;
      for (var j = 1; j <= nc.numLayers; j++) nc.layer(j).startTime -= min;
      c.selectedLayers[0].startTime = min;
      c.selectedLayers[0].outPoint = max;
    }
    app.endUndoGroup();
    return "OK";
  } catch (e) {
    return "ERR:" + e.toString();
  }
}

// 把選取圖層整體移動，使其「進點」對齊目前時間 (對應 AE 快捷鍵 [ )
function mcySetInPoint() {
  try {
    var c = mcyGetComp();
    if (!c || c.selectedLayers.length === 0) return "ERR:請先選取圖層";
    app.beginUndoGroup("MARCY Set In Point");
    var t = c.time;
    for (var i = 0; i < c.selectedLayers.length; i++) {
      var l = c.selectedLayers[i];
      l.startTime += t - l.inPoint;
    }
    app.endUndoGroup();
    return "OK";
  } catch (e) {
    return "ERR:" + e.toString();
  }
}

// 把選取圖層整體移動，使其「出點」對齊目前時間 (對應 AE 快捷鍵 ] )
function mcySetOutPoint() {
  try {
    var c = mcyGetComp();
    if (!c || c.selectedLayers.length === 0) return "ERR:請先選取圖層";
    app.beginUndoGroup("MARCY Set Out Point");
    var t = c.time;
    for (var i = 0; i < c.selectedLayers.length; i++) {
      var l = c.selectedLayers[i];
      l.startTime += t - l.outPoint;
    }
    app.endUndoGroup();
    return "OK";
  } catch (e) {
    return "ERR:" + e.toString();
  }
}

function mcyToggleSepXY() {
  try {
    var c = mcyGetComp();
    if (!c || c.selectedLayers.length === 0) return "ERR:請先選取圖層";
    app.beginUndoGroup("MARCY Sep XY");
    for (var i = 0; i < c.selectedLayers.length; i++) {
      var p = c.selectedLayers[i].transform.position;
      if (p.dimensionsSeparated !== undefined)
        p.dimensionsSeparated = !p.dimensionsSeparated;
    }
    app.endUndoGroup();
    return "OK";
  } catch (e) {
    return "ERR:" + e.toString();
  }
}

// 是否為有實際畫面內容的圖層 (有 sourceRect 可算中心)
function mcyIsContent(l) {
  return (
    l instanceof AVLayer ||
    l instanceof ShapeLayer ||
    l instanceof TextLayer
  );
}

// 攝影機 / 燈光 / 已開 3D 的圖層 → Null 也應為 3D
function mcyIs3DLike(l) {
  if (l instanceof CameraLayer || l instanceof LightLayer) return true;
  try {
    if (l.threeDLayer) return true;
  } catch (e) {}
  return false;
}

function mcyIsCamLight(l) {
  return l instanceof CameraLayer || l instanceof LightLayer;
}

// 把世界座標換算成「parent 為某個無旋轉/100% Null」之下的本地座標
// childWorld = nullPos + (childLocal - nullAnchor)  →  childLocal = world - nullPos + nullAnchor
function mcyWorldToParentLocal(w, np, na) {
  return [
    w[0] - np[0] + na[0],
    w[1] - np[1] + na[1],
    (w.length > 2 ? w[2] : 0) -
      (np.length > 2 ? np[2] : 0) +
      (na.length > 2 ? na[2] : 0),
  ];
}

// 攝影機/燈光 parent 到 Null 後，AE 不會正確保留 Position / Point of Interest，
// 會造成畫面跑位。這裡在 parent 前記下世界座標，parent 後換算回本地值維持不動。
function mcyParentKeepTransform(child, nullLayer) {
  if (!mcyIsCamLight(child)) {
    child.parent = nullLayer;
    return;
  }
  var wPos = child.transform.position.value;
  var poiProp = child.property("Point of Interest");
  var wPOI = poiProp ? poiProp.value : null;
  child.parent = nullLayer;
  var np = nullLayer.transform.position.value;
  var na = nullLayer.transform.anchorPoint.value;
  child.transform.position.setValue(mcyWorldToParentLocal(wPos, np, na));
  if (wPOI && poiProp)
    poiProp.setValue(mcyWorldToParentLocal(wPOI, np, na));
}

// 取得圖層在合成空間的中心。內容圖層用 sourceRect 中心；
// 攝影機/燈光等沒有畫面內容者，改用合成中心 (否則會算到錯誤位置、Null 跑到左上角)。
function mcyLayerCenter(c, layer) {
  if (mcyIsContent(layer))
    return [getLayerEdge(layer, "hCenter"), getLayerEdge(layer, "vCenter")];
  return [c.width / 2, c.height / 2];
}

// 建立一個 Null 並放到指定中心點 (尚未指定父子關係，因此放在這裡不會移動其他圖層)
// before: 若提供，會把 Null 移到該圖層的正上方 (否則 addNull 一律插在最頂端)
function mcyMakeNull(c, name, colorIndex, inP, outP, is3D, center, before) {
  var n = c.layers.addNull();
  n.inPoint = inP;
  n.outPoint = outP;
  n.label = getTargetLabel(colorIndex, 1);
  if (is3D) n.threeDLayer = true;
  n.name = getUniqueName(c, name);
  // 把 Null 放在內容中心。先把錨點設到 Null 自身中心，再讓中心對齊目標位置；
  // 否則 Null 預設錨點在左上角 [0,0]，position 會偏移半個身位，串接時還會逐層累加 → 對角線飄移。
  if (center) {
    var r = n.sourceRectAtTime(c.time, false);
    var ax = r.left + r.width / 2;
    var ay = r.top + r.height / 2;
    if (is3D) {
      n.transform.anchorPoint.setValue([ax, ay, 0]);
      n.transform.position.setValue([center[0], center[1], 0]);
    } else {
      n.transform.anchorPoint.setValue([ax, ay]);
      n.transform.position.setValue([center[0], center[1]]);
    }
  }
  // 移到對應圖層上方，維持堆疊順序
  if (before) n.moveBefore(before);
  addLockedEaseKeys(n, "Scale");
  addLockedEaseKeys(n, "Position");
  addLockedEaseKeys(n, "Rotation");
  return n;
}

// 建立 qty 層巢狀 Null 控制器：children → null1 → null2 → … → nullN
// firstBefore: 最底層 Null 要放在哪個圖層上方
function mcyBuildNullChain(c, children, firstBefore, center, inP, outP, is3D, baseName, colorIndex, qty) {
  if (qty < 1) qty = 1;
  var prev = null;
  var moveRef = firstBefore;
  for (var k = 0; k < qty; k++) {
    var n = mcyMakeNull(
      c,
      "Null for " + baseName,
      colorIndex,
      inP,
      outP,
      is3D,
      center,
      moveRef
    );
    if (k === 0) {
      for (var ci = 0; ci < children.length; ci++)
        mcyParentKeepTransform(children[ci], n);
    } else {
      prev.parent = n;
    }
    prev = n;
    moveRef = n;
    n.selected = true;
  }
}

// bindSingle: true = 多個選取圖層綁定到「同一個」Null；false = 每個圖層各自一個 Null
// qty: 每組要建立的巢狀 Null 層數
function mcyAddNull(qty, colorIndex, bindSingle) {
  try {
    var c = mcyGetComp();
    if (!c || !(c instanceof CompItem)) return "ERR:請先開啟合成";
    app.beginUndoGroup("MARCY Null");

    var targets = getSelectedTargets(c); // 已排序的選取圖層快照
    if (targets.length === 0) {
      // 沒有選取：建立 qty 個全長 Null
      for (var q = 0; q < qty; q++) {
        var n = c.layers.addNull();
        n.source.width = c.width;
        n.source.height = c.height;
        n.label = getTargetLabel(colorIndex, 1);
        n.name = getUniqueName(c, "Null for " + c.name);
      }
      app.endUndoGroup();
      return "OK";
    }

    // 先取消所有選取，最後只選新建立的 Null
    for (var i = 0; i < targets.length; i++) targets[i].selected = false;

    if (bindSingle) {
      // === 多圖層 → 單一 Null ===
      var min = 99999,
        max = -99999,
        is3D = false,
        hasContent = false;
      var minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (var i = 0; i < targets.length; i++) {
        var t = targets[i];
        if (t.inPoint < min) min = t.inPoint;
        if (t.outPoint > max) max = t.outPoint;
        if (mcyIs3DLike(t)) is3D = true;
        // 只用內容圖層計算外框；攝影機/燈光沒有畫面內容，不納入
        if (mcyIsContent(t)) {
          hasContent = true;
          var l = getLayerEdge(t, "left"),
            r = getLayerEdge(t, "right"),
            tp = getLayerEdge(t, "top"),
            bt = getLayerEdge(t, "bottom");
          if (l < minX) minX = l;
          if (r > maxX) maxX = r;
          if (tp < minY) minY = tp;
          if (bt > maxY) maxY = bt;
        }
      }
      var center = hasContent
        ? [(minX + maxX) / 2, (minY + maxY) / 2]
        : [c.width / 2, c.height / 2];
      // 全部選取圖層 → 一組 (qty 層巢狀) Null，置於最上層選取圖層之上
      mcyBuildNullChain(
        c,
        targets,
        targets[0],
        center,
        min,
        max,
        is3D,
        getCleanBaseName(targets[0].name),
        colorIndex,
        qty
      );
    } else {
      // === 每個圖層 → 各自一組 (qty 層巢狀) Null ===
      for (var i = 0; i < targets.length; i++) {
        var t = targets[i];
        mcyBuildNullChain(
          c,
          [t],
          t,
          mcyLayerCenter(c, t),
          t.inPoint,
          t.outPoint,
          mcyIs3DLike(t),
          getCleanBaseName(t.name),
          colorIndex,
          qty
        );
      }
    }
    app.endUndoGroup();
    return "OK";
  } catch (e) {
    return "ERR:" + e.toString();
  }
}

// 取得選取圖層的合併時間範圍與最上層 (index 最小者)
function mcyTargetsSpan(targets) {
  var min = 99999,
    max = -99999;
  for (var i = 0; i < targets.length; i++) {
    if (targets[i].inPoint < min) min = targets[i].inPoint;
    if (targets[i].outPoint > max) max = targets[i].outPoint;
  }
  return { min: min, max: max, top: targets[0] }; // targets 已依 index 升冪排序
}

// single: true = 合併成「一個」圖層 (涵蓋所有選取圖層、置於最上層之上)；false = 每個圖層各自一個
function mcyAddAdj(qty, colorIndex, single) {
  try {
    var c = mcyGetComp();
    if (!c || !(c instanceof CompItem)) return "ERR:請先開啟合成";
    app.beginUndoGroup("MARCY Adj");
    var targets = getSelectedTargets(c);

    function makeAdj(start, end, refLayer, baseName) {
      var insertionRef = refLayer;
      for (var cnt = 0; cnt < qty; cnt++) {
        var layer = c.layers.addSolid(
          [1, 1, 1],
          "Adjustment Layer",
          c.width,
          c.height,
          1
        );
        layer.adjustmentLayer = true;
        layer.label = getTargetLabel(colorIndex, 8);
        layer.inPoint = start;
        layer.outPoint = end;
        if (insertionRef) {
          layer.moveBefore(insertionRef);
          insertionRef = layer;
        }
        layer.name = getUniqueName(c, "Adj for " + baseName);
      }
    }

    if (targets.length === 0) {
      makeAdj(0, c.duration, null, c.name);
    } else if (single) {
      var s = mcyTargetsSpan(targets);
      makeAdj(s.min, s.max, s.top, getCleanBaseName(s.top.name));
    } else {
      for (var j = 0; j < targets.length; j++) {
        var t = targets[j];
        makeAdj(t.inPoint, t.outPoint, t, getCleanBaseName(t.name));
      }
    }
    app.endUndoGroup();
    return "OK";
  } catch (e) {
    return "ERR:" + e.toString();
  }
}

function mcyAddSolid(qty, colorIndex, single) {
  try {
    var c = mcyGetComp();
    if (!c || !(c instanceof CompItem)) return "ERR:請先開啟合成";
    app.beginUndoGroup("MARCY Solid");
    var targets = getSelectedTargets(c);

    function makeSolid(start, end, refLayer, baseName, posLayer) {
      var insertionRef = refLayer;
      for (var cnt = 0; cnt < qty; cnt++) {
        var layer = c.layers.addSolid([0, 0, 0], "Black Solid", c.width, c.height, 1);
        layer.label = getTargetLabel(colorIndex, 0);
        layer.inPoint = start;
        layer.outPoint = end;
        if (posLayer) layer.position.setValue(posLayer.position.value);
        if (insertionRef) {
          layer.moveBefore(insertionRef);
          insertionRef = layer;
        }
        layer.name = getUniqueName(c, "Solid_for_" + baseName);
      }
    }

    if (targets.length === 0) {
      makeSolid(0, c.duration, null, c.name, null);
    } else if (single) {
      var s = mcyTargetsSpan(targets);
      makeSolid(s.min, s.max, s.top, getCleanBaseName(s.top.name), s.top);
    } else {
      for (var j = 0; j < targets.length; j++) {
        var t = targets[j];
        makeSolid(t.inPoint, t.outPoint, t, getCleanBaseName(t.name), t);
      }
    }
    app.endUndoGroup();
    return "OK";
  } catch (e) {
    return "ERR:" + e.toString();
  }
}

function mcyAddCamera(qty) {
  try {
    var c = mcyGetComp();
    if (!c || !(c instanceof CompItem)) return "ERR:請先開啟合成";
    app.beginUndoGroup("MARCY Cam");
    var sel = c.selectedLayers;
    var cx = c.width / 2,
      cy = c.height / 2;
    for (var q = 0; q < qty; q++) {
      var cm = c.layers.addCamera(getUniqueName(c, "Camera"), [cx, cy]);
      // 明確置中：POI 與 Position 的 x/y 對齊合成中心 (保留 AE 自動算出的 z 距離)
      cm.property("Point of Interest").setValue([cx, cy, 0]);
      var cpos = cm.property("Position");
      var cz = cpos.value[2];
      if (!cz) cz = -Math.round(c.width * 1.389);
      cpos.setValue([cx, cy, cz]);
      if (sel.length > 0) {
        cm.inPoint = sel[0].inPoint;
        cm.outPoint = sel[0].outPoint;
        cm.moveBefore(sel[0]);
      }
    }
    app.endUndoGroup();
    return "OK";
  } catch (e) {
    return "ERR:" + e.toString();
  }
}

function mcyAddLight(qty) {
  try {
    var c = mcyGetComp();
    if (!c || !(c instanceof CompItem)) return "ERR:請先開啟合成";
    app.beginUndoGroup("MARCY Light");
    var sel = c.selectedLayers;
    var lcx = c.width / 2,
      lcy = c.height / 2;
    for (var q = 0; q < qty; q++) {
      var l = c.layers.addLight(getUniqueName(c, "Light"), [lcx, lcy]);
      // 明確置中：POI 與 Position 的 x/y 對齊合成中心
      var lpoi = l.property("Point of Interest");
      if (lpoi) lpoi.setValue([lcx, lcy, 0]);
      var lpos = l.property("Position");
      var lpv = lpos.value;
      lpos.setValue([lcx, lcy, lpv.length > 2 ? lpv[2] : 0]);
      if (sel.length > 0) {
        l.inPoint = sel[0].inPoint;
        l.outPoint = sel[0].outPoint;
        l.moveBefore(sel[0]);
      }
    }
    app.endUndoGroup();
    return "OK";
  } catch (e) {
    return "ERR:" + e.toString();
  }
}
