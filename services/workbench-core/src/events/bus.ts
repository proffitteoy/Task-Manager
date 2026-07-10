import { EventEmitter } from "node:events";

export interface WorkbenchEvent {
  type: string;
  at: string;
  payload: Record<string, unknown>;
}

export class EventBus {
  private readonly emitter = new EventEmitter();

  publish(type: string, payload: Record<string, unknown> = {}): WorkbenchEvent {
    const event = { type, at: new Date().toISOString(), payload };
    this.emitter.emit("event", event);
    return event;
  }

  subscribe(listener: (event: WorkbenchEvent) => void): () => void {
    this.emitter.on("event", listener);
    return () => this.emitter.off("event", listener);
  }
}
