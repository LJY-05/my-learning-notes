import { useEffect, useState } from "react";
import {
  Clock,
  Pause,
  Play,
  RotateCcw,
  Save,
  Timer,
  Check,
} from "lucide-react";
import { Button, Modal, Field } from "./ui";
import { type Task, type State, uid } from "../../shared/domain";
import {
  type FocusRun,
  settled,
  elapsedSeconds,
  timeEntries,
  clockText,
} from "../../shared/focus";
import type { TimeInput } from "../../shared/time";
const KEY = "studybuddy-focus-v1";
function restore(): FocusRun | null {
  try {
    const x = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!x) return null;
    if (
      typeof x.id !== "string" ||
      typeof x.taskId !== "string" ||
      typeof x.title !== "string" ||
      !["up", "down"].includes(x.mode) ||
      !Number.isInteger(x.targetSeconds) ||
      x.targetSeconds < 60 ||
      x.targetSeconds > 86400 ||
      !(
        x.startedAt === null ||
        (typeof x.startedAt === "number" && Number.isFinite(x.startedAt))
      ) ||
      !x.segments ||
      Array.isArray(x.segments) ||
      typeof x.segments !== "object" ||
      Object.entries(x.segments).some(
        ([d, v]) =>
          !/^\d{4}-\d{2}-\d{2}$/.test(d) ||
          typeof v !== "number" ||
          !Number.isFinite(v) ||
          v < 0,
      ) ||
      (Object.values(x.segments) as number[]).reduce((a, n) => a + n, 0) >
        86400000
    )
      return null;
    return x;
  } catch {
    return null;
  }
}
export default function TaskTimer({
  tasks,
  sessions,
  request,
  onSave,
}: {
  tasks: Task[];
  sessions: State["sessions"];
  request: { taskId?: string; nonce: number } | null;
  onSave: (input: TimeInput) => Promise<unknown>;
}) {
  const [run, setRun] = useState<FocusRun | null>(restore),
    [open, setOpen] = useState(false),
    [selected, setSelected] = useState(""),
    [mode, setMode] = useState<"up" | "down">("down"),
    [minutes, setMinutes] = useState("25"),
    [now, setNow] = useState(Date.now()),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!request) return;
    setOpen(true);
    setError("");
    if (!run) setSelected(request.taskId || "");
    else if (request.taskId && request.taskId !== run.taskId)
      setError("另一个任务仍有未保存的计时，请先保存或清空，再切换任务。");
  }, [request]);
  useEffect(() => {
    try {
      if (run) localStorage.setItem(KEY, JSON.stringify(run));
      else localStorage.removeItem(KEY);
    } catch {
      setError("浏览器无法保存计时草稿，刷新可能丢失。请先暂停并保存用时。");
    }
  }, [run]);
  useEffect(() => {
    if (run?.startedAt === null || !run) return;
    const update = () => setNow(Date.now());
    const i = setInterval(update, 250);
    window.addEventListener("focus", update);
    return () => {
      clearInterval(i);
      window.removeEventListener("focus", update);
    };
  }, [run?.startedAt]);
  const elapsed = run ? elapsedSeconds(run, now) : 0,
    limit = run
      ? run.mode === "down"
        ? run.targetSeconds
        : 86400
      : Number(minutes) * 60;
  useEffect(() => {
    if (run?.startedAt !== null && run && elapsed >= limit) {
      setRun(settled(run, Date.now()));
      setMessage(
        run.mode === "down"
          ? "倒计时结束！请保存本次用时；任务不会自动标为完成。"
          : "已达到24小时计时上限，请保存本次用时。",
      );
    }
  }, [elapsed, limit, run]);
  const task = tasks.find((t) => t.id === (run?.taskId || selected));
  const alreadySaved =
    !!run && sessions.some((x) => x.id.startsWith(`timer:${run.id}:`));
  const display = run
    ? run.mode === "down"
      ? Math.max(0, run.targetSeconds - elapsed)
      : elapsed
    : mode === "down"
      ? (Number(minutes) || 0) * 60
      : 0;
  const start = () => {
    setError("");
    setMessage("");
    if (run) {
      if (alreadySaved) {
        setError("这次计时已保存，请清空后开始新一轮。");
        return;
      }
      if (elapsed >= limit) return;
      setNow(Date.now());
      setRun({ ...run, startedAt: Date.now() });
      return;
    }
    if (!task) {
      setError("请先选择要记录用时的任务。");
      return;
    }
    const n = Number(minutes);
    if (mode === "down" && (!Number.isInteger(n) || n < 1 || n > 1440)) {
      setError("倒计时请输入1至1440之间的整数分钟。");
      return;
    }
    const next = {
      id: uid(),
      taskId: task.id,
      title: task.title,
      mode,
      targetSeconds: mode === "up" ? 86400 : n * 60,
      segments: {},
      startedAt: Date.now(),
    };
    setNow(Date.now());
    setRun(next);
  };
  const pause = () => {
    if (run) {
      setNow(Date.now());
      setRun(settled(run, Date.now()));
    }
  };
  const reset = () => {
    if (
      run &&
      !alreadySaved &&
      elapsed > 0 &&
      !window.confirm("清空尚未保存的计时？已经保存到数据库的记录不会删除。")
    )
      return;
    setRun(null);
    setMessage("");
    setError("");
  };
  const save = async () => {
    if (!run || busy || alreadySaved) return;
    const stopped = settled(run, Date.now());
    setRun(stopped);
    const entries = timeEntries(stopped);
    if (!entries.length) {
      setError("请至少计时1秒后再保存。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSave({ runId: run.id, taskId: run.taskId, entries });
      setMessage(
        `已保存 ${clockText(entries.reduce((a, e) => a + e.seconds, 0))}，已累计到任务实际用时。完成状态保持不变。`,
      );
      setSelected(run.taskId);
      setRun(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {run && !open && (
        <button
          className="focus-dock"
          aria-label="打开正在进行的任务计时"
          onClick={() => setOpen(true)}
        >
          <Timer size={17} />
          <span>{run.title}</span>
          <strong>{clockText(display)}</strong>
          <small>
            {alreadySaved
              ? "已保存"
              : run.startedAt === null
                ? "已暂停"
                : "计时中"}
          </small>
        </button>
      )}
      {open && (
        <Modal
          title="专注计时"
          description="用时记录独立于Excel预计分钟。暂停后可继续；保存用时不会自动打卡。"
          onClose={() => setOpen(false)}
        >
          <div className="focus-timer">
            {error && (
              <div className="alert" role="alert">
                {error}
              </div>
            )}
            {message && (
              <p className="notice" role="status">
                {message}
              </p>
            )}
            {alreadySaved && (
              <p className="notice" role="status">
                这次计时已保存到数据库，无需重复提交。清空后可开始新一轮。
              </p>
            )}
            <Field label="计时任务">
              <select
                value={run?.taskId || selected}
                disabled={!!run || busy}
                onChange={(e) => setSelected(e.target.value)}
              >
                <option value="">选择一个学习任务</option>
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.date} · {t.title}
                  </option>
                ))}
              </select>
            </Field>
            {run && !task && (
              <p className="warning">
                当前任务已删除或不在此数据库中，草稿仍保留，请先恢复对应任务。
              </p>
            )}
            <div className="focus-mode" role="group" aria-label="计时方式">
              <Button
                variant={(run?.mode || mode) === "down" ? "default" : "outline"}
                disabled={!!run}
                onClick={() => setMode("down")}
              >
                <Timer size={15} />
                倒计时
              </Button>
              <Button
                variant={(run?.mode || mode) === "up" ? "default" : "outline"}
                disabled={!!run}
                onClick={() => setMode("up")}
              >
                <Clock size={15} />
                正计时
              </Button>
            </div>
            {!run && mode === "down" && (
              <>
                <div className="focus-presets">
                  {[15, 25, 45, 60].map((n) => (
                    <button
                      key={n}
                      className={minutes === String(n) ? "selected" : ""}
                      onClick={() => setMinutes(String(n))}
                    >
                      {n} 分钟
                    </button>
                  ))}
                </div>
                <Field label="倒计时分钟">
                  <input
                    type="number"
                    min="1"
                    max="1440"
                    value={minutes}
                    onChange={(e) => setMinutes(e.target.value)}
                  />
                </Field>
              </>
            )}
            <div
              className="focus-clock"
              style={
                {
                  "--focus-progress": `${run ? Math.min(100, (elapsed / limit) * 100) : 0}%`,
                } as React.CSSProperties
              }
            >
              <div>
                <small>
                  {(run?.mode || mode) === "down" ? "剩余时间" : "本次学习"}
                </small>
                <output role="timer" aria-live="off" aria-label="计时显示">
                  {clockText(display)}
                </output>
                <span>
                  {run ? `已学习 ${clockText(elapsed)}` : "一次只专注一件事"}
                </span>
              </div>
            </div>
            <div className="focus-controls">
              {run?.startedAt !== null && run ? (
                <Button onClick={pause} disabled={busy}>
                  <Pause size={16} />
                  暂停
                </Button>
              ) : (
                <Button
                  onClick={start}
                  disabled={busy || alreadySaved || (!!run && elapsed >= limit)}
                >
                  <Play size={16} />
                  {run ? "继续计时" : "开始计时"}
                </Button>
              )}
              <Button variant="outline" onClick={reset} disabled={busy}>
                <RotateCcw size={15} />
                清空
              </Button>
              <Button
                variant="outline"
                onClick={save}
                disabled={!run || busy || alreadySaved || !task}
              >
                <Save size={15} />
                保存用时
              </Button>
            </div>
            <p className="muted">
              后台标签页或最小化时继续计时；休息请暂停。暂停与计时草稿会保存在当前浏览器，刷新后可恢复。若电脑关机或休眠后仍在计时，恢复时也会计入，休息前请暂停。跨午夜按实际日期分别记录。
            </p>
            {run && (
              <details>
                <summary>本次记录明细</summary>
                {timeEntries(run, now).map((e) => (
                  <p key={e.date}>
                    {e.date} · {clockText(e.seconds)}
                  </p>
                ))}
              </details>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
