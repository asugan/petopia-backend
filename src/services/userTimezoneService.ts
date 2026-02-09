import { Types } from 'mongoose';
import { UserSettingsModel } from '../models/mongoose';
import { resolveEffectiveTimezone } from '../lib/timezone';

export async function resolveUserTimezone(
  userId: string | Types.ObjectId,
  clientTimezone?: string
): Promise<string> {
  try {
    const settings = await UserSettingsModel.findOne({
      userId: typeof userId === 'string' ? new Types.ObjectId(userId) : userId,
    })
      .select('timezone')
      .lean()
      .exec();

    return resolveEffectiveTimezone({
      clientTimezone,
      userTimezone: settings?.timezone,
    });
  } catch {
    return resolveEffectiveTimezone({ clientTimezone });
  }
}
