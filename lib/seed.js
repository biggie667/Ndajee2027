// Jeu de démonstration (déterministe) chargé à la création de la base.
const PERMS=['view','edit','review','access','matrix','print','export','admin'];
function rng(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

/* ============ Données de démonstration ============ */
function seed(){
  const r=rng(2026),pick=a=>a[Math.floor(r()*a.length)];
  const cats=[
   {c:'ATH',l:'Athlète',b:'ATHLÈTE',col:'#1D4ED8',pop:'ath'},
   {c:'OFE',l:"Officiel d'équipe",b:'ÉQUIPE',col:'#0E7490',pop:'ath'},
   {c:'CDM',l:'Chef de mission',b:'CHEF DE MISSION',col:'#5B3FC4',pop:'ath'},
   {c:'FI',l:'Fédération internationale',b:'FÉD. INTERNATIONALE',col:'#B45309',pop:'fi'},
   {c:'FN',l:'Fédération nationale',b:'FÉD. NATIONALE',col:'#047857',pop:'fn'},
   {c:'STF',l:'Staff',b:'STAFF',col:'#E3000F',pop:'staff'},
   {c:'MED',l:'Média',b:'PRESSE',col:'#BE185D',pop:'media'},
   {c:'VOL',l:'Volontaire',b:'VOLONTAIRE',col:'#A16207',pop:'vol'}];
  const zones=[
   {c:'ALL',n:'Tous les sites de compétition'},{c:'CED',n:'Complexe Équestre de Diamniadio'},{c:'CID',n:'Complexe Iba Mar Diop'},
   {c:'COR',n:'Corniche Ouest'},{c:'CTO',n:"Complexe Tour de l'Œuf"},{c:'DAR',n:'Dakar Arena'},{c:'DEX',n:'Dakar Expo Centre'},{c:'DHQ',n:'Siège – Dakar',o:1}];
  const privs=[{c:'1',n:'Tribune officielle'},{c:'2',n:'Zones de préparation des athlètes'},{c:'3',n:'Zones presse / médias'},{c:'4',n:'Zones protocole & invités'},{c:'5',n:'Zone résidentielle (village)'}];
  const matrix={
   ATH:{z:['ALL'],p:['2','5'],m:1},OFE:{z:['ALL'],p:['2','5'],m:1},CDM:{z:['ALL'],p:['1','2','4','5'],m:1},
   FI:{z:['ALL'],p:['1','2','4'],m:0},FN:{z:['ALL'],p:['1','2'],m:0},
   STF:{z:zones.map(z=>z.c),p:['1','2','3','4','5'],m:1},MED:{z:['ALL'],p:['3'],m:0},VOL:{z:['DAR','DEX'],p:[],m:1}};
  const LN=['Diallo','Ndiaye','Sarr','Fall','Diop','Ba','Sow','Gueye','Faye','Mbaye','Cissé','Kane','Sy','Thiam','Diagne','Seck','Camara','Traoré','Koné','Okafor','Mensah','Kamau','Martin','Dubois','Silva','Tanaka','Bennani','Haddad','Nkosi','Mwangi','Rossi','García','Müller','Smith','Lee'];
  const FN_F=['Astou','Aïssatou','Fatou','Mariama','Khady','Awa','Coumba','Ndèye','Aminata','Rokhaya','Claire','Yuki','Amara','Leïla','Sofia','Grace','Zainab','Nadia'];
  const FN_M=['Mamadou','Moussa','Ibrahima','Ousmane','Cheikh','Abdou','Babacar','Modou','Pape','Alioune','Lucas','Kenji','Kwame','Youssef','Mateo','David','Tunde','Karim'];
  const CNO=['Sénégal','France','Kenya','Brésil','Japon','Maroc','Nigeria','Canada','Côte d\'Ivoire','Italie','Allemagne','Afrique du Sud','Espagne','Ghana'];
  const SPORT=['Athlétisme','Natation','Basketball 3x3','Judo','Escrime','Lutte','Football','Handball','Taekwondo','Cyclisme','Équitation','Aviron'];
  const ORG={
   FI:['World Athletics','World Aquatics','FIBA','IJF','FIE','UWW','UCI','World Rowing','FEI','World Taekwondo'],
   FN:['Féd. Sénégalaise d\'Athlétisme','Féd. Sénégalaise de Natation','Féd. Sénégalaise de Basketball','Féd. Sénégalaise de Judo','Féd. Sénégalaise de Lutte','Féd. Sénégalaise de Football','Féd. Sénégalaise d\'Escrime'],
   STF:['Accréditation','Opérations sites','Logistique','Transport','Protocole','Technologie','Services médicaux','Communication'],
   MED:['RTS','APS','Le Soleil','AFP','BBC Afrique','Canal+ Afrique','L\'Équipe','Reuters'],
   VOL:['Pool Dakar','Pool Diamniadio','Pool Saly']};
  const FCT={OFE:['Entraîneur','Entraîneur adjoint','Médecin d\'équipe','Kinésithérapeute','Chef d\'équipe'],CDM:['Chef de mission','Chef de mission adjoint'],
   FI:['Délégué technique','Juge-arbitre','Officiel technique','Président de jury'],FN:['Officiel technique national','Secrétaire général','Directeur technique'],
   STF:['Personnel','Coordinateur','Responsable de site','Superviseur','Agent d\'accueil'],MED:['Journaliste','Photographe','Cameraman','Commentateur'],
   VOL:['Accueil','Orientation spectateurs','Assistance délégations','Support logistique']};
  const plan=[['ATH',70],['OFE',22],['CDM',8],['FI',20],['FN',18],['STF',30],['MED',24],['VOL',48]];
  const persons=[];let seq=210700;
  for(const[c,n]of plan)for(let i=0;i<n;i++){
    const sx=r()<.5?'F':'M',team=['ATH','OFE','CDM'].includes(c);
    const x=r(),st=x<.10?'DLV':x<.28?'PRT':x<.55?'APP':x<.77?'SUB':x<.83?'RET':x<.86?'REJ':'DRAFT';
    const early=['DRAFT','SUB','RET'].includes(st);
    const y=c==='ATH'?2008+Math.floor(r()*4):1964+Math.floor(r()*40);
    const p={id:(seq+=1+Math.floor(r()*37))+'-'+(10+Math.floor(r()*80)),ln:pick(LN),fn:pick(sx==='F'?FN_F:FN_M),sx,
      dob:`${y}-${String(1+Math.floor(r()*12)).padStart(2,'0')}-${String(1+Math.floor(r()*28)).padStart(2,'0')}`,
      cat:c,org:team?pick(CNO):pick(ORG[c]),fct:c==='ATH'?pick(SPORT):pick(FCT[c]),
      nat:'',photo:'',hasPh:!(early&&r()<.3),doc:!(early&&r()<.2),
      bg:early?(r()<.55?'PEND':r()<.06?'FLAG':'OK'):'OK',st,xz:[],xp:[],xm:0,note:''};
    p.nat=team?p.org:c==='FI'||c==='MED'?pick(CNO):'Sénégal';
    if(c==='ATH'&&early&&r()<.06)p.dob='2004'+p.dob.slice(4);
    if(early&&r()<.05)p.dob='';
    persons.push(p);
  }
  // deux doublons volontaires pour la revue
  const d1=persons.find(p=>p.st==='SUB'&&p.cat==='VOL'),d2=persons.find(p=>p.st==='SUB'&&p.cat==='MED');
  [d1,d2].forEach((s,i)=>{if(s)persons.push({...s,id:(seq+=11+i)+'-'+(31+i),st:'SUB',xz:[],xp:[]})});
  const roles={Administrateur:PERMS,'Responsable ACR':['view','edit','review','access','matrix','print','export'],Validateur:['view','review','export'],
   'Opérateur d\'impression':['view','print'],'Représentant d\'organisation':['view','edit'],'Lecture seule':['view']};
  const users=[
   {id:'u1',n:'Admin Test',e:'admin@ndaje.test',role:'Administrateur',org:'DG Groupe',on:1},
   {id:'u2',n:'Validateur Test',e:'validateur@ndaje.test',role:'Validateur',org:'Accréditation',on:1},
   {id:'u3',n:'Impression Test',e:'impression@ndaje.test',role:'Opérateur d\'impression',org:'Centre ACR',on:1},
   {id:'u4',n:'Représentant Test',e:'representant@ndaje.test',role:'Représentant d\'organisation',org:'France',on:1}];
  const appd=persons.filter(p=>['APP','PRT'].includes(p.st));
  const mk=(i,type,code,motif,st)=>({id:'AA-'+String(i+1).padStart(3,'0'),pid:appd[i*7%appd.length].id,type,code,motif,by:'Représentant Test',t:Date.now()-(i+1)*86400000*.8,st,dec:st==='PEND'?'':'Admin Test'});
  const reqs=[mk(0,'zone','DHQ','Réunions de coordination quotidiennes au siège','PEND'),mk(1,'priv','3','Interviews en zone mixte','PEND'),mk(2,'priv','1','Accompagnement d\'une délégation officielle','PEND'),
   mk(3,'zone','CED','Renfort sur les épreuves équestres','PEND'),mk(4,'meal','','Présence sur site supérieure à 6 h','PEND'),mk(5,'priv','4','Mission protocole','OK'),
   mk(6,'zone','DEX','Affectation modifiée','OK'),mk(7,'priv','5','Demande non justifiée par la fonction','NO')];
  reqs.filter(q=>q.st==='OK').forEach(q=>{const p=persons.find(x=>x.id===q.pid);if(q.type==='zone')p.xz.push(q.code);else if(q.type==='priv')p.xp.push(q.code)});
  const audit=[{t:Date.now(),u:'Système',a:'Initialisation',d:'Base créée avec le jeu de démonstration',pid:''}];
  return{cats,zones,privs,matrix,persons,roles,users,reqs,audit,
   tpl:{bar:'#15803D',ev:'NDAGE 2026',sub:'Dakar · Sénégal',showEv:1,showZ:1,showM:1,showLeg:1,gen:'Zones de circulation générale'}};
}

module.exports={seed,PERMS};
