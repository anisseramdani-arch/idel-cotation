
const $ = s => document.querySelector(s);
const money = n => new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(n||0);
const key = 'idel-pwa-v1';

const monthSelect = $('#monthSelect'), daySelect = $('#daySelect');
const patientsList = $('#patientsList');
let state = JSON.parse(localStorage.getItem(key) || '{}');

function daysInMonth(label){
  const m = label.split(' ')[0].toLowerCase();
  return ['avril','juin','septembre','novembre'].includes(m) ? 30 : 31;
}
function ensureMonth(month){
  if(!state[month]) state[month] = {};
}
function ensureDay(month, day){
  ensureMonth(month);
  if(!state[month][day]) state[month][day] = {care:{}, dim:false, bs:0};
  return state[month][day];
}
function save(){ localStorage.setItem(key, JSON.stringify(state)); }

function setupSelectors(){
  APP_DATA.months.forEach(m=>{
    const o=document.createElement('option');o.value=m.label;o.textContent=m.label;monthSelect.appendChild(o);
  });
  monthSelect.addEventListener('change',()=>{fillDays();render();});
  daySelect.addEventListener('change',render);
  fillDays();
}
function fillDays(){
  const current = daySelect.value || '1';
  daySelect.innerHTML='';
  const n=daysInMonth(monthSelect.value);
  for(let d=1;d<=n;d++){const o=document.createElement('option');o.value=d;o.textContent=d;daySelect.appendChild(o);}
  daySelect.value = Math.min(Number(current),n);
}

function current(){return ensureDay(monthSelect.value, daySelect.value);}

function careCount(day){return APP_DATA.patients.filter((_,i)=>day.care[i]).length;}
function careTotal(day){return APP_DATA.patients.reduce((s,p,i)=>s+(day.care[i]?p.value:0),0);}
function parts(day){
  const count=careCount(day);
  const care=careTotal(day);
  const passages=count*APP_DATA.rates.passages;
  const dim=day.dim ? count*APP_DATA.rates.dim : 0;
  const bs=(day.bs||0)*APP_DATA.rates.bs;
  return {count, care, passages, dim, bs, total:care+passages+dim+bs};
}

function renderPatients(day){
  patientsList.innerHTML='';
  APP_DATA.patients.forEach((p,i)=>{
    const row=document.createElement('label');row.className='patient';
    const c=document.createElement('input');c.type='checkbox';c.checked=!!day.care[i];
    c.addEventListener('change',()=>{day.care[i]=c.checked;save();renderTotals();});
    const txt=document.createElement('div');
    txt.innerHTML=`<strong>${p.name}</strong><div class="meta">${p.cotation||''}</div>`;
    const pr=document.createElement('div');pr.className='price';pr.textContent=money(p.value);
    row.append(c,txt,pr);patientsList.appendChild(row);
  });
}
function renderTotals(){
  const d=current(), p=parts(d);
  $('#careTotal').textContent=money(p.care);
  $('#dayTotal').textContent=money(p.total);
  $('#passagesValue').textContent=money(p.passages);
  $('#dimCheck').checked=!!d.dim;
  $('#dimValue').textContent=money(p.dim);
  $('#bsCount').textContent=d.bs||0;
  $('#bsValue').textContent=money(p.bs);
}
function render(){
  const d=current(); renderPatients(d); renderTotals(); renderMonth();
}
$('#dimCheck').addEventListener('change',e=>{current().dim=e.target.checked;save();renderTotals();renderMonth();});
$('#bsMinus').addEventListener('click',()=>{let d=current();d.bs=Math.max(0,(d.bs||0)-1);save();renderTotals();renderMonth();});
$('#bsPlus').addEventListener('click',()=>{let d=current();d.bs=Math.min(5,(d.bs||0)+1);save();renderTotals();renderMonth();});
$('#uncheckAll').addEventListener('click',()=>{current().care={};save();render();});

function monthly(month){
  let care=0,passages=0,dim=0,bs=0,rows=[];
  const n=daysInMonth(month);
  for(let d=1;d<=n;d++){
    const p=parts(ensureDay(month,String(d)));
    care+=p.care; passages+=p.passages; dim+=p.dim; bs+=p.bs;
    rows.push({d,...p});
  }
  const gross=care+passages+dim+bs;
  const retro=care*APP_DATA.retrocessionRate;
  return {care,passages,dim,bs,gross,retro,net:gross-retro,rows};
}
function renderMonth(){
  const m=monthly(monthSelect.value);
  $('#monthCare').textContent=money(m.care);
  $('#monthPassages').textContent=money(m.passages);
  $('#monthDim').textContent=money(m.dim);
  $('#monthBs').textContent=money(m.bs);
  $('#monthGross').textContent=money(m.gross);
  $('#retro').textContent='− '+money(m.retro);
  $('#monthNet').textContent=money(m.net);
  const tbody=$('#monthRows');tbody.innerHTML='';
  m.rows.forEach(r=>{
    const tr=document.createElement('tr');
    const compl=r.passages+r.dim+r.bs;
    tr.innerHTML=`<td>${r.d}</td><td>${money(r.care)}</td><td>${money(compl)}</td><td><strong>${money(r.total)}</strong></td>`;
    tbody.appendChild(tr);
  });
}
document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>{
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b===btn));
  const day=btn.dataset.tab==='day';
  $('#dayTab').hidden=!day; $('#monthTab').hidden=day;
  if(!day) renderMonth();
}));

let deferredPrompt;
window.addEventListener('beforeinstallprompt',e=>{
  e.preventDefault(); deferredPrompt=e; $('#installBtn').hidden=false;
});
$('#installBtn').addEventListener('click',async()=>{
  if(!deferredPrompt)return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; $('#installBtn').hidden=true;
});

if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
setupSelectors(); render();
