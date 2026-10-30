/** Injected time source (CLAUDE.md conventions). Business timestamps are read once per request. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};
