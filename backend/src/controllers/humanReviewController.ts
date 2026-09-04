import { Request, Response } from 'express';
import { HumanReviewService } from '../services/human-review';
import {
  approveReviewSchema,
  correctReviewSchema,
  escalateReviewSchema,
  rejectReviewSchema,
} from '../validators/schemas';

function isZodError(error: unknown): error is { issues: unknown[] } {
  return (
    error !== null &&
    typeof error === 'object' &&
    'issues' in error &&
    Array.isArray((error as { issues: unknown }).issues)
  );
}

export class HumanReviewController {
  private humanReviewService: HumanReviewService;

  constructor(humanReviewService: HumanReviewService) {
    this.humanReviewService = humanReviewService;
  }

  // GET /human-reviews
  async listReviews(req: Request, res: Response): Promise<void> {
    try {
      const filters = {
        resolved:
          req.query.resolved === 'false'
            ? false
            : req.query.resolved === 'true'
              ? true
              : undefined,
        reason: req.query.reason as import('../types').ReviewReason | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
      };
      const reviews = await this.humanReviewService.listReviews(filters);
      res.status(200).json({ success: true, data: reviews });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ success: false, error: message });
    }
  }

  // GET /human-reviews/:id
  async getReviewDetail(req: Request, res: Response): Promise<void> {
    try {
      const detail = await this.humanReviewService.getReviewDetail(req.params.id!);
      res.status(200).json({ success: true, data: detail });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('not found')) {
        res.status(404).json({ success: false, error: message });
      } else {
        res.status(500).json({ success: false, error: message });
      }
    }
  }

  // POST /human-reviews/:id/approve
  async approveReview(req: Request, res: Response): Promise<void> {
    try {
      const validated = approveReviewSchema.parse(req.body);
      const review = await this.humanReviewService.approveReview(req.params.id!, {
        reviewer_id: validated.reviewer_id,
        notes: validated.notes,
      });
      res.status(200).json({ success: true, data: review });
    } catch (error) {
      if (isZodError(error)) {
        res.status(400).json({ success: false, error: 'Validation error', details: error });
        return;
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({ success: false, error: message });
    }
  }

  // POST /human-reviews/:id/correct
  async correctReview(req: Request, res: Response): Promise<void> {
    try {
      const validated = correctReviewSchema.parse(req.body);
      const review = await this.humanReviewService.correctReview(req.params.id!, {
        reviewer_id: validated.reviewer_id,
        corrected_fields: validated.corrected_fields,
        notes: validated.notes,
      });
      res.status(200).json({ success: true, data: review });
    } catch (error) {
      if (isZodError(error)) {
        res.status(400).json({ success: false, error: 'Validation error', details: error });
        return;
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({ success: false, error: message });
    }
  }

  // POST /human-reviews/:id/escalate
  async escalateReview(req: Request, res: Response): Promise<void> {
    try {
      const validated = escalateReviewSchema.parse(req.body);
      const review = await this.humanReviewService.escalateReview(req.params.id!, {
        reviewer_id: validated.reviewer_id,
        notes: validated.notes,
      });
      res.status(200).json({ success: true, data: review });
    } catch (error) {
      if (isZodError(error)) {
        res.status(400).json({ success: false, error: 'Validation error', details: error });
        return;
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({ success: false, error: message });
    }
  }

  // POST /human-reviews/:id/reject
  async rejectReview(req: Request, res: Response): Promise<void> {
    try {
      const validated = rejectReviewSchema.parse(req.body);
      const review = await this.humanReviewService.rejectReview(req.params.id!, {
        reviewer_id: validated.reviewer_id,
        reason: validated.reason,
        notes: validated.notes,
      });
      res.status(200).json({ success: true, data: review });
    } catch (error) {
      if (isZodError(error)) {
        res.status(400).json({ success: false, error: 'Validation error', details: error });
        return;
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({ success: false, error: message });
    }
  }
}
