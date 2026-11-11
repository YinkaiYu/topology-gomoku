const test=require('node:test'),assert=require('node:assert/strict'),M=require('../app/assets/topology-morph.js'),L=require('../app/assets/board-view-logic.js');
function point(t,u,v,orientation={}){return M.morphPoint('klein',{x:300+(u-.5)*500,y:300+(v-.5)*500},u,v,M.project('klein',u,v,600,600,orientation),t,{width:600,height:600,rolledFitSample:true});}
test('瓶界先闭合黄边，绿边仍保持分离；最终按翻转关系闭合',()=>{
 for(const u of [.1,.3,.5,.7,.9]){const a=point(.58,u,0),b=point(.58,u,1);assert.ok(Math.hypot(a.x-b.x,a.y-b.y,a.depth-b.depth)<1e-8);}
 for(const v of [.1,.3,.5,.7,.9]){const a=point(.58,0,v),b=point(.58,1,1-v);assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>100);const c=point(1,0,v),d=point(1,1,1-v);assert.ok(Math.hypot(c.x-d.x,c.y-d.y,c.depth-d.depth)<1e-8);}
 for(const t of [.1,.2,.34]){const a=point(t,.1,.23),b=point(t,.5,.23),c=point(t,.9,.23);assert.ok(Math.hypot(a.x+c.x-2*b.x,a.y+c.y-2*b.y,a.depth+c.depth-2*b.depth)<1e-8,'tube generators remain straight');}
});
test('瓶界各点在首尾连续接续，终点保留现有克莱因瓶',()=>{for(const u of [0,.2,.5,.8,1])for(const v of [0,.2,.5,.8,1])for(const end of [0,1]){const a=point(end,u,v),b=point(end===0?1e-8:1-1e-8,u,v);assert.ok(Math.hypot(a.x-b.x,a.y-b.y,a.depth-b.depth)<1e-4);}});
test('任意非零展开进度的拖动都以相同角度响应，收回及重新展开连续',()=>{
 for(const progress of [1e-6,.01,.1,.25,.5,.9,1]){const view={progress,rotation:{x:.4,y:-.6,z:.1},elastic:{x:0,y:0}};const before=L.displayedRotation(view);L.dragRotation(view,.27,-.18);const after=L.displayedRotation(view);assert.ok(Math.abs(after.y-before.y-.27)<1e-10);assert.ok(Math.abs(after.x-before.x+.18)<1e-10);for(const direction of [-1,1]){view.progress=Math.min(1,progress+direction*1e-9);const next=L.displayedRotation(view);assert.ok(Math.abs(next.y-after.y)<1e-5);}view.progress=0;assert.equal(L.displayedRotation(view).x,0);view.progress=1;assert.ok(Math.abs(L.displayedRotation(view).y-view.rotation.y)<1e-12);}
 const flat={progress:0,rotation:{x:0,y:0,z:0}};L.dragRotation(flat,.2,.3);assert.deepEqual(flat.rotation,{x:0,y:0,z:0});
});

test('双生先闭合带半扭转的黄边，最终两组翻转边都严丝合缝',()=>{
 const p=(t,u,v)=>M.morphPoint('projective',{x:300+(u-.5)*500,y:300+(v-.5)*500},u,v,M.project('projective',u,v,600,600,{}),t,{width:600,height:600,rolledFitSample:true});
 for(const t of [.58,.7,.9,1])for(const u of [.1,.3,.7,.9]){const a=p(t,u,0),b=p(t,1-u,1);assert.ok(Math.hypot(a.x-b.x,a.y-b.y,a.depth-b.depth)<1e-8);}
 for(const u of [0,.2,.5,.8,1])for(const v of [0,.2,.5,.8,1])for(const end of [0,1]){const a=p(end,u,v),b=p(end===0?1e-8:1-1e-8,u,v);assert.ok(Math.hypot(a.x-b.x,a.y-b.y,a.depth-b.depth)<1e-4);}
});

// Preserve the order of the physical joins, not merely the easing formula.
test('双生绿边从箭头逐段闭合到箭尾，直接收拢且黄边保持闭合', () => {
  function p(t, u, v) { return M.morphPoint('projective', { x: 300 + (u - .5) * 500, y: 300 + (v - .5) * 500 }, u, v, M.project('projective', u, v, 600, 600, {}), t, { width: 600, height: 600, rolledFitSample: true }); }
  function gap(t, v) { const a = p(t, 0, v), b = p(t, 1, 1 - v); return Math.hypot(a.x - b.x, a.y - b.y, a.depth - b.depth); }
  assert.ok(gap(.9, .9) < 1e-8, 'the arrow head is already joined');
  assert.ok(gap(.9, .1) > 15, 'the arrow tail is still visibly open');
  assert.ok(gap(.94, .7) < 1e-8);
  assert.ok(gap(.94, .1) > 1);
  const world = p => [(p.x - 300) / p.depthScale, (300 - p.y) / p.depthScale, p.depth];
  for (const v of [.1, .3, .5, .7, .9]) {
    let previous = Infinity;
    for (let frame = 60; frame <= 100; frame++) {
      const a = world(p(frame / 100, 0, v)), b = world(p(frame / 100, 1, 1 - v));
      const distance = Math.hypot(...a.map((value, axis) => value - b[axis]));
      assert.ok(distance <= previous + 1e-9, 'green seams never pull apart before closing');
      previous = distance;
    }
  }
  for (const v of [0, .1, .3, .5, .7, .9, 1]) {
    assert.ok(gap(1, v) < 1e-8);
    for (const t of [.6, .75, .9, .94, 1]) {
      assert.ok(Math.abs(M.boundaryProgress('projective', 'left', v, t) - M.boundaryProgress('projective', 'right', 1 - v, t)) < 1e-12);
      const a = p(t, v, 0), b = p(t, 1 - v, 1);
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.depth - b.depth) < 1e-8, 'gold seams never reopen');
    }
  }
});

test('瓶界绿边位于瓶底内部，卷起中段截面保持厚度', () => {
  const centers = [0, 1].map(u => {
    const ring = Array.from({ length: 32 }, (_, i) => M.surfacePoint('klein', u, i / 32));
    return [0, 1, 2].map(axis => ring.reduce((sum, p) => sum + p[axis], 0) / ring.length);
  });
  assert.ok(centers.every(c => c[1] < -.85 && Math.abs(c[0]) < .1), 'the seam is at the inner base, not on the shoulder');
  const world = p => [(p.x - 300) / p.depthScale, (300 - p.y) / p.depthScale, p.depth];
  const subtract = (a, b) => a.map((v, i) => v - b[i]);
  for (const t of [.48, .55, .6, .7, .75]) for (const u of [.1, .3, .5, .7, .9]) {
    const a = subtract(world(point(t, u, 0)), world(point(t, u, .5)));
    const b = subtract(world(point(t, u, .25)), world(point(t, u, .75)));
    const ratio = Math.min(Math.hypot(...a), Math.hypot(...b)) / Math.max(Math.hypot(...a), Math.hypot(...b));
    assert.ok(ratio > .25, `cross-section ${t}/${u} is not flattened`);
    assert.ok(Math.abs(a.reduce((s, v, i) => s + v * b[i], 0)) / Math.hypot(...a) / Math.hypot(...b) < .2);
  }
});


test('瓶肚截面更圆润，收拢末段连续舒展回落', () => {
  const world = p => [(p.x - 300) / p.depthScale, (300 - p.y) / p.depthScale, p.depth];
  const diameter = (t, u, v) => {
    const a = world(point(t, u, v)), b = world(point(t, u, v + .5));
    return Math.hypot(...a.map((value, axis) => value - b[axis]));
  };
  for (const u of [.2, .3]) {
    const finalWidth = diameter(1, u, .25), finalDepth = diameter(1, u, 0);
    assert.ok(finalWidth / finalDepth > .6, 'belly no longer has the thin original oval cross-section');
    assert.ok(diameter(.8, u, .25) > finalWidth * 1.05, 'the belly participates in the final settling');
    let previous = diameter(.8, u, .25);
    for (let frame = 81; frame <= 100; frame++) {
      const width = diameter(frame / 100, u, .25);
      assert.ok(width < previous && previous - width < .01, 'one continuous, restrained settling motion');
      previous = width;
    }
    assert.ok(diameter(.99, u, .25) - finalWidth < .001, 'the endpoint comes gently to rest');
  }
});
