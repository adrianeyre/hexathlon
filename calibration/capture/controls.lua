-- Which of the machine's inputs each player's actions are. The names differ
-- between machines: run once with CAPTURE_LIST=1 to print this machine's
-- names, check which button is which in MAME's input menu (Tab > Input
-- Assignments), and change the names below to match.
--
-- RUN_A and RUN_B are the two run buttons (pressed alternately to run), and
-- ACTION is the jump or throw button.
return {
  [1] = { RUN_A = 'P1 Button 1', ACTION = 'P1 Button 2', RUN_B = 'P1 Button 3' },
  [2] = { RUN_A = 'P2 Button 1', ACTION = 'P2 Button 2', RUN_B = 'P2 Button 3' },
}
