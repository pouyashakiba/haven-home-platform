export type ProviderStatus = "online" | "stale" | "offline" | "demo";

export type AutomationAction =
  | "turnOn"
  | "turnOff"
  | "toggle"
  | "setBrightness"
  | "setTemperature"
  | "open"
  | "close"
  | "lock"
  | "unlock"
  | "armHome"
  | "armAway"
  | "disarm";

export type ActionRequest = {
  requestId: string;
  target: { entityId?: string; deviceId?: string; areaId?: string };
  action: AutomationAction;
  parameters?: Record<string, unknown>;
  expectedRevision?: number;
};

export type SecurityAlert = {
  id: string;
  entityId: string;
  anchorId?: string;
  kind: "intrusion" | "fire" | "gas" | "water" | "lock";
  severity: "info" | "warning" | "critical";
  status: "active" | "acknowledged" | "cleared";
  occurredAt: string;
  title: string;
  message: string;
};

/**
 * Browser code talks only to this UI-safe contract. A local gateway implements
 * the contract and owns the Home Assistant credential; tablets never do.
 */
export interface AutomationProvider {
  status(): ProviderStatus;
  execute(action: ActionRequest): Promise<{
    status: "accepted" | "failed";
    error?: string;
  }>;
}
