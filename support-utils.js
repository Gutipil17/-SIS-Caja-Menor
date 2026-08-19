(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.SISSupportUtils=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  function dataUrlBytes(value){
    const text=String(value||''),comma=text.indexOf(',');
    if(comma<0)return new Uint8Array();
    const meta=text.slice(0,comma),payload=text.slice(comma+1);
    if(/;base64/i.test(meta)){
      const binary=typeof atob==='function'?atob(payload):Buffer.from(payload,'base64').toString('binary');
      return Uint8Array.from(binary,char=>char.charCodeAt(0));
    }
    return new TextEncoder().encode(decodeURIComponent(payload));
  }

  function attachmentBytes(attachment){
    if(attachment?.type==='application/pdf'&&attachment.data)return dataUrlBytes(attachment.data);
    const pages=attachment?.pages||[],chunks=pages.map(dataUrlBytes),size=chunks.reduce((sum,chunk)=>sum+chunk.length+1,0),joined=new Uint8Array(size);
    let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.length;joined[offset++]=0xff}return joined;
  }

  async function sha256(bytes){
    const cryptoApi=globalThis.crypto?.subtle;
    if(!cryptoApi)throw new Error('El dispositivo no ofrece SHA-256 seguro.');
    const digest=await cryptoApi.digest('SHA-256',bytes);
    return [...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
  }

  async function attachmentHash(attachment){return attachment?.hash||sha256(attachmentBytes(attachment))}

  async function duplicateGroups(movements){
    const byHash=new Map();
    for(const movement of movements||[]){
      for(const attachment of movement.attachments||[]){
        const hash=await attachmentHash(attachment);if(!hash)continue;
        if(!byHash.has(hash))byHash.set(hash,[]);
        byHash.get(hash).push({movement,attachment,hash});
      }
    }
    return [...byHash.values()].filter(group=>group.length>1);
  }

  function blankPageMetrics(imageData,text=''){
    const data=imageData?.data||[],width=imageData?.width||0,height=imageData?.height||0,total=Math.max(1,width*height);
    let ink=0,dark=0,minX=width,minY=height,maxX=-1,maxY=-1;
    for(let pixel=0,index=0;index<data.length;pixel++,index+=4){
      const alpha=data[index+3]/255,lum=(.2126*data[index]+.7152*data[index+1]+.0722*data[index+2])*alpha+255*(1-alpha);
      if(lum<245){ink++;const x=pixel%width,y=Math.floor(pixel/width);if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y}
      if(lum<180)dark++;
    }
    const box=maxX<0?0:((maxX-minX+1)*(maxY-minY+1))/total;
    return{inkRatio:ink/total,darkRatio:dark/total,boundingRatio:box,textLength:String(text||'').replace(/\s+/g,'').length,inkPixels:ink,darkPixels:dark};
  }

  function isEffectivelyBlankPdfPage(imageData,text=''){
    const metrics=blankPageMetrics(imageData,text);
    // Conservador: cualquier texto útil, firma, sello o bloque con extensión apreciable conserva la página.
    const blank=metrics.textLength<=2&&metrics.inkRatio<0.00028&&metrics.darkRatio<0.00012&&metrics.boundingRatio<0.003;
    return{blank,metrics,reason:blank?'contenido visual y textual por debajo del umbral conservador':'contenido conservado'};
  }

  function movementComplete(movement){
    const receipt=movement?.support==='Recibo de Caja';
    return receipt?!!movement.thirdParty&&!!movement.idNumber&&!!movement.signature:!!movement?.attachments?.length;
  }

  function supportPagePlan(documents,start=1){
    let number=start-1;return(documents||[]).map(document=>({supportNumber:++number,pages:(document.pages||[]).map((page,index)=>({page,index,count:document.pages.length}))}));
  }

  return{dataUrlBytes,attachmentBytes,attachmentHash,duplicateGroups,blankPageMetrics,isEffectivelyBlankPdfPage,movementComplete,supportPagePlan};
});
