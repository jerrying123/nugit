import fs from "fs";
import readline from "readline";

/**
 * @param {string} prompt
 */
export function questionLine(prompt) {
  return new Promise((resolve) => {
    let input = process.stdin;
    let output = process.stdout;
    let closeTty = null;
    // Prefer direct TTY streams so prompts remain stable after Ink unmount/mode switches.
    try {
      if (process.stdin.isTTY) {
        const inFd = fs.openSync("/dev/tty", "r");
        const outFd = fs.openSync("/dev/tty", "w");
        input = fs.createReadStream("", { fd: inFd, autoClose: true });
        output = fs.createWriteStream("", { fd: outFd, autoClose: true });
        closeTty = () => {
          try {
            input.destroy();
          } catch {}
          try {
            output.end();
          } catch {}
        };
      }
    } catch {
      // Fallback to process stdio.
    }
    const rl = readline.createInterface({
      input,
      output,
      terminal: true
    });
    if (input && typeof input.resume === "function") {
      input.resume();
    }
    rl.question(prompt, (ans) => {
      rl.close();
      if (closeTty) {
        closeTty();
      }
      resolve(ans);
    });
  });
}
