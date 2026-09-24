# Decisions

Each file records one architecture decision: its context, the decision, and the consequences a contributor must live
with. Records are dated and never rewritten; when a decision changes, add a new record that supersedes the old one and
set the old one's status to "superseded by …".

A record explains why the code looks the way it does. What the code does today is in `docs/atlas/`.

| Record | Decision |
| --- | --- |
| [0001](0001-two-user-tables.md) | Two user tables; a user is the pair of id and type |
| [0002](0002-integrity-in-application-code.md) | No foreign keys; integrity lives in application code |
| [0003](0003-local-first-classification.md) | Local-first classification; a model only chooses categories |
| [0004](0004-commercial-module-scope.md) | Scope of the commercial (B2B) module |
| [0005](0005-provider-key-ring.md) | Provider keys: a key ring over the existing format, resealed on load |
| [0006](0006-gemini-model-chain.md) | Gemini models: a chain of served text models, and the plain Live model for calls |
