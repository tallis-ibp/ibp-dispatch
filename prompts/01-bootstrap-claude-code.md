# Prompt: Bootstrap Claude Code

Use this as the first prompt inside Claude Code from the `claude-scheduler` folder.

```text
Read CLAUDE.md, docs/operating-model.md, docs/monday-data-map.md, and docs/questions-for-scheduling-team.md.

Then check whether the monday.com connector is available in this Claude Code session. If it is available, list the monday boards you can see and identify which boards look like job, schedule, or logistics boards.

Do not update monday.com or the Google Sheet. This is read-only discovery.

After discovery, tell me:
1. Which boards you found.
2. Which board seems like the source of truth for active jobs.
3. Which board seems like the source of truth for logistics.
4. Which questions you need answered before automation should write anything back.
```
