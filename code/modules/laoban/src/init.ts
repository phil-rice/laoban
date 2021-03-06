import {ConfigAndIssues} from "./config";
import * as fs from "fs";
import path from "path";
import {output} from "./utils";

export function init(configAndIssues: ConfigAndIssues, dir: string, force: undefined | boolean) {
    let file = path.join(dir, 'laoban.json');
    if (!force && configAndIssues.config) return output(configAndIssues)(`This project already has a laoban.json in ${configAndIssues.config.laobanDirectory}. Use --force if you need to create one here`)
    fs.writeFileSync(file, Buffer.from(defaultLaobanJson))
}

export let defaultLaobanJson = `{
  "templateDir"   : "\${laobanDirectory}/template",
  "versionFile"   : "\${templateDir}/version.txt",
  "log"           : ".log",
  "status"        : ".status",
  "profile"       : ".profile",
  "packageManager": "yarn",
  "scripts"       : {
    "log"        : {
      "description": "displays the tail of  log file. Best used with -s option", "commands": ["tail -5 $\{log} "]
    },
    "ls"         : {"description": "lists all the projects", "commands": ["js:process.cwd()"], "osGuard": "Linux"},
    "lsDist"     : {
      "description": "check that the directory option works", "commands": [
        {"command": "js:process.cwd()", "directory": "dist"},
        {"command": "pwd", "directory": "dist"}
      ]
    },
    "envCheck"   : {
      "description": "checks evn",
      "commands"   : ["echo Linux: [\${PORT}] windows: [%PORT%]"],
      "guard"      : "\${projectDetails.details.port}",
      "env"        : {"PORT": "\${projectDetails.details.port}"}
    },
    "tsc"        : {
      "description": "runs tsc",
      "commands"   : [{"name": "tsc", "command": "tsc --noEmit false --outDir dist", "status": true}]
    },
    "test"       : {
      "description": "runs \${packageManager} test",
      "commands"   : [{"name": "test", "command": "\${packageManager} test", "status": true}]
    },
    "slow"       : {
      "description": "prints something, delays 2s, prints something",
      "commands"   : ["echo \`pwd\` 'start'", "sleep 2s", "echo \`pwd\` 'stop' "]
    },
    "ls-ports": {
      "description": "lists the projects that have a port defined in project.details.json",
      "guard"      : "\${projectDetails.details.port}",
      "commands"   : ["js:process.cwd()"]
    },
    "start"      : {
      "description": "\${packageManager} start for all projects that have a port defined in project.details.json",
      "guard"      : "\${projectDetails.details.port}",
      "commands"   : ["\${packageManager} start"],
      "env"        : {"PORT": "\${projectDetails.details.port}"}
    },
    "ls-publish" : {
      "description": "lists the projects that can be published",
      "guard"      : "\${projectDetails.details.publish}",
      "commands"   : ["js:process.cwd()"], "inLinksOrder": true
    },
    "pack"       : {
      "description" : "does everything for a publish except the actual 'npm publish'",
      "guard"       : "\${projectDetails.details.publish}",
      "comment": "why the --noEmit --outDir? Answer: using react_scripts we have to turn these off",
      "commands"    : [
        {"name": "tsc", "command": "tsc --noEmit false --outDir dist", "status": true},
        {"name": "pack", "command": "\${packageManager} pack", "status": true}
      ],
      "inLinksOrder": true
    },
    "publish"    : {
      "description" : "publishes the projects to npmjs",
      "guard"       : "\${projectDetails.details.publish}",
      "commands"    : [
        {"name": "tsc", "command": "tsc --noEmit false --outDir dist", "status": true},
        {"name": "pack", "command": "\${packageManager} publish --access public", "status": true}
      ],
      "inLinksOrder": true
    }
  }
}
`