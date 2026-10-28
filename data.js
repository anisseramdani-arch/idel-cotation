// Catalogue initial basé sur la NGAP Assurance Maladie du 01/09/2026.
// Cette liste est volontairement limitée aux actes dont le libellé et le coefficient
// ont été relevés dans le texte officiel. Elle ne remplace pas la nomenclature complète.
const APP_DATA = {
  version: '18.0',
  ngapReference: '2026-09-01',
  months: ['Août 2026','Septembre 2026','Octobre 2026','Novembre 2026','Décembre 2026'].map(label => ({label})),
  retrocessionRate: 0.1,
  rates: {
    passages: 2.75, dim: 8.50, bs: 8.83, night: 9.15,
    AMI: 3.15, AMX: 3.15, AIS: 2.65, BSI: 13.00,
    BSA: 13.00, BSB: 18.20, BSC: 28.70,
    DI: 10.00, MAU: 1.35, MCI: 5.00,
    IFD: 2.75, IFI: 2.75, MIE: 3.15
  },
  rateSchedule: {
    AMI: [{from:'2026-01-01',metro:3.15,drom:3.30},{from:'2026-11-06',metro:3.35},{from:'2027-11-01',metro:3.45}],
    AMX: [{from:'2026-01-01',metro:3.15,drom:3.30},{from:'2026-11-06',metro:3.35},{from:'2027-11-01',metro:3.45}]
  },
  // Les actes patients sont enregistrés dans le stockage local du navigateur.
  // Ne pas embarquer de données nominatives dans ce fichier public.
  patients: [],
  actCatalog: [
    {id:'venipuncture',label:'Prélèvement par ponction veineuse directe',code:'AMI',coefficient:1.5,article:'Titre XVI, chapitre I, article 1',cumul:'blood'},
    {id:'sample',label:'Prélèvement aseptique cutané / sécrétions / selles / urine',code:'AMI',coefficient:1,article:'Titre XVI, chapitre I, article 1'},
    {id:'bleeding',label:'Saignée',code:'AMI',coefficient:5,article:'Titre XVI, chapitre I, article 1'},
    {id:'iv-isolated',label:'Injection intraveineuse directe isolée',code:'AMI',coefficient:2,article:'Titre XVI, chapitre I, article 1'},
    {id:'iv-series',label:'Injection intraveineuse directe en série',code:'AMI',coefficient:1.5,article:'Titre XVI, chapitre I, article 1'},
    {id:'im',label:'Injection intramusculaire',code:'AMI',coefficient:1,article:'Titre XVI, chapitre I, article 1',cumul:'injection'},
    {id:'sc',label:'Injection sous-cutanée',code:'AMI',coefficient:1,article:'Titre XVI, chapitre I, article 1',cumul:'injection'},
    {id:'id',label:'Injection intradermique',code:'AMI',coefficient:1,article:'Titre XVI, chapitre I, article 1',cumul:'injection'},
    {id:'dressing-current',label:'Pansement de plaie non chirurgicale',code:'AMI',coefficient:2.02,article:'Titre XVI, chapitre I, article 2'},
    {id:'dressing-surgical',label:'Pansement de plaie chirurgicale simple',code:'AMI',coefficient:2.02,article:'Titre XVI, chapitre I, article 2'},
    {id:'dressing-complex',label:'Pansement lourd et complexe (acte à préciser selon indication)',code:'AMI',coefficient:4,article:'Titre XVI, chapitre I, article 3',cumul:'dressing-bsi'},
    {id:'topical-analgesia',label:'Analgésie topique préalable à un pansement d’ulcère ou d’escarre',code:'AMI',coefficient:1.1,article:'Titre XVI, chapitre I, article 3',cumul:'topical'},
    {id:'catheter-care',label:'Séance d’entretien de cathéter',code:'AMI',coefficient:4,article:'Titre XVI, chapitre II, article 1'},
    {id:'aerosol',label:'Séance d’aérosol',code:'AMI',coefficient:1.5,article:'Titre XVI, chapitre II, article 5'},
    {id:'perfusion-short',label:'Forfait pour séance de perfusion courte (≤ 1 h), surveillance continue',code:'AMI',coefficient:9,article:'Titre XVI, chapitre II, article 3',cumul:'perfusion-bsi'},
    {id:'perfusion-long',label:'Forfait perfusion > 1 h avec organisation d’une surveillance',code:'AMI',coefficient:14,article:'Titre XVI, chapitre II, article 3',cumul:'perfusion-bsi'},
    {id:'perfusion-stop',label:'Forfait arrêt et retrait du dispositif de perfusion',code:'AMI',coefficient:5,article:'Titre XVI, chapitre II, article 3'},
    {id:'perfusion-monitor',label:'Organisation de la surveillance d’une perfusion (par jour)',code:'AMI',coefficient:4,article:'Titre XVI, chapitre II, article 3'},
    {id:'heart-failure',label:'Surveillance clinique après hospitalisation (insuffisance cardiaque / BPCO)',code:'AMI',coefficient:5.8,article:'Titre XVI, chapitre II, article 5 ter',cumul:'bsi-full'},
    {id:'bsa',label:'Forfait journalier dépendance léger',code:'BSA',coefficient:1,article:'NGAP, dispositions générales, article 23.3',cumul:'package'},
    {id:'bsb',label:'Forfait journalier dépendance intermédiaire',code:'BSB',coefficient:1,article:'NGAP, dispositions générales, article 23.3',cumul:'package'},
    {id:'bsc',label:'Forfait journalier dépendance lourd',code:'BSC',coefficient:1,article:'NGAP, dispositions générales, article 23.3',cumul:'package'},
    {id:'ami-free',label:'Acte AMI (choisir le libellé exact dans la NGAP)',code:'AMI',coefficient:1,article:'À préciser dans la NGAP',cumul:'unknown'},
    {id:'amx-free',label:'Acte AMX autorisé dans le plan de soins dépendance',code:'AMX',coefficient:1,article:'À préciser dans la NGAP',cumul:'unknown'},
    {id:'ais-free',label:'Acte AIS (ancienne cotation, à confirmer)',code:'AIS',coefficient:1,article:'À confirmer dans la NGAP',cumul:'unknown'},
    {id:'di-bsi-initial',label:'Saisie BSI initiale (DI 2,5)',code:'DI',coefficient:2.5,article:'Ameli – BSI, facturation'},
    {id:'di-bsi-renewal',label:'Saisie BSI renouvelable/intermédiaire (DI 1,2)',code:'DI',coefficient:1.2,article:'Ameli – BSI, facturation'},
    {id:'mau',label:'Majoration acte unique (conditions NGAP à vérifier)',code:'MAU',coefficient:1,article:'NGAP, dispositions générales, article 23.1'},
    {id:'mci',label:'Majoration de coordination infirmière (conditions NGAP à vérifier)',code:'MCI',coefficient:1,article:'NGAP, dispositions générales, article 23.2'},
    {id:'custom',label:'Acte libre — libellé et lettre-clé à préciser',code:'AMI',coefficient:1,article:'À vérifier dans la NGAP',cumul:'unknown'}
  ]
};
