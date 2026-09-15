export async function persistThenCommit(persist: () => Promise<void>, commit: () => void) {
  await persist();
  commit();
}
