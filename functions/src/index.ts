import * as admin from 'firebase-admin';
admin.initializeApp();

export { joinSession, reconnectPlayer } from './session';
export { submitInitialSetup } from './setup';
export { submitOrders } from './orders';
export { onInstructorCreated, onInstructorStatusChanged } from './instructor';
export { adminListInstructors, adminUpdateInstructorStatus } from './admin';
export { cleanupExpiredSessions } from './cleanup';
export { startGame } from './startGame';
export { forceAdvance } from './forceAdvance';
export { endSessionEarly, deleteSession } from './sessionManagement';
