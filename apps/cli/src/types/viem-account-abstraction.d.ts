declare module "viem/account-abstraction" {
  export const createBundlerClient: (...args: any[]) => any;
  export const formatUserOperationRequest: (...args: any[]) => any;
  export type RpcUserOperation = any;
}
