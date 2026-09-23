// Live check: only harmless text, credentials from Keychain, state in a new temp directory.
const { Host } = require("./host.cjs");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function run() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agenthub-recovery-"));
  const cwd = path.join(root, "sample");
  fs.mkdirSync(cwd);
  const events = [];
  let host = new Host(path.join(root, "state"), (e) => events.push(e));
  const agentId = process.argv[2] || "kimi-code";
  const p = {
    taskId: "recovery",
    agentId,
    cwd,
    provider: "kimi",
    model: "kimi-for-coding",
    mode: "plan",
  };
  async function turn(text) {
    events.length = 0;
    await host.prepare(p);
    const t = host.live.get(p.taskId);
    let previous = [];
    if (agentId === "kimi-code")
      previous = (
        await host.api(t, `/api/v1/sessions/${t.session}/messages`)
      ).items.map((m) => m.id);
    await host.send({ ...p, text });
    const end = Date.now() + 90000;
    while (Date.now() < end) {
      await delay(500);
      if (agentId === "kimi-code") {
        await host.pollKimi(t);
        if (!t.busy) {
          const data = await host.api(
            t,
            `/api/v1/sessions/${t.session}/messages`,
          );
          const answer = data.items.find(
            (m) => m.role === "assistant" && !previous.includes(m.id),
          );
          if (answer) {
            const out = answer.content
              .filter((c) => c.type === "text")
              .map((c) => c.text)
              .join("");
            if (out) return out;
          }
        }
      } else {
        const e = events.find((e) => e.kind === "complete");
        if (e) {
          assert.ok(e.ok, e.error);
          return events
            .filter((e) => e.kind === "text")
            .map((e) => e.delta)
            .join("");
        }
      }
    }
    throw Error("会话验收超时");
  }
  try {
    await turn(
      "仅作为会话验收，记住代号蓝松果42。仅回复已记住，不要使用任何工具，也不要提问。",
    );
    const session = host.live.get(p.taskId).session;
    assert.ok(session);
    console.log("PASS 首轮", agentId);
    if (agentId === "kimi-code") {
      await host.prepare({ ...p, model: "kimi-for-coding-highspeed" });
      assert.equal(host.live.get(p.taskId).model, "kimi-for-coding-highspeed");
      assert.equal(host.live.get(p.taskId).session, session);
      await host.prepare(p);
      assert.equal(host.live.get(p.taskId).session, session);
      console.log(
        "PASS 实际模型配置切换并保留会话（推理测试仍使用 kimi-for-coding）",
      );
    }
    await host.close();
    host = new Host(path.join(root, "state"), (e) => events.push(e));
    const answer = await turn(
      "刚才让你记住的代号是什么？只回复代号，不要用工具。",
    );
    assert.equal(host.live.get(p.taskId).session, session);
    assert.ok(answer.includes("蓝松果42"), answer);
    assert.deepEqual(fs.readdirSync(cwd), []);
    console.log("PASS 重启恢复并保留上下文", agentId);
    console.log("PASS 测试目录没有文件修改");
  } finally {
    await host.close();
  }
}
run().catch((e) => {
  console.error(
    "FAIL",
    String(e.message).replace(/sk-[\w-]{20,}/g, "[已隐藏]"),
  );
  process.exitCode = 1;
});
