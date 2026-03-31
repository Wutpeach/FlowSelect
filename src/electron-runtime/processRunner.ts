import { spawn, type ChildProcessByStdio } from "node:child_process";
import { once } from "node:events";
import type { Readable } from "node:stream";
import { setTimeout as sleep } from "node:timers/promises";

type StreamingChildProcess = ChildProcessByStdio<null, Readable, Readable>;

type StreamingCommandOptions = {
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  onStdoutLine?(line: string): void | Promise<void>;
  onStderrLine?(line: string): void | Promise<void>;
};

const attachLineStream = (
  childStream: StreamingChildProcess["stdout"],
  onLine?: (line: string) => void | Promise<void>,
): Promise<void> => {
  if (!onLine) {
    childStream.resume();
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    childStream.setEncoding("utf8");
    let buffer = "";
    let lineChain = Promise.resolve();

    const enqueueLine = (line: string) => {
      lineChain = lineChain.then(() => onLine(line));
    };

    childStream.on("data", (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        enqueueLine(line);
      }
    });
    childStream.on("error", reject);
    childStream.on("end", () => {
      if (buffer.trim()) {
        enqueueLine(buffer);
      }
      lineChain.then(() => resolve(), reject);
    });
  });
};

const waitForChildExit = async (
  child: StreamingChildProcess,
  timeoutMs: number,
): Promise<boolean> => {
  if (child.exitCode !== null) {
    return true;
  }
  const timedOut = await Promise.race([
    once(child, "exit").then(() => false),
    sleep(timeoutMs).then(() => true),
  ]);
  return timedOut === false;
};

const killChild = async (child: StreamingChildProcess): Promise<void> => {
  if (child.exitCode !== null || child.killed) {
    return;
  }

  if (process.platform === "win32" && typeof child.pid === "number" && child.pid > 0) {
    const taskkill = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    await once(taskkill, "close").catch(() => undefined);
    const exited = await waitForChildExit(child, 800);
    if (exited || child.exitCode !== null) {
      return;
    }
  } else {
    child.kill();
    const exited = await waitForChildExit(child, 500);
    if (exited || child.exitCode !== null) {
      return;
    }
  }

  if (child.exitCode === null) {
    child.kill("SIGKILL");
  }
};

export const runStreamingCommand = async (
  command: string,
  args: string[],
  options: StreamingCommandOptions = {},
): Promise<number> => {
  const child = spawn(command, args, {
    env: options.env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  const stdoutHandled = attachLineStream(child.stdout, options.onStdoutLine);
  const stderrHandled = attachLineStream(child.stderr, options.onStderrLine);

  if (options.signal) {
    if (options.signal.aborted) {
      await killChild(child);
    } else {
      options.signal.addEventListener(
        "abort",
        () => {
          void killChild(child);
        },
        { once: true },
      );
    }
  }

  const [code] = await once(child, "close");
  await Promise.all([stdoutHandled, stderrHandled]);
  if (typeof code === "number") {
    return code;
  }
  throw new Error(`Command exited without status: ${command} ${args.join(" ")}`);
};
