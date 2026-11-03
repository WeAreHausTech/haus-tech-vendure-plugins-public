import { useAuth } from '@vendure/dashboard'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { ReactNode, useEffect, useRef } from 'react'

import { TWO_FACTOR_LOGIN_PATH } from './two-factor-login-page'

/**
 * Rendered before the stock login form. The stock form cannot take a second factor, so every
 * sign-in is sent to the two-factor page, which also signs in administrators without one.
 */
export function LoginRedirect() {
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { redirect?: string }
  useEffect(() => {
    // The route is registered at runtime, so the router's static types do not know it.
    navigate({
      to: TWO_FACTOR_LOGIN_PATH,
      search: { redirect: search.redirect } as never,
      replace: true,
    })
  }, [navigate, search.redirect])
  return null
}

/**
 * After a password reset the stock page signs in with the new password alone. For an
 * administrator with a second factor that sign-in is refused (the reset itself has
 * succeeded), so send them to the two-factor page instead of leaving them on the reset page.
 */
export function ResetPasswordRedirect({ children }: Readonly<{ children: ReactNode }>) {
  const { status, authenticationError } = useAuth()
  const previousStatus = useRef(status)
  useEffect(() => {
    const wasVerifying = previousStatus.current === 'verifying'
    previousStatus.current = status
    const path = window.location.pathname
    if (
      wasVerifying &&
      status === 'unauthenticated' &&
      authenticationError &&
      /\/reset-password\/?$/.test(path)
    ) {
      window.location.assign(
        `${path.replace(/reset-password\/?$/, TWO_FACTOR_LOGIN_PATH.slice(1))}?reset=true`,
      )
    }
  }, [status, authenticationError])
  return <>{children}</>
}
