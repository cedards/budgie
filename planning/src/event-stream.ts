export interface StreamEvent {
  type: string
  version: number
}

export interface EventStream {
  append(event: StreamEvent): Promise<void>

  project<T>(fold: (result: T, event: StreamEvent) => T, initialValue: T): Promise<T>
}

export function InMemoryEventStream(): EventStream & { events: StreamEvent[] } {
  const events: StreamEvent[] = []

  return {
    async append(event: StreamEvent) {
      events.push(event)
    },

    async project<T>(fold: (result: T, event: StreamEvent) => T, initialValue: T) {
      return events.reduce(fold, initialValue)
    },

    events
  }
}
