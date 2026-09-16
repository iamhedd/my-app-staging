import { Router } from 'express';
import { currentUserId, requireAdmin, requireSession } from '../middleware/authenticated.js';
import { requireTrustedOrigin } from '../middleware/origin.js';
import { asyncHandler } from '../errors.js';
import {
  budgetsInputSchema,
  categoriesInputSchema,
  financialPlanInputSchema,
  legacyIdParamSchema,
  migrationKeyParamSchema,
  migrationRunInputSchema,
  notificationDeviceInputSchema,
  profileInputSchema,
  reviewCommentIdParamSchema,
  reviewCommentInputSchema,
  reviewCommentUpdateSchema,
  settingsInputSchema,
  transactionInputSchema,
} from '../data/schemas.js';
import {
  createTransaction,
  createReviewComment,
  deleteReviewComment,
  deleteTransaction,
  getBootstrap,
  getMigrationRun,
  listReviewComments,
  replaceBudgets,
  replaceCategories,
  saveFinancialPlan,
  saveNotificationDevice,
  saveProfile,
  saveSettings,
  saveTransaction,
  saveMigrationRun,
  updateReviewComment,
} from '../data/repository.js';

export const apiRouter = Router();

apiRouter.use(requireSession, requireTrustedOrigin);

apiRouter.get('/me', (request, response) => {
  response.json({
    user: {
      id: request.auth!.user.id,
      name: request.auth!.user.name,
      email: request.auth!.user.email,
      emailVerified: request.auth!.user.emailVerified,
      image: request.auth!.user.image ?? null,
    },
  });
});

apiRouter.get('/bootstrap', asyncHandler(async (request, response) => {
  const data = await getBootstrap(currentUserId(request));
  response.json({
    ...data,
    profile: {
      name: data.profile?.name || request.auth!.user.name,
      email: request.auth!.user.email,
      avatarUrl: data.profile?.avatarUrl || request.auth!.user.image || null,
    },
  });
}));

apiRouter.put('/profile', asyncHandler(async (request, response) => {
  const input = profileInputSchema.parse(request.body);
  response.json({ profile: await saveProfile(currentUserId(request), input) });
}));

apiRouter.put('/financial-plan', asyncHandler(async (request, response) => {
  const input = financialPlanInputSchema.parse(request.body);
  response.json({ financialPlan: await saveFinancialPlan(currentUserId(request), input) });
}));

apiRouter.put('/categories', asyncHandler(async (request, response) => {
  const input = categoriesInputSchema.parse(request.body);
  response.json({ categories: await replaceCategories(currentUserId(request), input.categories) });
}));

apiRouter.post('/transactions', asyncHandler(async (request, response) => {
  const input = transactionInputSchema.parse(request.body);
  response.status(201).json({ transaction: await createTransaction(currentUserId(request), input) });
}));

apiRouter.put('/transactions/:legacyId', asyncHandler(async (request, response) => {
  const { legacyId } = legacyIdParamSchema.parse(request.params);
  const input = transactionInputSchema.parse(request.body);
  response.json({ transaction: await saveTransaction(currentUserId(request), legacyId, input) });
}));

apiRouter.delete('/transactions/:legacyId', asyncHandler(async (request, response) => {
  const { legacyId } = legacyIdParamSchema.parse(request.params);
  await deleteTransaction(currentUserId(request), legacyId);
  response.status(204).end();
}));

apiRouter.put('/budgets', asyncHandler(async (request, response) => {
  const input = budgetsInputSchema.parse(request.body);
  response.json({ budgets: await replaceBudgets(currentUserId(request), input.budgets) });
}));

apiRouter.put('/settings', asyncHandler(async (request, response) => {
  const input = settingsInputSchema.parse(request.body);
  response.json({ settings: await saveSettings(currentUserId(request), input) });
}));

apiRouter.put('/notification-device', asyncHandler(async (request, response) => {
  const input = notificationDeviceInputSchema.parse(request.body);
  response.json({ device: await saveNotificationDevice(currentUserId(request), input) });
}));

apiRouter.get('/review-comments', requireAdmin, asyncHandler(async (request, response) => {
  response.json({ comments: await listReviewComments(currentUserId(request)) });
}));

apiRouter.post('/review-comments', requireAdmin, asyncHandler(async (request, response) => {
  const input = reviewCommentInputSchema.parse(request.body);
  response.status(201).json({ comment: await createReviewComment(currentUserId(request), input) });
}));

apiRouter.put('/review-comments/:id', requireAdmin, asyncHandler(async (request, response) => {
  const { id } = reviewCommentIdParamSchema.parse(request.params);
  const input = reviewCommentUpdateSchema.parse(request.body);
  response.json({ comment: await updateReviewComment(currentUserId(request), id, input) });
}));

apiRouter.delete('/review-comments/:id', requireAdmin, asyncHandler(async (request, response) => {
  const { id } = reviewCommentIdParamSchema.parse(request.params);
  await deleteReviewComment(currentUserId(request), id);
  response.status(204).end();
}));

apiRouter.get('/migrations/:key', asyncHandler(async (request, response) => {
  const { key } = migrationKeyParamSchema.parse(request.params);
  response.json({ migration: await getMigrationRun(currentUserId(request), key) });
}));

apiRouter.put('/migrations/:key', asyncHandler(async (request, response) => {
  const { key } = migrationKeyParamSchema.parse(request.params);
  const input = migrationRunInputSchema.parse(request.body);
  response.json({ migration: await saveMigrationRun(currentUserId(request), key, input) });
}));
