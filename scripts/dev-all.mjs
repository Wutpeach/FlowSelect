import { execFileSync, spawn } from "node:child_process";

const forwardedArgs = process.argv.slice(2);
const isWindows = process.platform === "win32";

if (!isWindows) {
  const unix = spawn("sh", ["./scripts/dev-all.sh", ...forwardedArgs], {
    stdio: "inherit",
  });

  unix.on("error", (error) => {
    console.error(`[error] Failed to start dev-all script: ${error.message}`);
    process.exit(1);
  });

  unix.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
} else {
  const npmCmd = "npm";
  const windowsShell = process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe";
  const frontendPort = Number.parseInt(
    process.env.FLOWSELECT_FRONTEND_PORT ?? "1420",
    10,
  );
  const agentationPort = Number.parseInt(
    process.env.FLOWSELECT_AGENTATION_PORT ?? "4747",
    10,
  );
  let shuttingDown = false;
  let exitCode = 0;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const runPowerShell = (command) => {
    try {
      return execFileSync(
        "powershell",
        ["-NoProfile", "-Command", command],
        { encoding: "utf8" },
      );
    } catch {
      return "";
    }
  };

  const listPortListeners = (port) => {
    const output = runPowerShell(
      `Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique`,
    );
    return output
      .split(/\r?\n/)
      .map((line) => Number.parseInt(line.trim(), 10))
      .filter((pid) => Number.isInteger(pid) && pid > 0);
  };

  const getProcessCommand = (pid) => {
    const output = runPowerShell(
      `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}" -ErrorAction SilentlyContinue).CommandLine`,
    );
    return output.trim();
  };

  const stopProcessTree = (pid) => {
    try {
      execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } catch {
      // Ignore already-exited processes.
    }
  };

  const waitForPortFree = async (port, maxChecks = 25) => {
    for (let checks = 0; checks < maxChecks; checks += 1) {
      if (listPortListeners(port).length === 0) {
        return true;
      }
      await sleep(200);
    }
    return false;
  };

  const isRelatedOwner = (port, commandLine) => {
    const normalized = commandLine.toLowerCase();
    if (port === frontendPort) {
      return normalized.includes("vite");
    }
    if (port === agentationPort) {
      return normalized.includes("agentation-mcp");
    }
    return false;
  };

  const ensurePortAvailable = async (port, ownerHint) => {
    const pids = listPortListeners(port);
    if (pids.length === 0) {
      return true;
    }

    for (const pid of pids) {
      const commandLine = getProcessCommand(pid);
      if (isRelatedOwner(port, commandLine)) {
        console.log(`[cleanup] reclaiming port ${port} from PID ${pid}`);
        stopProcessTree(pid);
        continue;
      }

      const detail = commandLine || "(unable to read command line)";
      console.error(`[error] port ${port} is occupied by an unrelated process:`);
      console.error(`        PID ${pid}: ${detail}`);
      console.error(`        stop it manually or set another ${ownerHint} port.`);
      return false;
    }

    if (!(await waitForPortFree(port))) {
      console.error(`[error] port ${port} is still in use.`);
      return false;
    }

    return true;
  };

  const frontendReady = await ensurePortAvailable(frontendPort, "frontend");
  const agentationReady = await ensurePortAvailable(agentationPort, "agentation");

  if (!frontendReady || !agentationReady) {
    process.exit(1);
  }

  console.log("[start] Agentation MCP server");
  console.log("[start] Tauri dev (frontend + backend)");
  console.log("[hint] press Ctrl+C to stop all services");

  const agentation = spawn(npmCmd, ["run", "agentation:mcp"], {
    stdio: "inherit",
    shell: windowsShell,
  });

  const tauriArgs = ["run", "tauri", "dev"];
  if (forwardedArgs.length > 0) {
    tauriArgs.push("--", ...forwardedArgs);
  }
  const tauri = spawn(npmCmd, tauriArgs, {
    stdio: "inherit",
    shell: windowsShell,
  });

  const stopChild = (child) => {
    if (!child || child.killed) {
      return;
    }
    child.kill("SIGTERM");
  };

  const shutdown = () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.log("");
    console.log("[shutdown] stopping dev services...");
    stopChild(tauri);
    stopChild(agentation);
  };

  process.on("SIGINT", () => {
    shutdown();
  });

  process.on("SIGTERM", () => {
    shutdown();
  });

  agentation.on("error", (error) => {
    console.error(`[error] Failed to start agentation:mcp: ${error.message}`);
    exitCode = 1;
    shutdown();
  });

  tauri.on("error", (error) => {
    console.error(`[error] Failed to start tauri dev: ${error.message}`);
    exitCode = 1;
    shutdown();
  });

  agentation.on("exit", (code, signal) => {
    if (!shuttingDown) {
      console.log("[exit] agentation MCP stopped");
      if ((code ?? 0) !== 0) {
        console.log(`[hint] Check whether port ${agentationPort} is occupied.`);
      }
      exitCode = code ?? (signal ? 1 : 0);
      shutdown();
    }
  });

  tauri.on("exit", (code, signal) => {
    if (!shuttingDown) {
      console.log("[exit] tauri dev stopped");
      if ((code ?? 0) !== 0) {
        console.log(`[hint] Check whether port ${frontendPort} is occupied.`);
      }
      exitCode = code ?? (signal ? 1 : 0);
      shutdown();
    }
  });

  process.on("exit", () => {
    stopChild(tauri);
    stopChild(agentation);
  });

  const waitForExit = () => {
    if (!shuttingDown) {
      setTimeout(waitForExit, 200);
      return;
    }

    const agentationExited =
      agentation.exitCode !== null || agentation.signalCode !== null;
    const tauriExited = tauri.exitCode !== null || tauri.signalCode !== null;

    if (!agentationExited || !tauriExited) {
      setTimeout(waitForExit, 200);
      return;
    }

    process.exit(exitCode);
  };

  waitForExit();
}
