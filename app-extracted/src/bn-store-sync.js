/**
 * Bright Nexa School OS - Unified Store Synchronization & Cascade Engine
 * ES Module bridge for frontend bundle
 */
import syncEngine from '../../bn-store-sync.js';

export const {
  normalizeClassName,
  normalizeSection,
  isClassMatch,
  isSectionMatch,
  isStudentInClass,
  bnCascadeClassroomChanges,
  bnCascadeStudentChanges,
  buildDynamicClassList,
  buildDynamicSectionList
} = syncEngine;

export default syncEngine;
