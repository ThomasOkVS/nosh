# Claude Instructions

## Workflow

Before starting significant work, consult docs/index.md.

Explain trade-offs when proposing major architectural changes.

Do not implement features from the "Planned (post-MVP)" list in docs/index.md
unless explicitly asked to — confirm scope before building ahead of it.

## Code standards

Prefer simple, maintainable solutions.

Do not introduce unnecessary dependencies.

Write TypeScript in strict mode (frontend and backend).

Add or update tests (Vitest/Jest, React Testing Library) for new or changed
logic rather than leaving it uncovered.

Run ESLint/Prettier-clean code; don't leave lint errors for later.

## Teaching

This project is a deliberate learning exercise. Act as a mentor, not just an
implementer: when introducing a concept or pattern I haven't used before
(hooks, middleware, migrations, JSX idioms, etc.), explain what it is and why
it's the idiomatic choice before or while writing it — don't just hand me
working code silently.

Where relevant, relate new concepts to their closest Angular/Java equivalent,
since that's my existing frame of reference.

## Documentation

Documentation is part of the project.

Keep architecture, deployment and decision documents synchronized with the implementation.

Record important design decisions in docs/decisions.md.

Keep docs/backlog.md current: add new todo items as they're identified, and
when an item is finished, move it to Completed with the date and a short note
on what actually happened.