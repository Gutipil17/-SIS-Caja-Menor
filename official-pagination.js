'use strict';
(function(global){
  function paginate(items,pageSize){
    if(!Number.isSafeInteger(pageSize)||pageSize<=0)throw new Error('La capacidad por página debe ser un entero positivo.');
    const pages=[];
    for(let i=0;i<(items||[]).length;i+=pageSize)pages.push(items.slice(i,i+pageSize));
    return pages;
  }

  function cloneWorksheet(workbook,source,name){
    const worksheet=workbook.addWorksheet(name),model=structuredClone(source.model),merges=[...(source.model.merges||[])];
    model.id=worksheet.id;model.name=name;model.merges=[];
    worksheet.model=model;
    for(const range of merges)worksheet.mergeCells(range);
    return worksheet;
  }

  function pagedWorksheets(workbook,source,items,pageSize,baseName){
    const pages=paginate(items,pageSize);
    return pages.map((movements,index)=>({
      worksheet:index===0?source:cloneWorksheet(workbook,source,`${baseName} ${index+1}`),
      movements,index,pageCount:pages.length
    }));
  }

  global.SISOfficialPagination={paginate,cloneWorksheet,pagedWorksheets};
})(typeof window!=='undefined'?window:globalThis);
