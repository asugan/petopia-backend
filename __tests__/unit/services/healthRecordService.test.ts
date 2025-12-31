import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/models/mongoose', () => {
  return {
    PetModel: {
      findOne: vi.fn(),
    },
    HealthRecordModel: {
      findOne: vi.fn(),
      create: vi.fn(),
      findOneAndUpdate: vi.fn(),
      findOneAndDelete: vi.fn(),
      countDocuments: vi.fn(),
      find: vi.fn(),
    },
    EventModel: {
      create: vi.fn(),
      findOne: vi.fn(),
      findOneAndUpdate: vi.fn(),
      findOneAndDelete: vi.fn(),
    },
  };
});

import { EventModel, HealthRecordModel, PetModel } from '../../../src/models/mongoose';
import { HealthRecordService } from '../../../src/services/healthRecordService';

type MockFn = ReturnType<typeof vi.fn>;

describe('HealthRecordService', () => {
  const userId = 'user-1';

  const PetModelMock = PetModel as unknown as {
    findOne: MockFn;
  };

  const HealthRecordModelMock = HealthRecordModel as unknown as {
    findOne: MockFn;
    create: MockFn;
    findOneAndUpdate: MockFn;
    findOneAndDelete: MockFn;
  };

  const EventModelMock = EventModel as unknown as {
    create: MockFn;
    findOne: MockFn;
    findOneAndUpdate: MockFn;
    findOneAndDelete: MockFn;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes created Event if HealthRecord creation fails', async () => {
    const petExec = vi.fn().mockResolvedValue({ _id: 'pet-1' });
    PetModelMock.findOne.mockReturnValue({ exec: petExec });

    EventModelMock.create.mockResolvedValue([{ _id: 'event-1' }]);

    HealthRecordModelMock.create.mockRejectedValue(
      new Error('health record create failed')
    );

    const deleteExec = vi.fn().mockResolvedValue({ _id: 'event-1' });
    EventModelMock.findOneAndDelete.mockReturnValue({ exec: deleteExec });

    const service = new HealthRecordService();

    await expect(
      service.createHealthRecord(userId, {
        petId: 'pet-1',
        type: 'visit',
        title: 'Checkup',
        date: new Date('2025-01-01T00:00:00.000Z'),
        nextVisitDate: new Date('2025-02-01T00:00:00.000Z'),
      })
    ).rejects.toThrow('health record create failed');

    expect(EventModelMock.findOneAndDelete).toHaveBeenCalledWith({
      _id: 'event-1',
      userId,
    });
  });

  it('deletes created Event if HealthRecord update fails after creating new Event', async () => {
    const findRecordExec = vi.fn().mockResolvedValue({
      _id: 'record-1',
      userId,
      petId: 'pet-1',
      title: 'Old title',
      nextVisitEventId: undefined,
    });
    HealthRecordModelMock.findOne.mockReturnValue({ exec: findRecordExec });

    EventModelMock.create.mockResolvedValue([{ _id: 'event-2' }]);

    HealthRecordModelMock.findOneAndUpdate.mockReturnValue({
      exec: vi.fn().mockRejectedValue(new Error('update failed')),
    });

    EventModelMock.findOneAndDelete.mockReturnValue({
      exec: vi.fn().mockResolvedValue({ _id: 'event-2' }),
    });

    const service = new HealthRecordService();

    await expect(
      service.updateHealthRecord(userId, 'record-1', {
        title: 'New title',
        nextVisitDate: new Date('2025-02-01T00:00:00.000Z'),
      })
    ).rejects.toThrow('update failed');

    expect(EventModelMock.findOneAndDelete).toHaveBeenCalledWith({
      _id: 'event-2',
      userId,
    });
  });

  it('rolls back Event title sync if HealthRecord update fails', async () => {
    const findRecordExec = vi.fn().mockResolvedValue({
      _id: 'record-1',
      userId,
      petId: 'pet-1',
      title: 'Old title',
      nextVisitEventId: 'event-3',
    });
    HealthRecordModelMock.findOne.mockReturnValue({ exec: findRecordExec });

    const oldStartTime = new Date('2025-02-01T00:00:00.000Z');
    const findEventExec = vi.fn().mockResolvedValue({
      _id: 'event-3',
      startTime: oldStartTime,
      title: 'Next Visit: Old title',
      description: 'Follow-up for Old title',
    });
    EventModelMock.findOne.mockReturnValue({ exec: findEventExec });

    EventModelMock.findOneAndUpdate
      .mockReturnValueOnce({ exec: vi.fn().mockResolvedValue({ _id: 'event-3' }) })
      .mockReturnValueOnce({ exec: vi.fn().mockResolvedValue({ _id: 'event-3' }) });

    HealthRecordModelMock.findOneAndUpdate.mockReturnValue({
      exec: vi.fn().mockRejectedValue(new Error('record update failed')),
    });

    const service = new HealthRecordService();

    await expect(
      service.updateHealthRecord(userId, 'record-1', {
        title: 'New title',
      })
    ).rejects.toThrow('record update failed');

    expect(EventModelMock.findOneAndUpdate).toHaveBeenCalledTimes(2);

    const rollbackCall = EventModelMock.findOneAndUpdate.mock.calls[1];
    expect(rollbackCall?.[0]).toEqual({ _id: 'event-3', userId });
    expect(rollbackCall?.[1]).toEqual({
      startTime: oldStartTime,
      title: 'Next Visit: Old title',
      description: 'Follow-up for Old title',
    });
  });

  it('re-links record if clearing nextVisitDate fails to delete Event', async () => {
    const findRecordExec = vi.fn().mockResolvedValue({
      _id: 'record-1',
      userId,
      petId: 'pet-1',
      title: 'Title',
      nextVisitEventId: 'event-4',
    });
    HealthRecordModelMock.findOne.mockReturnValue({ exec: findRecordExec });

    HealthRecordModelMock.findOneAndUpdate
      .mockReturnValueOnce({ exec: vi.fn().mockResolvedValue({ _id: 'record-1' }) })
      .mockReturnValueOnce({ exec: vi.fn().mockResolvedValue({ _id: 'record-1' }) });

    EventModelMock.findOneAndDelete.mockReturnValue({
      exec: vi.fn().mockRejectedValue(new Error('event delete failed')),
    });

    const service = new HealthRecordService();

    await expect(
      service.updateHealthRecord(userId, 'record-1', {
        nextVisitDate: null,
      })
    ).rejects.toThrow('event delete failed');

    expect(HealthRecordModelMock.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'record-1', userId },
      { nextVisitEventId: 'event-4' }
    );
  });
});
