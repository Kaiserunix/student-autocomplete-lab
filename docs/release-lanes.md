# Release Lanes

Date: 2026-05-04

Student Autocomplete Lab now has three VSIX lanes. They must not be mixed.

| Lane | Package name | View prefix | Intended use | Publish rule |
| --- | --- | --- | --- | --- |
| Beta | `student-autocomplete-lab` | `studentAutocomplete` | Normal local and small-scope testing with full project features | Can be shared as a test package |
| Beta Release | `student-autocomplete-lab-beta-release` | `studentAutocompleteBetaRelease` | Clean public candidate containing only runtime extension files | Publish only after clean-package gate passes |
| Beta Internal | `student-autocomplete-lab-internal` | `studentAutocompleteInternal` | Friend testing with local JSONL records enabled | Never publish |

## Package Commands

```powershell
npm run package:beta
npm run package:beta-release
npm run package:internal
```

All artifacts are written under `.runtime/`, which is ignored by git.

## Clean Beta Release Rule

The beta release VSIX is the only candidate for public release. It must not include:

- `docs/`, `scripts/`, `test/`, `fixtures/`, `src/`, `secrets/`, `.runtime/`, `.student-autocomplete/`;
- compiled `cli/`, `internalTesting/`, or source maps;
- raw internal test records, local model keys, or personal learning data.

Runtime teaching prompt builders remain in the package because they are part of the product behavior.

## Configuration Rule

AI configuration is a real VS Code settings surface plus SecretStorage:

- settings choose provider mode, base URL, chat model, autocomplete model, and autocomplete format;
- API keys saved through the sidebar go to VS Code SecretStorage;
- legacy `secrets/models.env` remains a local fallback.
