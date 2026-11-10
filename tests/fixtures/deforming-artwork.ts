import type { Artwork, DrawLayer, Expr } from '../../src/design/artwork.ts';
/** Regression document, not a runtime preset: exercises spatially changing paths. */
export function deformingArtwork():Artwork {
  const phase:Expr=['mul','t',Math.PI*2/32];
  const offset=(p:number,amount:number):Expr=>['mul',amount,['sin',['add',phase,['mul','i',.83],p]]];
  const y=(base:number,p:number,amount=.10):Expr=>['add',base,offset(p,amount)];
  const horizontal:DrawLayer={id:'curved-field',shape:'path',count:9,x:-.12,y:['sub',['mul','i',.13],.12],width:1.25,height:.34,rotation:-.14,opacity:.19,stroke:{linear:[0,0,1,0],stops:[[0,'#4B9A8B00'],[.22,'#4B9A8B80'],[.65,'#3E9082'],[1,'#4B9A8B00']]},lineWidth:.003,blur:.001,region:'viewport',blend:'source-over',path:[['M',0,y(.4,0)],['C',.14,y(.02,.5),.22,y(.92,1),.34,y(.48,1.5)],['C',.47,y(.04,2),.54,y(.96,2.5),.67,y(.4,3)],['C',.81,y(.02,3.5),.9,y(.95,4),1,y(.46,4.5)]]};
  const vertical:DrawLayer={...horizontal,id:'cross-field',count:12,x:['sub',['mul','i',.1],.08],y:-.1,width:.29,height:1.25,rotation:.18,opacity:.13,path:[['M',y(.45,0),0],['C',y(.02,.5),.16,y(.98,1),.25,y(.42,1.5),.36],['C',y(.06,2),.47,y(.92,2.5),.57,y(.5,3),.67],['C',y(.04,3.5),.8,y(.94,4),.9,y(.45,4.5),1]]};
  return {version:1,seed:7319,duration:32,background:'#EEF6F3',assets:[],decisions:{intent:'用连续曲面网格与明暗相邻的光脊呈现浅水光影，形态本身随时间缓慢变形。',composition:'大尺度曲线横纵交织，中心较疏，图层位于界面下方。',colorAndReading:'保持青绿浅底和深色正文，按钮与菜单保持稳定实色；不使用文字挖洞。',patternsAndAssets:'纯程序曲线，没有外部素材；控制点随时间变化而不是整体平移。',materialsAndLighting:'透明色标渐隐、轻柔化与明暗相邻描边建立光影层次；不声称真实折射。',motionAndStates:'32秒闭合周期，路径控制点连续形变；减少动态保留静态曲面。',adaptationAndDelivery:'相对坐标适配；在完整界面下方合成，滚动不会重算图层保护区。'},layers:[
    {id:'water-tones',shape:'rect',count:1,x:0,y:0,width:1,height:1,rotation:0,opacity:1,fill:{radial:[.68,.24,.92],stops:[[0,'#F5FAF7'],[.55,'#E9F4EF'],[1,'#D6EBE2']]},region:'viewport',blend:'source-over'},
    horizontal,vertical,
    {...horizontal,id:'light-ridges',opacity:.52,y:['add',horizontal.y,.003],lineWidth:.0017,blur:.0005,stroke:{linear:[0,0,1,0],stops:[[0,'#FFFFFF00'],[.25,'#FFFFFF'],[.7,'#FFFFFFCC'],[1,'#FFFFFF00']]}},
    {...vertical,id:'cross-light',opacity:.32,x:['add',vertical.x,.002],lineWidth:.0014,blur:.0005,stroke:{linear:[0,0,0,1],stops:[[0,'#FFFFFF00'],[.25,'#FFFFFF'],[.7,'#FFFFFFCC'],[1,'#FFFFFF00']]}},
  ]};
}
