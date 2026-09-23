const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { PassThrough } = require("node:stream");
const { Host, lines } = require("./host.cjs");
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agenthub-unit-"));
  const events = [];
  const host = new Host(dir, (e) => events.push(e));
  return {
    dir,
    host,
    events,
    p: {
      taskId: "test-task",
      agentId: "codex",
      cwd: dir,
      mode: "plan",
      provider: "kimi",
      model: "kimi-for-coding",
    },
  };
}
test("fragmented JSONL including final line is retained", () => {
  const s = new PassThrough(),
    out = [];
  lines(s, (l) => out.push(l));
  s.write("one\r");
  s.write("\ntwo\n");
  s.end();
  assert.deepEqual(out, ["one", "two"]);
});
test("invalid paths and agents are rejected", () => {
  const { host, p } = fixture();
  assert.throws(() => host.validate({ ...p, taskId: "../x" }));
  assert.throws(() => host.validate({ ...p, agentId: "unknown" }));
  assert.throws(() => host.validate({ ...p, cwd: "relative" }));
});
test("credentials never appear in emitted events or session metadata", () => {
  const { host, dir, events } = fixture();
  const key = "sk-unit-secret-for-redaction-123456789";
  host.secrets.add(key);
  const t = {
    id: "test",
    agentId: "codex",
    cwd: dir,
    session: "session1",
    key,
  };
  host.event(t, "notice", { text: key });
  host.remember(t);
  assert.ok(!JSON.stringify(events).includes(key));
  assert.ok(!fs.readFileSync(host.file, "utf8").includes(key));
  assert.deepEqual(Object.keys(host.saved.test).sort(), [
    "agentId",
    "cwd",
    "session",
  ]);
});
test("concurrent prepare starts exactly one process; conflicting model cannot be silently accepted", async () => {
  const { host, p } = fixture();
  let starts = 0,
    release;
  host.startCodex = async (t) => {
    starts++;
    await new Promise((r) => (release = r));
    t.session = "one";
  };
  const a = host.prepare(p),
    b = host.prepare(p);
  await assert.rejects(host.prepare({ ...p, model: "other" }), /连接/);
  release();
  assert.deepEqual(await a, await b);
  assert.equal(starts, 1);
  await host.close();
});
test("busy sessions cannot switch models", async () => {
  const { host, p } = fixture();
  host.startCodex = async (t) => {
    t.effectiveModel = t.model;
    t.session = "one";
  };
  await host.prepare(p);
  host.live.get(p.taskId).busy = true;
  await assert.rejects(host.prepare({ ...p, model: "other" }), /停止/);
  await host.close();
});
test("Codex plan has native plan mode and read-only sandbox; execution is explicit", async () => {
  const { host, p } = fixture();
  host.startCodex = async (t) => {
    t.effectiveModel = t.model;
    t.session = "one";
  };
  const requests = [];
  host.rpc = async (t, method, params) => {
    requests.push({ method, params });
    return { turn: { id: "turn1" } };
  };
  await host.send({ ...p, text: "plan" });
  assert.equal(requests[0].params.sandboxPolicy.type, "readOnly");
  assert.equal(requests[0].params.approvalPolicy, "never");
  assert.equal(requests[0].params.collaborationMode.mode, "plan");
  await assert.rejects(host.send({ ...p, text: "again" }), /仍在运行/);
  host.live.get(p.taskId).busy = false;
  await host.send({ ...p, mode: "execute", text: "confirmed" });
  assert.equal(requests[1].params.sandboxPolicy.type, "workspaceWrite");
  assert.deepEqual(requests[1].params.sandboxPolicy.writableRoots, [p.cwd]);
  assert.equal(requests[1].params.approvalPolicy, "on-request");
  await host.close();
});
test("thought, error and approval events preserve actual status", async () => {
  const { host, events } = fixture();
  const t = { id: "test", session: "s", mode: "plan", busy: true };
  host.codexEvent(t, {
    method: "item/started",
    params: { threadId: "s", item: { type: "reasoning" } },
  });
  assert.equal(t.phase, "thinking");
  host.codexEvent(t, {
    id: 1,
    method: "item/commandExecution/requestApproval",
    params: { threadId: "s", command: "write" },
  });
  assert.equal(t.phase, "waiting");
  assert.equal(t.approvals.size, 1);
  host.codexEvent(t, {
    method: "turn/completed",
    params: {
      threadId: "s",
      turn: { status: "failed", error: { message: "real error" } },
    },
  });
  assert.equal(t.phase, "error");
  assert.equal(events.find((e) => e.kind === "complete").ok, false);
  assert.equal(t.busy, false);
  await host.close();
});
test("expired approvals and unknown operations fail visibly", async () => {
  const { host } = fixture();
  await assert.rejects(
    host.approve({ taskId: "missing", requestId: "old" }),
    /失效/,
  );
  await assert.rejects(host.handle("unknown", {}), /未知/);
});
