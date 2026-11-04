import { uid, validateBook, validateBackup } from './domain.js';
export class ConflictError extends Error { constructor(){super('这本账在另一个窗口中更新了。已保留你的输入，请关闭表单、核对最新内容后再修改。');this.name='ConflictError';} }
const request = r => new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
export async function openStore(name='yiben-ledger-v1'){
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(name,1);r.onupgradeneeded=()=>{const d=r.result;d.createObjectStore('books',{keyPath:'id'});const h=d.createObjectStore('history',{keyPath:'id'});h.createIndex('bookId','bookId');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('请关闭其他旧版本页面后重新打开'));});
  db.onversionchange=()=>db.close();
  async function transact(stores,mode,fn){
    const tx=db.transaction(stores,mode);const done=new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('保存未完成，请导出备份后重试'));tx.onerror=()=>{};});
    try{const result=await fn(tx);await done;return result;}catch(e){try{tx.abort();}catch{}await done.catch(()=>{});throw e;}
  }
  async function snapshot(tx,book,label){
    const h=tx.objectStore('history');h.add({id:uid(),bookId:book.id,time:new Date().toISOString(),label,book:structuredClone(book)});
    const old=await request(h.index('bookId').getAll(book.id));old.sort((a,b)=>a.time.localeCompare(b.time));while(old.length>30)h.delete(old.shift().id);
  }
  return {
    close:()=>db.close(),
    list:()=>transact(['books'],'readonly',tx=>request(tx.objectStore('books').getAll())),
    get:id=>transact(['books'],'readonly',tx=>request(tx.objectStore('books').get(id))),
    history:id=>transact(['history'],'readonly',async tx=>(await request(tx.objectStore('history').index('bookId').getAll(id))).sort((a,b)=>b.time.localeCompare(a.time))),
    create:book=>transact(['books'],'readwrite',async tx=>{validateBook(book);await request(tx.objectStore('books').add(book));return book;}),
    change:(id,expected,edit,label='修改账本')=>transact(['books','history'],'readwrite',async tx=>{
      const s=tx.objectStore('books'),current=await request(s.get(id));if(!current||current.revision!==expected)throw new ConflictError();
      const next=structuredClone(current);edit(next);next.revision=current.revision+1;next.updatedAt=new Date().toISOString();validateBook(next);await snapshot(tx,current,label);await request(s.put(next));return next;
    }),
    import: data=>transact(['books'],'readwrite',async tx=>{
      const incoming=validateBackup(data),s=tx.objectStore('books');let added=0,skipped=0;
      for(const source of incoming){const b=structuredClone(source),exists=await request(s.get(b.id));
        if(exists){const content=v=>JSON.stringify({name:v.name,color:v.color,members:v.members,items:v.items,deletedAt:v.deletedAt});if(content(exists)===content(b)){skipped++;continue;}b.id=uid();b.name=(b.name.slice(0,49)+'（备份副本）');b.revision=1;}
        validateBook(b);await request(s.add(b));added++;
      }return {added,skipped};
    })
  };
}
