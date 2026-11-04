import {uid,money,cents,balances,transfers,parseLines,newBook,validateBackup,validDate} from './domain.js';
import {openStore,ConflictError} from './storage.js';
import {icon,categoryIcon} from './icons.js';
import {demoBooks} from './demo.js';

const app=document.querySelector('#app'),dialog=document.querySelector('#dialog'),toastEl=document.querySelector('#toast');
let store,books=[],page='books',selectedId='',demo=false,demoData=[],toastTimer,search='',payerFilter='',dateFilter='',lastBackup='',busy=false,updateChannel;
const drafts=new Map(),navs=[['books','book','账本'],['details','list','明细'],['settlement','settle','结算'],['members','people','成员'],['import','download','导入']];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const shortDate=d=>{const [,m,day]=d.split('-');return `${Number(m)}月${Number(day)}日`;};
const timeLabel=d=>new Date(d).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
const active=()=>allBooks().filter(b=>!b.deletedAt).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
const allBooks=()=>demo?demoData:books;
const current=()=>allBooks().find(b=>b.id===selectedId&&!b.deletedAt)||active()[0];
const total=b=>b.items.reduce((n,e)=>n+e.amount,0);
const nameOf=(b,id)=>b.members.find(m=>m.id===id)?.name||'已移除成员';
const avatar=(b,id,small=false)=>{const i=b.members.findIndex(m=>m.id===id);return `<span class="avatar c${Math.max(0,i)%5}"${small?' aria-hidden="true"':''}>${esc(nameOf(b,id).slice(0,1))}</span>`;};
const btn=(action,label,ico='',cls='',extra='')=>`<button class="btn ${cls}" data-action="${action}" ${extra}>${ico?icon(ico):''}${label}</button>`;
const iconButton=(action,label,ico,extra='')=>`<button class="icon-btn" aria-label="${esc(label)}" title="${esc(label)}" data-action="${action}" ${extra}>${icon(ico)}</button>`;
const amount=n=>`¥${money(n)}`;
function toast(message,error=false){clearTimeout(toastTimer);toastEl.textContent=message;toastEl.className='toast show'+(error?' error':'');toastTimer=setTimeout(()=>toastEl.className='toast',error?10000:4000);}
function guard(){if(demo){toast('这里是只读示例。退出示例后，就能建立自己的账本。');return false;}return true;}
function draft(){const b=current();if(!b)return null;if(!drafts.has(b.id))drafts.set(b.id,{manual:'',images:[],preview:[]});return drafts.get(b.id);}
function announce(){try{updateChannel?.postMessage('changed');}catch{}}
async function refresh(){books=await store.list();if(selectedId&&!active().some(b=>b.id===selectedId))selectedId=active()[0]?.id||'';}
async function change(base,edit,label){if(!guard())return;try{await store.change(base.id,base.revision,edit,label);await refresh();announce();render();return true;}catch(e){if(e instanceof ConflictError){await refresh();render();}throw e;}}
function head(title,sub,actions=''){return `<div class="page-head"><div><h1>${title}</h1>${sub?`<p>${sub}</p>`:''}</div><div class="head-actions">${actions}</div></div>`;}
function openDialog(title,body,wide=false){dialog.className=wide?'wide':'';dialog.innerHTML=`<div class="modal-head"><h2 id="dialog-title">${esc(title)}</h2>${iconButton('close-dialog','关闭','close')}</div><div class="modal-body">${body}</div>`;if(!dialog.open)dialog.showModal();}
function formDialog(title,body,onSubmit,submit='保存',after=''){
 openDialog(title,`<form id="modal-form">${body}<p class="form-error" role="alert" id="form-error"></p><div class="modal-actions">${btn('close-dialog','取消')}<button type="submit" class="btn primary">${esc(submit)}</button></div>${after}</form>`);
 dialog.querySelectorAll('button[data-action]').forEach(b=>b.type='button');
 dialog.querySelector('form').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget,submitter=form.querySelector('[type=submit]');if(submitter.disabled)return;submitter.disabled=true;try{await onSubmit(new FormData(form),form);dialog.close();}catch(e){dialog.querySelector('#form-error').textContent=e.message;}finally{submitter.disabled=false;}});
}
function confirmDialog(title,text,onConfirm,button='确认'){
 formDialog(title,`<p class="form-hint">${esc(text)}</p>`,onConfirm,button);
}
function emptyBookPage(){return `<div class="panel empty"><div class="empty-book">${icon('book')}</div><h2>先建一本，再记一笔</h2><p>每一本独立保存，日常和旅行分开记。</p>${btn('new-book','新建账本','plus','primary')}</div>`;}
function render(){
 const b=current();if(b&&!selectedId)selectedId=b.id;
 app.innerHTML=`<aside class="sidebar"><div class="brand"><img src="icon.svg" alt=""><div>一本<small>好 好 记 账</small></div></div><nav class="nav" aria-label="主导航">${navs.map(([id,ico,label])=>`<button data-page="${id}" class="${page===id?'active':''}" ${page===id?'aria-current="page"':''}>${icon(ico)}<span>${label}</span></button>`).join('')}</nav><div class="side-bottom"><div class="local-mark"><i></i>数据保存在此设备</div><p>记得导出备份，换设备也能带走。</p><button class="demo-link" data-action="${demo?'exit-demo':'demo'}">${demo?'退出示例':'看看示例账本'}</button></div></aside>
 <div class="workspace"><header class="topbar"><div class="top-left"><span class="mobile-brand"><img src="icon.svg" alt="">记账本</span><span class="desktop-crumb">我的空间 / ${page==='books'?'全部账本':esc(b?.name||'尚未选择账本')}</span></div><div class="top-actions">${page!=='books'&&b?`<select class="book-switch" id="book-switch" aria-label="切换当前账本">${active().map(n=>`<option value="${n.id}" ${n.id===b.id?'selected':''}>${esc(n.name)}</option>`).join('')}</select>`:''}<span class="saved-chip ${navigator.onLine?'':'offline'}">${icon(navigator.onLine?'shield':'lock')}${demo?'只读示例':navigator.onLine?'本机保存':'离线使用'}</span>${page==='books'?'<span class="avatar">我</span>':''}</div></header>
 ${demo?`<div class="demo-banner"><span>正在浏览示例 · 数据不会保存</span><button class="text-button" data-action="exit-demo">退出示例 ${icon('close')}</button></div>`:''}
 <main id="main" tabindex="-1">${page==='books'?booksPage():!b?head(navs.find(n=>n[0]===page)[2],'')+emptyBookPage():page==='details'?detailsPage(b):page==='settlement'?settlementPage(b):page==='members'?membersPage(b):importPage(b)}</main></div>`;
}
function booksPage(){
 const list=active(),recent=list.flatMap(b=>b.items.map(e=>({b,e}))).sort((a,b)=>b.e.date.localeCompare(a.e.date)).slice(0,4);
 return head('我的账本','日常与出游，都有各自的一本。',btn('new-book','新建账本','plus','primary'))+
 (list.length?`<div class="section-head"><h2>全部账本 <small> / ${list.length} 本</small></h2><button class="text-button" data-action="trash">${icon('trash')}回收站</button></div><div class="book-grid">${list.map(b=>`<article class="book-card"><div class="book-cover ${esc(b.color)}"><div class="cover-book"></div><div class="cover-lines"></div><span class="book-tag">${b.members.length>1?'一起记':'自己记'}</span></div><div class="book-content"><div class="book-title-row"><button class="book-open" data-action="open-book" data-id="${b.id}"><h3>${esc(b.name)}</h3></button>${iconButton('book-menu',`${b.name}的更多操作`,'more',`data-id="${b.id}"`)}</div><p class="book-meta">${timeLabel(b.updatedAt)} 更新</p><div class="book-total"><strong>${amount(total(b))}</strong><span>${b.items.length} 笔消费</span></div><div class="book-foot"><div class="avatar-stack" aria-label="${b.members.length}位成员">${b.members.slice(0,5).map(m=>avatar(b,m.id,true)).join('')}</div><button class="text-button" data-action="open-book" data-id="${b.id}">打开账本 ${icon('arrow')}</button></div></div></article>`).join('')}</div>`:
 `<div class="panel empty"><div class="empty-book">${icon('book')}</div><h2>给生活，留一本账</h2><p>从第一笔开始。每个账本单独保存，随时导出带走。</p>${btn('new-book','创建第一本','plus','primary')}${btn('demo','先看看示例','book')}</div>`)+
 `<div class="bottom-grid"><section><div class="section-head"><h2>最近的几笔</h2><small>按消费日期</small></div><div class="panel">${recent.length?recent.map(({b,e})=>`<button class="recent-row" data-action="recent" data-id="${b.id}" data-item="${e.id}"><span class="category-icon">${icon(categoryIcon(e.category))}</span><span class="row-info"><strong>${esc(e.title)}</strong><small>${esc(b.name)} · ${shortDate(e.date)}</small></span><span class="amount">${amount(e.amount)}</span></button>`).join(''):'<div class="empty-mini">记下第一笔消费后，会出现在这里。</div>'}</div></section><section><div class="section-head"><h2>备份与恢复</h2>${icon('shield')}</div><div class="panel"><button class="backup-row" data-action="export"><span class="category-icon">${icon('download')}</span><span class="row-info"><strong>导出备份</strong><small>打包全部账本，保存到你信任的地方</small></span>${icon('chevron')}</button><button class="backup-row" data-action="import-backup"><span class="category-icon">${icon('upload')}</span><span class="row-info"><strong>从备份恢复</strong><small>合并导入，保留现有账本</small></span>${icon('chevron')}</button><button class="backup-row" data-action="all-history"><span class="category-icon">${icon('history')}</span><span class="row-info"><strong>历史版本</strong><small>每本保留最近 30 次修改前的版本</small></span>${icon('chevron')}</button></div><p class="footnote">${icon('lock')} 账本仅存于当前浏览器。清除网站数据会删除本机存档，请定期导出。${lastBackup?`<br>本次最近导出：${esc(lastBackup)}`:''}</p></section></div>${!list.length?`<div class="section-head"><span></span><button class="text-button" data-action="trash">${icon('trash')}查看回收站</button></div>`:''}`;
}
function detailsPage(b){
 const days={};for(const e of b.items){days[e.date]??=Object.create(null);days[e.date][e.payerId]=(days[e.date][e.payerId]||0)+e.amount;}
 const filtered=b.items.filter(e=>(!search||e.title.includes(search)||nameOf(b,e.payerId).includes(search))&&(!payerFilter||e.payerId===payerFilter)&&(!dateFilter||e.date===dateFilter)).sort((a,b)=>b.date.localeCompare(a.date));
 return head('明细',`${esc(b.name)} · ${b.members.length} 人`, `<button class="circle-add" data-action="add-expense" aria-label="记一笔消费">${icon('plus')}</button>`)+
 `<div class="stats-strip"><div class="sum"><label>账本总支出</label><strong>${amount(total(b))}</strong></div><div><label>消费笔数</label><strong>${b.items.length}</strong></div><div><label>参与成员</label><strong>${b.members.length} 人</strong></div></div>`+
 `<div class="section-head"><h2>每天 · 每人花了多少</h2><small>按付款金额</small></div>${Object.keys(days).length?`<div class="daily-grid">${Object.keys(days).sort().reverse().map(day=>`<section class="day-card"><div class="day-title">${shortDate(day)}</div>${Object.entries(days[day]).map(([id,n])=>`<div class="daily-person">${avatar(b,id)}<span class="row-info"><strong>${esc(nameOf(b,id))}</strong><small>当天垫付</small></span><span class="money-chip">${amount(n)}</span></div>`).join('')}</section>`).join('')}</div>`:'<div class="panel empty-mini">还没有消费记录，点右上角开始记。</div>'}
 <div class="section-head"><h2>消费记录</h2><small>${filtered.length} 笔${search||payerFilter||dateFilter?'筛选结果':''}</small></div><div class="view-controls"><label class="search">${icon('search')}<input id="expense-search" type="search" placeholder="搜索消费或付款人" aria-label="搜索消费或付款人" value="${esc(search)}"></label><select id="payer-filter" class="control" aria-label="筛选付款人"><option value="">全部付款人</option>${b.members.map(m=>`<option value="${m.id}" ${payerFilter===m.id?'selected':''}>${esc(m.name)}</option>`).join('')}</select><input id="date-filter" class="control" type="date" aria-label="筛选消费日期" value="${esc(dateFilter)}">${search||payerFilter||dateFilter?iconButton('clear-filters','清除筛选','close'):''}</div>
 <div class="panel expense-table">${filtered.length?filtered.map(e=>`<button class="recent-row" data-action="edit-expense" data-id="${e.id}"><span class="category-icon">${icon(categoryIcon(e.category))}</span><span class="row-info"><strong>${esc(e.title)}</strong><small><span class="mobile-date">${shortDate(e.date)} · </span>${esc(nameOf(b,e.payerId))}付款 · ${e.participantIds.length}人分摊 · ${esc(e.category)}</small></span><span class="expense-date">${shortDate(e.date)}</span><span class="amount">${amount(e.amount)}</span>${icon('chevron')}</button>`).join(''):'<div class="empty-mini">没有符合条件的记录</div>'}</div><div class="bottom-add">${btn('add-expense','记一笔消费','plus','full')}</div>`;
}
function settlementPage(b){
 const bal=balances(b),tx=transfers(b);
 return head('结算',`${esc(b.name)} · 每笔消费按所选成员均摊`)+
 `<div class="settle-grid">${b.members.map(m=>`<div class="settle-person">${avatar(b,m.id)}<div class="row-info"><strong>${esc(m.name)}</strong><small>垫付 ${amount(b.items.filter(e=>e.payerId===m.id).reduce((n,e)=>n+e.amount,0))}</small></div><div class="${bal[m.id]>0?'receive':'pay'}" style="text-align:right"><strong>${amount(Math.abs(bal[m.id]))}</strong><small style="display:block;margin-top:5px">${bal[m.id]>0?'应收':bal[m.id]<0?'应付':'已平衡'}</small></div></div>`).join('')}</div>
 <div class="section-head"><h2>转账方案</h2><small>${tx.length?`${tx.length} 笔转账结清`:'当前收支平衡'}</small></div><div class="panel">${tx.length?tx.map(t=>`<div class="transfer"><div class="transfer-path">${avatar(b,t.from)}<span>${esc(nameOf(b,t.from))}</span>${icon('arrow')}<span>${esc(nameOf(b,t.to))}</span></div><strong class="amount">${amount(t.amount)}</strong></div>`).join(''):'<div class="empty-mini">目前没有需要相互转账的金额。</div>'}</div><div class="settle-actions">${btn('copy-settlement','复制结算文本','copy','primary')}${btn('export-image','保存结算长图','image')}</div><p class="footnote">这是根据全部消费计算的转账建议，不记录实际转账状态。每笔分摊的余分按成员顺序分配。</p>`;
}
function membersPage(b){
 return head('成员',`${esc(b.name)} · ${b.members.length} 人`)+`<div class="panel">${b.members.map(m=>`<div class="member-row">${avatar(b,m.id)}<div class="row-info"><strong>${esc(m.name)}</strong><small>参与 ${b.items.filter(e=>e.participantIds.includes(m.id)).length} 笔消费</small></div><div class="member-amount"><strong>${amount(b.items.filter(e=>e.payerId===m.id).reduce((n,e)=>n+e.amount,0))}</strong><small>累计垫付</small></div>${iconButton('edit-member',`编辑${m.name}`,'edit',`data-id="${m.id}"`)}</div>`).join('')}</div><div class="bottom-add">${btn('add-member','添加成员','plus','full')}</div><p class="footnote">消费可分别选择分摊成员。添加新成员不会改变已有消费的分摊。</p>`;
}
function importPage(b){
 const d=draft();return head('导入',`${esc(b.name)} · 先核对，再记账`)+
 `<div class="panel import-panel"><div class="import-tools">${btn('pick-images','选择截图','image')}${btn('take-photo','拍一张','camera')}</div><div id="image-list" class="image-list">${imageRows(d)}</div><textarea id="raw-input" placeholder="粘贴消费记录，例如：2026-11-04 我：午饭 45" aria-label="粘贴消费文字" maxlength="100000">${esc(d.manual)}</textarea><div class="import-actions">${btn('parse','预览并核对','list','primary')}${btn('clear-import','清空输入','close')}</div><p class="footnote">截图在本机识别，首次需联网下载识别组件。不上传图片。日期或付款人不明确时，需要你补全。</p></div><section id="import-preview">${d.preview.length?previewRows(b,d):''}</section>`;
}
function imageRows(d){return d.images.map(img=>`<div class="image-entry"><div class="image-row"><img src="${img.url}" alt="待识别截图"><span class="row-info"><strong>${esc(img.name)}</strong><small>${esc(img.status)}</small></span>${img.error?iconButton('retry-image','重试识别','restore',`data-id="${img.id}"`):''}${iconButton('remove-image','移除这张图片','close',`data-id="${img.id}"`)}</div>${img.text?`<textarea class="ocr-text" data-image="${img.id}" aria-label="${esc(img.name)}的识别文字" style="min-height:90px;margin-top:8px">${esc(img.text)}</textarea>`:''}</div>`).join('');}
function updateImageList(d){if(page==='import'&&draft()===d){const el=document.querySelector('#image-list');if(el)el.innerHTML=imageRows(d);}}
function previewRows(b,d){return `<div class="section-head"><h2>待确认的消费</h2><small>${d.preview.length} 笔 · 全部成员均摊</small></div><div class="view-controls"><input type="date" class="control" id="batch-date" aria-label="给缺失日期的记录统一日期"><select class="control" id="batch-payer" aria-label="给缺失付款人的记录统一付款人"><option value="">补全付款人</option>${b.members.map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></div><p class="footnote" style="margin-bottom:12px">上方批量设置只填补空白。可在每一行继续修改金额、日期和付款人。</p><div class="panel"><div class="preview-top">逐行核对；缺失的内容必须补全。需要指定分摊成员时，请先入账，再编辑该笔。</div>${d.preview.map(e=>`<div class="preview-row" data-preview="${e.id}"><small>原文：${esc(e.source)}</small><div class="preview-fields"><input class="preview-title" data-field="title" aria-label="消费内容" value="${esc(e.title)}" maxlength="100"><input data-field="amount" inputmode="decimal" aria-label="金额" placeholder="填写金额" value="${e.amount===null?'':esc(e.amount/100)}"><input class="preview-date" data-field="date" type="date" aria-label="消费日期" value="${esc(e.date)}"><select class="preview-payer" data-field="payerId" aria-label="付款人"><option value="">选付款人</option>${b.members.map(m=>`<option value="${m.id}" ${m.id===e.payerId?'selected':''}>${esc(m.name)}</option>`).join('')}</select>${iconButton('remove-preview','移除这条记录','close',`data-id="${e.id}"`)}</div></div>`).join('')}</div><div class="bottom-add">${btn('confirm-import',`确认记入 ${d.preview.length} 笔`,'check','primary full')}</div>`;}

function bookForm(id){
 if(!guard())return;const base=id?allBooks().find(b=>b.id===id):null;
 formDialog(base?'重命名账本':'新建账本',`<label class="field"><span>账本名称</span><input name="name" aria-label="账本名称" maxlength="60" placeholder="例如：北京之旅" value="${esc(base?.name||'')}" required autofocus></label><div class="field"><span>封面颜色</span><div class="color-options">${['sand','peach','sage','lavender','brown'].map((c,i)=>`<label><input type="radio" name="color" value="${c}" ${(base?.color||'sand')===c?'checked':''} aria-label="${['奶油','浅杏','鼠尾草','淡紫','暖棕'][i]}"><span class="color-dot ${c}"></span></label>`).join('')}</div></div>`,async fd=>{
   const name=String(fd.get('name')).trim();if(!name)throw Error('给这本账起个名字吧');
   if(base){await change(base,n=>{n.name=name;n.color=fd.get('color');},'重命名账本');}
   else{const b=newBook(name,fd.get('color'));await store.create(b);await refresh();selectedId=b.id;page='details';announce();render();}
   toast(base?'账本名称已保存':'新账本建好了，记下第一笔吧');
 },base?'保存修改':'创建账本');
}
function expenseForm(id){
 if(!guard())return;const base=structuredClone(current());if(!base)return;const e=base.items.find(e=>e.id===id);
 formDialog(e?'编辑消费':'记一笔消费',`<label class="field"><span>金额（元）</span><input class="amount-input" inputmode="decimal" name="amount" aria-label="消费金额" placeholder="0.00" value="${e?e.amount/100:''}" required autofocus></label><label class="field"><span>花在了哪里</span><input name="title" aria-label="消费内容" maxlength="100" placeholder="例如：晚饭、打车、房租" value="${esc(e?.title||'')}" required></label><div class="form-row"><label class="field"><span>日期</span><input type="date" name="date" aria-label="消费日期" value="${e?.date||today()}" required></label><label class="field"><span>分类</span><select name="category" aria-label="消费分类">${['餐饮','交通','住宿','购物','门票','日常','其他'].map(c=>`<option ${e?.category===c?'selected':''}>${c}</option>`).join('')}</select></label></div><label class="field"><span>谁付的钱</span><select name="payerId" aria-label="付款人">${base.members.map(m=>`<option value="${m.id}" ${e?.payerId===m.id?'selected':''}>${esc(m.name)}</option>`).join('')}</select></label><div class="field"><span>哪些人分摊 · 均摊</span><div class="check-list">${base.members.map(m=>`<label class="check-chip"><input type="checkbox" name="participants" value="${m.id}" ${!e||e.participantIds.includes(m.id)?'checked':''}>${esc(m.name)}</label>`).join('')}</div></div>`,async fd=>{
   const title=String(fd.get('title')).trim(),date=fd.get('date'),participantIds=fd.getAll('participants');if(!title)throw Error('请填写消费内容');if(!validDate(date))throw Error('请选择有效的消费日期');if(!participantIds.length)throw Error('至少选择一位分摊成员');
   const item={id:e?.id||uid(),title,amount:cents(fd.get('amount')),date,category:fd.get('category'),payerId:fd.get('payerId'),participantIds};
   await change(base,n=>{if(e)n.items[n.items.findIndex(x=>x.id===e.id)]=item;else n.items.push(item);},e?'编辑消费':'新增消费');toast('这笔消费已保存');
 },'保存这笔',e?`<button type="button" class="text-button" style="color:#9b5743;margin-top:18px" data-action="delete-expense" data-id="${e.id}">删除这笔消费</button>`:'');
}
function memberForm(id){
 if(!guard())return;const base=structuredClone(current()),member=base.members.find(m=>m.id===id);
 formDialog(member?'编辑成员':'添加成员',`<label class="field"><span>成员名字</span><input name="name" aria-label="成员名字" value="${esc(member?.name||'')}" maxlength="30" placeholder="填写名字或昵称" required autofocus></label>`,async fd=>{
  const name=String(fd.get('name')).trim();if(!name)throw Error('请输入名字');if(base.members.some(m=>m.id!==id&&m.name===name))throw Error('已经有同名成员，换个昵称更好区分');
  await change(base,n=>{if(member)n.members.find(m=>m.id===id).name=name;else n.members.push({id:uid(),name});},member?'修改成员':'添加成员');toast('成员已保存');
 },'保存',member?`<button type="button" class="text-button" style="color:#9b5743;margin-top:18px" data-action="delete-member" data-id="${id}">移除这位成员</button>`:'');
}
function bookMenu(id){
 const b=allBooks().find(b=>b.id===id);openDialog(b.name,`<div class="menu-list"><button data-action="open-from-menu" data-id="${id}">${icon('book')}打开账本</button><button data-action="rename-book" data-id="${id}">${icon('edit')}重命名与封面</button><button data-action="history" data-id="${id}">${icon('history')}历史版本</button><button class="danger" data-action="delete-book" data-id="${id}">${icon('trash')}移入回收站</button></div>`);
}
async function showHistory(id){
 if(demo){toast('示例没有历史版本。真实账本每次修改前会自动留存。');return;}
 const b=books.find(b=>b.id===id);if(!b)return;
 const histories=await store.history(id);
 openDialog(`${b.name} · 历史版本`,histories.length?`<p class="form-hint">恢复会先保留当前版本，再把所选内容恢复成新版本。</p>${histories.map(h=>`<div class="history-row"><span class="row-info"><strong>${esc(h.label)}前</strong><small>${timeLabel(h.time)} · ${h.book.items.length} 笔 · ${amount(total(h.book))}</small></span>${btn('restore-version','恢复','','',`data-id="${h.id}" data-book="${id}"`)}</div>`).join('')}`:'<p class="modal-empty">还没有历史版本。修改消费、成员或账本时，会自动留一版。</p>');
}
async function showTrash(){
 const deleted=allBooks().filter(b=>b.deletedAt);
 openDialog('回收站',deleted.length?`<p class="form-hint">删除的账本保留在这里，不会自动清除。</p>${deleted.map(b=>`<div class="history-row"><span class="row-info"><strong>${esc(b.name)}</strong><small>${b.items.length} 笔消费 · ${amount(total(b))}</small></span>${btn('restore-book','恢复','','',`data-id="${b.id}"`)}</div>`).join('')}`:'<p class="modal-empty">这里是空的。删除账本后，可以从这里找回来。</p>');
}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
async function exportBackup(){
 if(!guard())return;const latest=await store.list();if(!latest.length){toast('还没有可导出的账本');return;}
 const json=JSON.stringify({format:'yiben-backup',version:1,exportedAt:new Date().toISOString(),books:latest},null,2),blob=new Blob([json],{type:'application/json'}),url=URL.createObjectURL(blob);
 openDialog('备份已准备好',`<p class="form-hint">包含 ${latest.length} 本账、${latest.reduce((n,b)=>n+b.items.length,0)} 笔消费，包括回收站中的账本。请点下方按钮保存 .json 文件。</p><div class="modal-actions"><a class="btn primary" data-action="backup-downloaded" href="${url}" download="一本备份-${today()}.json">${icon('download')}保存备份文件</a></div><p class="footnote">备份包含账本当前内容，不包含本机历史版本。保存后可放到微信收藏或网盘。</p><details class="footnote" style="margin-top:18px"><summary>无法下载？复制备份文本</summary><textarea readonly id="backup-json" aria-label="备份文本" style="width:100%;min-height:150px;margin-top:12px;padding:10px;border:1px solid var(--line);border-radius:10px">${esc(json)}</textarea>${btn('copy-backup','复制备份文本','copy')}</details>`);
 dialog.addEventListener('close',()=>URL.revokeObjectURL(url),{once:true});
}
function pickFile({accept,multiple=false,capture},onFiles){const input=document.createElement('input');input.type='file';input.accept=accept;input.multiple=multiple;if(capture)input.setAttribute('capture',capture);input.hidden=true;document.body.append(input);input.onchange=async()=>{try{await onFiles([...input.files]);}catch(e){toast(e.message,true);}finally{input.remove();}};input.oncancel=()=>input.remove();input.click();}
function importBackup(){
 if(!guard())return;pickFile({accept:'.json,application/json'},async files=>{
  const file=files[0];if(!file)return;if(file.size>20*1024*1024)throw Error('备份文件超过 20MB，请检查是否选对了文件');let data;try{data=JSON.parse(await file.text());}catch{throw Error('文件不是有效的 JSON 备份');}const incoming=validateBackup(data);
  confirmDialog('恢复备份',`文件包含 ${incoming.length} 本账。同一本账内容不同时，会创建「备份副本」；现有账本不会被覆盖。`,async()=>{const result=await store.import(data);await refresh();announce();page='books';render();toast(`已恢复 ${result.added} 本，跳过 ${result.skipped} 本相同账本`);},'合并恢复');
 });
}
let ocrScript,workerPromise;
async function getWorker(){
 if(!ocrScript)ocrScript=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';script.onload=resolve;script.onerror=()=>{ocrScript=null;script.remove();reject(Error('识别组件下载失败，请联网后重试'));};document.head.append(script);});
 await ocrScript;
 if(!workerPromise)workerPromise=window.Tesseract.createWorker('chi_sim+eng',1).catch(e=>{workerPromise=null;throw Error('识别语言包加载失败，请检查网络后重试');});
 return workerPromise;
}
let ocrQueue=Promise.resolve();
async function recognize(img,d){
 img.status='正在加载本机识别组件…';img.error=false;updateImageList(d);
 try{const worker=await getWorker();if(!d.images.includes(img))return;img.status='正在识别，请稍候…';updateImageList(d);const result=await worker.recognize(img.file);if(!d.images.includes(img))return;img.text=result.data.text.trim();img.status=img.text?'识别完成 · 请核对下方文字':'未识别出文字，请换一张清晰的图片';img.error=!img.text;}
 catch(e){if(!d.images.includes(img))return;img.status=e.message;img.error=true;}updateImageList(d);
}
function pickImages(camera=false){
 if(!guard())return;const d=draft();pickFile({accept:'image/*',multiple:!camera,capture:camera?'environment':undefined},async files=>{
   for(const file of files){if(!file.type.startsWith('image/')){toast('请选择图片文件',true);continue;}if(file.size>15*1024*1024){toast('单张图片请小于 15MB',true);continue;}if(d.images.length>=10){toast('一次最多识别 10 张图片',true);break;}
    const img={id:uid(),file,name:file.name,url:URL.createObjectURL(file),text:'',status:'等待识别',error:false};d.images.push(img);ocrQueue=ocrQueue.then(()=>recognize(img,d));
   }updateImageList(d);
 });
}
function settlementText(b){return `${b.name}\n总支出 ${amount(total(b))} · ${b.members.length} 人 · ${b.items.length} 笔\n\n${transfers(b).map(t=>`${nameOf(b,t.from)} → ${nameOf(b,t.to)}：${amount(t.amount)}`).join('\n')||'当前收支平衡'}\n\n由「一本」生成 · 按消费所选成员均摊`;}
async function copySettlement(){const text=settlementText(current());try{await navigator.clipboard.writeText(text);toast('结算文本已复制');}catch{openDialog('复制结算文本',`<textarea readonly aria-label="结算文本" style="width:100%;min-height:220px;line-height:1.8;padding:12px">${esc(text)}</textarea><p class="form-hint">长按或全选文字后复制。</p>`);}}
function exportImage(){
 const b=current(),tx=transfers(b),canvas=document.createElement('canvas');canvas.width=750;canvas.height=440+tx.length*98+b.members.length*72;const c=canvas.getContext('2d');
 c.fillStyle='#f7f3eb';c.fillRect(0,0,canvas.width,canvas.height);c.fillStyle='#805d43';c.font='600 24px sans-serif';c.fillText('一本 · 结算清单',48,64);c.fillStyle='#392e25';c.font='600 36px sans-serif';c.fillText(b.name,48,125,654);c.font='18px sans-serif';c.fillStyle='#88735f';c.fillText(`${b.members.length} 人 · ${b.items.length} 笔消费`,48,167);c.font='48px Georgia';c.fillStyle='#392e25';c.fillText(amount(total(b)),48,236);c.font='18px sans-serif';c.fillStyle='#88735f';c.fillText('总支出',48,270);
 let y=320;const bal=balances(b);for(const m of b.members){c.fillStyle='#fff';c.beginPath();c.roundRect(35,y-24,680,60,15);c.fill();c.font='22px sans-serif';c.fillStyle='#392e25';c.fillText(m.name,55,y+13,320);c.textAlign='right';c.fillStyle='#805d43';c.fillText(`${bal[m.id]>0?'应收':bal[m.id]<0?'应付':'平衡'} ${amount(Math.abs(bal[m.id]))}`,690,y+13);c.textAlign='left';y+=72;}
 y+=32;c.font='600 23px sans-serif';c.fillStyle='#392e25';c.fillText(tx.length?'转账方案':'当前收支平衡',48,y);y+=38;for(const t of tx){c.fillStyle='#fff';c.beginPath();c.roundRect(35,y-12,680,78,16);c.fill();c.fillStyle='#392e25';c.font='21px sans-serif';c.fillText(`${nameOf(b,t.from)} → ${nameOf(b,t.to)}`,55,y+32,430);c.textAlign='right';c.fillText(amount(t.amount),690,y+32);c.textAlign='left';y+=98;}
 c.font='15px sans-serif';c.fillStyle='#88735f';c.fillText('仅为结算建议 · 请核对后转账 · 一本',48,canvas.height-28);
 openDialog('保存结算长图',`<img id="settlement-image" alt="${esc(b.name)}结算长图" style="width:100%;border-radius:13px" src="${canvas.toDataURL('image/png')}"><p class="form-hint" style="margin-top:13px">iPhone 可长按图片存储到照片。</p><div class="modal-actions">${btn('download-settlement-image','下载图片','download','primary')}</div>`,true);
}

app.addEventListener('click',handleClick);dialog.addEventListener('click',handleClick);
async function handleClick(event){
 const nav=event.target.closest('[data-page]');if(nav){page=nav.dataset.page;search='';payerFilter='';dateFilter='';render();window.scrollTo(0,0);return;}
 const target=event.target.closest('[data-action]');if(!target)return;const a=target.dataset.action,id=target.dataset.id;
 try{
 if(a==='close-dialog'){dialog.close();return;}
 if(a==='new-book')return bookForm();if(a==='rename-book')return bookForm(id);
 if(a==='demo'){demoData=demoBooks();demo=true;selectedId=demoData[0].id;page='books';render();window.scrollTo(0,0);return;}
 if(a==='exit-demo'){demo=false;selectedId=books.find(b=>!b.deletedAt)?.id||'';page='books';render();window.scrollTo(0,0);return;}
 if(a==='open-book'||a==='open-from-menu'||a==='recent'){selectedId=id;page='details';search='';payerFilter='';dateFilter='';dialog.close();render();window.scrollTo(0,0);if(a==='recent')expenseForm(target.dataset.item);return;}
 if(a==='book-menu')return bookMenu(id);
 if(a==='add-expense')return expenseForm();if(a==='edit-expense')return expenseForm(id);
 if(a==='add-member')return memberForm();if(a==='edit-member')return memberForm(id);
 if(a==='delete-expense'){
   if(!guard())return;const base=structuredClone(current());confirmDialog('删除这笔消费？','删除前会留下历史版本，需要时可以恢复整本账。',async()=>{await change(base,n=>n.items=n.items.filter(e=>e.id!==id),'删除消费');toast('消费已删除，可从历史版本恢复');},'删除消费');return;
 }
 if(a==='delete-member'){
  if(!guard())return;const base=structuredClone(current());if(base.members.length<=1){toast('账本至少需要保留一位成员',true);return;}if(base.items.some(e=>e.payerId===id||e.participantIds.includes(id))){toast('这位成员关联已有消费。请先调整这些消费的付款人和分摊成员，再移除。',true);return;}
  confirmDialog('移除成员？','这位成员没有关联消费，可以安全移除。',async()=>{await change(base,n=>n.members=n.members.filter(m=>m.id!==id),'移除成员');toast('成员已移除');},'移除成员');return;
 }
 if(a==='delete-book'){
  if(!guard())return;const base=structuredClone(books.find(b=>b.id===id));confirmDialog('移入回收站？',`「${base.name}」的 ${base.items.length} 笔消费会完整保留，可随时从回收站恢复。`,async()=>{await change(base,n=>n.deletedAt=new Date().toISOString(),'删除账本');toast('账本已移入回收站');},'移入回收站');return;
 }
 if(a==='trash')return showTrash();
 if(a==='restore-book'){if(!guard())return;const base=structuredClone(books.find(b=>b.id===id));await change(base,n=>n.deletedAt=null,'恢复账本');await showTrash();toast('账本已恢复');return;}
 if(a==='history')return showHistory(id);
 if(a==='all-history'){const list=active();openDialog('选择账本查看历史',list.length?`<div class="menu-list">${list.map(b=>`<button data-action="history" data-id="${b.id}">${icon('history')}${esc(b.name)}</button>`).join('')}</div>`:'<p class="modal-empty">新建账本后，修改时会自动留下历史版本。</p>');return;}
 if(a==='restore-version'){
  if(!guard())return;const bookId=target.dataset.book,base=structuredClone(books.find(b=>b.id===bookId)),h=(await store.history(bookId)).find(h=>h.id===id);if(!h)throw Error('该版本已不在保留范围内');
  confirmDialog('恢复到这个版本？',`${timeLabel(h.time)}的「${h.book.name}」共有 ${h.book.items.length} 笔。当前版本会先自动备份到历史版本中。`,async()=>{await change(base,n=>{n.name=h.book.name;n.color=h.book.color;n.items=structuredClone(h.book.items);n.members=structuredClone(h.book.members);n.deletedAt=null;},'恢复历史');toast('已恢复，恢复前的内容仍在历史版本中');},'恢复这个版本');return;
 }
 if(a==='export')return await exportBackup();if(a==='import-backup')return importBackup();
 if(a==='backup-downloaded'){lastBackup=timeLabel(new Date().toISOString());toast('已发起备份下载，请确认文件已保存');return;}
 if(a==='copy-backup'){const input=dialog.querySelector('#backup-json');try{await navigator.clipboard.writeText(input.value);toast('备份文本已复制，请另存为 .json 文件');}catch{input.focus();input.select();toast('请复制选中的完整文本，另存为 .json 文件');}return;}
 if(a==='clear-filters'){search='';payerFilter='';dateFilter='';render();return;}
 if(a==='pick-images'||a==='take-photo')return pickImages(a==='take-photo');
 if(a==='retry-image'){const d=draft(),img=d.images.find(i=>i.id===id);ocrQueue=ocrQueue.then(()=>recognize(img,d));return;}
 if(a==='remove-image'){const d=draft(),img=d.images.find(i=>i.id===id);URL.revokeObjectURL(img.url);d.images=d.images.filter(i=>i.id!==id);d.preview=[];render();toast('已移除图片及其识别文字');return;}
 if(a==='clear-import'){const d=draft();if(!d.manual&&!d.images.length&&!d.preview.length){toast('输入已经是空的');return;}confirmDialog('清空输入？','只清除当前账本的粘贴文字、截图和待确认记录，已记账消费不会改变。',async()=>{for(const img of d.images)URL.revokeObjectURL(img.url);d.manual='';d.images=[];d.preview=[];render();toast('输入已清空，已记账数据保持不变');},'清空输入');return;}
 if(a==='parse'){
  if(!guard())return;const d=draft();if(d.images.some(i=>i.status.includes('正在')||i.status.includes('等待'))){toast('图片仍在识别，请稍候再预览');return;}const text=[d.manual,...d.images.map(i=>i.text)].filter(Boolean).join('\n');if(!text.trim()){toast('先粘贴文字或选择截图');return;}const rows=parseLines(text,current().members);if(rows.length>500)throw Error('一次最多导入 500 行，请分批核对');d.preview=rows;render();toast('请核对每笔的金额、日期和付款人');return;
 }
 if(a==='remove-preview'){const d=draft();d.preview=d.preview.filter(e=>e.id!==id);render();return;}
 if(a==='confirm-import'){
  if(busy||!guard())return;const d=draft(),base=structuredClone(current());if(!d.preview.length)return;
  const items=d.preview.map((e,i)=>{if(!e.title.trim()||e.amount===null||!validDate(e.date)||!base.members.some(m=>m.id===e.payerId))throw Error(`第 ${i+1} 笔还缺少内容、金额、日期或付款人，请补全`);return {id:e.id,title:e.title.trim(),amount:e.amount,date:e.date,payerId:e.payerId,category:e.category,participantIds:base.members.map(m=>m.id)};});
  confirmDialog('确认记入账本？',`将 ${items.length} 笔消费加入「${base.name}」，每笔由当前 ${base.members.length} 位成员均摊。原有消费会保留。`,async()=>{busy=true;try{await change(base,n=>n.items.push(...items),'导入消费');for(const img of d.images)URL.revokeObjectURL(img.url);d.images=[];d.manual='';d.preview=[];page='details';render();toast(`已保存 ${items.length} 笔消费`);}finally{busy=false;}},'确认记入');return;
 }
 if(a==='copy-settlement')return await copySettlement();if(a==='export-image')return exportImage();
 if(a==='download-settlement-image'){const image=dialog.querySelector('#settlement-image');const blob=await (await fetch(image.src)).blob();download(blob,`${current().name.replace(/[\\/:*?"<>|]/g,'_')}-结算.png`);toast('已发起图片下载');return;}
 }catch(e){toast(e.message||'操作未完成，请重试',true);}
}
app.addEventListener('input',event=>{
 const el=event.target;
 if(el.id==='raw-input'){draft().manual=el.value;draft().preview=[];document.querySelector('#import-preview').innerHTML='';}
 if(el.dataset.image){const d=draft(),img=d.images.find(i=>i.id===el.dataset.image);if(img)img.text=el.value;d.preview=[];document.querySelector('#import-preview').innerHTML='';}
 if(el.id==='expense-search'){const start=el.selectionStart;search=el.value;render();const input=document.querySelector('#expense-search');input.focus();input.setSelectionRange(start,start);}
 const row=el.closest('[data-preview]');if(row&&el.dataset.field){const e=draft().preview.find(e=>e.id===row.dataset.preview),f=el.dataset.field;if(f==='amount'){try{e.amount=cents(el.value);}catch{e.amount=null;}}else e[f]=el.value;}
});
app.addEventListener('change',event=>{
 const el=event.target;
 if(el.id==='book-switch'){selectedId=el.value;search='';payerFilter='';dateFilter='';render();}
 if(el.id==='payer-filter'){payerFilter=el.value;render();}
 if(el.id==='date-filter'){dateFilter=el.value;render();}
 if(el.id==='batch-date'){const date=el.value;if(validDate(date)){for(const e of draft().preview)if(!e.date)e.date=date;render();}}
 if(el.id==='batch-payer'){for(const e of draft().preview)if(!e.payerId)e.payerId=el.value;render();}
});
dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
window.addEventListener('online',render);window.addEventListener('offline',render);
try{
 store=await openStore();await refresh();
 if(new URLSearchParams(location.search).get('preview')==='1'){demoData=demoBooks();demo=true;selectedId=demoData[0].id;}
 render();
 try{updateChannel=new BroadcastChannel('yiben-updates');updateChannel.onmessage=async()=>{if(demo)return;try{await refresh();if(!dialog.open&&document.activeElement?.tagName!=='INPUT'&&document.activeElement?.tagName!=='TEXTAREA')render();toast('另一个窗口更新了账本，已载入最新数据');}catch(e){toast(e.message,true);}};}catch{}
 window.addEventListener('focus',async()=>{if(!demo&&!dialog.open&&document.activeElement?.tagName!=='INPUT'&&document.activeElement?.tagName!=='TEXTAREA'){try{await refresh();render();}catch(e){toast(e.message,true);}}});
 if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>toast('离线组件暂未就绪，当前记账不受影响'));
 if(navigator.storage?.persist)navigator.storage.persist().catch(()=>{});
}catch(e){app.innerHTML=`<main class="empty" style="max-width:620px;margin:10vh auto"><h1>本机存储暂时无法打开</h1><p>${esc(e.message)}。请检查浏览器是否允许网站存储，关闭隐私模式后重新打开。已有账本不会被初始化或清空。</p><button class="btn primary" onclick="location.reload()">重新打开</button></main>`;}
