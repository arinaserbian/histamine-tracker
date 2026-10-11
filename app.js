/* Гистамин-трекер. Схема лечения (план) хранится в Supabase и видна только после входа. */
(function(){
'use strict';
const CFG=window.APP_CONFIG||{};

/* ---------- даты ---------- */
const pad=n=>String(n).padStart(2,'0');
const ds=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const parse=s=>{const[y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)};
const addDays=(s,n)=>{const d=parse(s);d.setDate(d.getDate()+n);return ds(d)};
const diff=(a,b)=>Math.round((parse(b)-parse(a))/864e5);
const todayStr=()=>ds(new Date());
const WD=['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
const MON=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const MONS=['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
const fmtDay=s=>{const d=parse(s);return WD[d.getDay()]+', '+d.getDate()+' '+MON[d.getMonth()]};
const fmtDate=s=>{const d=parse(s);return d.getDate()+' '+MON[d.getMonth()]};
const fmtShort=s=>{const d=parse(s);return d.getDate()+' '+MONS[d.getMonth()]};
function plural(n,a,b,c){const m=n%10,h=n%100;if(m===1&&h!==11)return a;if(m>=2&&m<=4&&(h<12||h>14))return b;return c}

/* ---------- таблетки ---------- */
const ST='#8A8A93';
const cap=(l,r,extra='',sc=1)=>`<svg viewBox="0 0 24 24" aria-hidden="true"><g transform="rotate(-45 12 12) translate(12 12) scale(${sc}) translate(-12 -12)"><path d="M7 8h5v8H7a4 4 0 0 1 0-8z" fill="${l}" stroke="${ST}" stroke-width=".9"/><path d="M12 8h5a4 4 0 0 1 0 8h-5z" fill="${r}" stroke="${ST}" stroke-width=".9"/>${extra}</g></svg>`;
const PILL={
 dao:cap('#F5C842','#E8B52A'),
 miro:cap('#FFFFFF','#FFFFFF','',.72),
 enz:`<svg viewBox="0 0 24 24" aria-hidden="true"><g transform="rotate(-35 12 12)"><path d="M2.5 12C6 6.5 18 6.5 21.5 12C18 17.5 6 17.5 2.5 12Z" fill="#fff" stroke="${ST}" stroke-width=".9"/><path d="M6 12H18" stroke="#C3C0B6" stroke-width=".8"/></g></svg>`,
 bact:cap('#FFFFFF','#3E6FE0'),
 tudca:cap('#FFFFFF','#FFFFFF',`<rect x="10.6" y="7.3" width="2.8" height="9.4" rx="1" fill="#fff" stroke="${ST}" stroke-width=".9"/>`),
 urso:cap('#FFFFFF','#FFFFFF'),
 white:cap('#FFFFFF','#FFFFFF'),
 poly:`<svg viewBox="0 0 24 24" aria-hidden="true"><g transform="rotate(-45 12 12)"><path d="M4 9h9c3.5 0 6.5 1.5 7.5 3-1 1.5-4 3-7.5 3H4z" fill="#fff" stroke="${ST}" stroke-width=".9"/></g></svg>`,
 isla:`<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.5" fill="#7FCB9B" stroke="#4E9A6A" stroke-width=".9"/><circle cx="12" cy="12" r="4.5" fill="none" stroke="#B9E4C8" stroke-width=".8"/></svg>`,
 water:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5C9 8 6.5 11 6.5 14.2a5.5 5.5 0 0 0 11 0C17.5 11 15 8 12 3.5Z" fill="#9CD3F2" stroke="#4BA3D6" stroke-width=".9"/></svg>`
};
const pill=k=>`<span class="pill">${PILL[k]||PILL.white}</span>`;
const TICK='<svg viewBox="0 0 24 24" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 12.5l4 4 8-9"/></svg>';

/* ---------- продукты ---------- */
const slug=s=>s.toLowerCase().replace(/[^a-zа-яё0-9]+/gi,'-').replace(/^-|-$/g,'');
/* База продуктов хранится в плане (в закрытой базе), не в публичном коде. */
let FOODS=[],CATS=[],FOODS_SRC=null;
function buildFoods(){const raw=(S.plan&&S.plan.foods)||[];if(raw===FOODS_SRC)return;FOODS_SRC=raw;
  FOODS=raw.map(([name,cat,score,fl,note])=>({id:'f-'+slug(name),name,cat,score,lib:(fl||'').includes('L'),blk:(fl||'').includes('B'),note:note||''}));
  CATS=[...new Set(FOODS.map(f=>f.cat))]}
const DAIRY_WORDS=['молок','сыр','творог','йогурт','кефир','сметан','сливк','ряженк','молочн'];

/* ---------- состояние ---------- */
const S={sb:null,user:null,plan:null,days:{},settings:{islaStart:null,custom:[]},route:'today',diaryDate:todayStr(),q:'',pq:'',pf:'all',login:{step:'email',email:'',busy:false,err:''},dirty:{days:{},settings:false},offline:false,openCats:{}};
try{S.openCats=JSON.parse(localStorage.getItem('ht-open-cats')||'{}')||{}}catch(e){}
const CACHE_KEY='ht-cache-v1';
const loadCache=()=>{try{return JSON.parse(localStorage.getItem(CACHE_KEY)||'null')}catch(e){return null}};
const saveCache=()=>{try{localStorage.setItem(CACHE_KEY,JSON.stringify({uid:S.user&&S.user.id,plan:S.plan,days:S.days,settings:S.settings,dirty:S.dirty}))}catch(e){}};
const day=d=>S.days[d]||(S.days[d]={checks:{},foods:[]});
const allFoods=()=>FOODS.concat(S.settings.custom||[]);
const foodById=id=>allFoods().find(f=>f.id===id);

/* ---------- синхронизация ---------- */
let flushing=false;
async function flush(){
  if(flushing||!S.sb||!S.user)return;flushing=true;
  try{
    for(const d of Object.keys(S.dirty.days)){
      const {error}=await S.sb.from('days').upsert({user_id:S.user.id,date:d,data:S.days[d],updated_at:new Date().toISOString()});
      if(error)throw error;delete S.dirty.days[d];
    }
    if(S.dirty.settings){const {error}=await S.sb.from('settings').upsert({user_id:S.user.id,data:S.settings});if(error)throw error;S.dirty.settings=false}
    S.offline=false;
  }catch(e){S.offline=true}
  flushing=false;saveCache();
  if(S.offline)setTimeout(flush,15000);
}
function saveDay(d){S.dirty.days[d]=true;saveCache();flush()}
function saveSettings(){S.dirty.settings=true;saveCache();flush()}
async function pull(){
  if(!S.sb||!S.user)return;
  try{
    const [p,dd,st]=await Promise.all([
      S.sb.from('plans').select('data').maybeSingle(),
      S.sb.from('days').select('date,data'),
      S.sb.from('settings').select('data').maybeSingle()]);
    if(p.error||dd.error||st.error)throw (p.error||dd.error||st.error);
    S.plan=p.data?p.data.data:null;
    const days={};for(const r of dd.data||[])days[r.date]={checks:(r.data&&r.data.checks)||{},foods:(r.data&&r.data.foods)||[]};
    for(const d of Object.keys(S.dirty.days))if(S.days[d])days[d]=S.days[d];
    S.days=days;
    if(!S.dirty.settings&&st.data)S.settings=Object.assign({islaStart:null,custom:[]},st.data.data||{});
    S.offline=false;saveCache();
  }catch(e){S.offline=true}
  render(true);flush();
}

/* ---------- план ---------- */
const P=()=>S.plan;
function polyDates(it){const p=P();return Array.from({length:it.count},(_,i)=>addDays(it.from||p.start,i*it.every))}
function activeOn(it,d){const p=P();if(d<(it.from||p.start)||d>(it.to||p.end))return false;if(it.every)return polyDates(it).includes(d);return true}
const dairyBanned=d=>!!(P()&&P().dairyUntil&&d<=P().dairyUntil);

/* ---------- ui ---------- */
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let toastT;function toast(m){const t=document.getElementById('toast');t.textContent=m;t.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('show'),1800)}
const score=n=>`<span class="score s${n}">${n}</span>`;
const LIB='<span class="badge lib">Л</span>';
const PLUS='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
const SEARCH_IC='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6"/><path d="M15.5 15.5L20 20"/></svg>';
const CHEV='<svg class="chev" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 3l3 3-3 3"/></svg>';
const foodSub=f=>[f.blk?'блокирует DAO':'',f.note||''].filter(Boolean).join(' · ');
const banBadge=()=>`<span class="badge ban">до ${fmtDate(P().dairyUntil)}</span>`;

function viewLogin(){
  const L=S.login;
  if(!CFG.supabaseUrl||!CFG.supabaseKey)return `<div class="login"><h1>Гистамин-трекер</h1><p>Приложение ещё не подключено к базе. Нужно заполнить config.js.</p></div>`;
  const su=L.step==='signup';
  let h=`<div class="login"><img src="icons/icon-192.png" alt="" width="72" height="72"><h1>Гистамин-трекер</h1>
  <p>${su?'Придумай пароль — дальше входишь по почте и паролю на любом устройстве.':'Вход нужен один раз на каждом устройстве.'}</p>
  <form id="f-auth"><label class="input"><input id="login-email" type="email" inputmode="email" autocomplete="email" placeholder="Почта" required value="${esc(L.email)}"></label>
  <label class="input"><input id="login-pass" type="password" autocomplete="${su?'new-password':'current-password'}" placeholder="${su?'Пароль, от 8 символов':'Пароль'}" minlength="${su?8:1}" required></label>
  <button class="btn primary wide" ${L.busy?'disabled':''}>${L.busy?'Секунду…':su?'Создать аккаунт':'Войти'}</button></form>
  ${su?'<button class="link" data-act="login-mode">Уже есть аккаунт — войти</button>':''}`;
  if(L.err)h+=`<p class="err">${esc(L.err)}</p>`;
  return h+`</div>`;
}
function viewNoPlan(){return `<div class="head"><h1>Нет схемы</h1></div><div class="finished">Ты вошла как ${esc(S.user.email)}, но схема лечения для этой почты не найдена. Её нужно добавить в базе Supabase (файл seed.sql).</div><div class="foot"><button class="link" data-act="logout">Выйти</button></div>`}

function viewToday(){
  const p=P();const t=todayStr();const pre=t<p.start;const d=pre?p.start:t;const done=day(d).checks;const ro=pre;
  let h=`<div class="head"><span class="over">${pre?'Завтра, ':''}${fmtDay(d)}</span><h1>Сегодня</h1>`;
  if(d>p.end){h+=`</div><div class="finished">Курс закончился ${fmtDate(p.end)}. Если врач назначит новую схему, её можно будет добавить.</div>`;return h+asNeeded(d,ro)}
  const act=p.items.filter(i=>activeOn(i,d));const n=act.filter(i=>done[i.id]).length;
  h+=`<div class="progress"><div class="row"><span>День ${diff(p.start,d)+1} из ${p.courseDays}</span><span>${n} из ${act.length}</span></div><div class="bar"><i style="width:${act.length?n/act.length*100:0}%"></i></div></div></div>`;
  if(pre)h+=`<div class="note">Курс начинается ${diff(t,p.start)===1?'завтра':fmtDate(p.start)}. Отмечать приём можно будет с утра.</div>`;
  if(S.offline)h+=`<div class="note">Нет связи — отметки сохранятся, когда интернет вернётся.</div>`;
  for(const[slot,label]of p.slots){
    const its=act.filter(i=>i.slot===slot);
    const sched=p.items.filter(i=>i.slot===slot&&i.every);
    if(!its.length){
      if(sched.length&&d<=p.end){const nx=sched.map(i=>polyDates(i).find(x=>x>d)).filter(Boolean).sort()[0];if(nx)h+=`<div class="sec"><span>${label}</span><span></span></div><div class="empty-line">${esc(sched[0].name)} сегодня не нужен · следующий ${fmtShort(nx)}</div>`}
      continue;
    }
    h+=`<div class="sec"><span>${label}</span><span>${its.filter(i=>done[i.id]).length}/${its.length}</span></div>`;
    for(const it of its){
      let sub=it.dose||'';
      if(it.every){const ds_=polyDates(it);const k=ds_.indexOf(d)+1;const nx=ds_[k];sub=(it.dose?it.dose+' · ':'')+`${k} из ${it.count}`+(nx?` · следующий ${fmtShort(nx)}`:' · последний')}
      h+=`<button class="row-item${done[it.id]?' done':''}" data-act="tick" data-id="${esc(it.id)}" data-d="${d}" ${ro?'disabled':''} aria-pressed="${!!done[it.id]}"><span class="check">${TICK}</span>${pill(it.pill)}<span class="txt"><span class="t">${esc(it.name)}</span>${sub?`<span class="s">${esc(sub)}</span>`:''}</span></button>`;
    }
  }
  return h+asNeeded(d,ro);
}
function asNeeded(d,ro){
  const p=P();const done=day(d).checks;let h=`<div class="sec"><span>По необходимости</span><span></span></div>`;
  for(const it of p.asNeeded||[]){
    if(it.from&&d<it.from)continue;if(it.to&&d>it.to)continue;
    h+=`<button class="row-item${done[it.id]?' done':''}" data-act="tick" data-id="${esc(it.id)}" data-d="${d}" ${ro?'disabled':''}><span class="check">${TICK}</span>${pill(it.pill)}<span class="txt"><span class="t">${esc(it.name)}</span><span class="s">${esc(it.dose||'')}</span></span></button>`;
  }
  const isla=p.isla;if(!isla)return h;
  const is=S.settings.islaStart;const active=is&&d>=is&&diff(is,d)<isla.days;
  if(active){
    const k=diff(is,d)+1;let mini='';for(let i=1;i<=isla.perDay;i++){const on=done['isla-'+i];mini+=`<button class="check${on?' on':''}" data-act="tick" data-id="isla-${i}" data-d="${d}" aria-label="Пастилка ${i}" aria-pressed="${!!on}" ${ro?'disabled':''}>${TICK}</button>`}
    h+=`<div class="row-item static">${pill('isla')}<span class="txt"><span class="t">${esc(isla.name)}</span><span class="s">День ${k} из ${isla.days} · до ${isla.perDay} пастилок <button class="link" data-act="isla-stop">закончить</button></span></span><span class="mini">${mini}</span></div>`;
  } else {
    h+=`<div class="row-item static last">${pill('isla')}<span class="txt"><span class="t">${esc(isla.name)}</span><span class="s">${esc(isla.hint)}</span></span><button class="btn" data-act="isla-start" ${ro?'disabled':''}>Начать</button></div>`;
  }
  return h;
}
function sums(d){const fs=day(d).foods.map(x=>foodById(x.f)).filter(Boolean);return{fs,pts:fs.reduce((a,f)=>a+f.score,0),lib:fs.filter(f=>f.lib).length}}
function frequent(){const c={};const t=todayStr();for(const[d,v]of Object.entries(S.days)){if(diff(d,t)>21)continue;for(const x of v.foods||[])c[x.f]=(c[x.f]||0)+1}
  return Object.entries(c).sort((a,b)=>b[1]-a[1]).map(([id])=>foodById(id)).filter(f=>f&&!(f.cat==='Молочное'&&dairyBanned(S.diaryDate))).slice(0,6)}
const isDairyQuery=q=>DAIRY_WORDS.some(w=>q.includes(w)||w.startsWith(q));
function matchFoods(q,d){q=q.trim().toLowerCase();if(!q)return[];const ban=dairyBanned(d);
  let res=allFoods().filter(f=>f.name.toLowerCase().includes(q)&&!(ban&&f.cat==='Молочное'));
  if(ban&&isDairyQuery(q))res=[{ban:true}].concat(res);
  return res.slice(0,8)}
function viewDiary(){
  const d=S.diaryDate;const t=todayStr();const{fs,pts,lib}=sums(d);
  let h=`<div class="head"><h1>Дневник</h1><div class="datesw"><button data-act="dprev" aria-label="Предыдущий день">‹</button><b>${d===t?'Сегодня, ':''}${fmtDay(d)}</b><button data-act="dnext" aria-label="Следующий день" ${d>=t?'disabled':''}>›</button></div></div>`;
  h+=`<div class="stats"><div class="stat"><span class="l">Гистамин</span><span class="v">${pts}</span><span class="c">${plural(pts,'балл','балла','баллов')} за день</span></div><div class="stat lib"><span class="l">${LIB} Либераторы</span><span class="v">${lib}</span><span class="c">${plural(lib,'продукт','продукта','продуктов')}</span></div></div>`;
  h+=`<div class="search"><label class="input">${SEARCH_IC}<input id="dq" type="search" placeholder="Добавить продукт" autocomplete="off" value="${esc(S.q)}"></label><div id="ddrop">${diaryDrop()}</div></div>`;
  const fr=frequent();
  if(fr.length)h+=`<div class="sec"><span>Часто добавляешь</span><span></span></div><div class="chips">`+fr.map(f=>`<button class="chip add" data-act="add" data-id="${esc(f.id)}">+ ${esc(f.name)}</button>`).join('')+`</div>`;
  h+=`<div class="sec"><span>Съедено ${d===t?'сегодня':'за день'}</span><span>${fs.length||''}</span></div>`;
  if(!fs.length)h+=`<div class="empty-line">Пока ничего. Найди продукт в поиске выше, и он появится здесь со своим баллом.</div>`;
  else h+=`<div class="chips">`+day(d).foods.map((x,i)=>{const f=foodById(x.f);if(!f)return'';return`<span class="chip c${f.score}">${score(f.score)}${esc(f.name)}${f.lib?LIB:''}<button class="x" data-act="rm" data-i="${i}" aria-label="Убрать ${esc(f.name)}">×</button></span>`}).join('')+`</div>`;
  h+=`<div class="foot">Продукты с оценкой 0 не отмечаются — они не добавляют гистамина. Л — гистаминолибератор, считается отдельно.</div>`;
  return h;
}
function diaryDrop(){
  const q=S.q.trim();if(!q)return'';const res=matchFoods(q,S.diaryDate);
  let h='<div class="drop">';
  for(const f of res){
    if(f.ban){h+=`<div class="row-item"><span class="txt"><span class="t">Вся молочка</span><span class="s">молоко, сыр, творог, йогурт</span></span>${banBadge()}</div>`;continue}
    const sub=foodSub(f);
    h+=`<button class="row-item" data-act="add" data-id="${esc(f.id)}"><span class="txt"><span class="t">${esc(f.name)}</span>${sub?`<span class="s">${esc(sub)}</span>`:''}</span>${f.lib?LIB:''}${score(f.score)}</button>`;
  }
  if(!res.length)h+=`<div class="empty"><span>«${esc(q)}» нет в списке — скорее всего, продукт хорошо переносится и баллы ему не нужны.</span><span class="opts">Добавить со своим баллом: <button class="score s1" data-act="custom" data-s="1">1</button><button class="score s2" data-act="custom" data-s="2">2</button><button class="score s3" data-act="custom" data-s="3">3</button></span></div>`;
  return h+'</div>';
}
function viewProducts(){
  let h=`<div class="head"><h1>Продукты</h1></div><div class="search top0"><label class="input">${SEARCH_IC}<input id="pq" type="search" placeholder="Поиск продукта" autocomplete="off" value="${esc(S.pq)}"></label></div>`;
  const fl=[['all','Все'],['1',''],['2',''],['3',''],['lib','Либераторы']];
  h+=`<div class="filters" role="group" aria-label="Фильтр">`+fl.map(([k,l])=>`<button class="fchip${k===S.pf?' sel':''}${l?'':' has-score'}" data-act="pf" data-k="${k}" aria-pressed="${k===S.pf}">${l||score(k)}</button>`).join('')+`</div>`;
  return h+`<div id="plist">${productList()}</div>`;
}
function productList(){
  const ban=dairyBanned(todayStr());const q=S.pq.trim().toLowerCase();
  const fs=allFoods().filter(f=>(!q||f.name.toLowerCase().includes(q))&&(S.pf==='all'||(S.pf==='lib'?f.lib:String(f.score)===S.pf)));
  let h='';
  if(!q&&S.pf==='all')h+=`<div class="legend"><div>${score(1)} умеренно, понемногу</div><div>${score(2)} плохо переносится</div><div>${score(3)} очень плохо</div><div>${LIB} высвобождает гистамин в организме</div><div class="hint">Продуктов с оценкой 0 в списке нет: не нашла — значит, можно</div></div>`;
  const cats=[...CATS];if((S.settings.custom||[]).length)cats.push('Мои продукты');
  for(const c of cats){
    if(c==='Молочное'&&ban){
      if(S.pf!=='all'&&S.pf!=='3')continue;
      if(q&&!isDairyQuery(q)&&!'вся молочка'.includes(q))continue;
      h+=`<div class="sec"><span>Исключено</span><span></span></div><div class="row-item"><span class="txt"><span class="t">Вся молочка</span><span class="s">молоко, сыр, творог, йогурт</span></span>${banBadge()}<button class="plus" disabled aria-label="Нельзя добавить">${PLUS}</button></div>`;
      continue;
    }
    const items=fs.filter(f=>(f.cat||'Мои продукты')===c);if(!items.length)continue;
    const auto=!!q||S.pf!=='all';const open=auto||!!S.openCats[c];
    h+=`<button class="sec cat${open?' open':''}" data-act="cat" data-c="${esc(c)}" aria-expanded="${open}" ${auto?'disabled':''}><span class="cl">${auto?'':CHEV}${esc(c)}</span><span>${items.length}</span></button>`;
    if(!open)continue;
    for(const f of items){const sub=foodSub(f);h+=`<div class="row-item"><span class="txt"><span class="t">${esc(f.name)}</span>${sub?`<span class="s">${esc(sub)}</span>`:''}</span>${f.lib?LIB:''}${score(f.score)}<button class="plus" data-act="padd" data-id="${esc(f.id)}" aria-label="Добавить в дневник: ${esc(f.name)}">${PLUS}</button></div>`}
  }
  if(!h.includes('row-item'))h+=`<div class="empty-line">Ничего не нашлось. Если продукта нет в списке, скорее всего, он хорошо переносится.</div>`;
  return h;
}
function viewInfo(){
  const p=P();const t=todayStr();const k=Math.min(Math.max(diff(p.start,t)+1,0),p.courseDays);
  const st=t<p.start?'Курс ещё не начался':t>p.end?'Курс завершён':`День ${k} из ${p.courseDays}`;
  let h=`<div class="head"><h1>Лечение</h1></div><div class="cards">
  <div class="card accent"><span class="k">Курс</span><span class="big">${fmtDate(p.start)} — ${fmtDate(p.end)}</span><p>${st}${p.courseNote?' · '+esc(p.courseNote):''}</p></div>`;
  if(p.diagnosis&&p.diagnosis.length)h+=`<div class="card"><h2>Что выяснили</h2>`+p.diagnosis.map(x=>`<div class="term"><b>${esc(x.h)}</b><p>${esc(x.d)}</p></div>`).join('')+`</div>`;
  if(p.diet&&p.diet.length)h+=`<div class="card"><h2>Питание</h2><ul>`+p.diet.map(x=>`<li>${esc(x)}</li>`).join('')+`</ul></div>`;
  h+=`</div><div class="sec"><span>Препараты</span><span>${(p.meds||[]).length}</span></div>`;
  h+=(p.meds||[]).map(m=>{let w=m.when;const it=p.items.find(i=>i.every&&i.pill===m.pill);if(it)w+=' · '+polyDates(it).map(fmtShort).join(', ');return`<div class="med">${pill(m.pill)}<div class="txt"><span class="t">${esc(m.name)}</span><span class="s">${esc(m.why)}</span><span class="w">${esc(w)}</span></div></div>`}).join('');
  h+=`<div class="foot">Описания упрощены. Схема — по назначению врача.<br>${esc(S.user.email)} · <button class="link" data-act="logout">Выйти</button></div>`;
  return h;
}

/* ---------- отрисовка ---------- */
const TABS=[['today','Сегодня','<path d="M6 12.5l4 4 8-9" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'],
 ['diary','Дневник','<rect x="5" y="4" width="14" height="16" rx="2.5" fill="none" stroke-width="1.8"/><path d="M9 9h6M9 13h6M9 17h3" stroke-width="1.8" stroke-linecap="round"/>'],
 ['products','Продукты','<circle cx="11" cy="11" r="6" fill="none" stroke-width="1.8"/><path d="M15.5 15.5L20 20" stroke-width="1.8" stroke-linecap="round"/>'],
 ['info','Лечение','<circle cx="12" cy="12" r="8" fill="none" stroke-width="1.8"/><path d="M12 11v5" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="8" r="1.1" fill="currentColor" stroke="none"/>']];
function render(keepFocus){
  const app=document.getElementById('app');const tabs=document.getElementById('tabs');
  const ae=document.activeElement;const fid=ae&&ae.id;let pos=null;try{pos=ae&&ae.selectionStart}catch(e){}
  if(!S.user){app.innerHTML=viewLogin();tabs.parentNode.hidden=true;return}
  if(!S.plan){app.innerHTML=viewNoPlan();tabs.parentNode.hidden=true;return}
  buildFoods();tabs.parentNode.hidden=false;
  app.innerHTML=S.route==='diary'?viewDiary():S.route==='products'?viewProducts():S.route==='info'?viewInfo():viewToday();
  tabs.innerHTML=TABS.map(([k,l,ic])=>`<button class="tab${k===S.route?' on':''}" data-act="go" data-k="${k}" aria-current="${k===S.route?'page':'false'}"><svg viewBox="0 0 24 24">${ic}</svg>${l}</button>`).join('');
  if(keepFocus&&fid){const el=document.getElementById(fid);if(el&&el.tagName==='INPUT'){el.focus();try{if(pos!=null)el.setSelectionRange(pos,pos)}catch(e){}}}
}
function go(k){S.route=k;try{history.replaceState(null,'','#'+k)}catch(e){}render();window.scrollTo(0,0)}

document.addEventListener('click',e=>{
  const b=e.target.closest('[data-act]');if(!b||b.disabled)return;const a=b.dataset.act;
  if(a==='go')return go(b.dataset.k);
  if(a==='tick'){const d=b.dataset.d,id=b.dataset.id;const c=day(d).checks;if(c[id])delete c[id];else c[id]=true;saveDay(d);return render()}
  if(a==='isla-start'){const t=todayStr();S.settings.islaStart=t<P().start?P().start:t;saveSettings();toast('Курс начат');return render()}
  if(a==='isla-stop'){S.settings.islaStart=null;saveSettings();return render()}
  if(a==='dprev'){S.diaryDate=addDays(S.diaryDate,-1);S.q='';return render()}
  if(a==='dnext'){S.diaryDate=addDays(S.diaryDate,1);S.q='';return render()}
  if(a==='add'){day(S.diaryDate).foods.push({f:b.dataset.id,t:Date.now()});saveDay(S.diaryDate);S.q='';return render()}
  if(a==='rm'){day(S.diaryDate).foods.splice(+b.dataset.i,1);saveDay(S.diaryDate);return render()}
  if(a==='custom'){const name=S.q.trim();if(!name)return;const f={id:'c-'+Date.now().toString(36),name:name[0].toUpperCase()+name.slice(1),cat:'Мои продукты',score:+b.dataset.s,lib:false,blk:false,note:''};
    S.settings.custom=(S.settings.custom||[]).concat(f);saveSettings();day(S.diaryDate).foods.push({f:f.id,t:Date.now()});saveDay(S.diaryDate);S.q='';toast('Добавлено: '+f.name);return render()}
  if(a==='pf'){S.pf=b.dataset.k;return render()}
  if(a==='cat'){const c=b.dataset.c;if(S.openCats[c])delete S.openCats[c];else S.openCats[c]=true;try{localStorage.setItem('ht-open-cats',JSON.stringify(S.openCats))}catch(e){}document.getElementById('plist').innerHTML=productList();return}
  if(a==='padd'){const t=todayStr();day(t).foods.push({f:b.dataset.id,t:Date.now()});saveDay(t);const f=foodById(b.dataset.id);toast('В дневник: '+(f?f.name:''));return}
  if(a==='login-mode'){const em=document.getElementById('login-email');S.login={step:S.login.step==='signup'?'email':'signup',email:em?em.value:S.login.email,busy:false,err:''};return render()}
  if(a==='logout'){logout();return}
});
document.addEventListener('input',e=>{
  if(e.target.id==='dq'){S.q=e.target.value;document.getElementById('ddrop').innerHTML=diaryDrop()}
  if(e.target.id==='pq'){S.pq=e.target.value;document.getElementById('plist').innerHTML=productList()}
});
document.addEventListener('submit',async e=>{
  e.preventDefault();const L=S.login;
  if(e.target.id==='f-auth'){
    L.email=document.getElementById('login-email').value.trim();const password=document.getElementById('login-pass').value;
    L.busy=true;L.err='';render();
    let res;
    if(L.step==='signup')res=await S.sb.auth.signUp({email:L.email,password});
    else res=await S.sb.auth.signInWithPassword({email:L.email,password});
    L.busy=false;const err=res.error;
    if(err){const m=(err.message||'').toLowerCase();
      L.err=m.includes('invalid login')?'Почта или пароль не подходят.':m.includes('already registered')?'Такой аккаунт уже есть — войди.':m.includes('signups not allowed')||m.includes('signup is disabled')?'Регистрация закрыта. Войди в существующий аккаунт.':m.includes('password')?'Пароль слишком простой: нужно от 8 символов.':'Не получилось: '+err.message;
      render();return}
    if(L.step==='signup'&&!res.data.session){L.err='Аккаунт создан, но вход не выполнен. Попробуй войти.';L.step='email';render()}
  }
});

/* ---------- запуск ---------- */
async function logout(){try{await S.sb.auth.signOut()}catch(e){}try{localStorage.removeItem(CACHE_KEY)}catch(e){}S.user=null;S.plan=null;S.days={};S.settings={islaStart:null,custom:[]};render()}
async function start(){
  const h=(location.hash||'').slice(1);if(['today','diary','products','info'].includes(h))S.route=h;
  const c=loadCache();
  if(!window.supabase||!CFG.supabaseUrl){render();return}
  S.sb=window.supabase.createClient(CFG.supabaseUrl,CFG.supabaseKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  const {data}=await S.sb.auth.getSession();
  const u=data&&data.session&&data.session.user;
  if(u){S.user=u;if(c&&c.uid===u.id){S.plan=c.plan;S.days=c.days||{};S.settings=Object.assign(S.settings,c.settings||{});S.dirty=c.dirty||S.dirty}}
  render();if(S.user)pull();
  S.sb.auth.onAuthStateChange((ev,session)=>{
    const nu=session&&session.user;
    if(nu&&(!S.user||S.user.id!==nu.id)){S.user=nu;S.login={step:'email',email:'',busy:false,err:''};pull()}
    else if(!nu&&S.user&&ev==='SIGNED_OUT'){S.user=null;render()}
  });
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&S.user)pull()});
  window.addEventListener('online',()=>{if(S.user)flush()});
}
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
start();
})();
