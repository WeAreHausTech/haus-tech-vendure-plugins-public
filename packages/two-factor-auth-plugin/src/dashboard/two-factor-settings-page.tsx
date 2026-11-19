import {
  api,
  Button,
  DashboardRouteDefinition,
  Input,
  Label,
  Page,
  PageBlock,
  PageLayout,
  PageTitle,
  PasswordInput,
} from '@vendure/dashboard'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ShieldCheckIcon } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { toast } from 'sonner'

import {
  BackupCodeList,
  CodeForm,
  EnrolmentInstructions,
  ErrorLine,
  usePendingAction,
} from './components'
import {
  beginEnrolmentDocument,
  beginReplacementDocument,
  confirmEnrolmentDocument,
  confirmReplacementDocument,
  disableDocument,
  EnrolmentSecret,
  errorMessage,
  regenerateBackupCodesDocument,
  twoFactorStatusDocument,
  TwoFactorMutationResult,
  TwoFactorStatusResult,
} from './gql'

const statusQueryKey = ['two-factor-status']

type Panel =
  | { name: 'idle' }
  | { name: 'password' }
  | { name: 'scan'; enrolment: EnrolmentSecret; replacing: boolean }
  | { name: 'codes'; backupCodes: string[] }
  | { name: 'disable' }
  | { name: 'regenerate' }
  | { name: 'replace' }

async function mutate(document: string, variables: Record<string, string>) {
  const data = (await api.mutate(document, variables)) as Record<string, TwoFactorMutationResult>
  return Object.values(data)[0]
}

/** Password plus a current code: the two proofs that start replacing the authenticator. */
function ReplaceForm({
  onStarted,
  onCancel,
}: Readonly<{ onStarted: (enrolment: EnrolmentSecret) => void; onCancel: () => void }>) {
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const { run, error, setError, isPending } = usePendingAction()

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void run(async () => {
      const result = await mutate(beginReplacementDocument, { password, code: code.trim() })
      if (result.success && result.enrolment) {
        onStarted(result.enrolment)
        return
      }
      // A wrong password leaves the code unspent, so only the field that was wrong is cleared.
      if (result.error === 'INVALID_PASSWORD') {
        setPassword('')
      } else {
        setCode('')
      }
      setError(errorMessage(result.error))
    })
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <p className="text-sm text-muted-foreground">
        Set up a new authenticator app, for example on a new phone. Your current authenticator keeps
        working until the new one is confirmed, which has to happen within a few minutes.
      </p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="two-factor-replace-password">Confirm your password</Label>
        <PasswordInput
          id="two-factor-replace-password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="two-factor-replace-code">
          Code from your current authenticator, or a backup code
        </Label>
        <Input
          id="two-factor-replace-code"
          name="code"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="123456 or a backup code"
        />
      </div>
      <ErrorLine error={error} />
      <div className="flex gap-2">
        <Button type="submit" disabled={isPending || !password || !code.trim()}>
          Continue
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

function TwoFactorSettingsPage() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: statusQueryKey,
    queryFn: () => api.query(twoFactorStatusDocument) as Promise<TwoFactorStatusResult>,
  })
  const status = data?.activeAdministratorTwoFactor
  const [panel, setPanel] = useState<Panel>({ name: 'idle' })
  const [password, setPassword] = useState('')
  const { run, error, setError, isPending } = usePendingAction()

  const refresh = () => queryClient.invalidateQueries({ queryKey: statusQueryKey })

  const submitPassword = (event: FormEvent) => {
    event.preventDefault()
    void run(async () => {
      const result = await mutate(beginEnrolmentDocument, { password })
      setPassword('')
      if (result.success && result.enrolment) {
        setPanel({ name: 'scan', enrolment: result.enrolment, replacing: false })
      } else {
        setError(errorMessage(result.error))
      }
    })
  }

  const withCode =
    (document: string, onSuccess: (result: TwoFactorMutationResult) => void) => (code: string) =>
      run(async () => {
        const result = await mutate(document, { code })
        if (result.success) {
          onSuccess(result)
          await refresh()
        } else {
          setError(errorMessage(result.error))
        }
      })

  const errorLine = <ErrorLine error={error} />

  return (
    <Page pageId="two-factor-settings">
      <PageTitle>Two-factor authentication</PageTitle>
      <PageLayout>
        <PageBlock column="main" blockId="two-factor-status">
          {isLoading || !status ? null : (
            <div className="flex max-w-lg flex-col gap-4">
              <div className="flex items-center gap-2">
                <ShieldCheckIcon
                  className={
                    status.enabled ? 'h-5 w-5 text-success' : 'h-5 w-5 text-muted-foreground'
                  }
                />
                <span className="font-medium">
                  {status.enabled
                    ? 'Two-factor authentication is on'
                    : 'Two-factor authentication is off'}
                </span>
              </div>
              {status.enabled && (
                <p className="text-sm text-muted-foreground">
                  {status.backupCodesRemaining} unused backup code
                  {status.backupCodesRemaining === 1 ? '' : 's'} left.
                  {status.required && ' Your account requires two-factor authentication.'}
                </p>
              )}
              {!status.enabled && (
                <p className="text-sm text-muted-foreground">
                  Protect your account with a code from an authenticator app in addition to your
                  password.
                </p>
              )}

              {panel.name === 'idle' && (
                <div className="flex gap-2">
                  {!status.enabled && (
                    <Button onClick={() => setPanel({ name: 'password' })}>Set up</Button>
                  )}
                  {status.enabled && (
                    <>
                      <Button variant="outline" onClick={() => setPanel({ name: 'regenerate' })}>
                        New backup codes
                      </Button>
                      <Button variant="outline" onClick={() => setPanel({ name: 'replace' })}>
                        Replace authenticator
                      </Button>
                      {!status.required && (
                        <Button variant="destructive" onClick={() => setPanel({ name: 'disable' })}>
                          Turn off
                        </Button>
                      )}
                    </>
                  )}
                </div>
              )}

              {panel.name === 'password' && (
                <form className="flex flex-col gap-4" onSubmit={submitPassword}>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="two-factor-current-password">Confirm your password</Label>
                    <PasswordInput
                      id="two-factor-current-password"
                      autoComplete="current-password"
                      autoFocus
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  {errorLine}
                  <div className="flex gap-2">
                    <Button type="submit" disabled={isPending || !password}>
                      Continue
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setPanel({ name: 'idle' })}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              )}

              {panel.name === 'replace' && (
                <ReplaceForm
                  onStarted={(enrolment) => {
                    // The form has its own error; drop one left over from another panel.
                    setError(undefined)
                    setPanel({ name: 'scan', enrolment, replacing: true })
                    // A backup code may have been spent.
                    void refresh()
                  }}
                  onCancel={() => setPanel({ name: 'idle' })}
                />
              )}

              {panel.name === 'scan' && (
                <div className="flex flex-col gap-6">
                  <EnrolmentInstructions enrolment={panel.enrolment} />
                  <CodeForm
                    label={panel.replacing ? 'Code from the new app' : 'Code from the app'}
                    submitLabel={panel.replacing ? 'Replace authenticator' : 'Turn on'}
                    allowBackupCode={false}
                    isPending={isPending}
                    onSubmit={withCode(
                      panel.replacing ? confirmReplacementDocument : confirmEnrolmentDocument,
                      (result) => {
                        setPanel({ name: 'codes', backupCodes: result.backupCodes ?? [] })
                        toast.success(
                          panel.replacing
                            ? 'Your authenticator was replaced. Your other sessions were signed out.'
                            : 'Two-factor authentication is on. Your other sessions were signed out.',
                        )
                      },
                    )}
                  >
                    {errorLine}
                  </CodeForm>
                  <Button type="button" variant="ghost" onClick={() => setPanel({ name: 'idle' })}>
                    Cancel
                  </Button>
                </div>
              )}

              {panel.name === 'codes' && (
                <div className="flex flex-col gap-4">
                  <BackupCodeList codes={panel.backupCodes} />
                  <Button onClick={() => setPanel({ name: 'idle' })}>Done</Button>
                </div>
              )}

              {panel.name === 'regenerate' && (
                <CodeForm
                  submitLabel="Create new backup codes"
                  isPending={isPending}
                  onSubmit={withCode(regenerateBackupCodesDocument, (result) =>
                    setPanel({ name: 'codes', backupCodes: result.backupCodes ?? [] }),
                  )}
                >
                  <p className="text-sm text-muted-foreground">
                    Your current backup codes stop working.
                  </p>
                  {errorLine}
                </CodeForm>
              )}

              {panel.name === 'disable' && (
                <CodeForm
                  submitLabel="Turn off two-factor authentication"
                  isPending={isPending}
                  onSubmit={withCode(disableDocument, () => {
                    setPanel({ name: 'idle' })
                    toast.success(
                      'Two-factor authentication is off. Your other sessions were signed out.',
                    )
                  })}
                >
                  {errorLine}
                </CodeForm>
              )}
            </div>
          )}
        </PageBlock>
      </PageLayout>
    </Page>
  )
}

export const twoFactorSettingsRoute: DashboardRouteDefinition = {
  path: '/two-factor',
  navMenuItem: {
    sectionId: 'settings',
    id: 'two-factor',
    url: '/two-factor',
    title: 'Two-factor authentication',
  },
  loader: () => ({ breadcrumb: 'Two-factor authentication' }),
  component: () => <TwoFactorSettingsPage />,
}
