// usage.mjs — argparse-formatted usage/help text of the action-log CLI, generated from the python original
// (`prog` = action-log.mjs, COLUMNS unset). Only printed for -h and for usage errors.
export const USAGE = {
  "": {
    usage: "usage: action-log.mjs [-h] {platform,local,render,backfill} ...\n",
    help: "usage: action-log.mjs [-h] {platform,local,render,backfill} ...\n\npositional arguments:\n  {platform,local,render,backfill}\n\noptions:\n  -h, --help            show this help message and exit\n",
  },
  "platform": {
    usage: "usage: action-log.mjs platform [-h] --task-dir TASK_DIR --conv-dir CONV_DIR\n                               [--force] [--agent AGENT]\n",
    help: "usage: action-log.mjs platform [-h] --task-dir TASK_DIR --conv-dir CONV_DIR\n                               [--force] [--agent AGENT]\n\noptions:\n  -h, --help           show this help message and exit\n  --task-dir TASK_DIR\n  --conv-dir CONV_DIR\n  --force\n  --agent AGENT\n",
  },
  "local": {
    usage: "usage: action-log.mjs local [-h] --transcript TRANSCRIPT\n                            --session-id SESSION_ID --conv-dir CONV_DIR\n                            [--project-dir PROJECT_DIR] [--final]\n",
    help: "usage: action-log.mjs local [-h] --transcript TRANSCRIPT\n                            --session-id SESSION_ID --conv-dir CONV_DIR\n                            [--project-dir PROJECT_DIR] [--final]\n\noptions:\n  -h, --help            show this help message and exit\n  --transcript TRANSCRIPT\n  --session-id SESSION_ID\n  --conv-dir CONV_DIR\n  --project-dir PROJECT_DIR\n  --final\n",
  },
  "render": {
    usage: "usage: action-log.mjs render [-h] --conv-dir CONV_DIR\n",
    help: "usage: action-log.mjs render [-h] --conv-dir CONV_DIR\n\noptions:\n  -h, --help           show this help message and exit\n  --conv-dir CONV_DIR\n",
  },
  "backfill": {
    usage: "usage: action-log.mjs backfill [-h] root\n",
    help: "usage: action-log.mjs backfill [-h] root\n\npositional arguments:\n  root\n\noptions:\n  -h, --help  show this help message and exit\n",
  },
};
