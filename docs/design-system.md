# Design system

The design system is the visual and interaction contract for the React UI. New screens should compose shared controls and tokens rather than defining their own form-control appearance.

## Architecture

```text
src/ui/design-system/
  tokens.css                 # semantic color, spacing, shape, elevation and motion tokens
  controls.css               # shared control states and primitives
  components/
    Button.tsx
    Checkbox.tsx
    Field.tsx
    TextArea.tsx
    TextInput.tsx
    index.ts
  foundations/                # token reference stories
  index.ts

.storybook/
  main.ts                     # Storybook discovery, framework and addons
  preview.ts                  # shared design-system styles and preview defaults
```

Feature styles remain responsible for layout and domain-specific composition. They must not redefine the appearance of shared controls.

## Storybook

Storybook is the visual reference environment for shared UI foundations. It consumes the same token and control styles as the application without importing application-specific layout styles.

Run it locally:

```bash
npm run storybook
```

Build the static reference:

```bash
npm run build-storybook
```

Stories are colocated with their components under `src/ui/design-system/components`. Each foundational component should document its meaningful variants and states (default, disabled, invalid, helper text, etc.). The `Fondations/Design tokens` page exposes the semantic color, spacing and radius scales.

The accessibility addon is enabled in the Storybook toolbar. It supplements, but does not replace, keyboard, screen-reader and browser-level tests.

## Usage

```tsx
import { Button, Checkbox, Field, TextArea, TextInput } from './design-system/index.ts';

<Field label="Nom du devoir" htmlFor="assignment-name" hint="Visible uniquement dans votre espace local.">
  <TextInput id="assignment-name" name="assignmentName" autoComplete="off" />
</Field>

<Field label="Consigne" htmlFor="assignment-instructions" error={undefined}>
  <TextArea id="assignment-instructions" name="instructions" />
</Field>

<Checkbox name="deepAnalysis">Activer le mode réflexion</Checkbox>
<Button type="submit">Enregistrer</Button>
```

## Rules

1. **Tokens first.** Use `--ds-*` semantic tokens for new UI styles. Do not introduce raw brand colors, spacing scales or radii in feature CSS.
2. **Compose, do not fork.** Use `TextInput`, `TextArea`, `Checkbox`, `Button` and `Field`. Feature components own layout, not the shared control skin.
3. **Accessible by default.** Every control has an associated label; validation is exposed with `aria-invalid` on the control and an `aria-describedby` reference to hint/error text. Keep keyboard focus visible.
4. **Semantic states.** Use success, warning and danger tokens for meaning, not decoration.
5. **Motion respects preferences.** Interactions must remain usable with reduced motion enabled.
6. **Native semantics.** Shared text controls preserve native HTML form behavior and browser accessibility. The shared select retains native `<select>` semantics; its closed control is consistently styled, while the operating-system option popup remains browser-controlled. A fully custom listbox is a separate accessibility project and must not be introduced without keyboard and screen-reader tests.
7. **Responsive by default.** Controls fill their available width and must not force a fixed-width form layout.
8. **Stories are part of the component contract.** New shared components and meaningful variants must have Storybook stories. Keep stories representative of real teacher workflows, not arbitrary showcase content.

## Validation

The design-system contract tests live in `tests/ui/designSystemContract.test.ts` and run with `npm test`. The normal CI typecheck/build validates the React component contracts. The CI also builds Storybook to ensure stories and their configuration remain valid. Add browser-level tests for any new interactive composite control.

## Direction retenue : Atelier pédagogique (B)

Le professeur a retenu la maquette **B — Atelier pédagogique** comme nouvelle identité visuelle. Les tokens communs expriment des surfaces papier ivoire, un accent terre cuite et une typographie éditoriale réservée aux titres. Les contrôles et contenus de correction conservent une typographie sans empattement pour la lecture rapide. Les avertissements scientifiques et les états de succès conservent des couleurs sémantiques différentes de l'accent de marque.

Les accents et textes visibles respectent au minimum un contraste WCAG AA de 4,5:1 sur la surface papier. Les transitions non essentielles sont désactivées si l'utilisateur préfère moins d'animations. Les styles transversaux sont centralisés dans `tokens.css`, `controls.css` et `application-theme.css`; les déclinaisons métier utilisent ces tokens, sans nouvelle palette parallèle. Storybook `Fondations/Atelier pédagogique` permet de valider la référence visuelle.

### Application aux écrans du professeur

`src/ui/teacherAtelier.css` regroupe uniquement la composition métier des fiches « Mes devoirs », du formulaire de création et de l'éditeur de barème. Il est chargé après le thème commun, sans remplacer les styles de contrôles partagés. Les états métier (corrections à réviser, devoir prêt, préparation) restent sémantiques et les champs restent éditables au clavier. Une vérification Playwright traverse la création et l'ouverture du barème ; Storybook importe également cette feuille afin de présenter les vrais composants dans le même thème.

### Espace de vérification des copies

`src/ui/correctionAtelier.css` décline la maquette B sur le suivi des copies et le poste de relecture. Sur desktop, l'original et les décisions disposent d'une largeur comparable ; sous 1100 px, la copie et les critères s'empilent pour éviter une colonne de texte étriquée. Seuls les critères qui demandent réellement l'attention du professeur portent la classe `is-flagged` et un liseré d'accent. Les critères sans alerte, les preuves longues et les justifications restent consultables sans être développés par défaut. Les tests de contrat et le parcours Playwright vérifient la classe d'alerte, la disposition et la lisibilité.

## Fenêtres de dialogue

Les confirmations et fenêtres modales utilisent le composant partagé `Dialog` (`src/ui/design-system/components/Dialog.tsx`) et les boutons `Button`. Le navigateur gère la modalité native, le focus, la touche Échap et son retour à l'élément déclencheur. La croix et le fond ne ferment que les dialogues annulables ; `dismissible={false}` est réservé aux décisions indispensables à un traitement en cours.

Les tailles disponibles sont `compact` (confirmations), `wide` (revue des annotations) et `viewer` (pages). La surface, la typographie, les boutons, les couleurs, les bordures, l'ombre et le fond proviennent des tokens du design system. Ne pas utiliser `window.confirm` ou une surcouche `div[role="dialog"]` pour les parcours professeur. Un nouveau dialogue doit posséder un scénario Storybook et des tests ciblés de ses interactions au clavier et sur mobile.
