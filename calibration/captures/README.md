# Captured results

What [`../capture/capture.lua`](../capture/README.md) saved while playing
the original in MAME, for the reference-data issues #13 to #22. One folder
per issue, committed as-is:

```
captures/
└── issue-13/
    ├── session.json                          date, MAME version, refresh rate, screen size
    ├── sprint__c1-mash-4hz-r1.trace.json     the Input Trace played (id sprint/c1-mash-4hz-r1)
    ├── sprint__c1-mash-4hz-r1.answers.json   what the game showed, as typed in the terminal
    └── ...
```

Each run is saved the moment its questions are answered, so stopping part-way
loses nothing. Running a test again overwrites its files.

Before committing, run `pnpm capture:check` (or `pnpm capture:check 13` for
one issue). It checks every trace against the Input Trace format, pairs it
with its answers, and says how many of the issue's planned runs are done and
where to resume. `pnpm test` runs the same check on every committed folder.

These are raw results, not parity targets: the replay harness doesn't read
them. They're turned into Reference Marks in `../traces/` and
`../reference/`, and into values in `../notes/`, as each issue is worked on.

Only numbers and typed text belong here (see
[`../PROTOCOL.md`](../PROTOCOL.md) section 8): never footage, screenshots,
ROMs, savestates or recordings.
