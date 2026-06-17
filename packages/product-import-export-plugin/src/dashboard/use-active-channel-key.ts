import { useChannel } from '@vendure/dashboard'

/** Changes when the admin switches channel — use as a useEffect dependency to refetch channel-scoped data. */
export function useActiveChannelKey(): string | undefined {
  const { activeChannel } = useChannel()
  return activeChannel?.id
}
