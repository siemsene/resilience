import * as admin from 'firebase-admin';
admin.initializeApp();

export { createSession } from './createSession';
export { joinSession, reconnectPlayer } from './session';
export { submitInitialSetup } from './setup';
export { submitOrders } from './orders';
export { confirmRoundResults } from './confirmRoundResults';
export { onInstructorCreated, onInstructorStatusChanged } from './instructor';
export { adminListInstructors, adminListSessions, adminUpdateInstructorStatus } from './admin';
export { cleanupExpiredSessions } from './cleanup';
export { startGame } from './startGame';
export { forceAdvance } from './forceAdvance';
export { endSessionEarly, deleteSession, removePlayer } from './sessionManagement';
