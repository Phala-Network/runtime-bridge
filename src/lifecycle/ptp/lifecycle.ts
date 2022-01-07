import type { MakeLifecycleManagerPtpHandler } from '.'

export const makeRestartWorker: MakeLifecycleManagerPtpHandler<
  'RestartWorker'
> = (context) => () => {}

export const makeKickWorker: MakeLifecycleManagerPtpHandler<'KickWorker'> =
  (context) => () => {}

export const makeGetWorkerStatus: MakeLifecycleManagerPtpHandler<
  'GetWorkerStatus'
> = (context) => () => {}
