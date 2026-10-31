# Guided local coding worker

The lead assigns **small mechanical tasks** to Qwen2.5-Coder-7B-Instruct Q4_K_M,
then reviews every diff and runs relevant checks. Design, physics, shaders, architecture
and acceptance decisions stay with the lead. The worker receives only the task and selected
files, and returns literal find/replace edits. It has no shell or Git tools.

This installation uses Windows CUDA llama.cpp, avoiding WSL's 4 GB memory limit.
Runtime, weights, logs and job records live in `D:\WraithLocalLLM`; no model binaries enter Git.
The server binds only to Windows loopback on port 8089. A PowerShell bridge lets the WSL
harness call it without exposing the endpoint to the LAN. No API key is needed.

```bash
cd /home/sol/WraithOfTheUnstill
node tools/local-llm/worker.mjs start
node tools/local-llm/worker.mjs status

# Write a short, precise task to /tmp/local-task.txt first.
node tools/local-llm/worker.mjs edit \
  --root /home/sol/wraith-relax \
  --task /tmp/local-task.txt \
  --file tools/bot/relaxation-reload.mjs --apply

# Review its changes and run the appropriate syntax/test/runtime checks.
git -C /home/sol/wraith-relax diff -- tools/bot/relaxation-reload.mjs

# Release GPU memory before Chrome captures or performance work.
node tools/local-llm/worker.mjs stop
```

Repeat `--file` for additional assigned files. Omit `--apply` to save a proposal without
writing. An explicitly assigned missing file can be created if its parent directory exists.
`--runtime-root` changes the installation folder (use its WSL path).

The harness validates assigned paths, unique literal matches and source snapshots before
applying the batch. Job directories under `D:\WraithLocalLLM\jobs` retain the exact request,
response and proposed edits, including local token/timing metadata. The harness does not
commit or push changes. Start/stop target only this installation's recorded server process.

Current settings: one slot, 8192-token context, eight CPU threads, CUDA layer offload and
Flash Attention. Keep tasks and selected files small; this is a supervised editing helper,
not an autonomous replacement for the lead. Do not run it alongside game GPU benchmarks.

Sources: [official Qwen weights](https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF),
[llama.cpp Windows runtime](https://github.com/ggml-org/llama.cpp/releases/tag/b11669).
`D:\WraithLocalLLM\install.json` records the installed revisions, sizes and SHA-256 hashes.

Validation: `npx vitest run tests/localLlm.test.js --maxWorkers=2` covers scoped edits,
path/symlink rejection, ambiguous matches, concurrent source changes, creation and rollback.
