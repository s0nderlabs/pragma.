/**
 * Direct Web3Auth Bridge (Client-Side Only)
 *
 * This bridge directly accesses Web3Auth wallet for delegation signing without
 * any network transport overhead. Used exclusively in H2.5 client-side agent.
 *
 * Key Differences from H2 clientSideWeb3AuthBridge:
 * - NO SSE events - direct wallet access
 * - NO HTTP POST responses - synchronous execution
 * - NO EventEmitter coordination - no cross-endpoint communication
 * - NO timeout handling - immediate wallet interaction
 *
 * This eliminates 4 network round-trips per swap (0-4 delegations per transaction)
 * making execution more stable and faster.
 *
 * Architecture:
 * Server-side (H2):
 *   Tool → createEphemeralDelegation → clientSideWeb3AuthBridge.signTypedData()
 *     → SSE event → Client signs → HTTP POST → EventEmitter → resolves
 *
 * Client-side (H2.5):
 *   Tool → createEphemeralDelegation → directWeb3AuthBridge.signTypedData()
 *     → walletClient.signTypedData() → resolves immediately
 */

import type { Hex, Address, WalletClient } from 'viem';

/**
 * Web3Auth Bridge Interface
 *
 * Defines the contract for signing delegations with Web3Auth wallet.
 * Implemented by DirectWeb3AuthBridge for client-side H2.5 agent.
 */
export interface Web3AuthBridge {
  /**
   * Sign EIP-712 typed data
   * @param params - typedDataJson string and signer address
   * @returns Signature and recovered address
   */
  signTypedData(params: {
    typedDataJson: string;
    from: Address;
  }): Promise<{ signature: Hex; recoveredAddress: Address }>;

  /**
   * Check if bridge is ready to sign
   */
  isReady(): boolean;

  /**
   * Get the owner address
   */
  getOwnerAddress(): Hex;
}

export interface DirectWeb3AuthBridgeConfig {
  /**
   * Web3Auth wallet client (from useIdentity hook)
   * Must support signTypedData() method
   */
  walletClient: WalletClient;

  /**
   * Owner address (delegator address from Web3Auth wallet)
   * This is the address that signs delegations
   */
  ownerAddress: Hex;
}

/**
 * Direct Web3Auth Bridge for client-side LangChain agent
 *
 * Provides synchronous delegation signing without network transport.
 * Compatible with @pragma/core Web3AuthBridge interface.
 *
 * @example
 * ```typescript
 * const bridge = new DirectWeb3AuthBridge({
 *   walletClient: wallet.walletClient,
 *   ownerAddress: wallet.address,
 * });
 *
 * // Used by tools in @pragma/core
 * const signature = await bridge.signTypedData({
 *   domain: delegation.domain,
 *   types: delegation.types,
 *   primaryType: 'Delegation',
 *   message: delegation.message,
 *   from: ownerAddress,
 * });
 * ```
 */
export class DirectWeb3AuthBridge implements Web3AuthBridge {
  private walletClient: WalletClient;
  private ownerAddress: Hex;

  constructor(config: DirectWeb3AuthBridgeConfig) {
    this.walletClient = config.walletClient;
    this.ownerAddress = config.ownerAddress;
  }

  /**
   * Sign EIP-712 typed data with Web3Auth wallet (direct, no network transport)
   *
   * This method is called by @pragma/core tools during delegation creation.
   * It directly invokes walletClient.signTypedData() without any SSE/HTTP coordination.
   *
   * Matches CLI's Web3AuthBridge interface:
   * - Accepts typedDataJson as a JSON string (not parsed object)
   * - Returns { signature, recoveredAddress } (not just Hex)
   *
   * @param params - { typedDataJson: string, from: Address }
   * @returns Promise<{ signature: Hex, recoveredAddress: Address }>
   */
  async signTypedData(params: {
    typedDataJson: string;
    from: Address;
  }): Promise<{ signature: Hex; recoveredAddress: Address }> {
    const { typedDataJson, from } = params;

    // Validate signer matches owner
    if (from.toLowerCase() !== this.ownerAddress.toLowerCase()) {
      throw new Error(
        `Signer mismatch: expected ${this.ownerAddress}, got ${from}`
      );
    }

    console.log('[DirectBridge] Signing delegation with owner wallet...');

    try {
      // Parse EIP-712 typed data from JSON string (same as CLI)
      const typedData = JSON.parse(typedDataJson);
      const { domain, types, primaryType, message } = typedData;

      console.log('[DirectBridge] Parsed typed data:', {
        primaryType,
        domain: JSON.stringify(domain, null, 2),
        types: JSON.stringify(types, null, 2),
        message: JSON.stringify(message, null, 2),
      });

      // Direct wallet signing - no network transport!
      // This is the key difference from H2's clientSideWeb3AuthBridge
      const signature = await this.walletClient.signTypedData({
        account: from,
        domain,
        types,
        primaryType,
        message,
      });

      console.log('[DirectBridge] Signature created successfully');

      // Return in expected format (match CLI's Web3AuthBridge)
      return {
        signature,
        recoveredAddress: from,
      };
    } catch (error) {
      console.error('[DirectBridge] Signing error:', error);
      throw new Error(
        `Failed to sign delegation: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Check if wallet is available and ready
   *
   * @returns boolean - true if wallet is connected and ready to sign
   */
  isReady(): boolean {
    return !!this.walletClient && !!this.ownerAddress;
  }

  /**
   * Get current owner address
   *
   * @returns Hex - Owner address (delegator address)
   */
  getOwnerAddress(): Hex {
    return this.ownerAddress;
  }
}

/**
 * Create direct Web3Auth bridge for client-side agent
 *
 * Factory function to create bridge instance with proper configuration.
 * Use this instead of constructor for consistency with H2 patterns.
 *
 * @param config - Bridge configuration
 * @returns DirectWeb3AuthBridge - Ready-to-use bridge instance
 * @throws Error if wallet is not connected or config is invalid
 *
 * @example
 * ```typescript
 * const { wallet } = useIdentity();
 *
 * if (!wallet) {
 *   throw new Error('Wallet not connected');
 * }
 *
 * const bridge = createDirectWeb3AuthBridge({
 *   walletClient: wallet.walletClient,
 *   ownerAddress: wallet.address,
 * });
 * ```
 */
export function createDirectWeb3AuthBridge(
  config: DirectWeb3AuthBridgeConfig
): DirectWeb3AuthBridge {
  // Validate configuration
  if (!config.walletClient) {
    throw new Error('walletClient is required');
  }

  if (!config.ownerAddress) {
    throw new Error('ownerAddress is required');
  }

  // Validate address format
  if (!config.ownerAddress.startsWith('0x') || config.ownerAddress.length !== 42) {
    throw new Error('ownerAddress must be a valid Ethereum address');
  }

  return new DirectWeb3AuthBridge(config);
}
