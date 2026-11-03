import { describe, expect, it } from 'vitest';
import { parseModelJson } from './modelJson.ts';

describe('small-model JSON fixtures', () => {
  it.each([
    ['Markdown autour du JSON', '\x60\x60\x60json\n{"ok":true}\n\x60\x60\x60', { ok: true }],
    ['balises think', '<think>raisonnement</think>{"ok":true}', { ok: true }],
    ['texte avant le JSON', 'Voici le résultat : {"ok":true} fin', { ok: true }],
    ['objet simple', '{"ok":true}', { ok: true }],
    ['tableau', '[{"ok":true}]', [{ ok: true }]],
  ])('extrait %s', (_label, raw, expected) => {
    expect(parseModelJson(raw)).toEqual(expected);
  });

  it.each([
    ['texte sans JSON', 'aucune donnée', /aucun objet JSON/],
    ['JSON tronqué', '{"ok":', /tronquée/],
    ['JSON mal formé', '{bad}', /JSON invalide/],
  ])('signale explicitement %s', (_label, raw, error) => {
    expect(() => parseModelJson(raw)).toThrow(error);
  });
});
