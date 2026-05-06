const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function startSpinner(label: string): () => void {
  if (!process.stderr.isTTY) {
    process.stderr.write(label + "...\n");
    return () => {};
  }
  let i = 0;
  const interval = setInterval(() => {
    process.stderr.write(`\r\x1b[2m${FRAMES[i % FRAMES.length]} ${label}\x1b[0m`);
    i++;
  }, 80);
  return () => {
    clearInterval(interval);
    process.stderr.write(
      `\r\x1b[K`, // clear the line
    );
  };
}

export function tty(): boolean {
  return process.stdout.isTTY;
}

export const C = {
  bold: (s: string) => (tty() ? `\x1b[1m${s}\x1b[0m` : s),
  dim: (s: string) => (tty() ? `\x1b[2m${s}\x1b[0m` : s),
  green: (s: string) => (tty() ? `\x1b[32m${s}\x1b[0m` : s),
  red: (s: string) => (tty() ? `\x1b[31m${s}\x1b[0m` : s),
  yellow: (s: string) => (tty() ? `\x1b[33m${s}\x1b[0m` : s),
  cyan: (s: string) => (tty() ? `\x1b[36m${s}\x1b[0m` : s),
};
