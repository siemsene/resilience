const PLAYER_REMOVAL_FLASH_KEY = 'resilience_removed_player_notice';

export function writePlayerRemovalFlash(playerName: string | null) {
  const message = playerName?.trim()
    ? `${playerName} was removed from the session by the instructor.`
    : 'You were removed from the session by the instructor.';
  window.sessionStorage.setItem(PLAYER_REMOVAL_FLASH_KEY, message);
}

export function readPlayerRemovalFlash() {
  const message = window.sessionStorage.getItem(PLAYER_REMOVAL_FLASH_KEY);
  if (!message) {
    return '';
  }

  window.sessionStorage.removeItem(PLAYER_REMOVAL_FLASH_KEY);
  return message;
}
