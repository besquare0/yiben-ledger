export const uid = () => globalThis.crypto.randomUUID();
export const money = n => new Intl.NumberFormat('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n/100);
export function cents(value) {
  const s=String(value).trim();
  if(!/^\d+(\.\d{1,2})?$/.test(s)) throw Error('请输入大于 0、最多两位小数的金额');
  const [a,b='']=s.split('.');const n=Number(a)*100+Number(b.padEnd(2,'0'));
  if(!Number.isSafeInteger(n)||n<=0||n>100000000000)throw Error('金额需在 0.01 至 10 亿元之间');
  return n;
}
export function split(amount,ids){
  if(!ids.length)throw Error('至少选择一位分摊成员');
  return Object.fromEntries(ids.map((id,i)=>[id,Math.floor(amount/ids.length)+(i<amount%ids.length?1:0)]));
}
export function balances(book){
  const result=Object.fromEntries(book.members.map(m=>[m.id,0]));
  for(const item of book.items){result[item.payerId]+=item.amount;for(const [id,n]of Object.entries(split(item.amount,item.participantIds)))result[id]-=n;}
  return result;
}
export function transfers(book){
  const b=balances(book),credit=Object.entries(b).filter(([,n])=>n>0).map(([id,n])=>({id,n})),debt=Object.entries(b).filter(([,n])=>n<0).map(([id,n])=>({id,n:-n})),out=[];
  let i=0,j=0;while(i<debt.length&&j<credit.length){const amount=Math.min(debt[i].n,credit[j].n);out.push({from:debt[i].id,to:credit[j].id,amount});debt[i].n-=amount;credit[j].n-=amount;if(!debt[i].n)i++;if(!credit[j].n)j++;}return out;
}
export function validDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}
const short=(v,n)=>typeof v==='string'&&v.trim().length>0&&v.length<=n;
const validId=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v);
export function validateBook(b){
  if(!b||!short(b.id,100)||!short(b.name,60)||!['sand','peach','sage','lavender','brown'].includes(b.color)||!Number.isInteger(b.revision)||b.revision<1||typeof b.createdAt!=='string'||!Number.isFinite(Date.parse(b.createdAt))||typeof b.updatedAt!=='string'||!Number.isFinite(Date.parse(b.updatedAt))||(b.deletedAt!==null&&(typeof b.deletedAt!=='string'||!Number.isFinite(Date.parse(b.deletedAt))))||!Array.isArray(b.members)||!Array.isArray(b.items)||b.members.length>100||b.items.length>100000)throw Error('账本格式不完整或版本不支持');
  if(!validId(b.id))throw Error('备份中的账本标识有误');
  const members=new Set();for(const m of b.members){if(!validId(m.id)||!short(m.name,30)||members.has(m.id))throw Error('备份中的成员数据有误');members.add(m.id);}
  const items=new Set();let total=0;for(const e of b.items){if(!validId(e.id)||items.has(e.id)||!short(e.title,100)||!short(e.category,20)||!Number.isSafeInteger(e.amount)||e.amount<=0||e.amount>100000000000||!members.has(e.payerId)||!Array.isArray(e.participantIds)||!e.participantIds.length||e.participantIds.some(id=>!members.has(id))||new Set(e.participantIds).size!==e.participantIds.length||!validDate(e.date))throw Error('备份中的消费金额、日期或成员引用有误');items.add(e.id);total+=e.amount;if(!Number.isSafeInteger(total))throw Error('账本总金额超出支持范围');}return b;
}
export function validateBackup(data){
  if(!data||data.format!=='yiben-backup'||data.version!==1||!Array.isArray(data.books)||data.books.length>1000)throw Error('请选择「一本」导出的有效备份文件');
  const ids=new Set();for(const b of data.books){validateBook(b);if(ids.has(b.id))throw Error('备份中出现重复账本');ids.add(b.id);}return data.books;
}
export function parseLines(raw,members){
  let explicitDate='';
  return raw.split(/\n/).map(s=>s.trim()).filter(Boolean).map(line=>{
    let title=line,date=explicitDate,payerId='',amount=null;
    const d=line.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?/);
    if(d){const v=`${d[1]}-${d[2].padStart(2,'0')}-${d[3].padStart(2,'0')}`;if(validDate(v))date=v;title=title.replace(d[0],'');if(!title.trim()&&date){explicitDate=date;return null;}}
    const payer=[...members].sort((a,b)=>b.name.length-a.name.length).find(m=>title.includes(m.name));if(payer){payerId=payer.id;title=title.replace(payer.name,'');}
    const amounts=[...title.matchAll(/(?:[¥￥]\s*)?(\d+(?:\.\d{1,2})?)\s*(?:元)?/g)];
    if(amounts.length===1){try{amount=cents(amounts[0][1]);title=title.replace(amounts[0][0],'');}catch{}}
    title=title.replace(/^[\s:：,，·-]+|[\s:：,，·-]+$/g,'').trim();
    return {id:uid(),source:line,title:title||'未命名消费',amount,date,payerId,category:'其他'};
  }).filter(Boolean);
}
export function newBook(name,color='sand'){
  const now=new Date().toISOString();return {id:uid(),name:name.trim(),color,createdAt:now,updatedAt:now,deletedAt:null,revision:1,members:[{id:uid(),name:'我'}],items:[]};
}
