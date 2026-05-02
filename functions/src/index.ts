import { setGlobalOptions } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';

setGlobalOptions({ maxInstances: 20, concurrency: 80 });
admin.initializeApp();

export { createSession } from './createSession';
export { joinSession, reconnectPlayer } from './session';
export { submitInitialSetup } from './setup';
export { submitOrders } from './orders';
export { confirmRoundResults } from './confirmRoundResults';
export { onInstructorCreated, onInstructorStatusChanged } from './instructor';
export { adminListInstructors, adminListSessions, adminUpdateInstructorStatus, adminResetPassword } from './admin';
export { cleanupExpiredSessions } from './cleanup';
export { startGame } from './startGame';
export { forceAdvance } from './forceAdvance';
export { endSessionEarly, deleteSession, removePlayer } from './sessionManagement';
export { billingKillSwitch } from './billingKillSwitch';
