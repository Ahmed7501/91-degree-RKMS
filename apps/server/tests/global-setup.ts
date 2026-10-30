import { recreateTestSchema } from './helpers/test-db';

/** Once per integration run: empty `rkds_test` and apply every migration (INTEGRATION_TESTING §1). */
export default async function setup(): Promise<void> {
  await recreateTestSchema();
}
