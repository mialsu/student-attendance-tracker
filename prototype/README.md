# Prototype — "Läsnä" new UI

A clean-sheet UI redesign proposal for the Student Attendance Tracker. Static, self-contained,
no build step and no dependency on the `client/` app.

## View it

Open [`index.html`](./index.html) directly in any modern browser:

```bash
xdg-open prototype/index.html      # Linux
# or just double-click the file
```

Use the **top navigator bar** to:
- switch between **Kirjautuminen** (auth) and **Sovellus** (the logged-in app),
- toggle **light / dark** mode (sun/moon button).

Inside the app, the sidebar moves between the dashboard, a course view (three tabs:
attendance logging, student logs, statistics) and settings. Most controls are interactive —
the autocomplete, credit toggle, filters, dialogs, and toasts all respond, backed by mock data.

## Files

| File | What it is |
|---|---|
| `index.html` | The full interactive prototype (all tokens + components inline) |
| `DESIGN_SYSTEM.md` | The design-system proposal derived from the prototype |
| `README.md` | This file |

## Scope & caveats

- **Not wired into production.** It intentionally drops the current teal/amber scheme for a
  fresh indigo system, per the brief.
- Data is mocked in a `<script>` block; there are no network calls and no real auth.
- Finnish copy matches the live app.
- See `DESIGN_SYSTEM.md` §8 for how this would map onto the real shadcn/ui tokens.
