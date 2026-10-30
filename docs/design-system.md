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
  index.ts
```

Feature styles remain responsible for layout and domain-specific composition. They must not redefine the appearance of shared controls.

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

## Validation

The design-system contract tests live in `tests/ui/designSystemContract.test.ts` and run with `npm test`. The normal CI typecheck/build validates the React component contracts. Add browser-level tests for any new interactive composite control.
