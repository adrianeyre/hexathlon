-- Capture runner for the reference-data issues #13–#22 (see README.md).
--
-- Plays every run in a capture plan in MAME, frame by frame, from the
-- savestate the run names, with an overlay showing what is being tested.
-- After each run it asks, in the terminal, what the original showed, then
-- writes the Input Trace and the answers to calibration/captures/issue-<n>/,
-- which is committed (check it with `pnpm capture:check`).
--
--   CAPTURE_SET=13   mame <romset> -autoboot_script calibration/capture/capture.lua
--   CAPTURE_LIST=1   mame <romset> -autoboot_script calibration/capture/capture.lua
--
-- CAPTURE_SET picks the test set (13 to 22, as `pnpm capture:plans` lists
-- them); CAPTURE_ISSUE is the same, under its older name.
--
-- Optional: CAPTURE_FROM=5 starts at run 5 (to resume), CAPTURE_ONLY=3 plays
-- only the first 3 runs. CAPTURE_LIST=1 prints the input names this machine
-- has, for controls.lua.
--
-- Writes nothing about the ROM: no set name, hashes or game data.

local dir = (debug.getinfo(1, 'S').source:match('^@(.*[/\\])')) or './'
local plans = dofile(dir .. 'plans.lua')
local controls = dofile(dir .. 'controls.lua')

local machine = manager.machine

-- Every input field on the machine, by name.
local function all_fields()
  local found = {}
  for _, port in pairs(machine.ioport.ports) do
    for name, field in pairs(port.fields) do found[name] = field end
  end
  return found
end

if os.getenv('CAPTURE_LIST') then
  local names = {}
  for name in pairs(all_fields()) do names[#names + 1] = name end
  table.sort(names)
  print('Inputs on this machine (use these names in calibration/capture/controls.lua):')
  for _, name in ipairs(names) do print('  ' .. name) end
  machine:exit()
  return
end

local issue = os.getenv('CAPTURE_SET') or os.getenv('CAPTURE_ISSUE') or ''
local plan = plans[issue]
if not plan then
  print('Set CAPTURE_SET to one of 13 to 22, e.g. CAPTURE_SET=13.')
  machine:exit()
  return
end

-- Results go in the repo, one folder per issue, to be committed.
local out_rel = 'calibration/captures/issue-' .. issue .. '/'
local out_dir = dir .. '../captures/issue-' .. issue .. '/'
-- `pnpm capture:plans` makes the folders; make this one here too in case it didn't.
if package.config:sub(1, 1) == '\\' then
  local win = out_dir:gsub('/', '\\')
  os.execute('if not exist "' .. win .. '" mkdir "' .. win .. '"')
else
  os.execute('mkdir -p "' .. out_dir .. '"')
end

-- Map each player's actions to the machine's input fields.
local fields = all_fields()
local field_for = {}
for player, actions in pairs(controls) do
  for action, name in pairs(actions) do
    local field = fields[name]
    if not field then
      print(('controls.lua: no input named "%s" (player %d %s). Run with CAPTURE_LIST=1 to see the names.'):format(name, player, action))
      machine:exit()
      return
    end
    field_for[player .. ':' .. action] = field
  end
end

local screen = machine.screens[':screen']
if not screen then
  for _, s in pairs(machine.screens) do screen = s break end
end

local function refresh_hz()
  local ok, hz = pcall(function() return screen.refresh end)
  if ok and type(hz) == 'number' and hz > 0 then return hz end
  ok, hz = pcall(function() return 1e18 / screen.refresh_attoseconds end)
  if ok and type(hz) == 'number' and hz > 0 then return hz end
  return nil
end

local function json_string(s)
  return '"' .. tostring(s):gsub('[%c"\\]', function(c)
    local named = { ['"'] = '\\"', ['\\'] = '\\\\', ['\n'] = '\\n', ['\r'] = '\\r', ['\t'] = '\\t' }
    return named[c] or ('\\u%04x'):format(c:byte())
  end) .. '"'
end

local function write(path, text)
  local f, err = io.open(path, 'w')
  if not f then
    print('Could not write ' .. path .. ': ' .. tostring(err) .. ' (does ' .. out_rel .. ' exist? `pnpm capture:plans` makes it)')
    return false
  end
  f:write(text)
  f:close()
  return true
end

local function number_or_null(get)
  local ok, n = pcall(get)
  return (ok and type(n) == 'number') and tostring(n) or 'null'
end

-- Session record: the facts the protocol asks for, nothing about the ROM.
local hz = refresh_hz()
write(out_dir .. 'session.json', table.concat({
  '{',
  '  "issue": ' .. issue .. ',',
  '  "date": ' .. json_string(os.date('!%Y-%m-%d')) .. ',',
  '  "tool": ' .. json_string('MAME ' .. emu.app_version()) .. ',',
  '  "refreshHz": ' .. (hz and ('%.6f'):format(hz) or 'null') .. ',',
  '  "screen": { "width": ' .. number_or_null(function() return screen.width end) .. ', "height": ' .. number_or_null(function() return screen.height end) .. ' }',
  '}',
  '',
}, '\n'))

local runs = plan.runs
local first = tonumber(os.getenv('CAPTURE_FROM') or '1') or 1
local last = math.min(#runs, first - 1 + (tonumber(os.getenv('CAPTURE_ONLY') or '') or #runs))

print(('Capture #%s %s: runs %d to %d of %d.'):format(issue, plan.title, first, last, #runs))
print('Results are saved to ' .. out_rel .. ' as each run is answered.')
print('Savestates needed (save each paused on frame zero, the first frame the Event accepts input):')
for _, s in ipairs(plan.states) do print(('  %s  %s'):format(s.key, s.what)) end

-- The run in progress.
local index = first
local phase = 'load' -- load -> loading -> play -> show -> ask -> next ... -> done
local frame = 0
local wait = 0
local next_input = 1
local held = {}

local function release_all()
  for key, field in pairs(field_for) do field:set_value(0) end
  held = {}
end

-- Apply every input for the current frame.
local function apply_inputs(run)
  local inputs = run.inputs
  while next_input <= #inputs and inputs[next_input][1] == frame do
    local e = inputs[next_input]
    local field = field_for[e[2] .. ':' .. e[3]]
    if field then field:set_value(e[4]) end
    held[e[2] .. ':' .. e[3]] = e[4] == 1 or nil
    next_input = next_input + 1
  end
end

-- The run's Input Trace as JSON: the plan's trace with its inputs filled in.
local function trace_json(run)
  local inputs = {}
  for i, e in ipairs(run.inputs) do
    inputs[i] = ('{"frame":%d,"player":%d,"action":%s,"type":%s}'):format(e[1], e[2], json_string(e[3]), e[4] == 1 and '"press"' or '"release"')
  end
  local head = run.trace:sub(1, -4) -- drop the closing '[]}' of "inputs":[]
  return head .. '[' .. table.concat(inputs, ',') .. ']}'
end

local function ask(run)
  print('')
  print(('Run %d of %d: %s  [%s]'):format(index, #runs, run.title, run.id))
  local answers = {}
  for _, q in ipairs(run.questions) do
    io.write('  ' .. q.ask .. ': ')
    io.flush()
    local line = io.read('l')
    answers[#answers + 1] = json_string(q.key) .. ': ' .. json_string((line or ''):gsub('^%s+', ''):gsub('%s+$', ''))
  end
  local file = run.id:gsub('/', '__')
  write(out_dir .. file .. '.trace.json', trace_json(run) .. '\n')
  write(out_dir .. file .. '.answers.json', table.concat({
    '{',
    '  "trace": ' .. json_string(run.id) .. ',',
    '  "issue": ' .. issue .. ',',
    '  "savestate": ' .. json_string(run.key) .. ',',
    '  "answers": { ' .. table.concat(answers, ', ') .. ' }',
    '}',
    '',
  }, '\n'))
end

-- What the overlay says.
local function overlay(run)
  local lines = { ('CAPTURE #%s  RUN %d/%d'):format(issue, index, #runs), run.title }
  if phase == 'play' then
    lines[#lines + 1] = ('FRAME %d/%d'):format(frame, run.frames)
    local pressed = {}
    for key in pairs(held) do pressed[#pressed + 1] = key end
    table.sort(pressed)
    lines[#lines + 1] = #pressed > 0 and ('HELD ' .. table.concat(pressed, ' ')) or 'HELD -'
  elseif phase == 'show' or phase == 'ask' then
    lines[#lines + 1] = 'ANSWER IN THE TERMINAL'
  elseif phase == 'loading' then
    lines[#lines + 1] = 'LOADING SAVESTATE ' .. run.key
  end
  for i, text in ipairs(lines) do
    screen:draw_text(2, 2 + (i - 1) * 8, text, 0xffffff00, 0xc0000000)
  end
end

local function on_frame()
  local run = runs[index]
  if phase == 'done' or not run then return end
  overlay(run)
  if phase == 'load' then
    release_all()
    machine:load(run.key)
    phase, wait = 'loading', 2
  elseif phase == 'loading' then
    -- The load happens between frames; start once it has.
    wait = wait - 1
    if wait <= 0 then
      phase, frame, next_input = 'play', 0, 1
      apply_inputs(run)
    end
  elseif phase == 'play' then
    frame = frame + 1
    if frame >= run.frames then
      release_all()
      phase = 'show' -- draw "answer in the terminal" for a frame before blocking on input
    else
      apply_inputs(run)
    end
  elseif phase == 'show' then
    phase = 'ask'
  elseif phase == 'ask' then
    ask(run)
    index = index + 1
    if index > last then
      phase = 'done'
      print('')
      print(('Done. Results are in %s. Now run: pnpm capture:check %s   then commit that folder.'):format(out_rel, issue))
    else
      phase = 'load'
    end
  end
end

-- Newer MAME has frame notifiers; older versions have register_frame_done.
if emu.add_machine_frame_notifier then
  capture_subscription = emu.add_machine_frame_notifier(on_frame)
else
  emu.register_frame_done(on_frame)
end
