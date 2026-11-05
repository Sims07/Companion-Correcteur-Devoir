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

Storybook est la **référence visuelle de la maquette B** pour les fondations, les composants et les états représentatifs des deux parcours. Il importe les mêmes feuilles CSS **dans le même ordre** que `src/main.tsx`, y compris les écrans techniques : la cascade affichée est la cascade réelle de l'application.

Run it locally:

```bash
npm run storybook
```

Build the static reference:

```bash
npm run build-storybook
```

Le workflow `.github/workflows/deploy-pages.yml` publie la version statique sous `/storybook/` **sur le même GitHub Pages que l'application**, en conservant l'application à sa racine. Par défaut : `https://sims07.github.io/Companion-Correcteur-Devoir/storybook/`. Le lien sera actif après le déploiement réussi de `main`.

Stories are colocated with their components under `src/ui/design-system/components`. Each foundational component should document its meaningful variants and states (default, disabled, invalid, helper text, etc.). The `Fondations/Design tokens` page exposes the semantic color, spacing and radius scales.

Le catalogue contient notamment `Parcours enseignant/Suivi des copies` (vrai composant avec ses états), `Parcours enseignant/Correction en cours`, `Parcours enseignant/Point à examiner` et `Fondations/Contrat des états B` (exemples professeur et outils techniques).

**Règle de maintenance** : toute modification du vocabulaire des états ou de l'aspect d'un parcours exige la mise à jour de la story correspondante et d'un test ciblé. Les stories de référence ne doivent ni appeler de LLM, ni utiliser de vraies copies, ni dépendre d'un serveur. Le catalogue est une référence de composants et d'états — **pas une reproduction exhaustive de toutes les pages et de toutes les interactions métier**.

L'addon d'accessibilité est activé. Il complète, sans remplacer, les tests clavier, lecteur d'écran et Playwright.

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

Pour le suivi d'une évaluation **et d'une correction de copie** (individuelle ou en série), **l'étape active et la configuration en cours** utilisent le statut informatif `--ds-color-progress*` (ardoise bleutée), avec un libellé « En cours » et un discret indicateur de présence. Le terracotta reste une couleur de marque et de sélection ; le rouge signale uniquement une erreur, l'ambre une intervention et le vert un succès. Une animation de présence n'est jamais indispensable pour comprendre l'état et est désactivée si la réduction des mouvements est demandée.

Les accents et textes visibles respectent au minimum un contraste WCAG AA de 4,5:1 sur la surface papier. Les transitions non essentielles sont désactivées si l'utilisateur préfère moins d'animations. Les styles transversaux sont centralisés dans `tokens.css`, `controls.css` et `application-theme.css`; les déclinaisons métier utilisent ces tokens, sans nouvelle palette parallèle. Storybook `Fondations/Atelier pédagogique` permet de valider la référence visuelle.

### Application aux écrans du professeur

`src/ui/teacherAtelier.css` regroupe uniquement la composition métier des fiches « Mes devoirs », du formulaire de création et de l'éditeur de barème. Il est chargé après le thème commun, sans remplacer les styles de contrôles partagés. Les états métier (corrections à réviser, devoir prêt, préparation) restent sémantiques et les champs restent éditables au clavier. Une vérification Playwright traverse la création et l'ouverture du barème ; Storybook importe également cette feuille afin de présenter les vrais composants dans le même thème.

### Espace de vérification des copies

`src/ui/correctionAtelier.css` décline la maquette B sur le suivi des copies et le poste de relecture. Sur desktop, l'original et les décisions disposent d'une largeur comparable ; sous 1100 px, la copie et les critères s'empilent pour éviter une colonne de texte étriquée. Seuls les critères qui demandent réellement l'attention du professeur portent la classe `is-flagged` et un liseré **ambre**, distinct du bleu ardoise des critères en cours de traitement. Les critères sans alerte, les preuves longues et les justifications restent consultables sans être développés par défaut. Les cartes du suivi par copies et celles de la correction en série appliquent les mêmes états : neutre par défaut, ardoise pour le traitement, ambre pour une intervention et rouge pour un échec réel. Les tests de contrat et les parcours Playwright vérifient les états, la disposition et la lisibilité.

## Fenêtres de dialogue

Les confirmations et fenêtres modales utilisent le composant partagé `Dialog` (`src/ui/design-system/components/Dialog.tsx`) et les boutons `Button`. Le navigateur gère la modalité native, le focus, la touche Échap et son retour à l'élément déclencheur. La croix et le fond ne ferment que les dialogues annulables ; `dismissible={false}` est réservé aux décisions indispensables à un traitement en cours.

Les tailles disponibles sont `compact` (confirmations), `wide` (revue des annotations) et `viewer` (pages). La surface, la typographie, les boutons, les couleurs, les bordures, l'ombre et le fond proviennent des tokens du design system. Ne pas utiliser `window.confirm` ou une surcouche `div[role="dialog"]` pour les parcours professeur. Un nouveau dialogue doit posséder un scénario Storybook et des tests ciblés de ses interactions au clavier et sur mobile.

### Espace technique « Outils IA »

Les trois vues (Observabilité, Inspecteur réseau et Évaluation des modèles) partagent une navigation Atelier pédagogique : fond papier, surfaces ivoire, typographie éditoriale pour les titres et accent terre cuite réservé à la navigation, aux sélections et aux graphiques neutres. Le **bleu ardoise** signale un traitement actif, le gris une attente simple, le vert un succès, l'ambre une intervention nécessaire et le rouge une erreur réelle. Les éléments de navigation et les choix sélectionnés conservent l'accent terre cuite. La feuille `src/ui/aiToolsAtelier.css` est chargée après les styles historiques et bornée à `.ai-tools-view` afin de ne pas modifier le parcours professeur.

Le partage d'un diagnostic technique est replié par défaut, sans déplacer ni supprimer les données d'observabilité. L'inspecteur présente six colonnes alignées sur ordinateur et privilégie heure, méthode, intention et statut sur mobile. Les tests de navigation, de contrat et de navigateur vérifient ces choix.

### Contrat transversal des états

| Situation | Traitement visuel | Exemples |
| --- | --- | --- |
| Action ou sélection | Terre cuite (marque) | Onglet choisi, bouton principal, profil sélectionné |
| Traitement actif | Ardoise informative `--ds-color-progress*` | Lecture d'une copie, analyse en cours, requête HTTP en attente de réponse, sauvegarde en cours |
| Simple attente | Gris neutre | Copies à corriger, prochaines étapes |
| Résultat obtenu | Vert de succès | Copie corrigée, historique enregistré |
| Attention requise | Ambre | Barème à compléter, stockage proche du quota, copie à reprendre |
| Erreur véritable | Rouge de danger | Appel IA échoué, stockage impossible, historique non enregistré |

Le code ne doit pas déduire un état métier de la couleur de marque. Les cartes et panneaux sont **neutres par défaut** : seuls les statuts utiles sont accentués. Les messages utilisent `StatusNotice` lorsqu'il s'agit d'un feedback court. Les tokens informatifs et les statuts sont documentés dans Storybook `Fondations/Design tokens`. Les tests de contrat et Playwright vérifient le rendu sur les deux parcours.

### Messages de statut

Les messages inline de confirmation, d'information, d'avertissement et d'erreur utilisent le composant partagé `StatusNotice` (tokens `--ds-color-success`, `--ds-color-text-muted`, `--ds-color-warning`, `--ds-color-danger`). La couleur terre cuite représente une interaction ou une sélection, jamais une confirmation. Ne pas déduire l'état du message à partir de son texte : le composant reçoit explicitement `tone="success" | "info" | "warning" | "error"`. Les erreurs portent `role="alert"`, les autres messages `role="status"`. Les messages ne doivent jamais se fondre dans un fond coloré massif.
