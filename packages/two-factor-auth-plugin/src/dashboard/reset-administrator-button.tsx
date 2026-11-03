import { api, Button } from '@vendure/dashboard'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { administratorTwoFactorDocument, errorMessage, resetAdministratorDocument } from './gql'

/** Action on the administrator detail page, for an administrator who has lost their device. */
export function ResetAdministratorTwoFactorButton({
  context,
}: Readonly<{ context: { entity?: { id?: string } } }>) {
  const administratorId = context.entity?.id
  const queryClient = useQueryClient()
  const queryKey = ['administrator-two-factor', administratorId]
  const { data } = useQuery({
    queryKey,
    enabled: !!administratorId,
    queryFn: () =>
      api.query(administratorTwoFactorDocument, { id: administratorId }) as Promise<{
        administrator: { twoFactorEnabled: boolean } | null
      }>,
  })
  if (!data?.administrator?.twoFactorEnabled) {
    return null
  }
  const reset = async () => {
    if (
      !window.confirm(
        'Reset two-factor authentication for this administrator? They are signed out everywhere and set it up again at their next sign-in.',
      )
    ) {
      return
    }
    try {
      const { resetAdministratorTwoFactor } = (await api.mutate(resetAdministratorDocument, {
        administratorId,
      })) as { resetAdministratorTwoFactor: { success: boolean; error: string | null } }
      if (resetAdministratorTwoFactor.success) {
        toast.success('Two-factor authentication was reset')
        await queryClient.invalidateQueries({ queryKey })
      } else {
        toast.error(errorMessage(resetAdministratorTwoFactor.error))
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : errorMessage(null))
    }
  }
  return (
    <Button variant="outline" onClick={reset}>
      Reset 2FA
    </Button>
  )
}
