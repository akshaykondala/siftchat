Manage the project to-do list stored at `.claude/todo.md`.

The list uses this format:
```
## 🔴 P0 — Critical
- [ ] item

## 🟠 P1 — High
- [ ] item

## 🟡 P2 — Medium
- [ ] item

## ⚪ P3 — Low / Nice-to-have
- [ ] item
```

Rules:
- If the user passes no args, READ and DISPLAY the current list neatly.
- If the user passes text like "add fix login bug", PARSE the intent:
  - Extract the task description
  - YOU assign the priority based on your judgment: P0 = blocks the app/users or is a crash/data loss; P1 = important UX or feature gap; P2 = polish or nice improvement; P3 = minor or speculative. Never ask the user for priority.
  - Append the item under the correct section in `.claude/todo.md`
  - Confirm with one line: "Added [task] at P[n] — [one sentence reason]"
- If the user says "done [partial task name]", mark the matching item as `- [x]` and move it to a `## ✅ Done` section at the bottom.
- If the user says "clear done", remove all `- [x]` items.
- If the file doesn't exist yet, create it with the section headers and no items.
- Always re-display the active (unchecked) items after any write operation.
- Keep responses short — list only, no extra commentary.
