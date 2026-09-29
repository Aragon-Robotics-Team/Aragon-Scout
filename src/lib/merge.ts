/** Last-write-wins merge of an incoming document against a local row. */
export function shouldAcceptRemote(
  local: { dirty: 0 | 1; doc: { updatedAt: number } } | undefined,
  remoteUpdatedAt: number,
): boolean {
  if (!local) return true
  if (local.dirty === 1) return remoteUpdatedAt > local.doc.updatedAt
  return remoteUpdatedAt >= local.doc.updatedAt
}
