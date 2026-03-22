import readline from "readline";

/**
 * @param {string} prompt
 */
export function questionLine(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.question(prompt, (ans) => {
      rl.close();
      resolve(ans);
    });
  });
}
