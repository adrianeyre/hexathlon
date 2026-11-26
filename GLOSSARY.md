# Hexathlon

An arcade-style athletics game in which players mash keys to build speed and time actions to compete in a fixed sequence of events.

## Play structure

**Session**:
One arcade playthrough, from start until the player fails to qualify.
_Avoid_: Run, game, playthrough

**Cycle**:
One pass through all six events within a Session. Each new Cycle has tougher Standards.
_Avoid_: Loop, round, lap

**Event**:
One athletics discipline, such as the 100m Dash or the Long Jump.
_Avoid_: Stage, level

**Attempt**:
One try at an Event, or at a single bar height in the High Jump.
_Avoid_: Try, go, turn

**Mark**:
The measured result of an Attempt: a time, distance or height.
_Avoid_: Score, result

**Standard**:
The Mark a player must reach in an Event to qualify, for a given Cycle.
_Avoid_: Target, qualifying time, par

## Within an Event

**Run-up**:
The approach phase before a jump or throw.
_Avoid_: Run, approach

**Difficulty**:
Easy, Normal or Hard, chosen in Settings. Normal plays the measured parameters exactly; Easy and Hard scale a few of them.
_Avoid_: Level, mode, skill

**Rival**:
The opponent in the next lane during running Events, controlled by the CPU or by the second player.
_Avoid_: CPU, opponent, AI

## Scoring

**Points**:
The score a Mark earns in its Event. A Session's Points are the sum across all of its Events.
_Avoid_: Score (on its own), mark

**Personal Best**:
The best Mark a player has ever achieved in a given Event.
_Avoid_: PB, record, best score

**High Score**:
A Session's Points total, entered in the ranked high-score table.
_Avoid_: Top score, hi-score, personal best

## Calibration

**Input Trace**:
A recorded, timestamped sequence of player inputs for one Attempt, which can be replayed deterministically.
_Avoid_: Recording, replay, demo

**Reference Mark**:
A Mark measured from the original game for a known Input Trace, used as the parity target.
_Avoid_: Expected value, golden result

**Attract Mode**:
The unattended demo that plays on the title screen by replaying Input Traces.
_Avoid_: Demo mode, idle screen
