export type Command = (...args: string[]) => Promise<any>
export type CommandOrSubcommands = { [subcommand: string]: CommandOrSubcommands } | Command

export function Cli(
  out: (...strings: string[]) => any,
  commands: CommandOrSubcommands
) {
  function showAvailableCommands(command: CommandOrSubcommands) {
    out("\nAvailable commands:\n")
    Object.keys(command).forEach(key => out(key))
    out("")
  }

  function showUsage(command: Command) {
    out("Usage:", command.toString().substr(0, command.toString().indexOf(")") + 1))
  }

  function help(args: string[]) {
    return args[0] === "help" || args[0] === "--help" || args[0] === "-h";
  }

  async function execute(commandOrSubcommand: CommandOrSubcommands, args: string[]): Promise<any> {

    async function handleSubcommand(command: CommandOrSubcommands) {
      if (!args[0] || help(args)) {
        showAvailableCommands(command)
      } else if (!command[args[0]]) {
        out("Unknown command:", args[0])
        showAvailableCommands(command)
      } else {
        await execute(command[args[0]], args.splice(1))
      }
    }

    async function handleCommand(command: Command) {
      if (help(args)) {
        showUsage(command);
      } else {
        await command.apply({}, args)
      }
    }

    await (typeof commandOrSubcommand === "function"
      ? handleCommand(commandOrSubcommand)
      : handleSubcommand(commandOrSubcommand)
    )

  }

  return async (args: string[]) => {
    await execute(commands, args)
  }
}
