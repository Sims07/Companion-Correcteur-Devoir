import type { MethodGuideIllustration } from '../../domain/radarMethodGuideCatalog.ts';

/** Deliberately SVG rather than a raster screenshot: vector scenes stay sharp,
 * responsive and explain the actual observation protocol (not a model verdict). */
const titles: Record<MethodGuideIllustration, string> = {
  'direct-correction': 'Schéma scientifique et barème fournis directement au LLM multimodal, qui produit les critères, justifications et note',
  'small-tips': 'Pointe de flèche candidate repérée au bout du trait ADN vers ARN, puis vérification par Vision',
  'long-shafts': 'Hampe fine et longue suivie jusqu’à une tête possible, avec exemple de faux signal',
  'direct-graph': 'Transformation du dessin visible en nœuds et relations déclarés par le modèle Vision',
  guided: 'Contrôle successif des extrémités, du tracé, de la pointe et des contours',
  'graph-first': 'Chaîne séparant observation du graphe et décisions selon le barème',
  'question-contracts': 'Correction d’une réponse à l’aide de trois attendus indépendants',
  'standard-rubric': 'Confrontation d’une réponse au barème standard et comparaison des critères',
  'historical-pilot': 'Campagnes archivées avec leur date, protocole et référence',
};

function Node({ x, y, width, label, tone = 'blue' }: {
  x: number; y: number; width: number; label: string; tone?: 'blue' | 'violet' | 'green';
}) {
  const colors = {
    blue: { fill: '#e0efff', stroke: '#2663b6' },
    violet: { fill: '#f0e5ff', stroke: '#8050b8' },
    green: { fill: '#e6f6ee', stroke: '#218660' },
  }[tone];
  return <g>
    <rect x={x} y={y} width={width} height="52" rx="13" fill={colors.fill} stroke={colors.stroke} strokeWidth="2"/>
    <text x={x + width / 2} y={y + 33} textAnchor="middle" fontSize="20" fontWeight="700" fill="#1a3152">{label}</text>
  </g>;
}
function Tag({ x, y, width, label, tone = 'purple' }: {
  x: number; y: number; width: number; label: string; tone?: 'purple' | 'blue' | 'green' | 'amber';
}) {
  const shades = {
    purple: ['#f0e3ff', '#6335a1'],
    blue: ['#e1eeff', '#1754a3'],
    green: ['#e2f5ea', '#1e754d'],
    amber: ['#fff1d9', '#875613'],
  }[tone];
  return <g>
    <rect x={x} y={y} width={width} height="32" rx="11" fill={shades[0]} stroke={shades[1]} strokeOpacity=".38"/>
    <text x={x + width / 2} y={y + 21} fill={shades[1]} fontSize="15" textAnchor="middle" fontWeight="650">{label}</text>
  </g>;
}
function BaseBiologyDrawing() {
  return <g>
    <rect x="42" y="62" width="676" height="257" rx="92" fill="#eef6ff" stroke="#93b9f6" strokeWidth="2.5"/>
    <ellipse cx="231" cy="194" rx="168" ry="104" fill="#f1e8fc" stroke="#bc9de3" strokeWidth="2.5"/>
    <text x="74" y="92" fontSize="15" fontWeight="650" fill="#46618a">Cellule · schéma simplifié</text>
    <text x="109" y="124" fontSize="15" fontWeight="650" fill="#7555a6">Noyau</text>
    <Node x={95} y={170} width={121} label="ADN"/>
    <Node x={383} y={170} width={126} label="ARN" tone="violet"/>
    <Node x={583} y={170} width={118} label="Protéine" tone="green"/>
    <path d="M218 196 H370" stroke="#263d59" strokeWidth="6" strokeLinecap="round" markerEnd="url(#lab-guide-arrow)"/>
    <path d="M512 196 H571" stroke="#263d59" strokeWidth="6" strokeLinecap="round" markerEnd="url(#lab-guide-arrow)"/>
  </g>;
}
function SmallTips() {
  return <>
    <BaseBiologyDrawing/>
    <circle cx="370" cy="196" r="24" fill="#f6edff" fillOpacity=".45" stroke="#8a49d1" strokeWidth="3.5" strokeDasharray="5 4"/>
    <Tag x={280} y={117} width={159} label="Pointe candidate"/>
    <path d="M360 149 L370 172" stroke="#8a49d1" strokeWidth="2.5"/>
    <Tag x={252} y={237} width={113} label="Hampe suivie" tone="blue"/>
    <path d="M319 237 L302 198" stroke="#2869bb" strokeWidth="2.3"/>
    <path d="M358 218 L528 345" stroke="#a363d5" strokeDasharray="6 5" strokeWidth="2"/>
    <path d="M314 219 L219 340" stroke="#568bd3" strokeDasharray="6 5" strokeWidth="2"/>
    <circle cx="213" cy="377" r="63" fill="white" stroke="#6b91cf" strokeWidth="3"/>
    <path d="M165 378 H261" stroke="#28415f" strokeWidth="12" strokeLinecap="round"/>
    <circle cx="527" cy="377" r="63" fill="white" stroke="#9862d7" strokeWidth="3"/>
    <path d="M480 377 H532" stroke="#28415f" strokeWidth="12" strokeLinecap="round"/>
    <path d="M541 352 L573 377 L541 402 Z" fill="#35465e" stroke="#9960d4" strokeWidth="3"/>
    <Tag x={138} y={327} width={151} label="Trait fin observé" tone="blue"/>
    <Tag x={459} y={327} width={167} label="Extrémité agrandie"/>
    <Tag x={280} y={415} width={203} label="Indice → vérification Vision" tone="green"/>
  </>;
}
function LongShafts() {
  return <>
    <BaseBiologyDrawing/>
    <rect x="232" y="183" width="126" height="26" rx="8" fill="#bcdffb" fillOpacity=".38" stroke="#2673ba" strokeDasharray="7 5" strokeWidth="2.5"/>
    <circle cx="369" cy="196" r="22" fill="none" stroke="#276abe" strokeWidth="3"/>
    <Tag x={224} y={117} width={181} label="Hampe fine et longue" tone="blue"/>
    <path d="M310 150 L310 181" stroke="#276abe" strokeWidth="2"/>
    <Tag x={404} y={239} width={176} label="Tête élargie possible"/>
    <path d="M447 238 L371 211" stroke="#8a49d1" strokeWidth="2.5"/>
    <Tag x={73} y={338} width={184} label="Trait court : insuffisant" tone="amber"/>
    <line x1="104" y1="392" x2="151" y2="392" stroke="#a77951" strokeWidth="7" strokeLinecap="round"/>
    <path d="M151 382 L168 392 L151 402 Z" fill="#a77951"/>
    <path d="M184 382 L202 402 M202 382 L184 402" stroke="#bf7148" strokeWidth="3"/>
    <Tag x={318} y={338} width={211} label="Hampe régulière : candidat" tone="green"/>
    <path d="M360 392 H490" stroke="#2e6e9f" strokeWidth="7" strokeLinecap="round"/>
    <path d="M489 380 L509 392 L489 404 Z" fill="#2e6e9f"/>
    <circle cx="500" cy="392" r="21" stroke="#3a9b73" strokeWidth="2.5" fill="none"/>
    <Tag x={557} y={359} width={152} label="Vision vérifie" tone="purple"/>
  </>;
}
function DirectGraph() {
  return <>
    <Tag x={61} y={49} width={245} label="1 · Image observée" tone="blue"/>
    <rect x="47" y="101" width="295" height="267" rx="22" fill="#f2f7ff" stroke="#c8d9f0" strokeWidth="2"/>
    <Node x={85} y={165} width={107} label="ADN"/>
    <Node x={221} y={165} width={107} label="ARN" tone="violet"/>
    <path d="M192 191 H209" stroke="#293f5d" strokeWidth="5" markerEnd="url(#lab-guide-arrow)"/>
    <text x="194" y="267" textAnchor="middle" fontSize="16" fill="#44627d">Lire le sens</text>
    <text x="194" y="290" textAnchor="middle" fontSize="16" fill="#44627d">réel de la flèche</text>
    <path d="M359 223 H431" stroke="#7e5ac7" strokeWidth="3.5" markerEnd="url(#lab-guide-arrow-purple)"/>
    <Tag x={441} y={49} width={246} label="2 · Graphe proposé"/>
    <rect x="436" y="101" width="274" height="267" rx="22" fill="#f8f4ff" stroke="#d6c5ef" strokeWidth="2"/>
    <circle cx="511" cy="179" r="34" fill="#e1eeff" stroke="#2867b2" strokeWidth="2"/>
    <circle cx="634" cy="179" r="34" fill="#f0e4ff" stroke="#8653b8" strokeWidth="2"/>
    <text x="511" y="185" textAnchor="middle" fontSize="16" fontWeight="700" fill="#173752">ADN</text>
    <text x="634" y="185" textAnchor="middle" fontSize="16" fontWeight="700" fill="#173752">ARN</text>
    <path d="M546 179 H592" stroke="#533da6" strokeWidth="4" markerEnd="url(#lab-guide-arrow-purple)"/>
    <text x="574" y="264" textAnchor="middle" fontSize="17" fill="#543d79">nœuds + relation</text>
    <Tag x={479} y={294} width={191} label="À comparer au témoin" tone="amber"/>
    <Tag x={226} y={397} width={311} label="Aucun détecteur local de pointes" tone="blue"/>
  </>;
}
function Guided() {
  const boxes = [
    { x: 38, no: '01', title: 'Extrémités', info: 'Identifier A et B' },
    { x: 222, no: '02', title: 'Tracé', info: 'Suivre la ligne' },
    { x: 406, no: '03', title: 'Pointe', info: 'Vérifier le sens' },
    { x: 590, no: '04', title: 'Contours', info: 'Vérifier inclusion' },
  ];
  return <>
    {boxes.map(({ x, no, title, info }) => <g key={no}>
      <rect x={x} y="101" width="170" height="254" rx="19" fill="#f5f8ff" stroke="#c3d6ee" strokeWidth="2"/>
      <Tag x={x + 13} y={116} width={54} label={no} tone="blue"/>
      <text x={x + 85} y="175" textAnchor="middle" fontSize="20" fontWeight="700" fill="#1c3555">{title}</text>
      <text x={x + 85} y="321" textAnchor="middle" fontSize="15" fill="#52647a">{info}</text>
      {no === '01' && <g><circle cx={x+47} cy="236" r="20" fill="#dceafd" stroke="#3573bf" strokeWidth="2"/><circle cx={x+127} cy="236" r="20" fill="#eadbfc" stroke="#8154bb" strokeWidth="2"/><path d={`M${x+68} 236 H${x+106}`} stroke="#283f61" strokeWidth="4"/></g>}
      {no === '02' && <g><path d={`M${x+28} 251 H${x+142}`} stroke="#316fae" strokeWidth="5" strokeDasharray="13 6"/><circle cx={x+27} cy="251" r="7" fill="#316fae"/><circle cx={x+144} cy="251" r="7" fill="#316fae"/></g>}
      {no === '03' && <g><path d={`M${x+27} 245 H${x+121}`} stroke="#2b435e" strokeWidth="6"/><path d={`M${x+120} 231 L${x+148} 245 L${x+120} 259 Z`} fill="#8a50bf"/><circle cx={x+133} cy="245" r="32" fill="none" stroke="#9c5ad3" strokeWidth="3"/></g>}
      {no === '04' && <g><ellipse cx={x+84} cy="242" rx="58" ry="44" fill="#e7f0ff" stroke="#4475b6" strokeWidth="3"/><circle cx={x+84} cy="242" r="22" fill="#f1e3ff" stroke="#9862bc" strokeWidth="3"/></g>}
    </g>)}
    <Tag x={166} y={383} width={429} label="Examiner chaque trait sans recopier le sens du précédent" tone="purple"/>
  </>;
}
function DirectCorrection() {
  return <>
    <rect x="39" y="107" width="211" height="232" rx="21" fill="#eff6ff" stroke="#a5c5ed" strokeWidth="2"/>
    <Tag x={60} y={124} width={169} label="Image du schéma" tone="blue"/>
    <Node x={62} y={211} width={74} label="ADN"/>
    <Node x={155} y={211} width={73} label="ARN" tone="violet"/>
    <path d="M138 236 H150" stroke="#263d59" strokeWidth="3" markerEnd="url(#lab-guide-arrow)"/>
    <Tag x={61} y={283} width={167} label="Barème fourni" tone="green"/>
    <rect x="310" y="160" width="176" height="120" rx="22" fill="#f0e5ff" stroke="#8f6ac0" strokeWidth="2.5"/>
    <text x="398" y="211" textAnchor="middle" fontSize="23" fontWeight="700" fill="#53358c">LLM</text>
    <text x="398" y="238" textAnchor="middle" fontSize="15" fill="#53358c">multimodal</text>
    <path d="M256 222 H302 M493 222 H526" stroke="#5e61a7" strokeWidth="4" markerEnd="url(#lab-guide-arrow-purple)"/>
    <rect x="535" y="107" width="190" height="232" rx="20" fill="#eaf7f0" stroke="#74b594" strokeWidth="2"/>
    <Tag x={554} y={124} width={152} label="Correction" tone="green"/>
    {['Critère 1  ✓', 'Critère 2  ✕', 'Note :  /10'].map((label, i) =>
      <text key={label} x="555" y={201 + i * 43} fontSize="18" fill="#2a5d4b" fontWeight="600">{label}</text>)}
    <Tag x={210} y={384} width={350} label="Sans OCR ni extraction de graphe" tone="amber"/>
  </>;
}
function GraphFirst() {
  const stages = [
    {x:46, title:'Image', subtitle:'Pixels du dessin', tone:'blue' as const},
    {x:290, title:'Graphe observé', subtitle:'Nœuds + relations', tone:'purple' as const},
    {x:535, title:'Barème', subtitle:'Décision par critère', tone:'green' as const},
  ];
  return <>
    {stages.map(s => <g key={s.title}>
      <rect x={s.x} y="110" width="194" height="239" rx="20" fill="#fff" stroke="#c6d6ed" strokeWidth="2"/>
      <Tag x={s.x + 18} y={124} width={158} label={s.title} tone={s.tone}/>
      <text x={s.x+97} y="317" fontSize="15" fill="#486078" textAnchor="middle">{s.subtitle}</text>
    </g>)}
    <Node x={70} y={200} width={64} label="ADN"/>
    <Node x={154} y={200} width={67} label="ARN" tone="violet"/>
    <path d="M135 224 H146" stroke="#263e5a" strokeWidth="3.5" markerEnd="url(#lab-guide-arrow)"/>
    <circle cx="345" cy="222" r="21" fill="#e0edff" stroke="#2d69b0" strokeWidth="2"/>
    <circle cx="424" cy="222" r="21" fill="#eee1fb" stroke="#8654b7" strokeWidth="2"/>
    <path d="M365 222 H397" stroke="#5b4797" strokeWidth="3" markerEnd="url(#lab-guide-arrow-purple)"/>
    <path d="M556 209 H700 M556 242 H681 M556 275 H660" stroke="#9bb7d8" strokeWidth="9" strokeLinecap="round"/>
    <circle cx="687" cy="276" r="11" fill="#d4efe1" stroke="#32996f" strokeWidth="2"/>
    <path d="M241 226 H281 M485 226 H526" stroke="#6c68b1" strokeWidth="3" markerEnd="url(#lab-guide-arrow-purple)"/>
    <Tag x={198} y={378} width={363} label="Une erreur de lecture se propage à la note" tone="amber"/>
  </>;
}
function Contracts() {
  return <>
    <rect x="55" y="82" width="278" height="287" rx="21" fill="#eff6ff" stroke="#b7cde9" strokeWidth="2"/>
    <Tag x={80} y={101} width={225} label="Réponse de l’étudiant" tone="blue"/>
    <text x="86" y="180" fill="#243d5d" fontSize="20" fontWeight="650">La cellule possède</text>
    <text x="86" y="212" fill="#243d5d" fontSize="20" fontWeight="650">un noyau contenant</text>
    <text x="86" y="244" fill="#243d5d" fontSize="20" fontWeight="650">de l’ADN.</text>
    <path d="M341 224 H406" stroke="#7b5bb0" strokeWidth="3" markerEnd="url(#lab-guide-arrow-purple)"/>
    <Tag x={426} y={65} width={255} label="Contrats par question"/>
    {[{y:116,t:'Noyau présent',ok:true},{y:207,t:'ADN dans le noyau',ok:true},{y:298,t:'Autre attendu',ok:false}].map(({y,t,ok})=><g key={t}>
      <rect x="420" y={y} width="296" height="75" rx="16" fill="#fff" stroke="#c7d8ec" strokeWidth="2"/>
      <circle cx="457" cy={y+37} r="18" fill={ok?'#ddf4e8':'#fff2d9'} stroke={ok?'#36966d':'#b38a40'} strokeWidth="2"/>
      <text x="457" y={y+43} fontSize="19" fontWeight="750" textAnchor="middle" fill={ok?'#226b50':'#92641f'}>{ok?'✓':'?'}</text>
      <text x="486" y={y+44} fontSize="17" fontWeight="650" fill="#243d5d">{t}</text>
    </g>)}
    <Tag x={132} y={401} width={505} label="Chaque attendu contribue séparément au score de référence" tone="green"/>
  </>;
}
function Standard() {
  return <>
    <rect x="59" y="91" width="300" height="279" rx="22" fill="#eff6ff" stroke="#bad2ee" strokeWidth="2"/>
    <Tag x={94} y={110} width={232} label="Réponse à analyser" tone="blue"/>
    <text x="98" y="192" fontSize="20" fill="#24405f">Le noyau contient</text>
    <text x="98" y="227" fontSize="20" fill="#24405f">le matériel génétique.</text>
    <path d="M367 226 H416" stroke="#735eb5" strokeWidth="3" markerEnd="url(#lab-guide-arrow-purple)"/>
    <rect x="437" y="91" width="258" height="279" rx="22" fill="#faf6ff" stroke="#cfbce8" strokeWidth="2"/>
    <Tag x={465} y={110} width={201} label="Barème standard"/>
    {[['Notion 1', '… / 1'], ['Notion 2', '… / 1'], ['Notion 3', '… / 1']].map(([label,value],i)=><g key={label}>
      <rect x="462" y={176+i*55} width="208" height="43" rx="9" fill="#fff" stroke="#d4d9e8"/>
      <text x="477" y={202+i*55} fontSize="16" fill="#263e60">{label}</text>
      <text x="649" y={202+i*55} textAnchor="end" fontSize="16" fill="#8062ac" fontWeight="700">{value}</text>
    </g>)}
    <Tag x={164} y={405} width={437} label="Comparer aussi chaque critère, pas seulement la note" tone="amber"/>
  </>;
}
function Pilot() {
  return <>
    <rect x="65" y="78" width="627" height="291" rx="22" fill="#f5f8fd" stroke="#c6d5e6" strokeWidth="2"/>
    <Tag x={95} y={105} width={245} label="Campagnes archivées" tone="blue"/>
    <path d="M166 213 H592" stroke="#7592b5" strokeWidth="5" strokeLinecap="round"/>
    {[{x:174,y:190,label:'Essai A'},{x:372,y:174,label:'Essai B'},{x:571,y:190,label:'Essai C'}].map((e,i)=><g key={e.label}>
      <circle cx={e.x} cy="213" r="18" fill={i===1?'#e2d7f7':'#e1eeff'} stroke={i===1?'#8459b2':'#3675b8'} strokeWidth="3"/>
      <path d={`M${e.x} 233 V${e.y+50}`} stroke="#8cabc8" strokeDasharray="4 4"/>
      <Tag x={e.x-66} y={e.y+51} width={132} label={e.label} tone={i===1?'purple':'blue'}/>
    </g>)}
    <text x="379" y="320" textAnchor="middle" fill="#465e7a" fontSize="18">Conserver la date, le protocole et les références</text>
    <Tag x={182} y={400} width={396} label="L’historique n’est pas une méthode actuelle" tone="amber"/>
  </>;
}

export function RadarMethodIllustration({ kind }: { kind: MethodGuideIllustration }) {
  return <svg className="lab-guide-illustration" viewBox="0 0 760 465" role="img"
    data-illustration={kind} aria-label={titles[kind]}>
    <title>{titles[kind]}</title>
    <desc>Illustration pédagogique schématique, sans résultat issu d’une vraie copie.</desc>
    <defs>
      <marker id="lab-guide-arrow" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto" markerUnits="userSpaceOnUse">
        <path d="M0 0 L9 4.5 L0 9 Z" fill="#263d59"/>
      </marker>
      <marker id="lab-guide-arrow-purple" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto" markerUnits="userSpaceOnUse">
        <path d="M0 0 L9 4.5 L0 9 Z" fill="#7e5ac7"/>
      </marker>
    </defs>
    <rect x="3" y="3" width="754" height="458" rx="24" fill="#f9fbff" stroke="#dfebf6" strokeWidth="2"/>
    {kind === 'small-tips' && <SmallTips/>}
    {kind === 'long-shafts' && <LongShafts/>}
    {kind === 'direct-graph' && <DirectGraph/>}
    {kind === 'guided' && <Guided/>}
    {kind === 'graph-first' && <GraphFirst/>}
    {kind === 'direct-correction' && <DirectCorrection/>}
    {kind === 'question-contracts' && <Contracts/>}
    {kind === 'standard-rubric' && <Standard/>}
    {kind === 'historical-pilot' && <Pilot/>}
  </svg>;
}

export function RadarMethodThumbnail({ kind }: { kind: MethodGuideIllustration }) {
  const arrow = kind === 'small-tips' || kind === 'long-shafts';
  const graph = kind === 'direct-graph' || kind === 'graph-first';
  return <svg viewBox="0 0 80 80" className="lab-guide-thumbnail" aria-hidden="true" focusable="false">
    <rect x="1" y="1" width="78" height="78" rx="17" fill="#edf4ff"/>
    {arrow && <>
      <path d="M13 55 L59 30" stroke="#365d84" strokeWidth={kind==='long-shafts'?6:4} strokeLinecap="round"/>
      <path d="M49 22 L67 25 L59 44 Z" fill={kind==='small-tips'?'#9751ca':'#3477ba'}/>
      {kind === 'small-tips' && <circle cx="59" cy="31" r="18" stroke="#9855c5" strokeWidth="2" fill="none" strokeDasharray="4 3"/>}
    </>}
    {graph && <>
      <path d="M23 55 L40 23 L59 55 Z" fill="none" stroke="#6895d6" strokeWidth="4"/>
      <circle cx="40" cy="23" r="9" fill="#cdb5f1" stroke="#7852b0" strokeWidth="2"/>
      <circle cx="23" cy="55" r="9" fill="#bcd8fc" stroke="#3772bd" strokeWidth="2"/>
      <circle cx="59" cy="55" r="9" fill="#bcd8fc" stroke="#3772bd" strokeWidth="2"/>
    </>}
    {kind === 'direct-correction' && <>
      <rect x="11" y="16" width="23" height="42" rx="5" fill="#d8e9ff" stroke="#3772bd" strokeWidth="2"/>
      <path d="M16 28 H29 M16 35 H29 M16 42 H25" stroke="#3772bd" strokeWidth="2"/>
      <path d="M37 37 H46 M43 33 L47 37 L43 41" stroke="#7254ae" strokeWidth="2.5" fill="none"/>
      <rect x="50" y="19" width="22" height="35" rx="5" fill="#e0f4e9" stroke="#328968" strokeWidth="2"/>
      <path d="M55 35 L60 41 L68 29" stroke="#328968" strokeWidth="3" fill="none"/>
    </>}
    {(kind === 'guided' || kind === 'question-contracts' || kind === 'standard-rubric') && <>
      {[23,40,57].map((y,i)=><g key={y}>
        <rect x="15" y={y-8} width="18" height="18" rx="5" fill={i===2?'#eee0fa':'#d9f3e5'} stroke={i===2?'#9c67b8':'#4a9770'} strokeWidth="2"/>
        {i!==2 && <path d={`M20 ${y} l4 4 7 -9`} fill="none" stroke="#2d8662" strokeWidth="2.5"/>}
        <path d={`M39 ${y} H66`} stroke="#8aa6c5" strokeWidth="4" strokeLinecap="round"/>
      </g>)}
    </>}
    {kind === 'historical-pilot' && <>
      <path d="M13 47 H67" stroke="#86a2c2" strokeWidth="4"/>
      {[19,40,61].map((x,i)=><circle key={x} cx={x} cy="47" r="8" fill={i===1?'#bea5e6':'#a8c7ef'} stroke="#537db4" strokeWidth="2"/>)}
    </>}
  </svg>;
}
