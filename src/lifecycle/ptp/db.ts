import type { MakeLifecycleManagerPtpHandler } from '.'

export const makeListPool: MakeLifecycleManagerPtpHandler<'ListPool'> =
  (context) => () => {}

export const makeCreatePool: MakeLifecycleManagerPtpHandler<'CreatePool'> =
  (context) => () => {}

export const makeUpdatePool: MakeLifecycleManagerPtpHandler<'UpdatePool'> =
  (context) => () => {}

export const makeListWorker: MakeLifecycleManagerPtpHandler<'ListWorker'> =
  (context) => () => {}

export const makeCreateWorker: MakeLifecycleManagerPtpHandler<'CreateWorker'> =
  (context) => () => {}

export const makeUpdateWorker: MakeLifecycleManagerPtpHandler<'UpdateWorker'> =
  (context) => () => {}
