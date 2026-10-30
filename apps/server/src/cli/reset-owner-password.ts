import { hashPassword } from '../modules/auth/password';
import {
  askNewPassword,
  CliError,
  normalizeUsername,
  revokeOwnerSessions,
  runCli,
} from './cli-context';
import { createPrompter } from './prompt';

// Sets a new password and signs the owner out everywhere (SECURITY §1).
await runCli(async (prisma) => {
  const prompt = createPrompter();
  try {
    const username = normalizeUsername(await prompt.ask('Owner username: '));
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) throw new CliError(`No owner named "${username}".`);
    const password = await askNewPassword(prompt, username);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(password), updatedAt: new Date() },
    });
    const revoked = await revokeOwnerSessions(prisma, user.id);
    console.log(`Password changed for "${username}". Signed out of ${revoked} session(s).`);
  } finally {
    prompt.close();
  }
});
