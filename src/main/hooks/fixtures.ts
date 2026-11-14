// Real Claude Code 2.1.299 hook payloads captured with scripts/spikes/30-hooks-lab.mjs (PRD §6.6),
// scrubbed of personal paths and ids. `transcript_path` / `scratchpad_dir` are dropped (unused).
// Notification_permission reuses the idle capture's envelope with the message string observed in a separate run.
export const claudeFixtures = {
  "SessionStart": {
    "session_id": "00000000-0000-4000-8000-000000000000",
    "cwd": "/work/project",
    "hook_event_name": "SessionStart",
    "source": "startup",
    "model": "claude-opus-5-5"
  },
  "UserPromptSubmit": {
    "session_id": "00000000-0000-4000-8000-000000000000",
    "cwd": "/work/project",
    "prompt_id": "00000000-0000-4000-8000-000000000000",
    "permission_mode": "auto",
    "hook_event_name": "UserPromptSubmit",
    "prompt": "Reply with only the word OK."
  },
  "Stop": {
    "session_id": "00000000-0000-4000-8000-000000000000",
    "cwd": "/work/project",
    "prompt_id": "00000000-0000-4000-8000-000000000000",
    "permission_mode": "auto",
    "effort": {
      "level": "medium"
    },
    "hook_event_name": "Stop",
    "stop_hook_active": false,
    "last_assistant_message": "OK",
    "background_tasks": [],
    "session_crons": []
  },
  // Claude Code 2.1.304 against a local 429 with the plan-limit headers (scripts/spikes/60-rate-limit-lab.mjs).
  "StopFailure_rate_limit": {
    "session_id": "00000000-0000-4000-8000-000000000000",
    "cwd": "/work/project",
    "prompt_id": "00000000-0000-4000-8000-000000000000",
    "effort": {
      "level": "xhigh"
    },
    "hook_event_name": "StopFailure",
    "error": "rate_limit",
    "last_assistant_message": "You've hit your session limit · resets 5:22pm (America/Bogota)"
  },
  "SessionEnd": {
    "session_id": "00000000-0000-4000-8000-000000000000",
    "cwd": "/work/project",
    "prompt_id": "00000000-0000-4000-8000-000000000000",
    "hook_event_name": "SessionEnd",
    "reason": "prompt_input_exit"
  },
  "PreToolUse_Bash": {
    "session_id": "00000000-0000-4000-8000-000000000000",
    "cwd": "/work/project",
    "prompt_id": "00000000-0000-4000-8000-000000000000",
    "permission_mode": "default",
    "effort": {
      "level": "medium"
    },
    "hook_event_name": "PreToolUse",
    "tool_name": "Bash",
    "tool_input": {
      "command": "echo hooks-lab-ran > /work/project/ran.txt",
      "description": "Write marker text to ran.txt"
    },
    "tool_use_id": "toolu_FIXTURE"
  },
  "PermissionRequest_Bash": {
    "session_id": "00000000-0000-4000-8000-000000000000",
    "cwd": "/work/project",
    "prompt_id": "00000000-0000-4000-8000-000000000000",
    "permission_mode": "default",
    "effort": {
      "level": "medium"
    },
    "hook_event_name": "PermissionRequest",
    "tool_name": "Bash",
    "tool_input": {
      "command": "echo hooks-lab-ran > /work/project/ran.txt",
      "description": "Write marker text to ran.txt"
    },
    "permission_suggestions": [
      {
        "type": "addDirectories",
        "directories": [
          "/work/project"
        ],
        "destination": "session"
      }
    ]
  },
  "PostToolUse_Bash": {
    "session_id": "00000000-0000-4000-8000-000000000000",
    "cwd": "/work/project",
    "prompt_id": "00000000-0000-4000-8000-000000000000",
    "permission_mode": "default",
    "effort": {
      "level": "medium"
    },
    "hook_event_name": "PostToolUse",
    "tool_name": "Bash",
    "tool_input": {
      "command": "echo hooks-lab-ran > /work/project/ran.txt",
      "description": "Write marker text to ran.txt"
    },
    "tool_response": {
      "stdout": "",
      "stderr": "",
      "interrupted": false,
      "isImage": false,
      "noOutputExpected": false
    },
    "tool_use_id": "toolu_FIXTURE",
    "duration_ms": 365
  },
  "Notification_permission": {
    "session_id": "00000000-0000-4000-8000-000000000000",
    "cwd": "/work/project",
    "prompt_id": "00000000-0000-4000-8000-000000000000",
    "hook_event_name": "Notification",
    "message": "Claude needs your permission",
    "notification_type": "permission_prompt"
  },
  "Notification_idle": {
    "session_id": "00000000-0000-4000-8000-000000000000",
    "cwd": "/work/project",
    "prompt_id": "00000000-0000-4000-8000-000000000000",
    "hook_event_name": "Notification",
    "message": "Claude is waiting for your input",
    "notification_type": "idle_prompt"
  },
  "PostToolUseFailure_Bash": {
    "session_id": "00000000-0000-4000-8000-000000000000",
    "cwd": "/work/project",
    "prompt_id": "00000000-0000-4000-8000-000000000000",
    "permission_mode": "default",
    "effort": {
      "level": "medium"
    },
    "hook_event_name": "PostToolUseFailure",
    "tool_name": "Bash",
    "tool_input": {
      "command": "ls /work/project/does-not-exist",
      "description": "List a nonexistent path"
    },
    "tool_use_id": "toolu_FIXTURE",
    "error": "Exit code 1\nls: /work/project/does-not-exist: No such file or directory",
    "is_interrupt": false,
    "duration_ms": 364
  },
  "PreToolUse_AskUserQuestion": {
    "session_id": "00000000-0000-4000-8000-000000000000",
    "cwd": "/work/project",
    "prompt_id": "00000000-0000-4000-8000-000000000000",
    "permission_mode": "default",
    "effort": {
      "level": "medium"
    },
    "hook_event_name": "PreToolUse",
    "tool_name": "AskUserQuestion",
    "tool_input": {
      "questions": [
        {
          "question": "Which option do you prefer?",
          "header": "Pick",
          "options": [
            {
              "label": "A",
              "description": "Option A"
            },
            {
              "label": "B",
              "description": "Option B"
            }
          ],
          "multiSelect": false
        }
      ]
    },
    "tool_use_id": "toolu_FIXTURE"
  },
  "PermissionRequest_AskUserQuestion": {
    "session_id": "00000000-0000-4000-8000-000000000000",
    "cwd": "/work/project",
    "prompt_id": "00000000-0000-4000-8000-000000000000",
    "permission_mode": "default",
    "effort": {
      "level": "medium"
    },
    "hook_event_name": "PermissionRequest",
    "tool_name": "AskUserQuestion",
    "tool_input": {
      "questions": [
        {
          "question": "Which option do you prefer?",
          "header": "Pick",
          "options": [
            {
              "label": "A",
              "description": "Option A"
            },
            {
              "label": "B",
              "description": "Option B"
            }
          ],
          "multiSelect": false
        }
      ]
    }
  },
  "PostToolUse_AskUserQuestion": {
    "session_id": "00000000-0000-4000-8000-000000000000",
    "cwd": "/work/project",
    "prompt_id": "00000000-0000-4000-8000-000000000000",
    "permission_mode": "default",
    "effort": {
      "level": "medium"
    },
    "hook_event_name": "PostToolUse",
    "tool_name": "AskUserQuestion",
    "tool_input": {
      "questions": [
        {
          "question": "Which option do you prefer?",
          "header": "Pick",
          "options": [
            {
              "label": "A",
              "description": "Option A"
            },
            {
              "label": "B",
              "description": "Option B"
            }
          ],
          "multiSelect": false
        }
      ],
      "answers": {
        "Which option do you prefer?": "A"
      },
      "annotations": {}
    },
    "tool_response": {
      "questions": [
        {
          "question": "Which option do you prefer?",
          "header": "Pick",
          "options": [
            {
              "label": "A",
              "description": "Option A"
            },
            {
              "label": "B",
              "description": "Option B"
            }
          ],
          "multiSelect": false
        }
      ],
      "answers": {
        "Which option do you prefer?": "A"
      },
      "annotations": {}
    },
    "tool_use_id": "toolu_FIXTURE",
    "duration_ms": 2
  }
} as const

/**
 * An agent-teams run (Claude Code 2.1.325, `30-hooks-lab.mjs team`, Haiku; PRD §6.20): the lead starts `reviewer` and
 * `coder`, who pass a review back and forth twice. `[ms since launch, event, payload]`, only the fields teams.ts reads;
 * a teammate's `agent_type` is its name. Session ids and paths dropped.
 */
export const claudeTeamRun: ReadonlyArray<readonly [number, string, Record<string, unknown>]> = [
  [1273, "SessionStart", {}],
  [9791, "UserPromptSubmit", {}],
  [22323, "PreToolUse", {"tool_name": "Agent", "tool_input": {"name": "reviewer"}}],
  [23239, "PreToolUse", {"tool_name": "Agent", "tool_input": {"name": "coder"}}],
  [23534, "SubagentStart", {"agent_id": "areviewer-d82305fe5f853f50", "agent_type": "reviewer"}],
  [23535, "PostToolUse", {"tool_name": "Agent", "tool_input": {"name": "reviewer"}, "tool_response": {"status": "teammate_spawned", "agent_id": "areviewer-d82305fe5f853f50", "name": "reviewer", "model": "haiku", "resolvedModel": "claude-haiku-5-5"}}],
  [23560, "PostToolUse", {"tool_name": "Agent", "tool_input": {"name": "coder"}, "tool_response": {"status": "teammate_spawned", "agent_id": "acoder-3cf0f06b7183081b", "name": "coder", "model": "haiku", "resolvedModel": "claude-haiku-5-5"}}],
  [23561, "SubagentStart", {"agent_id": "acoder-3cf0f06b7183081b", "agent_type": "coder"}],
  [26610, "PreToolUse", {"agent_id": "acoder-3cf0f06b7183081b", "agent_type": "coder", "tool_name": "SendMessage", "tool_input": {"to": "reviewer", "message": "v1 ready", "summary": "Notify reviewer v1 is ready"}}],
  [26642, "PostToolUse", {"agent_id": "acoder-3cf0f06b7183081b", "agent_type": "coder", "tool_name": "SendMessage", "tool_input": {"to": "reviewer", "message": "v1 ready", "summary": "Notify reviewer v1 is ready"}}],
  [27684, "SubagentStop", {"agent_id": "areviewer-d82305fe5f853f50", "agent_type": "reviewer"}],
  [27710, "TeammateIdle", {"agent_id": "areviewer-d82305fe5f853f50", "agent_type": "reviewer", "teammate_name": "reviewer"}],
  [27774, "SubagentStart", {"agent_id": "areviewer-d82305fe5f853f50", "agent_type": "reviewer"}],
  [28471, "SubagentStop", {"agent_id": "acoder-3cf0f06b7183081b", "agent_type": "coder"}],
  [28513, "TeammateIdle", {"agent_id": "acoder-3cf0f06b7183081b", "agent_type": "coder", "teammate_name": "coder"}],
  [28521, "Stop", {}],
  [31705, "Stop", {}],
  [31716, "PreToolUse", {"agent_id": "areviewer-d82305fe5f853f50", "agent_type": "reviewer", "tool_name": "SendMessage", "tool_input": {"to": "coder", "message": "needs fix", "summary": "Reply to v1 ready with needs fix"}}],
  [31774, "PostToolUse", {"agent_id": "areviewer-d82305fe5f853f50", "agent_type": "reviewer", "tool_name": "SendMessage", "tool_input": {"to": "coder", "message": "needs fix", "summary": "Reply to v1 ready with needs fix"}}],
  [32064, "SubagentStart", {"agent_id": "acoder-3cf0f06b7183081b", "agent_type": "coder"}],
  [34739, "Stop", {}],
  [34759, "SubagentStop", {"agent_id": "areviewer-d82305fe5f853f50", "agent_type": "reviewer"}],
  [34783, "TeammateIdle", {"agent_id": "areviewer-d82305fe5f853f50", "agent_type": "reviewer", "teammate_name": "reviewer"}],
  [37316, "Stop", {}],
  [39599, "PreToolUse", {"agent_id": "acoder-3cf0f06b7183081b", "agent_type": "coder", "tool_name": "SendMessage", "tool_input": {"to": "reviewer", "message": "v2 ready", "summary": "Notify reviewer v2 is ready"}}],
  [39626, "PostToolUse", {"agent_id": "acoder-3cf0f06b7183081b", "agent_type": "coder", "tool_name": "SendMessage", "tool_input": {"to": "reviewer", "message": "v2 ready", "summary": "Notify reviewer v2 is ready"}}],
  [39838, "SubagentStart", {"agent_id": "areviewer-d82305fe5f853f50", "agent_type": "reviewer"}],
  [41108, "SubagentStop", {"agent_id": "acoder-3cf0f06b7183081b", "agent_type": "coder"}],
  [41132, "TeammateIdle", {"agent_id": "acoder-3cf0f06b7183081b", "agent_type": "coder", "teammate_name": "coder"}],
  [42102, "PreToolUse", {"agent_id": "areviewer-d82305fe5f853f50", "agent_type": "reviewer", "tool_name": "SendMessage", "tool_input": {"to": "coder", "message": "approved", "summary": "Approve v2 ready"}}],
  [42126, "PostToolUse", {"agent_id": "areviewer-d82305fe5f853f50", "agent_type": "reviewer", "tool_name": "SendMessage", "tool_input": {"to": "coder", "message": "approved", "summary": "Approve v2 ready"}}],
  [42166, "SubagentStart", {"agent_id": "acoder-3cf0f06b7183081b", "agent_type": "coder"}],
  [43077, "Stop", {}],
  [43146, "SubagentStop", {"agent_id": "areviewer-d82305fe5f853f50", "agent_type": "reviewer"}],
  [43170, "TeammateIdle", {"agent_id": "areviewer-d82305fe5f853f50", "agent_type": "reviewer", "teammate_name": "reviewer"}],
  [45328, "Stop", {}],
  [47211, "SubagentStop", {"agent_id": "acoder-3cf0f06b7183081b", "agent_type": "coder"}],
  [47233, "TeammateIdle", {"agent_id": "acoder-3cf0f06b7183081b", "agent_type": "coder", "teammate_name": "coder"}],
  [49763, "Stop", {}],
  [163816, "SessionEnd", {}]
]
