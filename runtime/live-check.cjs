// Explicit live acceptance check: tiny prompts, isolated sample directory, Keychain only.
const { Host } = require("./host.cjs");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitUntil(fn, ms = 120000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const r = await fn();
    if (r) return r;
    await delay(700);
  }
  throw Error("验收等待超时");
}
async function run() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agenthub-acceptance-"));
  const cwd = path.join(root, "sample");
  fs.mkdirSync(cwd);
  console.log("验收目录", cwd);
  const events = [];
  const host = new Host(path.join(root, "state"), (e) => {
    events.push(e);
    if (e.kind === "status") console.log(e.taskId, e.phase, e.detail || "");
    if (e.kind === "complete" && !e.ok) console.log("运行错误", e.error);
  });
  const agentId = process.argv[2] || "kimi-code";
  const p = {
    taskId: "acceptance",
    agentId,
    cwd,
    provider: "kimi",
    model: "kimi-for-coding",
    mode: "plan",
  };
  try {
    console.log("可用模型", await host.models("kimi"));
    await host.send({
      ...p,
      text: "这是一个隔离验收项目。请规划新增 hello.txt，文件内容为 AgentHub verified。先只规划，不要创建文件；请用原生计划流程提交计划并等待我的确认。不要联网，不要安装依赖。",
    });
    const t = host.live.get(p.taskId);
    if (agentId === "kimi-code") {
      const result = await waitUntil(async () => {
        const s = await host.api(t, `/api/v1/sessions/${t.session}`);
        const approvals = await host.api(
          t,
          `/api/v1/sessions/${t.session}/approvals?status=pending`,
        );
        if (approvals.items.length) return { approval: approvals.items[0] };
        if (s.last_turn_reason === "failed")
          throw Error(
            JSON.stringify(
              await host.api(t, `/api/v1/sessions/${t.session}/messages`),
            ),
          );
        if (!s.busy && s.last_turn_reason === "completed")
          return { done: true };
      });
      assert.equal(fs.existsSync(path.join(cwd, "hello.txt")), false);
      console.log("PASS 计划阶段未修改目标文件");
      console.log(
        "计划确认信息",
        result.approval?.tool_name || "完成后等待后续确认",
      );
      if (result.approval) {
        console.log(
          "计划选项",
          JSON.stringify(result.approval.tool_input_display),
        );
        await host.api(
          t,
          `/api/v1/sessions/${t.session}/approvals/${result.approval.approval_id}`,
          {
            decision: "approved",
            feedback:
              "用户确认上述计划，仅创建 hello.txt，内容 AgentHub verified。",
          },
        );
      } else {
        t.busy = false;
        await host.send({
          ...p,
          mode: "execute",
          text: "我确认该计划。现在创建 hello.txt，内容 AgentHub verified。不要执行任何其他操作。",
        });
      }
      await waitUntil(async () => {
        const a = await host.api(
          t,
          `/api/v1/sessions/${t.session}/approvals?status=pending`,
        );
        for (const item of a.items) {
          console.log("后续工具授权", item.tool_name);
          if (
            /Write|Edit|StrReplace|ApplyPatch/.test(item.tool_name) &&
            JSON.stringify(item.tool_input_display).includes("hello.txt")
          )
            await host.api(
              t,
              `/api/v1/sessions/${t.session}/approvals/${item.approval_id}`,
              { decision: "approved" },
            );
          else
            throw Error("遇到未预期授权请求，需要人工检查：" + item.tool_name);
        }
        return fs.existsSync(path.join(cwd, "hello.txt"));
      });
    } else {
      await waitUntil(async () => {
        for (const e of events.filter(
          (e) => e.kind === "question" && !e.handled,
        )) {
          e.handled = true;
          console.log(
            "回答计划澄清问题",
            e.questions?.map((q) => q.question).join("; "),
          );
          await host.approve({
            taskId: p.taskId,
            requestId: e.requestId,
            allow: true,
            answers: Object.fromEntries(
              e.questions.map((q) => [
                q.id,
                {
                  answers: [
                    "UTF-8 文本文件，内容仅 AgentHub verified，可带末尾换行。无需其他信息，先返回简短计划，不要修改文件。",
                  ],
                },
              ]),
            ),
          });
        }
        return events.find((e) => e.kind === "complete");
      });
      assert.ok(
        events.find((e) => e.kind === "complete" && e.ok),
        "计划调用必须成功",
      );
      assert.equal(fs.existsSync(path.join(cwd, "hello.txt")), false);
      console.log("PASS 只读计划约束", agentId);
      events.length = 0;
      await host.send({
        ...p,
        mode: "execute",
        text: "我确认计划。现在创建 hello.txt，内容 AgentHub verified。不要执行任何其他操作。",
      });
      await waitUntil(async () => {
        for (const e of events.filter(
          (e) => e.kind === "approval" && !e.handled,
        )) {
          e.handled = true;
          console.log("Codex 工具授权", e.title);
          await host.approve({
            taskId: p.taskId,
            requestId: e.requestId,
            allow: true,
          });
        }
        return events.find((e) => e.kind === "complete");
      });
      assert.ok(
        events.find((e) => e.kind === "complete" && e.ok),
        "执行调用必须成功",
      );
    }
    assert.equal(
      fs.readFileSync(path.join(cwd, "hello.txt"), "utf8").trim(),
      "AgentHub verified",
    );
    console.log("PASS 确认后文件内容正确");
    console.log("原生会话", t.session);
    console.log("PASS 真实 API 验收", agentId);
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
