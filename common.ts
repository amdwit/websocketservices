type ServiceResultAtom = null | string | number | boolean
type ServiceResult = ServiceResultAtom | ServiceResult[] | { [key: string]: ServiceResult }

export interface Service {
  (...args: any[]): Promise<void|undefined | ServiceResult|any>
}

export type ServiceMap<ServiceName extends string=string> = {
  [key in ServiceName]: Service
}
