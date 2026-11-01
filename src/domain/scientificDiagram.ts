import type { Rubric } from './rubric.ts';

export const SCIENTIFIC_DIAGRAM_QUALITY_DIMENSIONS = ['title', 'scientific-accuracy', 'completeness', 'labels', 'arrows-relations', 'organization-conventions', 'legibility'] as const;
export type ScientificDiagramQualityDimension = typeof SCIENTIFIC_DIAGRAM_QUALITY_DIMENSIONS[number];
export type ScientificDiagramQualityStatus = 'fulfilled' | 'partial' | 'missing' | 'not-applicable' | 'uncertain';

export interface ScientificDiagramQualityAssessment {
  dimension: ScientificDiagramQualityDimension;
  status: ScientificDiagramQualityStatus;
  evidence: string;
}

export interface DiagramCriterionAssessment {
  criterionId: string;
  title: string;
  points: number;
  maxPoints: number;
  evidence: string;
  confidence: number;
  requiresTeacherReview: boolean;
  diagramIds?: string[];
  elements?: Array<{ label: string; status: 'present' | 'partial' | 'absent' | 'uncertain'; evidence: string; points: number; maxPoints: number }>;
  /** Detailed explanation for criteria explicitly marked as scientific-diagram. */
  qualityBreakdown?: ScientificDiagramQualityAssessment[];
}

export interface ScientificDiagramFinding {
  id: string;
  pageNumber: number;
  bounds?: { x: number; y: number; width: number; height: number };
  diagramType: string;
  summary: string;
  criteria: DiagramCriterionAssessment[];
  uncertainties: string[];
}

export interface ScientificDiagramAnalysis {
  diagrams: ScientificDiagramFinding[];
  criteria?: DiagramCriterionAssessment[];
  overallUncertainties: string[];
  warnings?: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Extract one complete JSON object from common local-model wrappers without relaxing schema validation. */
function extractModelJsonObject(raw: string): string {
  const withoutThinking = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const fenced = withoutThinking.replace(/^\u0060{3}(?:json)?\s*/i, '').replace(/\s*\u0060{3}$/, '');
  const start = fenced.indexOf('{');
  if (start < 0) return fenced;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < fenced.length; index += 1) {
    const character = fenced[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character.charCodeAt(0) === 92) escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) return fenced.slice(start, index + 1);
    }
  }
  return fenced;
}

/** Tolerant on explanatory fields, strict on rubric ids, scores and page references. */
export function parseScientificDiagramAnalysis(raw: string, rubric: Rubric, pageCount: number, allowedPageNumbers: number[] = Array.from({ length: pageCount }, (_, index) => index + 1)): ScientificDiagramAnalysis {
 let parsed:unknown;try{parsed=JSON.parse(extractModelJsonObject(raw));}catch{throw new Error('La réponse du modèle Vision n’est pas un JSON valide (champ : JSON).');}
 if(!isRecord(parsed)||!Array.isArray(parsed.diagrams))throw new Error('La réponse Vision ne contient pas la liste obligatoire "diagrams" (champ : diagrams).');
 const warnings:string[]=[];const known=new Map(rubric.criteria.map(c=>[c.id,c]));
 const rows:Array<{source:Record<string,unknown>;id:string;pageNumber:number;diagramType:string;summary:string;bounds?:ScientificDiagramFinding['bounds'];uncertainties:string[]}>=[];
 const strings=(v:unknown):string[]=>v==null||v===''?[]:typeof v==='string'?[v]:Array.isArray(v)?v.filter((x):x is string=>typeof x==='string'):[];
 for(let i=0;i<parsed.diagrams.length;i++){const v=parsed.diagrams[i];if(!isRecord(v)){warnings.push('Schéma '+(i+1)+' ignoré : objet invalide.');continue;}const p=v.pageNumber;if(!Number.isInteger(p)||Number(p)<1||Number(p)>pageCount||allowedPageNumbers[Number(p)-1]===undefined)throw new Error('Champ pageNumber invalide pour le schéma '+(i+1)+'.');let bounds:ScientificDiagramFinding['bounds'];if(isRecord(v.bounds)){const b=v.bounds;if([b.x,b.y,b.width,b.height].every(n=>typeof n==='number'&&Number.isFinite(n))&&Number(b.x)>=0&&Number(b.y)>=0&&Number(b.width)>0&&Number(b.height)>0&&Number(b.x)+Number(b.width)<=1&&Number(b.y)+Number(b.height)<=1)bounds={x:Number(b.x),y:Number(b.y),width:Number(b.width),height:Number(b.height)};else warnings.push('Bounds invalides supprimés pour le schéma '+(i+1)+'.');}else if(v.bounds!=null)warnings.push('Bounds invalides supprimés pour le schéma '+(i+1)+'.');rows.push({source:v,id:'diagram-'+(i+1),pageNumber:allowedPageNumbers[Number(p)-1],diagramType:typeof v.diagramType==='string'?v.diagramType:'schéma',summary:typeof v.summary==='string'?v.summary:'',...(bounds?{bounds}:{}),uncertainties:strings(v.uncertainties)});}
 if(rows.length===0)throw new Error('Aucun schéma exploitable dans le champ diagrams.');
 const diagrams:ScientificDiagramFinding[]=rows.map(r=>({id:r.id,pageNumber:r.pageNumber,...(r.bounds?{bounds:r.bounds}:{}),diagramType:r.diagramType,summary:r.summary,criteria:[],uncertainties:r.uncertainties}));
 const assess=(v:unknown,diagramId?:string):DiagramCriterionAssessment|null=>{if(!isRecord(v)||typeof v.criterionId!=='string'||!v.criterionId.trim()){warnings.push('Élément parasite dans criteria ignoré (criterionId absent ou invalide).');return null;}const c=known.get(v.criterionId);if(!c)throw new Error('Champ criterionId inconnu : '+v.criterionId+'.');const configured=diagramId?[]:known.get(v.criterionId)?.expectedElements??[];
 const returned=Array.isArray(v.elements)?v.elements:[];
 const normalizeLabel=(label:string)=>label.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr').replace(/[^a-z0-9]+/g,' ').trim();
 const matchedByIndex=returned.length===configured.length;
 const used=new Set<unknown>();
 const elements=configured.length?configured.map((element,index)=>{
   const expected=normalizeLabel(element.label);
   let found=returned.find(item=>isRecord(item)&&!used.has(item)&&typeof item.label==='string'&&normalizeLabel(item.label)===expected);
   if(!found&&matchedByIndex&&!used.has(returned[index]))found=returned[index];
   if(found)used.add(found);
   if(!found)warnings.push('Élément attendu « '+element.label+' » introuvable dans la réponse Vision ; note à vérifier manuellement.');
   const rawStatus=isRecord(found)&&found.status==='partially-fulfilled'?'partial':isRecord(found)?found.status:'uncertain';
   const status=['present','partial','absent','uncertain'].includes(String(rawStatus))?rawStatus as 'present'|'partial'|'absent'|'uncertain':'uncertain';
   const evidence=isRecord(found)&&typeof found.evidence==='string'&&found.evidence.trim()?found.evidence.trim():'Preuve non fournie par le modèle';
   return{label:element.label,status,evidence,maxPoints:element.points,points:element.points*(status==='present'?1:status==='partial'?0.5:0)};
 }):undefined;const points=elements?elements.reduce((s,e)=>s+e.points,0):typeof v.points==='number'?v.points:NaN;if(!Number.isFinite(points)||points<0||points>c.maxPoints)throw new Error('Champ points hors barème pour « '+c.title+' ».');const evidence=typeof v.evidence==='string'&&v.evidence.trim()?v.evidence.trim():'Preuve non fournie par le modèle';const confidence=typeof v.confidence==='number'&&v.confidence>=0&&v.confidence<=1?v.confidence:0;let review=typeof v.requiresTeacherReview==='boolean'?v.requiresTeacherReview:true;if(evidence==='Preuve non fournie par le modèle')review=true;const qualityBreakdown:ScientificDiagramQualityAssessment[]=[];if(Array.isArray(v.qualityBreakdown))for(const q of v.qualityBreakdown){if(!isRecord(q)||!SCIENTIFIC_DIAGRAM_QUALITY_DIMENSIONS.includes(q.dimension as ScientificDiagramQualityDimension))continue;const status=q.status==='partially-fulfilled'?'partial':q.status;if(['fulfilled','partial','missing','not-applicable','uncertain'].includes(String(status)))qualityBreakdown.push({dimension:q.dimension as ScientificDiagramQualityDimension,status:status as ScientificDiagramQualityStatus,evidence:typeof q.evidence==='string'?q.evidence.slice(0,240):''});}const accuracyOrCompletenessPartial=qualityBreakdown.some(q=>['scientific-accuracy','completeness'].includes(q.dimension)&&['partial','missing'].includes(q.status));
 if(elements?.some(element=>element.status==='partial'||element.status==='absent'||element.status==='uncertain'))review=true;
 if(elements&&elements.some(element=>element.evidence==='Preuve non fournie par le modèle'))review=true;
 if(elements&&points<c.maxPoints*.3&&elements.every(element=>['present','partial'].includes(element.status)))review=true;
 const ids=Array.isArray(v.diagramIds)&&v.diagramIds.length>0?v.diagramIds.filter((id):id is string=>typeof id==='string'&&rows.some(r=>r.id===id||r.source.id===id)).map(id=>rows.find(r=>r.id===id||r.source.id===id)!.id):diagramId?[diagramId]:rows.map(r=>r.id);
 return{criterionId:c.id,title:c.title,points,maxPoints:c.maxPoints,evidence,confidence:points===c.maxPoints&&accuracyOrCompletenessPartial?Math.min(confidence,.5):confidence,requiresTeacherReview:review,diagramIds:ids,...(elements?{elements}:{}),...(qualityBreakdown.length?{qualityBreakdown}:{})};};
 const normalize=(v:unknown):unknown[]|null=>Array.isArray(v)?v:isRecord(v)?Object.entries(v).map(([id,item])=>({... (isRecord(item)?item:{}),criterionId:isRecord(item)&&typeof item.criterionId==='string'?item.criterionId:id})):null;
 const global=normalize(parsed.criteria);if(global)return{diagrams,criteria:global.map(v=>assess(v)).filter((v):v is DiagramCriterionAssessment=>v!==null),overallUncertainties:strings(parsed.overallUncertainties),warnings};
 const legacy:DiagramCriterionAssessment[]=[];for(const row of rows)for(const v of normalize(row.source.criteria)??[]){const item=assess(v,row.id);if(item)legacy.push(item);}warnings.push('Ancien format d’analyse par schéma : vérifier la note.');const legacyDiagrams=diagrams.map(diagram=>({...diagram,criteria:legacy.filter(item=>(item.diagramIds??[]).includes(diagram.id))}));return{diagrams:legacyDiagrams,criteria:legacy,overallUncertainties:strings(parsed.overallUncertainties),warnings};
}
