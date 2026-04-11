/**
 * Bridge Protocol — Messaging Bridge Interface.
 * ═════════════════════════════════════════════════════════════════
 *
 * Provides the messaging-specific interface (send/receive/identity)
 * on top of the Universal Connector's protocol adapter system.
 *
 * Messaging bridges (WhatsApp, Email, Telegram) implement MessageBridge
 * for high-level messaging semantics while the underlying transport
 * flows through the Universal Connector pipeline.
 *
 * @version 2.0.0
 */

import type { BridgePlatform, BridgeMessage } from "../types";

/** Canonical identity mapping from external platform to UOR. */
export interface UorIdentityMapping {
  platform: BridgePlatform;
  externalId: string;
  uorCanonicalId: string;
  displayName: string;
  verified: boolean;
}

/**
 * Message Bridge — high-level messaging contract.
 *
 * Bridges handle the messaging-specific semantics (send, receive,
 * identity mapping, contact sync) while transport is delegated
 * to the Universal Connector's fetch pipeline when possible.
 */
export interface MessageBridge {
  readonly platform: BridgePlatform;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  sendMessage(to: string, content: string, metadata?: Record<string, unknown>): Promise<void>;
  onMessage(handler: (msg: BridgeMessage) => void): () => void;
  mapIdentity(externalId: string): Promise<UorIdentityMapping | null>;
  syncContacts?(): Promise<Array<{ externalId: string; displayName: string; avatarUrl?: string }>>;
  getConversations?(): Promise<Array<{ externalId: string; title: string; lastActivity?: string }>>;
  markRead?(externalMessageId: string): Promise<void>;
  getStatus(): { connected: boolean; lastSync?: string; error?: string };
}

/**
 * Bridge registry — manages active messaging bridges.
 * Thin wrapper that tracks messaging-specific state.
 */
class BridgeRegistry {
  private bridges = new Map<BridgePlatform, MessageBridge>();

  register(bridge: MessageBridge): void {
    this.bridges.set(bridge.platform, bridge);
  }

  get(platform: BridgePlatform): MessageBridge | undefined {
    return this.bridges.get(platform);
  }

  getAll(): MessageBridge[] {
    return Array.from(this.bridges.values());
  }

  getConnected(): MessageBridge[] {
    return this.getAll().filter((b) => b.isConnected());
  }
}

export const bridgeRegistry = new BridgeRegistry();
