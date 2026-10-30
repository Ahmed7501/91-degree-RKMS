import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

/**
 * Interactive prompts for the owner CLI. Passwords are typed into a hidden TTY prompt and are never
 * accepted as command arguments (shell history, SECURITY §1). Without a TTY (tests, piped input),
 * answers are read line by line from stdin.
 */
export interface Prompter {
  ask(question: string): Promise<string>;
  askHidden(question: string): Promise<string>;
  close(): void;
}

export type HiddenKeyResult =
  { state: 'typing'; value: string } | { state: 'enter'; value: string } | { state: 'cancel' };

/**
 * Applies one chunk of raw-mode keystrokes to the hidden value. In raw mode Enter is '\r' on every
 * platform; a lone '\n' is ignored because Windows terminals can deliver the '\n' of a '\r\n' pair
 * after the previous prompt has already finished, which would otherwise submit an empty answer.
 */
export function applyHiddenKeys(value: string, chunk: string): HiddenKeyResult {
  let next = value;
  for (const ch of chunk) {
    if (ch === '\r') return { state: 'enter', value: next };
    if (ch === '\u0003') return { state: 'cancel' };
    if (ch === '\n') continue;
    if (ch === '\u007f' || ch === '\b') next = next.slice(0, -1);
    else next += ch;
  }
  return { state: 'typing', value: next };
}

function readHiddenFromTty(question: string): Promise<string> {
  stdout.write(question);
  stdin.setRawMode(true);
  stdin.setEncoding('utf8');
  stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
    };
    const onData = (chunk: string) => {
      const result = applyHiddenKeys(value, chunk);
      if (result.state === 'typing') {
        value = result.value;
        return;
      }
      finish();
      if (result.state === 'enter') resolve(result.value);
      else reject(new Error('Cancelled.'));
    };
    stdin.on('data', onData);
  });
}

function pipedPrompter(): Prompter {
  let lines: Promise<string[]> | undefined;
  let index = 0;
  const allLines = () => {
    lines ??= (async () => {
      let data = '';
      stdin.setEncoding('utf8');
      for await (const chunk of stdin) data += String(chunk);
      return data.split(/\r?\n/);
    })();
    return lines;
  };
  const next = async (question: string) => {
    stdout.write(question);
    const value = (await allLines())[index] ?? '';
    index += 1;
    stdout.write('\n');
    return value;
  };
  return { ask: next, askHidden: next, close: () => undefined };
}

export function createPrompter(): Prompter {
  if (!stdin.isTTY) return pipedPrompter();
  return {
    ask: async (question) => {
      const rl = createInterface({ input: stdin, output: stdout });
      try {
        return await rl.question(question);
      } finally {
        rl.close();
      }
    },
    askHidden: readHiddenFromTty,
    close: () => stdin.pause(),
  };
}
