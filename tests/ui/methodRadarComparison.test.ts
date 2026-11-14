// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { MethodRadarComparison } from '../../src/ui/components/MethodRadarComparison.tsx';
import type { TimelinePoint } from '../../src/domain/radarTimeline.ts';

it('compares distinct complete method radars and can isolate a targeted campaign without filling missing axes', async () => {
  const axes = ['Flèches','Relations','Stabilité'];
  const point = (label:string, partial:boolean, day:number):TimelinePoint => ({
    id:label+day, label, model:'q', date:'2026-11-'+day, prompts:[], score:80,
    protocolLabel:partial ? 'D/E':'Batterie complète',
    axes:{Flèches:80,Relations:partial ? null : 90,Stabilité:partial ? null : 0},
  });
  const node = document.createElement('div');
  const root = createRoot(node);
  await act(async () => root.render(createElement(MethodRadarComparison,{axes, sorted:[
    point('A',true,14),point('B',true,13),point('A',false,12),point('B',false,11),
    {...point('C',false,10), axes:{Flèches:99,Relations:90,Stabilité:0}},
  ]})));
  expect(node.querySelectorAll('[data-method] polygon')).toHaveLength(2);
  expect(node.querySelectorAll('[data-method] circle')).toHaveLength(6);
  const ranking = node.querySelector('.criterion-leaders')!;
  expect(ranking.querySelector('li')?.textContent).toContain('C');
  expect(ranking.querySelector('li')?.textContent).toContain('+19 pts');
  const [scope,method] = node.querySelectorAll('select');
  await act(async () => {method!.value='B'; method!.dispatchEvent(new Event('change',{bubbles:true}));});
  expect([...node.querySelectorAll('[data-method]')].map(g => g.getAttribute('data-method'))).toEqual(['B','A']);
  await act(async () => {scope!.value='D/E'; scope!.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(node.querySelectorAll('[data-method] polygon')).toHaveLength(0);
  expect(node.querySelectorAll('[data-method] circle')).toHaveLength(2);
  expect(ranking.querySelector('li')?.textContent).toContain('Ex æquo');
  expect(ranking.textContent).toContain('Aucune mesure');
  await act(async () => root.unmount());
});
