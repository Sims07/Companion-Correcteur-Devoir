# Visual regression and browser validation

The browser suite protects the main teacher journeys and the visual contracts shared by Correction, model evaluation and Observability.

## What is checked

Run the full browser suite with:

```bash
npm run test:e2e
```

The `visual regression contracts` suite runs the three main workspaces at desktop (1440 px) and mobile (390 px) widths. It checks:

- primary landmarks and workspace surfaces remain visible;
- shared panel background, border and radius stay aligned with design-system tokens;
- no horizontal document overflow is introduced at the tested widths;
- reduced-motion preferences remove non-essential card transitions.

The tests also capture full-page PNG evidence for the assignment library, copy workspace, model evaluation and Observability. CI publishes these files as the `visual-regression-evidence` artifact, including when another test fails.

## Reviewing visual evidence

1. Open the successful or failed **Tests** workflow run in GitHub Actions.
2. Download the `visual-regression-evidence` artifact.
3. Compare the desktop and mobile captures when reviewing a UI pull request.

The captures are review evidence, not committed pixel-golden files: the suite deliberately asserts stable layout and semantic style contracts instead of brittle pixel equality across operating-system font rasterizers. Storybook remains the component-level visual reference and is built in the same CI workflow.

## Adding coverage

When a new major workspace or responsive layout is introduced, add a browser scenario that checks its semantic landmarks, token-derived styles and horizontal overflow at representative viewport widths. Capture a full-page image so reviewers can inspect the rendered result. Keep workflow data deterministic and do not include real student copies or personal information in screenshots.
