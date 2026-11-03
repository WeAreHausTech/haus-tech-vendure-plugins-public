import { api, Button, ConfirmationDialog } from '@vendure/dashboard'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import {
  administratorTwoFactorDocument,
  errorMessage,
  resetAdministratorDocument,
  TwoFactorMutationResult,
} from './gql'

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
    try {
      const { resetAdministratorTwoFactor: result } = (await api.mutate(
        resetAdministratorDocument,
        {
          administratorId,
        },
      )) as { resetAdministratorTwoFactor: TwoFactorMutationResult }
      if (result.success) {
        toast.success('Two-factor authentication was reset')
        await queryClient.invalidateQueries({ queryKey })
      } else {
        toast.error(errorMessage(result.error))
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : errorMessage(null))
    }
  }
  return (
    <ConfirmationDialog
      title="Reset two-factor authentication?"
      description="The administrator is signed out everywhere and sets up two-factor authentication again at their next sign-in."
      confirmText="Reset"
      destructive
      onConfirm={reset}
    >
      <Button variant="outline">Reset 2FA</Button>
    </ConfirmationDialog>
  )
}
