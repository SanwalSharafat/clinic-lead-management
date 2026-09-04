// ========================================
// Clinic Lead Management — Main Application
// Express server with manual dependency injection
// ========================================

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

// ---- Repositories ----
import {
  PatientRepository,
  InteractionRepository,
  ErrorLogRepository,
  ClinicConfigRepository,
  HumanReviewRepository,
  PendingBookingRepository,
  AppointmentRepository,
} from './repositories';

// ---- Providers ----
import { WatiProvider } from './services/messaging';
import { GeminiProvider } from './services/ai';
import { GoogleCalendarProvider } from './services/calendar';

// ---- Services ----
import { KnowledgeService } from './services/knowledge';
import { MessagingService } from './services/messaging';
import { AiService } from './services/ai';
import { BookingService } from './services/calendar';
import { HumanReviewService } from './services/human-review';
import { WorkflowService } from './services/workflow';

// ---- Controllers ----
import { WebhookController } from './controllers/webhookController';
import { HumanReviewController } from './controllers/humanReviewController';
import { PatientController } from './controllers/patientController';
import { BookingController } from './controllers/bookingController';

// ========================================
// 1. Create Express app
// ========================================
const app = express();

// ========================================
// 2. Apply middleware
// ========================================
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('combined'));

// ========================================
// 3. Manual Dependency Injection
// ========================================

// --- Repositories ---
const patientRepo = new PatientRepository();
const interactionRepo = new InteractionRepository();
const errorLogRepo = new ErrorLogRepository();
const clinicConfigRepo = new ClinicConfigRepository();
const humanReviewRepo = new HumanReviewRepository();
const pendingBookingRepo = new PendingBookingRepository();
const appointmentRepo = new AppointmentRepository();

// --- Providers (env-based, no constructor deps) ---
const watiProvider = new WatiProvider();
const geminiProvider = new GeminiProvider();
const googleCalendarProvider = new GoogleCalendarProvider();

// --- Services ---
const knowledgeService = new KnowledgeService();
const messagingService = new MessagingService(watiProvider, errorLogRepo);
const aiService = new AiService(geminiProvider, knowledgeService, errorLogRepo);
const bookingService = new BookingService(
  googleCalendarProvider,
  pendingBookingRepo,
  appointmentRepo,
  errorLogRepo,
  patientRepo,
);
const humanReviewService = new HumanReviewService(
  humanReviewRepo,
  patientRepo,
  errorLogRepo,
  interactionRepo,
  clinicConfigRepo,
  messagingService,
);
const workflowService = new WorkflowService(
  patientRepo,
  interactionRepo,
  errorLogRepo,
  clinicConfigRepo,
  aiService,
  knowledgeService,
  messagingService,
  humanReviewService,
  humanReviewRepo,
);

// --- Controllers ---
const webhookController = new WebhookController(workflowService);
const humanReviewController = new HumanReviewController(humanReviewService);
const patientController = new PatientController(patientRepo, appointmentRepo, interactionRepo);
const bookingController = new BookingController(bookingService);

// ========================================
// 4. Routes
// ========================================

// --- Webhook ---
app.post('/webhook/whatsapp', (req, res) => webhookController.handleWhatsAppMessage(req, res));
app.get('/webhook/whatsapp', (req, res) => webhookController.verifyWebhook(req, res));
app.post('/webhook/form', (req, res) => webhookController.handleFormSubmission(req, res));

// --- Human Reviews ---
app.get('/human-reviews', (req, res) => humanReviewController.listReviews(req, res));
app.get('/human-reviews/:id', (req, res) => humanReviewController.getReviewDetail(req, res));
app.post('/human-reviews/:id/approve', (req, res) => humanReviewController.approveReview(req, res));
app.post('/human-reviews/:id/correct', (req, res) => humanReviewController.correctReview(req, res));
app.post('/human-reviews/:id/escalate', (req, res) => humanReviewController.escalateReview(req, res));
app.post('/human-reviews/:id/reject', (req, res) => humanReviewController.rejectReview(req, res));

// --- Patients ---
app.get('/patients', (req, res) => patientController.listPatients(req, res));
app.get('/patients/:id', (req, res) => patientController.getPatient(req, res));
app.post('/patients/:id/won', (req, res) => patientController.markWon(req, res));
app.post('/patients/:id/lost', (req, res) => patientController.markLost(req, res));

// --- Bookings ---
app.post('/bookings', (req, res) => bookingController.createBooking(req, res));
app.get('/bookings/availability', (req, res) => bookingController.checkAvailability(req, res));

// --- Knowledge Cache ---
app.post('/knowledge/reload', (_req, res) => {
  knowledgeService.invalidateCache();
  res.status(200).json({ success: true, message: 'Knowledge cache invalidated' });
});

// --- Health Check ---
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ========================================
// 5. Global Error Handler
// ========================================
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Unhandled Error]', err.message);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// ========================================
// 6. Start Server
// ========================================
const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

export { app };
