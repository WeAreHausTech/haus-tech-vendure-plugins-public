import { defineDashboardExtension } from '@vendure/dashboard'

import { LoginRedirect, ResetPasswordRedirect } from './redirects'
import { ResetAdministratorTwoFactorButton } from './reset-administrator-button'
import { twoFactorLoginRoute } from './two-factor-login-page'
import { twoFactorSettingsRoute } from './two-factor-settings-page'

defineDashboardExtension({
  routes: [twoFactorLoginRoute, twoFactorSettingsRoute],
  login: {
    beforeForm: { component: LoginRedirect },
  },
  customProviders: [{ id: 'two-factor-reset-password-redirect', component: ResetPasswordRedirect }],
  actionBarItems: [
    {
      id: 'reset-two-factor',
      pageId: 'administrator-detail',
      component: ResetAdministratorTwoFactorButton,
      requiresPermission: 'ResetTwoFactor',
    },
  ],
})
