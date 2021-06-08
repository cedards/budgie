import {Commands} from "./cli";
import {FsEventStream} from "@budgie/fs-plugin";
import * as path from "path";
import * as os from "os";
import {EVENT_MIGRATIONS} from "@budgie/planning";

(async function() {
  const eventStream = await FsEventStream(
    path.join(os.homedir(), ".budgie", "event-stream.ndjson"),
    EVENT_MIGRATIONS,
  )
  let args = process.argv.splice(2)
  let command = Commands(eventStream, console.log)

  function showHelp() {
    console.log("\nAvailable commands:\n")
    Object.keys(command).forEach(key => console.log(key))
    console.log("")
  }

  function pleaseHelp() {
    return args[0] === "help" || args[0] === "--help" || args[0] === "-h";
  }

  while(typeof command !== "function") {
    if(!args[0] || pleaseHelp()) {
      showHelp()
      return
    }

    if(!command[args[0]]) {
      console.log("Unknown command:", args[0])
      showHelp()
      return
    }

    command = command[args[0]]
    args = args.splice(1)
  }

  if(pleaseHelp()) {
    console.log("Usage:", (command as Function).toString().substr(0, (command as Function).toString().indexOf(")")+1))
  } else {
    (command as Function).apply({}, args)
  }
})()
