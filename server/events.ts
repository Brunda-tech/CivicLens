import type { Response } from 'express';

export interface LiveCivicEvent {
  type: 'connected' | 'complaint_created' | 'crew_assigned' | 'status_updated' | 'complaint_completed' | 'demo_reset';
  ticket_id?: string;
  complaint_id?: number;
  ward?: string;
  category?: string;
  severity?: string;
  status?: string;
  assigned_crew?: string | null;
  priority_score?: number;
  note?: string;
  timestamp: string;
}

const clients = new Set<Response>();

export function registerSseClient(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  clients.add(res);

  const hello: LiveCivicEvent = {
    type: 'connected',
    timestamp: new Date().toISOString(),
  };
  res.write(`data: ${JSON.stringify(hello)}\n\n`);

  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
      clients.delete(res);
    }
  }, 25000);

  res.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });
}

export function broadcastLiveEvent(event: LiveCivicEvent): void {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of clients) {
    try {
      client.write(payload);
    } catch {
      clients.delete(client);
    }
  }
}
