
const $ = s => document.querySelector(s);
const money = n => new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(n||0);
const key = 'idel-pwa-v1';

const monthSelect = $('#monthSelect'), yearSelect = $('#yearSelect'), daySelect = $('#daySelect');
const patientsList = $('#patientsList');
let state = JSON.parse(localStorage.getItem(key) || '{}');

function basePatients(){
  return APP_DATA.patients.map((p,i)=>({...p,id:`base-${i}`}));
}
const DEFAULT_COTATION_RATES = APP_DATA.rates;
const ACT_CATALOG = APP_DATA.actCatalog || [];
const DROM_RATES = {AIS:2.70,BSA:13.25,BSB:18.55,BSC:29.25,MIE:3.15};
const FIXED_TARIFF_CODES=new Set(['BSA','BSB','BSC','MAU','MCI','MIE','IFD','IFI']);
function cotationRates(){ return {...DEFAULT_COTATION_RATES, ...(state._cotationRates||{})}; }
function defaultRateFor(code,date=currentISODate(),zone=state._ngapRegion||'METROPOLE'){
  const region=zone==='DROM'?'drom':'metro';
  const schedule=APP_DATA.rateSchedule?.[code];
  if(schedule){
    let value=0;
    for(const candidate of schedule){if(date>=candidate.from&&candidate[region]!=null)value=Number(candidate[region]);}
    if(value)return value;
  }
  if(region==='drom' && Object.prototype.hasOwnProperty.call(DROM_RATES,code)) return DROM_RATES[code];
  return Number(DEFAULT_COTATION_RATES[code]||0);
}
function rateFor(code,date=currentISODate()){
  const overrides=state._cotationRates||{};
  if(Object.prototype.hasOwnProperty.call(overrides,code)) return Number(overrides[code])||0;
  return defaultRateFor(code,date);
}
function actBaseValue(act,date){return Math.max(0,Number(act.coefficient)||0)*rateFor(act.code,date);}
function catalogActCompatible(template,code){
  if(!template)return false;
  if(template.code===code)return true;
  const flexible=['venipuncture','im','sc','id','dressing-complex','topical-analgesia','perfusion-short','perfusion-long','perfusion-stop','perfusion-monitor','heart-failure'];
  return flexible.includes(template.id)&&['AMI','AMX'].includes(code);
}
function legacyPatientValue(p,date){
  const expr=String(p.cotation||'').toUpperCase().replace(/,([0-9])/g,'.$1');
  const re=/\b(AMI|AMX|BSA|BSB|BSC|BSI)\s*(\d+(?:\.\d+)?)?/g;
  let match,total=0,found=false;
  while((match=re.exec(expr))!==null){found=true;total+=(Number(match[2]||1))*rateFor(match[1],date);}
  return found?Math.round(total*100)/100:Number(p.value||0);
}
function patientBreakdown(p,date=currentISODate()){
  if(!Array.isArray(p.acts)||!p.acts.length) return {total:legacyPatientValue(p,date),rows:[],warnings:[],legacy:true};
  const rows=p.acts.map((act,index)=>{
    const catalogTemplate=ACT_CATALOG.find(item=>item.id===act.templateId);
    const code=act.code||catalogTemplate?.code||'AMI';
    const compatible=catalogActCompatible(catalogTemplate,code);
    const template=compatible?catalogTemplate:null;
    const coefficient=Math.max(0,Number(act.coefficient)||0);
    const base=rateFor(code,date)*(FIXED_TARIFF_CODES.has(code)?1:coefficient);
    return {act,index,template,catalogTemplate,templateMismatch:!!catalogTemplate&&!compatible,code,coefficient,base,multiplier:1,amount:0,rule:''};
  });
  const warnings=[];
  if(rows.some(row=>row.templateMismatch)) warnings.push('Une lettre-clé ne correspond pas au modèle d’acte choisi : la règle spécifique du modèle n’est pas appliquée.');
  const subjectCodes=['AMI','AMX','AIS','BSA','BSB','BSC'];
  rows.filter(row=>!subjectCodes.includes(row.code)).forEach(row=>{
    row.multiplier=1;row.rule='Tarif unitaire calculé; conditions propres à ce complément à vérifier';
    if(['MAU','MCI','MIE','DI','IFD','IFI'].includes(row.code)) warnings.push(`${row.code} : tarif calculé, mais conditions de facturation et d’association à contrôler.`);
  });
  if(state._ngapRegion==='DROM'&&date>='2026-11-06'&&rows.some(row=>(row.code==='AMI'&&!state._cotationRates?.AMI)||(row.code==='AMX'&&!state._cotationRates?.AMX))) warnings.push('Tarif AMI/AMX DROM après le 06/11/2026 non confirmé dans le barème embarqué : tarif DROM antérieur conservé, à mettre à jour avant facturation.');
  if(date>='2028-01-01'&&rows.some(row=>['AMI','AMX'].includes(row.code)&&!state._cotationRates?.[row.code])) warnings.push('Tarifs AMI/AMX postérieurs aux revalorisations prévues jusqu’au 01/11/2027 : vérifier le barème applicable à cette date.');
  const hasPackage=rows.some(row=>row.template?.cumul==='package');
  let packageCount=0, bsiFullExceptionCount=0;
  if(rows.filter(row=>row.template?.cumul==='package').length>1) warnings.push('Plusieurs forfaits BSA/BSB/BSC sont saisis pour la même fiche : vérifier la facturation journalière unique.');
  const passages=new Map();
  rows.filter(row=>subjectCodes.includes(row.code)).forEach(row=>{const group=String(row.act.passage||'1');if(!passages.has(group))passages.set(group,[]);passages.get(group).push(row);});
  for(const [passage,group] of passages){
    const packages=group.filter(row=>row.template?.cumul==='package');
    const clinical=group.filter(row=>!packages.includes(row));
    if(packages.length||hasPackage){
      packages.forEach(row=>{row.multiplier=packageCount++===0?1:0;row.rule=row.multiplier?'Forfait BSA/BSB/BSC à taux plein':'Forfait supplémentaire à vérifier';});
      warnings.push('Forfait dépendance dans le passage '+passage+' : les cumuls AMX/AMI dépendent de la nature exacte des soins et des dérogations NGAP. Vérification nécessaire.');
      const exceptions=clinical.filter(row=>['bsi-full','dressing-bsi','perfusion-bsi','blood'].includes(row.template?.cumul));
      const injections=clinical.filter(row=>row.template?.cumul==='injection');
      const amxRows=clinical.filter(row=>row.code==='AMX'&&!exceptions.includes(row));
      exceptions.forEach(row=>{const full=bsiFullExceptionCount++===0;row.multiplier=full?1:0.5;row.rule=full?'Dérogation BSI à taux plein (une exception à vérifier)':'Autre acte du contexte BSI : taux réduit estimatif';});
      injections.forEach(row=>{row.multiplier=0.5;row.rule='Injection associée au forfait : 50%';});
      amxRows.forEach(row=>{row.multiplier=0.5;row.rule='AMX dans le passage dépendance : 50%, sous réserve que l’acte soit autorisé au plan de soins';});
      clinical.filter(row=>!exceptions.includes(row)&&!injections.includes(row)&&!amxRows.includes(row)).forEach(row=>{
        row.multiplier=0;row.rule='Non valorisé automatiquement : règle de dépendance à vérifier';
        warnings.push('Acte « '+(row.template?.label||row.act.label||row.code)+' » : règle de cumul avec le forfait non déterminée automatiquement.');
      });
      continue;
    }
    const topical=group.filter(row=>row.template?.cumul==='topical');
    const dressings=group.filter(row=>['dressing','dressing-bsi'].includes(row.template?.cumul));
    const perfusions=group.filter(row=>row.template?.cumul==='perfusion-bsi');
    const blood=group.filter(row=>row.template?.cumul==='blood');
    topical.forEach(row=>{row.multiplier=1;row.rule='Dérogation pansement + analgésie topique à taux plein';});
    if(topical.length){dressings.forEach(row=>{row.multiplier=1;row.rule='Dérogation pansement + analgésie topique à taux plein';});}
    blood.forEach(row=>{row.multiplier=1;row.rule='Prélèvement veineux : dérogation à taux plein';});
    if(perfusions.length===2){perfusions.forEach(row=>{row.multiplier=1;row.rule='Deux forfaits de perfusion visés par la dérogation : taux plein';});}
    const handled=[...topical,...(topical.length?dressings:[]),...blood,...(perfusions.length===2?perfusions:[])];
    const ordinary=group.filter(row=>!handled.includes(row));
    ordinary.sort((a,b)=>b.coefficient-a.coefficient||a.index-b.index);
    ordinary.forEach((row,index)=>{
      row.multiplier=index===0?1:index===1?0.5:0;
      row.rule=index===0?'Acte au coefficient le plus élevé : 100%':index===1?'Deuxième acte du même passage : 50%':'Actes suivants du même passage : non valorisés';
    });
    if(group.some(row=>row.template?.cumul==='unknown')) warnings.push('Une ligne libre ou non caractérisée est présente : le calcul de cumul ne peut pas être confirmé.');
    if(topical.length>1) warnings.push('Plusieurs actes d’analgésie topique : vérifier les limites et conditions de l’article concerné.');
    if(perfusions.length===1) warnings.push('Une seule perfusion de la paire d’exception est identifiée : le cumul avec les autres actes doit être vérifié.');
    if(blood.length&&group.length>2) warnings.push('La dérogation du prélèvement veineux est appliquée avec un acte associé ; les autres actes du passage sont à vérifier.');
  }
  if(rows.some(row=>row.code==='AMX') && !rows.some(row=>row.template?.cumul==='package')) warnings.push('AMX sans forfait BSI associé : confirmez que ce cadre de facturation correspond à la situation.');
  if(date>='2028-01-01' && rows.some(row=>row.code==='AMX'||row.template?.cumul==='package')) warnings.push('Évolutions NGAP dépendance applicables au 01/01/2028 : règle complète à revalider avant facturation.');
  rows.forEach(row=>{row.amount=Math.round(row.base*row.multiplier*100)/100;});
  return {total:Math.round(rows.reduce((sum,row)=>sum+row.amount,0)*100)/100,rows,warnings,legacy:false};
}
function patientValue(p,date=currentISODate()){return patientBreakdown(p,date).total;}
function currentISODate(){return `${yearSelect.value}-${String(MONTHS.indexOf(monthSelect.value)+1).padStart(2,'0')}-${String(Number(daySelect.value)).padStart(2,'0')}`;}
function activeOnDate(p,date){return !p.closedOn || date<=p.closedOn;}
function patients(){
  if(!state._patients){
    state._patients = basePatients();
    save();
  }
  return state._patients;
}
const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
function monthLabel(){ return `${monthSelect.value} ${yearSelect.value}`; }
function isoForMonthDay(month,day){
  const [monthName,yearText]=month.split(' ');
  return `${yearText}-${String(MONTHS.indexOf(monthName)+1).padStart(2,'0')}-${String(Number(day)).padStart(2,'0')}`;
}
function daysInMonth(label){
  const [monthName, yearText] = label.split(' ');
  const monthIndex = MONTHS.indexOf(monthName);
  return monthIndex < 0 ? 31 : new Date(Number(yearText), monthIndex + 1, 0).getDate();
}
function ensureMonth(month){
  if(!state[month]) state[month] = {};
}
function ensureDay(month, day){
  ensureMonth(month);
  if(!state[month][day]) state[month][day] = {care:{}, night:{}, skipPassage:{}, dim:false, bs:0};
  const d=state[month][day];
  if(!d.care) d.care={};
  if(!d.night) d.night={};
  if(!d.skipPassage) d.skipPassage={};
  return d;
}
function save(){ localStorage.setItem(key, JSON.stringify(state)); }
function migrateNgapRateDefaults(){
  if(state._ngapRatesVersioned)return;
  const oldRates=state._cotationRates||{};
  const oldDefault=state._ngapRegion==='DROM'?3.30:3.15;
  for(const code of ['AMI','AMX']) if(Object.prototype.hasOwnProperty.call(oldRates,code)&&Math.abs(Number(oldRates[code])-oldDefault)<0.0001) delete oldRates[code];
  state._cotationRates=oldRates;
  state._ngapRatesVersioned=1;
  save();
}

function isChecked(day,p,index){
  return !!(day.care[p.id] ?? day.care[index]);
}
function setChecked(day,p,index,val){
  day.care[p.id]=val;
  if(Object.prototype.hasOwnProperty.call(day.care,index)) delete day.care[index];
}

function setupSelectors(){
  MONTHS.forEach(m=>{
    const o=document.createElement('option');o.value=m;o.textContent=m;monthSelect.appendChild(o);
  });
  for(let y=2026;y<=2030;y++){
    const o=document.createElement('option');o.value=String(y);o.textContent=String(y);yearSelect.appendChild(o);
  }
  const today = new Date();
  const todayYear = Math.min(2030, Math.max(2026, today.getFullYear()));
  monthSelect.value = MONTHS[today.getMonth()];
  yearSelect.value = String(todayYear);
  const refresh=()=>{fillDays();render();};
  monthSelect.addEventListener('change',refresh);
  yearSelect.addEventListener('change',refresh);
  daySelect.addEventListener('change',render);
  fillDays();
  daySelect.value = String(today.getDate());
}
function fillDays(){
  const current = daySelect.value || '1';
  daySelect.innerHTML='';
  const n=daysInMonth(monthLabel());
  for(let d=1;d<=n;d++){const o=document.createElement('option');o.value=d;o.textContent=d;daySelect.appendChild(o);}
  daySelect.value = Math.min(Number(current),n);
}

function current(){return ensureDay(monthLabel(), daySelect.value);}

function careCount(day){return patients().filter((p,i)=>isChecked(day,p,i)).length;}
function careTotal(day,date=currentISODate()){return patients().reduce((s,p,i)=>s+(isChecked(day,p,i)?patientValue(p,date):0),0);}
function nightCount(day){return patients().reduce((s,p,i)=>s+(isChecked(day,p,i) && !!day.night[p.id] ? 1 : 0),0);}
function passageCount(day){return patients().reduce((s,p,i)=>s+(isChecked(day,p,i) && !day.skipPassage[p.id] ? 1 : 0),0);}
function parts(day,date=currentISODate()){
  const count=careCount(day);
  const care=careTotal(day,date);
  const passages=passageCount(day)*APP_DATA.rates.passages;
  const night=nightCount(day)*APP_DATA.rates.night;
  const dim=day.dim ? count*APP_DATA.rates.dim : 0;
  const bs=(day.bs||0)*APP_DATA.rates.bs;
  return {count, care, passages, night, dim, bs, total:care+passages+night+dim+bs};
}

function renderPatients(day){
  patientsList.innerHTML='';
  patients().forEach((p,i)=>{
    if(!activeOnDate(p,currentISODate())) return;
    const row=document.createElement('div');row.className='patient';row.dataset.patientId=p.id;
    const c=document.createElement('input');c.type='checkbox';c.checked=isChecked(day,p,i);
    const handle=document.createElement('button');handle.className='drag-handle';handle.type='button';handle.textContent='⠿';handle.title='Maintenir puis faire glisser pour réordonner';handle.setAttribute('aria-label',`Réordonner ${p.name} par glisser-déposer`);
    const txt=document.createElement('div');
    txt.innerHTML=`<strong>${escapeHtml(p.name)}</strong><div class="meta">${escapeHtml(displayCotation(p))}</div>`;
    const nightWrap=document.createElement('label'); nightWrap.className='night-option';
    const night=document.createElement('input'); night.type='checkbox'; night.checked=!!day.night[p.id]; night.disabled=!c.checked;
    const nightText=document.createElement('span'); nightText.textContent='Majoration nuit +9,15 €';
    nightWrap.append(night,nightText);
    night.addEventListener('change',()=>{day.night[p.id]=night.checked;save();renderTotals();renderMonth();});
    const skipWrap=document.createElement('label');skipWrap.className='passage-option';
    const skip=document.createElement('input');skip.type='checkbox';skip.checked=!!day.skipPassage[p.id];skip.disabled=!c.checked;
    const skipText=document.createElement('span');skipText.textContent='Ne pas compter le passage';
    skipWrap.append(skip,skipText);
    skip.addEventListener('change',()=>{day.skipPassage[p.id]=skip.checked;save();renderTotals();renderMonth();});
    c.addEventListener('change',()=>{
      setChecked(day,p,i,c.checked);
      if(!c.checked){ day.night[p.id]=false; night.checked=false; night.disabled=true; skip.disabled=true; }
      else { night.disabled=false; skip.disabled=false; }
      save();renderTotals();renderMonth();
    });
    const pr=document.createElement('div');pr.className='price';pr.textContent=money(patientValue(p));
    const actions=document.createElement('div');actions.className='patient-actions';
    if(p.address){const maps=document.createElement('a');maps.className='maps-button maps-link';maps.href=googleMapsUrl(p.address);maps.target='_blank';maps.rel='noopener';maps.title='Ouvrir dans Google Maps';maps.textContent='📍';maps.setAttribute('aria-label',`Ouvrir l’adresse de ${p.name} dans Google Maps`);actions.appendChild(maps);}
    const edit=document.createElement('button');edit.className='edit-patient';edit.type='button';edit.title='Modifier le patient';edit.setAttribute('aria-label',`Modifier ${p.name}`);edit.textContent='✏️';
    edit.addEventListener('click',()=>editPatient(p.id));
    const del=document.createElement('button');del.className='delete-patient';del.type='button';del.title='Supprimer';del.textContent='🗑';
    del.addEventListener('click',()=>deletePatient(p.id,p.name));
    const up=document.createElement('button');up.className='order-patient';up.type='button';up.textContent='↑';up.title='Monter dans la liste';up.disabled=i===0;up.addEventListener('click',()=>movePatient(p.id,-1));
    const down=document.createElement('button');down.className='order-patient';down.type='button';down.textContent='↓';down.title='Descendre dans la liste';down.disabled=i===patients().length-1;down.addEventListener('click',()=>movePatient(p.id,1));
    const close=document.createElement('button');close.className='close-patient';close.type='button';close.textContent='📅';close.title='Clôturer le patient';close.addEventListener('click',()=>closePatient(p.id));
    actions.append(up,down,edit,close,del);
    row.append(c,handle,txt,nightWrap,skipWrap,pr,actions);patientsList.appendChild(row);
  });
}
function renderTotals(){
  const d=current(), p=parts(d);
  $('#careTotal').textContent=money(p.care);
  $('#dayTotal').textContent=money(p.total);
  $('#passagesValue').textContent=money(p.passages);
  $('#nightValue').textContent=money(p.night);
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
  let care=0,passages=0,night=0,dim=0,bs=0,rows=[];
  const n=daysInMonth(month);
  for(let d=1;d<=n;d++){
    const date=isoForMonthDay(month,d);
    const p=parts(ensureDay(month,String(d)),date);
    care+=p.care; passages+=p.passages; night+=p.night; dim+=p.dim; bs+=p.bs;
    rows.push({d,...p});
  }
  const gross=care+passages+night+dim+bs;
  const retro=care*APP_DATA.retrocessionRate;
  return {care,passages,night,dim,bs,gross,retro,net:gross-retro,rows};
}
function renderMonth(){
  const m=monthly(monthLabel());
  $('#monthCare').textContent=money(m.care);
  $('#monthPassages').textContent=money(m.passages);
  $('#monthNight').textContent=money(m.night);
  $('#monthDim').textContent=money(m.dim);
  $('#monthBs').textContent=money(m.bs);
  $('#monthGross').textContent=money(m.gross);
  $('#retro').textContent='− '+money(m.retro);
  $('#monthNet').textContent=money(m.net);
  const tbody=$('#monthRows');tbody.innerHTML='';
  m.rows.forEach(r=>{
    const tr=document.createElement('tr');
    const compl=r.passages+r.night+r.dim+r.bs;
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
$('#settingsRates').addEventListener('click',configureRates);
let editingPatientId=null;
const editor=$('#patientEditor');
$('#showAddPatient').addEventListener('click',()=>openPatientEditor());
$('#closeEditor').addEventListener('click',()=>editor.close());
$('#cancelEditor').addEventListener('click',()=>editor.close());
$('#addActRow').addEventListener('click',()=>{addActEditorRow();renderEditorPreview();});
$('#savePatient').addEventListener('click',savePatientEditor);
$('#editorMaps').addEventListener('click',()=>{const address=$('#editorAddress').value.trim();if(address)window.open(googleMapsUrl(address),'_blank','noopener,noreferrer');});
$('#editorAddress').addEventListener('input',()=>{$('#editorMaps').disabled=!$('#editorAddress').value.trim();});
function googleMapsUrl(address){return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;}
function openPatientEditor(id=null){
  editingPatientId=id;
  const p=id?patients().find(item=>item.id===id):null;
  $('#editorTitle').textContent=p?'Modifier la fiche patient':'Ajouter un patient';
  $('#editorName').value=p?.name||'';
  $('#editorAddress').value=p?.address||'';
  $('#editorMaps').disabled=!p?.address;
  const notice=$('#legacyNotice');
  notice.hidden=!(p&&!Array.isArray(p.acts));
  notice.textContent=p&&!Array.isArray(p.acts)?`Ancienne cotation : ${p.cotation||'non précisée'} · montant enregistré : ${money(p.value)}. Elle reste inchangée si tu n’ajoutes pas de lignes NGAP. Ajouter des actes puis enregistrer remplacera cette cotation historique par le calcul des lignes.`:'';
  $('#actRows').replaceChildren();
  if(Array.isArray(p?.acts)) p.acts.forEach(act=>addActEditorRow(act));
  editor.showModal();
  renderEditorPreview();
  $('#editorName').focus();
}
function addActEditorRow(act={}){
  const wrap=document.createElement('div');wrap.className='act-editor-row';
  const actLabel=document.createElement('label');actLabel.textContent='Acte NGAP';
  const templateSelect=document.createElement('select');templateSelect.className='act-template';
  ACT_CATALOG.forEach(item=>{const option=document.createElement('option');option.value=item.id;option.textContent=`${item.label} — ${item.code} ${String(item.coefficient).replace('.',',')}`;templateSelect.appendChild(option);});
  templateSelect.value=ACT_CATALOG.some(item=>item.id===act.templateId)?act.templateId:(act.templateId||'ami-free');
  actLabel.appendChild(templateSelect);
  const codeLabel=document.createElement('label');codeLabel.textContent='Lettre-clé';
  const codeSelect=document.createElement('select');codeSelect.className='act-code';
  ['AMI','AMX','AIS','BSA','BSB','BSC','DI','MAU','MCI','IFD','IFI','MIE'].forEach(code=>{const option=document.createElement('option');option.value=code;option.textContent=code;codeSelect.appendChild(option);});
  const initialTemplate=ACT_CATALOG.find(item=>item.id===templateSelect.value);
  codeSelect.value=act.code||initialTemplate?.code||'AMI';codeLabel.appendChild(codeSelect);
  const coefficientLabel=document.createElement('label');coefficientLabel.textContent='Coefficient';
  const coefficientInput=document.createElement('input');coefficientInput.className='act-coefficient';coefficientInput.type='number';coefficientInput.min='0';coefficientInput.step='0.01';coefficientInput.inputMode='decimal';coefficientInput.value=act.coefficient??initialTemplate?.coefficient??1;coefficientLabel.appendChild(coefficientInput);
  const passageLabel=document.createElement('label');passageLabel.textContent='Passage';
  const passageSelect=document.createElement('select');passageSelect.className='act-passage';
  [['1','Passage 1'],['2','Passage 2'],['3','Passage 3']].forEach(([value,label])=>{const option=document.createElement('option');option.value=value;option.textContent=label;passageSelect.appendChild(option);});
  passageSelect.value=String(act.passage||'1');passageLabel.appendChild(passageSelect);
  const lineAmount=document.createElement('div');lineAmount.className='act-line-total';lineAmount.textContent='—';
  const remove=document.createElement('button');remove.className='remove-act';remove.type='button';remove.textContent='×';remove.title='Supprimer cette ligne';
  remove.addEventListener('click',()=>{wrap.remove();renderEditorPreview();});
  const updateFixedCoefficient=()=>{const fixed=FIXED_TARIFF_CODES.has(codeSelect.value);if(fixed)coefficientInput.value='1';coefficientInput.disabled=fixed;};
  updateFixedCoefficient();
  templateSelect.addEventListener('change',()=>{const selected=ACT_CATALOG.find(item=>item.id===templateSelect.value);if(selected){codeSelect.value=selected.code;coefficientInput.value=selected.coefficient;}updateFixedCoefficient();renderEditorPreview();});
  codeSelect.addEventListener('change',()=>{updateFixedCoefficient();renderEditorPreview();});
  [coefficientInput,passageSelect].forEach(input=>input.addEventListener('input',renderEditorPreview));
  wrap.append(actLabel,codeLabel,coefficientLabel,passageLabel,lineAmount,remove);
  $('#actRows').appendChild(wrap);
}
function readEditorActs(){
  return [...document.querySelectorAll('.act-editor-row')].map(row=>{
    const templateId=row.querySelector('.act-template').value;
    const template=ACT_CATALOG.find(item=>item.id===templateId);
    return {templateId,code:row.querySelector('.act-code').value,coefficient:Number(row.querySelector('.act-coefficient').value),passage:row.querySelector('.act-passage').value,label:template?.label||'Acte libre'};
  }).filter(act=>Number.isFinite(act.coefficient)&&act.coefficient>0);
}
function renderEditorPreview(){
  if(!editor.open)return;
  const acts=readEditorActs(), previewPatient={acts};
  const result=patientBreakdown(previewPatient,currentISODate());
  $('#editorTotal').textContent=money(result.total);
  result.rows.forEach(row=>{const el=document.querySelectorAll('.act-editor-row')[row.index]?.querySelector('.act-line-total');if(el)el.textContent=money(row.amount);});
  const details=$('#engineDetails');details.replaceChildren();
  result.rows.forEach(row=>{const line=document.createElement('div');const label=document.createElement('span');label.textContent=`${row.code} ${String(row.coefficient).replace('.',',')} · ${row.rule}`;const amount=document.createElement('strong');amount.textContent=money(row.amount);line.append(label,amount);details.appendChild(line);});
  const warnings=$('#editorWarnings');warnings.replaceChildren();
  result.warnings.forEach(message=>{const item=document.createElement('div');item.textContent='⚠ '+message;warnings.appendChild(item);});
  warnings.hidden=result.warnings.length===0;
}
function savePatientEditor(){
  const name=$('#editorName').value.trim(),address=$('#editorAddress').value.trim(),acts=readEditorActs();
  if(!name){alert('Indique un nom de patient.');return;}
  if(!editingPatientId&&!acts.length){alert('Ajoute au moins une ligne d’acte.');return;}
  let p=editingPatientId?patients().find(item=>item.id===editingPatientId):null;
  if(!p){p={id:`custom-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,name,value:0,cotation:''};patients().push(p);}
  p.name=name;
  p.address=address;
  if(acts.length){
    p.acts=acts;
    p.cotation=acts.map(act=>`${act.code} ${String(act.coefficient).replace('.',',')} (passage ${act.passage})`).join(' + ');
    p.value=patientValue(p,currentISODate());
  }
  save();editor.close();render();
}
function displayCotation(p){return Array.isArray(p.acts)&&p.acts.length?p.acts.map(act=>`${act.code} ${String(act.coefficient).replace('.',',')}`).join(' + '):(p.cotation||'');}
function editPatient(id){openPatientEditor(id);}
function movePatient(id,delta){
  const list=patients(), from=list.findIndex(p=>p.id===id), to=from+delta;
  if(from<0||to<0||to>=list.length)return;
  [list[from],list[to]]=[list[to],list[from]];save();render();
}
let dragState=null;
patientsList.addEventListener('pointerdown',event=>{
  const handle=event.target.closest('.drag-handle');if(!handle||event.button!==0)return;
  const row=handle.closest('.patient');dragState={id:row.dataset.patientId,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,active:false,timer:setTimeout(()=>beginPatientDrag(row,event.pointerId),450)};
});
function beginPatientDrag(row,pointerId){
  if(!dragState||dragState.pointerId!==pointerId)return;
  dragState.active=true;row.classList.add('dragging');
  try{row.querySelector('.drag-handle').setPointerCapture(pointerId);}catch{}
}
patientsList.addEventListener('pointermove',event=>{
  if(!dragState||dragState.pointerId!==event.pointerId)return;
  if(!dragState.active){if(Math.hypot(event.clientX-dragState.startX,event.clientY-dragState.startY)>10){clearTimeout(dragState.timer);dragState=null;}return;}
  const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('.patient');
  patientsList.querySelectorAll('.patient').forEach(row=>row.classList.remove('drop-before','drop-after'));
  if(target&&target.dataset.patientId!==dragState.id){const rect=target.getBoundingClientRect();target.classList.add(event.clientY<rect.top+rect.height/2?'drop-before':'drop-after');}
});
function finishPatientDrag(event){
  if(!dragState||dragState.pointerId!==event.pointerId)return;
  clearTimeout(dragState.timer);const id=dragState.id,active=dragState.active;dragState=null;
  const source=patientsList.querySelector(`[data-patient-id="${CSS.escape(id)}"]`);
  const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('.patient');
  patientsList.querySelectorAll('.patient').forEach(row=>row.classList.remove('dragging','drop-before','drop-after'));
  if(!active||!source||!target||source===target)return;
  const list=patients(),from=list.findIndex(p=>p.id===id),to=list.findIndex(p=>p.id===target.dataset.patientId);if(from<0||to<0)return;
  const [item]=list.splice(from,1),adjustedTo=list.findIndex(p=>p.id===target.dataset.patientId);
  const rect=target.getBoundingClientRect(),after=event.clientY>=rect.top+rect.height/2;
  list.splice(adjustedTo+(after?1:0),0,item);save();render();
}
patientsList.addEventListener('pointerup',finishPatientDrag);
patientsList.addEventListener('pointercancel',event=>{if(dragState&&dragState.pointerId===event.pointerId){clearTimeout(dragState.timer);dragState=null;patientsList.querySelectorAll('.patient').forEach(row=>row.classList.remove('dragging','drop-before','drop-after'));}});
function closePatient(id){
  const p=patients().find(x=>x.id===id);if(!p)return;
  const date=prompt(`Date de clôture de ${p.name} (AAAA-MM-JJ). Visible jusqu'à cette date.`,p.closedOn||currentISODate());
  if(date===null)return;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))){alert('Date invalide. Format attendu : AAAA-MM-JJ.');return;}
  p.closedOn=date;save();render();
}
function configureRates(){
  const zone=prompt('Zone tarifaire : M pour métropole, D pour DROM.',state._ngapRegion==='DROM'?'D':'M');
  if(zone===null)return;
  const targetRegion=zone.trim().toUpperCase()==='D'?'DROM':'METROPOLE';
  const rates={...(state._cotationRates||{})};
  for(const code of ['AMI','AMX','AIS','BSA','BSB','BSC','DI','MAU','MCI','IFD','IFI','MIE']){
    const standard=defaultRateFor(code,currentISODate(),targetRegion);
    const current=Object.prototype.hasOwnProperty.call(rates,code)?rates[code]:standard;
    const raw=prompt(`Tarif unitaire ${code} (${targetRegion}, €) :`,String(current).replace('.',','));
    if(raw===null)return;
    const val=Number(raw.trim().replace(',','.'));
    if(!Number.isFinite(val)||val<0){alert('Valeur invalide.');return;}
    if(Math.abs(val-standard)<0.0001) delete rates[code]; else rates[code]=val;
  }
  state._ngapRegion=targetRegion;state._cotationRates=rates;save();render();
  alert('Zone et tarifs enregistrés. Les tarifs saisis remplacent les valeurs officielles préchargées.');
}
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
  const month=monthLabel(), m=monthly(month);
  const ps=patients();
  const counts=ps.map(()=>0), totals=ps.map(()=>0);
  const detailedRows=[];
  for(let d=1;d<=daysInMonth(month);d++){
    const dayDate=isoForMonthDay(month,d);
    const day=ensureDay(month,String(d));
    const pday=parts(day,dayDate);
    const hasData=pday.count>0 || pday.dim>0 || pday.bs>0;
    if(!hasData) continue;
    ps.forEach((p,i)=>{
      if(isChecked(day,p,i)){
        counts[i]++; totals[i]+=patientValue(p,dayDate);
        detailedRows.push(`<Row>${cell(d,'Number')}${cell('Soin')}${cell(p.name)}${cell(displayCotation(p))}${cell(1,'Number')}${cell(patientValue(p,dayDate),'Number','Money')}${cell(patientValue(p,dayDate),'Number','Money')}</Row>`);
        if(day.night[p.id]){
          detailedRows.push(`<Row>${cell(d,'Number')}${cell('Majoration nuit')}${cell(p.name)}${cell('9,15 €')}${cell(1,'Number')}${cell(9.15,'Number','Money')}${cell(9.15,'Number','Money')}</Row>`);
        }
      }
    });
    if(pday.passages>0) detailedRows.push(`<Row>${cell(d,'Number')}${cell('Passages')}${cell('Nombre de soins cochés')}${cell('2,75 €')}${cell(pday.count,'Number')}${cell(APP_DATA.rates.passages,'Number','Money')}${cell(pday.passages,'Number','Money')}</Row>`);
    if(pday.dim>0) detailedRows.push(`<Row>${cell(d,'Number')}${cell('Dim / JF')}${cell('Nombre de soins cochés')}${cell('8,50 €')}${cell(pday.count,'Number')}${cell(APP_DATA.rates.dim,'Number','Money')}${cell(pday.dim,'Number','Money')}</Row>`);
    if(pday.bs>0) detailedRows.push(`<Row>${cell(d,'Number')}${cell('BS')}${cell('Nombre de BS')}${cell('8,83 €')}${cell(pday.bs,'Number')}${cell(APP_DATA.rates.bs,'Number','Money')}${cell(pday.bs*APP_DATA.rates.bs,'Number','Money')}</Row>`);
  }
  let rows1 = '';
  rows1 += `<Row>${cell('BILAN DU MOIS','String','Title')}${cell(month,'String','Header')}</Row>`;
  rows1 += `<Row>${cell('Total soins')}${cell(m.care,'Number','Money')}</Row>`;
  rows1 += `<Row>${cell('Passages')}${cell(m.passages,'Number','Money')}</Row>`;
  rows1 += `<Row>${cell('Majorations nuit')}${cell(m.night,'Number','Money')}</Row>`;
  rows1 += `<Row>${cell('Dim / JFériés')}${cell(m.dim,'Number','Money')}</Row>`;
  rows1 += `<Row>${cell('BS')}${cell(m.bs,'Number','Money')}</Row>`;
  rows1 += `<Row>${cell('Total brut')}${cell(m.gross,'Number','Money')}</Row>`;
  rows1 += `<Row>${cell('Rétrocession 10 % (soins uniquement)')}${cell(m.retro,'Number','Money')}</Row>`;
  rows1 += `<Row>${cell('Total après rétrocession')}${cell(m.net,'Number','Money')}</Row>`;
  rows1 += `<Row></Row>`;
  rows1 += `<Row>${cell('Jour','String','Header')}${cell('Soins','String','Header')}${cell('Passages','String','Header')}${cell('Majoration nuit','String','Header')}${cell('Dim/JF','String','Header')}${cell('BS','String','Header')}${cell('Total','String','Header')}</Row>`;
  m.rows.filter(r=>r.count>0||r.dim>0||r.bs>0).forEach(r=>{ rows1 += `<Row>${cell(r.d,'Number')}${cell(r.care,'Number','Money')}${cell(r.passages,'Number','Money')}${cell(r.night,'Number','Money')}${cell(r.dim,'Number','Money')}${cell(r.bs,'Number','Money')}${cell(r.total,'Number','Money')}</Row>`; });

  let rows2 = `<Row>${cell('Patient','String','Header')}${cell('Cotation','String','Header')}${cell('Valeur','String','Header')}${cell('Nombre de jours','String','Header')}${cell('Total soins','String','Header')}</Row>`;
  ps.forEach((p,i)=>{ rows2 += `<Row>${cell(p.name)}${cell(displayCotation(p))}${cell(patientValue(p,isoForMonthDay(month,daysInMonth(month))),'Number','Money')}${cell(counts[i],'Number')}${cell(totals[i],'Number','Money')}</Row>`; });
  const detailDays = Array.from({length:daysInMonth(month)},(_,i)=>i+1)
    .filter(d=>{
      const day=ensureDay(month,String(d));
      const pd=parts(day,isoForMonthDay(month,d));
      return pd.count>0 || pd.night>0 || pd.dim>0 || pd.bs>0;
    });
  const detailRows = [];
  detailRows.push(`<Row>${cell('Patients','String','Header')}${cell('Valeur','String','Header')}${cell('Cotation soins','String','Header')}${detailDays.map(d=>cell(String(d),'String','Header')).join('')}${cell('Nombre de jours','String','Header')}${cell('Total','String','Header')}</Row>`);
  ps.forEach((p,i)=>{
    const daysWithCare=detailDays.filter(d=>isChecked(ensureDay(month,String(d)),p,i));
    const values=detailDays.map(d=>{
      const day=ensureDay(month,String(d));
      return isChecked(day,p,i)?cell('✓','String','Check'):'<Cell><Data ss:Type="String"></Data></Cell>';
    }).join('');
    detailRows.push(`<Row>${cell(p.name)}${cell(patientValue(p,isoForMonthDay(month,daysInMonth(month))),'Number','Money')}${cell(displayCotation(p))}${values}${cell(daysWithCare.length,'Number')}${cell(totals[i],'Number','Money')}</Row>`);
    if(daysWithCare.some(d=>!!ensureDay(month,String(d)).night[p.id])){
      // Night surcharge is reported in the summary below, not duplicated in patient care totals.
    }
  });
  const extraRows = [
    ['Majoration nuit', d=>parts(ensureDay(month,String(d)),isoForMonthDay(month,d)).night],
    ['Passages', d=>parts(ensureDay(month,String(d)),isoForMonthDay(month,d)).passages],
    ['Dim / JF', d=>parts(ensureDay(month,String(d)),isoForMonthDay(month,d)).dim],
    ['BS', d=>parts(ensureDay(month,String(d)),isoForMonthDay(month,d)).bs],
    ['TOTAL JOURNALIER', d=>parts(ensureDay(month,String(d)),isoForMonthDay(month,d)).total]
  ];
  extraRows.forEach(([label,getValue],idx)=>{
    const values=detailDays.map(d=>{
      const v=getValue(d);
      return v ? cell(v,'Number',idx===4?'TotalMoney':'Money') : '<Cell><Data ss:Type="String"></Data></Cell>';
    }).join('');
    const special=idx===4?'Total':'';
    detailRows.push(`<Row>${cell(label,'String',special)}${cell('', 'String',special)}${cell('', 'String',special)}${values}${cell('', 'String',special)}${cell('', 'String',special)}</Row>`);
  });
  const rows3=detailRows.join('');
  const detailColumns='<Column ss:Width="150"/><Column ss:Width="65"/><Column ss:Width="110"/>'+detailDays.map(()=>'<Column ss:Width="38"/>').join()+'<Column ss:Width="78"/><Column ss:Width="78"/>';
  const zebra = rows => {
    let index=0;
    return rows.replace(/<Row(.*?)>(.*?)<\/Row>/g, (match, attrs, body) => {
      const current=index++;
      if(current%2===0) return match;
      const styled=body.replace(/<Cell(?![^>]*ss:StyleID=)([^>]*)>/g,
        '<Cell ss:StyleID="Alt"$1>');
      const money=styled.replace(/<Cell ss:StyleID="Money"/g,'<Cell ss:StyleID="AltMoney"');
      return `<Row${attrs}>${money}</Row>`;
    });
  };
  rows1 = zebra(rows1);
  rows1 = rows1.replace(/<Row><Cell><Data ss:Type="String">Total brut<\/Data><\/Cell><Cell ss:StyleID="Money">/g,
    '<Row><Cell ss:StyleID="Total"><Data ss:Type="String">Total brut</Data></Cell><Cell ss:StyleID="TotalMoney">');
  rows1 = rows1.replace(/<Row><Cell><Data ss:Type="String">Total après rétrocession<\/Data><\/Cell><Cell ss:StyleID="Money">/g,
    '<Row><Cell ss:StyleID="Total"><Data ss:Type="String">Total après rétrocession</Data></Cell><Cell ss:StyleID="TotalMoney">');
  rows2 = zebra(rows2);
  const rows3Styled = zebra(rows3);
  const xml=`<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B7C9D6"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B7C9D6"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B7C9D6"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B7C9D6"/></Borders></Style>
  <Style ss:ID="Header"><Font ss:Bold="1" ss:Size="14"/><Interior ss:Color="#D9EAD3" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:WrapText="1"/></Style>
  <Style ss:ID="Title"><Font ss:Bold="1" ss:Size="18" ss:Color="#1F4E78"/><Interior ss:Color="#D9EAF7" ss:Pattern="Solid"/></Style>
  <Style ss:ID="Alt"><Interior ss:Color="#EAF2F8" ss:Pattern="Solid"/></Style>
  <Style ss:ID="Check"><Font ss:Bold="1" ss:Color="#008000"/><Alignment ss:Horizontal="Center" ss:Vertical="Center"/></Style>
  <Style ss:ID="AltMoney"><Interior ss:Color="#EAF2F8" ss:Pattern="Solid"/><NumberFormat ss:Format="#,##0.00 [$€-40C]"/></Style>
  <Style ss:ID="Total"><Font ss:Bold="1"/><Interior ss:Color="#D9EAD3" ss:Pattern="Solid"/></Style>
  <Style ss:ID="TotalMoney"><Font ss:Bold="1"/><Interior ss:Color="#D9EAD3" ss:Pattern="Solid"/><NumberFormat ss:Format="#,##0.00 [$€-40C]"/></Style>
  <Style ss:ID="Money"><NumberFormat ss:Format="#,##0.00 [$€-40C]"/></Style>
 </Styles>
 <Worksheet ss:Name="Bilan mensuel"><Table>${rows1}</Table></Worksheet>
 <Worksheet ss:Name="Patients"><Table>${rows2}</Table></Worksheet>
 <Worksheet ss:Name="Détail complet"><Table>${detailColumns}${zebra(rows3)}</Table></Worksheet>
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
migrateNgapRateDefaults();
setupSelectors(); render();
