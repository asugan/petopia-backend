import PDFDocument from 'pdfkit';
import { Types } from 'mongoose';
import { EventModel, ExpenseModel, HealthRecordModel, PetModel } from '../models/mongoose';
import { createError } from '../middleware/errorHandler';
import { UserSettingsService } from './userSettingsService';

const userSettingsService = new UserSettingsService();

interface VetSummaryInput {
  userId: string;
  petId: string;
}

export class ReportService {
  async generateVetSummaryPDF({ userId, petId }: VetSummaryInput): Promise<Buffer> {
    const pet = await PetModel.findOne({ _id: new Types.ObjectId(petId), userId }).exec();

    if (!pet) {
      throw createError('Pet not found', 404, 'PET_NOT_FOUND');
    }

    const baseCurrency = await userSettingsService.getUserBaseCurrency(userId);

    const healthRecords = await HealthRecordModel.find({
      userId: new Types.ObjectId(userId),
      petId: new Types.ObjectId(petId),
    })
      .sort({ date: -1 })
      .exec();

    const vetVisits = healthRecords.filter(
      record =>
        record.type === 'visit' ||
        record.type === 'checkup' ||
        !!record.veterinarian
    );
    const events = await EventModel.find({
      userId: new Types.ObjectId(userId),
      petId: new Types.ObjectId(petId),
    })
      .sort({ startTime: -1 })
      .exec();

    const now = new Date();
    const vaccinations = events.filter(
      event => event.type === 'vaccination' && event.startTime <= now
    );
    const medications = events.filter(
      event => event.type === 'medication' && event.startTime <= now
    );
    const upcomingDue = events
      .filter(
        event =>
          (event.type === 'vaccination' || event.type === 'medication') &&
          event.startTime > now
      )
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    const expenses = await ExpenseModel.find({
      userId: new Types.ObjectId(userId),
      petId: new Types.ObjectId(petId),
      category: { $in: ['veterinary', 'vaccination', 'medication', 'emergency'] },
    })
      .sort({ date: -1 })
      .limit(15)
      .exec();

    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', chunk => {
      chunks.push(chunk as Buffer);
    });

    const formatDate = (value?: Date) =>
      value ? value.toISOString().split('T')[0] : '-';
    const formatCurrency = (value?: number, currency?: string) =>
      value !== undefined ? `${value.toFixed(2)} ${currency ?? ''}`.trim() : '-';

    doc.fontSize(18).text('Vet Summary', { align: 'center' });
    doc.moveDown(0.5);
    doc
      .fontSize(12)
      .text(`${pet.name} (${pet.type}${pet.breed ? ` - ${pet.breed}` : ''})`, {
        align: 'center',
      });
    doc.fontSize(10).text(`Generated: ${new Date().toISOString()}`, { align: 'center' });

    doc.moveDown();
    doc.fontSize(12).text('Last Vet Visits', { underline: true });
    doc.moveDown(0.25);
    if (vetVisits.length === 0) {
      doc.fontSize(10).text('No vet visits recorded.');
    } else {
      vetVisits.slice(0, 3).forEach(record => {
        doc
          .fontSize(10)
          .text(`${formatDate(record.date)} • ${record.title}`, { continued: false });
        doc
          .fontSize(9)
          .fillColor('gray')
          .text(
            [
              record.veterinarian ? `Vet: ${record.veterinarian}` : null,
              record.clinic ? `Clinic: ${record.clinic}` : null,
              record.cost ? `Cost: ${formatCurrency(record.cost, baseCurrency)}` : null,
            ]
              .filter(Boolean)
              .join(' • ')
          );
        doc.fillColor('black');
        if (record.description) {
          doc.fontSize(9).text(record.description);
        }
        doc.moveDown(0.4);
      });
    }

    doc.moveDown(0.3);
    doc.fontSize(12).text('Vaccinations', { underline: true });
    doc.moveDown(0.25);
    if (vaccinations.length === 0) {
      doc.fontSize(10).text('No vaccinations recorded.');
    } else {
      vaccinations.slice(0, 5).forEach(record => {
        doc
          .fontSize(10)
          .text(
            `${formatDate(record.startTime)} • ${record.vaccineName ?? record.title} (${record.vaccineManufacturer ?? 'N/A'})`
          );
        doc.moveDown(0.3);
      });
    }

    doc.moveDown(0.3);
    doc.fontSize(12).text('Medications', { underline: true });
    doc.moveDown(0.25);
    if (medications.length === 0) {
      doc.fontSize(10).text('No medications recorded.');
    } else {
      medications.slice(0, 5).forEach(record => {
        doc
          .fontSize(10)
          .text(`${formatDate(record.startTime)} • ${record.medicationName ?? record.title}`);
        if (record.description) {
          doc.fontSize(9).fillColor('gray').text(record.description);
          doc.fillColor('black');
        }
        doc.moveDown(0.3);
      });
    }

    doc.moveDown(0.3);
    doc.fontSize(12).text('Upcoming / Due', { underline: true });
    doc.moveDown(0.25);
    if (upcomingDue.length === 0) {
      doc.fontSize(10).text('No upcoming items.');
    } else {
      upcomingDue.slice(0, 5).forEach(record => {
        doc
          .fontSize(10)
          .text(`${formatDate(record.startTime)} • ${record.title}`);
      });
    }

    doc.moveDown();
    doc.fontSize(12).text('Recent Expenses', { underline: true });
    doc.moveDown(0.25);
    if (expenses.length === 0) {
      doc.fontSize(10).text('No related expenses.');
    } else {
      expenses.forEach(expense => {
        doc
          .fontSize(10)
          .text(
            `${formatDate(expense.date)} • ${expense.category} • ${formatCurrency(
              expense.amount,
              expense.currency
            )}`
          );
        if (expense.description) {
          doc.fontSize(9).fillColor('gray').text(expense.description);
          doc.fillColor('black');
        }
        doc.moveDown(0.3);
      });
    }

    doc.end();

    return await new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });
  }
}
