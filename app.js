
const $ = s => document.querySelector(s);
const money = n => new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(n||0);
const key = 'idel-pwa-v1';

const monthSelect = $('#monthSelect'), daySelect = $('#daySelect');
const patientsList = $('#patientsList');
let state = JSON.parse(localStorage.getItem(key) || '{}');

function basePatients(){
  return APP_DATA.patients.map((p,i)=>({...p,id:`base-${i}`}));
}
function patients(){
  if(!state._patients){
    state._patients = basePatients();
    save();
  }
  return state._patients;
}
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
  const d=state[month][day];
  if(!d.care) d.care={};
  return d;
}
function save(){ localStorage.setItem(key, JSON.stringify(state)); }

function isChecked(day,p,index){
  return !!(day.care[p.id] ?? day.care[index]);
}
function setChecked(day,p,index,val){
  day.care[p.id]=val;
  if(Object.prototype.hasOwnProperty.call(day.care,index)) delete day.care[index];
}

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

function careCount(day){return patients().filter((p,i)=>isChecked(day,p,i)).length;}
function careTotal(day){return patients().reduce((s,p,i)=>s+(isChecked(day,p,i)?Number(p.value):0),0);}
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
  patients().forEach((p,i)=>{
    const row=document.createElement('div');row.className='patient';
    const c=document.createElement('input');c.type='checkbox';c.checked=isChecked(day,p,i);
    c.addEventListener('change',()=>{setChecked(day,p,i,c.checked);save();renderTotals();renderMonth();});
    const txt=document.createElement('div');
    txt.innerHTML=`<strong>${escapeHtml(p.name)}</strong><div class="meta">${escapeHtml(p.cotation||'')}</div>`;
    const pr=document.createElement('div');pr.className='price';pr.textContent=money(Number(p.value));
    const del=document.createElement('button');del.className='delete-patient';del.type='button';del.title='Supprimer';del.textContent='🗑';
    del.addEventListener('click',()=>deletePatient(p.id,p.name));
    row.append(c,txt,pr,del);patientsList.appendChild(row);
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
$('#uncheckAll').addEventListener('click',()=>{
  const d=current();
  patients().forEach((p,i)=>setChecked(d,p,i,false));
  save();render();
});

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

// Gestion patients
$('#showAddPatient').addEventListener('click',()=>$('#addPatientForm').hidden=false);
$('#cancelAddPatient').addEventListener('click',()=>$('#addPatientForm').hidden=true);
$('#addPatient').addEventListener('click',()=>{
  const name=$('#newPatientName').value.trim();
  const value=parseFloat($('#newPatientValue').value.replace(',','.'));
  const cotation=$('#newPatientCotation').value.trim();
  if(!name || Number.isNaN(value)){ alert('Indique au minimum un nom et une valeur valide.'); return; }
  patients().push({id:`custom-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,name,value,cotation});
  $('#newPatientName').value=''; $('#newPatientValue').value=''; $('#newPatientCotation').value='';
  $('#addPatientForm').hidden=true; save(); render();
});
function deletePatient(id,name){
  if(!confirm(`Supprimer ${name} de la liste des patients ?`)) return;
  state._patients = patients().filter(p=>p.id!==id);
  save(); render();
}

// Export Excel-compatible SpreadsheetML (.xls)
function xmlEscape(v){
  return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function cell(v,type='String',style=''){
  return `<Cell${style?` ss:StyleID="${style}"`:''}><Data ss:Type="${type}">${xmlEscape(v)}</Data></Cell>`;
}
function exportExcel(){
  const month=monthSelect.value, m=monthly(month);
  const ps=patients();
  const counts=ps.map(()=>0), totals=ps.map(()=>0);
  for(let d=1;d<=daysInMonth(month);d++){
    const day=ensureDay(month,String(d));
    ps.forEach((p,i)=>{ if(isChecked(day,p,i)){counts[i]++; totals[i]+=Number(p.value);} });
  }
  let rows1 = '';
  rows1 += `<Row>${cell('BILAN DU MOIS','String','Header')}${cell(month,'String','Header')}</Row>`;
  rows1 += `<Row>${cell('Total soins')}${cell(m.care,'Number','Money')}</Row>`;
  rows1 += `<Row>${cell('Passages')}${cell(m.passages,'Number','Money')}</Row>`;
  rows1 += `<Row>${cell('Dim / JFériés')}${cell(m.dim,'Number','Money')}</Row>`;
  rows1 += `<Row>${cell('BS')}${cell(m.bs,'Number','Money')}</Row>`;
  rows1 += `<Row>${cell('Total brut')}${cell(m.gross,'Number','Money')}</Row>`;
  rows1 += `<Row>${cell('Rétrocession 10 % (soins uniquement)')}${cell(m.retro,'Number','Money')}</Row>`;
  rows1 += `<Row>${cell('Total après rétrocession')}${cell(m.net,'Number','Money')}</Row>`;
  rows1 += `<Row></Row>`;
  rows1 += `<Row>${cell('Jour','String','Header')}${cell('Soins','String','Header')}${cell('Passages','String','Header')}${cell('Dim/JF','String','Header')}${cell('BS','String','Header')}${cell('Total','String','Header')}</Row>`;
  m.rows.forEach(r=>{ rows1 += `<Row>${cell(r.d,'Number')}${cell(r.care,'Number','Money')}${cell(r.passages,'Number','Money')}${cell(r.dim,'Number','Money')}${cell(r.bs,'Number','Money')}${cell(r.total,'Number','Money')}</Row>`; });

  let rows2 = `<Row>${cell('Patient','String','Header')}${cell('Cotation','String','Header')}${cell('Valeur','String','Header')}${cell('Nombre de jours','String','Header')}${cell('Total soins','String','Header')}</Row>`;
  ps.forEach((p,i)=>{ rows2 += `<Row>${cell(p.name)}${cell(p.cotation||'')}${cell(Number(p.value),'Number','Money')}${cell(counts[i],'Number')}${cell(totals[i],'Number','Money')}</Row>`; });

  const xml=`<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Bottom"/></Style>
  <Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#D9EAD3" ss:Pattern="Solid"/></Style>
  <Style ss:ID="Money"><NumberFormat ss:Format="#,##0.00 [$€-40C]"/></Style>
 </Styles>
 <Worksheet ss:Name="Bilan mensuel"><Table>${rows1}</Table></Worksheet>
 <Worksheet ss:Name="Patients"><Table>${rows2}</Table></Worksheet>
</Workbook>`;
  const blob=new Blob([xml],{type:'application/vnd.ms-excel;charset=utf-8'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=`Bilan_IDEL_${month.replaceAll(' ','_')}.xls`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
$('#exportExcel').addEventListener('click',exportExcel);

function escapeHtml(s){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }

let deferredPrompt;
window.addEventListener('beforeinstallprompt',e=>{
  e.preventDefault(); deferredPrompt=e; $('#installBtn').hidden=false;
});
$('#installBtn').addEventListener('click',async()=>{
  if(!deferredPrompt)return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; $('#installBtn').hidden=true;
});

if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
setupSelectors(); render();
