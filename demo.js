import {newBook,uid} from './domain.js';
export function demoBooks(){
 const travel=newBook('北京，一起出发','peach'),life=newBook('日常的小日子','sage'),weekend=newBook('周末露营计划','lavender');
 travel.members=['我','李婷','王小明','张伟'].map(name=>({id:uid(),name}));
 const ids=travel.members.map(x=>x.id);
 travel.items=[['故宫门票',240,0,'门票','2026-10-05'],['胡同里的晚餐',468,1,'餐饮','2026-10-05'],['一起回酒店',88,2,'交通','2026-10-05'],['出发前的咖啡',96,3,'餐饮','2026-10-04'],['两晚的民宿',1280,2,'住宿','2026-10-04'],['颐和园门票',120,0,'门票','2026-10-04'],['机场到市区',156,1,'交通','2026-10-03']].map(([title,a,payer,category,date])=>({id:uid(),title,amount:a*100,payerId:ids[payer],participantIds:ids,date,category}));
 life.items=[['一周的蔬菜',8690,'购物'],['周三的午饭',3200,'餐饮'],['地铁通勤',700,'交通']].map(([title,amount,category])=>({id:uid(),title,amount,category,payerId:life.members[0].id,participantIds:[life.members[0].id],date:'2026-11-03'}));
 weekend.members.push({id:uid(),name:'小夏'});weekend.items=[{id:uid(),title:'营地预约',amount:26800,category:'住宿',payerId:weekend.members[0].id,participantIds:weekend.members.map(x=>x.id),date:'2026-11-01'}];
 return [travel,life,weekend];
}
