const test=require('node:test'),assert=require('node:assert/strict'),M=require('../app/assets/topology-morph.js'),E=require('../app/assets/topology.js');
test('归圆所有跨缝步进都从实际越过的边出发，斜向步不绕向另一条边',()=>{
 for(const size of [5,7,19]){const rules=E.createRules({type:'sphere',width:size,height:size});for(let cell=0;cell<size*size;cell++)for(let d=0;d<8;d++){const step=E.step(rules,cell,d);if(!step?.seam)continue;const vector=E.DIRECTIONS[d],from=M.stoneUV(rules,cell),to=M.stoneUV(rules,step.cell),bridge=M.seamBridgeUV('sphere',from,to,vector,!!(step.seam&E.SEAM_X),!!(step.seam&E.SEAM_Y));const x=cell%size,y=Math.floor(cell/size);if(y+vector.dy<0)assert.equal(bridge.source.v,0);else if(x+vector.dx<0)assert.equal(bridge.source.u,0);else if(y+vector.dy>=size)assert.equal(bridge.source.v,1);else assert.equal(bridge.source.u,1);assert.ok(Math.hypot(bridge.source.u-from.u,bridge.source.v-from.v)<1/(size-1),'exit stays within one cell');const a=M.surfacePoint('sphere',bridge.source.u,bridge.source.v),b=M.surfacePoint('sphere',bridge.target.u,bridge.target.v);assert.ok(Math.hypot(...a.map((v,i)=>v-b[i]))<1e-8);}}
});

test('归圆短距离接缝明确跨图连接，不被网格插值改写成内部绕路',()=>{
 const depth=M.createDepthBuffer(200,200,[]);let traced=0;
 depth.mesh={point:(u,v)=>({x:u*100,y:v*100,depth:0}),path:()=>{traced++;return [{x:19,y:0,depth:0},{x:70,y:70,depth:0},{x:0,y:19,depth:0}];}};
 const drawn=[];depth.strokePath({beginPath(){},moveTo(x,y){drawn.push([x,y]);},lineTo(x,y){drawn.push([x,y]);},stroke(){}},[{u:.19,v:0},{u:0,v:.19,chartJump:true}]);assert.equal(traced,0);assert.deepEqual(drawn,[[19,0],[0,19]]);
});
