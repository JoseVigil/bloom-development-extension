import type { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { createErrorResponse } from '@/contracts/errors';
import type { ErrorCode } from '@/contracts/types';

/**
 * Global error handler for Fastify
 * Maps errors to standardized ErrorResponse from contracts
 */
export async function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  // Log error details
  request.log.error({
    err: error,
    method: request.method,
    url: request.url,
    body: request.body,
    query: request.query
  });

  // Map error to ErrorCode
  let errorCode: ErrorCode = 'INTERNAL_ERROR';
  let statusCode = 500;

  // Validation errors
  if (error.validation) {
    errorCode = 'VALIDATION_ERROR';
    statusCode = 400;
  } 
  // Not found errors
  else if (error.statusCode === 404) {
    errorCode = 'NUCLEUS_NOT_FOUND'; // Default, routes should be more specific
    statusCode = 404;
  }
  // Authentication errors
  else if (error.statusCode === 401 || error.statusCode === 403) {
    errorCode = 'AUTH_FAILED'; // FIXED: Now valid ErrorCode
    statusCode = error.statusCode;
  }
  // Brain execution errors
  else if (error.message?.includes('Brain') || error.message?.includes('brain')) {
    errorCode = 'BRAIN_EXECUTION_FAILED';
    statusCode = 500;
  }
  // Rate limiting
  else if (error.statusCode === 429) {
    errorCode = 'RATE_LIMIT_EXCEEDED'; // FIXED: Now valid ErrorCode
    statusCode = 429;
  }

  // Create standardized error response
  const errorResponse = createErrorResponse(
    errorCode,
    error.message || 'An unexpected error occurred',
    {
      statusCode: error.statusCode,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      validation: error.validation
    }
  );

  return reply.code(statusCode).send({
    ok: false,
    error: errorResponse,
    timestamp: new Date().toISOString()
  });
}