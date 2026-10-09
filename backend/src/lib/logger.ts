// Minimal structured logger. Callers must not pass transcripts, GLIDs or credentials.
type Fields = Record<string, string | number | boolean | undefined>;

let silent = false;
export const setLogSilent = (value: boolean): void => {
  silent = value;
};

function write(level: "info" | "warn" | "error", msg: string, fields?: Fields): void {
  if (silent) return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...fields });
  (level === "error" ? process.stderr : process.stdout).write(`${line}\n`);
}

export const log = {
  info: (msg: string, fields?: Fields) => write("info", msg, fields),
  warn: (msg: string, fields?: Fields) => write("warn", msg, fields),
  error: (msg: string, fields?: Fields) => write("error", msg, fields),
};
