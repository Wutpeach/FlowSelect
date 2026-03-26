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
): void => {
  if (!onLine) {
    childStream.resume();
    return;
  }

  childStream.setEncoding("utf8");
  let buffer = "";
  childStream.on("data", (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      void onLine(line);
    }
  });
  childStream.on("end", () => {
    if (buffer.trim()) {
      void onLine(buffer);
    }
  });
};

const killChild = async (child: StreamingChildProcess): Promise<void> => {
  if (child.exitCode !== null || child.killed) {
    return;
  }

  child.kill();
  const timedOut = await Promise.race([
    once(child, "exit").then(() => false),
    sleep(500).then(() => true),
  ]);
  if (timedOut && child.exitCode === null) {
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

  attachLineStream(child.stdout, options.onStdoutLine);
  attachLineStream(child.stderr, options.onStderrLine);

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
  if (typeof code === "number") {
    return code;
  }
  throw new Error(`Command exited without status: ${command} ${args.join(" ")}`);
};
