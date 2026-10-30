import { CliError, normalizeUsername, revokeOwnerSessions, runCli } from './cli-context';
import { createPrompter } from './prompt';

// Disables an owner: login is refused and every existing session ends (SECURITY §1).
await runCli(async (prisma) => {
  const prompt = createPrompter();
  try {
    const username = normalizeUsername(await prompt.ask('Owner username to disable: '));
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) throw new CliError(`No owner named "${username}".`);
    const confirm = await prompt.ask(`Type "${username}" again to confirm: `);
    if (confirm.trim().toLowerCase() !== username)
      throw new CliError('Not confirmed. Nothing changed.');
    const now = new Date();
    await prisma.user.update({ where: { id: user.id }, data: { disabledAt: now, updatedAt: now } });
    const revoked = await revokeOwnerSessions(prisma, user.id);
    console.log(`Owner "${username}" disabled. Signed out of ${revoked} session(s).`);
  } finally {
    prompt.close();
  }
});
