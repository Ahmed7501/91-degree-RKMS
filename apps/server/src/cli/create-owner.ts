import { hashPassword } from '../modules/auth/password';
import { askNewPassword, CliError, normalizeUsername, runCli } from './cli-context';
import { createPrompter } from './prompt';

// Creates an owner account (FR-AUTH-01). The only way to create users: no sign-up, no defaults.
await runCli(async (prisma) => {
  const prompt = createPrompter();
  try {
    const username = normalizeUsername(await prompt.ask('Owner username: '));
    if (await prisma.user.findUnique({ where: { username } })) {
      throw new CliError(`An owner named "${username}" already exists.`);
    }
    const password = await askNewPassword(prompt, username);
    await prisma.user.create({
      data: { username, passwordHash: await hashPassword(password) },
    });
    console.log(`Owner "${username}" created. Sign in at /owner/login.`);
  } finally {
    prompt.close();
  }
});
