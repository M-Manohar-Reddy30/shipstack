# Contributing to ShipStack

Thank you for your interest in contributing to ShipStack. The goal is to build a practical, reusable engineering reference for designing, implementing, testing, deploying, and operating software systems.

## Ways to contribute

- Add a new engineering scenario.
- Improve an existing scenario.
- Fix implementation bugs or incorrect documentation.
- Add tests, validation tools, or CI improvements.
- Improve clarity, examples, and developer experience.

## Development workflow

1. Open an issue to discuss substantial changes before starting work.
2. Fork the repository or create a branch in your working copy.
3. Make focused changes related to one goal.
4. Run the relevant tests and validation checks.
5. Open a pull request describing the changes, design decisions, and validation results.

## Scenario documentation

Each engineering scenario should be understandable on its own and include these required files:

- `README.md`
- `scenario.yaml`
- `requirements.md`
- `architecture.md`
- `data-model.md`
- `api.md`
- `security.md`
- `implementation.md`
- `testing.md`
- `observability.md`
- `deployment.md`
- `scaling.md`
- `failure-modes.md`
- `interview.md`

Keep examples consistent across the architecture, API, data model, implementation, and tests. Clearly distinguish conceptual designs from implemented features.

## Quality checks

For the authentication scenario, run these commands from `scenarios/authentication/`:

```bash
npm ci
npm run typecheck
npm run build
npm test
```

From the repository root, run the scenario documentation validator:

```bash
python3 tools/validate_repo.py
```

All applicable checks should pass before submitting a pull request. If a check cannot be run, explain why in the pull request.

## Security guidelines

- Never commit passwords, API keys, access tokens, private keys, or production credentials.
- Do not include real personal or sensitive data in examples, fixtures, or logs.
- Document relevant threats, authorization rules, validation, and failure cases.
- Do not describe a reference implementation as production-ready unless its operational and security requirements have been met.
- Report suspected security vulnerabilities privately to the repository maintainer rather than publishing exploitable details in an issue.

## Writing guidelines

- Prefer clear, direct, technically accurate language.
- Include assumptions, trade-offs, and limitations.
- Use reproducible commands and examples where practical.
- Avoid claiming that an unimplemented feature already exists.

## Pull requests

Use the repository pull request template. Keep each pull request focused, explain user-visible or architectural impact, and include relevant validation results.

## License

By contributing, you agree that your contributions will be distributed under the repository license.
