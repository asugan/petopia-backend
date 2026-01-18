import { EventModel } from '../models/mongoose/event.js';
import { logger } from '../utils/logger.js';

/**
 * Check for missed events and update their status
 * A missed event is one where:
 * - status is 'upcoming'
 * - startTime has passed (is in the past)
 * 
 * @returns Number of events marked as missed
 */
export async function markMissedEvents(): Promise<number> {
  const now = new Date();

  const result = await EventModel.updateMany(
    {
      status: 'upcoming',
      startTime: { $lt: now },
    },
    {
      $set: { status: 'missed' },
    }
  );

  if (result.modifiedCount > 0) {
    logger.info(`Marked ${result.modifiedCount} events as missed`);
  }

  return result.modifiedCount;
}

/**
 * Mark an event as completed
 * @param eventId The event ID to mark as completed
 * @returns true if successful, false if event not found
 */
export async function markEventCompleted(eventId: string): Promise<boolean> {
  const result = await EventModel.findByIdAndUpdate(
    eventId,
    { $set: { status: 'completed' } },
    { new: true }
  );

  return !!result;
}

/**
 * Mark an event as cancelled
 * @param eventId The event ID to mark as cancelled
 * @returns true if successful, false if event not found
 */
export async function markEventCancelled(eventId: string): Promise<boolean> {
  const result = await EventModel.findByIdAndUpdate(
    eventId,
    { $set: { status: 'cancelled' } },
    { new: true }
  );

  return !!result;
}

/**
 * Reset an event's status to upcoming
 * @param eventId The event ID to reset
 * @returns true if successful, false if event not found
 */
export async function resetEventStatus(eventId: string): Promise<boolean> {
  const result = await EventModel.findByIdAndUpdate(
    eventId,
    { $set: { status: 'upcoming' } },
    { new: true }
  );

  return !!result;
}

/**
 * Get events that need status update
 * @param minutesBehind How many minutes behind to check (default: 0 = all missed)
 * @returns Array of event IDs that are missed
 */
export async function getMissedEvents(minutesBehind = 0): Promise<string[]> {
  const now = new Date();
  const threshold = new Date(now.getTime() - minutesBehind * 60 * 1000);

  const events = await EventModel.find({
    status: 'upcoming',
    startTime: { $lt: threshold },
  }).select('_id').lean();

  return events.map(e => e._id.toString());
}
