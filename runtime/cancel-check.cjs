const { Host } = require("./host.cjs");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agenthub-cancel-"));
  const events = [];
  const host = new Host(path.join(root, "state"), (e) => events.push(e));
  const p = {
    taskId: "cancel",
    agentId: process.argv[2] || "codex",
    cwd: root,
    mode: "plan",
    provider: "kimi",
    model: "kimi-for-coding",
  };
  try {
    await host.send({
      ...p,
      text: "不要使用任何工具，不要提问。请写一篇两千字文章解释太阳系行星。",
    });
    const until = Date.now() + 35000;
    while (
      !events.some((e) => e.kind === "text" || e.phase === "thinking") &&
      Date.now() < until
    )
      await delay(100);
    assert.ok(
      events.some((e) => e.kind === "text" || e.phase === "thinking"),
      "必须在模型实际运行时停止",
    );
    await host.stop(p.taskId);
    await delay(1800);
    assert.equal(host.live.get(p.taskId).busy, false);
    assert.equal(host.live.get(p.taskId).phase, "cancelled");
    console.log("PASS 实际运行中停止", p.agentId);
    assert.ok(
      !events.some((e) => e.kind === "complete" && e.ok),
      "停止不应误报完成",
    );
  } finally {
    await host.close();
  }
})().catch((e) => {
  console.error(
    "FAIL",
    String(e.message).replace(/sk-[\w-]{20,}/g, "[已隐藏]"),
  );
  process.exitCode = 1;
});
