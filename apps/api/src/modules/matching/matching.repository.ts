/**
 * Matching Module Repository Re-export
 * Delegates to the PostGIS SpatialCandidateRepository infrastructure implementation.
 */

export * from './infrastructure/spatial-candidate.repository.js';
export { SpatialCandidateRepository as MatchingRepository } from './infrastructure/spatial-candidate.repository.js';
