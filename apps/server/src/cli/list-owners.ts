import { runCli } from './cli-context';

// Lists owner accounts (no password hashes).
await runCli(async (prisma) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
    select: { username: true, createdAt: true, disabledAt: true },
  });
  if (users.length === 0) {
    console.log('No owners yet. Create one with create-owner.');
    return;
  }
  for (const user of users) {
    const state = user.disabledAt ? `disabled ${user.disabledAt.toISOString()}` : 'active';
    console.log(`${user.username}\tcreated ${user.createdAt.toISOString()}\t${state}`);
  }
});
