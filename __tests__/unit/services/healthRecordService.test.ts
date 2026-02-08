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
  };
});

import { HealthRecordModel, PetModel } from '../../../src/models/mongoose';
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

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates health record when pet exists', async () => {
    PetModelMock.findOne.mockReturnValue({ exec: vi.fn().mockResolvedValue({ _id: 'pet-1' }) });
    HealthRecordModelMock.create.mockResolvedValue([{ _id: 'record-1', title: 'Checkup' }]);

    const service = new HealthRecordService();
    const result = await service.createHealthRecord(userId, {
      petId: 'pet-1',
      type: 'visit',
      title: 'Checkup',
      date: new Date('2025-01-01T00:00:00.000Z'),
    });

    expect(result._id).toBe('record-1');
  });

  it('throws when pet is not found on create', async () => {
    PetModelMock.findOne.mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });

    const service = new HealthRecordService();

    await expect(
      service.createHealthRecord(userId, {
        petId: 'pet-404',
        type: 'visit',
        title: 'Checkup',
        date: new Date('2025-01-01T00:00:00.000Z'),
      })
    ).rejects.toThrow('Pet not found');
  });

  it('updates health record with provided fields', async () => {
    HealthRecordModelMock.findOneAndUpdate.mockReturnValue({
      exec: vi.fn().mockResolvedValue({ _id: 'record-1', title: 'Updated' }),
    });

    const service = new HealthRecordService();
    const result = await service.updateHealthRecord(userId, 'record-1', { title: 'Updated' });

    expect(result?._id).toBe('record-1');
  });

  it('returns false when delete target is missing', async () => {
    HealthRecordModelMock.findOneAndDelete.mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });

    const service = new HealthRecordService();
    const deleted = await service.deleteHealthRecord(userId, 'record-missing');

    expect(deleted).toBe(false);
  });
});
