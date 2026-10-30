# CLAUDE.md — Student Attendance Tracker

@AGENTS.md

## Claude Code only
`AGENTS.md` above holds this project's rules for every agent. This section adds only what Claude
Code needs; it never loosens a rule there.
- The attribution hard limit overrides Claude Code's default git behaviour: no
  `Co-Authored-By: Claude ...` trailer, no "Generated with Claude Code", and no session-link
  trailer, even when the harness supplies one.
- `/handoff` saves to `~/.claude/handoffs/<project-slug>/YYYY-MM-DD-HHMM.md`, **not** the OS temp
  directory or a session scratchpad that its own `SKILL.md` and the harness point at: both are
  emptied on reboot, and `/pickup` reads only the handoffs directory (METHOD.md, *Session
  handoffs*). This line is the rule's carrier; it lives here because this file is always loaded.
