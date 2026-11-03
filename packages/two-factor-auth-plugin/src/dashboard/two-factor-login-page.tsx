import {
  api,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  DashboardRouteDefinition,
  Input,
  Label,
  LogoMark,
  LS_KEY_SELECTED_CHANNEL_TOKEN,
  PasswordInput,
  useAuth,
} from '@vendure/dashboard'
import { useQueryClient } from '@tanstack/react-query'
import { Link, Navigate, useNavigate } from '@tanstack/react-router'
import { FormEvent, useEffect, useState } from 'react'

import {
  BackupCodeList,
  CodeForm,
  EnrolmentInstructions,
  ErrorLine,
  usePendingAction,
} from './components'
import {
  authenticateTwoFactorDocument,
  AuthenticateTwoFactorResult,
  completeLoginEnrolmentDocument,
  EnrolmentSecret,
  errorMessage,
  loginDocument,
  LoginResult,
  logoutDocument,
  meChannelsDocument,
  MeChannelsResult,
  twoFactorLoginDocument,
  TwoFactorLoginResult,
  TwoFactorMutationResult,
} from './gql'

export const TWO_FACTOR_LOGIN_PATH = '/two-factor-login'

type Step =
  | { name: 'credentials' }
  | { name: 'code'; challengeToken: string }
  | { name: 'enrol'; challengeToken: string; enrolment: EnrolmentSecret }
  | { name: 'backup-codes'; challengeToken: string; backupCodes: string[] }

interface LoginSearch {
  redirect?: string
  reset?: boolean
}

type DashboardRoute = Parameters<DashboardRouteDefinition['component']>[0]

function TwoFactorLoginPage({ route }: Readonly<{ route: DashboardRoute }>) {
  const auth = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const search = route.useSearch() as LoginSearch
  const target = search.redirect || '/'

  const [step, setStep] = useState<Step>({ name: 'credentials' })
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const { run, error, setError, isPending } = usePendingAction()
  const [signedIn, setSignedIn] = useState(false)

  // Navigate once the Dashboard's auth state has caught up with the new session.
  useEffect(() => {
    if (signedIn && auth.isAuthenticated) {
      navigate({ to: target })
    }
  }, [signedIn, auth.isAuthenticated, navigate, target])

  const startOver = (message: string) => {
    setStep({ name: 'credentials' })
    setPassword('')
    setError(message)
  }

  /** Mirrors the Dashboard's own login: select a channel the user can use, then reload all data. */
  const finishSignIn = async () => {
    const { me } = (await api.query(meChannelsDocument)) as MeChannelsResult
    const channels = me?.channels ?? []
    if (!channels.length) {
      // The Dashboard cannot be used without a channel, so end the new session again.
      await api.mutate(logoutDocument, {})
      startOver('You do not have access to any channel.')
      return
    }
    let stored: string | null = null
    try {
      stored = localStorage.getItem(LS_KEY_SELECTED_CHANNEL_TOKEN)
      if (!channels.some((c) => c.token === stored)) {
        localStorage.setItem(LS_KEY_SELECTED_CHANNEL_TOKEN, channels[0].token)
      }
    } catch {
      // Storage can be unavailable; the Dashboard then picks the first channel itself.
    }
    await queryClient.cancelQueries()
    await queryClient.invalidateQueries()
    setSignedIn(true)
  }

  const redeem = async (challengeToken: string, code?: string) => {
    const { authenticate } = (await api.mutate(authenticateTwoFactorDocument, {
      challengeToken,
      code: code ?? null,
      rememberMe,
    })) as AuthenticateTwoFactorResult
    if (authenticate.__typename === 'CurrentUser') {
      await finishSignIn()
      return
    }
    const reason = authenticate.authenticationError
    if (reason === 'TWO_FACTOR_CHALLENGE_EXPIRED') {
      startOver(errorMessage(reason))
    } else {
      setError(errorMessage(reason || authenticate.message))
    }
  }

  const submitCredentials = (event: FormEvent) => {
    event.preventDefault()
    void run(async () => {
      const { twoFactorLogin } = (await api.mutate(twoFactorLoginDocument, {
        username,
        password,
      })) as TwoFactorLoginResult
      switch (twoFactorLogin.status) {
        case 'NOT_REQUIRED':
          // No second factor applies. Sign in here rather than with auth.login, which
          // cannot pass rememberMe.
          {
            const { login } = (await api.mutate(loginDocument, {
              username,
              password,
              rememberMe,
            })) as LoginResult
            if (login.__typename === 'CurrentUser') {
              await finishSignIn()
            } else {
              setError(login.message ?? errorMessage(null))
            }
          }
          break
        case 'CODE_REQUIRED':
          setStep({ name: 'code', challengeToken: twoFactorLogin.challengeToken! })
          break
        case 'ENROLMENT_REQUIRED':
          setStep({
            name: 'enrol',
            challengeToken: twoFactorLogin.challengeToken!,
            enrolment: twoFactorLogin.enrolment!,
          })
          break
        default:
          setError('The username or password is not correct.')
      }
    })
  }

  if (auth.isAuthenticated && !signedIn) {
    return <Navigate to={target} />
  }

  const loginError = error ?? (step.name === 'credentials' ? auth.authenticationError : undefined)

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-sidebar p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 md:max-w-md">
        <LogoMark className="h-8 w-auto text-brand" />
        <Card className="w-full">
          {step.name === 'credentials' && (
            <>
              <CardHeader>
                <CardTitle>Sign in</CardTitle>
                {search.reset && (
                  <CardDescription>
                    Your password has been changed. Sign in with the new password.
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <form className="flex flex-col gap-4" onSubmit={submitCredentials}>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="two-factor-username">Username</Label>
                    <Input
                      id="two-factor-username"
                      autoComplete="username"
                      autoFocus
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="two-factor-password">Password</Label>
                      <Link
                        to="/forgot-password"
                        className="text-xs text-muted-foreground underline"
                      >
                        Forgot password?
                      </Link>
                    </div>
                    <PasswordInput
                      id="two-factor-password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="two-factor-remember-me"
                      checked={rememberMe}
                      onCheckedChange={(checked) => setRememberMe(checked === true)}
                    />
                    <Label htmlFor="two-factor-remember-me">Remember me</Label>
                  </div>
                  <ErrorLine error={loginError} />
                  <Button type="submit" disabled={isPending || !username || !password}>
                    Sign in
                  </Button>
                </form>
              </CardContent>
            </>
          )}

          {step.name === 'code' && (
            <>
              <CardHeader>
                <CardTitle>Two-factor authentication</CardTitle>
                <CardDescription>
                  Enter the 6-digit code from your authenticator app, or one of your backup codes.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CodeForm
                  submitLabel="Verify"
                  isPending={isPending}
                  onSubmit={(code) => run(() => redeem(step.challengeToken, code))}
                >
                  <ErrorLine error={error} />
                </CodeForm>
                <Button variant="link" className="mt-2 w-full" onClick={() => startOver('')}>
                  Use another account
                </Button>
              </CardContent>
            </>
          )}

          {step.name === 'enrol' && (
            <>
              <CardHeader>
                <CardTitle>Set up two-factor authentication</CardTitle>
                <CardDescription>
                  Your account requires a second factor. Set it up to continue.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                <EnrolmentInstructions enrolment={step.enrolment} />
                <CodeForm
                  label="Code from the app"
                  submitLabel="Confirm"
                  allowBackupCode={false}
                  isPending={isPending}
                  onSubmit={(code) =>
                    run(async () => {
                      const { completeTwoFactorLoginEnrolment: result } = (await api.mutate(
                        completeLoginEnrolmentDocument,
                        { challengeToken: step.challengeToken, code },
                      )) as { completeTwoFactorLoginEnrolment: TwoFactorMutationResult }
                      if (result.success && result.backupCodes) {
                        setStep({
                          name: 'backup-codes',
                          challengeToken: step.challengeToken,
                          backupCodes: result.backupCodes,
                        })
                      } else if (result.error === 'CHALLENGE_EXPIRED') {
                        startOver(errorMessage(result.error))
                      } else {
                        setError(errorMessage(result.error))
                      }
                    })
                  }
                >
                  <ErrorLine error={error} />
                </CodeForm>
              </CardContent>
            </>
          )}

          {step.name === 'backup-codes' && (
            <>
              <CardHeader>
                <CardTitle>Two-factor authentication is on</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <BackupCodeList codes={step.backupCodes} />
                <ErrorLine error={error} />
                <Button disabled={isPending} onClick={() => run(() => redeem(step.challengeToken))}>
                  I have saved my codes, continue
                </Button>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}

export const twoFactorLoginRoute: DashboardRouteDefinition = {
  path: TWO_FACTOR_LOGIN_PATH,
  authenticated: false,
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
    reset: search.reset === true || search.reset === 'true' || search.reset === 1 || undefined,
  }),
  component: (route) => <TwoFactorLoginPage route={route} />,
}
