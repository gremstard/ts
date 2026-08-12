const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function startSpinner(label) {
  if (!process.stderr.isTTY) {
    process.stderr.write(`${label}\n`);
    return () => {};
  }

  let i = 0;
  const timer = setInterval(() => {
    process.stderr.write(`\r${FRAMES[i % FRAMES.length]} ${label}`);
    i++;
  }, 80);

  return () => {
    clearInterval(timer);
    process.stderr.write(`\r${" ".repeat(label.length + 2)}\r`);
  };
}
